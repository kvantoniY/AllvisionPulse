export type ProgramAccessMode = 'PRIVATE' | 'RESTRICTED' | 'PUBLIC';
export type ProgramStructureType = 'FIXED_DURATION' | 'ROLLING' | 'OPEN_ENDED';
export type ProgramLifecycleStatus = 'DRAFT' | 'PUBLISHED' | 'ARCHIVED';
export type ProgramRunStatus = 'ACTIVE' | 'PAUSED' | 'CANCELLED' | 'COMPLETED' | 'ARCHIVED' | 'DELETED';
export type ProgramDayStatus = 'UPCOMING' | 'ACTIVE' | 'COMPLETED' | 'SKIPPED' | 'MISSED' | 'RECOVERY' | 'ARCHIVED';
export type ProgramActionStatus = 'PENDING' | 'COMPLETED' | 'SKIPPED' | 'MISSED' | 'RESCHEDULED' | 'CANCELLED';
export type ProgramSessionStatus = 'DRAFT' | 'ACTIVE' | 'SCHEDULED' | 'COMPLETED' | 'CANCELLED' | 'ARCHIVED';
export type ProgramSessionJoinMode = 'INVITE_ONLY' | 'LINK' | 'OPEN';
export type ProgramSessionStartMode = 'NOW' | 'SCHEDULED' | 'HOST_MANUAL' | 'AUTO_ON_ACCEPT';
export type ProgramShareMode = 'SNAPSHOT' | 'REFERENCE' | 'INVITE';
export type PulseShareArtifactKind =
  | 'WIDGET'
  | 'METRIC'
  | 'PROGRAM'
  | 'PROGRAM_INVITE'
  | 'SESSION_INVITE'
  | 'PROGRAM_SUMMARY'
  | 'PROGRAM_PROGRESS'
  | 'ACHIEVEMENT'
  | 'TODAY_ACTIONS'
  | 'TASK'
  | 'FINANCE'
  | 'DEBT'
  | 'SAVINGS'
  | 'ACTION';

export type PulseActionArtifactType =
  | 'TASK_REQUEST'
  | 'TASK_SUGGESTION'
  | 'SOCIAL_EVENT'
  | 'REMINDER_CARD'
  | 'FINANCE_SPLIT'
  | 'DEBT_SHARE'
  | 'SAVINGS_SHARE'
  | 'PROGRAM_INVITE'
  | 'PROGRAM_SESSION_INVITE'
  | 'PROGRAM_PROGRESS_SHARE'
  | 'METRIC_SHARE';

export type PulseArtifactParticipantRole = 'AUTHOR' | 'TARGET' | 'PARTICIPANT' | 'WATCHER';
export type PulseArtifactParticipantStatus = 'PENDING' | 'ACCEPTED' | 'DECLINED' | 'ADDED' | 'COMPLETED' | 'FOLLOWING';
export type PulseArtifactAction = 'OPEN' | 'ACCEPT' | 'DECLINE' | 'ADD_TO_SELF' | 'MARK_COMPLETED' | 'FOLLOW';
export type PulseArtifactResponse = 'ACCEPT' | 'DECLINE' | 'FOLLOW';

export type ProgramActionType =
  | 'TASK'
  | 'HEALTH_CHECKIN'
  | 'NUTRITION_TARGET'
  | 'FINANCE_TARGET'
  | 'JOURNAL'
  | 'REFLECTION'
  | 'REMINDER'
  | 'INFO_ONLY'
  | 'MILESTONE'
  | 'CUSTOM';

export type ProgramIntegrationType =
  | 'NONE'
  | 'TASK_TRACKER'
  | 'HEALTH'
  | 'NUTRITION'
  | 'FINANCE'
  | 'JOURNAL'
  | 'REMINDER'
  | 'PULSE_WIDGET';

export type ProgramRecoveryResolution =
  | 'CONTINUE_CURRENT_DAY'
  | 'SOFT_CATCH_UP'
  | 'SHIFT_FORWARD'
  | 'RECOVERY_DAY'
  | 'SKIP_DAY'
  | 'COMPLETE_AS_DONE'
  | 'COMPLETE_PARTIAL';

export type ProgramScope = 'active' | 'library' | 'mine' | 'collaborative' | 'drafts';
export type ProgramAccessSource = 'OWNER' | 'PUBLIC' | 'INVITED' | 'PRIVATE_SELF';

export type ProgramUser = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  firstName?: string | null;
  lastName?: string | null;
};

export type ProgramBuilderAction = {
  order?: number | null;
  actionType: ProgramActionType;
  integrationType?: ProgramIntegrationType | null;
  title: string;
  description?: string | null;
  required?: boolean;
  estimatedMinutes?: number | null;
  completionPolicy?: string | null;
  reschedulePolicy?: string | null;
  payloadJson?: Record<string, unknown> | null;
};

export type ProgramBuilderMilestone = {
  order?: number | null;
  title: string;
  description?: string | null;
  targetDay?: number | null;
  metricKey?: string | null;
  payloadJson?: Record<string, unknown> | null;
};

export type ProgramBuilderDay = {
  dayNumber?: number | null;
  title?: string | null;
  dayText?: string | null;
  tipOfDay?: string | null;
  motivationOfDay?: string | null;
  reflectionPrompt?: string | null;
  isRecoveryTemplate?: boolean;
  actions?: ProgramBuilderAction[];
  milestones?: ProgramBuilderMilestone[];
};

export type ProgramBuilderStage = {
  title: string;
  description?: string | null;
  startDay?: number | null;
  endDay?: number | null;
  milestoneText?: string | null;
};

export type ProgramBuilderInput = {
  title: string;
  description?: string | null;
  category?: string | null;
  theme?: string | null;
  language?: string | null;
  coverUrl?: string | null;
  durationDays?: number | null;
  accessMode: ProgramAccessMode;
  structureType: ProgramStructureType;
  collaborativeEnabled?: boolean;
  allowedUsernames?: string[];
  rules?: {
    allowSkip?: boolean;
    allowPause?: boolean;
    allowResume?: boolean;
    allowCancel?: boolean;
    allowRecovery?: boolean;
    maxReschedulesPerAction?: number;
    recoveryConfigJson?: Record<string, unknown> | null;
    progressConfigJson?: Record<string, unknown> | null;
    integrationConfigJson?: Record<string, unknown> | null;
  } | null;
  stages?: ProgramBuilderStage[];
  days?: ProgramBuilderDay[];
};

export type ProgramListItem = {
  id: string;
  runId?: string;
  sourceType?: 'USER' | 'SYSTEM';
  title: string;
  description?: string | null;
  category?: string | null;
  theme?: string | null;
  coverUrl?: string | null;
  accessMode: ProgramAccessMode;
  structureType: ProgramStructureType;
  durationDays?: number | null;
  collaborativeEnabled?: boolean;
  lifecycleStatus?: ProgramLifecycleStatus;
  accessSource?: ProgramAccessSource;
  status?: ProgramRunStatus | ProgramSessionStatus;
  owner?: ProgramUser | null;
  progress?: {
    completion: number;
    adherence: number;
    consistency: number;
    streak: number;
  };
  today?: {
    dayNumber?: number | null;
    status?: ProgramDayStatus | string | null;
    stageTitle?: string | null;
    dayText?: string | null;
    tipOfDay?: string | null;
    motivationOfDay?: string | null;
    totalActions: number;
    completedActions: number;
    requiredPending: number;
  } | null;
  myRun?: {
    id: string;
    status: ProgramRunStatus;
    completionPercent: number;
  } | null;
  session?: {
    id: string;
    status: ProgramSessionStatus;
    title?: string | null;
    startedAt?: string | null;
    scheduledStartAt?: string | null;
    host?: ProgramUser | null;
    viewerRole?: string | null;
    viewerStatus?: string | null;
    readiness?: {
      accepted: number;
      pending: number;
    };
  } | null;
  updatedAt: string;
  publishedAt?: string | null;
};

export type ProgramStage = {
  id: string;
  title: string;
  description?: string | null;
  startDay?: number | null;
  endDay?: number | null;
  milestoneText?: string | null;
};

export type ProgramSampleDay = {
  id: string;
  dayNumber?: number | null;
  title?: string | null;
  dayText?: string | null;
  tipOfDay?: string | null;
  motivationOfDay?: string | null;
  reflectionPrompt?: string | null;
  actions: Array<{
    id: string;
    title: string;
    actionType: ProgramActionType;
    integrationType: ProgramIntegrationType;
    required: boolean;
    estimatedMinutes?: number | null;
  }>;
  milestones: Array<{
    id: string;
    title: string;
    targetDay?: number | null;
    metricKey?: string | null;
  }>;
};

export type ProgramDetail = {
  id: string;
  title: string;
  description?: string | null;
  category?: string | null;
  theme?: string | null;
  language?: string | null;
  coverUrl?: string | null;
  durationDays?: number | null;
  accessMode: ProgramAccessMode;
  structureType: ProgramStructureType;
  collaborativeEnabled: boolean;
  lifecycleStatus: ProgramLifecycleStatus;
  publishedAt?: string | null;
  owner?: ProgramUser | null;
  currentVersion?: {
    id: string;
    versionNumber: number;
    publishedAt: string;
  } | null;
  stages: ProgramStage[];
  sampleDays: ProgramSampleDay[];
  integrations: ProgramIntegrationType[];
  accessUsers: ProgramUser[];
  rules?: {
    allowSkip: boolean;
    allowPause: boolean;
    allowResume: boolean;
    allowCancel: boolean;
    allowRecovery: boolean;
    maxReschedulesPerAction: number;
    recoveryConfigJson?: Record<string, unknown> | null;
    progressConfigJson?: Record<string, unknown> | null;
    integrationConfigJson?: Record<string, unknown> | null;
  } | null;
  myRuns: Array<{
    id: string;
    status: ProgramRunStatus;
    sessionId?: string | null;
    completionPercent: number;
    adherenceScore: number;
    consistencyScore: number;
    streakCount: number;
    updatedAt: string;
  }>;
  relatedSessions: Array<{
    id: string;
    status: ProgramSessionStatus;
    title?: string | null;
    updatedAt: string;
    startedAt?: string | null;
    scheduledStartAt?: string | null;
    host?: ProgramUser | null;
    viewerRole?: string | null;
    viewerStatus?: string | null;
  }>;
  entryState: {
    accessSource: ProgramAccessSource;
    isOwner: boolean;
    canStartPersonal: boolean;
    canStartTogether: boolean;
    personalBlockedReason?: string | null;
    collaborativeBlockedReason?: string | null;
    activePersonalRunId?: string | null;
    activeCollaborativeRunId?: string | null;
    activeSessionId?: string | null;
  };
};

export type ProgramRunAction = {
  id: string;
  dayId: string;
  title: string;
  description?: string | null;
  actionType: ProgramActionType;
  integrationType: ProgramIntegrationType;
  required: boolean;
  estimatedMinutes?: number | null;
  completionPolicy?: string | null;
  reschedulePolicy?: string | null;
  payloadJson?: Record<string, unknown> | null;
  status: ProgramActionStatus;
  scheduledDate: string;
  completedAt?: string | null;
  skippedAt?: string | null;
  rescheduledToDate?: string | null;
  reflectionText?: string | null;
  openPath?: string | null;
};

export type ProgramMemberRunToday = {
  dayNumber?: number | null;
  stageTitle?: string | null;
  totalTodayCount: number;
  completedTodayCount: number;
  requiredPendingCount: number;
  completedToday: Array<{
    id: string;
    title: string;
    status: ProgramActionStatus;
  }>;
};

export type ProgramRunDay = {
  id: string;
  sequenceNumber: number;
  programDayNumber?: number | null;
  scheduledDate: string;
  status: ProgramDayStatus;
  isRecoveryDay: boolean;
  requiredCount: number;
  optionalCount: number;
  completedRequiredCount: number;
  completedOptionalCount: number;
  stage?: ProgramStage | null;
  dayTemplate?: {
    id: string;
    title?: string | null;
    dayText?: string | null;
    tipOfDay?: string | null;
    motivationOfDay?: string | null;
    reflectionPrompt?: string | null;
  } | null;
  actions: ProgramRunAction[];
};

export type ProgramRunDetail = {
  run: {
    id: string;
    status: ProgramRunStatus;
    startedAt: string;
    startDate: string;
    pausedAt?: string | null;
    resumedAt?: string | null;
    completedAt?: string | null;
    cancelledAt?: string | null;
    archivedAt?: string | null;
    currentDayNumber: number;
    currentStageId?: string | null;
    completionPercent: number;
    adherenceScore: number;
    consistencyScore: number;
    streakCount: number;
    missedDaysCount: number;
    skippedActionsCount: number;
    rescheduledActionsCount: number;
    stageCompletionPercent: number;
    milestonesEarnedCount: number;
    program: {
      id: string;
      title: string;
      description?: string | null;
      category?: string | null;
      theme?: string | null;
      language?: string | null;
      coverUrl?: string | null;
      accessMode: ProgramAccessMode;
      structureType: ProgramStructureType;
      durationDays?: number | null;
      collaborativeEnabled: boolean;
      owner?: ProgramUser | null;
    };
    currentStage?: ProgramStage | null;
  };
  summary: {
    completion: number;
    adherence: number;
    consistency: number;
    streak: number;
    missedDays: number;
    skippedActions: number;
    rescheduledActions: number;
    stageCompletion: number;
    milestones: number;
  };
  today?: ProgramRunDay | null;
  history: ProgramRunDay[];
  recovery: {
    needed: boolean;
    missedDays: ProgramRunDay[];
    options: ProgramRecoveryResolution[];
  };
  session?: ProgramSessionDetail | null;
  events: Array<{
    id: string;
    eventType: string;
    message?: string | null;
    payloadJson?: Record<string, unknown> | null;
    createdAt: string;
  }>;
  recoveryEvents: Array<{
    id: string;
    resolution: ProgramRecoveryResolution;
    reasonText?: string | null;
    createdAt: string;
  }>;
};

export type ProgramSessionDetail = {
  id: string;
  title: string;
  status: ProgramSessionStatus;
  joinMode: ProgramSessionJoinMode;
  startMode: ProgramSessionStartMode;
  scheduledStartAt?: string | null;
  startedAt?: string | null;
  shareStatus: boolean;
  shareNumbers: boolean;
  shareMisses: boolean;
  shareMilestones: boolean;
  metricsVisibleJson?: Record<string, unknown> | null;
  inviteLinkToken?: string | null;
  host?: ProgramUser | null;
  program: {
    id: string;
    versionId: string;
    title: string;
    description?: string | null;
    category?: string | null;
    theme?: string | null;
    coverUrl?: string | null;
  };
  summary: {
    participants: number;
    activeRuns: number;
    completedRuns: number;
  };
  readiness: {
    accepted: number;
    pending: number;
    declined: number;
    left: number;
  };
  viewer: {
    userId?: string | null;
    isHost: boolean;
    role?: string | null;
    status?: string | null;
    runId?: string | null;
    inviteId?: string | null;
    canRespondToInvite?: boolean;
    canStart: boolean;
    canLeave: boolean;
  };
  members: Array<{
    id: string;
    userId: string;
    status: string;
    role: string;
    invitedAt: string;
    joinedAt?: string | null;
    respondedAt?: string | null;
    leftAt?: string | null;
    shareStatus: boolean;
    shareNumbers: boolean;
    shareMisses: boolean;
    shareMilestones: boolean;
    user?: ProgramUser | null;
    run?: {
      id: string;
      status: ProgramRunStatus;
      completionPercent: number;
      adherenceScore: number;
      consistencyScore: number;
      streakCount: number;
      missedDaysCount: number;
      today?: ProgramMemberRunToday | null;
    } | null;
  }>;
  invites: Array<{
    id: string;
    recipientId?: string | null;
    recipientUsername?: string | null;
    status: string;
    inviteToken: string;
    createdAt: string;
    respondedAt?: string | null;
  }>;
};

export type ProgramTodayActions = {
  items: Array<
    ProgramRunAction & {
      runId: string;
      runStatus: ProgramRunStatus;
      programTitle: string;
      programId: string;
      category?: string | null;
      stageTitle?: string | null;
      dayNumber: number;
    }
  >;
  recoveryRuns: string[];
};

export type ProgramSessionInvitePreview = {
  token: string;
  sessionId: string;
  title: string;
  status: ProgramSessionStatus;
  joinMode: ProgramSessionJoinMode;
  startMode: ProgramSessionStartMode;
  scheduledStartAt?: string | null;
  startedAt?: string | null;
  host?: ProgramUser | null;
  program: {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    theme?: string | null;
    coverUrl?: string | null;
  };
  summary: {
    participants: number;
    activeRuns: number;
  };
  membershipStatus?: string | null;
  canJoin: boolean;
  joinBlockedReason?: string | null;
};

export type ProgramInvitePreview = {
  token: string;
  programId: string;
  title: string;
  description?: string | null;
  accessMode: ProgramAccessMode;
  collaborativeEnabled: boolean;
  owner?: ProgramUser | null;
  program: {
    id: string;
    title: string;
    description?: string | null;
    category?: string | null;
    theme?: string | null;
    coverUrl?: string | null;
  };
  alreadyGranted: boolean;
  canAccept: boolean;
};

export type ProgramIncomingInvite = {
  id: string;
  createdAt: string;
  recipientId?: string | null;
  recipientUsername?: string | null;
  sender?: ProgramUser | null;
  canAccept: boolean;
  blockedReason?: string | null;
  membershipStatus?: string | null;
  session: {
    id: string;
    title: string;
    status: ProgramSessionStatus;
    joinMode: ProgramSessionJoinMode;
    startMode: ProgramSessionStartMode;
    scheduledStartAt?: string | null;
    startedAt?: string | null;
    host?: ProgramUser | null;
    summary: {
      participants: number;
      accepted: number;
      pending: number;
      activeRuns: number;
    };
    program: {
      id: string;
      title: string;
      description?: string | null;
      category?: string | null;
      theme?: string | null;
      coverUrl?: string | null;
    };
  };
};

export type ShareArtifact = {
  id: string;
  ownerId: string;
  kind: PulseShareArtifactKind;
  mode: ProgramShareMode;
  actionType?: PulseActionArtifactType | null;
  title?: string | null;
  description?: string | null;
  sourceType: string;
  sourceId?: string | null;
  snapshotJson?: Record<string, unknown> | null;
  referenceJson?: Record<string, unknown> | null;
  payloadJson?: Record<string, unknown> | null;
  visibilityScope: ProgramAccessMode;
  inviteToken?: string | null;
  containsSensitiveData: boolean;
  allowPublicReference: boolean;
  originChatId?: string | null;
  originMessageId?: string | null;
  createdAt: string;
  updatedAt: string;
  resolvedSnapshot?: Record<string, unknown> | null;
  viewerState?: {
    userId?: string;
    role: PulseArtifactParticipantRole;
    status: PulseArtifactParticipantStatus;
    acceptedAt?: string | null;
    declinedAt?: string | null;
    addedAt?: string | null;
    completedAt?: string | null;
    followedAt?: string | null;
    taskId?: string | null;
    financeEntryId?: string | null;
    debtId?: string | null;
    savingsGoalId?: string | null;
    programRunId?: string | null;
    programSessionId?: string | null;
  } | null;
  participantSummary?: {
    total: number;
    accepted: number;
    declined: number;
    added: number;
    completed: number;
    following: number;
  } | null;
  participantsPreview?: Array<{
    user: ProgramUser;
    role: PulseArtifactParticipantRole;
    status: PulseArtifactParticipantStatus;
    statusLabel?: string;
    acceptedAt?: string | null;
    declinedAt?: string | null;
    addedAt?: string | null;
    completedAt?: string | null;
    followedAt?: string | null;
  }>;
  allowedActions?: PulseArtifactAction[];
  primaryAction?: {
    key: PulseArtifactAction;
    label: string;
  } | null;
  openRoute?: string | null;
  recentActivity?: Array<{
    id: string;
    type: string;
    createdAt: string;
    actor?: ProgramUser | null;
    subjectUser?: ProgramUser | null;
    payloadJson?: Record<string, unknown> | null;
  }>;
};

export type PulseAchievement = {
  id: string;
  userId: string;
  sourceType: string;
  sourceId?: string | null;
  titleSnapshot?: string | null;
  descriptionSnapshot?: string | null;
  awardedAt: string;
  progressValue?: number | null;
  progressMax?: number | null;
  definition: {
    id: string;
    slug: string;
    kind: string;
    title: string;
    description?: string | null;
    iconKey?: string | null;
    badgeTone?: string | null;
  };
};
