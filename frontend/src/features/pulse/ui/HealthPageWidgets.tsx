'use client';

import { useEffect, useRef } from 'react';
import {
  Activity,
  ArrowRight,
  BedSingle,
  BookOpen,
  Brain,
  CalendarDays,
  Cigarette,
  CircleCheckBig,
  Coffee,
  CreditCard,
  Ellipsis,
  Flame,
  Footprints,
  Heart,
  HeartPulse,
  Info,
  Moon,
  Pencil,
  Plus,
  Ruler,
  Scale,
  Settings2,
  Sparkles,
  Target,
  LayoutGrid,
  X,
  TrendingUp,
  TriangleAlert,
  UtensilsCrossed,
  WalletMinimal,
  Wine,
  Zap,
} from 'lucide-react';
import type { PulseFinanceEntry, PulseFinanceShareMeta } from '@/shared/types/pulse';
import { getFinanceCategoryLabel } from '@/shared/lib/pulseArtifactDisplay';
import styles from '../../../app/(protected)/health/Health.module.css';

export type PulseIconName =
  | 'grid'
  | 'book'
  | 'pulse'
  | 'ruler'
  | 'scale'
  | 'calendar'
  | 'target'
  | 'trend'
  | 'flame'
  | 'check'
  | 'card'
  | 'spark'
  | 'meal'
  | 'wallet'
  | 'heart'
  | 'brain'
  | 'moon'
  | 'bolt'
  | 'warning'
  | 'alert'
  | 'walk'
  | 'coffee'
  | 'wine'
  | 'info'
  | 'plus'
  | 'menu'
  | 'trash'
  | 'utensils'
  | 'gear'
  | 'arrow'
  | 'activity'
  | 'pencil'
  | 'bed'
  | 'cigarette';

function parseDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }
  const raw = String(value).trim();
  if (!raw) return null;
  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dayOnly = new Date(`${raw}T00:00:00`);
    return Number.isNaN(dayOnly.getTime()) ? null : dayOnly;
  }
  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;
  const normalized = raw.split('T')[0] ?? raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const fallback = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }
  return null;
}

function formatShortDate(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return '—';
  return new Intl.DateTimeFormat('ru-RU', { day: '2-digit', month: 'short' }).format(parsed);
}

function formatTimeLabel(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return '—';
  if (parsed.getHours() === 0 && parsed.getMinutes() === 0) return 'Без времени';
  return new Intl.DateTimeFormat('ru-RU', { hour: '2-digit', minute: '2-digit' }).format(parsed);
}

function formatMoney(value: number | null | undefined) {
  return new Intl.NumberFormat('ru-RU', { style: 'currency', currency: 'RUB', maximumFractionDigits: 0 }).format(value ?? 0);
}

function getFinanceCategoryMeta(name?: string | null) {
  const value = (name ?? '').toLowerCase();
  if (/(прод|еда|магаз|пятер|вкусвилл|лента)/.test(value)) return { icon: 'meal' as const, tone: 'green' as const };
  if (/(каф|ресторан|кофе|бар)/.test(value)) return { icon: 'coffee' as const, tone: 'yellow' as const };
  if (/(транспорт|метро|такси|авто|бенз)/.test(value)) return { icon: 'trend' as const, tone: 'blue' as const };
  if (/(дом|коммун|ипотек|квартир)/.test(value)) return { icon: 'target' as const, tone: 'orange' as const };
  if (/(здоров|аптек|врач)/.test(value)) return { icon: 'heart' as const, tone: 'pink' as const };
  if (/(досуг|хобби|кино|игр|развлеч)/.test(value)) return { icon: 'spark' as const, tone: 'purple' as const };
  if (/(зарплат|прем|доход|подар)/.test(value)) return { icon: 'trend' as const, tone: 'green' as const };
  return { icon: 'wallet' as const, tone: 'orange' as const };
}

function getRecurrenceLabel(recurrenceJson: unknown) {
  if (!recurrenceJson || typeof recurrenceJson !== 'object') return null;
  return 'Регулярный платёж';
}

function formatMoneyDelta(value: number) {
  if (value === 0) return '0 ₽';
  return `${value > 0 ? '+' : '−'}${formatMoney(Math.abs(value))}`;
}

function getDeltaToneClass(value: number, positiveTrend: 'up' | 'down') {
  if (value === 0) return '';
  const isPositive = positiveTrend === 'up' ? value > 0 : value < 0;
  return isPositive ? styles.financeDeltaGood : styles.financeDeltaBad;
}

function getParticipantInitials(username?: string | null) {
  const parts = (username ?? '').trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (!parts.length) return '•';
  return parts.map((part) => part[0]?.toUpperCase() ?? '').join('');
}

export function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return <label className={styles.field}><span>{label}</span>{children}</label>;
}

function ensureHorizontalChildVisibility(container: HTMLElement | null, node: HTMLElement | null, inset = 16) {
  if (!container || !node) return;

  const maxScrollLeft = container.scrollWidth - container.clientWidth;
  if (maxScrollLeft <= 0) return;

  const containerRect = container.getBoundingClientRect();
  const nodeRect = node.getBoundingClientRect();
  const leftOverflow = nodeRect.left - containerRect.left - inset;
  const rightOverflow = nodeRect.right - containerRect.right + inset;

  if (leftOverflow < 0) {
    container.scrollTo({ left: Math.max(0, container.scrollLeft + leftOverflow), behavior: 'auto' });
    return;
  }

  if (rightOverflow > 0) {
    container.scrollTo({ left: Math.min(maxScrollLeft, container.scrollLeft + rightOverflow), behavior: 'auto' });
  }
}

export function Segmented({ options, value, onChange }: { options: Array<{ value: string; label: string; icon?: PulseIconName }>; value: string; onChange: (value: string) => void }) {
  const railRef = useRef<HTMLDivElement | null>(null);
  const buttonRefs = useRef<Array<HTMLButtonElement | null>>([]);

  useEffect(() => {
    const activeIndex = options.findIndex((option) => option.value === value);
    if (activeIndex < 0) return;

    const frame = window.requestAnimationFrame(() => {
      ensureHorizontalChildVisibility(railRef.current, buttonRefs.current[activeIndex], 16);
    });

    return () => window.cancelAnimationFrame(frame);
  }, [options, value]);

  return (
    <div ref={railRef} className={styles.segmented} role="tablist" aria-label="Разделы Pulse">
      {options.map((option, index) => {
        const active = option.value === value;
        return (
          <button
            key={option.value}
            ref={(node) => {
              buttonRefs.current[index] = node;
            }}
            type="button"
            role="tab"
            aria-selected={active}
            data-state={active ? 'active' : 'inactive'}
            className={[styles.segment, active ? styles.segmentActive : ''].filter(Boolean).join(' ')}
            onClick={() => onChange(option.value)}
          >
            {option.icon ? <PulseIcon name={option.icon} className={styles.segmentedIcon} /> : null}
            <span>{option.label}</span>
          </button>
        );
      })}
    </div>
  );
}

function LegacyPulseIcon({ name, className = '' }: { name: PulseIconName; className?: string }) {
  switch (name) {
    case 'grid': return <LayoutGrid className={className} strokeWidth={1.9} />;
    case 'book': return <BookOpen className={className} strokeWidth={1.9} />;
    case 'pulse': return <HeartPulse className={className} strokeWidth={1.9} />;
    case 'bed': return <BedSingle className={className} strokeWidth={1.9} />;
    case 'cigarette': return <Cigarette className={className} strokeWidth={1.9} />;
    case 'ruler': return <Ruler className={className} strokeWidth={1.9} />;
    case 'scale': return <Scale className={className} strokeWidth={1.9} />;
    case 'calendar': return <CalendarDays className={className} strokeWidth={1.9} />;
    case 'target': return <Target className={className} strokeWidth={1.9} />;
    case 'trend': return <TrendingUp className={className} strokeWidth={1.9} />;
    case 'flame': return <Flame className={className} strokeWidth={1.9} />;
    case 'check': return <CircleCheckBig className={className} strokeWidth={1.9} />;
    case 'card': return <CreditCard className={className} strokeWidth={1.9} />;
    case 'spark': return <Sparkles className={className} strokeWidth={1.9} />;
    case 'meal': return <UtensilsCrossed className={className} strokeWidth={1.9} />;
    case 'wallet': return <WalletMinimal className={className} strokeWidth={1.9} />;
    case 'heart': return <Heart className={className} strokeWidth={1.9} />;
    case 'brain': return <Brain className={className} strokeWidth={1.9} />;
    case 'moon': return <Moon className={className} strokeWidth={1.9} />;
    case 'bolt': return <Zap className={className} strokeWidth={1.9} />;
    case 'warning':
    case 'alert': return <TriangleAlert className={className} strokeWidth={1.9} />;
    case 'walk': return <Footprints className={className} strokeWidth={1.9} />;
    case 'coffee': return <Coffee className={className} strokeWidth={1.9} />;
    case 'wine': return <Wine className={className} strokeWidth={1.9} />;
    case 'info': return <Info className={className} strokeWidth={1.9} />;
    case 'plus': return <Plus className={className} strokeWidth={1.9} />;
    case 'menu': return <Ellipsis className={className} strokeWidth={1.9} />;
    case 'trash': return <X className={className} strokeWidth={2.2} />;
    case 'utensils': return <UtensilsCrossed className={className} strokeWidth={1.9} />;
    case 'gear': return <Settings2 className={className} strokeWidth={1.9} />;
    case 'arrow': return <ArrowRight className={className} strokeWidth={1.9} />;
    case 'activity': return <Activity className={className} strokeWidth={1.9} />;
    case 'pencil': return <Pencil className={className} strokeWidth={1.9} />;
    default: return <Sparkles className={className} strokeWidth={1.9} />;
  }
}

export function PulseIcon({ name, className = '' }: { name: PulseIconName; className?: string }) { return <LegacyPulseIcon name={name} className={className} />; }

export function MiniRing({ value, tone = 'accent', size = 64, stroke = 6 }: { value: number; tone?: 'accent' | 'success'; size?: number; stroke?: number }) {
  const safe = Math.max(0, Math.min(100, Math.round(value))); const radius = (size - stroke) / 2; const circumference = 2 * Math.PI * radius; const offset = circumference * (1 - safe / 100); const strokeColor = tone === 'success' ? 'var(--success)' : 'var(--accent)';
  return <div className={styles.miniRing} style={{ width: size, height: size }}><svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true"><circle cx={size / 2} cy={size / 2} r={radius} className={styles.miniRingTrack} strokeWidth={stroke} fill="none" /><circle cx={size / 2} cy={size / 2} r={radius} stroke={strokeColor} strokeWidth={stroke} fill="none" strokeLinecap="round" strokeDasharray={circumference} strokeDashoffset={offset} transform={`rotate(-90 ${size / 2} ${size / 2})`} className={styles.miniRingProgress} /></svg><span style={{ fontSize: Math.max(12, Math.round(size * 0.23)) }}>{safe}</span></div>;
}

export function SliderCard({ title, icon, value, display, min, max, step = 1, helper, onChange }: { title: string; icon: PulseIconName; value: string; display: string; min: number; max: number; step?: number; helper?: string; onChange: (value: string) => void }) {
  return <div className={styles.sliderCard}><div className={styles.sliderCardHead}><div className={styles.sliderCardLabel}><PulseIcon name={icon} className={styles.sliderCardIcon} /><span>{title}</span></div><strong>{display}</strong></div><input type="range" min={min} max={max} step={step} value={value} onChange={(event) => onChange(event.target.value)} className={styles.sliderInput} style={{ ['--slider-progress' as any]: `${Math.max(0, Math.min(100, ((Number(value) - min) / Math.max(max - min, 1)) * 100))}%` }} />{helper ? <div className={styles.sliderHelper}>{helper}</div> : null}</div>;
}

export function HealthSlider({ icon, label, value, onChange, min, max, step = 1, suffix = '', helper, asideLabel, tone = 'accent' }: { icon: PulseIconName; label: string; value: string; onChange: (value: string) => void; min: number; max: number; step?: number; suffix?: string; helper?: string; asideLabel?: string; tone?: 'accent' | 'success' | 'info' | 'danger' | 'purple' | 'warning' }) {
  const numericValue = Number(value || min); const percent = ((numericValue - min) / Math.max(max - min, 1)) * 100; const toneClassMap = { accent: styles.healthMiniIconAccent, success: styles.healthMiniIconSuccess, info: styles.healthMiniIconInfo, danger: styles.healthMiniIconDanger, purple: styles.healthMiniIconPurple, warning: styles.healthMiniIconAccent };
  return <div className={styles.healthSliderCard}><div className={styles.healthSliderHead}><div className={styles.healthSliderTitle}><span className={[styles.healthMiniIcon, toneClassMap[tone]].filter(Boolean).join(' ')}><PulseIcon name={icon} className={styles.healthMiniSvg} /></span><span>{label}</span></div><div className={styles.healthSliderValueWrap}>{asideLabel ? <span>{asideLabel}</span> : null}<strong>{value || min}{suffix}</strong></div></div><div className={styles.healthRangeWrap}><input type="range" min={min} max={max} step={step} value={value || String(min)} onChange={(event) => onChange(event.target.value)} className={styles.healthRange} style={{ ['--range-progress' as any]: `${percent}%` }} /></div>{helper ? <div className={styles.healthSliderHelper}>{helper}</div> : null}</div>;
}

export function FinanceEntryCompactRow({ entry, onEdit, onDelete }: { entry: PulseFinanceEntry; onEdit: (entry: PulseFinanceEntry) => void; onDelete: (id: string) => void }) {
  const meta = getFinanceCategoryMeta(entry.categoryName ?? entry.title); const recurrenceLabel = getRecurrenceLabel(entry.recurrenceJson); const amountClass = entry.type === 'INCOME' ? styles.financeAmountIncome : styles.financeAmountExpense; const amountLabel = formatMoney(entry.type === 'INCOME' ? entry.amount : -entry.amount); const timeLabel = formatTimeLabel(entry.createdAt); const timestampLabel = timeLabel === 'Без времени' ? formatShortDate(entry.date) : `${formatShortDate(entry.date)} · ${timeLabel}`;
  return <article className={styles.financeOperationRow}><div className={styles.financeOperationMain}><span className={[styles.financeEntryIconWrap, styles.financeOperationIconWrap, styles[`financeTone${meta.tone[0].toUpperCase() + meta.tone.slice(1)}` as keyof typeof styles] as string].filter(Boolean).join(' ')}><PulseIcon name={meta.icon} className={styles.financeEntryIcon} /></span><div className={styles.financeOperationCopy}><div className={styles.financeOperationTitleRow}><strong title={entry.title}>{entry.title}</strong>{recurrenceLabel ? <em className={styles.financeRecurringPill}>{recurrenceLabel}</em> : null}</div><span title={getFinanceCategoryLabel(entry.categoryName)}>{getFinanceCategoryLabel(entry.categoryName)}</span></div></div><div className={styles.financeOperationMeta}><strong className={amountClass}>{amountLabel}</strong><span>{timestampLabel}</span></div><details className={styles.financeEntryMenu}><summary className={styles.financeEntryMenuButton} aria-label={entry.type === 'INCOME' ? 'Действия с доходом' : 'Действия с расходом'}><PulseIcon name="menu" className={styles.financeEntryActionSvg} /></summary><div className={styles.financeEntryMenuBody}><button type="button" className={styles.financeEntryMenuAction} onClick={() => onEdit(entry)}><PulseIcon name="pencil" className={styles.financeEntryActionSvg} />Редактировать</button><button type="button" className={[styles.financeEntryMenuAction, styles.financeEntryMenuActionDanger].filter(Boolean).join(' ')} onClick={() => onDelete(entry.id)}><PulseIcon name="trash" className={styles.financeEntryActionSvg} />Удалить</button></div></details></article>;
}

export function FinanceShareParticipants({ shareMeta, title }: { shareMeta?: PulseFinanceShareMeta | null; title: string }) {
  const participants = shareMeta?.participants ?? [];
  if (!participants.length) return null;

  return (
    <div className={styles.financeSocialMeta}>
      <div className={styles.financeSocialHeader}>
        <strong>{title}</strong>
        {shareMeta?.progressLabel ? <span>{shareMeta.progressLabel}</span> : null}
      </div>

      <div className={styles.financeSocialParticipants}>
        {participants.map((participant) => {
          const progress = participant.progressPercent != null ? Math.max(0, Math.min(100, participant.progressPercent)) : null;
          return (
            <div key={`${participant.userId}-${participant.username}`} className={styles.financeContributionRow}>
              <div className={styles.financeContributionIdentity}>
                <span className={styles.financeContributionAvatar}>{getParticipantInitials(participant.username)}</span>
                <div className={styles.financeContributionCopy}>
                  <strong>{participant.username}</strong>
                  <span>{participant.summary ?? participant.statusLabel ?? participant.currentLabel ?? 'Без взносов'}</span>
                </div>
              </div>

              <div className={styles.financeContributionAmount}>
                <strong>{participant.currentLabel ?? '0 ₽'}</strong>
                <span>{participant.totalLabel ? `из ${participant.totalLabel}` : progress != null ? `${progress}%` : ''}</span>
              </div>

              {progress != null ? (
                <div className={styles.financeContributionProgress}>
                  <div className={styles.financeContributionProgressTrack}>
                    <span style={{ width: `${Math.max(progress, progress > 0 ? 8 : 0)}%` }} />
                  </div>
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function FinanceComparisonMetricCard({ label, current, previous, positiveTrend }: { label: string; current: number; previous: number; positiveTrend: 'up' | 'down' }) {
  const delta = current - previous; const deltaClass = getDeltaToneClass(delta, positiveTrend);
  return <article className={[styles.financeComparisonCard, styles.financeComparisonCardDetailed].join(' ')}><span>{label}</span><strong>{formatMoney(current)}</strong><div className={styles.financeComparisonMetaRows}><div><span>Прошлый месяц</span><strong>{formatMoney(previous)}</strong></div><em className={[styles.financeDeltaPill, deltaClass].filter(Boolean).join(' ')}>{formatMoneyDelta(delta)}</em></div></article>;
}
