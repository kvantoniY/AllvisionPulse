import { createSlice, PayloadAction } from '@reduxjs/toolkit';

type State = {
  activeChatId: string | null;
  unreadTotal: number;
  unreadByChat: Record<string, number>;
};

const initialState: State = {
  activeChatId: null,
  unreadTotal: 0,
  unreadByChat: {},
};

const slice = createSlice({
  name: 'chatUi',
  initialState,
  reducers: {
    setActiveChatId(state, action: PayloadAction<string | null>) {
      state.activeChatId = action.payload;
    },
    incUnread(state, action: PayloadAction<{ chatId: string }>) {
      const { chatId } = action.payload;
      state.unreadTotal += 1;
      state.unreadByChat[chatId] = (state.unreadByChat[chatId] ?? 0) + 1;
    },
    clearUnread(state, action: PayloadAction<{ chatId: string }>) {
      const { chatId } = action.payload;
      const n = state.unreadByChat[chatId] ?? 0;
      state.unreadTotal = Math.max(0, state.unreadTotal - n);
      delete state.unreadByChat[chatId];
    },
    clearAll(state) {
      state.unreadTotal = 0;
      state.unreadByChat = {};
    },
  },
});

export const chatUiReducer = slice.reducer;
export const chatUiActions = slice.actions;
