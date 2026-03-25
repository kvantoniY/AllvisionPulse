import type { User } from "./models";

export type SupportTicketKind = "PROBLEM" | "IDEA";
export type SupportTicketStatus = "OPEN" | "IN_REVIEW" | "CLOSED";
export type SupportQuestionStatus = "OPEN" | "ANSWERED" | "CLOSED" | "ARCHIVED";

export type SupportActor = Pick<User, "id" | "username" | "avatarUrl" | "role">;

export type SupportTicketReply = {
  id: string;
  text: string;
  createdAt: string;
  updatedAt: string;
  author: SupportActor;
};

export type SupportTicket = {
  id: string;
  kind: SupportTicketKind;
  subject: string;
  description: string;
  category: string | null;
  status: SupportTicketStatus;
  createdAt: string;
  updatedAt: string;
  closedAt: string | null;
  lastReplyAt: string | null;
  author: SupportActor;
  replies: SupportTicketReply[];
};

export type SupportQuestion = {
  id: string;
  title: string;
  body: string | null;
  status: SupportQuestionStatus;
  answerText: string | null;
  answeredAt: string | null;
  closedAt: string | null;
  archivedAt: string | null;
  createdAt: string;
  updatedAt: string;
  likesCount: number;
  viewerLiked: boolean;
  author: SupportActor;
  answerAuthor: SupportActor | null;
};
