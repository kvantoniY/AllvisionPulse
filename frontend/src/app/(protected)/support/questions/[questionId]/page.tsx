"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import styles from "../../Support.module.css";
import { Card, CardHeader, CardMuted } from "@/shared/ui/Card/Card";
import { Button } from "@/shared/ui/Button/Button";
import { AdminBadge } from "@/shared/ui/AdminBadge/AdminBadge";
import { useGetMeQuery } from "@/shared/api/usersApi";
import { useGetSupportQuestionQuery, useLikeSupportQuestionMutation, useUnlikeSupportQuestionMutation, useUpdateSupportQuestionAsAdminMutation } from "@/shared/api/supportApi";
import type { SupportQuestionStatus } from "@/shared/types/support";

const questionStatusLabel: Record<SupportQuestionStatus, string> = {
  OPEN: "Открыт",
  ANSWERED: "Есть ответ",
  CLOSED: "Закрыт",
  ARCHIVED: "В архиве",
};

function formatDate(value?: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return "—";
  return date.toLocaleString("ru-RU", { dateStyle: "medium", timeStyle: "short" });
}

function statusClass(status: SupportQuestionStatus) {
  if (status === "OPEN") return `${styles.status} ${styles.statusOpen}`;
  if (status === "ANSWERED") return `${styles.status} ${styles.statusReview}`;
  if (status === "CLOSED") return `${styles.status} ${styles.statusClosed}`;
  return `${styles.status} ${styles.statusArchived}`;
}

export default function SupportQuestionDetailPage() {
  const { questionId } = useParams<{ questionId: string }>();
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const isAdmin = me?.role === "ADMIN";
  const { data, isLoading, isError } = useGetSupportQuestionQuery(questionId);
  const question = data?.question;
  const [answerDraft, setAnswerDraft] = useState("");
  const [likeQuestion, { isLoading: likingQuestion }] = useLikeSupportQuestionMutation();
  const [unlikeQuestion, { isLoading: unlikingQuestion }] = useUnlikeSupportQuestionMutation();
  const [updateQuestion, { isLoading: updatingQuestion }] = useUpdateSupportQuestionAsAdminMutation();

  useEffect(() => {
    setAnswerDraft(question?.answerText ?? "");
  }, [question?.answerText]);

  if (isLoading) {
    return <div className="container"><Card><CardHeader title="Вопрос" /><CardMuted>Загружаем вопрос…</CardMuted></Card></div>;
  }

  if (isError || !question) {
    return <div className="container"><Card><CardHeader title="Вопрос не найден" /><CardMuted>Похоже, вопрос был удалён или ссылка устарела.</CardMuted></Card></div>;
  }

  const toggleLike = async () => {
    if (question.viewerLiked) {
      await unlikeQuestion({ questionId: question.id }).unwrap().catch(() => null);
      return;
    }
    await likeQuestion({ questionId: question.id }).unwrap().catch(() => null);
  };

  const saveAnswer = async (status?: SupportQuestionStatus) => {
    await updateQuestion({ questionId: question.id, answerText: answerDraft.trim() || undefined, status }).unwrap().catch(() => null);
  };

  return (
    <div className="container">
      <div className={styles.page}>
        <Link href="/support" className={styles.backLink}>← Вернуться в техподдержку</Link>
        <div className={styles.detailLayout}>
          <div className={styles.stack}>
            <Card>
              <div className={styles.form}>
                <div className={styles.itemHead}>
                  <div className={styles.itemTitle}>{question.title}</div>
                  <span className={statusClass(question.status)}>{questionStatusLabel[question.status]}</span>
                </div>
                <div className={styles.meta}>
                  <span>Автор: @{question.author.username}</span>
                  <span>Создан: {formatDate(question.createdAt)}</span>
                  <span>Лайков: {question.likesCount}</span>
                </div>
                <div className={styles.itemBody}>{question.body || "Автор не добавил подробностей к вопросу."}</div>
                <div className={styles.inlineActions}>
                  <Button onClick={toggleLike} loading={likingQuestion || unlikingQuestion}>{question.viewerLiked ? "Убрать лайк" : "Поставить лайк"}</Button>
                  {question.closedAt ? <span className={styles.hint}>Закрыт: {formatDate(question.closedAt)}</span> : null}
                  {question.archivedAt ? <span className={styles.hint}>В архиве с {formatDate(question.archivedAt)}</span> : null}
                </div>
              </div>
            </Card>

            <Card>
              <CardHeader title="Ответ администратора" />
              {question.answerText ? (
                <div className={styles.answerBlock}>
                  <div className={styles.answerItem}>
                    <div className={styles.metaRow}>
                      <Link className={styles.actorLink} href={`/profile/${question.answerAuthor?.username ?? question.author.username}`}>
                        {question.answerAuthor?.username ?? "Администратор"}
                        <AdminBadge role={question.answerAuthor?.role ?? "ADMIN"} />
                      </Link>
                      <div className={styles.muted}>{formatDate(question.answeredAt)}</div>
                    </div>
                    <div className={styles.itemBody}>{question.answerText}</div>
                  </div>
                </div>
              ) : (
                <CardMuted>Ответа пока нет. Когда администратор опубликует решение, он появится в этом блоке.</CardMuted>
              )}
            </Card>
          </div>

          <div className={styles.stack}>
            <Card>
              <CardHeader title="Контекст" />
              <div className={styles.sideCard}>
                <div className={styles.note}>Пользователи не отвечают в комментариях к популярным вопросам. Вся официальная коммуникация идёт через ответ администратора.</div>
                <div className={styles.meta}>
                  <span>Статус: {questionStatusLabel[question.status]}</span>
                  <span>Последнее обновление: {formatDate(question.updatedAt)}</span>
                </div>
              </div>
            </Card>

            {isAdmin ? (
              <Card>
                <CardHeader title="Панель администратора" />
                <div className={styles.form}>
                  <label className={styles.field}>
                    <span className={styles.label}>Ответ</span>
                    <textarea className={styles.textarea} rows={8} value={answerDraft} onChange={(event) => setAnswerDraft(event.target.value.slice(0, 5000))} placeholder="Опишите решение, пояснение или официальный ответ" />
                  </label>
                  <div className={styles.inlineActions}>
                    <Button variant="primary" onClick={() => saveAnswer(question.status === "OPEN" ? "ANSWERED" : undefined)} loading={updatingQuestion} disabled={answerDraft.trim().length < 1}>Сохранить ответ</Button>
                    <Button onClick={() => saveAnswer("CLOSED")} loading={updatingQuestion} disabled={answerDraft.trim().length < 1}>Закрыть вопрос</Button>
                    <Button onClick={() => saveAnswer("OPEN")} loading={updatingQuestion}>Переоткрыть</Button>
                  </div>
                  <div className={styles.hint}>После закрытия вопрос автоматически переместится в архив через 24 часа. Архивные вопросы остаются доступны в поиске.</div>
                </div>
              </Card>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
