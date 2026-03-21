import { configureStore } from '@reduxjs/toolkit';
import { authApi } from '@/shared/api/authApi';
import { usersApi } from '@/shared/api/usersApi';
import { healthApi } from '@/shared/api/healthApi';
import { postsApi } from '@/shared/api/postsApi';
import { friendsApi } from '@/shared/api/friendsApi';
import { chatsApi } from '@/shared/api/chatsApi';
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
    },
    middleware: (getDefault) =>
      getDefault().concat(
        authApi.middleware,
        usersApi.middleware,
        healthApi.middleware,
        postsApi.middleware,
        friendsApi.middleware,
        chatsApi.middleware,
      ),
  });

export type AppStore = ReturnType<typeof makeStore>;
export type RootState = ReturnType<AppStore['getState']>;
export type AppDispatch = AppStore['dispatch'];
