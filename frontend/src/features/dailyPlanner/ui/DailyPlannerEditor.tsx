'use client';

import { useMemo, useState } from 'react';
import { Check } from 'lucide-react';
import type { Dispatch, SetStateAction } from 'react';
import { Button } from '@/shared/ui/Button/Button';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import type { PulseTaskItem } from '@/shared/types/pulse';
import styles from './DailyPlanner.module.css';
import drawerStyles from './DailyPlannerEditor.module.css';

type EditorState = {
  title: string;
  notes: string;
  date: string;
  time: string;
  endTime: string;
};

type ActiveTaskState = {
  task: PulseTaskItem;
  occurrenceDate: string;
};

export function DailyPlannerEditor({
  activeTask,
  editor,
  setEditor,
  saving,
  onSave,
  onClose,
  onToggleTask,
  relatedTasks,
  sourceDetails,
}: {
  activeTask: ActiveTaskState | null;
  editor: EditorState;
  setEditor: Dispatch<SetStateAction<EditorState>>;
  saving: boolean;
  onSave: () => void;
  onClose: () => void;
  onToggleTask: (taskId: string, date: string) => void;
  relatedTasks: PulseTaskItem[];
  sourceDetails: (task: PulseTaskItem) => { typeLabel: string; originLabel: string; assignmentLabel?: string | null };
}) {
  const isMobile = useIsMobile(960);
  const [showDetails, setShowDetails] = useState(false);

  const meta = useMemo(() => (activeTask ? sourceDetails(activeTask.task) : null), [activeTask, sourceDetails]);
  const hasDetails = Boolean(
    meta
    && (meta.assignmentLabel || meta.originLabel || activeTask?.task.sourceEventTitle || activeTask?.task.socialEventRole === 'EVENT'),
  );

  if (!activeTask || !meta) return null;

  const body = (
    <div className={drawerStyles.body}>
      <div className={styles.modalGrid}>
        <label className={styles.modalField}>
          <span>Название</span>
          <input
            value={editor.title}
            onChange={(event) => setEditor((prev) => ({ ...prev, title: event.target.value }))}
            placeholder="Название задачи"
          />
        </label>

        <label className={styles.modalField}>
          <span>Описание</span>
          <textarea
            rows={4}
            value={editor.notes}
            onChange={(event) => setEditor((prev) => ({ ...prev, notes: event.target.value }))}
            placeholder="Подробности задачи"
          />
        </label>

        <div className={styles.modalTimeGrid}>
          <label className={styles.modalField}>
            <span>Дата</span>
            <input
              type="date"
              value={editor.date}
              disabled={activeTask.task.taskType !== 'ONE_TIME'}
              onChange={(event) => setEditor((prev) => ({ ...prev, date: event.target.value }))}
            />
          </label>
          <label className={styles.modalField}>
            <span>Начало</span>
            <input
              type="time"
              value={editor.time}
              onChange={(event) => setEditor((prev) => ({ ...prev, time: event.target.value }))}
            />
          </label>
          <label className={styles.modalField}>
            <span>До скольки</span>
            <input
              type="time"
              value={editor.endTime}
              min={editor.time || undefined}
              onChange={(event) => setEditor((prev) => ({ ...prev, endTime: event.target.value }))}
            />
          </label>
        </div>
      </div>

      <div className={drawerStyles.primaryActions}>
        <Button onClick={() => onToggleTask(activeTask.task.id, activeTask.occurrenceDate)}>
          {activeTask.task.completedForDate ? 'Снять выполнение' : 'Отметить выполненной'}
        </Button>
        <Button variant="primary" onClick={onSave} disabled={saving || !editor.title.trim()} loading={saving}>
          Сохранить
        </Button>
      </div>

      {hasDetails ? (
        <section className={drawerStyles.detailsSection}>
          <button
            type="button"
            className={drawerStyles.detailsToggle}
            onClick={() => setShowDetails((prev) => !prev)}
            aria-expanded={showDetails}
          >
            <span>Детали</span>
            <strong>{showDetails ? 'Скрыть' : 'Показать'}</strong>
          </button>

          {showDetails ? (
            <div className={drawerStyles.detailsBody}>
              <div className={styles.modalMeta}>
                <span className={styles.modalChip}>{meta.typeLabel}</span>
                <span className={styles.modalChip}>{meta.originLabel}</span>
                {meta.assignmentLabel ? <span className={styles.modalChip}>{meta.assignmentLabel}</span> : null}
              </div>

              {activeTask.task.sourceEventTitle && activeTask.task.socialEventRole === 'SUBTASK' ? (
                <div className={styles.sourcePanel}>Событие: {activeTask.task.sourceEventTitle}</div>
              ) : null}

              {activeTask.task.socialEventRole === 'EVENT' ? (
                <div className={styles.relatedSection}>
                  <div className={styles.relatedHeader}>
                    <span>Задачи внутри события</span>
                    <strong>{relatedTasks.filter((item) => item.completedForDate).length}/{relatedTasks.length}</strong>
                  </div>

                  {relatedTasks.length ? (
                    <div className={styles.relatedList}>
                      {relatedTasks.map((task) => {
                        const itemMeta = sourceDetails(task);
                        const taskDate = (() => {
                          const raw = task.dueDate ? new Date(task.dueDate) : null;
                          if (!raw || Number.isNaN(raw.getTime())) return activeTask.occurrenceDate;
                          const yyyy = raw.getFullYear();
                          const mm = String(raw.getMonth() + 1).padStart(2, '0');
                          const dd = String(raw.getDate()).padStart(2, '0');
                          return `${yyyy}-${mm}-${dd}`;
                        })();

                        return (
                          <div key={task.occurrenceKey ?? `${task.id}:${taskDate}`} className={styles.relatedRow}>
                            <button
                              type="button"
                              className={[styles.relatedCheckbox, task.completedForDate ? styles.relatedCheckboxDone : ''].filter(Boolean).join(' ')}
                              onClick={() => onToggleTask(task.id, taskDate)}
                              aria-label={task.completedForDate ? 'Снять выполнение' : 'Отметить выполненной'}
                            >
                              {task.completedForDate ? <Check className={styles.checkboxIcon} strokeWidth={3} /> : null}
                            </button>
                            <div className={styles.relatedText}>
                              <strong>{task.title}</strong>
                              <span>{itemMeta.assignmentLabel || itemMeta.originLabel}</span>
                            </div>
                            <div className={styles.relatedSide}>
                              {task.timeLabel ? <span>{task.timeLabel}</span> : null}
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  ) : (
                    <div className={styles.emptyInline}>У этого события пока нет отдельных задач.</div>
                  )}
                </div>
              ) : null}
            </div>
          ) : null}
        </section>
      ) : null}
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet
        open={Boolean(activeTask)}
        onClose={onClose}
        title={activeTask.task.title || 'Задача'}
      >
        {body}
      </MobileSheet>
    );
  }

  return (
    <div className={drawerStyles.backdrop} onMouseDown={onClose}>
      <aside className={drawerStyles.drawer} onMouseDown={(event) => event.stopPropagation()} role="dialog" aria-modal="true" aria-label={activeTask.task.title || 'Редактор задачи'}>
        <div className={drawerStyles.header}>
          <div>
            <strong>{activeTask.task.title || 'Задача'}</strong>
            <span>{activeTask.task.timeLabel ? `Запланировано на ${activeTask.task.timeLabel}` : 'Задача без времени'}</span>
          </div>
          <Button onClick={onClose}>Закрыть</Button>
        </div>
        {body}
      </aside>
    </div>
  );
}
