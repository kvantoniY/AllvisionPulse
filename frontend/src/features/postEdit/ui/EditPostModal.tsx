'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { useUpdatePostMutation } from '@/shared/api/postsApi';
import type { Post } from '@/shared/types/social';
import styles from './EditPostModal.module.css';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import { PulseSharePicker } from '@/shared/ui/PulseSharePicker/PulseSharePicker';
import { toPulseShareWidgetPayload, type PulseShareWidgetPayload } from '@/shared/lib/pulseShare';
import type { ShareArtifact } from '@/shared/types/programs';
import { getPulseShareWidgetPayload } from '@/shared/lib/socialWidgets';

const MAX_TEXT = 5000;
const MAX_IMAGES = 8;

type ExistingImage = { id: string; url: string };

export function EditPostModal({ open, onClose, post }: { open: boolean; onClose: () => void; post: Post | null }) {
  const isMobile = useIsMobile();
  const [text, setText] = useState('');
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [widget, setWidget] = useState<PulseShareWidgetPayload | null>(null);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const [updatePost, { isLoading }] = useUpdatePostMutation();

  useEffect(() => {
    if (!open || !post) return;
    setText(post.text ?? '');
    setExistingImages(post.images ?? []);
    setNewImages([]);
    setWidget(getPulseShareWidgetPayload(post.widgetsJson));
    setAttachMenuOpen(false);
    setShowEmojiPicker(false);
    setSharePickerOpen(false);
  }, [open, post]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (attachMenuRef.current?.contains(event.target as Node)) return;
      setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [attachMenuOpen]);

  const previews = useMemo(() => newImages.map((file) => ({ file, url: URL.createObjectURL(file) })), [newImages]);
  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews]);

  const initialWidget = useMemo(() => getPulseShareWidgetPayload(post?.widgetsJson), [post]);

  const remaining = MAX_TEXT - text.length;
  const widgetChanged = JSON.stringify(widget ?? null) !== JSON.stringify(initialWidget ?? null);
  const canSave = !!post && remaining >= 0 && (
    text !== (post?.text ?? '') ||
    existingImages.length !== (post?.images?.length ?? 0) ||
    newImages.length > 0 ||
    widgetChanged
  ) && !isLoading;

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    const nextFiles = Array.from(files).filter((file) => file.type.startsWith('image/'));
    setNewImages((prev) => [...prev, ...nextFiles].slice(0, MAX_IMAGES));
  };

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((prev) => `${prev}${emoji}`.slice(0, MAX_TEXT + 50));
      return;
    }
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(nextText.slice(0, MAX_TEXT + 50));
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = start + emoji.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const onSubmit = async () => {
    if (!post || !canSave) return;
    const data = await updatePost({
      postId: post.id,
      text: text.slice(0, MAX_TEXT),
      images: newImages,
      keepImageIds: existingImages.map((item) => item.id),
      widgetsJson: widgetChanged ? widget ?? null : undefined,
    }).unwrap().catch(() => null);
    if (!data) return;
    onClose();
  };

  const body = (
    <div className={[styles.body, isMobile ? styles.bodyMobile : styles.bodyDesktop].join(' ')}>
      <div className={[styles.content, isMobile ? styles.contentMobile : styles.contentDesktop].join(' ')}>
        {existingImages.length || previews.length ? (
          <div className={styles.previewRail}>
            {existingImages.map((img) => (
              <div key={img.id} className={styles.previewCard}>
                <img src={img.url} alt="" className={styles.previewImg} />
                <button type="button" className={styles.previewRemove} onClick={() => setExistingImages((items) => items.filter((item) => item.id !== img.id))} aria-label="Удалить изображение">
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
            {previews.map((preview, index) => (
              <div key={`${preview.url}:${index}`} className={styles.previewCard}>
                <img src={preview.url} alt="" className={styles.previewImg} />
                <button type="button" className={styles.previewRemove} onClick={() => setNewImages((items) => items.filter((_, i) => i !== index))} aria-label="Удалить изображение">
                  <Icon name="close" size={16} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {widget ? (
          <div className={styles.widgetTag}>
            <Icon name="paperclip" size={14} />
            <span>{typeof widget.artifact.snapshotJson?.title === 'string' ? widget.artifact.snapshotJson.title : widget.artifact.title ?? 'Виджет Pulse'}</span>
            <button type="button" className={styles.widgetRemove} onClick={() => setWidget(null)} aria-label="Удалить виджет">
              <Icon name="close" size={14} />
            </button>
          </div>
        ) : null}

        <textarea
          ref={textareaRef}
          className={styles.textarea}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT + 50))}
          placeholder="Измените текст публикации..."
          rows={isMobile ? 8 : 10}
        />
      </div>

      <div className={[styles.footer, isMobile ? styles.footerMobile : styles.footerDesktop].join(' ')}>
        {isMobile ? (
          <>
            <div className={styles.mobileTools}>
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
                        const input = fileInputRef.current;
                        if (!input) return;
                        input.value = '';
                        input.click();
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
                        setSharePickerOpen(true);
                      }}
                    >
                      <Icon name="paperclip" size={16} />
                      <span>Виджет Pulse</span>
                    </button>
                  </div>
                ) : null}
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

            <div className={[styles.counter, styles.counterMobile, remaining < 0 ? styles.counterBad : ''].filter(Boolean).join(' ')}>{remaining}</div>

            <div className={[styles.actions, styles.actionsMobile].join(' ')}>
              <button type="button" className={styles.primaryBtn} onClick={onSubmit} disabled={!canSave}>{isLoading ? 'Сохранение…' : 'Сохранить'}</button>
            </div>
          </>
        ) : (
          <>
            <label className={styles.attachBtn}>
              <Icon name="image" size={18} />
              <span>Фото</span>
              <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => onPickImages(event.target.files)} />
            </label>

            <div className={[styles.actions, styles.actionsDesktop].join(' ')}>
              <button type="button" className={styles.secondaryBtn} onClick={onClose}>Отмена</button>
              <button type="button" className={styles.primaryBtn} onClick={onSubmit} disabled={!canSave}>{isLoading ? 'Сохранение…' : 'Сохранить'}</button>
            </div>

            <div className={[styles.counter, styles.counterDesktop, remaining < 0 ? styles.counterBad : ''].filter(Boolean).join(' ')}>{remaining}</div>
          </>
        )}

        {isMobile ? <input ref={fileInputRef} type="file" accept="image/*" multiple hidden onChange={(event) => onPickImages(event.target.files)} /> : null}
      </div>

      {isMobile && showEmojiPicker ? (
        <EmojiPicker
          triggerRef={emojiTriggerRef}
          autoFocusSearch={false}
          onSelect={(emoji) => {
            insertEmoji(emoji);
            setShowEmojiPicker(false);
          }}
          onClose={() => setShowEmojiPicker(false)}
        />
      ) : null}
    </div>
  );

  return (
    <>
      <PulseSharePicker
        open={sharePickerOpen}
        onClose={() => setSharePickerOpen(false)}
        onPick={(artifact: ShareArtifact) => setWidget(toPulseShareWidgetPayload(artifact))}
      />

      {isMobile ? (
        <MobileSheet open={open} onClose={onClose} title="Редактировать пост">
          {body}
        </MobileSheet>
      ) : (
        <Modal open={open} onClose={onClose} title="Редактировать пост" size="lg">
          {body}
        </Modal>
      )}
    </>
  );
}
