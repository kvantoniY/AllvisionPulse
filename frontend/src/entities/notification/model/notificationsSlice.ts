import { createSlice, PayloadAction } from '@reduxjs/toolkit';
import type { AppNotification } from '@/shared/types/notification';

type State = {
  items: AppNotification[];
  unseenCount: number;
};

const initialState: State = {
  items: [],
  unseenCount: 0,
};

const MAX_ITEMS = 200;

function sortItems(items: AppNotification[]) {
  return [...items].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime());
}

function recomputeUnseenCount(items: AppNotification[]) {
  return items.reduce((count, item) => count + (!item.readAt && !item.seen ? 1 : 0), 0);
}

function mergeItems(previousItems: AppNotification[], incomingItems: AppNotification[]) {
  const previousById = new Map(previousItems.map((item) => [item.id, item]));

  for (const item of incomingItems) {
    const previousItem = previousById.get(item.id);
    previousById.set(item.id, {
      ...(previousItem ?? {}),
      ...item,
      seen: item.readAt ? true : previousItem?.seen ?? false,
    });
  }

  return sortItems(Array.from(previousById.values())).slice(0, MAX_ITEMS);
}

const slice = createSlice({
  name: 'notifications',
  initialState,
  reducers: {
    hydrate(state, action: PayloadAction<AppNotification[]>) {
      state.items = mergeItems(state.items, action.payload);
      state.unseenCount = recomputeUnseenCount(state.items);
    },
    push(state, action: PayloadAction<AppNotification>) {
      const incoming = action.payload;
      const index = state.items.findIndex((item) => item.id === incoming.id);
      const nextItem: AppNotification = {
        ...incoming,
        seen: incoming.readAt ? true : state.items[index]?.seen ?? false,
      };

      if (index >= 0) {
        state.items[index] = nextItem;
      } else {
        state.items.unshift({ ...nextItem, seen: incoming.readAt ? true : false });
      }

      state.items = sortItems(state.items).slice(0, MAX_ITEMS);
      state.unseenCount = recomputeUnseenCount(state.items);
    },
    markAllSeen(state) {
      for (const n of state.items) n.seen = true;
      state.unseenCount = 0;
    },
    markSeen(state, action: PayloadAction<{ id: string }>) {
      const n = state.items.find((x) => x.id === action.payload.id);
      if (n && !n.seen && !n.readAt) {
        n.seen = true;
        state.unseenCount = Math.max(0, state.unseenCount - 1);
      }
    },
    clearAll(state) {
      state.items = [];
      state.unseenCount = 0;
    },
  },
});

export const notificationsReducer = slice.reducer;
export const notificationsActions = slice.actions;
