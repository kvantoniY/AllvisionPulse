export type Role = 'USER' | 'ADMIN';

export type UserPrivacy = {
  userId: string;
  showHealthWidgets: boolean;
  showTasks: boolean;
  showEvents: boolean;
  allowMessagesFrom: 'everyone' | 'friends';
};

export type UserSettings = {
  userId: string;
  theme: string | null;
};

export type User = {
  id: string;
  email: string | null;
  username: string;
  role: Role;
  avatarUrl: string | null;
  bio: string | null;
  lastSeenAt: string | null;
  settings?: UserSettings;
  privacy?: UserPrivacy;
};

export type HealthDay = {
  id: string;
  userId: string;
  date: string; // ISO string
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
