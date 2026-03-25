import { configureStore } from '@reduxjs/toolkit';
import { authApi } from '@/shared/api/authApi';
import { usersApi } from '@/shared/api/usersApi';
import { healthApi } from '@/shared/api/healthApi';
import { postsApi } from '@/shared/api/postsApi';
import { friendsApi } from '@/shared/api/friendsApi';
import { chatsApi } from '@/shared/api/chatsApi';
import { tasksApi } from '@/shared/api/tasksApi';
import { pulseApi } from '@/shared/api/pulseApi';
import { adminApi } from '@/shared/api/adminApi';
import { supportApi } from '@/shared/api/supportApi';
import { notificationsReducer } from '@/entities/notification';
import { chatUiReducer } from '@/entities/chat';
import { presenceReducer } from '@/entities/presence';

export const makeStore = () =>
  configureStore({
    reducer: {
      notifications: notificationsReducer,
      chatUi: chatUiReducer,
      presence: presenceReducer,
      [authApi.reducerPath]: authApi.reducer,
      [usersApi.reducerPath]: usersApi.reducer,
      [healthApi.reducerPath]: healthApi.reducer,
      [postsApi.reducerPath]: postsApi.reducer,
      [friendsApi.reducerPath]: friendsApi.reducer,
      [chatsApi.reducerPath]: chatsApi.reducer,
      [tasksApi.reducerPath]: tasksApi.reducer,
      [pulseApi.reducerPath]: pulseApi.reducer,
      [adminApi.reducerPath]: adminApi.reducer,
      [supportApi.reducerPath]: supportApi.reducer,
    },
    middleware: (getDefault) =>
      getDefault().concat(
        authApi.middleware,
        usersApi.middleware,
        healthApi.middleware,
        postsApi.middleware,
        friendsApi.middleware,
        chatsApi.middleware,
        tasksApi.middleware,
        pulseApi.middleware,
        adminApi.middleware,
        supportApi.middleware,
      ),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
