import { baseApi } from './baseApi';
import { pulseApi } from './pulseApi';
import type {
  ProgramBuilderInput,
  ProgramDetail,
  ProgramIncomingInvite,
  ProgramInvitePreview,
  ProgramListItem,
  ProgramRunDetail,
  ProgramScope,
  ProgramSessionDetail,
  ProgramSessionInvitePreview,
  ProgramTodayActions,
  PulseActionArtifactType,
  PulseArtifactResponse,
  PulseShareArtifactKind,
  PulseAchievement,
  ShareArtifact,
} from '@/shared/types/programs';

export const programsApi = baseApi.injectEndpoints({
  endpoints: (build) => ({
    searchProgramAccessUsers: build.query<{ items: Array<{ id: string; username: string; firstName?: string | null; lastName?: string | null; avatarUrl?: string | null }> }, string>({
      query: (q) => ({ url: `/backend/health/programs/access/users/search?q=${encodeURIComponent(q)}`, method: 'GET' }),
    }),

    listPrograms: build.query<{ items: ProgramListItem[] }, ProgramScope | void>({
      query: (scope) => ({ url: `/backend/health/programs${scope ? `?scope=${scope}` : ''}`, method: 'GET' }),
      providesTags: (result) =>
        result?.items
          ? [...result.items.map((item) => ({ type: 'Program' as const, id: item.id })), { type: 'Program' as const, id: 'LIST' }]
          : [{ type: 'Program' as const, id: 'LIST' }],
    }),

    getProgram: build.query<{ program: ProgramDetail }, string>({
      query: (programId) => ({ url: `/backend/health/programs/${programId}`, method: 'GET' }),
      providesTags: (_result, _error, programId) => [{ type: 'Program' as const, id: programId }],
    }),

    getProgramInvitePreview: build.query<{ invite: ProgramInvitePreview }, string>({
      query: (token) => ({ url: `/backend/health/programs/invites/link/${encodeURIComponent(token)}`, method: 'GET' }),
      providesTags: (_result, _error, token) => [{ type: 'Program' as const, id: `INVITE:${token}` }],
    }),

    createProgram: build.mutation<{ program: ProgramDetail }, ProgramBuilderInput>({
      query: (body) => ({ url: '/backend/health/programs', method: 'POST', body }),
      invalidatesTags: [{ type: 'Program', id: 'LIST' }],
    }),

    updateProgram: build.mutation<{ program: ProgramDetail }, { programId: string; body: ProgramBuilderInput }>({
      query: ({ programId, body }) => ({ url: `/backend/health/programs/${programId}`, method: 'PATCH', body }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'Program', id: arg.programId }, { type: 'Program', id: 'LIST' }],
    }),

    publishProgram: build.mutation<{ version: { id: string; versionNumber: number; publishedAt: string } }, string>({
      query: (programId) => ({ url: `/backend/health/programs/${programId}/publish`, method: 'POST' }),
      invalidatesTags: (_result, _error, programId) => [{ type: 'Program', id: programId }, { type: 'Program', id: 'LIST' }],
    }),

    archiveProgram: build.mutation<{ program: { id: string } }, string>({
      query: (programId) => ({ url: `/backend/health/programs/${programId}/archive`, method: 'POST' }),
      invalidatesTags: (_result, _error, programId) => [{ type: 'Program', id: programId }, { type: 'Program', id: 'LIST' }],
    }),

    deleteProgram: build.mutation<{ program: { id: string } }, string>({
      query: (programId) => ({ url: `/backend/health/programs/${programId}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'Program', id: 'LIST' }],
    }),

    acceptProgramLinkInvite: build.mutation<{ program: ProgramDetail }, string>({
      query: (token) => ({ url: `/backend/health/programs/invites/link/${encodeURIComponent(token)}/accept`, method: 'POST' }),
      invalidatesTags: (_result, _error, token) => [{ type: 'Program', id: `INVITE:${token}` }, { type: 'Program', id: 'LIST' }],
    }),

    startProgramRun: build.mutation<ProgramRunDetail, { programId: string; versionId?: string | null; startDate?: string | null; sessionId?: string | null }>({
      query: (body) => ({ url: '/backend/health/program-runs', method: 'POST', body }),
      invalidatesTags: [{ type: 'ProgramRun', id: 'LIST' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    getProgramRun: build.query<ProgramRunDetail, string>({
      query: (runId) => ({ url: `/backend/health/program-runs/${runId}`, method: 'GET' }),
      providesTags: (_result, _error, runId) => [{ type: 'ProgramRun' as const, id: runId }, { type: 'ProgramRun' as const, id: 'LIST' }],
    }),

    getProgramTodayActions: build.query<ProgramTodayActions, void>({
      query: () => ({ url: '/backend/health/program-runs/today', method: 'GET' }),
      providesTags: [{ type: 'ProgramRun', id: 'TODAY' }],
    }),

    completeProgramAction: build.mutation<ProgramRunDetail, { runId: string; actionId: string; note?: string | null; reflectionText?: string | null }>({
      query: ({ runId, actionId, ...body }) => ({ url: `/backend/health/program-runs/${runId}/actions/${actionId}/complete`, method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ProgramRun', id: arg.runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    skipProgramAction: build.mutation<ProgramRunDetail, { runId: string; actionId: string; note?: string | null }>({
      query: ({ runId, actionId, ...body }) => ({ url: `/backend/health/program-runs/${runId}/actions/${actionId}/skip`, method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ProgramRun', id: arg.runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    rescheduleProgramAction: build.mutation<ProgramRunDetail, { runId: string; actionId: string; targetDate: string; note?: string | null }>({
      query: ({ runId, actionId, ...body }) => ({ url: `/backend/health/program-runs/${runId}/actions/${actionId}/reschedule`, method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ProgramRun', id: arg.runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    recoverProgramRun: build.mutation<ProgramRunDetail & { recoveryApplied: { recovered: boolean } }, { runId: string; resolution: string; reasonText?: string | null; actionIds?: string[] }>({
      query: ({ runId, ...body }) => ({ url: `/backend/health/program-runs/${runId}/recovery`, method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ProgramRun', id: arg.runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    pauseProgramRun: build.mutation<ProgramRunDetail, string>({
      query: (runId) => ({ url: `/backend/health/program-runs/${runId}/pause`, method: 'POST' }),
      invalidatesTags: (_result, _error, runId) => [{ type: 'ProgramRun', id: runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    resumeProgramRun: build.mutation<ProgramRunDetail, string>({
      query: (runId) => ({ url: `/backend/health/program-runs/${runId}/resume`, method: 'POST' }),
      invalidatesTags: (_result, _error, runId) => [{ type: 'ProgramRun', id: runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    cancelProgramRun: build.mutation<ProgramRunDetail, { runId: string; reason?: string | null }>({
      query: ({ runId, ...body }) => ({ url: `/backend/health/program-runs/${runId}/cancel`, method: 'POST', body }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ProgramRun', id: arg.runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    archiveProgramRun: build.mutation<ProgramRunDetail, string>({
      query: (runId) => ({ url: `/backend/health/program-runs/${runId}/archive`, method: 'POST' }),
      invalidatesTags: (_result, _error, runId) => [{ type: 'ProgramRun', id: runId }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    deleteProgramRun: build.mutation<{ ok: boolean }, string>({
      query: (runId) => ({ url: `/backend/health/program-runs/${runId}`, method: 'DELETE' }),
      invalidatesTags: [{ type: 'ProgramRun', id: 'LIST' }, { type: 'ProgramRun', id: 'TODAY' }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    createProgramSession: build.mutation<{ session: ProgramSessionDetail }, {
      programId: string;
      title?: string | null;
      participantUsernames?: string[];
      joinMode?: string;
      startMode?: string;
      scheduledStartAt?: string | null;
      shareStatus?: boolean;
      shareNumbers?: boolean;
      shareMisses?: boolean;
      shareMilestones?: boolean;
      metricsVisibleJson?: Record<string, unknown> | null;
    }>({
      query: (body) => ({ url: '/backend/health/program-sessions', method: 'POST', body }),
      invalidatesTags: [{ type: 'ProgramSession', id: 'LIST' }, { type: 'Program', id: 'LIST' }],
    }),

    getProgramSession: build.query<{ session: ProgramSessionDetail }, string>({
      query: (sessionId) => ({ url: `/backend/health/program-sessions/${sessionId}`, method: 'GET' }),
      providesTags: (_result, _error, sessionId) => [{ type: 'ProgramSession' as const, id: sessionId }, { type: 'ProgramSession' as const, id: 'LIST' }],
    }),

    getProgramInvitesInbox: build.query<{ items: ProgramIncomingInvite[] }, void>({
      query: () => ({ url: '/backend/health/program-sessions/invites/inbox', method: 'GET' }),
      providesTags: [{ type: 'ProgramSession', id: 'INVITES' }],
    }),

    startProgramSession: build.mutation<{ session: ProgramSessionDetail }, string>({
      query: (sessionId) => ({ url: `/backend/health/program-sessions/${sessionId}/start`, method: 'POST' }),
      invalidatesTags: (_result, _error, sessionId) => [{ type: 'ProgramSession', id: sessionId }, { type: 'Program', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    leaveProgramSession: build.mutation<{ session: ProgramSessionDetail }, string>({
      query: (sessionId) => ({ url: `/backend/health/program-sessions/${sessionId}/leave`, method: 'POST' }),
      invalidatesTags: (_result, _error, sessionId) => [{ type: 'ProgramSession', id: sessionId }, { type: 'ProgramSession', id: 'LIST' }, { type: 'Program', id: 'LIST' }, { type: 'ProgramRun', id: 'LIST' }, { type: 'ProgramRun', id: 'TODAY' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    getProgramSessionInvitePreview: build.query<{ invite: ProgramSessionInvitePreview }, string>({
      query: (token) => ({ url: `/backend/health/program-sessions/invites/link/${encodeURIComponent(token)}`, method: 'GET' }),
      providesTags: (_result, _error, token) => [{ type: 'ProgramSession' as const, id: `INVITE:${token}` }],
    }),

    acceptProgramSessionLinkInvite: build.mutation<{ session: ProgramSessionDetail }, string>({
      query: (token) => ({ url: `/backend/health/program-sessions/invites/link/${encodeURIComponent(token)}/accept`, method: 'POST' }),
      invalidatesTags: (_result, _error, token) => [{ type: 'ProgramSession', id: `INVITE:${token}` }, { type: 'ProgramSession', id: 'LIST' }, { type: 'Program', id: 'LIST' }],
    }),

    acceptProgramInvite: build.mutation<{ session: ProgramSessionDetail }, string>({
      query: (inviteId) => ({ url: `/backend/health/program-sessions/invites/${inviteId}/accept`, method: 'POST' }),
      invalidatesTags: [{ type: 'ProgramSession', id: 'LIST' }, { type: 'ProgramSession', id: 'INVITES' }, { type: 'Program', id: 'LIST' }],
    }),

    declineProgramInvite: build.mutation<{ session: ProgramSessionDetail }, string>({
      query: (inviteId) => ({ url: `/backend/health/program-sessions/invites/${inviteId}/decline`, method: 'POST' }),
      invalidatesTags: [{ type: 'ProgramSession', id: 'LIST' }, { type: 'ProgramSession', id: 'INVITES' }],
    }),

    listAchievements: build.query<{ canView: boolean; items: PulseAchievement[] }, { userId?: string; username?: string } | void>({
      query: (arg) => {
        const params = new URLSearchParams();
        if (arg?.userId) params.set('userId', arg.userId);
        if (arg?.username) params.set('username', arg.username);
        const query = params.toString();
        return { url: `/backend/health/achievements${query ? `?${query}` : ''}`, method: 'GET' };
      },
      providesTags: (_result, _error, arg) => [{ type: 'Achievement', id: arg?.userId ?? arg?.username ?? 'ME' }],
    }),

    createShareArtifact: build.mutation<{ artifact: ShareArtifact }, {
      sourceType: string;
      sourceId?: string | null;
      kind: PulseShareArtifactKind;
      mode: 'SNAPSHOT' | 'REFERENCE' | 'INVITE';
      actionType?: PulseActionArtifactType | null;
      visibilityScope?: 'PRIVATE' | 'RESTRICTED' | 'PUBLIC';
      title?: string | null;
      description?: string | null;
      explicitPublicShare?: boolean;
      payload?: Record<string, unknown> | null;
      originChatId?: string | null;
      originMessageId?: string | null;
      participantUserIds?: string[];
    }>({
      query: (body) => ({ url: '/backend/health/share-artifacts', method: 'POST', body }),
      invalidatesTags: [{ type: 'ShareArtifact', id: 'LIST' }],
    }),

    listShareArtifacts: build.query<{ items: ShareArtifact[] }, number | void>({
      query: (limit) => ({ url: `/backend/health/share-artifacts${limit ? `?limit=${limit}` : ''}`, method: 'GET' }),
      providesTags: [{ type: 'ShareArtifact', id: 'LIST' }],
    }),

    getShareArtifact: build.query<{ artifact: ShareArtifact }, string>({
      query: (artifactId) => ({ url: `/backend/health/share-artifacts/${artifactId}`, method: 'GET' }),
      providesTags: (_result, _error, artifactId) => [{ type: 'ShareArtifact', id: artifactId }],
    }),

    respondToShareArtifact: build.mutation<{ artifact: ShareArtifact }, { artifactId: string; response: PulseArtifactResponse }>({
      query: ({ artifactId, response }) => ({
        url: `/backend/health/share-artifacts/${artifactId}/respond`,
        method: 'POST',
        body: { response },
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ShareArtifact', id: arg.artifactId }, { type: 'ShareArtifact', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    addShareArtifactToPulse: build.mutation<
      {
        artifact: ShareArtifact;
        task?: { id: string } | null;
        financeEntry?: { id: string } | null;
        debt?: { id: string } | null;
        savingsGoal?: { id: string } | null;
      },
      { artifactId: string }
    >({
      query: ({ artifactId }) => ({
        url: `/backend/health/share-artifacts/${artifactId}/add-to-pulse`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ShareArtifact', id: arg.artifactId }, { type: 'ShareArtifact', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    completeShareArtifact: build.mutation<{ artifact: ShareArtifact; task?: { id: string } | null }, { artifactId: string }>({
      query: ({ artifactId }) => ({
        url: `/backend/health/share-artifacts/${artifactId}/complete`,
        method: 'POST',
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ShareArtifact', id: arg.artifactId }, { type: 'ShareArtifact', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),

    settleShareArtifact: build.mutation<
      {
        artifact: ShareArtifact;
        financeEntry?: { id: string } | null;
        debt?: { id: string } | null;
        savingsGoal?: { id: string } | null;
      },
      { artifactId: string; amount: number; note?: string | null; targetUserId?: string | null }
    >({
      query: ({ artifactId, ...body }) => ({
        url: `/backend/health/share-artifacts/${artifactId}/settle`,
        method: 'POST',
        body,
      }),
      invalidatesTags: (_result, _error, arg) => [{ type: 'ShareArtifact', id: arg.artifactId }, { type: 'ShareArtifact', id: 'LIST' }],
      async onQueryStarted(_arg, { dispatch, queryFulfilled }) {
        try {
          await queryFulfilled;
          dispatch(pulseApi.util.invalidateTags(['Pulse']));
        } catch {}
      },
    }),
  }),
});

export const {
  useSearchProgramAccessUsersQuery,
  useLazySearchProgramAccessUsersQuery,
  useListProgramsQuery,
  useGetProgramQuery,
  useGetProgramInvitePreviewQuery,
  useCreateProgramMutation,
  useUpdateProgramMutation,
  usePublishProgramMutation,
  useArchiveProgramMutation,
  useDeleteProgramMutation,
  useAcceptProgramLinkInviteMutation,
  useStartProgramRunMutation,
  useGetProgramRunQuery,
  useGetProgramTodayActionsQuery,
  useCompleteProgramActionMutation,
  useSkipProgramActionMutation,
  useRescheduleProgramActionMutation,
  useRecoverProgramRunMutation,
  usePauseProgramRunMutation,
  useResumeProgramRunMutation,
  useCancelProgramRunMutation,
  useArchiveProgramRunMutation,
  useDeleteProgramRunMutation,
  useCreateProgramSessionMutation,
  useGetProgramSessionQuery,
  useGetProgramInvitesInboxQuery,
  useStartProgramSessionMutation,
  useLeaveProgramSessionMutation,
  useGetProgramSessionInvitePreviewQuery,
  useAcceptProgramSessionLinkInviteMutation,
  useAcceptProgramInviteMutation,
  useDeclineProgramInviteMutation,
  useListAchievementsQuery,
  useCreateShareArtifactMutation,
  useListShareArtifactsQuery,
  useGetShareArtifactQuery,
  useRespondToShareArtifactMutation,
  useAddShareArtifactToPulseMutation,
  useCompleteShareArtifactMutation,
  useSettleShareArtifactMutation,
} = programsApi;
