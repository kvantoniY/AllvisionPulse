import { baseApi } from './baseApi';
import type { Chat, Message } from '@/shared/types/chat';

type Paginated<T> = { items: T[]; nextCursor?: string | null };

export const chatsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getChats: build.query<{ items: Chat[] }, void>({
      // goes through Next.js proxy: /api/backend/* -> ${BACKEND_URL}/api/*
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
      providesTags: (res, err, arg) => [{ type: 'Message', id: `LIST:${arg.chatId}` }],
    }),



    getChatMedia: build.query<{ items: any[] }, { chatId: string }>({
      query: ({ chatId }) => ({ url: `/backend/chats/${chatId}/media`, method: 'GET' }),
      providesTags: (r, e, a) => [{ type: 'Chat', id: a.chatId }],
    }),

    sendMessage: build.mutation<{ message: Message }, { chatId: string; type?: string; text?: string; files?: File[] }>({
      query: ({ chatId, type = 'TEXT', text, files }) => {
        const form = new FormData();
        if (text) form.append('text', text);
        form.append('type', type);
        if (files?.length) {
          for (const f of files) form.append('files', f);
        }
        return { url: `/backend/chats/${chatId}/messages`, method: 'POST', body: form };
      },
      invalidatesTags: (r, e, a) => [{ type: 'Message', id: `LIST:${a.chatId}` }, { type: 'Chat', id: 'LIST' }],
    }),

    deleteMessage: build.mutation<{ ok: true }, { chatId: string; messageId: string }>({
      query: ({ chatId, messageId }) => ({
        url: `/backend/chats/${chatId}/messages/${messageId}`,
        method: 'DELETE',
      }),
      invalidatesTags: (r, e, a) => [{ type: 'Message', id: `LIST:${a.chatId}` }],
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
  useGetChatMediaQuery,
  useSendMessageMutation,
  useDeleteMessageMutation,
  useMarkReadMutation,
} = chatsApi;
