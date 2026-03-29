'use client';

import { useEffect, useMemo, useState } from 'react';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { useUpdatePostMutation } from '@/shared/api/postsApi';
import type { Post } from '@/shared/types/social';
import styles from './EditPostModal.module.css';

const MAX_TEXT = 5000;

type ExistingImage = { id: string; url: string };

export function EditPostModal({ open, onClose, post }: { open: boolean; onClose: () => void; post: Post | null }) {
  const isMobile = useIsMobile();
  const [text, setText] = useState('');
  const [existingImages, setExistingImages] = useState<ExistingImage[]>([]);
  const [newImages, setNewImages] = useState<File[]>([]);
  const [updatePost, { isLoading }] = useUpdatePostMutation();

  useEffect(() => {
    if (!open || !post) return;
    setText(post.text ?? '');
    setExistingImages(post.images ?? []);
    setNewImages([]);
  }, [open, post?.id]);

  const previews = useMemo(() => newImages.map((file) => ({ file, url: URL.createObjectURL(file) })), [newImages]);
  useEffect(() => () => previews.forEach((item) => URL.revokeObjectURL(item.url)), [previews]);

  const remaining = MAX_TEXT - text.length;
  const canSave = !!post && remaining >= 0 && (text !== (post?.text ?? '') || existingImages.length !== (post?.images?.length ?? 0) || newImages.length > 0) && !isLoading;

  const onPickImages = (files: FileList | null) => {
    if (!files) return;
    setNewImages((prev) => [...prev, ...Array.from(files)].slice(0, 10));
  };

  const onSubmit = async () => {
    if (!post || !canSave) return;
    const data = await updatePost({
      postId: post.id,
      text: text.slice(0, MAX_TEXT),
      images: newImages,
      keepImageIds: existingImages.map((item) => item.id),
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

        <textarea
          className={styles.textarea}
          value={text}
          onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT + 50))}
          placeholder="Измените текст публикации..."
          rows={isMobile ? 8 : 10}
        />
      </div>

      <div className={[styles.footer, isMobile ? styles.footerMobile : styles.footerDesktop].join(' ')}>
        <label className={styles.attachBtn}>
          <Icon name="image" size={18} />
          <span>Фото</span>
          <input type="file" accept="image/*" multiple hidden onChange={(event) => onPickImages(event.target.files)} />
        </label>

        <div className={[styles.actions, isMobile ? styles.actionsMobile : styles.actionsDesktop].join(' ')}>
          <button type="button" className={styles.secondaryBtn} onClick={onClose}>Отмена</button>
          <button type="button" className={styles.primaryBtn} onClick={onSubmit} disabled={!canSave}>{isLoading ? 'Сохранение…' : 'Сохранить'}</button>
        </div>

        <div className={[styles.counter, isMobile ? styles.counterMobile : styles.counterDesktop].join(' ')}>{remaining}</div>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet open={open} onClose={onClose} title="Редактировать пост">
        {body}
      </MobileSheet>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Редактировать пост" size="lg">
      {body}
    </Modal>
  );
}
