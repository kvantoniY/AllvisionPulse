"use client";

import Link from "next/link";
import { ComponentProps, FormEvent, useDeferredValue, useEffect, useMemo, useState } from "react";
import styles from "./Support.module.css";
import { Button } from "@/shared/ui/Button/Button";
import { AdminBadge } from "@/shared/ui/AdminBadge/AdminBadge";
import { Icon } from "@/shared/ui/Icon/Icon";
import { useGetMeQuery } from "@/shared/api/usersApi";
import {
  useCreateSupportQuestionMutation,
  useCreateSupportTicketMutation,
  useGetMySupportTicketsQuery,
  useGetSupportQuestionsQuery,
  useLikeSupportQuestionMutation,
  useUnlikeSupportQuestionMutation,
} from "@/shared/api/supportApi";
import type {
  SupportQuestion,
  SupportQuestionStatus,
  SupportTicket,
  SupportTicketKind,
  SupportTicketStatus,
} from "@/shared/types/support";

type SupportView = "tickets" | "questions";
type TicketFilter = "ALL" | SupportTicketStatus;
type QuestionFilter = "ALL" | "UNANSWERED" | "ANSWERED" | "ARCHIVED";
type IconName = ComponentProps<typeof Icon>["name"];

type TicketCategoryOption = {
  id: string;
  label: string;
  description: string;
  icon: IconName;
};

const ticketStatusLabel: Record<SupportTicketStatus, string> = {
  OPEN: "Ожидает",
  IN_REVIEW: "В работе",
  CLOSED: "Закрыт",
};

const questionStatusLabel: Record<SupportQuestionStatus, string> = {
  OPEN: "Ждёт ответа",
  ANSWERED: "Есть ответ",
  CLOSED: "Закрыт",
  ARCHIVED: "В архиве",
};

const problemCategories: TicketCategoryOption[] = [
  { id: "auth", label: "Аккаунт и вход", description: "Доступ, пароли, восстановление и ошибки авторизации.", icon: "shield" },
  { id: "profile", label: "Профиль и настройки", description: "Аватар, данные профиля и параметры приложения.", icon: "user" },
  { id: "messages", label: "Чаты и сообщения", description: "Диалоги, вложения и уведомления о переписке.", icon: "messages" },
  { id: "calls", label: "Звонки и медиа", description: "Камера, микрофон, звук и демонстрация экрана.", icon: "video" },
  { id: "feed", label: "Лента и активность", description: "Посты, реакции, подписки и поведение ленты.", icon: "pulse" },
  { id: "notifications", label: "Уведомления", description: "Push, email, пропущенные события и бейджи.", icon: "bell" },
  { id: "other", label: "Другое", description: "Если тема не подходит ни под одну категорию выше.", icon: "support" },
];

const ideaCategories: TicketCategoryOption[] = [
  { id: "ux", label: "Интерфейс и UX", description: "Что можно упростить, ускорить или сделать понятнее.", icon: "sparkles" },
  { id: "messages", label: "Сообщения", description: "Улучшения для переписки, вложений и списка диалогов.", icon: "messages" },
  { id: "calls", label: "Звонки", description: "Новые сценарии для видео, аудио и совместной работы.", icon: "video" },
  { id: "feed", label: "Лента и контент", description: "Идеи для постов, реакций, рекомендаций и подписок.", icon: "pulse" },
  { id: "product", label: "Новый функционал", description: "Любое предложение, которое может усилить продукт.", icon: "flame" },
];

const ticketGuide = [
  {
    title: "Коротко назовите тему",
    text: "Если заголовка нет, подставим выбранную категорию.",
  },
  {
    title: "Опишите шаги и ожидания",
    text: "Что сделали, что увидели и что ожидали.",
  },
  {
    title: "Следите за историей справа",
    text: "Статусы и ответы останутся в одном потоке.",
  },
];

const questionGuide = [
  {
    title: "Формулируйте вопрос как для другого пользователя",
    text: "Без личных данных и привязки к приватной переписке.",
  },
  {
    title: "Добавьте детали, если они помогают",
    text: "Коротко укажите, что уже пробовали.",
  },
  {
    title: "Проверьте похожие темы справа",
    text: "Так вы не создадите дубликат, если ответ уже есть.",
  },
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function excerpt(value?: string | null, maxLength = 220) {
  const normalized = value?.trim() ?? "";
  if (!normalized) return "";
  if (normalized.length <= maxLength) return normalized;
  return `${normalized.slice(0, maxLength).trimEnd()}…`;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  if (!error || typeof error !== "object") return fallback;

  if ("data" in error && error.data && typeof error.data === "object") {
    const message = (error.data as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message;
  }

  if ("error" in error && typeof error.error === "string" && error.error.trim()) {
    return error.error;
  }

  return fallback;
}

function matchesSearch(values: Array<string | null | undefined>, query: string) {
  const normalized = query.trim().toLowerCase();
  if (!normalized) return true;
  return values.some((value) => value?.toLowerCase().includes(normalized));
}

function byRecentDate<T extends { updatedAt: string }>(left: T, right: T) {
  return new Date(right.updatedAt).getTime() - new Date(left.updatedAt).getTime();
}

function ticketStatusClass(status: SupportTicketStatus) {
  if (status === "OPEN") return `${styles.status} ${styles.statusOpen}`;
  if (status === "IN_REVIEW") return `${styles.status} ${styles.statusReview}`;
  return `${styles.status} ${styles.statusClosed}`;
}

function questionStatusClass(status: SupportQuestionStatus) {
  if (status === "OPEN") return `${styles.status} ${styles.statusOpen}`;
  if (status === "ANSWERED") return `${styles.status} ${styles.statusReview}`;
  if (status === "CLOSED") return `${styles.status} ${styles.statusClosed}`;
  return `${styles.status} ${styles.statusArchived}`;
}

function questionHasAnswer(question: SupportQuestion) {
  return Boolean(question.answerText?.trim()) || question.status === "ANSWERED" || question.status === "CLOSED";
}

function SummaryCard({
  icon,
  value,
  label,
  meta,
}: {
  icon: IconName;
  value: string;
  label: string;
  meta: string;
}) {
  return (
    <div className={styles.summaryCard}>
      <div className={styles.summaryIcon}>
        <Icon name={icon} size={18} />
      </div>
      <div className={styles.summaryValue}>{value}</div>
      <div className={styles.summaryLabel}>{label}</div>
      <div className={styles.summaryMeta}>{meta}</div>
    </div>
  );
}

function ModeCard({
  active,
  icon,
  title,
  text,
  meta,
  count,
  onClick,
}: {
  active: boolean;
  icon: IconName;
  title: string;
  text: string;
  meta: string;
  count: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={`${styles.modeCard} ${active ? styles.modeCardActive : ""}`}
      onClick={onClick}
      aria-pressed={active}
    >
      <span className={styles.modeIcon}>
        <Icon name={icon} size={20} />
      </span>
      <div className={styles.modeContent}>
        <div className={styles.modeTitleRow}>
          <span className={styles.modeTitle}>{title}</span>
          <span className={styles.modeCount}>{count}</span>
        </div>
        <span className={styles.modeText}>{text}</span>
        <span className={styles.modeMeta}>{meta}</span>
      </div>
    </button>
  );
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  const replies = [...ticket.replies].sort((left, right) => new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime());

  return (
    <article className={styles.ticketItem}>
      <div className={styles.itemHead}>
        <div className={styles.itemTitleWrap}>
          <div className={styles.inlineMeta}>
            <span className={styles.kindChip}>{ticket.kind === "PROBLEM" ? "Проблема" : "Идея / улучшение"}</span>
            {ticket.category ? <span className={styles.categoryChip}>{ticket.category}</span> : null}
          </div>
          <h3 className={styles.itemTitle}>{ticket.subject}</h3>
        </div>
        <span className={ticketStatusClass(ticket.status)}>{ticketStatusLabel[ticket.status]}</span>
      </div>

      <div className={styles.itemBody}>{ticket.description}</div>

      <div className={styles.meta}>
        <span>Создан: {formatDate(ticket.createdAt)}</span>
        <span>Обновлён: {formatDate(ticket.updatedAt)}</span>
        {ticket.lastReplyAt ? <span>Последний ответ: {formatDate(ticket.lastReplyAt)}</span> : null}
      </div>

      {replies.length ? (
        <div className={styles.ticketReplyList}>
          {replies.map((reply) => (
            <div key={reply.id} className={styles.replyItem}>
              <div className={styles.metaRow}>
                <span className={styles.actorLink}>
                  @{reply.author.username}
                  <AdminBadge role={reply.author.role} username={reply.author.username} />
                </span>
                <span className={styles.muted}>{formatDate(reply.createdAt)}</span>
              </div>
              <div className={styles.itemBody}>{reply.text}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.note}>Ответов пока нет. Когда администратор напишет, переписка появится здесь.</div>
      )}
    </article>
  );
}

function QuestionCard({
  question,
  onToggleLike,
  isLikeLoading,
}: {
  question: SupportQuestion;
  onToggleLike: (question: SupportQuestion) => void;
  isLikeLoading: boolean;
}) {
  const hasAnswer = questionHasAnswer(question);

  return (
    <article className={styles.questionItem}>
      <div className={styles.questionRow}>
        <div className={styles.questionMain}>
          <div className={styles.itemHead}>
            <div className={styles.itemTitleWrap}>
              <div className={styles.inlineMeta}>
                <span className={questionStatusClass(question.status)}>{questionStatusLabel[question.status]}</span>
                {hasAnswer ? <span className={styles.metricPill}>Официальный ответ</span> : null}
              </div>
              <Link href={`/support/questions/${question.id}`} className={styles.questionLink}>
                {question.title}
              </Link>
            </div>
          </div>

          <div className={styles.meta}>
            <span>Автор: @{question.author.username}</span>
            <span>Создан: {formatDate(question.createdAt)}</span>
            <span>Лайков: {question.likesCount}</span>
          </div>

          {question.body ? <div className={styles.itemBody}>{excerpt(question.body, 280)}</div> : null}

          {question.answerText ? (
            <div className={styles.answerPreview}>
              <div className={styles.metaRow}>
                <span className={styles.actorLink}>
                  {question.answerAuthor?.username ?? "Администратор"}
                  <AdminBadge role={question.answerAuthor?.role ?? "ADMIN"} username={question.answerAuthor?.username} />
                </span>
                <span className={styles.muted}>{formatDate(question.answeredAt)}</span>
              </div>
              <div className={styles.answerExcerpt}>{excerpt(question.answerText, 240)}</div>
            </div>
          ) : null}

          <div className={styles.inlineActions}>
            <Link href={`/support/questions/${question.id}`} className={styles.actorLink}>
              Открыть полностью
            </Link>
            {question.archivedAt ? <span className={styles.hint}>В архиве с {formatDate(question.archivedAt)}</span> : null}
          </div>
        </div>

        <Button
          size="sm"
          className={styles.likeButton}
          variant={question.viewerLiked ? "primary" : "default"}
          onClick={() => onToggleLike(question)}
          loading={isLikeLoading}
        >
          {question.viewerLiked ? `Поддержали · ${question.likesCount}` : `Поддержать · ${question.likesCount}`}
        </Button>
      </div>
    </article>
  );
}

export default function SupportPage() {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const isAdmin = me?.role === "ADMIN";

  const [view, setView] = useState<SupportView>("tickets");
  const [ticketKind, setTicketKind] = useState<SupportTicketKind>("PROBLEM");
  const [ticketCategoryId, setTicketCategoryId] = useState(problemCategories[0].id);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketFilter, setTicketFilter] = useState<TicketFilter>("ALL");
  const [ticketError, setTicketError] = useState("");
  const [ticketSuccess, setTicketSuccess] = useState("");

  const [questionTitle, setQuestionTitle] = useState("");
  const [questionBody, setQuestionBody] = useState("");
  const [questionSearch, setQuestionSearch] = useState("");
  const deferredQuestionSearch = useDeferredValue(questionSearch);
  const [questionFilter, setQuestionFilter] = useState<QuestionFilter>("ALL");
  const [questionError, setQuestionError] = useState("");
  const [questionSuccess, setQuestionSuccess] = useState("");
  const [likingId, setLikingId] = useState<string | null>(null);

  const { data: ticketsData, isLoading: ticketsLoading, isError: ticketsLoadError } = useGetMySupportTicketsQuery();
  const { data: questionsData, isLoading: questionsLoading, isError: questionsLoadError } = useGetSupportQuestionsQuery(
    deferredQuestionSearch.trim() ? { q: deferredQuestionSearch.trim() } : undefined,
  );
  const [createTicket, { isLoading: creatingTicket }] = useCreateSupportTicketMutation();
  const [createQuestion, { isLoading: creatingQuestion }] = useCreateSupportQuestionMutation();
  const [likeQuestion] = useLikeSupportQuestionMutation();
  const [unlikeQuestion] = useUnlikeSupportQuestionMutation();

  const ticketCategories = ticketKind === "PROBLEM" ? problemCategories : ideaCategories;

  useEffect(() => {
    if (!ticketCategories.some((option) => option.id === ticketCategoryId)) {
      setTicketCategoryId(ticketCategories[0]?.id ?? "");
    }
  }, [ticketCategories, ticketCategoryId]);

  const tickets = ticketsData?.items ?? [];
  const activeQuestions = questionsData?.active ?? [];
  const archivedQuestions = questionsData?.archived ?? [];
  const allQuestions = questionsData?.items ?? [];

  const selectedTicketCategory = ticketCategories.find((option) => option.id === ticketCategoryId) ?? ticketCategories[0];

  const ticketCounts = useMemo(() => {
    const open = tickets.filter((ticket) => ticket.status === "OPEN").length;
    const inReview = tickets.filter((ticket) => ticket.status === "IN_REVIEW").length;
    const closed = tickets.filter((ticket) => ticket.status === "CLOSED").length;

    return {
      total: tickets.length,
      open,
      inReview,
      closed,
      active: open + inReview,
    };
  }, [tickets]);

  const questionCounts = useMemo(() => {
    const answered = allQuestions.filter(questionHasAnswer).length;
    const open = allQuestions.filter((question) => question.status === "OPEN").length;

    return {
      total: allQuestions.length,
      answered,
      open,
      active: activeQuestions.length,
      archived: archivedQuestions.length,
    };
  }, [activeQuestions.length, allQuestions, archivedQuestions.length]);

  const visibleTickets = useMemo(() => {
    return [...tickets]
      .sort(byRecentDate)
      .filter((ticket) => (ticketFilter === "ALL" ? true : ticket.status === ticketFilter))
      .filter((ticket) =>
        matchesSearch(
          [ticket.subject, ticket.description, ticket.category, ...ticket.replies.map((reply) => reply.text)],
          ticketSearch,
        ),
      );
  }, [ticketFilter, ticketSearch, tickets]);

  const visibleActiveQuestions = useMemo(() => {
    const sorted = [...activeQuestions].sort((left, right) => {
      const leftAnswered = questionHasAnswer(left);
      const rightAnswered = questionHasAnswer(right);
      if (leftAnswered !== rightAnswered) return Number(rightAnswered) - Number(leftAnswered);
      if (left.likesCount !== right.likesCount) return right.likesCount - left.likesCount;
      return byRecentDate(left, right);
    });

    if (questionFilter === "ARCHIVED") return [];
    if (questionFilter === "UNANSWERED") return sorted.filter((question) => !questionHasAnswer(question));
    if (questionFilter === "ANSWERED") return sorted.filter(questionHasAnswer);
    return sorted;
  }, [activeQuestions, questionFilter]);

  const visibleArchivedQuestions = useMemo(() => {
    const sorted = [...archivedQuestions].sort(byRecentDate);

    if (questionFilter === "UNANSWERED") return [];
    if (questionFilter === "ANSWERED") return sorted.filter(questionHasAnswer);
    return sorted;
  }, [archivedQuestions, questionFilter]);

  const handleSubmitTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTicketError("");
    setTicketSuccess("");

    const description = ticketDescription.trim();
    const subject = ticketSubject.trim() || selectedTicketCategory?.label || "Новое обращение";

    if (description.length < 16) {
      setTicketError("Опишите ситуацию чуть подробнее: что произошло, как повторить и что вы ожидали увидеть.");
      return;
    }

    try {
      await createTicket({
        kind: ticketKind,
        subject,
        description,
        category: selectedTicketCategory?.label ?? null,
      }).unwrap();

      setTicketSubject("");
      setTicketDescription("");
      setTicketSuccess("Тикет создан. Он сразу появился в истории справа, дальше ответы будут приходить туда же.");
    } catch (error) {
      setTicketError(getApiErrorMessage(error, "Не получилось создать тикет. Попробуйте ещё раз."));
    }
  };

  const handleSubmitQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuestionError("");
    setQuestionSuccess("");

    const title = questionTitle.trim();
    const body = questionBody.trim();

    if (title.length < 5) {
      setQuestionError("Сформулируйте вопрос минимум в 5 символов, чтобы по нему можно было найти ответ.");
      return;
    }

    try {
      await createQuestion({
        title,
        body: body || undefined,
      }).unwrap();

      setQuestionTitle("");
      setQuestionBody("");
      setQuestionSuccess("Вопрос опубликован. Если администрация добавит официальный ответ, он появится в базе и по ссылке.");
    } catch (error) {
      setQuestionError(getApiErrorMessage(error, "Не получилось опубликовать вопрос. Попробуйте ещё раз."));
    }
  };

  const handleToggleQuestionLike = async (question: SupportQuestion) => {
    if (likingId) return;

    setLikingId(question.id);
    try {
      if (question.viewerLiked) {
        await unlikeQuestion({ questionId: question.id }).unwrap();
      } else {
        await likeQuestion({ questionId: question.id }).unwrap();
      }
    } finally {
      setLikingId(null);
    }
  };

  return (
    <div className="container appPage">
      <div className={styles.page}>
        <section className={styles.heroShell}>
          <div className={styles.heroHeader}>
            <span className={styles.heroKicker}>техподдержка</span>
            <h1 className={styles.heroTitle}>Техподдержка</h1>
            <p className={styles.heroText}>Личные вопросы решаем в тикетах. Общие ответы собираем в публичной базе.</p>
          </div>

          <div className={styles.summaryGrid}>
            <SummaryCard
              icon="messages"
              value={String(ticketCounts.total)}
              label="Личные тикеты"
              meta={`Открыто ${ticketCounts.open} · В работе ${ticketCounts.inReview}`}
            />
            <SummaryCard
              icon="clock"
              value={String(ticketCounts.active)}
              label="Сейчас активны"
              meta="Личные обращения, где ещё идёт работа"
            />
            <SummaryCard
              icon="comment"
              value={String(questionCounts.answered)}
              label="Вопросов с ответом"
              meta={`Активных ${questionCounts.active} · В архиве ${questionCounts.archived}`}
            />
          </div>
        </section>

        <div className={styles.modeGrid}>
          <ModeCard
            active={view === "tickets"}
            icon="shield"
            title="Личный тикет"
            text="Ошибки, доступ, баги и приватные обращения."
            meta="Только вы и администрация."
            count={`${ticketCounts.total}`}
            onClick={() => setView("tickets")}
          />
          <ModeCard
            active={view === "questions"}
            icon="sparkles"
            title="Публичный вопрос"
            text="Общие вопросы, где ответ пригодится другим."
            meta="Ответ увидят все."
            count={`${questionCounts.total}`}
            onClick={() => setView("questions")}
          />
        </div>

        {isAdmin ? (
          <div className={styles.adminNotice}>
            <Icon name="shield" size={16} />
            <span>
              Вы смотрите пользовательский сценарий. Очередь тикетов и модерация публичных вопросов доступны в{" "}
              <Link href="/admin" className={styles.actorLink}>
                админ-панели
              </Link>
              .
            </span>
          </div>
        ) : null}

        <div className={styles.workspace}>
          <aside className={styles.composerShell}>
            <div className={styles.stickyShell}>
              {view === "tickets" ? (
                <>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionEyebrow}>личный канал</span>
                    <div className={styles.sectionTitleRow}>
                      <h2 className={styles.sectionTitle}>Создайте тикет</h2>
                      <span className={styles.sectionBadge}>{selectedTicketCategory?.label}</span>
                    </div>
                    <p className={styles.sectionText}>Опишите ситуацию коротко и по делу. Ответы и статусы будут справа.</p>
                  </div>

                  <div className={styles.guideGrid}>
                    {ticketGuide.map((item, index) => (
                      <div key={item.title} className={styles.guideItem}>
                        <span className={styles.guideIndex}>{index + 1}</span>
                        <div className={styles.guideCardTitle}>{item.title}</div>
                        <div className={styles.guideCardText}>{item.text}</div>
                      </div>
                    ))}
                  </div>

                  <form className={styles.form} onSubmit={handleSubmitTicket}>
                    <div className={styles.kindToggle}>
                      <button
                        type="button"
                        className={`${styles.kindButton} ${ticketKind === "PROBLEM" ? styles.kindButtonActive : ""}`}
                        onClick={() => setTicketKind("PROBLEM")}
                      >
                        Проблема
                      </button>
                      <button
                        type="button"
                        className={`${styles.kindButton} ${ticketKind === "IDEA" ? styles.kindButtonActive : ""}`}
                        onClick={() => setTicketKind("IDEA")}
                      >
                        Идея / улучшение
                      </button>
                    </div>

                    <label className={styles.field}>
                      <span className={styles.label}>Категория</span>
                      <div className={styles.categoryGrid}>
                        {ticketCategories.map((option) => (
                          <button
                            key={option.id}
                            type="button"
                            className={`${styles.categoryButton} ${
                              ticketCategoryId === option.id ? styles.categoryButtonActive : ""
                            }`}
                            onClick={() => setTicketCategoryId(option.id)}
                          >
                            <span className={styles.categoryIcon}>
                              <Icon name={option.icon} size={16} />
                            </span>
                            <span className={styles.categoryContent}>
                              <span className={styles.categoryTitle}>{option.label}</span>
                              <span className={styles.categoryDescription}>{option.description}</span>
                            </span>
                          </button>
                        ))}
                      </div>
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>
                        Короткий заголовок
                        <span className={styles.labelHint}>необязательно</span>
                      </span>
                      <input
                        className={styles.input}
                        value={ticketSubject}
                        onChange={(event) => setTicketSubject(event.target.value.slice(0, 120))}
                        placeholder={`Например: ${
                          ticketKind === "PROBLEM"
                            ? "Не приходят push-уведомления на iPhone"
                            : "Сделать тише анимацию входящего звонка"
                        }`}
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>Что произошло</span>
                      <textarea
                        className={styles.textarea}
                        rows={5}
                        value={ticketDescription}
                        onChange={(event) => setTicketDescription(event.target.value.slice(0, 3000))}
                        placeholder="Что вы делали, что увидели и какой результат ожидали. Если есть условия воспроизведения, перечислите их по шагам."
                      />
                    </label>

                    <div className={styles.helperRow}>
                      <span className={styles.helper}>
                        Если заголовок не заполнить, мы используем выбранную категорию как тему обращения.
                      </span>
                      <span className={styles.counter}>{ticketDescription.length}/3000</span>
                    </div>

                    {ticketError ? <div className={styles.validationError}>{ticketError}</div> : null}
                    {ticketSuccess ? <div className={styles.validationSuccess}>{ticketSuccess}</div> : null}

                    <div className={styles.submitRow}>
                      <Button type="submit" variant="primary" loading={creatingTicket}>
                        Создать тикет
                      </Button>
                      <span className={styles.submitHint}>
                        Личное обращение не попадёт в публичную базу и останется приватным.
                      </span>
                    </div>
                  </form>
                </>
              ) : (
                <>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionEyebrow}>публичная база</span>
                    <div className={styles.sectionTitleRow}>
                      <h2 className={styles.sectionTitle}>Задайте вопрос для всех</h2>
                      <span className={styles.sectionBadge}>{questionCounts.active} активных</span>
                    </div>
                    <p className={styles.sectionText}>Публикуйте только общие вопросы без личных данных и приватного контекста.</p>
                  </div>

                  <div className={styles.guideGrid}>
                    {questionGuide.map((item, index) => (
                      <div key={item.title} className={styles.guideItem}>
                        <span className={styles.guideIndex}>{index + 1}</span>
                        <div className={styles.guideCardTitle}>{item.title}</div>
                        <div className={styles.guideCardText}>{item.text}</div>
                      </div>
                    ))}
                  </div>

                  <form className={styles.form} onSubmit={handleSubmitQuestion}>
                    <label className={styles.field}>
                      <span className={styles.label}>Вопрос</span>
                      <input
                        className={styles.input}
                        value={questionTitle}
                        onChange={(event) => setQuestionTitle(event.target.value.slice(0, 140))}
                        placeholder="Например: как восстановить доступ, если старая почта больше недоступна?"
                      />
                    </label>

                    <label className={styles.field}>
                      <span className={styles.label}>
                        Детали
                        <span className={styles.labelHint}>необязательно</span>
                      </span>
                      <textarea
                        className={styles.textarea}
                        rows={5}
                        value={questionBody}
                        onChange={(event) => setQuestionBody(event.target.value.slice(0, 1200))}
                        placeholder="Опишите контекст, какие шаги уже пробовали и что именно осталось непонятным."
                      />
                    </label>

                    <div className={styles.helperRow}>
                      <span className={styles.helper}>
                        Чем яснее формулировка, тем выше шанс, что вопрос найдут и поддержат другие пользователи.
                      </span>
                      <span className={styles.counter}>{questionBody.length}/1200</span>
                    </div>

                    {questionError ? <div className={styles.validationError}>{questionError}</div> : null}
                    {questionSuccess ? <div className={styles.validationSuccess}>{questionSuccess}</div> : null}

                    <div className={styles.submitRow}>
                      <Button type="submit" variant="primary" loading={creatingQuestion}>
                        Опубликовать вопрос
                      </Button>
                      <span className={styles.submitHint}>Официальный ответ публикует только администрация.</span>
                    </div>
                  </form>
                </>
              )}
            </div>
          </aside>

          <section className={styles.resultsShell}>
            {view === "tickets" ? (
              <>
                <div className={styles.toolbar}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionEyebrow}>история</span>
                    <div className={styles.sectionTitleRow}>
                      <h2 className={styles.sectionTitle}>Мои тикеты</h2>
                      <span className={styles.sectionBadge}>{visibleTickets.length} в списке</span>
                    </div>
                    <p className={styles.sectionText}>Поиск работает по теме, описанию и ответам администрации.</p>
                  </div>

                  <label className={styles.searchField}>
                    <Icon name="search" size={18} className={styles.searchIcon} />
                    <input
                      className={styles.search}
                      value={ticketSearch}
                      onChange={(event) => setTicketSearch(event.target.value)}
                      placeholder="Поиск по теме, описанию или ответу"
                    />
                  </label>

                  <div className={styles.filterBar}>
                    {[
                      { value: "ALL" as const, label: `Все · ${ticketCounts.total}` },
                      { value: "OPEN" as const, label: `Ожидают · ${ticketCounts.open}` },
                      { value: "IN_REVIEW" as const, label: `В работе · ${ticketCounts.inReview}` },
                      { value: "CLOSED" as const, label: `Закрыты · ${ticketCounts.closed}` },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.filterChip} ${ticketFilter === option.value ? styles.filterChipActive : ""}`}
                        onClick={() => setTicketFilter(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {ticketsLoading ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>
                      <Icon name="clock" size={20} />
                    </div>
                    <div className={styles.emptyStateTitle}>Загружаем обращения</div>
                    <div className={styles.emptyStateText}>Собираем ваши тикеты и историю ответов.</div>
                  </div>
                ) : ticketsLoadError ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>
                      <Icon name="support" size={20} />
                    </div>
                    <div className={styles.emptyStateTitle}>Не удалось загрузить тикеты</div>
                    <div className={styles.emptyStateText}>Обновите страницу или попробуйте зайти чуть позже.</div>
                  </div>
                ) : visibleTickets.length ? (
                  <div className={styles.list}>
                    {visibleTickets.map((ticket) => (
                      <TicketCard key={ticket.id} ticket={ticket} />
                    ))}
                  </div>
                ) : (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>
                      <Icon name="messages" size={20} />
                    </div>
                    <div className={styles.emptyStateTitle}>
                      {tickets.length ? "По текущим фильтрам ничего не найдено" : "У вас пока нет личных тикетов"}
                    </div>
                    <div className={styles.emptyStateText}>
                      {tickets.length
                        ? "Сбросьте поиск или переключите статус, чтобы увидеть остальные обращения."
                        : "Создайте первое обращение слева. История ответов появится в этом блоке автоматически."}
                    </div>
                  </div>
                )}
              </>
            ) : (
              <>
                <div className={styles.toolbar}>
                  <div className={styles.sectionHeader}>
                    <span className={styles.sectionEyebrow}>база ответов</span>
                    <div className={styles.sectionTitleRow}>
                      <h2 className={styles.sectionTitle}>Популярные вопросы</h2>
                      <span className={styles.sectionBadge}>
                        {questionCounts.active} активных · {questionCounts.archived} в архиве
                      </span>
                    </div>
                    <p className={styles.sectionText}>Сначала показываем вопросы с ответом, поддержкой и свежими обновлениями.</p>
                  </div>

                  <label className={styles.searchField}>
                    <Icon name="search" size={18} className={styles.searchIcon} />
                    <input
                      className={styles.search}
                      value={questionSearch}
                      onChange={(event) => setQuestionSearch(event.target.value)}
                      placeholder="Поиск по вопросу, описанию или ответу"
                    />
                  </label>

                  <div className={styles.filterBar}>
                    {[
                      { value: "ALL" as const, label: `Все · ${questionCounts.total}` },
                      { value: "UNANSWERED" as const, label: `Без ответа · ${questionCounts.open}` },
                      { value: "ANSWERED" as const, label: `С ответом · ${questionCounts.answered}` },
                      { value: "ARCHIVED" as const, label: `Архив · ${questionCounts.archived}` },
                    ].map((option) => (
                      <button
                        key={option.value}
                        type="button"
                        className={`${styles.filterChip} ${
                          questionFilter === option.value ? styles.filterChipActive : ""
                        }`}
                        onClick={() => setQuestionFilter(option.value)}
                      >
                        {option.label}
                      </button>
                    ))}
                  </div>
                </div>

                {questionsLoading ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>
                      <Icon name="search" size={20} />
                    </div>
                    <div className={styles.emptyStateTitle}>Обновляем базу вопросов</div>
                    <div className={styles.emptyStateText}>Загружаем актуальные вопросы и ответы администрации.</div>
                  </div>
                ) : questionsLoadError ? (
                  <div className={styles.emptyState}>
                    <div className={styles.emptyStateIcon}>
                      <Icon name="support" size={20} />
                    </div>
                    <div className={styles.emptyStateTitle}>Не удалось загрузить вопросы</div>
                    <div className={styles.emptyStateText}>Проверьте соединение или повторите попытку чуть позже.</div>
                  </div>
                ) : (
                  <>
                    {visibleActiveQuestions.length ? (
                      <div className={styles.list}>
                        {visibleActiveQuestions.map((question) => (
                          <QuestionCard
                            key={question.id}
                            question={question}
                            isLikeLoading={likingId === question.id}
                            onToggleLike={handleToggleQuestionLike}
                          />
                        ))}
                      </div>
                    ) : (
                      <div className={styles.emptyState}>
                        <div className={styles.emptyStateIcon}>
                          <Icon name="comment" size={20} />
                        </div>
                        <div className={styles.emptyStateTitle}>
                          {questionSearch.trim() ? "Поиск не нашёл активных вопросов" : "Активных вопросов пока нет"}
                        </div>
                        <div className={styles.emptyStateText}>
                          Попробуйте другой запрос, переключите фильтр или опубликуйте новый вопрос слева.
                        </div>
                      </div>
                    )}

                    {visibleArchivedQuestions.length ? (
                      <details className={styles.archive} open={questionFilter === "ARCHIVED"}>
                        <summary className={styles.archiveSummary}>
                          Архив вопросов ({visibleArchivedQuestions.length})
                        </summary>
                        <div className={styles.list}>
                          {visibleArchivedQuestions.map((question) => (
                            <QuestionCard
                              key={question.id}
                              question={question}
                              isLikeLoading={likingId === question.id}
                              onToggleLike={handleToggleQuestionLike}
                            />
                          ))}
                        </div>
                      </details>
                    ) : null}
                  </>
                )}
              </>
            )}
          </section>
        </div>
      </div>
    </div>
  );
}
