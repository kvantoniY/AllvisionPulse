export const APP_NAME = 'Allvision Pulse';

export const COOKIES = {
  access: 'av_access',
  refresh: 'av_refresh',
} as const;

export const ROUTES = {
  auth: {
    login: '/auth/login',
    register: '/auth/register',
  },
  app: {
    home: '/',
    feed: '/feed',
    subscriptions: '/subscriptions',
    health: '/health',
    messages: '/messages',
    pro: '/settings?tab=pro',
    profile: (username: string) => `/profile/${username}`,
    settings: '/settings',
    admin: '/admin',
    support: '/support',
    game: '/game',
  },
} as const;
