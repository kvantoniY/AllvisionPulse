import { prisma } from "../../db/prisma";
import { HttpError } from "../../utils/http";
import type { ViewerContext } from "./helpers";

export async function canAccessProgramDefinition(viewer: ViewerContext, programId: string) {
  const definition = await prisma.programDefinition.findUnique({
    where: { id: programId },
    include: {
      accessGrants: { select: { userId: true } },
      currentVersion: true,
      owner: { select: { id: true, username: true } },
    },
  });

  if (!definition || definition.deletedAt) return null;
  if (viewer.role === "ADMIN") return definition;
  if (definition.ownerId === viewer.id) return definition;
  if (definition.accessMode === "PUBLIC" && definition.currentVersionId) return definition;
  if (definition.accessMode === "RESTRICTED" && definition.accessGrants.some((grant) => grant.userId === viewer.id)) return definition;
  return null;
}

export async function requireProgramDefinitionAccess(viewer: ViewerContext, programId: string) {
  const definition = await canAccessProgramDefinition(viewer, programId);
  if (!definition) throw new HttpError(404, "Program not found");
  return definition;
}

export async function requireProgramDefinitionOwnership(viewer: ViewerContext, programId: string) {
  const definition = await prisma.programDefinition.findUnique({
    where: { id: programId },
    include: {
      accessGrants: true,
      currentVersion: true,
      draftRules: true,
      draftStages: { orderBy: { order: "asc" } },
      draftDays: { orderBy: [{ dayNumber: "asc" }, { sortOrder: "asc" }] },
      draftActions: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
      draftMilestones: { orderBy: [{ order: "asc" }, { createdAt: "asc" }] },
    },
  });
  if (!definition || definition.deletedAt) throw new HttpError(404, "Program not found");
  if (viewer.role !== "ADMIN" && definition.ownerId !== viewer.id) throw new HttpError(403, "Forbidden");
  return definition;
}

export async function requireProgramRunAccess(viewer: ViewerContext, runId: string) {
  const run = await prisma.programRun.findUnique({
    where: { id: runId },
    include: {
      user: { select: { id: true, username: true } },
      programDefinition: {
        include: {
          owner: { select: { id: true, username: true } },
          accessGrants: { select: { userId: true } },
        },
      },
      session: {
        include: {
          members: {
            select: {
              userId: true,
              status: true,
            },
          },
        },
      },
    },
  });
  if (!run || run.deletedAt) throw new HttpError(404, "Program run not found");
  if (viewer.role === "ADMIN" || run.userId === viewer.id) return run;
  const isAcceptedSessionMember = run.session?.members.some((member) => member.userId === viewer.id && member.status === "ACCEPTED");
  if (isAcceptedSessionMember) return run;
  throw new HttpError(403, "Forbidden");
}

export async function requireProgramRunOwnership(viewer: ViewerContext, runId: string) {
  const run = await prisma.programRun.findUnique({
    where: { id: runId },
    include: {
      session: { include: { members: true } },
      programDefinition: true,
    },
  });
  if (!run || run.deletedAt) throw new HttpError(404, "Program run not found");
  if (viewer.role !== "ADMIN" && run.userId !== viewer.id) throw new HttpError(403, "Forbidden");
  return run;
}

export async function requireProgramSessionAccess(viewer: ViewerContext, sessionId: string) {
  const session = await prisma.programSession.findUnique({
    where: { id: sessionId },
    include: {
      members: true,
      programDefinition: {
        include: {
          owner: { select: { id: true, username: true } },
          accessGrants: { select: { userId: true } },
        },
      },
      programVersion: true,
    },
  });
  if (!session || session.archivedAt) throw new HttpError(404, "Session not found");
  if (viewer.role === "ADMIN" || session.hostId === viewer.id) return session;
  const member = session.members.find((item) => item.userId === viewer.id);
  if (member && ["PENDING", "ACCEPTED"].includes(member.status)) return session;
  throw new HttpError(403, "Forbidden");
}

export async function requireProgramSessionHost(viewer: ViewerContext, sessionId: string) {
  const session = await requireProgramSessionAccess(viewer, sessionId);
  if (viewer.role !== "ADMIN" && session.hostId !== viewer.id) throw new HttpError(403, "Forbidden");
  return session;
}

export async function requireProgramInviteAccess(viewer: ViewerContext, inviteId: string) {
  const invite = await prisma.programSessionInvite.findUnique({
    where: { id: inviteId },
    include: {
      session: {
        include: {
          members: true,
          programDefinition: true,
          programVersion: true,
        },
      },
    },
  });
  if (!invite) throw new HttpError(404, "Invite not found");
  if (viewer.role === "ADMIN") return invite;
  if (invite.recipientId === viewer.id || invite.senderId === viewer.id || invite.session.hostId === viewer.id) return invite;
  throw new HttpError(403, "Forbidden");
}
