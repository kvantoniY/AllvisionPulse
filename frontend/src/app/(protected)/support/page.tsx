"use client";

import Link from "next/link";
import { FormEvent, useEffect, useMemo, useState } from "react";
import styles from "./Support.module.css";
import { Card, CardHeader } from "@/shared/ui/Card/Card";
import { Button } from "@/shared/ui/Button/Button";
import { AdminBadge } from "@/shared/ui/AdminBadge/AdminBadge";
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
type TicketCategoryOption = { id: string; label: string };

const ticketStatusLabel: Record<SupportTicketStatus, string> = {
  OPEN: "Ожидается",
  IN_REVIEW: "Принят на рассмотрение",
  CLOSED: "Закрыт",
};

const questionStatusLabel: Record<SupportQuestionStatus, string> = {
  OPEN: "Открыт",
  ANSWERED: "Есть ответ",
  CLOSED: "Закрыт",
  ARCHIVED: "В архиве",
};

const problemCategories: TicketCategoryOption[] = [
  { id: "ACCOUNT", label: "Аккаунт и вход" },
  { id: "PROFILE", label: "Профиль и настройки" },
  { id: "MESSAGES", label: "Чаты и сообщения" },
  { id: "CALLS", label: "Звонки и медиа" },
  { id: "POSTS", label: "Посты и лента" },
  { id: "NOTIFICATIONS", label: "Уведомления" },
  { id: "OTHER", label: "Другое" },
];

const ideaCategories: TicketCategoryOption[] = [
  { id: "UX", label: "Удобство интерфейса" },
  { id: "PROFILE", label: "Профиль и настройки" },
  { id: "MESSAGES", label: "Чаты и сообщения" },
  { id: "CALLS", label: "Звонки и медиа" },
  { id: "POSTS", label: "Посты и лента" },
  { id: "FEATURE", label: "Новая функция" },
  { id: "OTHER", label: "Другое" },
];

const ticketGuide = [
  "Укажите, где именно возникла проблема: профиль, сообщения, звонки, лента и т.д.",
  "Опишите, как повторить ошибку, и что вы ожидали увидеть вместо этого.",
  "Для идей добавьте, чем улучшение поможет обычному пользователю и какой путь станет проще.",
];

const questionGuide = [
  "Чем больше лайков соберёт вопрос, тем выше он будет в списке.",
  "После ответа администратора вопрос остаётся доступным по ссылке и в поиске.",
  "После закрытия вопрос через 24 часа уходит в архив, но не пропадает из поиска.",
];

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status: SupportTicketStatus | SupportQuestionStatus) {
  if (status === "OPEN") return `${styles.status} ${styles.statusOpen}`;
  if (status === "IN_REVIEW" || status === "ANSWERED") return `${styles.status} ${styles.statusReview}`;
  if (status === "CLOSED") return `${styles.status} ${styles.statusClosed}`;
  return `${styles.status} ${styles.statusArchived}`;
}

function getApiErrorMessage(error: unknown, fallback: string) {
  const maybeData = (error as { data?: { message?: string; error?: string } })?.data;
  return maybeData?.message || maybeData?.error || fallback;
}

function TicketCard({ ticket }: { ticket: SupportTicket }) {
  return (
    <div className={styles.ticketItem}>
      <div className={styles.itemHead}>
        <div className={styles.itemTitleWrap}>
          <div className={styles.itemTitle}>{ticket.subject}</div>
          <div className={styles.inlineMeta}>
            <span className={styles.kindChip}>{ticket.kind === "PROBLEM" ? "Проблема" : "Идея"}</span>
            {ticket.category ? <span className={styles.categoryChip}>{ticket.category}</span> : null}
          </div>
        </div>
        <span className={statusClass(ticket.status)}>{ticketStatusLabel[ticket.status]}</span>
      </div>

      <div className={styles.meta}>
        <span>Создан: {formatDate(ticket.createdAt)}</span>
        <span>Обновлён: {formatDate(ticket.updatedAt)}</span>
        <span>Ответов: {ticket.replies.length}</span>
      </div>

      <div className={styles.itemBody}>{ticket.description}</div>

      {ticket.replies.length ? (
        <div className={styles.replies}>
          {ticket.replies.map((reply) => (
            <div key={reply.id} className={styles.replyItem}>
              <div className={styles.metaRow}>
                <Link className={styles.actorLink} href={`/profile/${reply.author.username}`}>
                  {reply.author.username}
                  <AdminBadge role={reply.author.role} />
                </Link>
                <span className={styles.muted}>{formatDate(reply.createdAt)}</span>
              </div>
              <div className={styles.itemBody}>{reply.text}</div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.muted}>Пока ответа нет. Как только администратор возьмёт обращение в работу, ответ появится здесь.</div>
      )}
    </div>
  );
}

function QuestionCard({
  question,
  onToggleLike,
  liking,
}: {
  question: SupportQuestion;
  onToggleLike: (question: SupportQuestion) => void;
  liking: boolean;
}) {
  return (
    <div className={styles.questionItem}>
      <div className={styles.questionRow}>
        <div className={styles.questionMain}>
          <div className={styles.itemHead}>
            <Link href={`/support/questions/${question.id}`} className={styles.questionLink}>
              {question.title}
            </Link>
            <span className={statusClass(question.status)}>{questionStatusLabel[question.status]}</span>
          </div>
          <div className={styles.meta}>
            <span>@{question.author.username}</span>
            <span>Создан: {formatDate(question.createdAt)}</span>
            <span>Лайков: {question.likesCount}</span>
          </div>
          <div className={styles.itemBody}>{question.body || "Автор не добавил расширенное описание к вопросу."}</div>
          {question.answerText ? (
            <div className={styles.answerPreview}>
              <div className={styles.metaRow}>
                <Link className={styles.actorLink} href={`/profile/${question.answerAuthor?.username ?? question.author.username}`}>
                  {question.answerAuthor?.username ?? "Администратор"}
                  <AdminBadge role={question.answerAuthor?.role ?? "ADMIN"} />
                </Link>
                <span className={styles.muted}>{formatDate(question.answeredAt)}</span>
              </div>
              <div className={styles.answerExcerpt}>{question.answerText}</div>
            </div>
          ) : null}
        </div>

        <Button
          className={styles.likeButton}
          variant={question.viewerLiked ? "default" : "primary"}
          onClick={() => onToggleLike(question)}
          loading={liking}
        >
          {question.viewerLiked ? `Убрать лайк · ${question.likesCount}` : `Лайк · ${question.likesCount}`}
        </Button>
      </div>
    </div>
  );
}

export default function SupportPage() {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;

  const [view, setView] = useState<SupportView>("tickets");
  const [ticketKind, setTicketKind] = useState<SupportTicketKind>("PROBLEM");
  const [ticketCategoryId, setTicketCategoryId] = useState(problemCategories[0].id);
  const [ticketSubject, setTicketSubject] = useState("");
  const [ticketDescription, setTicketDescription] = useState("");
  const [ticketError, setTicketError] = useState("");
  const [ticketSuccess, setTicketSuccess] = useState("");

  const [questionTitle, setQuestionTitle] = useState("");
  const [questionBody, setQuestionBody] = useState("");
  const [questionError, setQuestionError] = useState("");
  const [questionSuccess, setQuestionSuccess] = useState("");
  const [search, setSearch] = useState("");

  const ticketCategories = ticketKind === "PROBLEM" ? problemCategories : ideaCategories;
  const selectedCategory = ticketCategories.find((item) => item.id === ticketCategoryId) ?? ticketCategories[0];
  const isOtherCategory = selectedCategory.id === "OTHER";

  useEffect(() => {
    if (!ticketCategories.some((item) => item.id === ticketCategoryId)) {
      setTicketCategoryId(ticketCategories[0].id);
    }
  }, [ticketCategories, ticketCategoryId]);

  const { data: ticketsData, isFetching: ticketsFetching } = useGetMySupportTicketsQuery();
  const { data: questionsData, isFetching: questionsFetching } = useGetSupportQuestionsQuery(search.trim() ? { q: search.trim() } : undefined);
  const [createTicket, { isLoading: creatingTicket }] = useCreateSupportTicketMutation();
  const [createQuestion, { isLoading: creatingQuestion }] = useCreateSupportQuestionMutation();
  const [likeQuestion, { isLoading: likingQuestion }] = useLikeSupportQuestionMutation();
  const [unlikeQuestion, { isLoading: unlikingQuestion }] = useUnlikeSupportQuestionMutation();

  const tickets = ticketsData?.items ?? [];
  const activeQuestions = questionsData?.active ?? [];
  const archivedQuestions = questionsData?.archived ?? [];

  const ticketCounts = useMemo(() => ({
    total: tickets.length,
    open: tickets.filter((ticket) => ticket.status === "OPEN").length,
    review: tickets.filter((ticket) => ticket.status === "IN_REVIEW").length,
    closed: tickets.filter((ticket) => ticket.status === "CLOSED").length,
  }), [tickets]);

  const questionCounts = useMemo(() => ({
    active: activeQuestions.length,
    archived: archivedQuestions.length,
    answered: [...activeQuestions, ...archivedQuestions].filter((question) => question.answerText).length,
  }), [activeQuestions, archivedQuestions]);

  const ticketValidationText = useMemo(() => {
    if (isOtherCategory && ticketSubject.trim().length < 3) {
      return "Для категории «Другое» укажите тему обращения.";
    }
    if (ticketDescription.trim().length < 10) {
      return "Добавьте описание хотя бы на 10 символов, чтобы техподдержка могла помочь быстрее.";
    }
    return "";
  }, [isOtherCategory, ticketDescription, ticketSubject]);

  const questionValidationText = useMemo(() => {
    if (questionTitle.trim().length < 5) {
      return "Сформулируйте вопрос минимум в 5 символов.";
    }
    return "";
  }, [questionTitle]);

  const ticketResolvedSubject = useMemo(() => {
    if (isOtherCategory) return ticketSubject.trim();
    const details = ticketSubject.trim();
    return details ? `${selectedCategory.label} — ${details}` : selectedCategory.label;
  }, [isOtherCategory, selectedCategory.label, ticketSubject]);

  const handleCreateTicket = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setTicketError("");
    setTicketSuccess("");

    if (ticketValidationText) {
      setTicketError(ticketValidationText);
      return;
    }

    try {
      await createTicket({
        kind: ticketKind,
        category: selectedCategory.label,
        subject: ticketResolvedSubject,
        description: ticketDescription.trim(),
      }).unwrap();

      setTicketSubject("");
      setTicketDescription("");
      setTicketCategoryId(ticketCategories[0].id);
      setTicketSuccess("Тикет отправлен. Его статус появится в списке справа.");
    } catch (error) {
      setTicketError(getApiErrorMessage(error, "Не удалось отправить тикет. Попробуйте ещё раз."));
    }
  };

  const handleCreateQuestion = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setQuestionError("");
    setQuestionSuccess("");

    if (questionValidationText) {
      setQuestionError(questionValidationText);
      return;
    }

    try {
      await createQuestion({
        title: questionTitle.trim(),
        body: questionBody.trim() || null,
      }).unwrap();

      setQuestionTitle("");
      setQuestionBody("");
      setQuestionSuccess("Вопрос опубликован в общем списке и уже доступен для поиска и лайков.");
    } catch (error) {
      setQuestionError(getApiErrorMessage(error, "Не удалось опубликовать вопрос. Попробуйте ещё раз."));
    }
  };

  const handleToggleLike = async (question: SupportQuestion) => {
    if (question.viewerLiked) {
      await unlikeQuestion({ questionId: question.id }).unwrap().catch(() => null);
      return;
    }
    await likeQuestion({ questionId: question.id }).unwrap().catch(() => null);
  };

  const showingSearch = Boolean(search.trim());
  const questionSummary = showingSearch
    ? `Найдено ${activeQuestions.length + archivedQuestions.length} результатов`
    : `${activeQuestions.length} активных вопросов и ${archivedQuestions.length} в архиве`;

  return (
    <div className="container appPage">
      <div className={styles.page}>
        <Card className={styles.heroPanel}>
          <div className={styles.hero}>
            <div className={styles.heroCopy}>
              <div className={styles.heroTitle}>Тех поддержка</div>
              <div className={styles.heroText}>
                Здесь удобно отправлять личные обращения и смотреть общие ответы на популярные вопросы. Личный тикет видите только вы и администрация, а публичные вопросы помогают другим пользователям быстрее находить решение.
              </div>
            </div>
            <div className={styles.summaryGrid}>
              <div className={styles.summaryCard}>
                <div className={styles.summaryValue}>{ticketCounts.total}</div>
                <div className={styles.summaryLabel}>Ваших тикетов</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryValue}>{ticketCounts.open + ticketCounts.review}</div>
                <div className={styles.summaryLabel}>Активных обращений</div>
              </div>
              <div className={styles.summaryCard}>
                <div className={styles.summaryValue}>{questionCounts.active}</div>
                <div className={styles.summaryLabel}>Популярных вопросов</div>
              </div>
            </div>
            <div className={styles.heroFooter}>
              <div className={styles.viewSwitch}>
                <button
                  type="button"
                  className={[styles.switch, view === "tickets" ? styles.switchActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setView("tickets")}
                >
                  Личные тикеты
                </button>
                <button
                  type="button"
                  className={[styles.switch, view === "questions" ? styles.switchActive : ""].filter(Boolean).join(" ")}
                  onClick={() => setView("questions")}
                >
                  Популярные вопросы
                </button>
              </div>
              {me?.role === "ADMIN" ? (
                <div className={styles.hint}>Вы администратор. Очередь тикетов и модерация вопросов доступны в админ-панели, но здесь вы видите интерфейс пользователя.</div>
              ) : null}
            </div>
          </div>
        </Card>

        {view === "tickets" ? (
          <div className={styles.grid}>
            <div className={styles.stack}>
              <Card className={styles.panel}>
                <CardHeader title="Создать личный тикет" />
                <form className={styles.form} onSubmit={handleCreateTicket}>
                  <div className={styles.kindToggle}>
                    <button
                      type="button"
                      className={[styles.kindButton, ticketKind === "PROBLEM" ? styles.kindButtonActive : ""].filter(Boolean).join(" ")}
                      onClick={() => setTicketKind("PROBLEM")}
                    >
                      Проблема
                    </button>
                    <button
                      type="button"
                      className={[styles.kindButton, ticketKind === "IDEA" ? styles.kindButtonActive : ""].filter(Boolean).join(" ")}
                      onClick={() => setTicketKind("IDEA")}
                    >
                      Идея / улучшение
                    </button>
                  </div>

                  <div className={styles.field}>
                    <span className={styles.label}>Категория</span>
                    <div className={styles.categoryGrid}>
                      {ticketCategories.map((category) => (
                        <button
                          key={category.id}
                          type="button"
                          className={[styles.categoryButton, ticketCategoryId === category.id ? styles.categoryButtonActive : ""].filter(Boolean).join(" ")}
                          onClick={() => setTicketCategoryId(category.id)}
                        >
                          {category.label}
                        </button>
                      ))}
                    </div>
                  </div>

                  <label className={styles.field}>
                    <span className={styles.label}>{isOtherCategory ? "Тема обращения" : "Короткое уточнение"}</span>
                    <input
                      className={styles.input}
                      value={ticketSubject}
                      onChange={(event) => setTicketSubject(event.target.value.slice(0, 140))}
                      placeholder={isOtherCategory ? "Например: Не получается восстановить доступ" : "Например: не работают push-уведомления на iPhone"}
                    />
                    <span className={styles.helper}>
                      {isOtherCategory ? "Для категории «Другое» тема обязательна." : `Если оставить поле пустым, тикет уйдёт с темой «${selectedCategory.label}».`}
                    </span>
                  </label>

                  <label className={styles.field}>
                    <span className={styles.label}>Описание</span>
                    <textarea
                      className={styles.textarea}
                      rows={7}
                      value={ticketDescription}
                      onChange={(event) => setTicketDescription(event.target.value.slice(0, 5000))}
                      placeholder={ticketKind === "PROBLEM" ? "Что произошло, как повторить, что вы ожидали увидеть и на каком устройстве это случилось." : "Какую функцию или улучшение вы предлагаете, какую проблему это решит и кому будет полезно."}
                    />
                  </label>

                  <div className={styles.helperRow}>
                    <span className={ticketError || ticketValidationText ? styles.validationError : styles.helper}>
                      {ticketError || ticketValidationText || "Тикет отправится в личную очередь поддержки и будет виден только вам и администраторам."}
                    </span>
                    <span className={styles.counter}>{ticketDescription.trim().length}/5000</span>
                  </div>
                  {ticketSuccess ? <div className={styles.validationSuccess}>{ticketSuccess}</div> : null}

                  <div className={styles.inlineActions}>
                    <Button type="submit" variant="primary" loading={creatingTicket}>
                      Отправить тикет
                    </Button>
                    <span className={styles.hint}>Статусы: ожидается → принят на рассмотрение → закрыт.</span>
                  </div>
                  <div className={styles.guideBlock}>
                    <div className={styles.guideTitle}>Что ускорит ответ</div>
                    <div className={styles.tipsList}>
                      {ticketGuide.map((tip) => (
                        <div key={tip} className={styles.tipItem}>{tip}</div>
                      ))}
                    </div>
                  </div>
                </form>
              </Card>
            </div>

            <div className={styles.stack}>
              <Card className={styles.panel}>
                <CardHeader title="Мои тикеты" action={<span className={styles.meta}>{ticketCounts.total}</span>} />
                <div className={styles.metricsRow}>
                  <div className={styles.metricPill}>Ожидается: {ticketCounts.open}</div>
                  <div className={styles.metricPill}>В работе: {ticketCounts.review}</div>
                  <div className={styles.metricPill}>Закрыто: {ticketCounts.closed}</div>
                </div>
                {ticketsFetching ? <div className={styles.empty}>Обновляем ваши тикеты…</div> : null}
                {!ticketsFetching && !tickets.length ? <div className={styles.empty}>У вас пока нет обращений. Создайте первый тикет слева.</div> : null}
                {!!tickets.length ? (
                  <div className={styles.list}>
                    {tickets.map((ticket) => (
                      <TicketCard key={ticket.id} ticket={ticket} />
                    ))}
                  </div>
                ) : null}
              </Card>
            </div>
          </div>
        ) : (
          <div className={styles.grid}>
            <div className={styles.stack}>
              <Card className={styles.panel}>
                <CardHeader title="Задать популярный вопрос" />
                <form className={styles.form} onSubmit={handleCreateQuestion}>
                  <label className={styles.field}>
                    <span className={styles.label}>Вопрос</span>
                    <input
                      className={styles.input}
                      value={questionTitle}
                      onChange={(event) => setQuestionTitle(event.target.value.slice(0, 180))}
                      placeholder="Например: Как восстановить доступ к аккаунту без старой почты?"
                    />
                  </label>
                  <label className={styles.field}>
                    <span className={styles.label}>Подробности (необязательно)</span>
                    <textarea
                      className={styles.textarea}
                      rows={6}
                      value={questionBody}
                      onChange={(event) => setQuestionBody(event.target.value.slice(0, 5000))}
                      placeholder="Добавьте контекст: где возник вопрос, какие шаги вы уже пробовали, что именно осталось непонятным."
                    />
                  </label>

                  <div className={styles.helperRow}>
                    <span className={questionError || questionValidationText ? styles.validationError : styles.helper}>
                      {questionError || questionValidationText || "После публикации вопрос появится в общем списке, а другие пользователи смогут поддержать его лайком."}
                    </span>
                    <span className={styles.counter}>{questionTitle.trim().length}/180</span>
                  </div>
                  {questionSuccess ? <div className={styles.validationSuccess}>{questionSuccess}</div> : null}

                  <div className={styles.inlineActions}>
                    <Button type="submit" variant="primary" loading={creatingQuestion}>
                      Опубликовать вопрос
                    </Button>
                    <span className={styles.hint}>Ответ на популярный вопрос публикует только администратор.</span>
                  </div>
                  <div className={styles.guideBlock}>
                    <div className={styles.guideTitle}>Как работает раздел</div>
                    <div className={styles.tipsList}>
                      {questionGuide.map((tip) => (
                        <div key={tip} className={styles.tipItem}>{tip}</div>
                      ))}
                    </div>
                  </div>
                </form>
              </Card>
            </div>

            <div className={styles.stack}>
              <Card className={styles.panel}>
                <CardHeader title="Популярные вопросы" action={<span className={styles.meta}>{questionSummary}</span>} />
                <div className={styles.toolbar}>
                  <input
                    className={styles.search}
                    value={search}
                    onChange={(event) => setSearch(event.target.value)}
                    placeholder="Поиск по вопросу, описанию, ответу или нику"
                  />
                  <div className={styles.metricsRow}>
                    <div className={styles.metricPill}>Активных: {questionCounts.active}</div>
                    <div className={styles.metricPill}>С ответом: {questionCounts.answered}</div>
                    <div className={styles.metricPill}>Архив: {questionCounts.archived}</div>
                  </div>
                </div>
                {questionsFetching ? <div className={styles.empty}>Обновляем список вопросов…</div> : null}
                {!questionsFetching && !activeQuestions.length && !archivedQuestions.length ? (
                  <div className={styles.empty}>Пока нет вопросов. Станьте первым, кто предложит тему для общего ответа.</div>
                ) : null}

                {!!activeQuestions.length ? (
                  <div className={styles.list}>
                    {activeQuestions.map((question) => (
                      <QuestionCard
                        key={question.id}
                        question={question}
                        onToggleLike={handleToggleLike}
                        liking={likingQuestion || unlikingQuestion}
                      />
                    ))}
                  </div>
                ) : null}

                {!!archivedQuestions.length ? (
                  <details className={styles.archive}>
                    <summary className={styles.archiveSummary}>Архив вопросов ({archivedQuestions.length})</summary>
                    <div className={styles.list}>
                      {archivedQuestions.map((question) => (
                        <QuestionCard
                          key={question.id}
                          question={question}
                          onToggleLike={handleToggleLike}
                          liking={likingQuestion || unlikingQuestion}
                        />
                      ))}
                    </div>
                  </details>
                ) : null}
              </Card>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
