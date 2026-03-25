import { baseApi } from './baseApi';
import type { GameSession } from '@/shared/types/game';

export const gamesApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    getGameSessions: build.query<{ items: GameSession[] }, { chatId: string }>({
      query: ({ chatId }) => ({ url: `/backend/games/chat/${chatId}/sessions`, method: 'GET' }),
      providesTags: (res, err, arg) => [{ type: 'Game', id: `LIST:${arg.chatId}` }],
    }),
    getGameSession: build.query<{ session: GameSession }, { sessionId: string }>({
      query: ({ sessionId }) => ({ url: `/backend/games/sessions/${sessionId}`, method: 'GET' }),
      providesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
    createGameSession: build.mutation<{ session: GameSession }, { chatId: string; gameKey: string; title?: string; participantUserIds?: string[]; config?: Record<string, any> }>({
      query: ({ chatId, ...body }) => ({ url: `/backend/games/chat/${chatId}/sessions`, method: 'POST', body }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: `LIST:${arg.chatId}` }],
    }),
    updateGameSessionConfig: build.mutation<{ session: GameSession }, { sessionId: string; title?: string; participantUserIds?: string[]; config?: Record<string, any> }>({
      query: ({ sessionId, ...body }) => ({ url: `/backend/games/sessions/${sessionId}/config`, method: 'PATCH', body }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
    joinGameSession: build.mutation<{ session: GameSession }, { sessionId: string; role?: 'player' | 'observer' }>({
      query: ({ sessionId, ...body }) => ({ url: `/backend/games/sessions/${sessionId}/join`, method: 'POST', body }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
    leaveGameSession: build.mutation<{ session: GameSession }, { sessionId: string }>({
      query: ({ sessionId }) => ({ url: `/backend/games/sessions/${sessionId}/leave`, method: 'POST' }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
    setGameReady: build.mutation<{ session: GameSession }, { sessionId: string; isReady: boolean }>({
      query: ({ sessionId, isReady }) => ({ url: `/backend/games/sessions/${sessionId}/ready`, method: 'POST', body: { isReady } }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
    startGameSession: build.mutation<{ session: GameSession }, { sessionId: string }>({
      query: ({ sessionId }) => ({ url: `/backend/games/sessions/${sessionId}/start`, method: 'POST' }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
    cancelGameSession: build.mutation<{ session: GameSession }, { sessionId: string }>({
      query: ({ sessionId }) => ({ url: `/backend/games/sessions/${sessionId}/cancel`, method: 'POST' }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),

    deleteGameSession: build.mutation<{ ok: true }, { sessionId: string; chatId: string }>({
      query: ({ sessionId }) => ({ url: `/backend/games/sessions/${sessionId}`, method: 'DELETE' }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }, { type: 'Game', id: `LIST:${arg.chatId}` }],
    }),
    clearArchivedGameSessions: build.mutation<{ ok: true; removed: number }, { chatId: string }>({
      query: ({ chatId }) => ({ url: `/backend/games/chat/${chatId}/sessions/archive/clear`, method: 'POST' }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: `LIST:${arg.chatId}` }],
    }),
    pokerAction: build.mutation<{ session: GameSession }, { sessionId: string; type: 'fold' | 'check' | 'call' | 'bet' | 'raise'; amount?: number; idempotencyKey?: string }>({
      query: ({ sessionId, ...body }) => ({ url: `/backend/games/sessions/${sessionId}/poker/action`, method: 'POST', body }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
    flappyAttempt: build.mutation<{ session: GameSession }, { sessionId: string; score: number; idempotencyKey?: string }>({
      query: ({ sessionId, ...body }) => ({ url: `/backend/games/sessions/${sessionId}/flappy/attempt`, method: 'POST', body }),
      invalidatesTags: (res, err, arg) => [{ type: 'Game', id: arg.sessionId }],
    }),
  }),
});

export const {
  useGetGameSessionsQuery,
  useGetGameSessionQuery,
  useCreateGameSessionMutation,
  useUpdateGameSessionConfigMutation,
  useJoinGameSessionMutation,
  useLeaveGameSessionMutation,
  useSetGameReadyMutation,
  useStartGameSessionMutation,
  useCancelGameSessionMutation,
  useDeleteGameSessionMutation,
  useClearArchivedGameSessionsMutation,
  usePokerActionMutation,
  useFlappyAttemptMutation,
} = gamesApi;
