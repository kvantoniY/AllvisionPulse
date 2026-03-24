'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostComposer.module.css';
import { Card } from '@/shared/ui/Card/Card';
import { StoryRingAvatar } from '@/features/stories';
import { Button } from '@/shared/ui/Button/Button';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useCreatePostMutation } from '@/shared/api/postsApi';
import { useGetTodayQuery, useGetStatsQuery } from '@/shared/api/healthApi';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';

const MAX_TEXT = 5000;

function useAutosizeTextArea(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    const next = Math.min(el.scrollHeight, 260);
    el.style.height = `${next}px`;
  }, [ref, value]);
}

type HealthWidget = {
  type: 'health';
  date: string | null;
  todayScore: number | null;
  pulse7Score: number | null;
};

export function PostComposer({ context = 'feed' }: { context?: 'feed' | 'profile' }) {
  const { data, isFetching: meFetching } = useGetMeQuery();
  const me = data?.user;

  const [text, setText] = useState('');
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  useAutosizeTextArea(textRef, text);

  const [images, setImages] = useState<File[]>([]);
  const previews = useMemo(() => images.map((f) => ({ f, url: URL.createObjectURL(f) })), [images]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const [widget, setWidget] = useState<HealthWidget | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);

  const { data: today, isFetching: widgetLoading } = useGetTodayQuery(undefined, { skip: !widgetOpen });
  const { data: stats7, isFetching: statsLoading } = useGetStatsQuery(7, { skip: !widgetOpen });
  const [createPost, { isLoading }] = useCreatePostMutation();

  const remaining = MAX_TEXT - text.length;
  const canSubmit = (!!text.trim() || images.length > 0 || !!widget) && remaining >= 0 && !isLoading;

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setImages((prev) => [...prev, ...arr].slice(0, 10));
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    await createPost({ text: text.trim() ? text : '', images, widgetsJson: widget }).unwrap().catch(() => null);
    setText('');
    setImages([]);
    setWidget(null);
  };

  const pickTodayWidget = () => {
    const day = today?.day as any;
    const rows = stats7?.rows ?? [];
    const last = rows.length ? rows[rows.length - 1] : null;
    setWidget({
      type: 'health',
      date: day?.date ?? null,
      todayScore: typeof day?.todayScore === 'number' ? day.todayScore : typeof last?.todayScore === 'number' ? last.todayScore : null,
      pulse7Score: typeof day?.pulse7Score === 'number' ? day.pulse7Score : typeof last?.pulse7Score === 'number' ? last.pulse7Score : null,
    });
    setWidgetOpen(false);
  };

  if (meFetching && !me) {
    return (
      <Card className={styles.card}>
        <div className={styles.row}>
          <Skeleton circle style={{ width: 46, height: 46 }} />
          <div className={styles.inputWrap}>
            <SkeletonText lines={3} />
            <div className={styles.tools}>
              <div className={styles.leftTools}>
                <Skeleton style={{ width: 44, height: 44 }} />
                <Skeleton style={{ width: 44, height: 44 }} />
              </div>
              <div className={styles.meta}>
                <Skeleton style={{ width: 32, height: 16 }} />
                <Skeleton style={{ width: 120, height: 44 }} />
              </div>
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (!me) return null;

  return (
    <Card className={styles.card}>
      <Modal open={widgetOpen} onClose={() => setWidgetOpen(false)} title="Добавить виджет">
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
            Сейчас можно прикрепить краткий виджет со сводкой по дню и недельным пульсом.
          </div>
          {widgetLoading || statsLoading ? <SkeletonText lines={3} /> : null}
          <Button variant="primary" onClick={pickTodayWidget} loading={widgetLoading || statsLoading}>
            Добавить сводку дня
          </Button>
          {widget ? <div style={{ color: 'var(--text-soft)', fontSize: 13 }}>Выбрано: {widget.todayScore ?? '—'}% / {widget.pulse7Score ?? '—'}%</div> : null}
        </div>
      </Modal>

      <div className={styles.row}>
        <StoryRingAvatar userId={me.id} url={me.avatarUrl} name={me.username} size={46} />
        <div className={styles.inputWrap}>
          <textarea
            ref={textRef}
            className={styles.textarea}
            placeholder={context === 'profile' ? 'Поделитесь чем-нибудь в профиле…' : 'Что нового?'}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT + 50))}
          />

          {widget ? (
            <div style={{ marginTop: 10 }}>
              <span className={styles.widgetTag}>
                <Icon name="sparkles" size={14} />
                Сводка дня: {widget.todayScore ?? '—'}% / {widget.pulse7Score ?? '—'}%
                <button className={styles.widgetRemove} onClick={() => setWidget(null)} type="button" aria-label="Удалить виджет">
                  <Icon name="close" size={14} />
                </button>
              </span>
            </div>
          ) : null}

          {previews.length ? (
            <div className={styles.previews}>
              {previews.map((p, idx) => (
                <div className={styles.preview} key={p.url}>
                  <img src={p.url} alt="" />
                  <button className={styles.remove} type="button" onClick={() => setImages((arr) => arr.filter((_, i) => i !== idx))} aria-label="Удалить изображение">
                    <Icon name="close" size={14} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.tools}>
            <div className={styles.leftTools}>
              <label className={styles.toolBtn} title="Добавить фото" aria-label="Добавить фото">
                <Icon name="image" size={18} />
                <input type="file" accept="image/*" multiple hidden onChange={(e) => onPickImages(e.target.files)} />
              </label>
              <button className={styles.toolBtn} type="button" onClick={() => setWidgetOpen(true)} title="Добавить виджет" aria-label="Добавить виджет">
                <Icon name="sparkles" size={18} />
              </button>
            </div>

            <div className={styles.meta}>
              <span className={remaining < 0 ? styles.counterBad : ''}>{remaining}</span>
              <Button variant="primary" onClick={onSubmit} disabled={!canSubmit} loading={isLoading}>
                Опубликовать
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
