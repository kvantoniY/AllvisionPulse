'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  ArrowDownRight,
  ArrowUpRight,
  PiggyBank,
  Plus,
  Trash2,
  TriangleAlert,
  Wallet,
} from 'lucide-react';
import styles from './PanelFrame.module.css';
import type { GameState } from '../../model/useGameState';
import type { WorkspaceSection } from '../../lib/types';
import type {
  PulseDebt,
  PulseFinanceCategory,
  PulseFinanceEntry,
  PulseSavingsGoal,
} from '@/shared/types/pulse';
import {
  useCreateDebtMutation,
  useCreateFinanceEntryMutation,
  useCreateSavingsGoalMutation,
  useDeleteDebtMutation,
  useDeleteFinanceEntryMutation,
  useDeleteSavingsGoalMutation,
  useUpdateDebtMutation,
  useUpdateSavingsGoalMutation,
} from '@/shared/api/pulseApi';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { scrollHorizontalChildIntoView } from '../workspace/pulseWorkspaceUtils';

type Props = {
  game: GameState;
  onToast: (message: string) => void;
  onNavigate?: (section: WorkspaceSection) => void;
};

type FinanceKind = 'EXPENSE' | 'INCOME';
type FinanceTab = 'overview' | 'expenses' | 'income' | 'savings' | 'debts' | 'stats';

const CATEGORY_BAR_COLORS = [
  'oklch(0.7 0.15 48)',
  'oklch(0.65 0.14 85)',
  'oklch(0.75 0.12 145)',
  'oklch(0.6 0.11 200)',
  'oklch(0.68 0.13 25)',
];

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU', {
    style: 'currency',
    currency: 'RUB',
    maximumFractionDigits: 0,
  }).format(value ?? 0);
}

function parseAmount(value: string) {
  const amount = Number(value.replace(',', '.').trim());
  return Number.isFinite(amount) ? amount : null;
}

function parseWhole(value: string) {
  const amount = Number(value.trim());
  return Number.isFinite(amount) ? Math.round(amount) : null;
}

function formatShortDate(value: string | null | undefined) {
  if (!value) return '—';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(parsed);
}

function debtRemaining(debt: PulseDebt) {
  return Math.max(0, debt.totalAmount - debt.paidAmount);
}

function debtProgress(debt: PulseDebt) {
  return debt.totalAmount > 0 ? Math.min(100, Math.round((debt.paidAmount / debt.totalAmount) * 100)) : 0;
}

function buildCategoryRows(categories: PulseFinanceCategory[], entries: PulseFinanceEntry[]) {
  const directCategories = categories
    .map((category) => ({
      name: category.name,
      amount: Math.max(0, Math.round(category.spent ?? 0)),
      limit: category.limitAmount ?? null,
    }))
    .filter((category) => category.amount > 0);

  if (directCategories.length) return directCategories;

  const grouped = new Map<string, number>();
  entries
    .filter((entry) => entry.type === 'EXPENSE')
    .forEach((entry) => {
      const key = entry.categoryName?.trim() || 'Прочее';
      grouped.set(key, (grouped.get(key) ?? 0) + Math.abs(entry.amount));
    });

  return Array.from(grouped.entries()).map(([name, amount]) => ({
    name,
    amount: Math.round(amount),
    limit: null,
  }));
}

function resolveGoal(goals: PulseSavingsGoal[]) {
  return goals.find((goal) => goal.savedAmount < goal.targetAmount) ?? goals[0] ?? null;
}

function suggestedContribution(goal: PulseSavingsGoal | null) {
  if (!goal) return 1500;
  const remaining = Math.max(0, goal.targetAmount - goal.savedAmount);
  if (!remaining) return 0;
  return Math.min(5000, Math.max(500, Math.ceil(remaining / 10 / 500) * 500));
}

export function FinancePanel({ game, onToast, onNavigate }: Props) {
  const isMobile = useIsMobile();
  const segmentRailRef = useRef<HTMLDivElement | null>(null);
  const activeSegmentRef = useRef<HTMLButtonElement | null>(null);
  const [createEntry, { isLoading: entrySaving }] = useCreateFinanceEntryMutation();
  const [deleteEntry] = useDeleteFinanceEntryMutation();
  const [createSavingsGoal, { isLoading: savingsSaving }] = useCreateSavingsGoalMutation();
  const [updateSavingsGoal, { isLoading: savingsUpdating }] = useUpdateSavingsGoalMutation();
  const [deleteSavingsGoal] = useDeleteSavingsGoalMutation();
  const [createDebt, { isLoading: debtSaving }] = useCreateDebtMutation();
  const [updateDebt, { isLoading: debtUpdating }] = useUpdateDebtMutation();
  const [deleteDebt] = useDeleteDebtMutation();

  const [tab, setTab] = useState<FinanceTab>('overview');
  const [kind, setKind] = useState<FinanceKind>('EXPENSE');
  const [title, setTitle] = useState('');
  const [amount, setAmount] = useState('');
  const twoColGrid = isMobile ? '1fr' : 'repeat(2, minmax(0, 1fr))';
  const threeColGrid = isMobile ? '1fr' : 'repeat(3, minmax(0, 1fr))';
  const fourColGrid = isMobile ? 'repeat(2, minmax(0, 1fr))' : 'repeat(4, minmax(0, 1fr))';
  const [composerOpen, setComposerOpen] = useState(false);
  const [savingsOpen, setSavingsOpen] = useState(false);
  const [savingsForm, setSavingsForm] = useState({
    title: '',
    targetAmount: '',
    savedAmount: '',
    deadline: '',
  });
  const [contributionGoalId, setContributionGoalId] = useState<string | null>(null);
  const [contributionAmount, setContributionAmount] = useState('');
  const [contributionNote, setContributionNote] = useState('');
  const [debtOpen, setDebtOpen] = useState(false);
  const [debtForm, setDebtForm] = useState({
    title: '',
    debtType: 'Кредит',
    totalAmount: '',
    paidAmount: '',
    paymentAmount: '',
    dueDate: '',
    termMonths: '',
    interestRate: '',
    notes: '',
  });
  const [paymentDebtId, setPaymentDebtId] = useState<string | null>(null);
  const [paymentAmount, setPaymentAmount] = useState('');
  const [paymentNote, setPaymentNote] = useState('');

  const finance = game.finance;

  const savingsGoal = useMemo(() => resolveGoal(finance.goals), [finance.goals]);

  const categoryRows = useMemo(
    () =>
      buildCategoryRows(finance.categories, finance.entries)
        .sort((left, right) => right.amount - left.amount)
        .slice(0, 5),
    [finance.categories, finance.entries],
  );

  const totalCategorySpend = categoryRows.reduce((sum, row) => sum + row.amount, 0);

  const recentEntries = useMemo(
    () =>
      [...finance.entries].sort((left, right) => {
        const leftDate = Date.parse(left.createdAt || left.date);
        const rightDate = Date.parse(right.createdAt || right.date);
        return rightDate - leftDate;
      }),
    [finance.entries],
  );

  const expenseEntries = recentEntries.filter((entry) => entry.type === 'EXPENSE');
  const incomeEntries = recentEntries.filter((entry) => entry.type === 'INCOME');
  const debts = [...finance.debts].sort((left, right) => debtRemaining(right) - debtRemaining(left));
  const activeContributionGoal = finance.goals.find((goal) => goal.id === contributionGoalId) ?? null;
  const activePaymentDebt = debts.find((debt) => debt.id === paymentDebtId) ?? null;
  const debtMonthlyLoad = debts.reduce((sum, debt) => sum + (debt.paymentAmount ?? 0), 0);
  const savingsTotal = finance.goals.reduce((sum, goal) => sum + goal.savedAmount, 0);

  useEffect(() => {
    if (!isMobile) return;

    scrollHorizontalChildIntoView(segmentRailRef.current, activeSegmentRef.current, {
      behavior: 'auto',
      mode: 'center',
    });
  }, [isMobile, tab]);

  const handleEntryAdd = async () => {
    const parsedAmount = parseAmount(amount);
    if (!title.trim() || !parsedAmount || parsedAmount <= 0) {
      onToast('Укажи описание и сумму');
      return;
    }

    try {
      await createEntry({
        type: kind,
        title: title.trim(),
        amount: parsedAmount,
        date: game.today,
      }).unwrap();

      setTitle('');
      setAmount('');
      setComposerOpen(false);
      onToast(kind === 'EXPENSE' ? 'Расход записан' : 'Доход записан');
    } catch {
      onToast('Не удалось сохранить операцию');
    }
  };

  const handleDeleteEntry = async (entryId: string) => {
    try {
      await deleteEntry(entryId).unwrap();
      onToast('Операция удалена');
    } catch {
      onToast('Не удалось удалить операцию');
    }
  };

  const handleCreateGoal = async () => {
    const targetAmount = parseAmount(savingsForm.targetAmount);
    if (!savingsForm.title.trim() || !targetAmount || targetAmount <= 0) {
      onToast('Заполни название и цель накопления');
      return;
    }

    try {
      await createSavingsGoal({
        title: savingsForm.title.trim(),
        targetAmount,
        savedAmount: parseAmount(savingsForm.savedAmount) ?? 0,
        deadline: savingsForm.deadline || null,
        itemsJson: null,
      }).unwrap();

      setSavingsForm({ title: '', targetAmount: '', savedAmount: '', deadline: '' });
      setSavingsOpen(false);
      setTab('savings');
      onToast('Цель накопления добавлена');
    } catch {
      onToast('Не удалось создать цель');
    }
  };

  const handleDeleteGoal = async (goalId: string) => {
    try {
      await deleteSavingsGoal(goalId).unwrap();
      if (contributionGoalId === goalId) {
        setContributionGoalId(null);
        setContributionAmount('');
        setContributionNote('');
      }
      onToast('Цель удалена');
    } catch {
      onToast('Не удалось удалить цель');
    }
  };

  const handleContribution = async () => {
    const parsedAmount = parseAmount(contributionAmount);
    if (!activeContributionGoal || !parsedAmount || parsedAmount <= 0) {
      onToast('Укажи сумму пополнения');
      return;
    }

    try {
      await updateSavingsGoal({
        goalId: activeContributionGoal.id,
        body: {
          savedAmount: activeContributionGoal.savedAmount + parsedAmount,
        },
      }).unwrap();

      await createEntry({
        title: `Пополнение накопления · ${activeContributionGoal.title}`,
        amount: parsedAmount,
        type: 'EXPENSE',
        date: game.today,
        notes: contributionNote.trim() || null,
      }).unwrap();

      setContributionGoalId(null);
      setContributionAmount('');
      setContributionNote('');
      onToast('Накопление пополнено');
    } catch {
      onToast('Не удалось пополнить цель');
    }
  };

  const handleCreateDebt = async () => {
    const totalAmount = parseAmount(debtForm.totalAmount);
    if (!debtForm.title.trim() || !totalAmount || totalAmount <= 0) {
      onToast('Заполни название и сумму долга');
      return;
    }

    try {
      await createDebt({
        title: debtForm.title.trim(),
        debtType: debtForm.debtType.trim() || 'Долг',
        totalAmount,
        paidAmount: parseAmount(debtForm.paidAmount) ?? 0,
        paymentAmount: parseAmount(debtForm.paymentAmount) ?? null,
        dueDate: debtForm.dueDate || null,
        startedAt: game.today,
        termMonths: parseWhole(debtForm.termMonths),
        interestRate: parseAmount(debtForm.interestRate),
        notes: debtForm.notes.trim() || null,
      }).unwrap();

      setDebtForm({
        title: '',
        debtType: 'Кредит',
        totalAmount: '',
        paidAmount: '',
        paymentAmount: '',
        dueDate: '',
        termMonths: '',
        interestRate: '',
        notes: '',
      });
      setDebtOpen(false);
      setTab('debts');
      onToast('Долг добавлен');
    } catch {
      onToast('Не удалось добавить долг');
    }
  };

  const handleDeleteDebt = async (debtId: string) => {
    try {
      await deleteDebt(debtId).unwrap();
      if (paymentDebtId === debtId) {
        setPaymentDebtId(null);
        setPaymentAmount('');
        setPaymentNote('');
      }
      onToast('Долг удалён');
    } catch {
      onToast('Не удалось удалить долг');
    }
  };

  const handleDebtPayment = async () => {
    const parsedAmount = parseAmount(paymentAmount);
    if (!activePaymentDebt || !parsedAmount || parsedAmount <= 0) {
      onToast('Укажи сумму платежа');
      return;
    }

    const nextPaidAmount = Math.min(activePaymentDebt.totalAmount, activePaymentDebt.paidAmount + parsedAmount);

    try {
      await updateDebt({
        debtId: activePaymentDebt.id,
        body: {
          paidAmount: nextPaidAmount,
        },
      }).unwrap();

      await createEntry({
        title: `Платёж по долгу · ${activePaymentDebt.title}`,
        amount: parsedAmount,
        type: 'EXPENSE',
        date: game.today,
        notes: paymentNote.trim() || null,
      }).unwrap();

      setPaymentDebtId(null);
      setPaymentAmount('');
      setPaymentNote('');
      onToast('Платёж внесён');
    } catch {
      onToast('Не удалось сохранить платёж');
    }
  };

  return (
    <div className={styles.frame}>
      <div ref={segmentRailRef} className={styles.segmentRail}>
        {([
          ['overview', 'Обзор'],
          ['expenses', 'Расходы'],
          ['income', 'Доходы'],
          ['savings', 'Накопления'],
          ['debts', 'Долги'],
          ['stats', 'Статистика'],
        ] as Array<[FinanceTab, string]>).map(([key, label]) => (
          <button
            key={key}
            type="button"
            ref={tab === key ? activeSegmentRef : undefined}
            className={styles.segment}
            data-active={tab === key}
            onClick={() => setTab(key)}
          >
            {label}
          </button>
        ))}
      </div>

      <section className={styles.statsRow}>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Доход</span>
          <span className={`${styles.statValue} ${styles.statValueSuccess}`}>{formatMoney(finance.monthIncome)}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Расход</span>
          <span className={styles.statValue}>{formatMoney(-Math.abs(finance.monthExpenses))}</span>
        </div>
        <div className={styles.stat}>
          <span className={styles.statLabel}>Баланс</span>
          <span className={`${styles.statValue} ${finance.balance >= 0 ? styles.statValueSuccess : styles.statValueAccent}`}>
            {formatMoney(finance.balance)}
          </span>
        </div>
      </section>

      {tab === 'overview' ? (
        <>
          {finance.overLimitCategories.length ? (
            <div className={styles.noteCard}>
              <TriangleAlert width={20} height={20} strokeWidth={1.8} />
              <div>
                Лимиты превышены в {finance.overLimitCategories.length}{' '}
                {finance.overLimitCategories.length === 1 ? 'категории' : 'категориях'}.
              </div>
            </div>
          ) : null}

          <CategorySection
            categoryRows={categoryRows}
            totalCategorySpend={totalCategorySpend}
            hint="за месяц"
          />

          <EntriesSection
            title="Последние операции"
            hint={recentEntries.length ? 'обновляется по данным Pulse' : 'пока без записей'}
            entries={recentEntries.slice(0, 5)}
            onDelete={handleDeleteEntry}
            emptyTitle="Операций ещё нет"
            emptyHint="Добавь первую запись, и финансовая лента заполнится автоматически."
          />
        </>
      ) : null}

      {tab === 'expenses' ? (
        <>
          <section className={styles.actionRow}>
            <button
              type="button"
              className={styles.primary}
              style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
              onClick={() => {
                setKind('EXPENSE');
                setComposerOpen(true);
              }}
            >
              <ArrowDownRight width={18} height={18} strokeWidth={2.1} />
              Записать расход
            </button>
            <button
              type="button"
              className={styles.secondary}
              style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
              onClick={() => setTab('stats')}
            >
              Лимиты и структура
            </button>
          </section>

          {composerOpen && kind === 'EXPENSE' ? (
            <EntryComposer
              kind={kind}
              title={title}
              amount={amount}
              saving={entrySaving}
              onTitleChange={setTitle}
              onAmountChange={setAmount}
              onSubmit={handleEntryAdd}
              onCancel={() => setComposerOpen(false)}
            />
          ) : null}

          <EntriesSection
            title="Расходы"
            hint="сначала последние"
            entries={expenseEntries}
            onDelete={handleDeleteEntry}
            emptyTitle="Расходов пока нет"
            emptyHint="Как только появится первая трата, она отразится и в статистике."
          />
        </>
      ) : null}

      {tab === 'income' ? (
        <>
          <section className={styles.actionRow}>
            <button
              type="button"
              className={styles.primary}
              style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
              onClick={() => {
                setKind('INCOME');
                setComposerOpen(true);
              }}
            >
              <ArrowUpRight width={18} height={18} strokeWidth={2.1} />
              Добавить доход
            </button>
            <button
              type="button"
              className={styles.secondary}
              style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
              onClick={() => setTab('overview')}
            >
              Назад к обзору
            </button>
          </section>

          {composerOpen && kind === 'INCOME' ? (
            <EntryComposer
              kind={kind}
              title={title}
              amount={amount}
              saving={entrySaving}
              onTitleChange={setTitle}
              onAmountChange={setAmount}
              onSubmit={handleEntryAdd}
              onCancel={() => setComposerOpen(false)}
            />
          ) : null}

          <EntriesSection
            title="Доходы"
            hint="сначала последние"
            entries={incomeEntries}
            onDelete={handleDeleteEntry}
            emptyTitle="Доходов пока нет"
            emptyHint="Первая выплата или поступление сразу появится здесь."
          />
        </>
      ) : null}

      {tab === 'savings' ? (
        <>
          <section className={styles.actionRow}>
            <button
              type="button"
              className={styles.primary}
              style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
              onClick={() => setSavingsOpen((prev) => !prev)}
            >
              <Plus width={18} height={18} strokeWidth={2.1} />
              {savingsOpen ? 'Скрыть форму цели' : 'Новая цель накопления'}
            </button>
            {onNavigate ? (
              <button
                type="button"
                className={styles.secondary}
                style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
                onClick={() => onNavigate('analytics')}
              >
                Смотреть аналитику
              </button>
            ) : null}
          </section>

          {savingsOpen ? (
            <section className={styles.form}>
              <div className={styles.statLabel}>Новая цель накопления</div>
              <label className={styles.field}>
                <span>Название</span>
                <input
                  value={savingsForm.title}
                  onChange={(event) => setSavingsForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Отпуск, техника, подушка"
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: twoColGrid, gap: 12 }}>
                <label className={styles.field}>
                  <span>Цель, ₽</span>
                  <input
                    inputMode="decimal"
                    value={savingsForm.targetAmount}
                    onChange={(event) => setSavingsForm((prev) => ({ ...prev, targetAmount: event.target.value }))}
                    placeholder="80000"
                  />
                </label>
                <label className={styles.field}>
                  <span>Уже накоплено, ₽</span>
                  <input
                    inputMode="decimal"
                    value={savingsForm.savedAmount}
                    onChange={(event) => setSavingsForm((prev) => ({ ...prev, savedAmount: event.target.value }))}
                    placeholder="24000"
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span>Дедлайн</span>
                <input
                  type="date"
                  value={savingsForm.deadline}
                  onChange={(event) => setSavingsForm((prev) => ({ ...prev, deadline: event.target.value }))}
                />
              </label>
              <div className={styles.actionRow}>
                <button type="button" className={styles.primary} onClick={handleCreateGoal} disabled={savingsSaving}>
                  {savingsSaving ? 'Сохраняю…' : 'Добавить цель'}
                </button>
                <button type="button" className={styles.secondary} onClick={() => setSavingsOpen(false)}>
                  Скрыть форму
                </button>
              </div>
            </section>
          ) : null}

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Накопления</div>
              <div className={styles.sectionMeta}>{finance.goals.length ? `${finance.goals.length} целей` : 'пока пусто'}</div>
            </div>

            {finance.goals.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {finance.goals.map((goal) => {
                  const progress = goal.targetAmount > 0 ? Math.min(100, Math.round((goal.savedAmount / goal.targetAmount) * 100)) : 0;
                  const isContributionOpen = contributionGoalId === goal.id;
                  return (
                    <div key={goal.id} className={styles.rowItem} style={{ alignItems: 'stretch', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div className={styles.rowItemMain}>
                          <span className={`${styles.avatarIcon} ${styles.avatarIconGreen}`}>
                            <PiggyBank width={20} height={20} strokeWidth={1.8} />
                          </span>
                          <div className={styles.rowItemTitle}>
                            <strong>{goal.title}</strong>
                            <span>Осталось {formatMoney(Math.max(0, goal.targetAmount - goal.savedAmount))}</span>
                          </div>
                        </div>
                        <button type="button" className={styles.ghostIconButton} onClick={() => handleDeleteGoal(goal.id)} aria-label="Удалить цель">
                          <Trash2 width={16} height={16} strokeWidth={1.8} />
                        </button>
                      </div>

                      <div className={styles.progressBar}>
                        <span className={styles.progressFillSuccess} style={{ width: `${progress}%` }} />
                      </div>

                      <div className={styles.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <span className={styles.sectionMeta}>
                          {formatMoney(goal.savedAmount)} из {formatMoney(goal.targetAmount)}
                          {goal.deadline ? ` · до ${formatShortDate(goal.deadline)}` : ''}
                        </span>
                        <div className={styles.actionRow}>
                          <button
                            type="button"
                            className={styles.secondary}
                            onClick={() => {
                              setContributionGoalId(isContributionOpen ? null : goal.id);
                              setContributionAmount(isContributionOpen ? '' : String(suggestedContribution(goal)));
                              setContributionNote('');
                            }}
                          >
                            Пополнить
                          </button>
                        </div>
                      </div>

                      {isContributionOpen ? (
                        <section className={styles.form}>
                          <div className={styles.statLabel}>Пополнение цели</div>
                          <label className={styles.field}>
                            <span>Сумма, ₽</span>
                            <input
                              inputMode="decimal"
                              value={contributionAmount}
                              onChange={(event) => setContributionAmount(event.target.value)}
                              placeholder="1500"
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Комментарий</span>
                            <textarea
                              rows={3}
                              value={contributionNote}
                              onChange={(event) => setContributionNote(event.target.value)}
                              placeholder="Например, перевёл часть зарплаты в копилку."
                            />
                          </label>
                          <div className={styles.actionRow}>
                            <button type="button" className={styles.primary} onClick={handleContribution} disabled={savingsUpdating}>
                              {savingsUpdating ? 'Сохраняю…' : 'Сохранить пополнение'}
                            </button>
                            <button type="button" className={styles.secondary} onClick={() => setContributionGoalId(null)}>
                              Отмена
                            </button>
                          </div>
                        </section>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>Целей накопления пока нет</strong>
                <span>Добавь первую цель, чтобы отделить крупные покупки от ежедневных трат.</span>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === 'debts' ? (
        <>
          <section className={styles.actionRow}>
            <button
              type="button"
              className={styles.primary}
              style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
              onClick={() => setDebtOpen((prev) => !prev)}
            >
              <Plus width={18} height={18} strokeWidth={2.1} />
              {debtOpen ? 'Скрыть форму долга' : 'Новый долг'}
            </button>
            <button
              type="button"
              className={styles.secondary}
              style={{ flex: 1, minHeight: 54, borderRadius: 20 }}
              onClick={() => setTab('stats')}
            >
              Общая нагрузка
            </button>
          </section>

          {debtOpen ? (
            <section className={styles.form}>
              <div className={styles.statLabel}>Новый долг</div>
              <label className={styles.field}>
                <span>Название</span>
                <input
                  value={debtForm.title}
                  onChange={(event) => setDebtForm((prev) => ({ ...prev, title: event.target.value }))}
                  placeholder="Карта, кредит, займ"
                />
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: twoColGrid, gap: 12 }}>
                <label className={styles.field}>
                  <span>Тип</span>
                  <input
                    value={debtForm.debtType}
                    onChange={(event) => setDebtForm((prev) => ({ ...prev, debtType: event.target.value }))}
                    placeholder="Кредит"
                  />
                </label>
                <label className={styles.field}>
                  <span>Общая сумма, ₽</span>
                  <input
                    inputMode="decimal"
                    value={debtForm.totalAmount}
                    onChange={(event) => setDebtForm((prev) => ({ ...prev, totalAmount: event.target.value }))}
                    placeholder="120000"
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: threeColGrid, gap: 12 }}>
                <label className={styles.field}>
                  <span>Уже выплачено, ₽</span>
                  <input
                    inputMode="decimal"
                    value={debtForm.paidAmount}
                    onChange={(event) => setDebtForm((prev) => ({ ...prev, paidAmount: event.target.value }))}
                    placeholder="0"
                  />
                </label>
                <label className={styles.field}>
                  <span>Платёж, ₽</span>
                  <input
                    inputMode="decimal"
                    value={debtForm.paymentAmount}
                    onChange={(event) => setDebtForm((prev) => ({ ...prev, paymentAmount: event.target.value }))}
                    placeholder="12000"
                  />
                </label>
                <label className={styles.field}>
                  <span>Дата</span>
                  <input
                    type="date"
                    value={debtForm.dueDate}
                    onChange={(event) => setDebtForm((prev) => ({ ...prev, dueDate: event.target.value }))}
                  />
                </label>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: twoColGrid, gap: 12 }}>
                <label className={styles.field}>
                  <span>Срок, мес.</span>
                  <input
                    inputMode="numeric"
                    value={debtForm.termMonths}
                    onChange={(event) => setDebtForm((prev) => ({ ...prev, termMonths: event.target.value }))}
                    placeholder="12"
                  />
                </label>
                <label className={styles.field}>
                  <span>Ставка, %</span>
                  <input
                    inputMode="decimal"
                    value={debtForm.interestRate}
                    onChange={(event) => setDebtForm((prev) => ({ ...prev, interestRate: event.target.value }))}
                    placeholder="19.9"
                  />
                </label>
              </div>
              <label className={styles.field}>
                <span>Комментарий</span>
                <textarea
                  rows={3}
                  value={debtForm.notes}
                  onChange={(event) => setDebtForm((prev) => ({ ...prev, notes: event.target.value }))}
                  placeholder="Банк, условия или любой контекст по платежам."
                />
              </label>
              <div className={styles.actionRow}>
                <button type="button" className={styles.primary} onClick={handleCreateDebt} disabled={debtSaving}>
                  {debtSaving ? 'Сохраняю…' : 'Добавить долг'}
                </button>
                <button type="button" className={styles.secondary} onClick={() => setDebtOpen(false)}>
                  Скрыть форму
                </button>
              </div>
            </section>
          ) : null}

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Долги и кредиты</div>
              <div className={styles.sectionMeta}>{debts.length ? `${debts.length} активных записей` : 'пока пусто'}</div>
            </div>

            {debts.length ? (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
                {debts.map((debt) => {
                  const remaining = debtRemaining(debt);
                  const progress = debtProgress(debt);
                  const isPaymentOpen = paymentDebtId === debt.id;
                  return (
                    <div key={debt.id} className={styles.rowItem} style={{ alignItems: 'stretch', flexDirection: 'column' }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', gap: 12, alignItems: 'flex-start' }}>
                        <div className={styles.rowItemMain}>
                          <span className={styles.avatarIcon}>
                            <Wallet width={20} height={20} strokeWidth={1.8} />
                          </span>
                          <div className={styles.rowItemTitle}>
                            <strong>{debt.title}</strong>
                            <span>{debt.debtType} · осталось {formatMoney(remaining)}</span>
                          </div>
                        </div>
                        <button type="button" className={styles.ghostIconButton} onClick={() => handleDeleteDebt(debt.id)} aria-label="Удалить долг">
                          <Trash2 width={16} height={16} strokeWidth={1.8} />
                        </button>
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: fourColGrid, gap: 10 }}>
                        <MiniStat label="Выплачено" value={formatMoney(debt.paidAmount)} />
                        <MiniStat label="Остаток" value={formatMoney(remaining)} />
                        <MiniStat label="Платёж" value={debt.paymentAmount ? formatMoney(debt.paymentAmount) : '—'} />
                        <MiniStat label="Срок" value={debt.termMonths ? `${debt.termMonths} мес.` : debt.dueDate ? formatShortDate(debt.dueDate) : '—'} />
                      </div>

                      <div className={styles.progressBar}>
                        <span className={styles.progressFill} style={{ width: `${progress}%` }} />
                      </div>

                      <div className={styles.row} style={{ justifyContent: 'space-between', flexWrap: 'wrap' }}>
                        <span className={styles.sectionMeta}>
                          {debt.interestRate ? `Ставка ${debt.interestRate}%` : 'Без ставки'}
                        </span>
                        <div className={styles.actionRow}>
                          <button
                            type="button"
                            className={styles.secondary}
                            onClick={() => {
                              setPaymentDebtId(isPaymentOpen ? null : debt.id);
                              setPaymentAmount(isPaymentOpen ? '' : String(debt.paymentAmount ?? remaining));
                              setPaymentNote('');
                            }}
                          >
                            Внести платёж
                          </button>
                        </div>
                      </div>

                      {isPaymentOpen ? (
                        <section className={styles.form}>
                          <div className={styles.statLabel}>Платёж по долгу</div>
                          <label className={styles.field}>
                            <span>Сумма, ₽</span>
                            <input
                              inputMode="decimal"
                              value={paymentAmount}
                              onChange={(event) => setPaymentAmount(event.target.value)}
                              placeholder="10000"
                            />
                          </label>
                          <label className={styles.field}>
                            <span>Комментарий</span>
                            <textarea
                              rows={3}
                              value={paymentNote}
                              onChange={(event) => setPaymentNote(event.target.value)}
                              placeholder="Например, досрочно закрыл часть кредита."
                            />
                          </label>
                          <div className={styles.actionRow}>
                            <button type="button" className={styles.primary} onClick={handleDebtPayment} disabled={debtUpdating}>
                              {debtUpdating ? 'Сохраняю…' : 'Сохранить платёж'}
                            </button>
                            <button type="button" className={styles.secondary} onClick={() => setPaymentDebtId(null)}>
                              Отмена
                            </button>
                          </div>
                        </section>
                      ) : null}
                    </div>
                  );
                })}
              </div>
            ) : (
              <div className={styles.empty}>
                <strong>Долгов пока нет</strong>
                <span>Когда появятся кредиты или личные займы, они будут видны и управляемы здесь.</span>
              </div>
            )}
          </section>
        </>
      ) : null}

      {tab === 'stats' ? (
        <>
          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Финансовый обзор</div>
              <div className={styles.sectionMeta}>месячный срез</div>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: fourColGrid, gap: 10 }}>
              <MiniStat label="Доходы" value={formatMoney(finance.monthIncome)} />
              <MiniStat label="Расходы" value={formatMoney(finance.monthExpenses)} />
              <MiniStat label="Накоплено" value={formatMoney(savingsTotal)} />
              <MiniStat label="Платежи" value={formatMoney(debtMonthlyLoad)} />
            </div>
          </section>

          <CategorySection
            categoryRows={categoryRows}
            totalCategorySpend={totalCategorySpend}
            hint="структура расходов"
          />

          <section className={styles.sectionCard}>
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Что важно сейчас</div>
              <div className={styles.sectionMeta}>сигналы по текущему месяцу</div>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div className={styles.rowItem}>
                <div className={styles.rowItemTitle}>
                  <strong>Чистый баланс</strong>
                  <span>{finance.balance >= 0 ? 'Есть пространство для накоплений.' : 'Расходы сейчас обгоняют доходы.'}</span>
                </div>
                <div className={styles.rowItemMeta}>
                  <strong>{formatMoney(finance.balance)}</strong>
                </div>
              </div>
              <div className={styles.rowItem}>
                <div className={styles.rowItemTitle}>
                  <strong>Накопления</strong>
                  <span>{finance.goals.length ? `${finance.goals.length} активных целей в работе.` : 'Пока нет активных целей накопления.'}</span>
                </div>
                <div className={styles.rowItemMeta}>
                  <strong>{formatMoney(savingsTotal)}</strong>
                </div>
              </div>
              <div className={styles.rowItem}>
                <div className={styles.rowItemTitle}>
                  <strong>Долговая нагрузка</strong>
                  <span>{debts.length ? `${debts.length} записей, плановый платёж ${formatMoney(debtMonthlyLoad)}.` : 'Активных долгов не зафиксировано.'}</span>
                </div>
                <div className={styles.rowItemMeta}>
                  <strong>{debts.length}</strong>
                </div>
              </div>
            </div>

            {onNavigate ? (
              <div className={styles.actionRow}>
                <button type="button" className={styles.secondary} onClick={() => onNavigate('analytics')}>
                  Полная аналитика Pulse
                </button>
              </div>
            ) : null}
          </section>
        </>
      ) : null}
    </div>
  );
}

function EntryComposer({
  kind,
  title,
  amount,
  saving,
  onTitleChange,
  onAmountChange,
  onSubmit,
  onCancel,
}: {
  kind: FinanceKind;
  title: string;
  amount: string;
  saving: boolean;
  onTitleChange: (value: string) => void;
  onAmountChange: (value: string) => void;
  onSubmit: () => void;
  onCancel: () => void;
}) {
  return (
    <section className={styles.form}>
      <div className={styles.statLabel}>Быстрая операция</div>

      <div className={styles.chipRow}>
        <button type="button" className={styles.chip} data-active={kind === 'EXPENSE'}>
          <ArrowDownRight width={14} height={14} strokeWidth={1.8} style={{ marginRight: 6 }} />
          Расход
        </button>
        <button type="button" className={styles.chip} data-active={kind === 'INCOME'}>
          <ArrowUpRight width={14} height={14} strokeWidth={1.8} style={{ marginRight: 6 }} />
          Доход
        </button>
      </div>

      <label className={styles.field}>
        <span>Описание</span>
        <input value={title} onChange={(event) => onTitleChange(event.target.value)} placeholder={kind === 'EXPENSE' ? 'Кофе, такси, продукты' : 'Зарплата, премия, возврат'} />
      </label>

      <label className={styles.field}>
        <span>Сумма, ₽</span>
        <input inputMode="decimal" value={amount} onChange={(event) => onAmountChange(event.target.value)} placeholder="1500" />
      </label>

      <div className={styles.actionRow}>
        <button type="button" className={styles.primary} onClick={onSubmit} disabled={saving}>
          {saving ? 'Сохраняю…' : 'Сохранить'}
        </button>
        <button type="button" className={styles.secondary} onClick={onCancel}>
          Скрыть форму
        </button>
      </div>
    </section>
  );
}

function CategorySection({
  categoryRows,
  totalCategorySpend,
  hint,
}: {
  categoryRows: Array<{ name: string; amount: number; limit: number | null }>;
  totalCategorySpend: number;
  hint: string;
}) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>Траты по категориям</div>
        <div className={styles.sectionMeta}>{hint}</div>
      </div>

      {categoryRows.length ? (
        <div className={styles.barList}>
          {categoryRows.map((category, index) => {
            const width = totalCategorySpend ? Math.max(12, Math.round((category.amount / totalCategorySpend) * 100)) : 0;
            return (
              <div key={category.name} className={styles.barRow}>
                <div className={styles.barLabel}>{category.name}</div>
                <div className={styles.barTrack}>
                  <div
                    className={styles.barFill}
                    style={{
                      width: `${width}%`,
                      background: CATEGORY_BAR_COLORS[index % CATEGORY_BAR_COLORS.length],
                    }}
                  />
                </div>
                <div className={styles.barValue}>-{formatMoney(category.amount)}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>Категории пока пустые</strong>
          <span>Добавь первые расходы, и разрез по категориям появится автоматически.</span>
        </div>
      )}
    </section>
  );
}

function EntriesSection({
  title,
  hint,
  entries,
  onDelete,
  emptyTitle,
  emptyHint,
}: {
  title: string;
  hint: string;
  entries: PulseFinanceEntry[];
  onDelete: (entryId: string) => void;
  emptyTitle: string;
  emptyHint: string;
}) {
  return (
    <section className={styles.sectionCard}>
      <div className={styles.sectionHeader}>
        <div className={styles.sectionTitle}>{title}</div>
        <div className={styles.sectionMeta}>{hint}</div>
      </div>

      {entries.length ? (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {entries.map((entry) => (
            <div key={entry.id} className={styles.rowItem}>
              <div className={styles.rowItemMain}>
                <span className={`${styles.avatarIcon} ${entry.type === 'INCOME' ? styles.avatarIconGreen : styles.avatarIconBlue}`}>
                  {entry.type === 'INCOME' ? (
                    <ArrowUpRight width={20} height={20} strokeWidth={1.8} />
                  ) : (
                    <ArrowDownRight width={20} height={20} strokeWidth={1.8} />
                  )}
                </span>

                <div className={styles.rowItemTitle}>
                  <strong>{entry.title}</strong>
                  <span>{entry.categoryName?.trim() || 'Без категории'} · {formatShortDate(entry.date)}</span>
                </div>
              </div>

              <div className={styles.rowItemMeta} data-inline="true">
                <strong style={{ color: entry.type === 'INCOME' ? 'oklch(0.55 0.14 145)' : 'oklch(0.3 0.04 45)' }}>
                  {entry.type === 'INCOME' ? '+' : '−'}
                  {formatMoney(Math.abs(entry.amount))}
                </strong>
                <button type="button" className={styles.ghostIconButton} onClick={() => onDelete(entry.id)} aria-label="Удалить операцию">
                  <Trash2 width={16} height={16} strokeWidth={1.8} />
                </button>
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className={styles.empty}>
          <strong>{emptyTitle}</strong>
          <span>{emptyHint}</span>
        </div>
      )}
    </section>
  );
}

function MiniStat({ label, value }: { label: string; value: string }) {
  return (
    <div className={styles.stat} style={{ minHeight: 78, padding: '14px 16px' }}>
      <span className={styles.statLabel}>{label}</span>
      <span className={styles.statValue} style={{ fontSize: '1.08rem' }}>{value}</span>
    </div>
  );
}
