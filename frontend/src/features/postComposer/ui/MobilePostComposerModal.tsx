'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Icon } from '@/shared/ui/Icon/Icon';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import type { PulseShareWidgetPayload } from '@/shared/lib/pulseShare';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import styles from './MobilePostComposerModal.module.css';

type ComposerWidget = PulseShareWidgetPayload;

const MAX_TEXT = 5000;

export function MobilePostComposerModal({
  open,
  onClose,
  text,
  onTextChange,
  onInsertEmoji,
  images,
  previews,
  onPickImages,
  onRemoveImage,
  widget,
  widgetLabel,
  onOpenSharePicker,
  onRemoveWidget,
  onSubmit,
  isLoading,
}: {
  open: boolean;
  onClose: () => void;
  me: { avatarUrl?: string | null; username: string };
  text: string;
  onTextChange: (value: string) => void;
  onInsertEmoji: (emoji: string) => void;
  images: File[];
  previews: { url: string }[];
  onPickImages: (files: FileList | null) => void;
  onRemoveImage: (index: number) => void;
  widget: ComposerWidget | null;
  widgetLabel: string;
  onOpenSharePicker: () => void;
  onRemoveWidget: () => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  const remaining = MAX_TEXT - text.length;
  const canSubmit = (!!text.trim() || images.length > 0 || !!widget) && remaining >= 0 && !isLoading;
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);

  useEffect(() => {
    if (!open) return;
    const onWindow = () => onClose();
    window.addEventListener('av:post-created', onWindow as EventListener);
    return () => window.removeEventListener('av:post-created', onWindow as EventListener);
  }, [open, onClose]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (attachMenuRef.current?.contains(event.target as Node)) return;
      setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [attachMenuOpen]);

  useEffect(() => {
    if (!open) {
      setAttachMenuOpen(false);
      setShowEmojiPicker(false);
    }
  }, [open]);

  const action = useMemo(
    () => (
      <button type="button" className={styles.nextBtn} onClick={onSubmit} disabled={!canSubmit}>
        {isLoading ? 'Публикую…' : 'Опубликовать'}
      </button>
    ),
    [canSubmit, isLoading, onSubmit],
  );

  const openFilePicker = useCallback(() => {
    const input = fileInputRef.current;
    if (!input) return;
    input.value = '';
    input.click();
  }, []);

  return (
    <MobileSheet open={open} onClose={onClose} title="Новая публикация" action={action}>
      <div className={styles.body}>
        <div className={styles.content}>
          {previews.length ? (
            <div className={styles.previewRail}>
              {previews.map((preview, index) => (
                <div key={`${preview.url}:${index}`} className={styles.previewCard}>
                  <img src={preview.url} alt="" className={styles.previewImg} />
                  <button type="button" className={styles.previewRemove} onClick={() => onRemoveImage(index)} aria-label="Удалить изображение">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {widget ? (
            <div className={styles.widgetTag}>
              <Icon name="sparkles" size={14} />
              <span>{widgetLabel}</span>
              <button type="button" className={styles.widgetRemove} onClick={onRemoveWidget} aria-label="Удалить виджет">
                <Icon name="close" size={14} />
              </button>
            </div>
          ) : null}

          <div className={styles.textareaWrap}>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(event) => onTextChange(event.target.value.slice(0, MAX_TEXT + 50))}
              placeholder="Что нового?"
              rows={8}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <div className={styles.footerTools}>
            <div className={styles.attachWrap} ref={attachMenuRef}>
              <button
                type="button"
                className={[styles.iconBtn, attachMenuOpen ? styles.iconBtnActive : ''].filter(Boolean).join(' ')}
                onClick={() => {
                  setShowEmojiPicker(false);
                  setAttachMenuOpen((value) => !value);
                }}
                aria-label="Прикрепить"
              >
                <Icon name="paperclip" size={18} />
              </button>

              {attachMenuOpen ? (
                <div className={styles.attachMenu}>
                  <button
                    type="button"
                    className={styles.attachMenuItem}
                    onClick={() => {
                      openFilePicker();
                      setAttachMenuOpen(false);
                    }}
                  >
                    <Icon name="image" size={16} />
                    <span>Фото</span>
                  </button>
                  <button
                    type="button"
                    className={styles.attachMenuItem}
                    onClick={() => {
                      setAttachMenuOpen(false);
                      onOpenSharePicker();
                    }}
                  >
                    <Icon name="paperclip" size={16} />
                    <span>Виджет Pulse</span>
                  </button>
                </div>
              ) : null}

              <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => onPickImages(event.target.files)} />
            </div>

            <button
              ref={emojiTriggerRef}
              type="button"
              className={[styles.iconBtn, showEmojiPicker ? styles.iconBtnActive : ''].filter(Boolean).join(' ')}
              onClick={() => {
                setAttachMenuOpen(false);
                setShowEmojiPicker((value) => !value);
              }}
              aria-label="Эмодзи"
            >
              <Icon name="smile" size={18} />
            </button>
          </div>

          <div className={[styles.counter, remaining < 0 ? styles.counterBad : ''].filter(Boolean).join(' ')}>{remaining}</div>
        </div>

        {showEmojiPicker ? (
          <EmojiPicker
            triggerRef={emojiTriggerRef}
            autoFocusSearch={false}
            onSelect={(emoji) => {
              onInsertEmoji(emoji);
              setShowEmojiPicker(false);
            }}
            onClose={() => setShowEmojiPicker(false)}
          />
        ) : null}
      </div>
    </MobileSheet>
  );
}
