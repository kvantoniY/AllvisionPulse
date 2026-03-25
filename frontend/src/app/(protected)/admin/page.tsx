"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import styles from "./Admin.module.css";
import { Card, CardHeader, CardMuted } from "@/shared/ui/Card/Card";
import { Button } from "@/shared/ui/Button/Button";
import { AdminBadge } from "@/shared/ui/AdminBadge/AdminBadge";
import { useGetMeQuery } from "@/shared/api/usersApi";
import { useGetAdminAnalyticsQuery } from "@/shared/api/adminApi";
import {
  useGetAdminSupportTicketsQuery,
  useGetSupportQuestionsQuery,
  useReplyToSupportTicketMutation,
  useUpdateSupportQuestionAsAdminMutation,
  useUpdateSupportTicketStatusMutation,
} from "@/shared/api/supportApi";
import type { TopActionMetric, TopPageMetric, TopTabMetric } from "@/shared/types/analytics";
import type { SupportQuestion, SupportQuestionStatus, SupportTicket, SupportTicketStatus } from "@/shared/types/support";

type AdminView = "overview" | "tickets" | "questions";

const ticketStatusLabel: Record<SupportTicketStatus, string> = {
  OPEN: "Ожидается",
  IN_REVIEW: "На рассмотрении",
  CLOSED: "Закрыт",
};

const questionStatusLabel: Record<SupportQuestionStatus, string> = {
  OPEN: "Открыт",
  ANSWERED: "Есть ответ",
  CLOSED: "Закрыт",
  ARCHIVED: "Архив",
};

const actionLabelMap: Record<string, string> = {
  support_ticket_created: "Создание тикета",
  support_ticket_replied: "Ответ на тикет",
  support_ticket_status_changed: "Смена статуса тикета",
  support_question_created: "Создание вопроса",
  support_question_liked: "Лайк вопроса",
  support_question_unliked: "Снятие лайка",
  support_question_updated: "Ответ на вопрос",
  admin_user_suspended: "Блокировка пользователя",
  admin_user_unsuspended: "Разблокировка пользователя",
  admin_user_deleted: "Удаление аккаунта",
  admin_post_deleted: "Удаление поста",
  admin_comment_deleted: "Удаление комментария",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function formatDuration(seconds?: number | null) {
  if (!seconds || seconds <= 0) return "—";
  if (seconds < 60) return `${seconds} сек`;
  const minutes = Math.round(seconds / 60);
  if (minutes < 60) return `${minutes} мин`;
  const hours = Math.floor(minutes / 60);
  const restMinutes = minutes % 60;
  return restMinutes ? `${hours} ч ${restMinutes} мин` : `${hours} ч`;
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

function MetricCard({ title, value, hint }: { title: string; value: string | number; hint: string }) {
  return (
    <div className={styles.metricCard}>
      <div className={styles.metricValue}>{value}</div>
      <div className={styles.metricTitle}>{title}</div>
      <div className={styles.metricHint}>{hint}</div>
    </div>
  );
}

function ChartTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div className={styles.chartTooltip}>
      <div className={styles.chartTooltipLabel}>{label}</div>
      <div className={styles.chartTooltipList}>
        {payload.map((item: any) => (
          <div key={item.dataKey} className={styles.chartTooltipRow}>
            <span>{item.name}</span>
            <strong>{item.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}

function QueueTicketItem({ ticket, active, onClick }: { ticket: SupportTicket; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={[styles.queueItem, active ? styles.queueItemActive : ""].filter(Boolean).join(" ")} onClick={onClick}>
      <div className={styles.queueTopRow}>
        <div className={styles.queueTitle}>{ticket.subject}</div>
        <span className={statusClass(ticket.status)}>{ticketStatusLabel[ticket.status]}</span>
      </div>
      <div className={styles.queueMeta}>@{ticket.author.username}</div>
      <div className={styles.queueSubtle}>{ticket.category || (ticket.kind === "PROBLEM" ? "Проблема" : "Идея")}</div>
      <div className={styles.queueMeta}>Обновлён: {formatDate(ticket.updatedAt)}</div>
    </button>
  );
}

function QueueQuestionItem({ question, active, onClick }: { question: SupportQuestion; active: boolean; onClick: () => void }) {
  return (
    <button type="button" className={[styles.queueItem, active ? styles.queueItemActive : ""].filter(Boolean).join(" ")} onClick={onClick}>
      <div className={styles.queueTopRow}>
        <div className={styles.queueTitle}>{question.title}</div>
        <span className={statusClass(question.status)}>{questionStatusLabel[question.status]}</span>
      </div>
      <div className={styles.queueMeta}>@{question.author.username}</div>
      <div className={styles.queueSubtle}>Лайков: {question.likesCount}</div>
      <div className={styles.queueMeta}>Создан: {formatDate(question.createdAt)}</div>
    </button>
  );
}

function TopPagesList({ items }: { items: TopPageMetric[] }) {
  if (!items.length) return <div className={styles.empty}>Данных пока мало. Графики начнут наполняться после первых посещений.</div>;
  return (
    <div className={styles.rankList}>
      {items.map((item, index) => (
        <div key={item.path} className={styles.rankItem}>
          <div className={styles.rankNumber}>{index + 1}</div>
          <div className={styles.rankBody}>
            <div className={styles.rankTitle}>{item.label}</div>
            <div className={styles.rankMeta}>{item.path}</div>
          </div>
          <div className={styles.rankStats}>
            <div>{item.views} просмотров</div>
            <div>{item.uniqueUsers} уникальных</div>
            <div>{formatDuration(item.avgDurationSec)}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

function TopTabsList({ items }: { items: TopTabMetric[] }) {
  if (!items.length) return <div className={styles.empty}>Статистика вкладок появится после первых переходов.</div>;
  const maxViews = Math.max(...items.map((item) => item.views), 1);
  return (
    <div className={styles.progressList}>
      {items.map((item) => (
        <div key={item.key} className={styles.progressItem}>
          <div className={styles.progressHead}>
            <span>{item.label}</span>
            <strong>{item.views}</strong>
          </div>
          <div className={styles.progressTrack}>
            <div className={styles.progressFill} style={{ width: `${Math.max(8, (item.views / maxViews) * 100)}%` }} />
          </div>
        </div>
      ))}
    </div>
  );
}

function TopActionsList({ items }: { items: TopActionMetric[] }) {
  if (!items.length) return <div className={styles.empty}>Пока не собрано достаточно событий действий.</div>;
  return (
    <div className={styles.rankList}>
      {items.map((item, index) => (
        <div key={item.key} className={styles.rankItem}>
          <div className={styles.rankNumber}>{index + 1}</div>
          <div className={styles.rankBody}>
            <div className={styles.rankTitle}>{actionLabelMap[item.key] ?? item.key}</div>
            <div className={styles.rankMeta}>{item.key}</div>
          </div>
          <div className={styles.rankStats}>
            <div>{item.count}</div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default function AdminPage() {
  const router = useRouter();
  const { data, isLoading } = useGetMeQuery();
  const me = data?.user;

  const [view, setView] = useState<AdminView>("overview");
  const [ticketSearch, setTicketSearch] = useState("");
  const [ticketStatus, setTicketStatus] = useState<SupportTicketStatus | "ALL">("ALL");
  const [questionSearch, setQuestionSearch] = useState("");
  const [selectedTicketId, setSelectedTicketId] = useState<string | null>(null);
  const [selectedQuestionId, setSelectedQuestionId] = useState<string | null>(null);
  const [ticketReply, setTicketReply] = useState("");
  const [ticketMessage, setTicketMessage] = useState("");
  const [questionAnswer, setQuestionAnswer] = useState("");
  const [questionMessage, setQuestionMessage] = useState("");

  useEffect(() => {
    if (!isLoading && me?.role !== "ADMIN") router.replace("/feed");
  }, [isLoading, me?.role, router]);

  const { data: analyticsData, isFetching: analyticsFetching } = useGetAdminAnalyticsQuery(undefined, {
    pollingInterval: 60_000,
    refetchOnFocus: true,
  });
  const { data: ticketsData, isFetching: ticketsFetching } = useGetAdminSupportTicketsQuery({ q: ticketSearch, status: ticketStatus });
  const { data: questionsData, isFetching: questionsFetching } = useGetSupportQuestionsQuery(questionSearch.trim() ? { q: questionSearch.trim() } : undefined);

  const [replyToTicket, { isLoading: replyingTicket }] = useReplyToSupportTicketMutation();
  const [updateTicketStatus, { isLoading: updatingTicketStatus }] = useUpdateSupportTicketStatusMutation();
  const [updateQuestion, { isLoading: updatingQuestion }] = useUpdateSupportQuestionAsAdminMutation();

  const tickets = ticketsData?.items ?? [];
  const allQuestions = questionsData?.items ?? [];
  const selectedTicket = tickets.find((ticket) => ticket.id === selectedTicketId) ?? tickets[0] ?? null;

  const queueQuestions = useMemo(() => {
    const query = questionSearch.trim().toLowerCase();
    const source = [...allQuestions].sort((a, b) => {
      if (a.status === b.status) return b.likesCount - a.likesCount || new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      if (a.status === "ARCHIVED") return 1;
      if (b.status === "ARCHIVED") return -1;
      return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
    });
    if (!query) return source;
    return source.filter((question) => {
      const haystack = [
        question.title,
        question.body || "",
        question.answerText || "",
        question.author.username,
        question.answerAuthor?.username || "",
      ].join(" ").toLowerCase();
      return haystack.includes(query);
    });
  }, [allQuestions, questionSearch]);

  const selectedQuestion = queueQuestions.find((question) => question.id === selectedQuestionId) ?? queueQuestions[0] ?? null;

  useEffect(() => {
    setSelectedTicketId((prev) => (prev && tickets.some((ticket) => ticket.id === prev) ? prev : tickets[0]?.id ?? null));
  }, [tickets]);

  useEffect(() => {
    setSelectedQuestionId((prev) => (prev && queueQuestions.some((question) => question.id === prev) ? prev : queueQuestions[0]?.id ?? null));
  }, [queueQuestions]);

  useEffect(() => {
    setQuestionAnswer(selectedQuestion?.answerText ?? "");
    setQuestionMessage("");
  }, [selectedQuestion?.answerText, selectedQuestion?.id]);

  useEffect(() => {
    setTicketMessage("");
  }, [selectedTicket?.id]);

  const overview = analyticsData?.overview;
  const charts = analyticsData?.charts;

  if (isLoading) {
    return (
      <div className="container">
        <Card>
          <CardHeader title="Админ панель" />
          <CardMuted>Проверяем права доступа…</CardMuted>
        </Card>
      </div>
    );
  }

  if (me?.role !== "ADMIN") return null;

  const submitTicketReply = async (status?: SupportTicketStatus) => {
    if (!selectedTicket || !ticketReply.trim()) return;
    setTicketMessage("");
    try {
      await replyToTicket({
        ticketId: selectedTicket.id,
        text: ticketReply.trim(),
        status,
      }).unwrap();
      setTicketReply("");
      setTicketMessage("Ответ отправлен пользователю от вашего админ-аккаунта.");
    } catch (error) {
      setTicketMessage(getApiErrorMessage(error, "Не удалось отправить ответ."));
    }
  };

  const changeTicketStatus = async (status: SupportTicketStatus) => {
    if (!selectedTicket) return;
    setTicketMessage("");
    try {
      await updateTicketStatus({ ticketId: selectedTicket.id, status }).unwrap();
      setTicketMessage(`Статус тикета изменён: ${ticketStatusLabel[status]}.`);
    } catch (error) {
      setTicketMessage(getApiErrorMessage(error, "Не удалось изменить статус тикета."));
    }
  };

  const saveQuestion = async (status?: SupportQuestionStatus) => {
    if (!selectedQuestion) return;
    setQuestionMessage("");
    try {
      await updateQuestion({
        questionId: selectedQuestion.id,
        answerText: questionAnswer.trim() || undefined,
        status,
      }).unwrap();
      setQuestionMessage("Ответ сохранён. Изменения уже видны пользователям.");
    } catch (error) {
      setQuestionMessage(getApiErrorMessage(error, "Не удалось сохранить ответ."));
    }
  };

  return (
    <div className="container">
      <div className={styles.page}>
        <Card>
          <div className={styles.hero}>
            <div className={styles.heroCopy}>
              <div className={styles.heroTitle}>Админ панель</div>
              <div className={styles.heroText}>
                Центр управления проектом: живая аналитика сайта, обзор поведения пользователей и обработка всех тикетов и популярных вопросов в одном месте.
              </div>
            </div>
            <div className={styles.heroActions}>
              <div className={styles.adminIdentity}>
                <span>{me?.username}</span>
                <AdminBadge role={me?.role} />
              </div>
              <div className={styles.liveBadge}>{overview ? `Онлайн сейчас: ${overview.currentOnline}` : "Собираем аналитику"}</div>
            </div>
          </div>

          <div className={styles.tabSwitch}>
            <button type="button" className={[styles.tabButton, view === "overview" ? styles.tabButtonActive : ""].filter(Boolean).join(" ")} onClick={() => setView("overview")}>Аналитика</button>
            <button type="button" className={[styles.tabButton, view === "tickets" ? styles.tabButtonActive : ""].filter(Boolean).join(" ")} onClick={() => setView("tickets")}>Личные тикеты</button>
            <button type="button" className={[styles.tabButton, view === "questions" ? styles.tabButtonActive : ""].filter(Boolean).join(" ")} onClick={() => setView("questions")}>Общие вопросы</button>
          </div>
        </Card>

        {view === "overview" ? (
          <div className={styles.analyticsLayout}>
            <Card>
              <CardHeader title="Ключевые метрики" action={analyticsFetching ? <span className={styles.subtle}>Обновляем…</span> : undefined} />
              {!overview ? (
                <div className={styles.empty}>Пока собираем данные. После первых посещений пользователей здесь появятся метрики и графики.</div>
              ) : (
                <div className={styles.metricsGrid}>
                  <MetricCard title="Всего пользователей" value={overview.totalUsers} hint={`Новых за 7 дней: ${overview.newUsers7d}`} />
                  <MetricCard title="Активные за 24 часа" value={overview.activeUsers24h} hint={`За 7 дней: ${overview.activeUsers7d}`} />
                  <MetricCard title="Сейчас онлайн" value={overview.currentOnline} hint={`Средний онлайн: ${overview.avgOnline24h}`} />
                  <MetricCard title="Пиковый онлайн" value={overview.peakOnline24h} hint="Максимум за последние 24 часа" />
                  <MetricCard title="Средняя сессия" value={formatDuration(overview.avgSessionDurationSec)} hint={`Страниц за сессию: ${overview.avgPagesPerSession}`} />
                  <MetricCard title="Отказы" value={`${overview.bounceRate}%`} hint={`Удержание 30 дней: ${overview.retention30d}%`} />
                  <MetricCard title="Просмотры за 24 часа" value={overview.pageViews24h} hint={`За 7 дней: ${overview.pageViews7d}`} />
                  <MetricCard title="Тикеты в работе" value={overview.ticketsOpen + overview.ticketsInReview} hint={`Всего тикетов: ${overview.ticketsTotal}`} />
                  <MetricCard title="Вопросы сообщества" value={overview.questionsOpen} hint={`С ответом: ${overview.questionsAnswered}, архив: ${overview.questionsArchived}`} />
                </div>
              )}
            </Card>

            <div className={styles.chartGrid}>
              <Card className={styles.chartCard}>
                <CardHeader title="Активные пользователи по дням" />
                {charts?.dailyActiveUsers?.length ? (
                  <div className={styles.chartBox}>
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={charts.dailyActiveUsers}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Line type="monotone" dataKey="value" name="Пользователи" stroke="var(--accent-strong)" strokeWidth={3} dot={false} />
                      </LineChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className={styles.empty}>Недостаточно данных для построения графика.</div>}
              </Card>

              <Card className={styles.chartCard}>
                <CardHeader title="Просмотры и уникальные пользователи по часам" />
                {charts?.hourlyActivity?.length ? (
                  <div className={styles.chartBox}>
                    <ResponsiveContainer width="100%" height="100%">
                      <BarChart data={charts.hourlyActivity}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Bar dataKey="views" name="Просмотры" fill="rgba(255,122,26,0.9)" radius={[8, 8, 0, 0]} />
                        <Bar dataKey="users" name="Пользователи" fill="rgba(255,255,255,0.35)" radius={[8, 8, 0, 0]} />
                      </BarChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className={styles.empty}>Недостаточно данных для построения графика.</div>}
              </Card>

              <Card className={styles.chartCard}>
                <CardHeader title="Средний онлайн по 30-минутным интервалам" />
                {charts?.onlineTimeline?.length ? (
                  <div className={styles.chartBox}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={charts.onlineTimeline}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} minTickGap={18} />
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="users" name="Онлайн" stroke="var(--accent-strong)" fill="rgba(255,122,26,0.18)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className={styles.empty}>Недостаточно данных для построения графика.</div>}
              </Card>

              <Card className={styles.chartCard}>
                <CardHeader title="Просмотры сайта по дням" />
                {charts?.pageViewsByDay?.length ? (
                  <div className={styles.chartBox}>
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={charts.pageViewsByDay}>
                        <CartesianGrid strokeDasharray="3 3" stroke="rgba(255,255,255,0.08)" vertical={false} />
                        <XAxis dataKey="label" tickLine={false} axisLine={false} />
                        <YAxis tickLine={false} axisLine={false} allowDecimals={false} />
                        <Tooltip content={<ChartTooltip />} />
                        <Area type="monotone" dataKey="value" name="Просмотры" stroke="var(--accent-strong)" fill="rgba(255,122,26,0.18)" strokeWidth={3} />
                      </AreaChart>
                    </ResponsiveContainer>
                  </div>
                ) : <div className={styles.empty}>Недостаточно данных для построения графика.</div>}
              </Card>
            </div>

            <div className={styles.insightsGrid}>
              <Card>
                <CardHeader title="Самые посещаемые разделы" />
                <TopTabsList items={analyticsData?.topTabs ?? []} />
              </Card>
              <Card>
                <CardHeader title="Топ страниц" />
                <TopPagesList items={analyticsData?.topPages ?? []} />
              </Card>
              <Card>
                <CardHeader title="Топ действий" />
                <TopActionsList items={analyticsData?.topActions ?? []} />
              </Card>
            </div>
          </div>
        ) : null}

        {view === "tickets" ? (
          <div className={styles.supportWorkspace}>
            <Card className={styles.queueCard}>
              <CardHeader title="Очередь личных тикетов" action={<span className={styles.subtle}>{tickets.length}</span>} />
              <div className={styles.filterStack}>
                <input className={styles.input} value={ticketSearch} onChange={(event) => setTicketSearch(event.target.value)} placeholder="Поиск по теме, описанию или юзернейму" />
                <select className={styles.select} value={ticketStatus} onChange={(event) => setTicketStatus(event.target.value as SupportTicketStatus | "ALL")}> 
                  <option value="ALL">Все статусы</option>
                  <option value="OPEN">Ожидается</option>
                  <option value="IN_REVIEW">На рассмотрении</option>
                  <option value="CLOSED">Закрыт</option>
                </select>
              </div>
              {ticketsFetching ? <div className={styles.empty}>Загружаем тикеты…</div> : null}
              {!ticketsFetching && !tickets.length ? <div className={styles.empty}>Подходящих тикетов пока нет.</div> : null}
              {!!tickets.length ? <div className={styles.queueList}>{tickets.map((ticket) => <QueueTicketItem key={ticket.id} ticket={ticket} active={selectedTicket?.id === ticket.id} onClick={() => setSelectedTicketId(ticket.id)} />)}</div> : null}
            </Card>

            <Card className={styles.detailCard}>
              <CardHeader title="Карточка тикета" />
              {!selectedTicket ? (
                <CardMuted>Выберите тикет слева, чтобы увидеть детали и ответить пользователю.</CardMuted>
              ) : (
                <div className={styles.detailStack}>
                  <div className={styles.queueTopRow}>
                    <div className={styles.detailTitle}>{selectedTicket.subject}</div>
                    <span className={statusClass(selectedTicket.status)}>{ticketStatusLabel[selectedTicket.status]}</span>
                  </div>
                  <div className={styles.inlineMeta}>
                    <span>@{selectedTicket.author.username}</span>
                    <span>Создан: {formatDate(selectedTicket.createdAt)}</span>
                    <span>Обновлён: {formatDate(selectedTicket.updatedAt)}</span>
                  </div>
                  <div className={styles.inlineChips}>
                    <span className={styles.chip}>{selectedTicket.kind === "PROBLEM" ? "Проблема" : "Идея"}</span>
                    {selectedTicket.category ? <span className={styles.chip}>{selectedTicket.category}</span> : null}
                    <span className={styles.chip}>Ответов: {selectedTicket.replies.length}</span>
                  </div>
                  <div className={styles.detailBody}>{selectedTicket.description}</div>

                  <div className={styles.sectionBlock}>
                    <div className={styles.sectionTitle}>Переписка по тикету</div>
                    <div className={styles.replyList}>
                      {selectedTicket.replies.length ? selectedTicket.replies.map((reply) => (
                        <div key={reply.id} className={styles.replyCard}>
                          <div className={styles.replyHead}>
                            <Link href={`/profile/${reply.author.username}`} className={styles.actorLink}>
                              {reply.author.username}
                              <AdminBadge role={reply.author.role} />
                            </Link>
                            <span className={styles.subtle}>{formatDate(reply.createdAt)}</span>
                          </div>
                          <div className={styles.detailBody}>{reply.text}</div>
                        </div>
                      )) : <div className={styles.empty}>Ответов пока нет.</div>}
                    </div>
                  </div>

                  <div className={styles.sectionBlock}>
                    <div className={styles.sectionTitle}>Ответ пользователю</div>
                    <textarea className={styles.textarea} rows={8} value={ticketReply} onChange={(event) => setTicketReply(event.target.value.slice(0, 4000))} placeholder="Ответ будет опубликован пользователю от вашего личного админ-аккаунта" />
                    {ticketMessage ? <div className={styles.note}>{ticketMessage}</div> : null}
                    <div className={styles.actionRow}>
                      <Button variant="primary" onClick={() => submitTicketReply(selectedTicket.status === "OPEN" ? "IN_REVIEW" : undefined)} loading={replyingTicket} disabled={ticketReply.trim().length < 1}>Отправить ответ</Button>
                      <Button onClick={() => changeTicketStatus("IN_REVIEW")} loading={updatingTicketStatus}>На рассмотрение</Button>
                      <Button onClick={() => changeTicketStatus("CLOSED")} loading={updatingTicketStatus}>Закрыть тикет</Button>
                      <Button onClick={() => changeTicketStatus("OPEN")} loading={updatingTicketStatus}>Переоткрыть</Button>
                    </div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        ) : null}

        {view === "questions" ? (
          <div className={styles.supportWorkspace}>
            <Card className={styles.queueCard}>
              <CardHeader title="Очередь общих вопросов" action={<span className={styles.subtle}>{queueQuestions.length}</span>} />
              <div className={styles.filterStack}>
                <input className={styles.input} value={questionSearch} onChange={(event) => setQuestionSearch(event.target.value)} placeholder="Поиск по вопросу, ответу или нику" />
              </div>
              {questionsFetching ? <div className={styles.empty}>Загружаем вопросы…</div> : null}
              {!questionsFetching && !queueQuestions.length ? <div className={styles.empty}>Подходящих вопросов пока нет.</div> : null}
              {!!queueQuestions.length ? <div className={styles.queueList}>{queueQuestions.map((question) => <QueueQuestionItem key={question.id} question={question} active={selectedQuestion?.id === question.id} onClick={() => setSelectedQuestionId(question.id)} />)}</div> : null}
            </Card>

            <Card className={styles.detailCard}>
              <CardHeader title="Карточка вопроса" action={selectedQuestion ? <Link href={`/support/questions/${selectedQuestion.id}`} className={styles.openLink}>Открыть у пользователей</Link> : undefined} />
              {!selectedQuestion ? (
                <CardMuted>Выберите вопрос слева, чтобы дать официальный ответ.</CardMuted>
              ) : (
                <div className={styles.detailStack}>
                  <div className={styles.queueTopRow}>
                    <div className={styles.detailTitle}>{selectedQuestion.title}</div>
                    <span className={statusClass(selectedQuestion.status)}>{questionStatusLabel[selectedQuestion.status]}</span>
                  </div>
                  <div className={styles.inlineMeta}>
                    <span>@{selectedQuestion.author.username}</span>
                    <span>Создан: {formatDate(selectedQuestion.createdAt)}</span>
                    <span>Лайков: {selectedQuestion.likesCount}</span>
                  </div>
                  <div className={styles.detailBody}>{selectedQuestion.body || "Пользователь не добавил подробностей."}</div>
                  {selectedQuestion.answerText ? (
                    <div className={styles.answerPreview}>
                      <div className={styles.replyHead}>
                        <Link href={`/profile/${selectedQuestion.answerAuthor?.username ?? selectedQuestion.author.username}`} className={styles.actorLink}>
                          {selectedQuestion.answerAuthor?.username ?? "Администратор"}
                          <AdminBadge role={selectedQuestion.answerAuthor?.role ?? "ADMIN"} />
                        </Link>
                        <span className={styles.subtle}>{formatDate(selectedQuestion.answeredAt)}</span>
                      </div>
                      <div className={styles.detailBody}>{selectedQuestion.answerText}</div>
                    </div>
                  ) : null}

                  <div className={styles.sectionBlock}>
                    <div className={styles.sectionTitle}>Официальный ответ</div>
                    <textarea className={styles.textarea} rows={9} value={questionAnswer} onChange={(event) => setQuestionAnswer(event.target.value.slice(0, 5000))} placeholder="Подготовьте официальный ответ администратора" />
                    {questionMessage ? <div className={styles.note}>{questionMessage}</div> : null}
                    <div className={styles.actionRow}>
                      <Button variant="primary" onClick={() => saveQuestion(selectedQuestion.status === "OPEN" ? "ANSWERED" : undefined)} loading={updatingQuestion} disabled={questionAnswer.trim().length < 1}>Сохранить ответ</Button>
                      <Button onClick={() => saveQuestion("CLOSED")} loading={updatingQuestion} disabled={questionAnswer.trim().length < 1}>Закрыть вопрос</Button>
                      <Button onClick={() => saveQuestion("OPEN")} loading={updatingQuestion}>Переоткрыть</Button>
                    </div>
                    <div className={styles.note}>После закрытия вопрос автоматически перейдёт в архив через 24 часа, но останется в поиске и по прямой ссылке.</div>
                  </div>
                </div>
              )}
            </Card>
          </div>
        ) : null}
      </div>
    </div>
  );
}
