'use client';

import { useEffect, useRef, useState } from 'react';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Button } from '@/shared/ui/Button/Button';
import styles from './StartChatModal.module.css';
import { useSendMessageMutation } from '@/shared/api/chatsApi';

export function StartChatModal({
  open,
  onClose,
  chatId,
  title,
  onSent,
}: {
  open: boolean;
  onClose: () => void;
  chatId: string | null;
  title: string;
  onSent: (chatId: string) => void;
}) {
  const [text, setText] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const [send, { isLoading }] = useSendMessageMutation();

  useEffect(() => {
    if (!open) return;
    setText('');
    setTimeout(() => ref.current?.focus(), 50);
  }, [open]);

  const canSend = !!chatId && text.trim().length > 0 && !isLoading;

  const onSend = async () => {
    if (!chatId || !canSend) return;
    await send({ chatId, text: text.trim() }).unwrap().catch(() => null);
    onSent(chatId);
    onClose();
  };

  return (
    <Modal open={open} onClose={onClose} title={title}>
      <div className={styles.wrap}>
        <textarea
          ref={ref}
          className={styles.input}
          placeholder="Write your first message…"
          value={text}
          onChange={(e) => setText(e.target.value.slice(0, 5000))}
          rows={4}
        />
        <div className={styles.actions}>
          <Button variant="ghost" onClick={onClose}>
            Cancel
          </Button>
          <Button variant="primary" disabled={!canSend} onClick={onSend}>
            {isLoading ? 'Sending…' : 'Send'}
          </Button>
        </div>
      </div>
    </Modal>
  );
}
