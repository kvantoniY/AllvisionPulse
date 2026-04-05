'use client';

import { useEffect, useMemo } from 'react';
import { Icon } from '@/shared/ui/Icon/Icon';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import type { PulseShareWidgetPayload } from '@/shared/lib/pulseShare';
import styles from './MobilePostComposerModal.module.css';

type HealthWidget = {
  type: 'health';
  date: string | null;
  todayScore: number | null;
  pulse7Score: number | null;
};

type ComposerWidget = HealthWidget | PulseShareWidgetPayload;

const MAX_TEXT = 5000;

export function MobilePostComposerModal({
  open,
  onClose,
  me,
  text,
  onTextChange,
  images,
  previews,
  onPickImages,
  onRemoveImage,
  widget,
  widgetLabel,
  onOpenWidget,
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
  images: File[];
  previews: { url: string }[];
  onPickImages: (files: FileList | null) => void;
  onRemoveImage: (index: number) => void;
  widget: ComposerWidget | null;
  widgetLabel: string;
  onOpenWidget: () => void;
  onOpenSharePicker: () => void;
  onRemoveWidget: () => void;
  onSubmit: () => void;
  isLoading: boolean;
}) {
  const remaining = MAX_TEXT - text.length;
  const canSubmit = (!!text.trim() || images.length > 0 || !!widget) && remaining >= 0 && !isLoading;

  useEffect(() => {
    if (!open) return;
    const onWindow = () => onClose();
    window.addEventListener('av:post-created', onWindow as EventListener);
    return () => window.removeEventListener('av:post-created', onWindow as EventListener);
  }, [open, onClose]);

  const action = useMemo(
    () => (
      <button type="button" className={styles.nextBtn} onClick={onSubmit} disabled={!canSubmit}>
        {isLoading ? '...' : 'Next'}
      </button>
    ),
    [canSubmit, isLoading, onSubmit],
  );

  return (
    <MobileSheet open={open} onClose={onClose} title={`New post as @${me.username}`} action={action}>
      <div className={styles.body}>
        <div className={styles.content}>
          {previews.length ? (
            <div className={styles.previewRail}>
              {previews.map((preview, index) => (
                <div key={`${preview.url}:${index}`} className={styles.previewCard}>
                  <img src={preview.url} alt="" className={styles.previewImg} />
                  <button type="button" className={styles.previewRemove} onClick={() => onRemoveImage(index)} aria-label="Remove image">
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
              <button type="button" className={styles.widgetRemove} onClick={onRemoveWidget} aria-label="Remove widget">
                <Icon name="close" size={14} />
              </button>
            </div>
          ) : null}

          <div className={styles.textareaWrap}>
            <textarea
              className={styles.textarea}
              value={text}
              onChange={(event) => onTextChange(event.target.value.slice(0, MAX_TEXT + 50))}
              placeholder="Write something..."
              rows={8}
            />
          </div>
        </div>

        <div className={styles.footer}>
          <label className={styles.attachBtn}>
            <Icon name="image" size={18} />
            <span>Photo</span>
            <input type="file" accept="image/*" multiple hidden onChange={(event) => onPickImages(event.target.files)} />
          </label>
          <button type="button" className={styles.attachBtn} onClick={onOpenWidget}>
            <Icon name="sparkles" size={18} />
            <span>Summary</span>
          </button>
          <button type="button" className={styles.attachBtn} onClick={onOpenSharePicker}>
            <Icon name="paperclip" size={18} />
            <span>Pulse</span>
          </button>
          <div className={styles.counter}>{remaining}</div>
        </div>
      </div>
    </MobileSheet>
  );
}

