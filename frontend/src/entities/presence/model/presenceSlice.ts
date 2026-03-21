import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type PresenceInfo = {
  isOnline: boolean;
  lastSeenAt: string | null;
};

export type PresenceState = {
  byUserId: Record<string, PresenceInfo>;
};

const initialState: PresenceState = { byUserId: {} };

export const presenceSlice = createSlice({
  name: 'presence',
  initialState,
  reducers: {
    setOnline(state, action: PayloadAction<{ userId: string }>) {
      const { userId } = action.payload;
      if (!userId) return;
      const prev = state.byUserId[userId];
      state.byUserId[userId] = { isOnline: true, lastSeenAt: prev?.lastSeenAt ?? null };
    },
    setOffline(state, action: PayloadAction<{ userId: string; lastSeenAt?: string | null }>) {
      const { userId, lastSeenAt } = action.payload;
      if (!userId) return;
      state.byUserId[userId] = { isOnline: false, lastSeenAt: lastSeenAt ?? state.byUserId[userId]?.lastSeenAt ?? null };
    },
    hydrateUser(state, action: PayloadAction<{ userId: string; lastSeenAt?: string | null }>) {
      const { userId, lastSeenAt } = action.payload;
      if (!userId) return;
      const prev = state.byUserId[userId];
      state.byUserId[userId] = {
        isOnline: prev?.isOnline ?? false,
        lastSeenAt: lastSeenAt ?? prev?.lastSeenAt ?? null,
      };
    },
  },
});

export const presenceActions = presenceSlice.actions;
export const presenceReducer = presenceSlice.reducer;
