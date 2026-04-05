import { prisma } from "../../db/prisma";
import { HttpError } from "../../utils/http";
import type { ViewerContext } from "./helpers";
import { makeInviteToken, toPrismaNullableJson } from "./helpers";
import { maybeAwardRunAchievements } from "./achievements";
import { cancelProgramRun, generateRunFromVersion, hydrateRunActionsFromLinkedTasks, recomputeRunStats, syncRunLifecycleTasks } from "./runtime";
import { assertUserHasNoProgramConflict, describeParticipationConflict, getProgramParticipationState } from "./participation";

type SessionInput = {
  title?: string | null;
  participantUsernames?: string[];
  joinMode?: "INVITE_ONLY" | "LINK" | "OPEN";
  startMode?: "NOW" | "SCHEDULED" | "HOST_MANUAL" | "AUTO_ON_ACCEPT";
  scheduledStartAt?: string | null;
  shareStatus?: boolean;
  shareNumbers?: boolean;
  shareMisses?: boolean;
  shareMilestones?: boolean;
  metricsVisibleJson?: Record<string, unknown> | null;
};

function serializeSessionMemberRun(run: any) {
  if (!run) return null;
  const todayDay =
    run.days?.find((day: any) => ["ACTIVE", "RECOVERY"].includes(day.status)) ??
    run.days?.find((day: any) => day.status === "UPCOMING") ??
    null;
  const completedToday = (todayDay?.actions ?? [])
    .filter((action: any) => action.status === "COMPLETED")
    .slice(0, 3)
    .map((action: any) => ({
      id: action.id,
      title: action.title,
      status: action.status,
    }));

  return {
    id: run.id,
    status: run.status,
    completionPercent: run.completionPercent,
    adherenceScore: run.adherenceScore,
    consistencyScore: run.consistencyScore,
    streakCount: run.streakCount,
    missedDaysCount: run.missedDaysCount,
    today: todayDay
      ? {
          dayNumber: todayDay.programDayNumber ?? todayDay.sequenceNumber,
          stageTitle: todayDay.stage?.title ?? run.currentStage?.title ?? null,
          totalTodayCount: todayDay.actions?.length ?? 0,
          completedTodayCount: todayDay.actions?.filter((action: any) => action.status === "COMPLETED").length ?? 0,
          requiredPendingCount:
            todayDay.actions?.filter((action: any) => action.required && !["COMPLETED", "SKIPPED"].includes(action.status)).length ?? 0,
          completedToday,
        }
      : null,
  };
}

async function resolveSessionParticipants(
  hostId: string,
  usernames: string[],
  definition: {
    accessMode: "PRIVATE" | "RESTRICTED" | "PUBLIC";
    ownerId: string;
    accessGrants: Array<{ userId: string }>;
  },
) {
  const cleaned = Array.from(new Set(usernames.map((username) => username.trim()).filter(Boolean)));
  if (!cleaned.length) return [];
  const users = await prisma.user.findMany({
    where: { username: { in: cleaned } },
    select: { id: true, username: true, avatarUrl: true },
  });
  const found = new Set(users.map((user) => user.username));
  const missing = cleaned.filter((username) => !found.has(username));
  if (missing.length) throw new HttpError(400, `Users not found: ${missing.join(", ")}`);
  const participants = users.filter((user) => user.id !== hostId);

  if (definition.accessMode === "PRIVATE" && participants.length) {
    throw new HttpError(400, "Приватную программу нельзя запускать в совместной сессии");
  }

  if (!participants.length) return participants;

  if (definition.accessMode === "RESTRICTED") {
    const allowedIds = new Set([definition.ownerId, ...definition.accessGrants.map((grant) => grant.userId)]);
    const blocked = participants.filter((user) => !allowedIds.has(user.id));
    if (blocked.length) {
      throw new HttpError(400, `Эти пользователи не приглашены в программу: ${blocked.map((user) => `@${user.username}`).join(", ")}`);
    }
    return participants;
  }

  const participantIds = participants.map((user) => user.id);
  const [following, followers] = await Promise.all([
    prisma.friendship.findMany({
      where: {
        senderId: hostId,
        receiverId: { in: participantIds },
        status: "ACCEPTED",
      },
      select: { receiverId: true },
    }),
    prisma.friendship.findMany({
      where: {
        senderId: { in: participantIds },
        receiverId: hostId,
        status: "ACCEPTED",
      },
      select: { senderId: true },
    }),
  ]);

  const allowedIds = new Set(
    following
      .map((item) => item.receiverId)
      .filter((id) => followers.some((follower) => follower.senderId === id)),
  );
  const blocked = participants.filter((user) => !allowedIds.has(user.id));
  if (blocked.length) {
    throw new HttpError(400, `В публичную совместную сессию можно приглашать только взаимных подписчиков: ${blocked.map((user) => `@${user.username}`).join(", ")}`);
  }

  return participants;
}

async function maybeCreateMemberRun(sessionId: string, userId: string) {
  const session = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: {
      members: true,
      programVersion: true,
    },
  });
  if (!session) throw new HttpError(404, "Session not found");

  const member = session.members.find((item) => item.userId === userId);
  if (!member || member.status !== "ACCEPTED") return null;
  if (member.programRunId) return prisma.programRun.findUnique({ where: { id: member.programRunId } });

  return prisma.$transaction(async (tx) => {
    const run = await generateRunFromVersion(tx, {
      userId,
      programDefinitionId: session.programDefinitionId,
      programVersionId: session.programVersionId,
      sessionId: session.id,
      startDate: session.startedAt ?? new Date(),
    });

    if (!run) return null;

    await syncRunLifecycleTasks(tx, run.id);

    await tx.programSessionMember.update({
      where: { id: member.id },
      data: {
        programRunId: run.id,
        joinedAt: member.joinedAt ?? new Date(),
      },
    });

    await tx.programRunEvent.create({
      data: {
        programRunId: run.id,
        userId,
        eventType: "SESSION_JOINED",
      },
    });

    const recomputed = await recomputeRunStats(tx, run.id);
    await maybeAwardRunAchievements(tx, {
      runId: recomputed.id,
      userId,
      completionPercent: recomputed.completionPercent,
      adherenceScore: recomputed.adherenceScore,
      streakCount: recomputed.streakCount,
      collaborative: true,
      sessionId: session.id,
      programTitle: session.programVersion.title,
    });

    return recomputed;
  });
}

export async function createProgramSession(programId: string, viewer: ViewerContext, input: SessionInput) {
  const definition = await prisma.programDefinition.findUnique({
    where: { id: programId },
    include: {
      currentVersion: true,
      accessGrants: {
        select: { userId: true },
      },
    },
  });
  if (!definition || definition.deletedAt) throw new HttpError(404, "Program not found");
  if (!definition.currentVersionId || !definition.currentVersion) throw new HttpError(400, "Program must be published first");
  const canUseProgram =
    viewer.role === "ADMIN" ||
    definition.ownerId === viewer.id ||
    definition.accessMode === "PUBLIC" ||
    (definition.accessMode === "RESTRICTED" && definition.accessGrants.some((grant) => grant.userId === viewer.id));
  if (!canUseProgram) {
    throw new HttpError(403, "Forbidden");
  }
  if (!definition.collaborativeEnabled) throw new HttpError(400, "Для этой программы совместный режим выключен");
  if (definition.accessMode === "PRIVATE") throw new HttpError(400, "Приватную программу нельзя запускать вместе");

  await assertUserHasNoProgramConflict(viewer.id, definition.id);

  const programVersionId = definition.currentVersionId!;
  const participants = await resolveSessionParticipants(viewer.id, input.participantUsernames ?? [], {
    accessMode: definition.accessMode,
    ownerId: definition.ownerId ?? viewer.id,
    accessGrants: definition.accessGrants,
  });
  const scheduledStartAt = input.scheduledStartAt ? new Date(input.scheduledStartAt) : null;
  if (scheduledStartAt && Number.isNaN(scheduledStartAt.getTime())) {
    throw new HttpError(400, "Invalid scheduled start date");
  }
  const startsNow = (input.startMode ?? "HOST_MANUAL") === "NOW";
  const joinMode = definition.accessMode === "PUBLIC" ? "LINK" : (input.joinMode ?? "INVITE_ONLY");

  const session = await prisma.$transaction(async (tx) => {
    const created = await tx.programSession.create({
      data: {
        programDefinitionId: definition.id,
        programVersionId,
        hostId: viewer.id,
        title: input.title ?? `${definition.currentVersion!.title} вместе`,
        status: startsNow ? "ACTIVE" : scheduledStartAt ? "SCHEDULED" : "DRAFT",
        joinMode: joinMode as any,
        startMode: (input.startMode ?? "HOST_MANUAL") as any,
        scheduledStartAt,
        startedAt: startsNow ? new Date() : null,
        shareStatus: input.shareStatus ?? true,
        shareNumbers: input.shareNumbers ?? false,
        shareMisses: input.shareMisses ?? false,
        shareMilestones: input.shareMilestones ?? true,
        metricsVisibleJson: toPrismaNullableJson(input.metricsVisibleJson ?? null),
        inviteLinkToken: ["LINK", "OPEN"].includes(joinMode) ? makeInviteToken() : undefined,
      },
    });

    await tx.programSessionMember.create({
      data: {
        programSessionId: created.id,
        userId: viewer.id,
        role: "HOST",
        status: "ACCEPTED",
        shareStatus: input.shareStatus ?? true,
        shareNumbers: input.shareNumbers ?? false,
        shareMisses: input.shareMisses ?? false,
        shareMilestones: input.shareMilestones ?? true,
        invitedAt: new Date(),
        joinedAt: startsNow ? new Date() : null,
        respondedAt: new Date(),
      },
    });

    for (const participant of participants) {
      await tx.programSessionMember.create({
        data: {
          programSessionId: created.id,
          userId: participant.id,
          role: "MEMBER",
          status: "PENDING",
          shareStatus: input.shareStatus ?? true,
          shareNumbers: input.shareNumbers ?? false,
          shareMisses: input.shareMisses ?? false,
          shareMilestones: input.shareMilestones ?? true,
        },
      });

      await tx.programSessionInvite.create({
        data: {
          programSessionId: created.id,
          senderId: viewer.id,
          recipientId: participant.id,
          recipientUsername: participant.username,
          inviteToken: makeInviteToken(),
          status: "PENDING",
          channel: "direct",
        },
      });
    }

    return created;
  });

  if (startsNow) {
    await maybeCreateMemberRun(session.id, viewer.id);
  }

  return getProgramSessionDetail(session.id, viewer);
}

export async function startProgramSession(sessionId: string, viewer: ViewerContext) {
  const session = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!session) throw new HttpError(404, "Session not found");
  if (viewer.role !== "ADMIN" && session.hostId !== viewer.id) throw new HttpError(403, "Forbidden");

  const blockedMembers: string[] = [];
  for (const member of session.members.filter((item) => item.status === "ACCEPTED")) {
    const participation = await getProgramParticipationState(member.userId, session.programDefinitionId, { excludeSessionId: session.id });
    const conflict = describeParticipationConflict(participation);
    if (conflict) {
      blockedMembers.push(member.user?.username ? `@${member.user.username}` : member.userId);
    }
  }
  if (blockedMembers.length) {
    throw new HttpError(400, `Нельзя начать сессию: у этих участников уже есть активное прохождение программы: ${blockedMembers.join(", ")}`);
  }

  await prisma.programSession.update({
    where: { id: sessionId },
    data: {
      status: "ACTIVE",
      startedAt: session.startedAt ?? new Date(),
    },
  });

  for (const member of session.members.filter((item) => item.status === "ACCEPTED")) {
    await maybeCreateMemberRun(session.id, member.userId);
  }

  return getProgramSessionDetail(sessionId, viewer);
}

export async function acceptProgramInvite(inviteId: string, viewer: ViewerContext) {
  const invite = await prisma.programSessionInvite.findUnique({
    where: { id: inviteId },
    include: { session: true },
  });
  if (!invite) throw new HttpError(404, "Invite not found");
  if (viewer.role !== "ADMIN" && invite.recipientId !== viewer.id) throw new HttpError(403, "Forbidden");
  await assertUserHasNoProgramConflict(viewer.id, invite.session.programDefinitionId, { excludeSessionId: invite.programSessionId });

  await prisma.$transaction(async (tx) => {
    await tx.programSessionInvite.update({
      where: { id: inviteId },
      data: {
        status: "ACCEPTED",
        respondedAt: new Date(),
      },
    });

    await tx.programSessionMember.updateMany({
      where: {
        programSessionId: invite.programSessionId,
        userId: invite.recipientId ?? viewer.id,
      },
      data: {
        status: "ACCEPTED",
        respondedAt: new Date(),
        joinedAt: invite.session.status === "ACTIVE" ? new Date() : null,
      },
    });
  });

  if (invite.session.status === "ACTIVE" || invite.session.startMode === "AUTO_ON_ACCEPT") {
    await maybeCreateMemberRun(invite.programSessionId, invite.recipientId ?? viewer.id);
  }

  return getProgramSessionDetail(invite.programSessionId, viewer);
}

export async function listIncomingProgramInvites(viewer: ViewerContext) {
  const invites = await prisma.programSessionInvite.findMany({
    where: {
      recipientId: viewer.id,
      status: "PENDING",
      session: {
        archivedAt: null,
        cancelledAt: null,
        status: { notIn: ["CANCELLED", "ARCHIVED", "COMPLETED"] },
      },
    },
    orderBy: { createdAt: "desc" },
    include: {
      sender: { select: { id: true, username: true, avatarUrl: true } },
      session: {
        include: {
          host: { select: { id: true, username: true, avatarUrl: true } },
          programVersion: true,
          members: {
            select: {
              id: true,
              userId: true,
              status: true,
              role: true,
            },
          },
          runs: {
            select: {
              id: true,
              status: true,
            },
          },
        },
      },
    },
  });

  const items = [] as Array<Record<string, unknown>>;
  for (const invite of invites) {
    const membership = invite.session.members.find((member) => member.userId === viewer.id) ?? null;
    const participation = await getProgramParticipationState(viewer.id, invite.session.programDefinitionId, { excludeSessionId: invite.programSessionId });
    const conflict = describeParticipationConflict(participation);

    items.push({
      id: invite.id,
      createdAt: invite.createdAt,
      recipientId: invite.recipientId,
      recipientUsername: invite.recipientUsername,
      sender: invite.sender,
      canAccept: !conflict,
      blockedReason: conflict?.message ?? null,
      membershipStatus: membership?.status ?? null,
      session: {
        id: invite.session.id,
        title: invite.session.title ?? invite.session.programVersion.title,
        status: invite.session.status,
        joinMode: invite.session.joinMode,
        startMode: invite.session.startMode,
        scheduledStartAt: invite.session.scheduledStartAt,
        startedAt: invite.session.startedAt,
        host: invite.session.host,
        summary: {
          participants: invite.session.members.length,
          accepted: invite.session.members.filter((member) => member.status === "ACCEPTED").length,
          pending: invite.session.members.filter((member) => member.status === "PENDING").length,
          activeRuns: invite.session.runs.filter((run) => ["ACTIVE", "PAUSED"].includes(run.status)).length,
        },
        program: {
          id: invite.session.programDefinitionId,
          title: invite.session.programVersion.title,
          description: invite.session.programVersion.description,
          category: invite.session.programVersion.category,
          theme: invite.session.programVersion.theme,
          coverUrl: invite.session.programVersion.coverUrl,
        },
      },
    });
  }

  return items;
}

export async function getProgramSessionInvitePreviewByToken(token: string, viewer?: ViewerContext | null) {
  const session = await prisma.programSession.findUnique({
    where: { inviteLinkToken: token },
    include: {
      host: { select: { id: true, username: true, avatarUrl: true } },
      programVersion: true,
      members: {
        select: {
          userId: true,
          status: true,
        },
      },
      runs: {
        select: {
          id: true,
          status: true,
        },
      },
    },
  });

  if (!session || session.archivedAt) throw new HttpError(404, "Invite not found");

  const membership = viewer ? session.members.find((member) => member.userId === viewer.id) : null;
  const participation = viewer ? await getProgramParticipationState(viewer.id, session.programDefinitionId, { excludeSessionId: session.id }) : null;
  const conflict = participation ? describeParticipationConflict(participation) : null;
  const canJoinBase =
    !session.cancelledAt &&
    session.status !== "CANCELLED" &&
    session.status !== "ARCHIVED" &&
    session.status !== "COMPLETED";

  return {
    token,
    sessionId: session.id,
    title: session.title ?? session.programVersion.title,
    status: session.status,
    joinMode: session.joinMode,
    startMode: session.startMode,
    scheduledStartAt: session.scheduledStartAt,
    startedAt: session.startedAt,
    host: session.host,
    program: {
      id: session.programDefinitionId,
      title: session.programVersion.title,
      description: session.programVersion.description,
      category: session.programVersion.category,
      theme: session.programVersion.theme,
      coverUrl: session.programVersion.coverUrl,
    },
    summary: {
      participants: session.members.length,
      activeRuns: session.runs.filter((run) => ["ACTIVE", "PAUSED"].includes(run.status)).length,
    },
    membershipStatus: membership?.status ?? null,
    canJoin: canJoinBase && !conflict,
    joinBlockedReason: conflict?.message ?? null,
  };
}

export async function acceptProgramInviteByToken(token: string, viewer: ViewerContext) {
  const session = await prisma.programSession.findUnique({
    where: { inviteLinkToken: token },
    include: {
      members: true,
      host: { select: { id: true, username: true, avatarUrl: true } },
      programVersion: true,
    },
  });
  if (!session || session.archivedAt) throw new HttpError(404, "Invite not found");
  if (session.cancelledAt || ["CANCELLED", "ARCHIVED", "COMPLETED"].includes(session.status)) {
    throw new HttpError(400, "Session is not accepting new members");
  }
  await assertUserHasNoProgramConflict(viewer.id, session.programDefinitionId, { excludeSessionId: session.id });

  const existingMember = session.members.find((member) => member.userId === viewer.id);

  await prisma.$transaction(async (tx) => {
    if (existingMember) {
      await tx.programSessionMember.update({
        where: { id: existingMember.id },
        data: {
          status: "ACCEPTED",
          respondedAt: new Date(),
          joinedAt: session.status === "ACTIVE" ? existingMember.joinedAt ?? new Date() : existingMember.joinedAt,
        },
      });
    } else {
      await tx.programSessionMember.create({
        data: {
          programSessionId: session.id,
          userId: viewer.id,
          role: "MEMBER",
          status: "ACCEPTED",
          shareStatus: session.shareStatus,
          shareNumbers: session.shareNumbers,
          shareMisses: session.shareMisses,
          shareMilestones: session.shareMilestones,
          invitedAt: new Date(),
          joinedAt: session.status === "ACTIVE" ? new Date() : null,
          respondedAt: new Date(),
        },
      });
    }

    const existingInvite = await tx.programSessionInvite.findFirst({
      where: {
        programSessionId: session.id,
        recipientId: viewer.id,
      },
      orderBy: { createdAt: "desc" },
    });

    if (existingInvite) {
      await tx.programSessionInvite.update({
        where: { id: existingInvite.id },
        data: {
          status: "ACCEPTED",
          respondedAt: new Date(),
          channel: existingInvite.channel ?? "link",
        },
      });
    } else {
      await tx.programSessionInvite.create({
        data: {
          programSessionId: session.id,
          senderId: session.hostId,
          recipientId: viewer.id,
          inviteToken: makeInviteToken(),
          status: "ACCEPTED",
          channel: "link",
          respondedAt: new Date(),
        },
      });
    }
  });

  if (session.status === "ACTIVE" || session.startMode === "AUTO_ON_ACCEPT") {
    await maybeCreateMemberRun(session.id, viewer.id);
  }

  return getProgramSessionDetail(session.id, viewer);
}

export async function declineProgramInvite(inviteId: string, viewer: ViewerContext) {
  const invite = await prisma.programSessionInvite.findUnique({
    where: { id: inviteId },
  });
  if (!invite) throw new HttpError(404, "Invite not found");
  if (viewer.role !== "ADMIN" && invite.recipientId !== viewer.id) throw new HttpError(403, "Forbidden");

  await prisma.$transaction(async (tx) => {
    await tx.programSessionInvite.update({
      where: { id: inviteId },
      data: {
        status: "DECLINED",
        respondedAt: new Date(),
      },
    });

    await tx.programSessionMember.updateMany({
      where: {
        programSessionId: invite.programSessionId,
        userId: invite.recipientId ?? viewer.id,
      },
      data: {
        status: "DECLINED",
        respondedAt: new Date(),
      },
    });
  });

  return getProgramSessionDetail(invite.programSessionId, viewer);
}

export async function leaveProgramSession(sessionId: string, viewer: ViewerContext) {
  const session = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: {
      members: {
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
        },
      },
    },
  });
  if (!session || session.archivedAt) throw new HttpError(404, "Session not found");

  const member = session.members.find((item) => item.userId === viewer.id);
  if (!member) throw new HttpError(403, "Forbidden");

  if (member.role === "HOST") {
    const hasOtherParticipants = session.members.some((item) => item.userId !== viewer.id && ["PENDING", "ACCEPTED"].includes(item.status));
    if (hasOtherParticipants) {
      throw new HttpError(400, "Владелец не может выйти из сессии, пока в ней есть другие участники");
    }
  }

  await prisma.$transaction(async (tx) => {
    await tx.programSessionMember.update({
      where: { id: member.id },
      data: {
        status: "LEFT",
        leftAt: new Date(),
        respondedAt: new Date(),
      },
    });

    if (member.programRunId) {
      await cancelProgramRun(tx, member.programRunId, viewer.id, "LEFT_SESSION");
    }

    if (member.role === "HOST") {
      await tx.programSession.update({
        where: { id: session.id },
        data: {
          status: "CANCELLED",
          cancelledAt: session.cancelledAt ?? new Date(),
        },
      });
    }
  });

  return getProgramSessionDetail(sessionId, viewer);
}

export async function getProgramSessionDetail(sessionId: string, viewer?: ViewerContext | null) {
  const memberRuns = await prisma.programSessionMember.findMany({
    where: {
      programSessionId: sessionId,
      programRunId: { not: null },
    },
    select: {
      programRunId: true,
    },
  });

  for (const memberRun of memberRuns) {
    if (!memberRun.programRunId) continue;
    await hydrateRunActionsFromLinkedTasks(prisma, memberRun.programRunId);
    await recomputeRunStats(prisma, memberRun.programRunId);
  }

  const session = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: {
      programDefinition: true,
      programVersion: true,
      host: { select: { id: true, username: true, avatarUrl: true } },
      members: {
        include: {
          user: { select: { id: true, username: true, avatarUrl: true } },
          run: {
            include: {
              currentStage: true,
              days: {
                where: {
                  status: { in: ["ACTIVE", "RECOVERY", "UPCOMING"] },
                },
                orderBy: { sequenceNumber: "asc" },
                take: 1,
                include: {
                  stage: true,
                  actions: {
                    orderBy: { order: "asc" },
                    select: {
                      id: true,
                      title: true,
                      status: true,
                      required: true,
                    },
                  },
                },
              },
            },
          },
        },
        orderBy: [{ role: "asc" }, { createdAt: "asc" }],
      },
      invites: {
        orderBy: { createdAt: "desc" },
      },
      runs: {
        orderBy: { updatedAt: "desc" },
      },
    },
  });
  if (!session) throw new HttpError(404, "Session not found");

  const viewerMember = viewer ? session.members.find((member) => member.userId === viewer.id) ?? null : null;
  const viewerInvite = viewer
    ? session.invites.find((invite) => invite.recipientId === viewer.id && invite.status === "PENDING") ?? null
    : null;
  const acceptedCount = session.members.filter((member) => member.status === "ACCEPTED").length;
  const pendingCount = session.members.filter((member) => member.status === "PENDING").length;
  const declinedCount = session.members.filter((member) => member.status === "DECLINED").length;
  const leftCount = session.members.filter((member) => member.status === "LEFT").length;
  const canStart = Boolean(viewer) && (viewer?.role === "ADMIN" || session.hostId === viewer?.id) && session.status !== "ACTIVE";
  const hostHasOtherParticipants = session.members.some(
    (member) => member.userId !== viewer?.id && ["PENDING", "ACCEPTED"].includes(member.status),
  );
  const canLeave =
    Boolean(viewerMember) &&
    session.status !== "COMPLETED" &&
    session.status !== "ARCHIVED" &&
    !(viewerMember?.role === "HOST" && hostHasOtherParticipants);

  return {
    id: session.id,
    title: session.title ?? session.programVersion.title,
    status: session.status,
    joinMode: session.joinMode,
    startMode: session.startMode,
    scheduledStartAt: session.scheduledStartAt,
    startedAt: session.startedAt,
    shareStatus: session.shareStatus,
    shareNumbers: session.shareNumbers,
    shareMisses: session.shareMisses,
    shareMilestones: session.shareMilestones,
    metricsVisibleJson: session.metricsVisibleJson,
    inviteLinkToken: session.inviteLinkToken,
    host: session.host,
    program: {
      id: session.programDefinitionId,
      versionId: session.programVersionId,
      title: session.programVersion.title,
      description: session.programVersion.description,
      category: session.programVersion.category,
      theme: session.programVersion.theme,
      coverUrl: session.programVersion.coverUrl,
    },
    summary: {
      participants: session.members.length,
      activeRuns: session.runs.filter((run) => ["ACTIVE", "PAUSED"].includes(run.status)).length,
      completedRuns: session.runs.filter((run) => run.status === "COMPLETED").length,
    },
    readiness: {
      accepted: acceptedCount,
      pending: pendingCount,
      declined: declinedCount,
      left: leftCount,
    },
    viewer: {
      userId: viewer?.id ?? null,
      isHost: Boolean(viewer) && (viewer?.role === "ADMIN" || session.hostId === viewer?.id),
      role: viewerMember?.role ?? (viewer && session.hostId === viewer.id ? "HOST" : null),
      status: viewerMember?.status ?? null,
      runId: viewerMember?.run?.id ?? null,
      inviteId: viewerInvite?.id ?? null,
      canRespondToInvite: Boolean(viewerInvite),
      canStart,
      canLeave,
    },
    members: session.members.map((member) => ({
      id: member.id,
      userId: member.userId,
      status: member.status,
      role: member.role,
      invitedAt: member.invitedAt,
      joinedAt: member.joinedAt,
      respondedAt: member.respondedAt,
      leftAt: member.leftAt,
      shareStatus: member.shareStatus,
      shareNumbers: member.shareNumbers,
      shareMisses: member.shareMisses,
      shareMilestones: member.shareMilestones,
      user: member.user,
      run: serializeSessionMemberRun(member.run),
    })),
    invites: session.invites,
  };
}
