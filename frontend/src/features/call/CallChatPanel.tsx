'use client';

import { useMemo, useRef, useState, useCallback } from 'react';
import styles from './callUi.module.css';
import { useGetMessagesQuery, useSendMessageMutation } from '@/shared/api/chatsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { AudioMessage } from '@/shared/ui/AudioMessage';
import { AudioRecorder } from '@/shared/ui/AudioRecorder';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import { EmojiInputHandler } from '@/shared/lib/emojiInputHandler';

export function CallChatPanel({ chatId }: { chatId: string }) {
  const { data: meRes } = useGetMeQuery();
  const me = meRes?.user;
  const meId = me?.id ?? '';
  const { data } = useGetMessagesQuery({ chatId, take: 30 }, { skip: !chatId });
  const [sendMessage, { isLoading }] = useSendMessageMutation();
  const [text, setText] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const list = useMemo(() => (data?.items ?? []).slice().reverse(), [data]);
  const taRef = useRef<HTMLTextAreaElement | null>(null);

  // Emoji input handler manages emojis from picker, keyboard, and clipboard
  const emojiHandler = useRef(
    new EmojiInputHandler({
      onEmojiInput: (emoji) => {
        setText((prev) => prev + emoji);
      },
    })
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
      // Create FormData to send audio file
      const formData = new FormData();
      formData.append('file', blob, 'voice-message.webm');
      formData.append('chatId', chatId);
      formData.append('type', 'AUDIO');
      formData.append('duration', duration.toString());

      // Upload the audio file
      const response = await fetch('/api/backend/messages/upload', {
        method: 'POST',
        body: formData,
      });

      if (!response.ok) throw new Error('Upload failed');

      // Send message with audio type
      await sendMessage({
        chatId,
        text: 'Voice message',
        type: 'AUDIO',
      }).unwrap();
    } catch (err) {
      console.error('Error sending audio:', err);
      alert('Failed to send audio message');
    }
  };

  const handleEmojiSelect = useCallback(
    (emoji: string) => {
      emojiHandler.handlePickerEmoji(emoji);
      taRef.current?.focus();
    },
    [emojiHandler]
  );

  const handleTextChange = useCallback(
    (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      const newValue = e.target.value.slice(0, 2000);
      setText(newValue);

      // Handle emoji input from device keyboard for single emoji entries
      if (newValue.length === 1) {
        const result = emojiHandler.handleTextInput(newValue);
        if (result.emoji && !result.remaining) {
          // Pure emoji input detected
          setText('');
        }
      }
    },
    [emojiHandler]
  );

  const handlePaste = useCallback(
    (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
      const pastedText = e.clipboardData.getData('text');
      const processedText = emojiHandler.handlePaste(pastedText);

      // If paste handler consumed the emoji, prevent default and return
      if (pastedText && !processedText) {
        e.preventDefault();
        return;
      }

      // Allow normal paste behavior for non-emoji content
    },
    [emojiHandler]
  );

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      void onSend();
    }
  };

  return (
    <div className={styles.callChat}>
      <div className={styles.callChatHeader}>Call chat</div>
      <div className={styles.callChatList}>
        {list.map((message) => {
          const mine = message.senderId === meId;
          const messageType = message.type ?? 'TEXT';

          return (
            <div
              key={message.id}
              className={[styles.callChatMsg, mine ? styles.callChatMine : styles.callChatTheir].join(' ')}
            >
              <div className={styles.callChatName}>{mine ? 'You' : message.sender?.username ?? 'U'}</div>

              {messageType === 'AUDIO' ? (
                <AudioMessage
                  url={message.attachments?.[0]?.url || ''}
                  duration={Number(message.attachments?.[0]?.durationSec ?? 0) || undefined}
                  title="Voice message"
                />
              ) : (
                <div className={styles.callChatText}>{message.text ?? ''}</div>
              )}
            </div>
          );
        })}
      </div>

      {isRecording && (
        <AudioRecorder
          onRecordingComplete={handleAudioRecordingComplete}
          onCancel={() => setIsRecording(false)}
        />
      )}

      {showEmojiPicker && (
        <EmojiPicker
          onSelect={handleEmojiSelect}
          onClose={() => {
            setShowEmojiPicker(false);
            taRef.current?.focus();
          }}
        />
      )}

      <div className={styles.callChatComposer}>
        <button
          type="button"
          className={styles.callChatActionBtn}
          onClick={() => setShowEmojiPicker(!showEmojiPicker)}
          title="Add emoji"
          aria-label="Add emoji"
        >
          😊
        </button>

        <textarea
          ref={taRef}
          className={styles.callChatInput}
          placeholder="Message..."
          value={text}
          onChange={handleTextChange}
          onPaste={handlePaste}
          onKeyDown={handleKeyDown}
          rows={1}
        />

        <button
          type="button"
          className={styles.callChatActionBtn}
          onClick={() => setIsRecording(true)}
          title="Record voice message"
          aria-label="Record voice message"
          disabled={isRecording || text.trim().length > 0}
        >
          🎤
        </button>

        <button
          type="button"
          className={styles.callChatSend}
          disabled={!text.trim() || isLoading || isRecording}
          onClick={() => void onSend()}
        >
          Send
        </button>
      </div>
    </div>
  );
}
