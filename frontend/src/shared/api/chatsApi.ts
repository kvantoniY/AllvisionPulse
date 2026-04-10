import { baseApi } from './baseApi';
import type { Chat, ChatPulseHistoryItem, Message } from '@/shared/types/chat';
import type { PulseActionArtifactType, PulseShareArtifactKind, ShareArtifact } from '@/shared/types/programs';

type Paginated<T> = { items: T[]; nextCursor?: string | null };

export const chatsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getChats: build.query<{ items: Chat[] }, void>({
      query: () => ({ url: '/backend/chats', method: 'GET' }),
      providesTags: (res) =>
        res?.items
          ? [...res.items.map((c) => ({ type: 'Chat' as const, id: c.id })), { type: 'Chat' as const, id: 'LIST' }]
          : [{ type: 'Chat' as const, id: 'LIST' }],
    }),

    createDirectChat: build.mutation<{ chat: Chat }, { userId: string }>({
      query: (body) => ({ url: '/backend/chats/direct', method: 'POST', body }),
      invalidatesTags: [{ type: 'Chat', id: 'LIST' }],
    }),

    createGroupChat: build.mutation<{ chat: Chat }, { title: string; memberIds: string[] }>({
      query: (body) => ({ url: '/backend/chats/group', method: 'POST', body }),
      invalidatesTags: [{ type: 'Chat', id: 'LIST' }],
    }),

    getMessages: build.query<Paginated<Message>, { chatId: string; take?: number; cursor?: string | null }>({
      query: ({ chatId, take = 50, cursor }) => ({
        url: `/backend/chats/${chatId}/messages?take=${take}${cursor ? `&cursor=${encodeURIComponent(cursor)}` : ''}`,
        method: 'GET',
      }),
      providesTags: (_res, _err, arg) => [{ type: 'Message', id: `LIST:${arg.chatId}` }],
    }),

    searchMessages: build.query<{ items: Message[] }, { chatId: string; q: string; take?: number }>({
      query: ({ chatId, q, take = 20 }) => ({
        url: `/backend/chats/${chatId}/messages/search?q=${encodeURIComponent(q)}&take=${take}`,
        method: 'GET',
      }),
    }),

    getChatMedia: build.query<{ items: any[]; pulseItems: ChatPulseHistoryItem[] }, { chatId: string }>({
      query: ({ chatId }) => ({ url: `/backend/chats/${chatId}/media`, method: 'GET' }),
      providesTags: (_r, _e, a) => [{ type: 'Chat', id: a.chatId }],
    }),

    sendMessage: build.mutation<
      { message: Message },
      { chatId: string; type?: string; text?: string; files?: File[]; replyToId?: string | null; forwardOfId?: string | null; metaJson?: Record<string, unknown> | null }
    >({
      query: ({ chatId, type = 'TEXT', text, files, replyToId, forwardOfId, metaJson }) => {
        const form = new FormData();
        if (text) form.append('text', text);
        form.append('type', type);
        if (replyToId) form.append('replyToId', replyToId);
        if (forwardOfId) form.append('forwardOfId', forwardOfId);
        if (metaJson) form.append('metaJson', JSON.stringify(metaJson));
        if (files?.length) {
          for (const f of files) form.append('files', f);
        }
        return { url: `/backend/chats/${chatId}/messages`, method: 'POST', body: form };
      },
    }),

    sendArtifactMessage: build.mutation<
      { message: Message; artifact: ShareArtifact },
      {
        chatId: string;
        text?: string | null;
        replyToId?: string | null;
        sourceType: string;
        sourceId?: string | null;
        kind: PulseShareArtifactKind;
        mode: 'SNAPSHOT' | 'REFERENCE' | 'INVITE';
        actionType?: PulseActionArtifactType | null;
        title?: string | null;
        description?: string | null;
        visibilityScope?: 'PRIVATE' | 'RESTRICTED' | 'PUBLIC';
        explicitPublicShare?: boolean;
        payload?: Record<string, unknown> | null;
        participantUserIds?: string[];
      }
    >({
      query: ({ chatId, ...body }) => ({
        url: `/backend/chats/${chatId}/artifacts/messages`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Message', id: `LIST:${a.chatId}` }, { type: 'Chat', id: 'LIST' }, { type: 'ShareArtifact', id: 'LIST' }],
    }),

    updateMessage: build.mutation<{ message: Message }, { chatId: string; messageId: string; text: string }>({
      query: ({ chatId, messageId, text }) => ({
        url: `/backend/chats/${chatId}/messages/${messageId}`,
        method: 'PATCH',
        body: { text },
      }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Message', id: `LIST:${a.chatId}` }, { type: 'Chat', id: 'LIST' }],
    }),

    deleteMessagesBulk: build.mutation<{ ok: true; deletedIds: string[] }, { chatId: string; messageIds: string[] }>({
      query: ({ chatId, messageIds }) => ({
        url: `/backend/chats/${chatId}/messages/bulk-delete`,
        method: 'POST',
        body: { messageIds },
      }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Message', id: `LIST:${a.chatId}` }, { type: 'Chat', id: 'LIST' }],
    }),

    deleteMessage: build.mutation<{ ok: true }, { chatId: string; messageId: string }>({
      query: ({ chatId, messageId }) => ({
        url: `/backend/chats/${chatId}/messages/${messageId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (_r, _e, a) => [{ type: 'Message', id: `LIST:${a.chatId}` }, { type: 'Chat', id: 'LIST' }],
    }),

    markRead: build.mutation<{ ok: true }, { chatId: string; messageId: string }>({
      query: ({ chatId, messageId }) => ({
        url: `/backend/chats/${chatId}/read`,
        method: 'POST',
        body: { messageId },
      }),
    }),
  }),
});

export const {
  useGetChatsQuery,
  useCreateDirectChatMutation,
  useCreateGroupChatMutation,
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useSearchMessagesQuery,
  useLazySearchMessagesQuery,
  useGetChatMediaQuery,
  useSendMessageMutation,
  useSendArtifactMessageMutation,
  useUpdateMessageMutation,
  useDeleteMessagesBulkMutation,
  useDeleteMessageMutation,
  useMarkReadMutation,
} = chatsApi;
