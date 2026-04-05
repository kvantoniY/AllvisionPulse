'use client';

import { useEffect, useMemo, useState } from 'react';
import { chatsApi } from '@/shared/api/chatsApi';
import { useGetFinanceOverviewQuery, useGetTasksDayQuery } from '@/shared/api/pulseApi';
import { useGetTasksQuery } from '@/shared/api/tasksApi';
import { useListProgramsQuery } from '@/shared/api/programsApi';
import { extractApiError } from '@/shared/lib/apiError';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import type { ChatMember, Message } from '@/shared/types/chat';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import styles from './ChatArtifactComposer.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  chatId: string;
  meId?: string;
  members?: ChatMember[];
  onSent?: (message: Message) => void;
};

type ComposerTab = 'agreements' | 'pulseShare';
type AgreementMode = 'EVENT' | 'FINANCE_SPLIT' | 'DEBT_SHARE' | 'SAVINGS_SHARE';
type AgreementSourceMode = 'NEW' | 'EXISTING';
type PulseShareKind = 'TASK_DAY' | 'FINANCE_OVERVIEW' | 'NUTRITION_DAY' | 'MENTAL_DAY' | 'PROGRAM';
type SharingScope = 'PERSONAL' | 'SHARED';
type EventSubtaskAssignmentMode = 'PERSONAL' | 'ALL' | 'ANYONE';

type AgreementSelection = {
  kind: 'TASK' | 'DEBT' | 'SAVINGS_GOAL';
  id: string;
  title: string;
  subtitle?: string | null;
  dueAt?: string | null;
  totalAmount?: number | null;
  targetAmount?: number | null;
  savedAmount?: number | null;
  debtType?: string | null;
};

type PulseSelection = {
  kind: PulseShareKind;
  id?: string | null;
  title: string;
  subtitle?: string | null;
};

type EventSubtaskDraft = {
  id: string;
  title: string;
  time: string;
  endTime: string;
  description: string;
  assignmentMode: EventSubtaskAssignmentMode;
  assigneeUserId: string;
};

const agreementOptions: Array<{
  value: AgreementMode;
  title: string;
  subtitle: string;
  icon: 'clock' | 'forward' | 'checkDouble' | 'sparkles';
}> = [
  { value: 'EVENT', title: 'Событие', subtitle: 'Одна карточка для договорённости, напоминания и общей задачи', icon: 'clock' },
  { value: 'FINANCE_SPLIT', title: 'Общий счёт', subtitle: 'Сначала принимают счёт, потом у каждого появляется личный долг', icon: 'forward' },
  { value: 'DEBT_SHARE', title: 'Долг', subtitle: 'Личный или общий долг с прогрессом по участникам', icon: 'checkDouble' },
  { value: 'SAVINGS_SHARE', title: 'Накопление', subtitle: 'Личная цель или общее накопление с общим прогрессом', icon: 'sparkles' },
];

const pulseShortcuts: Array<{ kind: PulseShareKind; title: string; subtitle: string }> = [
  { kind: 'TASK_DAY', title: 'Мои задачи на день', subtitle: 'Просто показать, чем занят сегодня' },
  { kind: 'FINANCE_OVERVIEW', title: 'Мои финансы сегодня', subtitle: 'Баланс, траты и доходы как виджет' },
  { kind: 'NUTRITION_DAY', title: 'Мои калории сегодня', subtitle: 'Питание и ритм за день' },
  { kind: 'MENTAL_DAY', title: 'Моё состояние', subtitle: 'Короткий check-in без совместного действия' },
];

const reminderOptions = [
  { value: '0', label: 'Без напоминания' },
  { value: '60', label: 'За 1 час' },
  { value: '180', label: 'За 3 часа' },
  { value: '1440', label: 'За день' },
];

const sharingScopeOptions: Array<{ value: SharingScope; title: string; subtitle: string }> = [
  { value: 'PERSONAL', title: 'Личное', subtitle: 'После принятия появится только у того, кто принял' },
  { value: 'SHARED', title: 'Общее', subtitle: 'Прогресс будет общий и видимый всем участникам карточки' },
];

const sourceModeOptions: Array<{ value: AgreementSourceMode; title: string; subtitle: string }> = [
  { value: 'NEW', title: 'Создать новое', subtitle: 'Быстро собрать карточку прямо из переписки' },
  { value: 'EXISTING', title: 'Поделиться текущим', subtitle: 'Выбрать уже существующую сущность из Pulse' },
];

function todayIsoDate() {
  return new Date().toISOString().slice(0, 10);
}

function toIsoDateTime(date: string, time: string) {
  if (!date) return null;
  const safeTime = time || '00:00';
  const parsed = new Date(`${date}T${safeTime}:00`);
  return Number.isNaN(parsed.getTime()) ? null : parsed.toISOString();
}

function formatMoneyValue(value: number) {
  if (!Number.isFinite(value)) return '';
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value);
}

function parseAmount(value: string) {
  const normalized = value.replace(',', '.').trim();
  if (!normalized) return 0;
  const parsed = Number(normalized);
  return Number.isFinite(parsed) ? parsed : 0;
}

function roundMoney(value: number) {
  return Math.round(value * 100) / 100;
}

function normalizeMoneyInput(value: string) {
  return value.replace(/[^\d.,-]/g, '').replace(',', '.');
}

function createSubtaskDraft(): EventSubtaskDraft {
  return {
    id: Math.random().toString(36).slice(2, 10),
    title: '',
    time: '',
    endTime: '',
    description: '',
    assignmentMode: 'PERSONAL',
    assigneeUserId: '',
  };
}

function agreementSubmitLabel(mode: AgreementMode, sourceMode: AgreementSourceMode) {
  if (mode === 'EVENT') return sourceMode === 'EXISTING' ? 'Поделиться событием из Pulse' : 'Отправить событие';
  if (mode === 'FINANCE_SPLIT') return 'Отправить счёт';
  if (mode === 'DEBT_SHARE') return sourceMode === 'EXISTING' ? 'Поделиться долгом из Pulse' : 'Отправить долг';
  return sourceMode === 'EXISTING' ? 'Поделиться накоплением из Pulse' : 'Отправить накопление';
}

function sourceModeForAgreement(mode: AgreementMode) {
  return mode === 'FINANCE_SPLIT' ? null : sourceModeOptions;
}

export function ChatArtifactComposer({ open, onClose, chatId, meId, members = [], onSent }: Props) {
  const isMobile = useIsMobile();
  const [sendArtifactMessage, { isLoading }] = chatsApi.endpoints.sendArtifactMessage.useMutation();
  const [tab, setTab] = useState<ComposerTab>('agreements');
  const [agreementMode, setAgreementMode] = useState<AgreementMode>('EVENT');
  const [agreementSourceMode, setAgreementSourceMode] = useState<AgreementSourceMode>('NEW');
  const [sharingScope, setSharingScope] = useState<SharingScope>('PERSONAL');
  const [selectedEventSource, setSelectedEventSource] = useState<AgreementSelection | null>(null);
  const [selectedDebtSource, setSelectedDebtSource] = useState<AgreementSelection | null>(null);
  const [selectedSavingsSource, setSelectedSavingsSource] = useState<AgreementSelection | null>(null);
  const [selectedPulseShare, setSelectedPulseShare] = useState<PulseSelection | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [date, setDate] = useState('');
  const [time, setTime] = useState('');
  const [endTime, setEndTime] = useState('');
  const [eventSubtasks, setEventSubtasks] = useState<EventSubtaskDraft[]>([]);
  const [reminderMinutesBefore, setReminderMinutesBefore] = useState('60');
  const [totalAmount, setTotalAmount] = useState('');
  const [targetAmount, setTargetAmount] = useState('');
  const [savedAmount, setSavedAmount] = useState('');
  const [debtType, setDebtType] = useState('');
  const [manualSplit, setManualSplit] = useState(false);
  const [selectedParticipantIds, setSelectedParticipantIds] = useState<string[]>([]);
  const [manualShares, setManualShares] = useState<Record<string, string>>({});
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const today = useMemo(() => todayIsoDate(), []);
  const { data: tasksData } = useGetTasksQuery(undefined, { skip: !open });
  const { data: tasksDayData } = useGetTasksDayQuery(today, { skip: !open });
  const { data: financeData } = useGetFinanceOverviewQuery(today, { skip: !open });
  const { data: programsData } = useListProgramsQuery('active', { skip: !open });

  const participantOptions = useMemo(
    () =>
      (members ?? []).map((member) => ({
        id: member.userId,
        username: member.userId === meId ? `${member.user.username} (я)` : member.user.username,
        avatarUrl: member.user.avatarUrl ?? null,
        isSelf: member.userId === meId,
      })),
    [meId, members],
  );
  const financeCategories = useMemo(() => (financeData?.categories ?? []).slice(0, 20), [financeData?.categories]);
  const selectedParticipantOptions = useMemo(
    () => participantOptions.filter((item) => selectedParticipantIds.includes(item.id)),
    [participantOptions, selectedParticipantIds],
  );
  const defaultDebtCategoryName = financeCategories[0]?.name ?? 'Долг';
  const manualSplitTotal = useMemo(
    () => roundMoney(selectedParticipantIds.reduce((sum, userId) => sum + parseAmount(manualShares[userId] ?? ''), 0)),
    [manualShares, selectedParticipantIds],
  );
  const manualSplitRemaining = useMemo(
    () => roundMoney(Math.max(0, parseAmount(totalAmount) - manualSplitTotal)),
    [manualSplitTotal, totalAmount],
  );

  useEffect(() => {
    if (!open) return;
    const defaultParticipants = participantOptions.filter((item) => !item.isSelf).map((item) => item.id);
    setTab('agreements');
    setAgreementMode('EVENT');
    setAgreementSourceMode('NEW');
    setSharingScope(participantOptions.length > 1 ? 'SHARED' : 'PERSONAL');
    setSelectedEventSource(null);
    setSelectedDebtSource(null);
    setSelectedSavingsSource(null);
    setSelectedPulseShare(null);
    setTitle('');
    setDescription('');
    setDate('');
    setTime('');
    setEndTime('');
    setEventSubtasks([]);
    setReminderMinutesBefore('60');
    setTotalAmount('');
    setTargetAmount('');
    setSavedAmount('');
    setDebtType(defaultDebtCategoryName);
    setManualSplit(false);
    setSelectedParticipantIds(defaultParticipants);
    setManualShares(Object.fromEntries(defaultParticipants.map((id) => [id, ''])));
    setErrorMessage(null);
  }, [open, participantOptions]);

  useEffect(() => {
    setAgreementSourceMode('NEW');
  }, [agreementMode]);

  useEffect(() => {
    if (!open || debtType) return;
    setDebtType(defaultDebtCategoryName);
  }, [debtType, defaultDebtCategoryName, open]);

  useEffect(() => {
    setManualShares((prev) => {
      const next = Object.fromEntries(selectedParticipantIds.map((id) => [id, prev[id] ?? '']));
      return next;
    });
    setEventSubtasks((prev) =>
      prev.map((item) => {
        if (item.assignmentMode !== 'PERSONAL') return item;
        if (!selectedParticipantIds.includes(item.assigneeUserId)) {
          return { ...item, assigneeUserId: selectedParticipantIds[0] ?? '' };
        }
        return item;
      }),
    );
  }, [selectedParticipantIds]);

  const toggleParticipant = (userId: string) => {
    setSelectedParticipantIds((prev) => (prev.includes(userId) ? prev.filter((item) => item !== userId) : [...prev, userId]));
  };

  const updateEventSubtask = (id: string, patch: Partial<EventSubtaskDraft>) => {
    setEventSubtasks((prev) => prev.map((item) => (item.id === id ? { ...item, ...patch } : item)));
  };

  const addEventSubtask = () => {
    setEventSubtasks((prev) => [...prev, { ...createSubtaskDraft(), assigneeUserId: selectedParticipantIds[0] ?? '' }]);
  };

  const removeEventSubtask = (id: string) => {
    setEventSubtasks((prev) => prev.filter((item) => item.id !== id));
  };

  const recentTasks = (tasksData?.items ?? []).filter((task) => !task.completed).slice(0, 8);
  const debts = (financeData?.debts ?? []).slice(0, 8);
  const goals = (financeData?.goals ?? []).slice(0, 8);
  const programs = (programsData?.items ?? []).slice(0, 8);

  const activeExistingSelection =
    agreementMode === 'EVENT' ? selectedEventSource : agreementMode === 'DEBT_SHARE' ? selectedDebtSource : selectedSavingsSource;

  const preview = useMemo(() => {
    if (tab === 'pulseShare') {
      return {
        eyebrow: 'Поделиться Pulse',
        title: selectedPulseShare?.title ?? 'Поделиться Pulse',
        description: selectedPulseShare?.subtitle ?? 'Здесь только информационные карточки и приглашения без совместного действия.',
        meta: selectedPulseShare?.kind === 'TASK_DAY' ? [`${tasksDayData?.items?.length ?? 0} задач сегодня`] : [],
      };
    }

    if (agreementMode === 'EVENT') {
      if (agreementSourceMode === 'EXISTING') {
        return {
          eyebrow: 'Событие из Pulse',
          title: activeExistingSelection?.title ?? 'Выберите задачу из Pulse',
          description: activeExistingSelection?.subtitle ?? 'После принятия событие автоматически появится у участника в задачах.',
          meta: [activeExistingSelection?.dueAt ? new Date(activeExistingSelection.dueAt).toLocaleString('ru-RU') : 'Без даты'],
        };
      }
      return {
        eyebrow: 'Событие',
        title: title.trim() || 'Новое событие',
        description: description.trim() || 'После принятия карточка сразу попадёт в Task Tracker участника.',
        meta: [
          date ? (time ? `${date} ${time}${endTime ? `-${endTime}` : ''}` : date) : 'Без даты',
          eventSubtasks.filter((item) => item.title.trim()).length ? `${eventSubtasks.filter((item) => item.title.trim()).length} задач внутри` : 'Без подпунктов',
        ].filter(Boolean),
      };
    }

    if (agreementMode === 'FINANCE_SPLIT') {
      return {
        eyebrow: 'Общий счёт',
        title: title.trim() || 'Счёт',
        description: description.trim() || 'Участник принимает счёт, получает личный долг и может погасить его в чате или в финансах.',
        meta: [totalAmount ? formatMoneyValue(parseAmount(totalAmount)) : 'Сумма не указана'],
      };
    }

    if (agreementMode === 'DEBT_SHARE') {
      if (agreementSourceMode === 'EXISTING') {
        return {
          eyebrow: sharingScope === 'SHARED' ? 'Общий долг из Pulse' : 'Личный долг из Pulse',
          title: activeExistingSelection?.title ?? 'Выберите долг из Pulse',
          description: activeExistingSelection?.subtitle ?? 'После принятия долг появится в финансах и будет связан с карточкой чата.',
          meta: [sharingScope === 'SHARED' ? 'Общий прогресс' : 'Личный сценарий'],
        };
      }
      return {
        eyebrow: sharingScope === 'SHARED' ? 'Общий долг' : 'Личный долг',
        title: title.trim() || 'Долг',
        description: description.trim() || (sharingScope === 'SHARED' ? 'Прогресс по долгу будет общий для всех участников.' : 'Долг появится только у того, кто его принял.'),
        meta: [totalAmount ? formatMoneyValue(parseAmount(totalAmount)) : 'Сумма не указана'],
      };
    }

    if (agreementSourceMode === 'EXISTING') {
      return {
        eyebrow: sharingScope === 'SHARED' ? 'Общее накопление из Pulse' : 'Личное накопление из Pulse',
        title: activeExistingSelection?.title ?? 'Выберите накопление из Pulse',
        description: activeExistingSelection?.subtitle ?? 'После принятия накопление появится в финансах и будет синхронизироваться с карточкой.',
        meta: [sharingScope === 'SHARED' ? 'Общий прогресс' : 'Личное накопление'],
      };
    }

    return {
      eyebrow: sharingScope === 'SHARED' ? 'Общее накопление' : 'Личное накопление',
      title: title.trim() || 'Накопление',
      description: description.trim() || (sharingScope === 'SHARED' ? 'Прогресс будет общим и видимым участникам.' : 'Накопление появится только у принявшего пользователя.'),
      meta: [targetAmount ? `Цель ${formatMoneyValue(parseAmount(targetAmount))}` : 'Цель не указана'],
    };
  }, [activeExistingSelection, agreementMode, agreementSourceMode, date, description, endTime, eventSubtasks, selectedPulseShare, sharingScope, tab, targetAmount, tasksDayData?.items?.length, time, title, totalAmount]);

  const sendAndClose = (message: Message) => {
    setErrorMessage(null);
    onSent?.(message);
    onClose();
  };

  const submitAgreement = async () => {
    if (!selectedParticipantIds.length) {
      setErrorMessage('Выберите хотя бы одного участника.');
      return;
    }

    const requestBase = {
      chatId,
      visibilityScope: 'PRIVATE' as const,
      participantUserIds: selectedParticipantIds,
    };

    try {
      if (agreementMode === 'EVENT') {
        if (agreementSourceMode === 'EXISTING') {
          if (!selectedEventSource) {
            setErrorMessage('Сначала выберите задачу из Pulse.');
            return;
          }
          const response = await sendArtifactMessage({
            ...requestBase,
            sourceType: 'TASK',
            sourceId: selectedEventSource.id,
            kind: 'ACTION',
            mode: 'INVITE',
            actionType: 'SOCIAL_EVENT',
            title: selectedEventSource.title,
            description: selectedEventSource.subtitle ?? null,
            payload: {
              title: selectedEventSource.title,
              description: selectedEventSource.subtitle ?? null,
              dueAt: selectedEventSource.dueAt ?? null,
              participantUserIds: selectedParticipantIds,
            },
          }).unwrap();
          sendAndClose(response.message);
          return;
        }

        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        const preparedSubtasks = eventSubtasks
          .map((item) => ({
            key: item.id,
            title: item.title.trim(),
            description: item.description.trim() || null,
            time: item.time || null,
            endTime: item.endTime || null,
            dueAt: date && item.time ? toIsoDateTime(date, item.time) : null,
            assignmentMode: item.assignmentMode,
            assigneeUserId: item.assignmentMode === 'PERSONAL' ? item.assigneeUserId || null : null,
          }))
          .filter((item) => item.title);
        if (preparedSubtasks.some((item) => item.assignmentMode === 'PERSONAL' && !item.assigneeUserId)) {
          setErrorMessage('Для личной задачи внутри события выберите исполнителя.');
          return;
        }
        if (!trimmedTitle) {
          setErrorMessage('Нужно короткое название события.');
          return;
        }

        const response = await sendArtifactMessage({
          ...requestBase,
          sourceType: 'ACTION',
          kind: 'ACTION',
          mode: 'INVITE',
          actionType: 'SOCIAL_EVENT',
          title: trimmedTitle,
          description: trimmedDescription || null,
          payload: {
            title: trimmedTitle,
            description: trimmedDescription || null,
            dueAt: toIsoDateTime(date, time),
            time: time || null,
            endTime: endTime || null,
            reminderMinutesBefore: Number(reminderMinutesBefore) > 0 ? Number(reminderMinutesBefore) : undefined,
            participantUserIds: selectedParticipantIds,
            subtasks: preparedSubtasks,
          },
        }).unwrap();
        sendAndClose(response.message);
        return;
      }

      if (agreementMode === 'FINANCE_SPLIT') {
        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        const total = parseAmount(totalAmount);
        if (!trimmedTitle) {
          setErrorMessage('Нужно название счёта.');
          return;
        }
        if (total <= 0) {
          setErrorMessage('Для счёта нужна сумма.');
          return;
        }
        if (manualSplit && manualSplitTotal > total) {
          setErrorMessage('Сумма распределения не может быть больше общего счёта.');
          return;
        }
        if (manualSplit && selectedParticipantIds.some((userId) => parseAmount(manualShares[userId] ?? '') < 0)) {
          setErrorMessage('В ручном распределении нельзя указывать отрицательные суммы.');
          return;
        }

        const payload: Record<string, unknown> = {
          title: trimmedTitle,
          description: trimmedDescription || null,
          totalAmount: total,
          dueAt: toIsoDateTime(date, time),
          participantUserIds: selectedParticipantIds,
        };

        if (manualSplit) {
          payload.shares = selectedParticipantIds.map((userId) => ({
            userId,
            amount: parseAmount(manualShares[userId] ?? ''),
          }));
        }

        const response = await sendArtifactMessage({
          ...requestBase,
          sourceType: 'ACTION',
          kind: 'ACTION',
          mode: 'INVITE',
          actionType: 'FINANCE_SPLIT',
          title: trimmedTitle,
          description: trimmedDescription || null,
          payload,
        }).unwrap();
        sendAndClose(response.message);
        return;
      }

      if (agreementMode === 'DEBT_SHARE') {
        if (agreementSourceMode === 'EXISTING') {
          if (!selectedDebtSource) {
            setErrorMessage('Сначала выберите долг из Pulse.');
            return;
          }

          const response = await sendArtifactMessage({
            ...requestBase,
            sourceType: 'DEBT',
            sourceId: selectedDebtSource.id,
            kind: 'ACTION',
            mode: 'INVITE',
            actionType: 'DEBT_SHARE',
            title: selectedDebtSource.title,
            description: selectedDebtSource.subtitle ?? null,
            payload: {
              title: selectedDebtSource.title,
              description: selectedDebtSource.subtitle ?? null,
              totalAmount: selectedDebtSource.totalAmount ?? undefined,
              debtType: selectedDebtSource.debtType ?? undefined,
              dueAt: selectedDebtSource.dueAt ?? null,
              sharingScope,
              participantUserIds: selectedParticipantIds,
            },
          }).unwrap();
          sendAndClose(response.message);
          return;
        }

        const trimmedTitle = title.trim();
        const trimmedDescription = description.trim();
        const total = parseAmount(totalAmount);
        const resolvedDebtType = financeCategories.find((category) => category.id === debtType)?.name ?? debtType ?? defaultDebtCategoryName;
        if (!trimmedTitle) {
          setErrorMessage('Нужно название долга.');
          return;
        }
        if (total <= 0) {
          setErrorMessage('Для долга нужна сумма.');
          return;
        }

        const response = await sendArtifactMessage({
          ...requestBase,
          sourceType: 'ACTION',
          kind: 'ACTION',
          mode: 'INVITE',
          actionType: 'DEBT_SHARE',
          title: trimmedTitle,
          description: trimmedDescription || null,
          payload: {
            title: trimmedTitle,
            description: trimmedDescription || null,
            totalAmount: total,
            debtType: resolvedDebtType,
            dueAt: toIsoDateTime(date, time),
            sharingScope,
            participantUserIds: selectedParticipantIds,
          },
        }).unwrap();
        sendAndClose(response.message);
        return;
      }

      if (agreementSourceMode === 'EXISTING') {
        if (!selectedSavingsSource) {
          setErrorMessage('Сначала выберите накопление из Pulse.');
          return;
        }

        const response = await sendArtifactMessage({
          ...requestBase,
          sourceType: 'SAVINGS_GOAL',
          sourceId: selectedSavingsSource.id,
          kind: 'ACTION',
          mode: 'INVITE',
          actionType: 'SAVINGS_SHARE',
          title: selectedSavingsSource.title,
          description: selectedSavingsSource.subtitle ?? null,
          payload: {
            title: selectedSavingsSource.title,
            description: selectedSavingsSource.subtitle ?? null,
            targetAmount: selectedSavingsSource.targetAmount ?? undefined,
            savedAmount: selectedSavingsSource.savedAmount ?? undefined,
            dueAt: selectedSavingsSource.dueAt ?? null,
            sharingScope,
            participantUserIds: selectedParticipantIds,
          },
        }).unwrap();
        sendAndClose(response.message);
        return;
      }

      const trimmedTitle = title.trim();
      const trimmedDescription = description.trim();
      const target = parseAmount(targetAmount);
      if (!trimmedTitle) {
        setErrorMessage('Нужно название накопления.');
        return;
      }
      if (target <= 0) {
        setErrorMessage('Для накопления нужна целевая сумма.');
        return;
      }

      const response = await sendArtifactMessage({
        ...requestBase,
        sourceType: 'ACTION',
        kind: 'ACTION',
        mode: 'INVITE',
        actionType: 'SAVINGS_SHARE',
        title: trimmedTitle,
        description: trimmedDescription || null,
        payload: {
          title: trimmedTitle,
          description: trimmedDescription || null,
          targetAmount: target,
          savedAmount: parseAmount(savedAmount),
          deadline: date ? toIsoDateTime(date, '') : null,
          sharingScope,
          participantUserIds: selectedParticipantIds,
        },
      }).unwrap();
      sendAndClose(response.message);
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  const submitPulseShare = async () => {
    if (!selectedPulseShare) {
      setErrorMessage('Сначала выберите, чем хотите поделиться из Pulse.');
      return;
    }

    const requestBase = {
      chatId,
      visibilityScope: 'PRIVATE' as const,
    };

    try {
      let response: { message: Message };

      if (selectedPulseShare.kind === 'TASK_DAY') {
        response = await sendArtifactMessage({ ...requestBase, sourceType: 'TASK_DAY', kind: 'TASK', mode: 'SNAPSHOT' }).unwrap();
      } else if (selectedPulseShare.kind === 'FINANCE_OVERVIEW') {
        response = await sendArtifactMessage({ ...requestBase, sourceType: 'FINANCE_OVERVIEW', kind: 'FINANCE', mode: 'SNAPSHOT' }).unwrap();
      } else if (selectedPulseShare.kind === 'NUTRITION_DAY') {
        response = await sendArtifactMessage({ ...requestBase, sourceType: 'NUTRITION_DAY', kind: 'WIDGET', mode: 'SNAPSHOT' }).unwrap();
      } else if (selectedPulseShare.kind === 'MENTAL_DAY') {
        response = await sendArtifactMessage({ ...requestBase, sourceType: 'MENTAL_DAY', kind: 'WIDGET', mode: 'SNAPSHOT' }).unwrap();
      } else if (selectedPulseShare.kind === 'PROGRAM' && selectedPulseShare.id) {
        response = await sendArtifactMessage({ ...requestBase, sourceType: 'PROGRAM', sourceId: selectedPulseShare.id, kind: 'PROGRAM', mode: 'INVITE' }).unwrap();
      } else {
        setErrorMessage('Этот источник пока не готов к шарингу.');
        return;
      }

      sendAndClose(response.message);
    } catch (error) {
      setErrorMessage(extractApiError(error).message);
    }
  };

  const renderParticipants = (
    <div className={styles.participantsBlock}>
      <div className={styles.sectionLabel}>Кому это относится</div>
      <div className={styles.participants}>
        {participantOptions.map((user) => {
          const active = selectedParticipantIds.includes(user.id);
          return (
            <button key={user.id} type="button" className={[styles.participantChip, active ? styles.participantChipActive : ''].filter(Boolean).join(' ')} onClick={() => toggleParticipant(user.id)}>
              <span className={styles.participantAvatar}>{user.username.slice(0, 1).toUpperCase()}</span>
              <span>{user.username}</span>
            </button>
          );
        })}
      </div>
    </div>
  );

  const renderSharingScope = (
    <div className={styles.subTabs}>
      {sharingScopeOptions.map((option) => (
        <button
          key={option.value}
          type="button"
          className={[styles.subTab, sharingScope === option.value ? styles.subTabActive : ''].filter(Boolean).join(' ')}
          onClick={() => setSharingScope(option.value)}
        >
          <strong>{option.title}</strong>
          <span>{option.subtitle}</span>
        </button>
      ))}
    </div>
  );

  const renderSourceModeTabs =
    sourceModeForAgreement(agreementMode) && agreementMode !== 'FINANCE_SPLIT' ? (
      <div className={styles.subTabs}>
        {sourceModeOptions.map((option) => (
          <button
            key={option.value}
            type="button"
            className={[styles.subTab, agreementSourceMode === option.value ? styles.subTabActive : ''].filter(Boolean).join(' ')}
            onClick={() => setAgreementSourceMode(option.value)}
          >
            <strong>{option.title}</strong>
            <span>{option.subtitle}</span>
          </button>
        ))}
      </div>
    ) : null;

  const content = (
    <div className={styles.shell}>
      <div className={styles.tabs}>
        <button type="button" className={[styles.tab, tab === 'agreements' ? styles.tabActive : ''].filter(Boolean).join(' ')} onClick={() => setTab('agreements')}>
          Договорённости
        </button>
        <button type="button" className={[styles.tab, tab === 'pulseShare' ? styles.tabActive : ''].filter(Boolean).join(' ')} onClick={() => setTab('pulseShare')}>
          Поделиться Pulse
        </button>
      </div>

      <div className={styles.preview}>
        <div className={styles.previewEyebrow}>{preview.eyebrow}</div>
        <div className={styles.previewTitle}>{preview.title}</div>
        <div className={styles.previewDescription}>{preview.description || 'Минимум полей, максимум понятности прямо в переписке.'}</div>
        {preview.meta.length ? (
          <div className={styles.previewMeta}>
            {preview.meta.map((item) => (
              <span key={item} className={styles.previewChip}>{item}</span>
            ))}
          </div>
        ) : null}
      </div>

      {tab === 'agreements' ? (
        <>
          <div className={styles.optionGrid}>
            {agreementOptions.map((option) => (
              <button
                key={option.value}
                type="button"
                className={[styles.optionCard, agreementMode === option.value ? styles.optionCardActive : ''].filter(Boolean).join(' ')}
                onClick={() => setAgreementMode(option.value)}
              >
                <span className={styles.optionIcon}><Icon name={option.icon} size={16} /></span>
                <strong>{option.title}</strong>
                <span>{option.subtitle}</span>
              </button>
            ))}
          </div>

          {agreementMode === 'EVENT' ? (
            <div className={styles.fields}>
              {renderSourceModeTabs}

              {agreementSourceMode === 'EXISTING' ? (
                <div className={styles.sourceGroup}>
                  <div className={styles.sectionLabel}>Задачи из Pulse</div>
                  <div className={styles.sourceList}>
                    {recentTasks.map((task) => (
                      <button
                        key={task.id}
                        type="button"
                        className={[styles.sourceItem, selectedEventSource?.id === task.id ? styles.sourceItemActive : ''].filter(Boolean).join(' ')}
                        onClick={() =>
                          setSelectedEventSource({
                            kind: 'TASK',
                            id: task.id,
                            title: task.title,
                            subtitle: task.notes,
                            dueAt: task.dueDate,
                          })
                        }
                      >
                        <strong>{task.title}</strong>
                        <span>{task.dueDate ? new Date(task.dueDate).toLocaleString('ru-RU') : 'Без даты'}</span>
                      </button>
                    ))}
                    {!recentTasks.length ? <div className={styles.emptyHint}>У вас пока нет активных задач для шаринга.</div> : null}
                  </div>
                </div>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>Название события</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 160))} placeholder="Сходить в кино" />
                  </label>

                  <label className={styles.field}>
                    <span>Описание</span>
                    <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value.slice(0, 1000))} placeholder="Необязательно. Добавьте контекст только если он реально помогает." />
                  </label>

                  <div className={styles.inlineFields}>
                    <label className={styles.field}>
                      <span>Дата</span>
                      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span>Начало</span>
                      <input type="time" value={time} onChange={(event) => setTime(event.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span>До скольки</span>
                      <input type="time" value={endTime} onChange={(event) => setEndTime(event.target.value)} />
                    </label>
                    <label className={styles.field}>
                      <span>Напомнить</span>
                      <select value={reminderMinutesBefore} onChange={(event) => setReminderMinutesBefore(event.target.value)}>
                        {reminderOptions.map((option) => (
                          <option key={option.value} value={option.value}>{option.label}</option>
                        ))}
                      </select>
                    </label>
                  </div>

                  <div className={styles.sourceGroup}>
                    <div className={styles.sectionLabel}>Задачи внутри события</div>
                    <div className={styles.sectionHint}>Необязательно. Если добавить пункты, прогресс события в чате будет считаться по ним, а сами задачи попадут в трекер после принятия.</div>

                    <div className={styles.subtaskList}>
                      {eventSubtasks.map((subtask, index) => (
                        <div key={subtask.id} className={styles.subtaskRow}>
                          <label className={styles.field}>
                            <span>{`Задача ${index + 1}`}</span>
                            <input
                              value={subtask.title}
                              onChange={(event) => updateEventSubtask(subtask.id, { title: event.target.value.slice(0, 140) })}
                              placeholder="Например, купить билеты"
                            />
                          </label>

                          <label className={styles.field}>
                            <span>Начало</span>
                            <input
                              type="time"
                              value={subtask.time}
                              onChange={(event) => updateEventSubtask(subtask.id, { time: event.target.value })}
                            />
                          </label>

                          <label className={styles.field}>
                            <span>До скольки</span>
                            <input
                              type="time"
                              value={subtask.endTime}
                              onChange={(event) => updateEventSubtask(subtask.id, { endTime: event.target.value })}
                            />
                          </label>

                          <label className={styles.field}>
                            <span>Кому задача</span>
                            <select
                              value={subtask.assignmentMode}
                              onChange={(event) => {
                                const nextMode = event.target.value as EventSubtaskAssignmentMode;
                                updateEventSubtask(subtask.id, {
                                  assignmentMode: nextMode,
                                  assigneeUserId: nextMode === 'PERSONAL' ? (subtask.assigneeUserId || selectedParticipantIds[0] || '') : '',
                                });
                              }}
                            >
                              <option value="PERSONAL">Конкретному человеку</option>
                              <option value="ALL">Всем участникам</option>
                              <option value="ANYONE">Кто-то один сделает</option>
                            </select>
                          </label>

                          {subtask.assignmentMode === 'PERSONAL' ? (
                            <label className={styles.field}>
                              <span>Исполнитель</span>
                              <select
                                value={subtask.assigneeUserId}
                                onChange={(event) => updateEventSubtask(subtask.id, { assigneeUserId: event.target.value })}
                              >
                                <option value="" disabled>Выберите участника</option>
                                {selectedParticipantOptions.map((user) => (
                                  <option key={user.id} value={user.id}>{user.username}</option>
                                ))}
                              </select>
                            </label>
                          ) : null}

                          <button type="button" className={styles.removeSubtaskButton} onClick={() => removeEventSubtask(subtask.id)}>
                            Убрать
                          </button>
                        </div>
                      ))}
                    </div>

                    <button type="button" className={styles.addSubtaskButton} onClick={addEventSubtask}>
                      <Icon name="plus" size={14} />
                      <span>Добавить задачу в событие</span>
                    </button>
                  </div>
                </>
              )}
            </div>
          ) : null}

          {agreementMode === 'FINANCE_SPLIT' ? (
            <div className={styles.fields}>
              <label className={styles.field}>
                <span>Название счёта</span>
                <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 160))} placeholder="Счёт за ресторан" />
              </label>

              <label className={styles.field}>
                <span>Комментарий</span>
                <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value.slice(0, 1000))} placeholder="За что был счёт и что важно знать участникам." />
              </label>

              <div className={styles.inlineFields}>
                <label className={styles.field}>
                  <span>Сумма, ₽</span>
                  <input value={totalAmount} onChange={(event) => setTotalAmount(normalizeMoneyInput(event.target.value))} placeholder="0" inputMode="decimal" />
                </label>
                <label className={styles.field}>
                  <span>Дата</span>
                  <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                </label>
                <div className={styles.field}>
                  <span>Разделить</span>
                  <div className={styles.toggleRow}>
                    <button type="button" className={[styles.toggle, !manualSplit ? styles.toggleActive : ''].filter(Boolean).join(' ')} onClick={() => setManualSplit(false)}>
                      Поровну
                    </button>
                    <button type="button" className={[styles.toggle, manualSplit ? styles.toggleActive : ''].filter(Boolean).join(' ')} onClick={() => setManualSplit(true)}>
                      Вручную
                    </button>
                  </div>
                </div>
              </div>

              {manualSplit ? (
                <div className={styles.manualShares}>
                  <div className={styles.manualSharesHint}>
                    <span>Распределено: {formatMoneyValue(manualSplitTotal)}</span>
                    <span>Осталось: {formatMoneyValue(manualSplitRemaining)}</span>
                    {manualSplitTotal > parseAmount(totalAmount) ? <span className={styles.manualSharesWarning}>Сумма выше общего счёта</span> : null}
                    <div className={styles.manualSharesActions}>
                      <button
                        type="button"
                        className={styles.manualSharesButton}
                        onClick={() => {
                          const total = parseAmount(totalAmount);
                          const count = selectedParticipantIds.length || 1;
                          const evenShare = roundMoney(total / count);
                          const draft = Object.fromEntries(
                            selectedParticipantIds.map((userId, index) => {
                              if (index === count - 1) {
                                const used = roundMoney(evenShare * (count - 1));
                                return [userId, String(roundMoney(Math.max(0, total - used)))];
                              }
                              return [userId, String(evenShare)];
                            }),
                          );
                          setManualShares(draft);
                        }}
                      >
                        Автозаполнить поровну
                      </button>
                      <button
                        type="button"
                        className={styles.manualSharesButton}
                        onClick={() => {
                          const total = parseAmount(totalAmount);
                          if (!selectedParticipantIds.length) return;
                          const firstUserId = selectedParticipantIds[0];
                          setManualShares(
                            Object.fromEntries(selectedParticipantIds.map((userId) => [userId, userId === firstUserId ? String(total) : '0'])),
                          );
                        }}
                      >
                        Вписать всё первому
                      </button>
                    </div>
                  </div>
                  {selectedParticipantOptions.map((user) => (
                    <label key={user.id} className={styles.field}>
                      <span>{user.username}</span>
                      <input
                        value={manualShares[user.id] ?? ''}
                        onChange={(event) => setManualShares((prev) => ({ ...prev, [user.id]: normalizeMoneyInput(event.target.value) }))}
                        placeholder="0"
                        inputMode="decimal"
                      />
                    </label>
                  ))}
                </div>
              ) : null}
            </div>
          ) : null}

          {agreementMode === 'DEBT_SHARE' ? (
            <div className={styles.fields}>
              {renderSharingScope}
              {renderSourceModeTabs}

              {agreementSourceMode === 'EXISTING' ? (
                <div className={styles.sourceGroup}>
                  <div className={styles.sectionLabel}>Долги из Pulse</div>
                  <div className={styles.sourceList}>
                    {debts.map((debt) => (
                      <button
                        key={debt.id}
                        type="button"
                        className={[styles.sourceItem, selectedDebtSource?.id === debt.id ? styles.sourceItemActive : ''].filter(Boolean).join(' ')}
                        onClick={() =>
                          setSelectedDebtSource({
                            kind: 'DEBT',
                            id: debt.id,
                            title: debt.title,
                            subtitle: `${formatMoneyValue(Math.max(0, debt.totalAmount - debt.paidAmount))} осталось`,
                            totalAmount: debt.totalAmount,
                            dueAt: debt.dueDate,
                            debtType: debt.debtType,
                          })
                        }
                      >
                        <strong>{debt.title}</strong>
                        <span>{formatMoneyValue(Math.max(0, debt.totalAmount - debt.paidAmount))} осталось</span>
                      </button>
                    ))}
                    {!debts.length ? <div className={styles.emptyHint}>В финансах пока нет долгов для шаринга.</div> : null}
                  </div>
                </div>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>Название долга</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 160))} placeholder="Долг за поездку" />
                  </label>

                  <div className={styles.inlineFields}>
                    <label className={styles.field}>
                      <span>Сумма, ₽</span>
                      <input value={totalAmount} onChange={(event) => setTotalAmount(normalizeMoneyInput(event.target.value))} placeholder="0" inputMode="decimal" />
                    </label>
                    <label className={styles.field}>
                      <span>Тип</span>
                      <select value={debtType} onChange={(event) => setDebtType(event.target.value)}>
                        {financeCategories.map((category) => (
                          <option key={category.id} value={category.id}>{category.name}</option>
                        ))}
                        {!financeCategories.length ? <option value="debt">Долг</option> : null}
                      </select>
                    </label>
                    <label className={styles.field}>
                      <span>До даты</span>
                      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </label>
                  </div>

                  <label className={styles.field}>
                    <span>Описание</span>
                    <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value.slice(0, 1000))} placeholder="Что именно нужно оплатить или закрыть." />
                  </label>
                </>
              )}
            </div>
          ) : null}

          {agreementMode === 'SAVINGS_SHARE' ? (
            <div className={styles.fields}>
              {renderSharingScope}
              {renderSourceModeTabs}

              {agreementSourceMode === 'EXISTING' ? (
                <div className={styles.sourceGroup}>
                  <div className={styles.sectionLabel}>Накопления из Pulse</div>
                  <div className={styles.sourceList}>
                    {goals.map((goal) => (
                      <button
                        key={goal.id}
                        type="button"
                        className={[styles.sourceItem, selectedSavingsSource?.id === goal.id ? styles.sourceItemActive : ''].filter(Boolean).join(' ')}
                        onClick={() =>
                          setSelectedSavingsSource({
                            kind: 'SAVINGS_GOAL',
                            id: goal.id,
                            title: goal.title,
                            subtitle: `${formatMoneyValue(goal.savedAmount)} из ${formatMoneyValue(goal.targetAmount)}`,
                            targetAmount: goal.targetAmount,
                            savedAmount: goal.savedAmount,
                            dueAt: goal.deadline,
                          })
                        }
                      >
                        <strong>{goal.title}</strong>
                        <span>{formatMoneyValue(goal.savedAmount)} из {formatMoneyValue(goal.targetAmount)}</span>
                      </button>
                    ))}
                    {!goals.length ? <div className={styles.emptyHint}>В финансах пока нет накоплений для шаринга.</div> : null}
                  </div>
                </div>
              ) : (
                <>
                  <label className={styles.field}>
                    <span>Название накопления</span>
                    <input value={title} onChange={(event) => setTitle(event.target.value.slice(0, 160))} placeholder="Поездка в Питер" />
                  </label>

                  <div className={styles.inlineFields}>
                    <label className={styles.field}>
                      <span>Цель, ₽</span>
                      <input value={targetAmount} onChange={(event) => setTargetAmount(normalizeMoneyInput(event.target.value))} placeholder="0" inputMode="decimal" />
                    </label>
                    <label className={styles.field}>
                      <span>Уже накоплено, ₽</span>
                      <input value={savedAmount} onChange={(event) => setSavedAmount(normalizeMoneyInput(event.target.value))} placeholder="0" inputMode="decimal" />
                    </label>
                    <label className={styles.field}>
                      <span>Дедлайн</span>
                      <input type="date" value={date} onChange={(event) => setDate(event.target.value)} />
                    </label>
                  </div>

                  <label className={styles.field}>
                    <span>Описание</span>
                    <textarea rows={3} value={description} onChange={(event) => setDescription(event.target.value.slice(0, 1000))} placeholder="На что копите и что важно участникам." />
                  </label>
                </>
              )}
            </div>
          ) : null}

          {renderParticipants}
        </>
      ) : (
        <div className={styles.pulseSection}>
          <div className={styles.shortcutGrid}>
            {pulseShortcuts.map((shortcut) => (
              <button
                key={shortcut.kind}
                type="button"
                className={[styles.shortcutCard, selectedPulseShare?.kind === shortcut.kind ? styles.shortcutCardActive : ''].filter(Boolean).join(' ')}
                onClick={() => setSelectedPulseShare({ kind: shortcut.kind, title: shortcut.title, subtitle: shortcut.subtitle })}
              >
                <strong>{shortcut.title}</strong>
                <span>{shortcut.subtitle}</span>
              </button>
            ))}
          </div>

          <div className={styles.sourceGroup}>
            <div className={styles.sectionLabel}>Приглашения в программы</div>
            <div className={styles.sourceList}>
              {programs.map((program) => (
                <button
                  key={program.id}
                  type="button"
                  className={[styles.sourceItem, selectedPulseShare?.kind === 'PROGRAM' && selectedPulseShare.id === program.id ? styles.sourceItemActive : ''].filter(Boolean).join(' ')}
                  onClick={() => setSelectedPulseShare({ kind: 'PROGRAM', id: program.id, title: program.title, subtitle: program.description })}
                >
                  <strong>{program.title}</strong>
                  <span>{program.description || 'Открыть программу в Pulse'}</span>
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {errorMessage ? <div className={styles.error}>{errorMessage}</div> : null}

      <div className={styles.actions}>
        <Button size="sm" onClick={onClose}>Отмена</Button>
        <Button size="sm" variant="primary" loading={isLoading} onClick={() => void (tab === 'agreements' ? submitAgreement() : submitPulseShare())}>
          <Icon name="send" size={14} />
          {tab === 'agreements' ? agreementSubmitLabel(agreementMode, agreementSourceMode) : 'Поделиться Pulse'}
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet open={open} onClose={onClose} title="Pulse">
        {content}
      </MobileSheet>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Pulse" size="lg">
      {content}
    </Modal>
  );
}
