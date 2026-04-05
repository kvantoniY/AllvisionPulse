'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
import { PulseSharePicker } from '@/shared/ui/PulseSharePicker/PulseSharePicker';
import type { ShareArtifact } from '@/shared/types/programs';
import { toPulseShareWidgetPayload, type PulseShareWidgetPayload } from '@/shared/lib/pulseShare';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import { EmojiInputHandler } from '@/shared/lib/emojiInputHandler';

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

type ComposerWidget = HealthWidget | PulseShareWidgetPayload;

function widgetLabel(widget: ComposerWidget | null) {
  if (!widget) return '';
  if (widget.type === 'health') return `Сводка дня: ${widget.todayScore ?? '-'}% / ${widget.pulse7Score ?? '-'}%`;

  const snapshot = widget.artifact.snapshotJson ?? {};
  const snapshotTitle = typeof snapshot.title === 'string' ? snapshot.title : '';
  return `Виджет Pulse: ${snapshotTitle || widget.artifact.title || 'Артефакт'}`;
}

export function PostComposer({ context = 'feed', hideMobileTrigger = false, surface = 'card' }: { context?: 'feed' | 'profile'; hideMobileTrigger?: boolean; surface?: 'card' | 'flat' }) {
  const { data, isFetching: meFetching } = useGetMeQuery();
  const me = data?.user;
  const isMobile = useIsMobile();

  const [text, setText] = useState('');
  const textRef = useRef<HTMLTextAreaElement | null>(null);

  const [images, setImages] = useState<File[]>([]);
  const previews = useMemo(() => images.map((f) => ({ f, url: URL.createObjectURL(f) })), [images]);
  useEffect(() => () => previews.forEach((p) => URL.revokeObjectURL(p.url)), [previews]);

  const [widget, setWidget] = useState<ComposerWidget | null>(null);
  const [widgetOpen, setWidgetOpen] = useState(false);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);

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

  useEffect(() => {
    if (!attachMenuOpen) return;

    const handlePointerDown = (event: MouseEvent) => {
      if (attachMenuRef.current && !attachMenuRef.current.contains(event.target as Node)) {
        setAttachMenuOpen(false);
      }
    };

    document.addEventListener('mousedown', handlePointerDown);
    return () => document.removeEventListener('mousedown', handlePointerDown);
  }, [attachMenuOpen]);

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const arr = Array.from(files);
    setImages((prev) => [...prev, ...arr].slice(0, 10));
    if (fileInputRef.current) fileInputRef.current.value = '';
    setAttachMenuOpen(false);
  };

  const reset = () => {
    setText('');
    setImages([]);
    setWidget(null);
    setAttachMenuOpen(false);
    setShowEmojiPicker(false);
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

  const pickShareArtifact = (artifact: ShareArtifact) => {
    setWidget(toPulseShareWidgetPayload(artifact));
  };

  const insertEmojiAtCursor = useCallback((emoji: string) => {
    const normalizedEmoji = EmojiInputHandler.normalizeEmoji(emoji);
    const textarea = textRef.current;
    if (!textarea) {
      setText((prev) => `${prev}${normalizedEmoji}`.slice(0, MAX_TEXT + 50));
      return;
    }

    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${normalizedEmoji}${text.slice(end)}`;
    setText(nextText.slice(0, MAX_TEXT + 50));
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = start + normalizedEmoji.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  }, [text]);

  const handleTextPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return;
    const normalized = pasted.normalize('NFC');
    if (normalized === pasted) return;
    event.preventDefault();
    const textarea = textRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    setText(`${text.slice(0, start)}${normalized}${text.slice(end)}`.slice(0, MAX_TEXT + 50));
  };

  const handleTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void onSubmit();
    }
  };

  if (meFetching && !me) {
    if (isMobile && hideMobileTrigger) return null;
    return (
      <Card className={[styles.card, surface === 'flat' ? styles.cardFlat : ''].filter(Boolean).join(' ')}>
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
        {!hideMobileTrigger ? (
          <button type="button" className={styles.mobileTrigger} onClick={() => setMobileOpen(true)}>
            <Avatar url={me.avatarUrl} name={me.username} size={40} />
            <span className={styles.mobileTriggerText}>Поделиться новостью...</span>
          </button>
        ) : null}

        <Modal open={widgetOpen} onClose={() => setWidgetOpen(false)} title="Прикрепить виджет">
          <div style={{ display: 'grid', gap: 12 }}>
            <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
              Добавьте компактную сводку дня из Pulse.
            </div>
            {widgetLoading || statsLoading ? <SkeletonText lines={3} /> : null}
            <Button variant="primary" onClick={pickTodayWidget} loading={widgetLoading || statsLoading}>
              Прикрепить сводку
            </Button>
          </div>
        </Modal>

        <PulseSharePicker open={sharePickerOpen} onClose={() => setSharePickerOpen(false)} onPick={pickShareArtifact} />

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
          widgetLabel={widgetLabel(widget)}
          onOpenWidget={() => setWidgetOpen(true)}
          onOpenSharePicker={() => setSharePickerOpen(true)}
          onRemoveWidget={() => setWidget(null)}
          onSubmit={onSubmit}
          isLoading={isLoading}
        />
      </>
    );
  }

  return (
    <Card className={[styles.card, expanded ? styles.cardExpanded : '', surface === 'flat' ? styles.cardFlat : ''].filter(Boolean).join(' ')}>
      <Modal open={widgetOpen} onClose={() => setWidgetOpen(false)} title="Прикрепить виджет">
        <div style={{ display: 'grid', gap: 12 }}>
          <div style={{ color: 'var(--muted)', fontSize: 14, lineHeight: 1.5 }}>
            Добавьте компактную сводку дня из Pulse.
          </div>
          {widgetLoading || statsLoading ? <SkeletonText lines={3} /> : null}
          <Button variant="primary" onClick={pickTodayWidget} loading={widgetLoading || statsLoading}>
            Прикрепить сводку
          </Button>
          {widget ? <div style={{ color: 'var(--text-soft)', fontSize: 13 }}>Выбрано: {widgetLabel(widget)}</div> : null}
        </div>
      </Modal>

      <PulseSharePicker open={sharePickerOpen} onClose={() => setSharePickerOpen(false)} onPick={pickShareArtifact} />
      <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => onPickImages(event.target.files)} />

      <div className={styles.row}>
        <Avatar url={me.avatarUrl} name={me.username} size={44} />

        <div className={styles.inputWrap}>
          <div className={styles.composerStage}>
            {showEmojiPicker ? (
              <EmojiPicker
                className={styles.inlineEmojiPicker}
                triggerRef={emojiTriggerRef}
                autoFocusSearch={false}
                onSelect={insertEmojiAtCursor}
                onClose={() => setShowEmojiPicker(false)}
              />
            ) : null}

            <div className={styles.composerShell}>
              <div className={styles.leadingActions}>
                <button
                  ref={emojiTriggerRef}
                  className={[styles.actionBtn, showEmojiPicker ? styles.actionBtnActive : ''].filter(Boolean).join(' ')}
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setShowEmojiPicker((value) => !value);
                  }}
                  aria-label="Открыть эмодзи"
                  title="Эмодзи"
                >
                  <Icon name="smile" size={18} />
                </button>

                <div className={styles.attachWrap} ref={attachMenuRef}>
                  <button
                    className={[styles.actionBtn, attachMenuOpen ? styles.actionBtnActive : ''].filter(Boolean).join(' ')}
                    type="button"
                    onClick={() => {
                      setShowEmojiPicker(false);
                      setAttachMenuOpen((value) => !value);
                    }}
                    aria-label="Открыть вложения"
                    title="Вложения"
                  >
                    <Icon name="paperclip" size={18} />
                  </button>

                  {attachMenuOpen ? (
                    <div className={styles.attachMenu}>
                      <button
                        className={styles.attachMenuItem}
                        type="button"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          fileInputRef.current?.click();
                        }}
                      >
                        <Icon name="image" size={16} />
                        <span>Фото</span>
                      </button>
                      <button
                        className={styles.attachMenuItem}
                        type="button"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          setShowEmojiPicker(false);
                          setWidgetOpen(true);
                        }}
                      >
                        <Icon name="sparkles" size={16} />
                        <span>Сводка дня</span>
                      </button>
                      <button
                        className={styles.attachMenuItem}
                        type="button"
                        onClick={() => {
                          setAttachMenuOpen(false);
                          setShowEmojiPicker(false);
                          setSharePickerOpen(true);
                        }}
                      >
                        <Icon name="paperclip" size={16} />
                        <span>Виджет Pulse</span>
                      </button>
                    </div>
                  ) : null}
                </div>
              </div>

              <div className={styles.textColumn}>
                <textarea
                  ref={textRef}
                  className={[styles.textarea, expanded ? styles.textareaExpanded : styles.textareaCollapsed].join(' ')}
                  placeholder={context === 'profile' ? 'Поделитесь новостью...' : 'Что нового сегодня?'}
                  value={text}
                  rows={1}
                  onChange={(e) => setText(e.target.value.slice(0, MAX_TEXT + 50))}
                  onFocus={() => setAttachMenuOpen(false)}
                  onPaste={handleTextPaste}
                  onKeyDown={handleTextKeyDown}
                />

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

                {widget ? (
                  <div className={styles.widgetRow}>
                    <span className={styles.widgetTag}>
                      <Icon name="sparkles" size={14} />
                      {widgetLabel(widget)}
                      <button className={styles.widgetRemove} onClick={() => setWidget(null)} type="button" aria-label="Удалить виджет">
                        <Icon name="close" size={14} />
                      </button>
                    </span>
                  </div>
                ) : null}

                {text.length > 0 || remaining < 300 ? (
                  <div className={styles.meta}>
                    <span className={remaining < 0 ? styles.counterBad : ''}>{remaining}</span>
                  </div>
                ) : null}
              </div>

              <button
                className={[styles.actionBtn, styles.actionBtnPrimary].join(' ')}
                type="button"
                onClick={() => void onSubmit()}
                disabled={!canSubmit}
                aria-label="Опубликовать"
                title="Опубликовать"
              >
                <Icon name="send" size={18} />
              </button>
            </div>
          </div>
        </div>
      </div>
    </Card>
  );
}

