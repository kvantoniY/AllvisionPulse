'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import styles from './callUi.module.css';
import { useGetMessagesQuery, useSendMessageMutation } from '@/shared/api/chatsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { AudioMessage } from '@/shared/ui/AudioMessage';
import { AudioRecorder } from '@/shared/ui/AudioRecorder';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import { EmojiInputHandler } from '@/shared/lib/emojiInputHandler';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Spinner } from '@/shared/ui/Spinner/Spinner';
import { SkeletonText } from '@/shared/ui/Skeleton/Skeleton';

export function CallChatPanel({ chatId }: { chatId: string }) {
  const { data: meRes } = useGetMeQuery();
  const me = meRes?.user;
  const meId = me?.id ?? '';
  const { data, isFetching } = useGetMessagesQuery({ chatId, take: 30 }, { skip: !chatId });
  const [sendMessage, { isLoading }] = useSendMessageMutation();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const list = useMemo(() => (data?.items ?? []).slice().reverse(), [data]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  const emojiHandler = useRef(
    new EmojiInputHandler({
      onEmojiInput: (emoji) => {
        setText((prev) => prev + emoji);
      },
    }),
  ).current;

  async function onSend() {
    const value = text.trim();
    if (!value || !chatId) return;
    setText('');
    try {
      await sendMessage({ chatId, text: value, type: 'TEXT' }).unwrap();
    } catch {
      setText(value);
    }
    taRef.current?.focus();
  }

  const handleAudioRecordingComplete = async (blob: Blob, duration: number) => {
    if (!chatId) return;
    setIsRecording(false);
    try {
      const formData = new FormData();
      formData.append('file', blob, 'voice-message.webm');
      formData.append('chatId', chatId);
      formData.append('type', 'AUDIO');
      formData.append('duration', duration.toString());
      const response = await fetch('/api/backend/messages/upload', { method: 'POST', body: formData });
      if (!response.ok) throw new Error('Upload failed');
      await sendMessage({ chatId, text: 'Голосовое сообщение', type: 'AUDIO' }).unwrap();
    } catch (err) {
      console.error('Error sending audio:', err);
      alert('Не удалось отправить голосовое сообщение');
    }
  };

  const handleEmojiSelect = useCallback((emoji: string) => {
    emojiHandler.handlePickerEmoji(emoji);
    taRef.current?.focus();
  }, [emojiHandler]);

  const handleTextChange = useCallback((e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newValue = e.target.value.slice(0, 2000);
    setText(newValue);
    if (newValue.length === 1) {
      const result = emojiHandler.handleTextInput(newValue);
      if (result.emoji && !result.remaining) setText('');
    }
  }, [emojiHandler]);

  const handlePaste = useCallback((e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pastedText = e.clipboardData.getData('text');
    const processedText = emojiHandler.handlePaste(pastedText);
    if (pastedText && !processedText) {
      e.preventDefault();
    }
  }, [emojiHandler]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  return (
    <div className={styles.callChat}>
      <div className={styles.callChatHeader}>Чат звонка</div>
      <div className={styles.callChatList}>
        {isFetching && !list.length ? <SkeletonText lines={5} /> : null}
        {list.map((message) => {
          const mine = message.senderId === meId;
          const messageType = message.type ?? 'TEXT';
          return (
            <div key={message.id} className={[styles.callChatMsg, mine ? styles.callChatMine : styles.callChatTheir].join(' ')}>
              <div className={styles.callChatName}>{mine ? 'Вы' : message.sender?.username ?? 'Участник'}</div>
              {messageType === 'AUDIO' ? (
                <AudioMessage url={message.attachments?.[0]?.url || ''} duration={Number(message.attachments?.[0]?.durationSec ?? 0) || undefined} title="Голосовое сообщение" />
              ) : (
                <div className={styles.callChatText}>{message.text ?? ''}</div>
              )}
            </div>
          );
        })}
      </div>

      {isRecording ? <AudioRecorder onRecordingComplete={handleAudioRecordingComplete} onCancel={() => setIsRecording(false)} /> : null}
      {showEmojiPicker ? <EmojiPicker onSelect={handleEmojiSelect} onClose={() => { setShowEmojiPicker(false); taRef.current?.focus(); }} /> : null}

      <div className={styles.callChatComposer}>
        <button type="button" className={styles.callChatActionBtn} onClick={() => setShowEmojiPicker(!showEmojiPicker)} title="Эмодзи" aria-label="Открыть эмодзи">
          <Icon name="sparkles" size={18} />
        </button>

        <textarea
          ref={taRef}
          className={styles.callChatInput}
          placeholder="Сообщение…"
          value={text}
          onChange={handleTextChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        <button type="button" className={styles.callChatActionBtn} onClick={() => setIsRecording(true)} title="Голосовое сообщение" aria-label="Записать голосовое сообщение" disabled={isRecording || text.trim().length > 0}>
          <Icon name="mic" size={18} />
        </button>

        <button type="button" className={styles.callChatSend} disabled={!text.trim() || isLoading || isRecording} onClick={() => void onSend()} aria-label="Отправить сообщение" title="Отправить сообщение">
          {isLoading ? <Spinner size={16} /> : <Icon name="send" size={18} />}
        </button>
      </div>
    </div>
  );
}
