'use client';

import Link from 'next/link';
import { Icon } from '@/shared/ui/Icon/Icon';
import type {
  ProgramAccessMode,
  ProgramAccessSource,
  ProgramActionType,
  ProgramIntegrationType,
  ProgramLifecycleStatus,
  ProgramRecoveryResolution,
  ProgramScope,
  ProgramSessionJoinMode,
  ProgramSessionStartMode,
  ProgramSessionStatus,
  ProgramShareMode,
  ProgramStructureType,
  ProgramRunStatus,
} from '@/shared/types/programs';
import styles from './ProgramsShell.module.css';

export type ProgramsScreen = 'detail' | 'run' | 'session' | 'builder';

export function buildHealthProgramsHref(options: {
  screen?: ProgramsScreen | null;
  programId?: string | null;
  runId?: string | null;
  sessionId?: string | null;
  programsView?: string | null;
} = {}) {
  const params = new URLSearchParams();
  params.set('tab', 'programs');
  if (options.programsView) params.set('programsView', options.programsView);
  if (options.screen) params.set('programScreen', options.screen);
  if (options.programId) params.set('programId', options.programId);
  if (options.runId) params.set('runId', options.runId);
  if (options.sessionId) params.set('sessionId', options.sessionId);
  return `/health?${params.toString()}`;
}

export function formatProgramDate(value?: string | null, withTime = false) {
  if (!value) return 'Не задано';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return 'Не задано';
  return new Intl.DateTimeFormat('ru-RU', withTime ? { day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' } : { day: 'numeric', month: 'long' }).format(date);
}

export function scopeLabel(scope: ProgramScope) {
  if (scope === 'active') return 'Активные';
  if (scope === 'library') return 'Библиотека';
  if (scope === 'mine') return 'Мои программы';
  if (scope === 'collaborative') return 'Совместные';
  return 'Черновики';
}

export function scopeHint(scope: ProgramScope) {
  if (scope === 'active') return 'Текущие прохождения и паузы';
  if (scope === 'library') return 'Опубликованные программы, которые можно запустить';
  if (scope === 'mine') return 'Ваши программы и версии';
  if (scope === 'collaborative') return 'Сессии с общей видимостью прогресса';
  return 'Неопубликованные черновики конструктора';
}

export function accessModeLabel(value?: ProgramAccessMode | string | null) {
  if (value === 'PRIVATE') return 'Приватная';
  if (value === 'RESTRICTED') return 'По приглашению';
  if (value === 'PUBLIC') return 'Публичная';
  return value ? String(value) : 'Не задано';
}

export function accessModeHint(value?: ProgramAccessMode | string | null) {
  if (value === 'PRIVATE') return 'Видна только вам. Личный формат без приглашений и совместных сессий.';
  if (value === 'RESTRICTED') return 'Доступ открывается по приглашению. После принятия можно пройти программу лично или вместе.';
  if (value === 'PUBLIC') return 'Любой может открыть программу, начать её для себя или присоединиться по ссылке.';
  return 'Режим доступа не задан.';
}

export function accessSourceLabel(value?: ProgramAccessSource | string | null) {
  if (value === 'OWNER') return 'Вы автор';
  if (value === 'PUBLIC') return 'Открыта всем';
  if (value === 'INVITED') return 'Доступ по приглашению';
  if (value === 'PRIVATE_SELF') return 'Только для вас';
  return value ? String(value) : 'Доступ';
}

export function structureTypeLabel(value?: ProgramStructureType | string | null) {
  if (value === 'FIXED_DURATION') return 'Фиксированная';
  if (value === 'ROLLING') return 'Гибкая';
  if (value === 'OPEN_ENDED') return 'Без срока';
  return value ? String(value) : 'Не задано';
}

export function lifecycleStatusLabel(value?: ProgramLifecycleStatus | string | null) {
  if (value === 'DRAFT') return 'Черновик';
  if (value === 'PUBLISHED') return 'Опубликована';
  if (value === 'ARCHIVED') return 'Архив';
  return value ? String(value) : 'Не задано';
}

export function runStatusLabel(value?: ProgramRunStatus | string | null) {
  if (value === 'ACTIVE') return 'Активна';
  if (value === 'PAUSED') return 'На паузе';
  if (value === 'CANCELLED') return 'Отменена';
  if (value === 'COMPLETED') return 'Завершена';
  if (value === 'ARCHIVED') return 'В архиве';
  if (value === 'DELETED') return 'Удалена';
  return value ? String(value) : 'Не задано';
}

export function sessionStatusLabel(value?: ProgramSessionStatus | string | null) {
  if (value === 'DRAFT') return 'Черновик';
  if (value === 'ACTIVE') return 'Активна';
  if (value === 'SCHEDULED') return 'Запланирована';
  if (value === 'COMPLETED') return 'Завершена';
  if (value === 'CANCELLED') return 'Отменена';
  if (value === 'ARCHIVED') return 'В архиве';
  return value ? String(value) : 'Не задано';
}

export function joinModeLabel(value?: ProgramSessionJoinMode | string | null) {
  if (value === 'INVITE_ONLY') return 'Только по приглашению';
  if (value === 'LINK') return 'По ссылке';
  if (value === 'OPEN') return 'Открытая';
  return value ? String(value) : 'Не задано';
}

export function startModeLabel(value?: ProgramSessionStartMode | string | null) {
  if (value === 'NOW') return 'Сразу';
  if (value === 'SCHEDULED') return 'По расписанию';
  if (value === 'HOST_MANUAL') return 'Стартует владелец';
  if (value === 'AUTO_ON_ACCEPT') return 'Автостарт после принятия';
  return value ? String(value) : 'Не задано';
}

export function startModeHint(value?: ProgramSessionStartMode | string | null) {
  if (value === 'NOW') return 'Сессия уже запущена и создаёт прохождения сразу.';
  if (value === 'SCHEDULED') return 'Сессия стартует по выбранной дате.';
  if (value === 'HOST_MANUAL') return 'Участники собираются, а запуск делает владелец.';
  if (value === 'AUTO_ON_ACCEPT') return 'Старт произойдёт автоматически после принятия приглашения.';
  return 'Режим старта не задан.';
}

export function shareModeLabel(value?: ProgramShareMode | string | null) {
  if (value === 'SNAPSHOT') return 'Снимок';
  if (value === 'REFERENCE') return 'Ссылка';
  if (value === 'INVITE') return 'Приглашение';
  return value ? String(value) : 'Не задано';
}

export function actionTypeLabel(value?: ProgramActionType | string | null) {
  if (value === 'TASK') return 'Задача';
  if (value === 'HEALTH_CHECKIN') return 'Чек-ин';
  if (value === 'NUTRITION_TARGET') return 'Питание';
  if (value === 'FINANCE_TARGET') return 'Финансы';
  if (value === 'JOURNAL') return 'Дневник';
  if (value === 'REFLECTION') return 'Рефлексия';
  if (value === 'REMINDER') return 'Напоминание';
  if (value === 'INFO_ONLY') return 'Инфо-блок';
  if (value === 'MILESTONE') return 'Майлстоун';
  if (value === 'CUSTOM') return 'Свой шаг';
  return value ? String(value) : 'Не задано';
}

export function integrationTypeLabel(value?: ProgramIntegrationType | string | null) {
  if (value === 'NONE') return 'Без интеграции';
  if (value === 'TASK_TRACKER') return 'Task Tracker';
  if (value === 'HEALTH') return 'Health';
  if (value === 'NUTRITION') return 'Nutrition';
  if (value === 'FINANCE') return 'Finance';
  if (value === 'JOURNAL') return 'Журнал';
  if (value === 'REMINDER') return 'Напоминание';
  if (value === 'PULSE_WIDGET') return 'Виджет Pulse';
  return value ? String(value) : 'Не задано';
}

export function recoveryLabel(value?: ProgramRecoveryResolution | string | null) {
  if (value === 'CONTINUE_CURRENT_DAY') return 'Продолжить сегодня';
  if (value === 'SOFT_CATCH_UP') return 'Мягко догнать';
  if (value === 'SHIFT_FORWARD') return 'Сдвинуть дальше';
  if (value === 'RECOVERY_DAY') return 'День восстановления';
  if (value === 'SKIP_DAY') return 'Пропустить день';
  if (value === 'COMPLETE_AS_DONE') return 'Отметить как выполнено';
  if (value === 'COMPLETE_PARTIAL') return 'Отметить частично';
  return value ? String(value) : 'Не задано';
}

export function achievementKindLabel(value?: string | null) {
  if (value === 'PROGRAM_COMPLETION') return 'Завершение программы';
  if (value === 'STAGE_COMPLETION') return 'Завершение этапа';
  if (value === 'STREAK') return 'Серия';
  if (value === 'ADHERENCE') return 'Следование плану';
  if (value === 'RECOVERY') return 'Возврат после паузы';
  if (value === 'COLLABORATIVE') return 'Совместное прохождение';
  if (value === 'MILESTONE') return 'Майлстоун';
  return value ? String(value) : 'Достижение Pulse';
}

export function dayStatusLabel(value?: string | null) {
  if (value === 'UPCOMING') return 'Впереди';
  if (value === 'ACTIVE') return 'Активен';
  if (value === 'COMPLETED') return 'Завершён';
  if (value === 'SKIPPED') return 'Пропущен';
  if (value === 'MISSED') return 'Не выполнен';
  if (value === 'RECOVERY') return 'Восстановление';
  if (value === 'ARCHIVED') return 'В архиве';
  return value ? String(value) : 'Не задано';
}

export function actionStatusLabel(value?: string | null) {
  if (value === 'PENDING') return 'Ждёт выполнения';
  if (value === 'COMPLETED') return 'Выполнено';
  if (value === 'SKIPPED') return 'Пропущено';
  if (value === 'MISSED') return 'Не выполнено';
  if (value === 'RESCHEDULED') return 'Перенесено';
  if (value === 'CANCELLED') return 'Отменено';
  return value ? String(value) : 'Не задано';
}

export function memberRoleLabel(value?: string | null) {
  if (value === 'HOST') return 'Владелец';
  if (value === 'MEMBER') return 'Участник';
  return value ? String(value) : 'Не задано';
}

export function memberStatusLabel(value?: string | null) {
  if (value === 'PENDING') return 'Ожидает';
  if (value === 'ACCEPTED') return 'Принял';
  if (value === 'DECLINED') return 'Отклонил';
  if (value === 'LEFT') return 'Вышел';
  return value ? String(value) : 'Не задано';
}

export function inviteStatusLabel(value?: string | null) {
  if (value === 'PENDING') return 'Ожидает';
  if (value === 'ACCEPTED') return 'Принято';
  if (value === 'DECLINED') return 'Отклонено';
  if (value === 'EXPIRED') return 'Истекло';
  return value ? String(value) : 'Не задано';
}

export function sessionReadinessLabel(value?: { accepted?: number; pending?: number } | null) {
  const accepted = value?.accepted ?? 0;
  const pending = value?.pending ?? 0;
  if (pending > 0) return `Готовы ${accepted}, ждём ещё ${pending}`;
  return accepted > 0 ? `Готовы все: ${accepted}` : 'Пока никто не готов';
}

export function ProgramsContextBar({
  active,
  backHref = '/health?tab=programs',
  backLabel = 'К Pulse',
  hideNav = false,
}: {
  active: 'programs' | 'builder' | 'run' | 'session' | 'achievements';
  backHref?: string;
  backLabel?: string;
  hideNav?: boolean;
}) {
  return (
    <div className={styles.contextBar}>
      <Link href={backHref} className={styles.contextBack}>
        <Icon name="arrowLeft" size={16} />
        <span>{backLabel}</span>
      </Link>

      {!hideNav ? (
        <div className={styles.contextNav}>
          <Link href="/health?tab=programs" className={[styles.contextLink, active !== 'achievements' ? styles.contextLinkActive : ''].filter(Boolean).join(' ')}>
            <Icon name="pulse" size={15} />
            <span>{active === 'builder' ? 'Конструктор' : active === 'run' ? 'Прохождение' : active === 'session' ? 'Сессия' : 'Программы'}</span>
          </Link>
          <Link href="/health/achievements" className={[styles.contextLink, active === 'achievements' ? styles.contextLinkActive : ''].filter(Boolean).join(' ')}>
            <Icon name="sparkles" size={15} />
            <span>Достижения</span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}
