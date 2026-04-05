'use client';

import { useEffect, useMemo, useState } from 'react';
import {
  useAddShareArtifactToPulseMutation,
  useCompleteShareArtifactMutation,
  useGetShareArtifactQuery,
  useRespondToShareArtifactMutation,
  useSettleShareArtifactMutation,
} from '@/shared/api/programsApi';
import { extractApiError } from '@/shared/lib/apiError';
import type { PulseShareEmbedArtifact } from '@/shared/lib/pulseShare';
import type { PulseArtifactAction, PulseArtifactResponse, ShareArtifact } from '@/shared/types/programs';
import { Button } from '@/shared/ui/Button/Button';
import styles from './PulseShareCard.module.css';

type Props = {
  artifactId?: string | null;
  artifact?: Partial<PulseShareEmbedArtifact> | null;
  compact?: boolean;
  interactive?: boolean;
  className?: string;
};

type SnapshotParticipant = {
  userId: string;
  username: string;
  avatarUrl?: string | null;
  status?: string | null;
  statusLabel?: string | null;
  currentLabel?: string | null;
  totalLabel?: string | null;
  currentAmount?: number | null;
  totalAmount?: number | null;
  progressPercent?: number | null;
  summary?: string | null;
};

type SnapshotSubtask = {
  key: string;
  title: string;
  description?: string | null;
  assignmentMode?: string | null;
  required?: boolean;
  assigneeUserId?: string | null;
  assigneeUsername?: string | null;
  assignmentLabel?: string | null;
  completedCount?: number | null;
  totalCount?: number | null;
  progressPercent?: number | null;
  completedUserIds?: string[];
  completedUsernames?: string[];
  winnerUserId?: string | null;
  winnerUsername?: string | null;
  statusLabel?: string | null;
  time?: string | null;
  endTime?: string | null;
  hasTime?: boolean;
};

function pickSnapshotValue(value: unknown) {
  return typeof value === 'string' || typeof value === 'number' ? String(value) : '';
}

function pickNumber(value: unknown) {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

function kindLabel(value?: string | null, actionType?: string | null) {
  if (actionType === 'TASK_REQUEST' || actionType === 'TASK_SUGGESTION' || actionType === 'SOCIAL_EVENT' || actionType === 'REMINDER_CARD') return 'Событие';
  if (actionType === 'FINANCE_SPLIT') return 'Общий счёт';
  if (actionType === 'DEBT_SHARE') return 'Долг';
  if (actionType === 'SAVINGS_SHARE') return 'Накопление';
  if (value === 'PROGRAM') return 'Программа';
  if (value === 'PROGRAM_PROGRESS') return 'Прогресс';
  if (value === 'SESSION_INVITE') return 'Приглашение';
  if (value === 'ACHIEVEMENT') return 'Достижение';
  if (value === 'TODAY_ACTIONS') return 'Сегодня';
  if (value === 'TASK') return 'Задача';
  if (value === 'FINANCE') return 'Финансы';
  if (value === 'DEBT') return 'Долг';
  if (value === 'SAVINGS') return 'Накопление';
  return value ? String(value) : 'Артефакт';
}

function modeLabel(value?: string | null) {
  if (value === 'SNAPSHOT') return 'Снимок';
  if (value === 'REFERENCE') return 'Ссылка';
  if (value === 'INVITE') return 'Инвайт';
  return value ? String(value) : 'Снимок';
}

function viewerStatusLabel(value?: string | null) {
  if (value === 'COMPLETED') return 'У вас завершено';
  if (value === 'ADDED') return 'У вас уже в Pulse';
  if (value === 'ACCEPTED') return 'Принято';
  if (value === 'DECLINED') return 'Вы отказались';
  if (value === 'FOLLOWING') return 'Следите за обновлениями';
  return '';
}

function activityLabel(activity?: NonNullable<ShareArtifact['recentActivity']>[number]) {
  if (!activity) return '';
  const username = activity.actor?.username || activity.subjectUser?.username || 'Участник';
  const leftAfterAcceptance = Boolean((activity.payloadJson as Record<string, unknown> | null | undefined)?.leftAfterAcceptance);
  if (activity.type === 'COMPLETED') return `${username} отметил(а) выполненным`;
  if (activity.type === 'SETTLED') return `${username} обновил(а) прогресс`;
  if (activity.type === 'ADDED_TO_PULSE') return `${username} добавил(а) себе`;
  if (activity.type === 'ACCEPTED') return `${username} принял(а) карточку`;
  if (activity.type === 'DECLINED') return leftAfterAcceptance ? `${username} вышел(ла) из участия` : `${username} отказался(лась)`;
  if (activity.type === 'FOLLOWED') return `${username} следит за карточкой`;
  if (activity.type === 'SHARED_TO_CHAT') return 'Карточка отправлена в чат';
  return 'Статус обновился';
}

function resolveParticipants(value: unknown): SnapshotParticipant[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const userId = typeof row.userId === 'string' ? row.userId : '';
      const username = typeof row.username === 'string' ? row.username : '';
      if (!userId || !username) return null;
      return {
        userId,
        username,
        avatarUrl: typeof row.avatarUrl === 'string' ? row.avatarUrl : null,
        status: typeof row.status === 'string' ? row.status : null,
        statusLabel: typeof row.statusLabel === 'string' ? row.statusLabel : null,
        currentLabel: typeof row.currentLabel === 'string' ? row.currentLabel : null,
        totalLabel: typeof row.totalLabel === 'string' ? row.totalLabel : null,
        currentAmount: pickNumber(row.currentAmount),
        totalAmount: pickNumber(row.totalAmount),
        progressPercent: pickNumber(row.progressPercent),
        summary: typeof row.summary === 'string' ? row.summary : null,
      } satisfies SnapshotParticipant;
    })
    .filter(Boolean) as SnapshotParticipant[];
}

function resolveSubtasks(value: unknown): SnapshotSubtask[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== 'object') return null;
      const row = item as Record<string, unknown>;
      const key = typeof row.key === 'string' ? row.key : '';
      const title = typeof row.title === 'string' ? row.title : '';
      if (!key || !title) return null;
      return {
        key,
        title,
        description: typeof row.description === 'string' ? row.description : null,
        assignmentMode: typeof row.assignmentMode === 'string' ? row.assignmentMode : null,
        required: typeof row.required === 'boolean' ? row.required : undefined,
        assigneeUserId: typeof row.assigneeUserId === 'string' ? row.assigneeUserId : null,
        assigneeUsername: typeof row.assigneeUsername === 'string' ? row.assigneeUsername : null,
        assignmentLabel: typeof row.assignmentLabel === 'string' ? row.assignmentLabel : null,
        completedCount: pickNumber(row.completedCount),
        totalCount: pickNumber(row.totalCount),
        progressPercent: pickNumber(row.progressPercent),
        completedUserIds: Array.isArray(row.completedUserIds)
          ? row.completedUserIds.filter((value): value is string => typeof value === 'string')
          : [],
        completedUsernames: Array.isArray(row.completedUsernames)
          ? row.completedUsernames.filter((value): value is string => typeof value === 'string')
          : [],
        winnerUserId: typeof row.winnerUserId === 'string' ? row.winnerUserId : null,
        winnerUsername: typeof row.winnerUsername === 'string' ? row.winnerUsername : null,
        statusLabel: typeof row.statusLabel === 'string' ? row.statusLabel : null,
        time: typeof row.time === 'string' ? row.time : null,
        endTime: typeof row.endTime === 'string' ? row.endTime : null,
        hasTime: typeof row.hasTime === 'boolean' ? row.hasTime : undefined,
      } satisfies SnapshotSubtask;
    })
    .filter(Boolean) as SnapshotSubtask[];
}

function resolveSnapshot(resolvedArtifact: Partial<ShareArtifact> | Partial<PulseShareEmbedArtifact> | null) {
  const source = ((resolvedArtifact as Partial<ShareArtifact> | null)?.resolvedSnapshot ?? resolvedArtifact?.snapshotJson) as Record<string, unknown> | undefined;

  return {
    label: pickSnapshotValue(source?.label) || 'Pulse',
    title: pickSnapshotValue(source?.title) || String(resolvedArtifact?.title ?? 'Pulse артефакт'),
    description: pickSnapshotValue(source?.description) || String(resolvedArtifact?.description ?? ''),
    primary: pickSnapshotValue(source?.primary),
    secondary: pickSnapshotValue(source?.secondary),
    progressCaption: pickSnapshotValue(source?.progressCaption),
    progressLabel: pickSnapshotValue(source?.progressLabel),
    progressPercent: pickNumber(source?.progressPercent),
    overallCompleted: Boolean(source?.overallCompleted),
    participants: resolveParticipants(source?.participants),
    subtasks: resolveSubtasks(source?.subtasks),
    subtasksPreview: Array.isArray(source?.subtasksPreview) ? source?.subtasksPreview.filter((item): item is string => typeof item === 'string') : [],
  };
}

function initials(username: string) {
  return (username.trim()[0] || '?').toUpperCase();
}

function renderProgressBar(value: number | null, compact = false) {
  if (value == null) return null;
  return (
    <div className={[styles.progressBar, compact ? styles.progressBarCompact : ''].filter(Boolean).join(' ')}>
      <span className={styles.progressFill} style={{ width: `${Math.max(0, Math.min(100, value))}%` }} />
    </div>
  );
}

function isSettlementArtifact(actionType?: string | null, sourceType?: string | null) {
  return actionType === 'FINANCE_SPLIT' || actionType === 'DEBT_SHARE' || actionType === 'SAVINGS_SHARE' || sourceType === 'DEBT' || sourceType === 'SAVINGS_GOAL';
}

function settlementActionLabel(actionType?: string | null, sourceType?: string | null) {
  if (actionType === 'SAVINGS_SHARE' || sourceType === 'SAVINGS_GOAL') return 'Пополнить вручную';
  return 'Погасить вручную';
}

export function PulseShareCard({ artifactId, artifact, compact = false, interactive = true, className = '' }: Props) {
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [settlementOpen, setSettlementOpen] = useState(false);
  const [settlementAmount, setSettlementAmount] = useState('');
  const [settlementNote, setSettlementNote] = useState('');
  const [settlementTargetUserId, setSettlementTargetUserId] = useState('');
  const [respondToShareArtifact, respondState] = useRespondToShareArtifactMutation();
  const [addShareArtifactToPulse, addState] = useAddShareArtifactToPulseMutation();
  const [completeShareArtifact, completeState] = useCompleteShareArtifactMutation();
  const [settleShareArtifact, settleState] = useSettleShareArtifactMutation();
  const { data, isFetching } = useGetShareArtifactQuery(artifactId ?? '', { skip: !artifactId });

  const resolvedArtifact = ((data?.artifact as Partial<ShareArtifact> | undefined) ?? artifact ?? null) as Partial<ShareArtifact> | Partial<PulseShareEmbedArtifact> | null;
  const snapshot = useMemo(() => resolveSnapshot(resolvedArtifact), [resolvedArtifact]);
  const allowedActions = ((resolvedArtifact as Partial<ShareArtifact> | null)?.allowedActions ?? []) as PulseArtifactAction[];
  const primaryAction = (resolvedArtifact as Partial<ShareArtifact> | null)?.primaryAction ?? null;
  const participantSummary = (resolvedArtifact as Partial<ShareArtifact> | null)?.participantSummary ?? null;
  const viewerState = (resolvedArtifact as Partial<ShareArtifact> | null)?.viewerState ?? null;
  const recentActivity = (resolvedArtifact as Partial<ShareArtifact> | null)?.recentActivity ?? [];
  const actionType = String((resolvedArtifact as Partial<ShareArtifact> | null)?.actionType ?? resolvedArtifact?.actionType ?? '');
  const sourceType = String((resolvedArtifact as Partial<ShareArtifact> | null)?.sourceType ?? resolvedArtifact?.sourceType ?? '');
  const viewerUserId = typeof viewerState?.userId === 'string' ? viewerState.userId : '';
  const settlementTargets = useMemo(
    () => snapshot.participants.filter((item) => item.status !== 'DECLINED'),
    [snapshot.participants],
  );
  const canSettle =
    interactive &&
    Boolean(artifactId) &&
    Boolean(
      viewerState?.debtId ||
        viewerState?.savingsGoalId ||
        (actionType === 'FINANCE_SPLIT' && settlementTargets.some((item) => item.userId === viewerUserId)),
    ) &&
    isSettlementArtifact(actionType, sourceType);
  const canSettleForAnotherUser = actionType === 'FINANCE_SPLIT' && settlementTargets.length > 1;
  const busy = respondState.isLoading || addState.isLoading || completeState.isLoading || settleState.isLoading;
  const completedParticipants = useMemo(() => snapshot.participants.filter((item) => item.status === 'COMPLETED'), [snapshot.participants]);
  const activeParticipants = useMemo(() => snapshot.participants.filter((item) => item.status !== 'DECLINED'), [snapshot.participants]);
  const pendingParticipants = useMemo(() => snapshot.participants.filter((item) => item.status !== 'COMPLETED' && item.status !== 'DECLINED'), [snapshot.participants]);
  const visibleParticipants = detailsOpen ? snapshot.participants : snapshot.participants.slice(0, compact ? 3 : 6);
  const settlementTarget = useMemo(
    () => settlementTargets.find((participant) => participant.userId === (settlementTargetUserId || viewerUserId)) ?? settlementTargets[0] ?? null,
    [settlementTargetUserId, settlementTargets, viewerUserId],
  );
  const settlementRemainingAmount = useMemo(() => {
    if (!settlementTarget) return null;
    if (typeof settlementTarget.totalAmount !== 'number') return null;
    return Math.max(0, (settlementTarget.totalAmount ?? 0) - (settlementTarget.currentAmount ?? 0));
  }, [settlementTarget]);

  useEffect(() => {
    if (!settlementOpen) return;
    if (canSettleForAnotherUser && settlementTargetUserId) return;
    if (canSettleForAnotherUser && settlementTargets[0]?.userId) {
      setSettlementTargetUserId(settlementTargets[0].userId);
      return;
    }
    if (viewerUserId) {
      setSettlementTargetUserId(viewerUserId);
      return;
    }
  }, [canSettleForAnotherUser, settlementOpen, settlementTargetUserId, settlementTargets, viewerUserId]);

  if (!resolvedArtifact && isFetching) {
    return <div className={[styles.card, compact ? styles.compact : '', styles.loading, className].filter(Boolean).join(' ')}>Загрузка...</div>;
  }

  if (!resolvedArtifact) return null;

  const handleResponse = async (response: PulseArtifactResponse) => {
    if (!artifactId) return;
    try {
      setErrorMessage(null);
      setSettlementOpen(false);
      await respondToShareArtifact({ artifactId, response }).unwrap();
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  const handleAddToSelf = async () => {
    if (!artifactId) return;
    try {
      setErrorMessage(null);
      await addShareArtifactToPulse({ artifactId }).unwrap();
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  const handleComplete = async () => {
    if (!artifactId) return;
    try {
      setErrorMessage(null);
      await completeShareArtifact({ artifactId }).unwrap();
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  const handleSettle = async () => {
    if (!artifactId) return;
    const amount = Number(settlementAmount.replace(',', '.'));
    if (!Number.isFinite(amount) || amount <= 0) {
      setErrorMessage('Введите сумму больше нуля.');
      return;
    }
    if (settlementRemainingAmount != null && amount > settlementRemainingAmount) {
      setErrorMessage('Сумма больше остатка по выбранному участнику.');
      return;
    }
    try {
      setErrorMessage(null);
      await settleShareArtifact({
        artifactId,
        amount,
        note: settlementNote.trim() || null,
        targetUserId: canSettleForAnotherUser ? settlementTargetUserId || viewerUserId || null : null,
      }).unwrap();
      setSettlementAmount('');
      setSettlementNote('');
      setSettlementOpen(false);
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  const handleSettleFull = (participant?: SnapshotParticipant | null) => {
    if (!participant || typeof participant.totalAmount !== 'number') return;
    const remaining = Math.max(0, (participant.totalAmount ?? 0) - (participant.currentAmount ?? 0));
    if (!remaining) return;
    setSettlementOpen(true);
    setSettlementTargetUserId(participant.userId);
    setSettlementAmount(String(remaining));
  };

  const renderActionButton = (action: PulseArtifactAction, label?: string | null, primary = false) => {
    if (action === 'OPEN') {
      return (
        <Button
          key="open"
          size="sm"
          variant={primary ? 'primary' : 'default'}
          className={styles.actionButton}
          onClick={() => setDetailsOpen((value) => !value)}
          data-message-interactive="true"
        >
          {label ?? (detailsOpen ? 'Свернуть' : 'Развернуть')}
        </Button>
      );
    }

    const onClick =
      action === 'ADD_TO_SELF'
        ? handleAddToSelf
        : action === 'MARK_COMPLETED'
          ? handleComplete
          : action === 'ACCEPT'
            ? () => void handleResponse('ACCEPT')
            : action === 'DECLINE'
              ? () => void handleResponse('DECLINE')
              : () => void handleResponse('FOLLOW');

    return (
      <Button
        key={action}
        size="sm"
        variant={primary ? 'primary' : 'default'}
        className={styles.actionButton}
        onClick={onClick}
        loading={busy && primary}
        disabled={busy && !primary}
        data-message-interactive="true"
      >
        {label ?? action}
      </Button>
    );
  };

  const secondaryActions: Array<{ action: PulseArtifactAction; label: string }> = [];
  if (allowedActions.includes('DECLINE') && primaryAction?.key !== 'DECLINE') {
    secondaryActions.push({
      action: 'DECLINE',
      label: viewerState?.acceptedAt || viewerState?.addedAt || viewerState?.completedAt ? 'Отказаться' : 'Отклонить',
    });
  } else if (allowedActions.includes('FOLLOW') && !['ADD_TO_SELF', 'ACCEPT', 'MARK_COMPLETED'].includes(String(primaryAction?.key ?? ''))) {
    secondaryActions.push({ action: 'FOLLOW', label: 'Следить' });
  }
  if (primaryAction?.key !== 'OPEN' && allowedActions.includes('OPEN')) {
    secondaryActions.push({ action: 'OPEN', label: detailsOpen ? 'Свернуть' : 'Развернуть' });
  }

  return (
    <div className={[styles.card, compact ? styles.compact : '', interactive ? styles.interactive : '', className].filter(Boolean).join(' ')} data-message-interactive="true">
      <div className={styles.top}>
        <div>
          <div className={styles.eyebrow}>{snapshot.label}</div>
          <div className={styles.title}>{snapshot.title}</div>
        </div>
        <div className={styles.badges}>
          <span className={styles.mode}>{modeLabel(String(resolvedArtifact.mode ?? 'SNAPSHOT'))}</span>
          {snapshot.overallCompleted ? <span className={styles.statusBadge}>Общая цель закрыта</span> : null}
          {viewerState?.status && viewerState.status !== 'PENDING' ? <span className={styles.statusBadge}>{viewerStatusLabel(viewerState.status)}</span> : null}
        </div>
      </div>

      {snapshot.description ? <div className={styles.description}>{snapshot.description}</div> : null}

      {(snapshot.primary || snapshot.secondary) ? (
        <div className={styles.stats}>
          {snapshot.primary ? (
            <div className={styles.stat}>
              <div className={styles.statLabel}>Главное</div>
              <div className={styles.statValue}>{snapshot.primary}</div>
            </div>
          ) : null}
          {snapshot.secondary ? (
            <div className={styles.stat}>
              <div className={styles.statLabel}>Контекст</div>
              <div className={styles.statValue}>{snapshot.secondary}</div>
            </div>
          ) : null}
        </div>
      ) : null}

      {snapshot.subtasksPreview.length ? (
        <div className={styles.subtasksPreview}>
          {snapshot.subtasksPreview.map((item) => (
            <span key={item} className={styles.subtaskChip}>{item}</span>
          ))}
        </div>
      ) : null}

      {snapshot.progressPercent != null || snapshot.progressLabel ? (
        <div className={styles.progressSection}>
          <div className={styles.progressHeader}>
            <span>{snapshot.progressCaption || 'Прогресс'}</span>
            <strong>{snapshot.progressLabel}</strong>
          </div>
          {renderProgressBar(snapshot.progressPercent, compact)}
        </div>
      ) : null}

      {snapshot.participants.length ? (
        <div className={styles.participantsList}>
          <div className={styles.participantsSummary}>
            <span>Участвуют: {activeParticipants.map((item) => `@${item.username}`).join(', ') || 'пока никто'}</span>
            {completedParticipants.length ? <span>Выполнили: {completedParticipants.map((item) => `@${item.username}`).join(', ')}</span> : null}
            {pendingParticipants.length ? <span>Ещё не завершили: {pendingParticipants.map((item) => `@${item.username}`).join(', ')}</span> : null}
          </div>
          {visibleParticipants.map((participant) => (
            <div key={participant.userId} className={styles.participantRow}>
              <div className={styles.participantHead}>
                <div className={styles.participantIdentity}>
                  <span className={styles.participantAvatar}>{initials(participant.username)}</span>
                  <div className={styles.participantMeta}>
                    <strong>@{participant.username}</strong>
                    {participant.summary ? <span>{participant.summary}</span> : null}
                  </div>
                </div>
                {participant.statusLabel ? <span className={styles.participantStatus}>{participant.statusLabel}</span> : null}
              </div>
              {(participant.currentLabel || participant.totalLabel) ? (
                <div className={styles.participantAmounts}>
                  <span>{participant.currentLabel || '0'}</span>
                  <span>из {participant.totalLabel || '0'}</span>
                </div>
              ) : null}
              {renderProgressBar(participant.progressPercent ?? null, true)}
              {canSettle && detailsOpen && participant.totalAmount != null && participant.currentAmount != null && participant.totalAmount > participant.currentAmount ? (
                <div className={styles.participantActions}>
                  <Button
                    size="sm"
                    className={styles.participantActionButton}
                    onClick={() => handleSettleFull(participant)}
                    disabled={busy}
                    data-message-interactive="true"
                  >
                    Погасить полностью
                  </Button>
                </div>
              ) : null}
            </div>
          ))}
        </div>
      ) : null}

      {detailsOpen && snapshot.subtasks.length ? (
        <div className={styles.subtaskSection}>
          <div className={styles.subtaskSectionHeader}>
            <span>Задачи события</span>
            <strong>{snapshot.subtasks.length}</strong>
          </div>

          <div className={styles.subtaskList}>
            {snapshot.subtasks.map((subtask) => (
              <div key={subtask.key} className={styles.subtaskRow}>
                <div className={styles.subtaskTop}>
                  <div className={styles.subtaskText}>
                    <strong>{subtask.title}</strong>
                    {subtask.description ? <span>{subtask.description}</span> : null}
                  </div>
                  <div className={styles.subtaskBadges}>
                    <span className={styles.subtaskBadge}>
                      {subtask.required ? 'В шкале 100%' : 'Перевыполнение'}
                    </span>
                    {subtask.hasTime && subtask.time ? (
                      <span className={styles.subtaskBadge}>
                        {subtask.endTime ? `${subtask.time}–${subtask.endTime}` : subtask.time}
                      </span>
                    ) : null}
                  </div>
                </div>

                <div className={styles.subtaskMeta}>
                  {subtask.assignmentLabel ? <span>{subtask.assignmentLabel}</span> : null}
                  {subtask.statusLabel ? <span>{subtask.statusLabel}</span> : null}
                  {subtask.completedUsernames?.length ? (
                    <span>Выполнили: {subtask.completedUsernames.map((name) => `@${name}`).join(', ')}</span>
                  ) : null}
                  {subtask.assignmentMode === 'ANYONE' && subtask.winnerUsername ? (
                    <span>Забрал(а): @{subtask.winnerUsername}</span>
                  ) : null}
                </div>

                {subtask.totalCount || subtask.progressPercent ? (
                  <div className={styles.subtaskProgress}>
                    {renderProgressBar(subtask.progressPercent ?? null, true)}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        </div>
      ) : null}

      {participantSummary && participantSummary.total > 0 ? (
        <div className={styles.summaryRow}>
          <span>{kindLabel(String(resolvedArtifact.kind ?? 'PROGRAM'), actionType || null)}</span>
          <span>{participantSummary.accepted} приняли</span>
          <span>{participantSummary.added} добавили себе</span>
          <span>{participantSummary.completed} завершили</span>
        </div>
      ) : (
        <div className={styles.summaryRow}>
          <span>{kindLabel(String(resolvedArtifact.kind ?? 'PROGRAM'), actionType || null)}</span>
        </div>
      )}

      {!compact && recentActivity?.[0] ? <div className={styles.activityLine}>{activityLabel(recentActivity[0])}</div> : null}
      {detailsOpen && !compact && recentActivity?.length > 1 ? (
        <div className={styles.activityStack}>
          {recentActivity.slice(0, 4).map((item) => (
            <div key={item.id} className={styles.activityItem}>{activityLabel(item)}</div>
          ))}
        </div>
      ) : null}

      {settlementOpen ? (
        <div className={styles.inlineForm}>
          <label className={styles.inlineField}>
            <span>Сумма</span>
            <input value={settlementAmount} onChange={(event) => setSettlementAmount(event.target.value)} placeholder="0" inputMode="decimal" />
          </label>

          {canSettleForAnotherUser ? (
            <label className={styles.inlineField}>
              <span>За кого платёж</span>
              <select value={settlementTargetUserId} onChange={(event) => setSettlementTargetUserId(event.target.value)}>
                {settlementTargets.map((participant) => (
                  <option key={participant.userId} value={participant.userId}>
                    {participant.username}
                  </option>
                ))}
              </select>
            </label>
          ) : null}

          {settlementRemainingAmount != null ? (
            <div className={styles.settlementHintRow}>
              <span>Остаток по участнику: {settlementRemainingAmount.toLocaleString('ru-RU')} ₽</span>
              <button type="button" className={styles.settlementShortcut} onClick={() => setSettlementAmount(String(settlementRemainingAmount))}>
                Оплатить всю сумму этого пользователя
              </button>
            </div>
          ) : null}

          <label className={styles.inlineField}>
            <span>Комментарий</span>
            <input value={settlementNote} onChange={(event) => setSettlementNote(event.target.value.slice(0, 160))} placeholder="Необязательно" />
          </label>

          <div className={styles.inlineActions}>
            <Button size="sm" onClick={() => setSettlementOpen(false)} disabled={settleState.isLoading}>
              Скрыть
            </Button>
            <Button size="sm" variant="primary" onClick={() => void handleSettle()} loading={settleState.isLoading}>
              Сохранить
            </Button>
          </div>
        </div>
      ) : null}

      {interactive ? (
        <div className={styles.actions}>
          {primaryAction ? renderActionButton(primaryAction.key, primaryAction.label, true) : renderActionButton('OPEN', detailsOpen ? 'Свернуть' : 'Развернуть', true)}
          {canSettle ? (
            <Button size="sm" className={styles.actionButton} onClick={() => setSettlementOpen((value) => !value)} disabled={busy} data-message-interactive="true">
              {settlementActionLabel(actionType || null, sourceType || null)}
            </Button>
          ) : null}
          {secondaryActions.slice(0, compact ? 1 : 2).map((item) => renderActionButton(item.action, item.label))}
        </div>
      ) : null}

      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}
    </div>
  );
}
