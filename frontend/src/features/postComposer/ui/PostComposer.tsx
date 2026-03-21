'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostComposer.module.css';
import { Card } from '@/shared/ui/Card/Card';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Button } from '@/shared/ui/Button/Button';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useCreatePostMutation } from '@/shared/api/postsApi';
import { useGetTodayQuery, useGetStatsQuery } from '@/shared/api/healthApi';
import { Modal } from '@/shared/ui/Modal/Modal';

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
  const { data } = useGetMeQuery();
  const me = data?.user;

  const [text, setText] = useState('');
  const textRef = useRef<HTMLTextAreaElement | null>(null);
  useAutosizeTextArea(textRef, text);

  const [images, setImages] = useState<File[]>([]);
  const previews = useMemo(() => images.map((f) => ({ f, url: URL.createObjectURL(f) })), [images]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const [widget, setWidget] = useState<HealthWidget | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);

  const { data: today } = useGetTodayQuery(undefined, { skip: !widgetOpen });
  const { data: stats7 } = useGetStatsQuery(7, { skip: !widgetOpen });

  const [createPost, { isLoading }] = useCreatePostMutation();

  const remaining = MAX_TEXT - text.length;
  const canSubmit = (!!text.trim() || images.length > 0 || !!widget) && remaining >= 0 && !isLoading;

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setImages((prev) => {
      const next = [...prev, ...arr].slice(0, 10);
      return next;
    });
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

  if (!me) return null;

  return (
    <Card className={styles.card}>
      <Modal open={widgetOpen} onClose={() => setWidgetOpen(false)} title="Attach widget">
        <div style={{ display: 'grid', gap: 10 }}>
          <div style={{ opacity: 0.75, fontSize: 13 }}>
            Сейчас можно прикрепить health-виджет (Today Score / 7-Day Pulse). Дальше добавим расширенный выбор.
          </div>
          <Button variant="primary" onClick={pickTodayWidget}>
            Attach: Today Score + 7-Day Pulse
          </Button>
          {widget ? (
            <div style={{ opacity: 0.8, fontSize: 12 }}>
              Selected: {widget.todayScore ?? '—'}% / {widget.pulse7Score ?? '—'}%
            </div>
          ) : null}
        </div>
      </Modal>

      <div className={styles.row}>
        <Avatar url={me.avatarUrl} name={me.username} size={44} />
        <div className={styles.inputWrap}>
          <textarea
            ref={textRef}
            className={styles.textarea}
            placeholder={context === 'profile' ? 'Share something on your profile…' : 'What\'s happening?'}
            value={text}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT + 50))}
          />

          {widget ? (
            <div style={{ marginTop: 10 }}>
              <span className={styles.widgetTag}>
                Health widget: {widget.todayScore ?? '—'}% / {widget.pulse7Score ?? '—'}%
                <button className={styles.widgetRemove} onClick={() => setWidget(null)} type="button" aria-label="remove widget">
                  ✕
                </button>
              </span>
            </div>
          ) : null}

          {previews.length ? (
            <div className={styles.previews}>
              {previews.map((p, idx) => (
                <div className={styles.preview} key={p.url}>
                  <img src={p.url} alt="" />
                  <button
                    className={styles.remove}
                    type="button"
                    onClick={() => setImages((arr) => arr.filter((_, i) => i !== idx))}
                    aria-label="remove image"
                  >
                    ✕
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          <div className={styles.tools}>
            <div className={styles.leftTools}>
              <label className={styles.toolBtn}>
                🖼️ Image
                <input
                  type="file"
                  accept="image/*"
                  multiple
                  hidden
                  onChange={(e) => onPickImages(e.target.files)}
                />
              </label>
              <button className={styles.toolBtn} type="button" onClick={() => setWidgetOpen(true)}>
                ⊕ Widget
              </button>
            </div>

            <div className={styles.meta}>
              <span className={remaining < 0 ? styles.counterBad : ''}>{remaining}</span>
              <Button variant="primary" onClick={onSubmit} disabled={!canSubmit}>
                {isLoading ? 'Posting…' : 'Post'}
              </Button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}
