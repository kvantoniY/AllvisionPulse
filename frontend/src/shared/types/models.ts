export type Role = 'USER' | 'ADMIN';

export type ProfileVisibility = 'everyone' | 'followers' | 'private';
export type ContactPrivacy = 'everyone' | 'followers' | 'none';

export type UserPrivacy = {
  userId: string;
  showHealthWidgets: boolean;
  showTasks: boolean;
  showEvents: boolean;
  showPulseAchievements: boolean;
  profileVisibility: ProfileVisibility;
  allowMessagesFrom: ContactPrivacy;
  allowCallsFrom: ContactPrivacy;
};

export type UserSettings = {
  userId: string;
  theme: string | null;
};

export type PulseConfig = {
  userId: string;
  healthEnabled: boolean;
  mentalEnabled: boolean;
  nutritionEnabled: boolean;
  tasksEnabled: boolean;
  financeEnabled: boolean;
  duplicateRecurringExpensesToTasks: boolean;
  duplicateDebtPaymentsToTasks: boolean;
};

export type User = {
  id: string;
  email: string | null;
  username: string;
  firstName?: string | null;
  lastName?: string | null;
  role: Role;
  avatarUrl: string | null;
  bio: string | null;
  lastSeenAt: string | null;
  settings?: UserSettings;
  privacy?: UserPrivacy;
  pulseConfig?: PulseConfig;
  followersCount?: number;
  followingCount?: number;
  postsCount?: number;
  suspendedAt?: string | null;
  suspendedUntil?: string | null;
  suspendedPermanent?: boolean;
  suspensionReason?: string | null;
};

export type HealthDay = {
  id: string;
  userId: string;
  date: string;
  sleepHours: number | null;
  sleepQuality: number | null;
  alcohol: boolean;
  coffee: boolean;
  wellbeing: number | null;
  stress: number | null;
  activity: boolean;
  productivity: number | null;
  nutrition: number | null;
  smoking: boolean;
  comment: string | null;
  todayScore: number;
  pulse7Score: number;
  createdAt: string;
  updatedAt: string;
};

export type TaskItem = {
  id: string;
  userId: string;
  title: string;
  notes: string | null;
  kind: 'TASK' | 'EVENT';
  dueDate: string | null;
  hasTime: boolean;
  completed: boolean;
  priority: number;
  tags: string[];
  remindersJson: unknown;
  recurrenceJson: unknown;
  createdAt: string;
  updatedAt: string;
  deletedAt: string | null;
};
