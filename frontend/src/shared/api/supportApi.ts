import { createApi } from "@reduxjs/toolkit/query/react";
import { baseQuery } from "./baseQuery";
import type { SupportQuestion, SupportQuestionStatus, SupportTicket, SupportTicketKind, SupportTicketStatus } from "@/shared/types/support";

export const supportApi = createApi({
  reducerPath: "supportApi",
  baseQuery,
  tagTypes: ["SupportTickets", "SupportTicket", "SupportQuestions", "SupportQuestion"],
  endpoints: (build) => ({
    getMySupportTickets: build.query<{ items: SupportTicket[] }, void>({
      query: () => ({ url: "/backend/support/tickets/mine", method: "GET" }),
      providesTags: ["SupportTickets"],
    }),
    createSupportTicket: build.mutation<{ ticket: SupportTicket }, { kind: SupportTicketKind; subject: string; description: string; category?: string | null }>({
      query: (body) => ({ url: "/backend/support/tickets", method: "POST", body }),
      invalidatesTags: ["SupportTickets"],
    }),
    getAdminSupportTickets: build.query<{ items: SupportTicket[] }, { q?: string; status?: SupportTicketStatus | "ALL" } | void>({
      query: (arg) => {
        const q = arg?.q?.trim() ?? "";
        const status = arg?.status && arg.status !== "ALL" ? arg.status : "";
        const params = new URLSearchParams();
        if (q) params.set("q", q);
        if (status) params.set("status", status);
        return { url: `/backend/support/admin/tickets${params.toString() ? `?${params.toString()}` : ""}`, method: "GET" };
      },
      providesTags: ["SupportTickets"],
    }),
    replyToSupportTicket: build.mutation<{ ok: true; ticket: SupportTicket }, { ticketId: string; text: string; status?: SupportTicketStatus }>({
      query: ({ ticketId, ...body }) => ({ url: `/backend/support/tickets/${ticketId}/replies`, method: "POST", body }),
      invalidatesTags: ["SupportTickets", "SupportTicket"],
    }),
    updateSupportTicketStatus: build.mutation<{ ok: true; ticket: SupportTicket }, { ticketId: string; status: SupportTicketStatus }>({
      query: ({ ticketId, status }) => ({ url: `/backend/support/tickets/${ticketId}/status`, method: "PATCH", body: { status } }),
      invalidatesTags: ["SupportTickets", "SupportTicket"],
    }),
    getSupportQuestions: build.query<{ items: SupportQuestion[]; active: SupportQuestion[]; archived: SupportQuestion[] }, { q?: string } | void>({
      query: (arg) => {
        const q = arg?.q?.trim() ?? "";
        return { url: `/backend/support/questions${q ? `?q=${encodeURIComponent(q)}` : ""}`, method: "GET" };
      },
      providesTags: ["SupportQuestions"],
    }),
    createSupportQuestion: build.mutation<{ question: SupportQuestion }, { title: string; body?: string | null }>({
      query: (body) => ({ url: "/backend/support/questions", method: "POST", body }),
      invalidatesTags: ["SupportQuestions"],
    }),
    getSupportQuestion: build.query<{ question: SupportQuestion }, string>({
      query: (questionId) => ({ url: `/backend/support/questions/${questionId}`, method: "GET" }),
      providesTags: (_result, _error, questionId) => [{ type: "SupportQuestion" as const, id: questionId }],
    }),
    likeSupportQuestion: build.mutation<{ ok: true }, { questionId: string }>({
      query: ({ questionId }) => ({ url: `/backend/support/questions/${questionId}/like`, method: "POST" }),
      invalidatesTags: ["SupportQuestions", "SupportQuestion"],
    }),
    unlikeSupportQuestion: build.mutation<{ ok: true }, { questionId: string }>({
      query: ({ questionId }) => ({ url: `/backend/support/questions/${questionId}/like`, method: "DELETE" }),
      invalidatesTags: ["SupportQuestions", "SupportQuestion"],
    }),
    updateSupportQuestionAsAdmin: build.mutation<{ ok: true; question: SupportQuestion }, { questionId: string; answerText?: string | null; status?: SupportQuestionStatus }>({
      query: ({ questionId, ...body }) => ({ url: `/backend/support/questions/${questionId}`, method: "PATCH", body }),
      invalidatesTags: ["SupportQuestions", "SupportQuestion"],
    }),
  }),
});

export const {
  useGetMySupportTicketsQuery,
  useCreateSupportTicketMutation,
  useGetAdminSupportTicketsQuery,
  useReplyToSupportTicketMutation,
  useUpdateSupportTicketStatusMutation,
  useGetSupportQuestionsQuery,
  useCreateSupportQuestionMutation,
  useGetSupportQuestionQuery,
  useLikeSupportQuestionMutation,
  useUnlikeSupportQuestionMutation,
  useUpdateSupportQuestionAsAdminMutation,
} = supportApi;
