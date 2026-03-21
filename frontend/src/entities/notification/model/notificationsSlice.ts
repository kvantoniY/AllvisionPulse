import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type AppNotification = {
  id: string;
  type: string;
  title?: string;
  message?: string;
  createdAt?: string;
  data?: any;
  /** UI-only flag: user has opened notifications after this was received */
  seen?: boolean;
};

type State = {
  items: AppNotification[];
  unseenCount: number;
};

const initialState: State = {
  items: [],
  unseenCount: 0,
};

const slice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    push(state, action: PayloadAction<AppNotification>) {
      state.items.unshift({ ...action.payload, seen: false });
      state.items = state.items.slice(0, 50);
      state.unseenCount += 1;
    },
    markAllSeen(state) {
      state.unseenCount = 0;
      for (const n of state.items) n.seen = true;
    },
    markSeen(state, action: PayloadAction<{ id: string }>) {
      const n = state.items.find((x) => x.id === action.payload.id);
      if (n && !n.seen) {
        n.seen = true;
        state.unseenCount = Math.max(0, state.unseenCount - 1);
      }
    },
  },
});

export const notificationsReducer = slice.reducer;
export const notificationsActions = slice.actions;
