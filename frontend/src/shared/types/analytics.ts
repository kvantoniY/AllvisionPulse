export type AnalyticsOverview = {
  totalUsers: number;
  newUsers7d: number;
  activeUsers24h: number;
  activeUsers7d: number;
  activeUsers30d: number;
  currentOnline: number;
  avgOnline24h: number;
  peakOnline24h: number;
  pageViews24h: number;
  pageViews7d: number;
  avgSessionDurationSec: number;
  avgPagesPerSession: number;
  bounceRate: number;
  retention30d: number;
  ticketsOpen: number;
  ticketsInReview: number;
  ticketsTotal: number;
  questionsOpen: number;
  questionsAnswered: number;
  questionsArchived: number;
};

export type AnalyticsChartPoint = {
  date?: string;
  slot?: string;
  label: string;
  value?: number;
  views?: number;
  users?: number;
};

export type TopPageMetric = {
  path: string;
  label: string;
  views: number;
  uniqueUsers: number;
  avgDurationSec: number;
};

export type TopTabMetric = {
  key: string;
  label: string;
  views: number;
};

export type TopActionMetric = {
  key: string;
  count: number;
};

export type AdminAnalyticsResponse = {
  overview: AnalyticsOverview;
  charts: {
    dailyActiveUsers: Array<{ date: string; label: string; value: number }>;
    pageViewsByDay: Array<{ date: string; label: string; value: number }>;
    hourlyActivity: Array<{ slot: string; label: string; views: number; users: number }>;
    onlineTimeline: Array<{ slot: string; label: string; users: number }>;
  };
  topPages: TopPageMetric[];
  topTabs: TopTabMetric[];
  topActions: TopActionMetric[];
};
