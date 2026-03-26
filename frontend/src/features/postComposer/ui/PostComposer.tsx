'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostComposer.module.css';
import { Card } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useCreatePostMutation } from '@/shared/api/postsApi';
import { useGetTodayQuery, useGetStatsQuery } from '@/shared/api/healthApi';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { MobilePostComposerModal } from './MobilePostComposerModal';

const MAX_TEXT = 5000;

function useAutosizeTextArea(ref: React.RefObject<HTMLTextAreaElement>, value: string, expanded: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    const baseHeight = expanded ? Math.min(el.scrollHeight, 240) : 46;
    el.style.height = `${baseHeight}px`;
  }, [ref, value, expanded]);
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
  const isMobile = useIsMobile();

  const [text, setText] = useState('');
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const [images, setImages] = useState<File[]>([]);
  const previews = useMemo(() => images.map((f) => ({ f, url: URL.createObjectURL(f) })), [images]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const [widget, setWidget] = useState<HealthWidget | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);

  const expanded = !!text.trim() || images.length > 0 || !!widget;
  useAutosizeTextArea(textRef, text, expanded);

  const { data: today, isFetching: widgetLoading } = useGetTodayQuery(undefined, { skip: !widgetOpen });
  const { data: stats7, isFetching: statsLoading } = useGetStatsQuery(7, { skip: !widgetOpen });
  const [createPost, { isLoading }] = useCreatePostMutation();

  const remaining = MAX_TEXT - text.length;
  const canSubmit = (!!text.trim() || images.length > 0 || !!widget) && remaining >= 0 && !isLoading;

  useEffect(() => {
    if (!isMobile) return;
    const onOpen = () => setMobileOpen(true);
    window.addEventListener('av:open-post-composer', onOpen as EventListener);
    return () => window.removeEventListener('av:open-post-composer', onOpen as EventListener);
  }, [isMobile]);

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setImages((prev) => [...prev, ...arr].slice(0, 10));
  };

  const reset = () => {
    setText('');
    setImages([]);
    setWidget(null);
  };

  const onSubmit = async () => {
    if (!canSubmit) return;
    const ok = await createPost({ text: text.trim() ? text : '', images, widgetsJson: widget }).unwrap().catch(() => null);
    if (!ok) return;
    reset();
    window.dispatchEvent(new Event('av:post-created'));
    setMobileOpen(false);
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
          <Skeleton circle style={{ width: 44, height: 44 }} />
          <div className={styles.inputWrap}>
            <Skeleton style={{ width: '100%', height: 46, borderRadius: 16 }} />
            <div className={styles.compactTools}>
              <Skeleton style={{ width: 34, height: 34 }} />
              <Skeleton style={{ width: 34, height: 34 }} />
            </div>
          </div>
        </div>
      </Card>
    );
  }

  if (!me) return null;

  if (isMobile) {
    return (
      <>
        <button type="button" className={styles.mobileTrigger} onClick={() => setMobileOpen(true)}>
          <Avatar url={me.avatarUrl} name={me.username} size={40} />
          <span className={styles.mobileTriggerText}>Напишите что-нибудь...</span>
        </button>

        <Modal open={widgetOpen} onClose={() => setWidgetOpen(false)} title="Добавить виджет">
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
              Сейчас можно прикрепить краткий виджет со сводкой по дню и недельным пульсом.
            </div>
            {widgetLoading || statsLoading ? <SkeletonText lines={3} /> : null}
            <Button variant="primary" onClick={pickTodayWidget} loading={widgetLoading || statsLoading}>
              Добавить сводку дня
            </Button>
          </div>
        </Modal>

        <MobilePostComposerModal
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          me={{ avatarUrl: me.avatarUrl, username: me.username }}
          text={text}
          onTextChange={setText}
          images={images}
          previews={previews.map((item) => ({ url: item.url }))}
          onPickImages={onPickImages}
          onRemoveImage={(index) => setImages((arr) => arr.filter((_, i) => i !== index))}
          widget={widget}
          onOpenWidget={() => setWidgetOpen(true)}
          onRemoveWidget={() => setWidget(null)}
          onSubmit={onSubmit}
          isLoading={isLoading}
        />
      </>
    );
  }

  return (
    <Card className={[styles.card, expanded ? styles.cardExpanded : ''].filter(Boolean).join(' ')}>
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
        <Avatar url={me.avatarUrl} name={me.username} size={44} />

        <div className={styles.inputWrap}>
          <textarea
            ref={textRef}
            className={[styles.textarea, expanded ? styles.textareaExpanded : styles.textareaCollapsed].join(' ')}
            placeholder={context === 'profile' ? 'Поделиться записью…' : 'Что у вас нового?'}
            value={text}
            rows={1}
            onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT + 50))}
          />

          {widget ? (
            <div className={styles.widgetRow}>
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

          <div className={expanded ? styles.toolsExpanded : styles.toolsCollapsed}>
            <div className={styles.leftTools}>
              <label className={styles.toolBtn} title="Добавить фото" aria-label="Добавить фото">
                <Icon name="image" size={18} />
                {expanded ? <span>Фото</span> : null}
                <input type="file" accept="image/*" multiple hidden onChange={(e) => onPickImages(e.target.files)} />
              </label>
              <button className={styles.toolBtn} type="button" onClick={() => setWidgetOpen(true)} title="Добавить виджет" aria-label="Добавить виджет">
                <Icon name="sparkles" size={18} />
                {expanded ? <span>Сводка</span> : null}
              </button>
            </div>

            {expanded ? (
              <div className={styles.meta}>
                <span className={remaining < 0 ? styles.counterBad : ''}>{remaining}</span>
                <Button variant="primary" onClick={onSubmit} disabled={!canSubmit} loading={isLoading}>
                  Опубликовать
                </Button>
              </div>
            ) : null}
          </div>
        </div>
      </div>
    </Card>
  );
}
