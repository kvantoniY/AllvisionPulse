'use client';

import { useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from './Chat.module.css';
import gridStyles from '../Messages.module.css';
import { ChatSidebar } from '@/features/messages';
import { Card } from '@/shared/ui/Card/Card';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useGetMeQuery } from '@/shared/api/usersApi';
import {
  useGetChatsQuery,
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useMarkReadMutation,
  useSendMessageMutation,
  useGetChatMediaQuery,
} from '@/shared/api/chatsApi';
import { chatUiActions } from '@/entities/chat';
import { useAppDispatch, useAppSelector } from '@/shared/lib/storeHooks';
import { formatLastSeen } from '@/shared/lib/formatLastSeen';
import { ImageGallery } from '@/shared/ui/ImageGallery/ImageGallery';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';
import { CallContext } from '@/app/providers/CallProvider';
import { AudioMessage } from '@/shared/ui/AudioMessage';
import { AudioRecorder } from '@/shared/ui/AudioRecorder';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import { VideoRing } from '@/shared/ui/VideoRing';
import { EmojiInputHandler } from '@/shared/lib/emojiInputHandler';

function getChatTitle(chat: any, meId: string | undefined) {
  if (!chat) return 'Chat';
  if (chat.type === 'GROUP') return chat.title ?? 'Group';
  const other = (chat.members ?? []).find((member: any) => member.userId !== meId)?.user;
  return other?.username ?? 'Direct';
}

function getChatAvatar(chat: any, meId: string | undefined) {
  if (!chat) return null;
  if (chat.type === 'GROUP') return null;
  const other = (chat.members ?? []).find((member: any) => member.userId !== meId)?.user;
  return other?.avatarUrl ?? null;
}

function getOtherUser(chat: any, meId: string | undefined) {
  if (!chat || chat?.type !== 'DIRECT') return null;
  return (chat.members ?? []).find((member: any) => member.userId !== meId)?.user ?? null;
}

function isCallRecord(text?: string | null) {
  return /\bcall\b/i.test(text ?? '');
}

function HeaderIcon({ path }: { path: string }) {
  return (
    <svg viewBox="0 0 24 24" className={styles.callActionIcon} aria-hidden="true">
      <path d={path} fill="currentColor" />
    </svg>
  );
}

const PHONE_ICON =
  'M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.3 2.3.46 3.57.46a1 1 0 0 1 1 1V20a2 2 0 0 1-2 2C9.4 22 2 14.6 2 5a2 2 0 0 1 2-2h3.6a1 1 0 0 1 1 1c0 1.27.16 2.45.46 3.57a1 1 0 0 1-.24 1.02l-2.2 2.2Z';
const PLAY_ICON =
  'M8 5.14v13.72a1 1 0 0 0 1.53.85l10.9-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z';

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId;
  const router = useRouter();
  const dispatch = useAppDispatch();
  const presence = useAppSelector((state) => state.presence.byUserId);
  const lightbox = useLightbox();
  const { startCall, joinCall, hasReturnableCall } = useContext(CallContext);

  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const meId = me?.id;

  const { data: chatsData } = useGetChatsQuery();
  const chat = (chatsData?.items ?? []).find((item) => item.id === chatId);
  const otherUser = getOtherUser(chat, meId);
  const otherPresence = otherUser?.id ? presence[otherUser.id] : null;

  const [mediaOpen, setMediaOpen] = useState(false);
  const { data: mediaData, isFetching: mediaFetching, refetch: refetchMedia } = useGetChatMediaQuery(
    { chatId },
    { skip: !mediaOpen },
  );
  const mediaMessages = mediaData?.items ?? [];
  const mediaImages = useMemo(() => {
    const out: { id: string; url: string }[] = [];
    for (const message of mediaMessages) {
      for (const attachment of message.attachments ?? []) {
        const mime = String((attachment as any)?.mime ?? (attachment as any)?.type ?? '');
        if (mime.startsWith('image/')) out.push({ id: attachment.id, url: attachment.url });
      }
    }
    const map = new Map<string, string>();
    for (const item of out) map.set(item.id, item.url);
    return Array.from(map.entries()).map(([id, url]) => ({ id, url }));
  }, [mediaMessages]);

  const { data: latestData, isFetching: fetchingLatest } = useGetMessagesQuery({ chatId, take: 50, cursor: null });
  const [fetchOlder, olderRes] = useLazyGetMessagesQuery();
  const [olderAsc, setOlderAsc] = useState<any[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const latestDesc = latestData?.items ?? [];
  const latestAsc = useMemo(() => [...latestDesc].reverse(), [latestDesc]);

  const messages = useMemo(() => {
    const map = new Map<string, any>();
    for (const message of olderAsc) map.set(message.id, message);
    for (const message of latestAsc) map.set(message.id, message);
    return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [olderAsc, latestAsc]);

  const scrollRef = useRef<HTMLDivElement | null>(null);
  const bottomRef = useRef<HTMLDivElement | null>(null);
  const didInitialScrollRef = useRef(false);
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const textAreaRef = useRef<HTMLTextAreaElement | null>(null);
  const recorderRef = useRef<MediaRecorder | null>(null);
  const recorderChunksRef = useRef<BlobPart[]>([]);
  const activeStreamRef = useRef<MediaStream | null>(null);

  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideoNote, setIsRecordingVideoNote] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);

  const hasLiveCall = hasReturnableCall(chatId);
  const filePreviews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  const [send, { isLoading: sending }] = useSendMessageMutation();
  const [markRead] = useMarkReadMutation();

  useEffect(() => () => filePreviews.forEach((preview) => URL.revokeObjectURL(preview.url)), [filePreviews]);

  useEffect(() => {
    dispatch(chatUiActions.setActiveChatId(chatId));
    dispatch(chatUiActions.clearUnread({ chatId }));
    didInitialScrollRef.current = false;
    return () => {
      dispatch(chatUiActions.setActiveChatId(null));
    };
  }, [chatId, dispatch]);

  useEffect(() => {
    setNextCursor((latestData as any)?.nextCursor ?? null);
  }, [latestData]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element || didInitialScrollRef.current || !messages.length) return;
    didInitialScrollRef.current = true;
    requestAnimationFrame(() => {
      element.scrollTop = element.scrollHeight;
      requestAnimationFrame(() => {
        element.scrollTop = element.scrollHeight;
      });
    });
  }, [chatId, messages.length]);

  useEffect(() => {
    const element = scrollRef.current;
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    if (distance < 220) bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length]);

  useEffect(() => {
    if (!chatId || !meId || !messages.length) return;
    const unread = messages
      .filter((message: any) => message.senderId !== meId && !(message.reads ?? []).some((read: any) => read.userId === meId))
      .slice(-30);
    if (!unread.length) return;

    Promise.allSettled(
      unread.map((message: any) => markRead({ chatId, messageId: message.id }).unwrap().catch(() => null)),
    ).catch(() => null);
  }, [chatId, meId, messages.length, markRead]);

  useEffect(() => {
    return () => {
      try {
        recorderRef.current?.stop();
      } catch {
        // ignore
      }
      activeStreamRef.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  const resizeTextarea = useCallback(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    textarea.style.height = `${Math.min(textarea.scrollHeight, 160)}px`;
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  const closeComposerPickers = () => {
    setShowEmojiPicker(false);
    setIsRecordingAudio(false);
  };

  const onSend = async () => {
    const value = text.trim();
    if ((!value && !files.length) || sending || isRecordingAudio) return;
    await send({ chatId, text: value || undefined, files: files.length ? files : undefined }).unwrap().catch(() => null);
    setText('');
    setFiles([]);
    setShowEmojiPicker(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    requestAnimationFrame(() => resizeTextarea());
    bottomRef.current?.scrollIntoView({ block: 'end' });
  };

  const stopVideoRecorder = async () => {
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
  };

  const startVideoNoteRecording = async () => {
    if (sending || isRecordingAudio || isRecordingVideoNote) return;
    closeComposerPickers();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true, video: { facingMode: 'user' } });
      activeStreamRef.current = stream;
      recorderChunksRef.current = [];
      const mimeType = MediaRecorder.isTypeSupported?.('video/webm;codecs=vp9,opus')
        ? 'video/webm;codecs=vp9,opus'
        : MediaRecorder.isTypeSupported?.('video/webm;codecs=vp8,opus')
          ? 'video/webm;codecs=vp8,opus'
          : 'video/webm';
      const recorder = new MediaRecorder(stream, { mimeType });
      recorderRef.current = recorder;
      setIsRecordingVideoNote(true);
      recorder.ondataavailable = (event) => {
        if (event.data?.size) recorderChunksRef.current.push(event.data);
      };
      recorder.onstop = async () => {
        setIsRecordingVideoNote(false);
        stream.getTracks().forEach((track) => track.stop());
        activeStreamRef.current = null;
        const blob = new Blob(recorderChunksRef.current, { type: recorder.mimeType || 'video/webm' });
        recorderChunksRef.current = [];
        if (blob.size < 2000) return;
        const file = new File([blob], `video-note-${Date.now()}.webm`, { type: blob.type || 'video/webm' });
        await send({ chatId, type: 'VIDEO_NOTE', files: [file] }).unwrap().catch(() => null);
        bottomRef.current?.scrollIntoView({ block: 'end' });
      };
      recorder.start();
    } catch {
      setIsRecordingVideoNote(false);
      activeStreamRef.current?.getTracks().forEach((track) => track.stop());
      activeStreamRef.current = null;
    }
  };

  const onScroll = async () => {
    const element = scrollRef.current;
    if (!element || element.scrollTop > 90) return;
    if (!nextCursor || olderRes.isFetching) return;

    const prevHeight = element.scrollHeight;
    const prevTop = element.scrollTop;
    const result = await fetchOlder({ chatId, take: 50, cursor: nextCursor }).unwrap().catch(() => null);
    const itemsDesc = result?.items ?? [];
    setNextCursor((result as any)?.nextCursor ?? null);
    const asc = [...itemsDesc].reverse();
    setOlderAsc((prev) => {
      const map = new Map<string, any>();
      for (const message of [...asc, ...prev]) map.set(message.id, message);
      return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
    });

    requestAnimationFrame(() => {
      const newHeight = element.scrollHeight;
      element.scrollTop = newHeight - prevHeight + prevTop;
    });
  };

  const insertEmojiAtCursor = useCallback((emoji: string) => {
    const normalizedEmoji = EmojiInputHandler.normalizeEmoji(emoji);
    const textarea = textAreaRef.current;
    if (!textarea) {
      setText((prev) => `${prev}${normalizedEmoji}`);
      return;
    }

    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${normalizedEmoji}${text.slice(end)}`;
    setText(nextText.slice(0, 5000));
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = start + normalizedEmoji.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
      resizeTextarea();
    });
  }, [resizeTextarea, text]);

  const handleAudioRecordingComplete = async (blob: Blob) => {
    setIsRecordingAudio(false);
    if (!blob.size) return;
    const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' });
    await send({ chatId, type: 'AUDIO', files: [file] }).unwrap().catch(() => null);
    bottomRef.current?.scrollIntoView({ block: 'end' });
  };

  const handleTextPaste = (event: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const pasted = event.clipboardData.getData('text');
    if (!pasted) return;
    const normalized = pasted.normalize('NFC');
    if (normalized === pasted) return;
    event.preventDefault();
    const textarea = textAreaRef.current;
    const start = textarea?.selectionStart ?? text.length;
    const end = textarea?.selectionEnd ?? text.length;
    setText(`${text.slice(0, start)}${normalized}${text.slice(end)}`.slice(0, 5000));
  };

  const handleTextKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey) {
      event.preventDefault();
      void onSend();
    }
  };

  return (
    <div className="container">
      <div className={gridStyles.grid}>
        <Card className={[gridStyles.listCard, gridStyles.hideOnMobile].filter(Boolean).join(' ')}>
          <ChatSidebar activeChatId={chatId} />
        </Card>

        <div className={gridStyles.rightChat}>
          <Card className={styles.wrap}>
            {chat?.type === 'GROUP' && hasLiveCall ? (
              <div className={styles.returnBanner}>
                <div className={styles.returnBannerText}>Group call is still active.</div>
                <button className={styles.returnBannerButton} type="button" onClick={() => joinCall(chatId)}>
                  Return to call
                </button>
              </div>
            ) : null}
            <div className={styles.top}>
              <button className={styles.back} type="button" onClick={() => router.push('/messages')} aria-label="back">
                Back
              </button>
              <Avatar url={getChatAvatar(chat, meId)} name={getChatTitle(chat, meId)} size={36} />
              <div className={styles.topInfo}>
                <div className={styles.title}>{getChatTitle(chat, meId)}</div>
                <div className={styles.sub}>
                  {chat?.type === 'GROUP' ? (
                    'Group chat'
                  ) : (
                    <>
                      <span
                        className={[styles.statusDot, otherPresence?.isOnline ? styles.statusDotOnline : styles.statusDotOffline].join(' ')}
                        aria-label={otherPresence?.isOnline ? 'online' : 'offline'}
                      />
                      <span>{otherPresence?.isOnline ? 'online' : formatLastSeen(otherPresence?.lastSeenAt ?? otherUser?.lastSeenAt)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.headerActions}>
                <button className={styles.mediaLink} type="button" onClick={() => setMediaOpen((value) => !value)} aria-label="toggle media">
                  {mediaOpen ? 'Hide media' : 'Media'}
                </button>

                {hasLiveCall ? (
                  <button className={styles.callActionJoin} type="button" onClick={() => joinCall(chatId)} aria-label="join live call">
                    <HeaderIcon path={PLAY_ICON} />
                    <span>Join live call</span>
                  </button>
                ) : null}

                {chat ? (
                  <button className={styles.callAction} type="button" onClick={() => startCall(chatId)} aria-label="start call">
                    <HeaderIcon path={PHONE_ICON} />
                    <span>{chat.type === 'GROUP' ? 'Group call' : 'Call'}</span>
                  </button>
                ) : null}
              </div>
            </div>

            <div className={[styles.middle, mediaOpen ? styles.withMedia : ''].filter(Boolean).join(' ')}>
              <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
                {olderRes.isFetching ? <div className={styles.loadingMore}>Loading older messages...</div> : null}
                {fetchingLatest && !messages.length ? <div className={styles.loadingMore}>Loading...</div> : null}

                {messages.map((message) => {
                  const mine = message.senderId === meId;
                  const readByMe = (message.reads ?? []).some((read: any) => read.userId === meId);
                  const readByOther = mine && (message.reads ?? []).some((read: any) => read.userId !== meId);
                  const unreadForMe = !mine && !readByMe;
                  const attachments = message.attachments ?? [];
                  const messageType = String(message.type ?? 'TEXT');
                  const primaryAttachment = attachments[0];
                  const imageAttachments = attachments
                    .map((attachment: any) => ({
                      id: attachment.id,
                      url: attachment.url,
                      mime: String((attachment as any)?.mime ?? (attachment as any)?.type ?? ''),
                    }))
                    .filter((attachment: any) => attachment.mime.startsWith('image/'))
                    .map((attachment: any) => ({ id: attachment.id, url: attachment.url }));
                  const otherAttachments =
                    messageType === 'AUDIO' || messageType === 'VIDEO_NOTE'
                      ? []
                      : attachments
                          .map((attachment: any) => ({
                            id: attachment.id,
                            url: attachment.url,
                            name: attachment.name ?? attachment.url,
                            mime: String((attachment as any)?.mime ?? (attachment as any)?.type ?? ''),
                          }))
                          .filter((attachment: any) => !attachment.mime.startsWith('image/'));
                  const textValue = message.text ?? '';
                  const emojiOnly = !attachments.length && EmojiInputHandler.isOnlyEmoji(textValue) && EmojiInputHandler.countEmoji(textValue) <= 4;

                  if (messageType === 'SYSTEM') {
                    const clickable = isCallRecord(message.text);
                    return (
                      <div key={message.id} className={styles.systemRow}>
                        <button
                          type="button"
                          className={[styles.systemCard, clickable ? styles.systemCardInteractive : ''].filter(Boolean).join(' ')}
                          onClick={clickable ? () => (hasLiveCall ? joinCall(chatId) : startCall(chatId)) : undefined}
                          disabled={!clickable}
                        >
                          <div className={styles.systemText}>{message.text ?? 'System event'}</div>
                          <div className={styles.systemMeta}>
                            <span>{new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
                            {clickable ? <span className={styles.systemAction}>{hasLiveCall ? 'Join active call' : 'Call back'}</span> : null}
                          </div>
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} className={[styles.msgRow, mine ? styles.mine : styles.their].join(' ')}>
                      {!mine ? <Avatar url={message.sender?.avatarUrl} name={message.sender?.username ?? 'U'} size={28} /> : null}
                      <div
                        className={[
                          styles.bubble,
                          imageAttachments.length ? styles.bubbleMedia : '',
                          messageType === 'AUDIO' ? styles.bubbleAudio : '',
                          messageType === 'VIDEO_NOTE' ? styles.bubbleVideo : '',
                        ]
                          .filter(Boolean)
                          .join(' ')}
                      >
                        {!mine ? <div className={styles.sender}>{message.sender?.username}</div> : null}

                        {messageType === 'AUDIO' && primaryAttachment?.url ? (
                          <AudioMessage
                            url={primaryAttachment.url}
                            duration={Number((primaryAttachment as any)?.durationSec ?? 0) || undefined}
                            className={styles.audioBubble}
                          />
                        ) : messageType === 'VIDEO_NOTE' && primaryAttachment?.url ? (
                          <div className={styles.videoBubbleWrap}>
                            <VideoRing src={primaryAttachment.url} size="large" showProgress className={styles.videoBubble} />
                          </div>
                        ) : (
                          <div className={[styles.msgText, emojiOnly ? styles.msgTextEmojiOnly : ''].filter(Boolean).join(' ')}>{textValue}</div>
                        )}

                        {message.attachments?.length && (imageAttachments.length || otherAttachments.length) ? (
                          <div className={styles.mediaBlock}>
                            {imageAttachments.length ? (
                              <ImageGallery images={imageAttachments} aspect={imageAttachments.length === 1 ? '4 / 5' : '4 / 3'} maxHeight={560} />
                            ) : null}
                            {otherAttachments.length ? (
                              <div className={styles.filesList}>
                                {otherAttachments.map((attachment: any) => (
                                  <a key={attachment.id} className={styles.fileLink} href={attachment.url} target="_blank" rel="noreferrer">
                                    {String(attachment.name).split('/').pop()}
                                  </a>
                                ))}
                              </div>
                            ) : null}
                          </div>
                        ) : null}

                        <div className={styles.meta}>
                          {new Date(message.createdAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                          {unreadForMe ? <span className={styles.unreadMark}> · Unread</span> : null}
                          {mine ? <span className={styles.read}> · {readByOther ? 'Read' : 'Delivered'}</span> : null}
                        </div>
                      </div>
                    </div>
                  );
                })}
                <div ref={bottomRef} />
              </div>

              {mediaOpen ? (
                <div className={styles.mediaPanel}>
                  <div className={styles.mediaTop}>
                    <div className={styles.mediaTitle}>Media</div>
                    <div className={styles.mediaActions}>
                      <button type="button" className={styles.mediaBtn} onClick={() => refetchMedia()} aria-label="refresh media">
                        Reload
                      </button>
                      <button type="button" className={styles.mediaBtn} onClick={() => setMediaOpen(false)} aria-label="close media">
                        Close
                      </button>
                    </div>
                  </div>

                  {mediaImages.length ? (
                    <div className={styles.mediaGrid}>
                      {mediaImages.map((image, index) => (
                        <button key={image.id} className={styles.mediaThumb} type="button" onClick={() => lightbox?.openLightbox(mediaImages, index)}>
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img src={image.url} alt="" />
                        </button>
                      ))}
                    </div>
                  ) : (
                    <div className={styles.mediaEmpty}>{mediaFetching ? 'Loading...' : 'No images yet.'}</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className={styles.composer}>
              {filePreviews.length ? (
                <div className={styles.filesPreview}>
                  {filePreviews.map((preview, index) => (
                    <div className={styles.fileThumb} key={preview.url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview.url} alt="" />
                      <button
                        className={styles.fileRemove}
                        type="button"
                        onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))}
                        aria-label="remove file"
                      >
                        ×
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {isRecordingAudio ? (
                <AudioRecorder
                  variant="inline"
                  className={styles.inlineRecorder}
                  onCancel={() => setIsRecordingAudio(false)}
                  onRecordingComplete={async (blob) => handleAudioRecordingComplete(blob)}
                />
              ) : null}

              <input
                ref={fileInputRef}
                className={styles.fileInput}
                type="file"
                accept="image/*"
                multiple
                onChange={(event) => {
                  const list = Array.from(event.target.files ?? []);
                  if (!list.length) return;
                  setFiles((prev) => [...prev, ...list].slice(0, 10));
                  if (fileInputRef.current) fileInputRef.current.value = '';
                }}
              />

              <div className={styles.composerStage}>
                {showEmojiPicker ? (
                  <EmojiPicker
                    className={styles.inlineEmojiPicker}
                    onSelect={(emoji) => insertEmojiAtCursor(emoji)}
                    onClose={() => {
                      setShowEmojiPicker(false);
                      textAreaRef.current?.focus();
                    }}
                  />
                ) : null}

                <div className={styles.composerRow}>
                  <button className={styles.toolBtn} type="button" onClick={() => fileInputRef.current?.click()} aria-label="attach image" title="Attach image">
                    <AttachIcon />
                  </button>
                  <button
                    className={[styles.toolBtn, styles.emojiBtn, showEmojiPicker ? styles.toolBtnActive : ''].filter(Boolean).join(' ')}
                    type="button"
                    onClick={() => {
                      setIsRecordingAudio(false);
                      setShowEmojiPicker((value) => !value);
                    }}
                    aria-label="open emoji picker"
                    title="Emoji"
                  >
                    <SmileIcon />
                  </button>
                  <button
                    className={[styles.toolBtn, isRecordingAudio ? styles.toolBtnActive : ''].filter(Boolean).join(' ')}
                    type="button"
                    onClick={() => {
                      if (isRecordingVideoNote) return;
                      setShowEmojiPicker(false);
                      setIsRecordingAudio((value) => !value);
                    }}
                    aria-label="record voice"
                    title="Voice note"
                    disabled={sending || isRecordingVideoNote}
                  >
                    <MicIcon />
                  </button>
                  <button
                    className={[styles.toolBtn, isRecordingVideoNote ? styles.toolBtnDanger : ''].filter(Boolean).join(' ')}
                    type="button"
                    onClick={() => (isRecordingVideoNote ? stopVideoRecorder() : void startVideoNoteRecording())}
                    aria-label="record video note"
                    title="Video note"
                    disabled={sending || isRecordingAudio}
                  >
                    {isRecordingVideoNote ? <StopIcon /> : <VideoIcon />}
                  </button>

                  <textarea
                    ref={textAreaRef}
                    className={styles.input}
                    placeholder={isRecordingAudio ? 'Voice recording is active…' : 'Message...'}
                    value={text}
                    onChange={(event) => setText(event.target.value.slice(0, 5000).normalize('NFC'))}
                    onPaste={handleTextPaste}
                    onKeyDown={handleTextKeyDown}
                    rows={1}
                    disabled={isRecordingAudio}
                  />
                  <button className={styles.send} type="button" onClick={onSend} disabled={(!text.trim() && !files.length) || sending || isRecordingAudio}>
                    {sending ? '...' : 'Send'}
                  </button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function AttachIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <path d="M21.44 11.05 12.25 20.24a6 6 0 1 1-8.49-8.49l9.2-9.19a4 4 0 0 1 5.66 5.66l-9.2 9.2a2 2 0 1 1-2.83-2.83l8.5-8.5" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function SmileIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <circle cx="12" cy="12" r="9" />
      <path d="M8.5 14.5c.76 1.16 2.06 1.9 3.5 1.9s2.74-.74 3.5-1.9" strokeLinecap="round" />
      <path d="M9 10.5h.01M15 10.5h.01" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function MicIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="9" y="3" width="6" height="11" rx="3" />
      <path d="M6 11.5a6 6 0 1 0 12 0M12 17.5V21M9 21h6" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function VideoIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" aria-hidden="true">
      <rect x="3" y="6" width="13" height="12" rx="3" />
      <path d="m16 10 5-3v10l-5-3" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}

function StopIcon() {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      <rect x="7" y="7" width="10" height="10" rx="2" />
    </svg>
  );
}
