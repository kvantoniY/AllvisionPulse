import { createSlice, PayloadAction } from '@reduxjs/toolkit';

export type PresenceStatus = 'online' | 'reconnecting' | 'offline';

export type PresenceInfo = {
  status: PresenceStatus;
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
      state.byUserId[userId] = { status: 'online', isOnline: true, lastSeenAt: prev?.lastSeenAt ?? null };
    },
    setReconnecting(state, action: PayloadAction<{ userId: string }>) {
      const { userId } = action.payload;
      if (!userId) return;
      const prev = state.byUserId[userId];
      state.byUserId[userId] = { status: 'reconnecting', isOnline: false, lastSeenAt: prev?.lastSeenAt ?? null };
    },
    setOffline(state, action: PayloadAction<{ userId: string; lastSeenAt?: string | null }>) {
      const { userId, lastSeenAt } = action.payload;
      if (!userId) return;
      state.byUserId[userId] = { status: 'offline', isOnline: false, lastSeenAt: lastSeenAt ?? state.byUserId[userId]?.lastSeenAt ?? null };
    },
    hydrateUser(state, action: PayloadAction<{ userId: string; lastSeenAt?: string | null }>) {
      const { userId, lastSeenAt } = action.payload;
      if (!userId) return;
      const prev = state.byUserId[userId];
      state.byUserId[userId] = {
        status: prev?.status ?? 'offline',
        isOnline: prev?.status === 'online',
        lastSeenAt: lastSeenAt ?? prev?.lastSeenAt ?? null,
      };
    },
  },
});

export const presenceActions = presenceSlice.actions;
export const presenceReducer = presenceSlice.reducer;
