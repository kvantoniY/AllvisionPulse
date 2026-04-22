'use client';

import { useMemo } from 'react';
import FullCalendar from '@fullcalendar/react';
import interactionPlugin, { type EventResizeDoneArg } from '@fullcalendar/interaction';
import timeGridPlugin from '@fullcalendar/timegrid';
import ruLocale from '@fullcalendar/core/locales/ru';
import type { DateSelectArg, EventClickArg, EventContentArg, EventDropArg, EventInput } from '@fullcalendar/core';
import { extractApiError } from '@/shared/lib/apiError';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import type { PulseTaskItem } from '@/shared/types/pulse';
import styles from './TasksCalendarBoard.module.css';

const DEFAULT_DURATION_MINUTES = 45;

type CalendarCreateDefaults = {
  date: string;
  time?: string | null;
  endTime?: string | null;
  allDay: boolean;
};

type Props = {
  selectedDate: string;
  tasks: PulseTaskItem[];
  loading?: boolean;
  onOpenTask: (task: PulseTaskItem) => void;
  onCreateTask: (defaults: CalendarCreateDefaults) => void;
  onUpdateTask: (taskId: string, body: Record<string, unknown>) => Promise<void>;
  onToast: (message: string) => void;
};

function toDateKey(date: Date) {
  const yyyy = date.getFullYear();
  const mm = String(date.getMonth() + 1).padStart(2, '0');
  const dd = String(date.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

function toTimeValue(date: Date) {
  return `${String(date.getHours()).padStart(2, '0')}:${String(date.getMinutes()).padStart(2, '0')}`;
}

function shiftDateKey(value: string, deltaDays: number) {
  const next = new Date(`${value}T00:00:00`);
  next.setDate(next.getDate() + deltaDays);
  return toDateKey(next);
}

function addMinutes(date: Date | string, amount: number) {
  const next = new Date(date);
  next.setMinutes(next.getMinutes() + amount);
  return next;
}

function taskDateKey(task: PulseTaskItem) {
  if (task.dueDate) return task.dueDate.slice(0, 10);
  if (task.occurrenceKey?.includes(':')) return task.occurrenceKey.split(':')[1] ?? null;
  return null;
}

function isTaskOverdue(task: PulseTaskItem, selectedDate: string) {
  const dueDate = taskDateKey(task);
  return Boolean(dueDate && dueDate < selectedDate && !task.completedForDate);
}

function buildDisplayEnd(task: PulseTaskItem) {
  if (!task.hasTime || !task.dueDate) return undefined;
  return task.endDate ?? addMinutes(task.dueDate, DEFAULT_DURATION_MINUTES).toISOString();
}

function buildDropBody(task: PulseTaskItem, start: Date, end: Date | null, allDay: boolean) {
  const nextDate = toDateKey(start);
  const body: Record<string, unknown> = {};

  if (task.taskType === 'ONE_TIME') {
    body.date = nextDate;
  }

  if (allDay) {
    body.time = null;
    body.endTime = null;
    body.endDate = null;
    return body;
  }

  body.time = toTimeValue(start);

  if (task.endDate) {
    const safeEnd = end ?? addMinutes(start, DEFAULT_DURATION_MINUTES);
    const endDateKey = toDateKey(safeEnd);
    body.endTime = toTimeValue(safeEnd);
    body.endDate = endDateKey !== nextDate ? endDateKey : null;
  }

  return body;
}

function buildResizeBody(task: PulseTaskItem, start: Date, end: Date | null) {
  const safeEnd = end ?? addMinutes(start, DEFAULT_DURATION_MINUTES);
  const startDateKey = toDateKey(start);
  const endDateKey = toDateKey(safeEnd);
  const body: Record<string, unknown> = {
    time: toTimeValue(start),
    endTime: toTimeValue(safeEnd),
    endDate: endDateKey !== startDateKey ? endDateKey : null,
  };

  if (task.taskType === 'ONE_TIME') {
    body.date = startDateKey;
  }

  return body;
}

function renderEventContent(eventInfo: EventContentArg) {
  const task = eventInfo.event.extendedProps.task as PulseTaskItem | undefined;
  const done = Boolean(task?.completedForDate);

  return (
    <div className={styles.eventContent}>
      {!eventInfo.event.allDay && eventInfo.timeText ? (
        <div className={styles.eventTime}>{eventInfo.timeText}</div>
      ) : null}
      <div className={[styles.eventTitle, done ? styles.eventTitleDone : ''].filter(Boolean).join(' ')}>
        {eventInfo.event.title}
      </div>
    </div>
  );
}

export function TasksCalendarBoard({
  selectedDate,
  tasks,
  loading = false,
  onOpenTask,
  onCreateTask,
  onUpdateTask,
  onToast,
}: Props) {
  const isMobile = useIsMobile(900);

  const calendarEvents = useMemo<EventInput[]>(() => {
    return tasks.map((task) => {
      const dueDateKey = taskDateKey(task) ?? selectedDate;
      const allDay = !task.hasTime;
      const classNames = [styles.calendarEvent];

      if (allDay) classNames.push(styles.calendarEventAllDay);
      if (task.completedForDate) {
        classNames.push(styles.calendarEventDone);
      } else if (isTaskOverdue(task, selectedDate)) {
        classNames.push(styles.calendarEventOverdue);
      } else if (task.taskType === 'REGULAR') {
        classNames.push(styles.calendarEventRegular);
      }

      return {
        id: task.occurrenceKey ?? task.id,
        title: task.title,
        start: allDay ? dueDateKey : task.dueDate ?? dueDateKey,
        end: allDay ? shiftDateKey(dueDateKey, 1) : buildDisplayEnd(task),
        allDay,
        editable: true,
        durationEditable: Boolean(task.hasTime || task.taskType === 'ONE_TIME'),
        classNames,
        extendedProps: {
          task,
        },
      };
    });
  }, [selectedDate, tasks]);

  const handleEventClick = (info: EventClickArg) => {
    const task = info.event.extendedProps.task as PulseTaskItem | undefined;
    if (task) onOpenTask(task);
  };

  const handleSelect = (info: DateSelectArg) => {
    const date = toDateKey(info.start);

    if (info.allDay) {
      onCreateTask({ date, allDay: true });
      return;
    }

    const end = info.end ?? addMinutes(info.start, DEFAULT_DURATION_MINUTES);
    onCreateTask({
      date,
      time: toTimeValue(info.start),
      endTime: toTimeValue(end),
      allDay: false,
    });
  };

  const handleEventDrop = async (info: EventDropArg) => {
    const task = info.event.extendedProps.task as PulseTaskItem | undefined;
    if (!task || !info.event.start) return;

    try {
      const body = buildDropBody(task, info.event.start, info.event.end, info.event.allDay);
      await onUpdateTask(task.id, body);
    } catch (error) {
      info.revert();
      onToast(extractApiError(error).message || 'Не удалось перенести задачу');
    }
  };

  const handleEventResize = async (info: EventResizeDoneArg) => {
    const task = info.event.extendedProps.task as PulseTaskItem | undefined;
    if (!task || !info.event.start || info.event.allDay) return;

    try {
      const body = buildResizeBody(task, info.event.start, info.event.end);
      await onUpdateTask(task.id, body);
    } catch (error) {
      info.revert();
      onToast(extractApiError(error).message || 'Не удалось изменить длительность задачи');
    }
  };

  return (
    <div className={styles.calendarShell}>
      <div className={styles.calendarHint}>
        {loading
          ? 'Загружаем календарь задач…'
          : isMobile
            ? 'Расширенный режим показывает выбранный день. Выдели слот для новой задачи или перетащи существующую.'
            : 'Расширенный режим показывает неделю. Выдели слот для новой задачи, перетаскивай задачи и меняй их длительность.'}
      </div>

      <div className={styles.calendarViewport}>
        <FullCalendar
          key={`${selectedDate}:${isMobile ? 'day' : 'week'}`}
          plugins={[timeGridPlugin, interactionPlugin]}
          locale={ruLocale}
          initialView={isMobile ? 'timeGridDay' : 'timeGridWeek'}
          initialDate={selectedDate}
          headerToolbar={false}
          firstDay={1}
          allDaySlot
          allDayText="Без времени"
          selectable
          selectMirror
          editable
          eventDurationEditable
          eventResizableFromStart
          eventOverlap
          slotEventOverlap={false}
          nowIndicator
          weekends
          height={isMobile ? 740 : 860}
          expandRows={false}
          scrollTime={isMobile ? '07:00:00' : '06:30:00'}
          scrollTimeReset={false}
          slotMinTime="06:00:00"
          slotMaxTime="24:00:00"
          slotDuration="00:30:00"
          snapDuration="00:15:00"
          eventTimeFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          slotLabelFormat={{ hour: '2-digit', minute: '2-digit', hour12: false }}
          dayHeaderFormat={{ weekday: 'short', day: 'numeric' }}
          events={calendarEvents}
          eventClick={handleEventClick}
          select={handleSelect}
          eventDrop={(info) => void handleEventDrop(info)}
          eventResize={(info) => void handleEventResize(info)}
          eventAllow={(dropInfo, draggedEvent) => {
            if (!draggedEvent) return false;
            const task = draggedEvent.extendedProps.task as PulseTaskItem | undefined;
            if (!task) return false;

            if (task.taskType === 'ONE_TIME') return true;

            const originalDate = taskDateKey(task);
            if (!originalDate) return true;

            return toDateKey(dropInfo.start) === originalDate;
          }}
          eventContent={renderEventContent}
        />
      </div>
    </div>
  );
}
