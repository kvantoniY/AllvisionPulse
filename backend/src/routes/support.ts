import { Router } from 'express';
import { z } from 'zod';
import { prisma } from '../db/prisma';
import { asyncHandler, HttpError } from '../utils/http';
import { requireAuth, requireActiveUser, requireRole, AuthedRequest } from '../middleware/auth';
import { trackAnalyticsEvent } from '../utils/analytics';

const router = Router();
router.use(requireAuth, requireActiveUser);

const USER_SELECT = {
  id: true,
  username: true,
  avatarUrl: true,
  role: true,
} as const;

const CreateTicketSchema = z.object({
  kind: z.enum(['PROBLEM', 'IDEA']).default('PROBLEM'),
  subject: z.string().trim().min(3).max(140),
  description: z.string().trim().min(10).max(5000),
  category: z.string().trim().max(80).optional().nullable(),
});

const TicketStatusSchema = z.object({
  status: z.enum(['OPEN', 'IN_REVIEW', 'CLOSED']),
});

const TicketReplySchema = z.object({
  text: z.string().trim().min(1).max(4000),
  status: z.enum(['OPEN', 'IN_REVIEW', 'CLOSED']).optional(),
});

const CreateQuestionSchema = z.object({
  title: z.string().trim().min(5).max(180),
  body: z.string().trim().max(5000).optional().nullable(),
});

const UpdateQuestionSchema = z.object({
  answerText: z.string().trim().min(1).max(5000).optional().nullable(),
  status: z.enum(['OPEN', 'ANSWERED', 'CLOSED', 'ARCHIVED']).optional(),
}).refine((value) => value.answerText !== undefined || value.status !== undefined, {
  message: 'Provide answerText or status',
});

async function archiveStaleQuestions() {
  const archiveBefore = new Date(Date.now() - 24 * 60 * 60 * 1000);
  await prisma.supportQuestion.updateMany({
    where: {
      status: 'CLOSED',
      archivedAt: null,
      closedAt: { not: null, lte: archiveBefore },
    },
    data: {
      status: 'ARCHIVED',
      archivedAt: new Date(),
    },
  });
}

function normalizeQuestion(question: any) {
  return {
    id: question.id,
    title: question.title,
    body: question.body,
    status: question.status,
    answerText: question.answerText,
    answeredAt: question.answeredAt,
    closedAt: question.closedAt,
    archivedAt: question.archivedAt,
    createdAt: question.createdAt,
    updatedAt: question.updatedAt,
    author: question.author,
    answerAuthor: question.answerAuthor,
    likesCount: question._count?.likes ?? question.likes?.length ?? 0,
    viewerLiked: Array.isArray(question.likes) ? question.likes.length > 0 : false,
  };
}

function sortQuestions(items: any[]) {
  return [...items].sort((a, b) => {
    const likesDiff = (b.likesCount ?? 0) - (a.likesCount ?? 0);
    if (likesDiff !== 0) return likesDiff;
    return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
  });
}

async function getTicketForViewer(ticketId: string, viewer: NonNullable<AuthedRequest['user']>) {
  const ticket = await prisma.supportTicket.findUnique({
    where: { id: ticketId },
    include: {
      author: { select: USER_SELECT },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: USER_SELECT } },
      },
    },
  });

  if (!ticket) throw new HttpError(404, 'Тикет не найден');
  if (viewer.role !== 'ADMIN' && ticket.authorId !== viewer.id) throw new HttpError(403, 'Forbidden');
  return ticket;
}

router.get('/tickets/mine', asyncHandler(async (req: AuthedRequest, res) => {
  const items = await prisma.supportTicket.findMany({
    where: { authorId: req.user!.id },
    orderBy: [{ updatedAt: 'desc' }],
    include: {
      author: { select: USER_SELECT },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: USER_SELECT } },
      },
    },
  });
  res.json({ items });
}));

router.post('/tickets', asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreateTicketSchema.parse(req.body);
  const ticket = await prisma.supportTicket.create({
    data: {
      authorId: req.user!.id,
      kind: body.kind,
      subject: body.subject,
      description: body.description,
      category: body.category ?? null,
    },
    include: {
      author: { select: USER_SELECT },
      replies: { include: { author: { select: USER_SELECT } } },
    },
  });
  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/support',
    pageLabel: 'Тех поддержка',
    actionKey: 'support_ticket_created',
    metadata: { kind: body.kind, category: body.category ?? null },
  });
  res.json({ ticket });
}));

router.get('/tickets/:ticketId', asyncHandler(async (req: AuthedRequest, res) => {
  const ticket = await getTicketForViewer(req.params.ticketId, req.user!);
  res.json({ ticket });
}));

router.get('/admin/tickets', requireRole('ADMIN'), asyncHandler(async (req: AuthedRequest, res) => {
  const q = (req.query.q?.toString() ?? '').trim();
  const status = req.query.status?.toString();
  const items = await prisma.supportTicket.findMany({
    where: {
      ...(status && ['OPEN', 'IN_REVIEW', 'CLOSED'].includes(status) ? { status: status as any } : {}),
      ...(q ? {
        OR: [
          { subject: { contains: q, mode: 'insensitive' } },
          { description: { contains: q, mode: 'insensitive' } },
          { category: { contains: q, mode: 'insensitive' } },
          { author: { is: { username: { contains: q, mode: 'insensitive' } } } },
        ],
      } : {}),
    },
    orderBy: [{ updatedAt: 'desc' }],
    take: 200,
    include: {
      author: { select: USER_SELECT },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: USER_SELECT } },
      },
    },
  });
  res.json({ items });
}));

router.patch('/tickets/:ticketId/status', requireRole('ADMIN'), asyncHandler(async (req: AuthedRequest, res) => {
  const body = TicketStatusSchema.parse(req.body);
  const ticket = await getTicketForViewer(req.params.ticketId, req.user!);
  const nextStatus = body.status;

  const updated = await prisma.supportTicket.update({
    where: { id: ticket.id },
    data: {
      status: nextStatus,
      closedAt: nextStatus === 'CLOSED' ? new Date() : null,
    },
    include: {
      author: { select: USER_SELECT },
      replies: {
        orderBy: { createdAt: 'asc' },
        include: { author: { select: USER_SELECT } },
      },
    },
  });

  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/admin',
    pageLabel: 'Админ панель',
    actionKey: 'support_ticket_status_changed',
    metadata: { status: nextStatus, ticketId: ticket.id },
  });
  res.json({ ticket: updated, ok: true });
}));

router.post('/tickets/:ticketId/replies', requireRole('ADMIN'), asyncHandler(async (req: AuthedRequest, res) => {
  const body = TicketReplySchema.parse(req.body);
  const ticket = await getTicketForViewer(req.params.ticketId, req.user!);
  const nextStatus = body.status ?? (ticket.status === 'OPEN' ? 'IN_REVIEW' : ticket.status);

  const updated = await prisma.$transaction(async (tx) => {
    await tx.supportTicketReply.create({
      data: {
        ticketId: ticket.id,
        authorId: req.user!.id,
        text: body.text,
      },
    });

    return tx.supportTicket.update({
      where: { id: ticket.id },
      data: {
        status: nextStatus,
        lastReplyAt: new Date(),
        closedAt: nextStatus === 'CLOSED' ? new Date() : null,
      },
      include: {
        author: { select: USER_SELECT },
        replies: {
          orderBy: { createdAt: 'asc' },
          include: { author: { select: USER_SELECT } },
        },
      },
    });
  });

  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/admin',
    pageLabel: 'Админ панель',
    actionKey: 'support_ticket_replied',
    metadata: { ticketId: ticket.id, status: nextStatus },
  });
  res.json({ ticket: updated, ok: true });
}));

router.get('/questions', asyncHandler(async (req: AuthedRequest, res) => {
  await archiveStaleQuestions();
  const q = (req.query.q?.toString() ?? '').trim();

  const items = await prisma.supportQuestion.findMany({
    where: q
      ? {
          OR: [
            { title: { contains: q, mode: 'insensitive' } },
            { body: { contains: q, mode: 'insensitive' } },
            { answerText: { contains: q, mode: 'insensitive' } },
            { author: { is: { username: { contains: q, mode: 'insensitive' } } } },
            { answerAuthor: { is: { username: { contains: q, mode: 'insensitive' } } } },
          ],
        }
      : undefined,
    include: {
      author: { select: USER_SELECT },
      answerAuthor: { select: USER_SELECT },
      likes: { where: { userId: req.user!.id }, select: { id: true } },
      _count: { select: { likes: true } },
    },
    take: 200,
  });

  const normalized = items.map(normalizeQuestion);
  const active = sortQuestions(normalized.filter((item) => item.status !== 'ARCHIVED'));
  const archived = sortQuestions(normalized.filter((item) => item.status === 'ARCHIVED'));
  res.json({ items: normalized, active, archived });
}));

router.post('/questions', asyncHandler(async (req: AuthedRequest, res) => {
  const body = CreateQuestionSchema.parse(req.body);
  const question = await prisma.supportQuestion.create({
    data: {
      authorId: req.user!.id,
      title: body.title,
      body: body.body ?? null,
    },
    include: {
      author: { select: USER_SELECT },
      answerAuthor: { select: USER_SELECT },
      likes: { where: { userId: req.user!.id }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });
  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/support',
    pageLabel: 'Популярные вопросы',
    actionKey: 'support_question_created',
    metadata: { questionId: question.id },
  });
  res.json({ question: normalizeQuestion(question) });
}));

router.get('/questions/:questionId', asyncHandler(async (req: AuthedRequest, res) => {
  await archiveStaleQuestions();
  const question = await prisma.supportQuestion.findUnique({
    where: { id: req.params.questionId },
    include: {
      author: { select: USER_SELECT },
      answerAuthor: { select: USER_SELECT },
      likes: { where: { userId: req.user!.id }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });
  if (!question) throw new HttpError(404, 'Вопрос не найден');
  res.json({ question: normalizeQuestion(question) });
}));

router.post('/questions/:questionId/like', asyncHandler(async (req: AuthedRequest, res) => {
  const question = await prisma.supportQuestion.findUnique({ where: { id: req.params.questionId }, select: { id: true } });
  if (!question) throw new HttpError(404, 'Вопрос не найден');
  await prisma.supportQuestionLike.create({ data: { questionId: question.id, userId: req.user!.id } }).catch(() => null);
  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/support',
    pageLabel: 'Популярные вопросы',
    actionKey: 'support_question_liked',
    metadata: { questionId: question.id },
  });
  res.json({ ok: true });
}));

router.delete('/questions/:questionId/like', asyncHandler(async (req: AuthedRequest, res) => {
  await prisma.supportQuestionLike.deleteMany({ where: { questionId: req.params.questionId, userId: req.user!.id } });
  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/support',
    pageLabel: 'Популярные вопросы',
    actionKey: 'support_question_unliked',
    metadata: { questionId: req.params.questionId },
  });
  res.json({ ok: true });
}));

router.patch('/questions/:questionId', requireRole('ADMIN'), asyncHandler(async (req: AuthedRequest, res) => {
  await archiveStaleQuestions();
  const body = UpdateQuestionSchema.parse(req.body);
  const current = await prisma.supportQuestion.findUnique({ where: { id: req.params.questionId } });
  if (!current) throw new HttpError(404, 'Вопрос не найден');

  const nextAnswer = body.answerText === undefined ? current.answerText : body.answerText;
  let nextStatus = body.status ?? current.status;
  const now = new Date();

  if ((nextStatus === 'ANSWERED' || nextStatus === 'CLOSED' || nextStatus === 'ARCHIVED') && !(nextAnswer && nextAnswer.trim())) {
    throw new HttpError(400, 'Нельзя опубликовать ответ или закрыть вопрос без текста ответа');
  }

  if (body.answerText !== undefined && body.answerText?.trim() && nextStatus === 'OPEN') {
    nextStatus = 'ANSWERED';
  }

  const updated = await prisma.supportQuestion.update({
    where: { id: current.id },
    data: {
      answerText: nextAnswer ?? null,
      answerAuthorId: body.answerText !== undefined && body.answerText?.trim() ? req.user!.id : current.answerAuthorId,
      answeredAt: body.answerText !== undefined && body.answerText?.trim() ? now : current.answeredAt,
      status: nextStatus,
      closedAt: nextStatus === 'CLOSED' || nextStatus === 'ARCHIVED' ? (current.closedAt ?? now) : null,
      archivedAt: nextStatus === 'ARCHIVED' ? now : null,
    },
    include: {
      author: { select: USER_SELECT },
      answerAuthor: { select: USER_SELECT },
      likes: { where: { userId: req.user!.id }, select: { id: true } },
      _count: { select: { likes: true } },
    },
  });

  await trackAnalyticsEvent({
    userId: req.user!.id,
    type: 'ACTION',
    path: '/admin',
    pageLabel: 'Админ панель',
    actionKey: 'support_question_updated',
    metadata: { questionId: current.id, status: nextStatus, hasAnswer: Boolean(nextAnswer && nextAnswer.trim()) },
  });
  res.json({ question: normalizeQuestion(updated), ok: true });
}));

export default router;
