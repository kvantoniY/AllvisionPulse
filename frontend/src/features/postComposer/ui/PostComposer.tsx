'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostComposer.module.css';
import { Card } from '@/shared/ui/Card/Card';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useCreatePostMutation } from '@/shared/api/postsApi';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { MobilePostComposerModal } from './MobilePostComposerModal';
import { PulseSharePicker } from '@/shared/ui/PulseSharePicker/PulseSharePicker';
import type { ShareArtifact } from '@/shared/types/programs';
import { toPulseShareWidgetPayload, type PulseShareWidgetPayload } from '@/shared/lib/pulseShare';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import { EmojiInputHandler } from '@/shared/lib/emojiInputHandler';

const MAX_TEXT = 5000;
const MAX_IMAGES = 8;
function useAutosizeTextArea(ref: React.RefObject<HTMLTextAreaElement>, value: string, expanded: boolean) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    const baseHeight = expanded ? Math.min(el.scrollHeight, 240) : 22;
    el.style.height = `${baseHeight}px`;
  }, [ref, value, expanded]);
}

type ComposerWidget = PulseShareWidgetPayload;

function widgetLabel(widget: ComposerWidget | null) {
  if (!widget) return '';
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
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);

  const hasContent = !!text.trim() || images.length > 0 || !!widget;
  const hasSupplemental = images.length > 0 || !!widget;
  const textExpanded = text.trim().length > 0;
  useAutosizeTextArea(textRef, text, textExpanded);

  const [createPost, { isLoading }] = useCreatePostMutation();

  const remaining = MAX_TEXT - text.length;
  const canSubmit = hasContent && remaining >= 0 && !isLoading;
  const showCounter = text.length > 0 || remaining < 300;

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
    const arr = Array.from(files).filter((file) => file.type.startsWith('image/'));
    setImages((prev) => [...prev, ...arr].slice(0, MAX_IMAGES));
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
          <div className={styles.inputWrap}>
            <Skeleton style={{ width: '100%', height: 44, borderRadius: 22 }} />
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

        <PulseSharePicker open={sharePickerOpen} onClose={() => setSharePickerOpen(false)} onPick={pickShareArtifact} />

        <MobilePostComposerModal
          open={mobileOpen}
          onClose={() => setMobileOpen(false)}
          me={{ avatarUrl: me.avatarUrl, username: me.username }}
          text={text}
          onTextChange={setText}
          onInsertEmoji={insertEmojiAtCursor}
          images={images}
          previews={previews.map((item) => ({ url: item.url }))}
          onPickImages={onPickImages}
          onRemoveImage={(index) => setImages((arr) => arr.filter((_, i) => i !== index))}
          widget={widget}
          widgetLabel={widgetLabel(widget)}
          onOpenSharePicker={() => setSharePickerOpen(true)}
          onRemoveWidget={() => setWidget(null)}
          onSubmit={onSubmit}
          isLoading={isLoading}
        />
      </>
    );
  }

  return (
    <Card className={[styles.card, hasContent ? styles.cardExpanded : '', surface === 'flat' ? styles.cardFlat : ''].filter(Boolean).join(' ')}>
      <PulseSharePicker open={sharePickerOpen} onClose={() => setSharePickerOpen(false)} onPick={pickShareArtifact} />

      <div className={styles.row}>
        <div className={styles.inputWrap}>
          <div className={styles.composerStage}>
            {showEmojiPicker ? (
              <EmojiPicker
                className={styles.inlineEmojiPicker}
                triggerRef={emojiTriggerRef}
                onSelect={(emoji) => {
                  insertEmojiAtCursor(emoji);
                  setShowEmojiPicker(false);
                }}
                onClose={() => setShowEmojiPicker(false)}
              />
            ) : null}

            <div className={[styles.composerShell, hasSupplemental ? styles.composerShellWithExtras : '', textExpanded ? styles.composerShellExpanded : styles.composerShellCompact].filter(Boolean).join(' ')}>
              {previews.length || widget ? (
                <div className={styles.composerExtras}>
                  {previews.length ? (
                    <div className={styles.previews}>
                      {previews.map((p, idx) => (
                        <div className={styles.preview} key={`extra-${p.url}`}>
                          <img src={p.url} alt="" />
                          <button className={styles.remove} type="button" onClick={() => setImages((arr) => arr.filter((_, i) => i !== idx))} aria-label="РЈРґР°Р»РёС‚СЊ РёР·РѕР±СЂР°Р¶РµРЅРёРµ">
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
                        <button className={styles.widgetRemove} onClick={() => setWidget(null)} type="button" aria-label="РЈРґР°Р»РёС‚СЊ РІРёРґР¶РµС‚">
                          <Icon name="close" size={14} />
                        </button>
                      </span>
                    </div>
                  ) : null}
                </div>
              ) : null}

              <div className={styles.leadingActions}>
                <div className={styles.attachWrap} ref={attachMenuRef}>
                  <button
                    className={[styles.actionBtn, attachMenuOpen ? styles.actionBtnActive : ''].filter(Boolean).join(' ')}
                    type="button"
                    onClick={() => {
                      setShowEmojiPicker(false);
                      setAttachMenuOpen((value) => !value);
                    }}
                    aria-label="Прикрепить"
                    title="Прикрепить"
                  >
                    <Icon name="paperclip" size={18} />
                  </button>

                  {attachMenuOpen ? (
                    <div className={styles.attachMenu}>
                      <button
                        className={styles.attachMenuItem}
                        type="button"
                        onClick={() => {
                          const input = fileInputRef.current;
                          if (!input) return;
                          input.value = '';
                          input.click();
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
                          setSharePickerOpen(true);
                        }}
                      >
                        <Icon name="sparkles" size={16} />
                        <span>Виджет Pulse</span>
                      </button>
                    </div>
                  ) : null}

                  <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(e) => onPickImages(e.target.files)} />
                </div>

                <button
                  ref={emojiTriggerRef}
                  className={[styles.actionBtn, showEmojiPicker ? styles.actionBtnActive : ''].filter(Boolean).join(' ')}
                  type="button"
                  onClick={() => {
                    setAttachMenuOpen(false);
                    setShowEmojiPicker((value) => !value);
                  }}
                  aria-label="Эмодзи"
                  title="Эмодзи"
                >
                  <Icon name="smile" size={18} />
                </button>
              </div>

              <div className={[styles.textColumn, textExpanded ? styles.textColumnExpanded : styles.textColumnCompact, hasSupplemental ? styles.textColumnWithExtras : ''].filter(Boolean).join(' ')}>
                <textarea
                  ref={textRef}
                  className={[styles.textarea, textExpanded ? styles.textareaExpanded : styles.textareaCollapsed].join(' ')}
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
              </div>

              {showCounter ? (
                <div className={styles.meta}>
                  <span className={remaining < 0 ? styles.counterBad : ''}>{remaining}</span>
                </div>
              ) : null}

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
