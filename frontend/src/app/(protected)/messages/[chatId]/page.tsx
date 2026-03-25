'use client';

import { ReactNode, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from './Chat.module.css';
import gridStyles from '../Messages.module.css';
import { ChatSidebar } from '@/features/messages';
import { Card } from '@/shared/ui/Card/Card';
import { StoryRingAvatar, useStoriesUi } from '@/features/stories';
import { useGetMeQuery, useGetUserByUsernameQuery } from '@/shared/api/usersApi';
import {
  chatsApi,
  useCreateDirectChatMutation,
  useDeleteMessageMutation,
  useDeleteMessagesBulkMutation,
  useGetChatMediaQuery,
  useGetChatsQuery,
  useGetMessagesQuery,
  useLazyGetMessagesQuery,
  useLazySearchMessagesQuery,
  useMarkReadMutation,
  useSendMessageMutation,
  useUpdateMessageMutation,
} from '@/shared/api/chatsApi';
import { useGetFriendsQuery } from '@/shared/api/friendsApi';
import type { Message } from '@/shared/types/chat';
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
import { Modal } from '@/shared/ui/Modal/Modal';
import { Button } from '@/shared/ui/Button/Button';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { GameSessionPanel } from '@/features/games';
import { parseGameSystemMessage, gameLabel, gameStatusLabel } from '@/shared/lib/gameMessages';
import { useGetGameSessionsQuery } from '@/shared/api/gamesApi';

function getChatTitle(chat: any, meId: string | undefined) {
  if (!chat) return 'Чат';
  if (chat.type === 'GROUP') return chat.title ?? 'Группа';
  const other = (chat.members ?? []).find((member: any) => member.userId !== meId)?.user;
  return other?.username ?? 'Диалог';
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

function isSameDay(a: string, b: string) {
  const left = new Date(a);
  const right = new Date(b);
  return (
    left.getFullYear() === right.getFullYear() &&
    left.getMonth() === right.getMonth() &&
    left.getDate() === right.getDate()
  );
}

function formatDateSeparator(date: string) {
  const value = new Date(date);
  const now = new Date();
  const sameYear = value.getFullYear() === now.getFullYear();
  const month = value.toLocaleDateString('ru-RU', { month: 'long' });
  if (sameYear) return `${value.getDate()} ${month}`;
  return `${value.getDate()} ${month}, ${value.getFullYear()} год`;
}

function formatMessageTime(date: string) {
  return new Date(date).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });
}

function canEditMessage(message: Message | null | undefined, meId?: string) {
  if (!message || !meId) return false;
  if (message.senderId !== meId) return false;
  if (message.type === 'SYSTEM') return false;
  if (!String(message.text ?? '').trim()) return false;
  return Date.now() - new Date(message.createdAt).getTime() <= 24 * 60 * 60 * 1000;
}

function formatPreviewText(message?: Partial<Message> | null) {
  if (!message) return 'Сообщение';
  const type = String(message.type ?? 'TEXT');
  if (type === 'AUDIO') return 'Голосовое сообщение';
  if (type === 'VIDEO_NOTE') return 'Видеосообщение';
  if (message.attachments?.length) return 'Вложение';
  return String(message.text ?? 'Сообщение');
}

function highlightText(text: string, query: string): ReactNode {
  if (!query.trim()) return text;
  const escaped = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const regex = new RegExp(`(${escaped})`, 'ig');
  const parts = text.split(regex);
  return parts.map((part, index) =>
    part.toLowerCase() === query.toLowerCase() ? (
      <mark key={`${part}-${index}`} className={styles.searchMark}>
        {part}
      </mark>
    ) : (
      <span key={`${part}-${index}`}>{part}</span>
    ),
  );
}

function messageStatusLabel(message: any, meId: string | undefined, chat: any, presence: Record<string, any>) {
  if (!meId || message.senderId !== meId) return null;
  if ((message as any).__pending) return { key: 'pending', label: 'Отправляется', icon: 'clock' as const };
  const readsByOthers = (message.reads ?? []).filter((read: any) => read.userId !== meId).length;
  if (readsByOthers > 0) return { key: 'read', label: 'Прочитано', icon: 'checkDouble' as const };
  const othersOnline = (chat?.members ?? []).some((member: any) => member.userId !== meId && presence?.[member.userId]?.isOnline);
  if (othersOnline) return { key: 'delivered', label: 'Доставлено', icon: 'checkDouble' as const };
  return { key: 'sent', label: 'Отправлено', icon: 'check' as const };
}

function getFriendUser(friendship: any, meId?: string) {
  if (!friendship) return null;
  return friendship.sender?.id === meId ? friendship.receiver : friendship.sender;
}

type PendingVoice = {
  blob: Blob;
  file: File;
  url: string;
  duration: number;
};

type PendingVideo = {
  file: File;
  url: string;
};

export default function ChatPage() {
  const params = useParams<{ chatId: string }>();
  const chatId = params.chatId;
  const router = useRouter();
  const dispatch = useAppDispatch();
  const presence = useAppSelector((state) => state.presence.byUserId);
  const lightbox = useLightbox();
  const { openViewer } = useStoriesUi();
  const { startCall, joinCall, hasReturnableCall } = useContext(CallContext);

  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const meId = me?.id;

  const { data: chatsData } = useGetChatsQuery();
  const chat = (chatsData?.items ?? []).find((item) => item.id === chatId);
  const otherUser = getOtherUser(chat, meId);
  const otherPresence = otherUser?.id ? presence[otherUser.id] : null;
  const { data: otherUserProfile } = useGetUserByUsernameQuery(otherUser?.username ?? '', { skip: !otherUser?.username });
  const directRelationship = otherUserProfile?.relationship;
  const isDirectChat = chat?.type === 'DIRECT';
  const canWriteInChat = !isDirectChat || Boolean(directRelationship?.canMessage);
  const canCallInChat = !isDirectChat || Boolean(directRelationship?.canCall);
  const composerLockReason = !canWriteInChat
    ? (directRelationship?.blockedMe
        ? 'Пользователь добавил вас в чёрный список. Сообщения недоступны.'
        : directRelationship?.blockedByMe
          ? 'Вы добавили пользователя в чёрный список. Сообщения недоступны, пока блокировка активна.'
          : 'Пользователь ограничил входящие сообщения настройками приватности.')
    : null;
  const callLockReason = !canCallInChat
    ? (directRelationship?.blockedMe
        ? 'Пользователь добавил вас в чёрный список. Звонки недоступны.'
        : directRelationship?.blockedByMe
          ? 'Вы добавили пользователя в чёрный список. Звонки недоступны, пока блокировка активна.'
          : 'Пользователь ограничил входящие звонки настройками приватности.')
    : null;

  const [mediaOpen, setMediaOpen] = useState(false);
  const [gamesOpen, setGamesOpen] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<Message[]>([]);
  const [activeSearchIndex, setActiveSearchIndex] = useState(0);
  const [highlightedMessageId, setHighlightedMessageId] = useState<string | null>(null);
  const [selectionMode, setSelectionMode] = useState(false);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [replyTo, setReplyTo] = useState<Message | null>(null);
  const [editingMessage, setEditingMessage] = useState<Message | null>(null);
  const [forwardOpen, setForwardOpen] = useState(false);
  const [forwardTargetIds, setForwardTargetIds] = useState<Record<string, boolean>>({});
  const [openActionsMessageId, setOpenActionsMessageId] = useState<string | null>(null);
  const [pendingMessages, setPendingMessages] = useState<any[]>([]);
  const [pendingVoice, setPendingVoice] = useState<PendingVoice | null>(null);
  const [pendingVideo, setPendingVideo] = useState<PendingVideo | null>(null);
  const [isRecordingAudio, setIsRecordingAudio] = useState(false);
  const [isRecordingVideoNote, setIsRecordingVideoNote] = useState(false);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const [forwarding, setForwarding] = useState(false);

  const { data: gameSessionsData } = useGetGameSessionsQuery({ chatId }, { skip: !chatId });
  const activeGamesCount = useMemo(
    () => (gameSessionsData?.items ?? []).filter((item) => item.status === 'CONFIG' || item.status === 'ACTIVE').length,
    [gameSessionsData],
  );

  const { data: mediaData, isFetching: mediaFetching, refetch: refetchMedia } = useGetChatMediaQuery({ chatId }, { skip: !mediaOpen });
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
  const [runSearch, searchRes] = useLazySearchMessagesQuery();
  const [olderAsc, setOlderAsc] = useState<Message[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);

  const latestDesc = latestData?.items ?? [];
  const latestAsc = useMemo(() => [...latestDesc].reverse(), [latestDesc]);

  const messages = useMemo(() => {
    const map = new Map<string, any>();
    for (const message of olderAsc) map.set(message.id, message);
    for (const message of latestAsc) map.set(message.id, message);
    for (const message of pendingMessages) map.set(message.id, message);
    return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
  }, [olderAsc, latestAsc, pendingMessages]);

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

  const hasLiveCall = hasReturnableCall(chatId);
  const filePreviews = useMemo(() => files.map((file) => ({ file, url: URL.createObjectURL(file) })), [files]);
  const [sendMessage, sendRes] = useSendMessageMutation();
  const [updateMessage, updateRes] = useUpdateMessageMutation();
  const [markRead] = useMarkReadMutation();
  const [deleteMessage, deleteRes] = useDeleteMessageMutation();
  const [deleteMessagesBulk, bulkDeleteRes] = useDeleteMessagesBulkMutation();
  const [createDirectChat] = useCreateDirectChatMutation();
  const { data: friendsData, isFetching: friendsLoading } = useGetFriendsQuery();
  const friends = friendsData?.friends ?? [];

  const isSending = sendRes.isLoading || updateRes.isLoading;
  const hasComposerPreview = Boolean(pendingVoice || pendingVideo || files.length);
  const selectedMessages = useMemo(() => messages.filter((message) => selectedIds.includes(message.id)), [messages, selectedIds]);
  const deletableSelected = useMemo(
    () => selectedMessages.filter((message) => message.senderId === meId && message.type !== 'SYSTEM'),
    [selectedMessages, meId],
  );
  const canDeleteSelection = selectedMessages.length > 0 && deletableSelected.length === selectedMessages.length;

  const selectedForwardTargetIds = useMemo(() => Object.keys(forwardTargetIds).filter((id) => forwardTargetIds[id]), [forwardTargetIds]);

  useEffect(() => () => filePreviews.forEach((preview) => URL.revokeObjectURL(preview.url)), [filePreviews]);

  useEffect(() => {
    return () => {
      if (pendingVoice?.url) URL.revokeObjectURL(pendingVoice.url);
      if (pendingVideo?.url) URL.revokeObjectURL(pendingVideo.url);
    };
  }, [pendingVoice, pendingVideo]);

  useEffect(() => {
    dispatch(chatUiActions.setActiveChatId(chatId));
    dispatch(chatUiActions.clearUnread({ chatId }));
    didInitialScrollRef.current = false;
    setSearchOpen(false);
    setSearchQuery('');
    setSearchResults([]);
    setSelectionMode(false);
    setSelectedIds([]);
    setReplyTo(null);
    setEditingMessage(null);
    setPendingMessages([]);
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
    setIsNearBottom(distance < 180);
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

  useEffect(() => {
    if (!searchOpen || !searchQuery.trim()) {
      setSearchResults([]);
      setActiveSearchIndex(0);
      return;
    }
    const handle = setTimeout(async () => {
      const result = await runSearch({ chatId, q: searchQuery.trim(), take: 30 }).unwrap().catch(() => null);
      setSearchResults(result?.items ?? []);
      setActiveSearchIndex(0);
    }, 220);
    return () => clearTimeout(handle);
  }, [chatId, runSearch, searchOpen, searchQuery]);

  useEffect(() => {
    if (!highlightedMessageId) return;
    const timeout = window.setTimeout(() => setHighlightedMessageId(null), 1800);
    return () => window.clearTimeout(timeout);
  }, [highlightedMessageId]);

  const resizeTextarea = useCallback(() => {
    const textarea = textAreaRef.current;
    if (!textarea) return;
    textarea.style.height = '0px';
    const nextHeight = Math.min(textarea.scrollHeight, 160);
    textarea.style.height = `${nextHeight}px`;
    textarea.style.overflowY = textarea.scrollHeight > 160 ? 'auto' : 'hidden';
  }, []);

  useEffect(() => {
    resizeTextarea();
  }, [text, resizeTextarea]);

  const closeComposerPickers = () => {
    setShowEmojiPicker(false);
    setIsRecordingAudio(false);
  };

  const updateCachesWithMessage = useCallback((message: any) => {
    dispatch(
      chatsApi.util.updateQueryData('getMessages', { chatId, take: 50, cursor: null }, (draft: any) => {
        const items: any[] = draft.items ?? [];
        if (!items.some((m) => m.id === message.id)) {
          items.unshift(message);
          draft.items = items;
        }
      }),
    );

    dispatch(
      chatsApi.util.updateQueryData('getChats', undefined, (draft: any) => {
        const items: any[] = draft?.items ?? [];
        const idx = items.findIndex((c) => c.id === chatId);
        if (idx === -1) return;
        const chatItem = items[idx];
        chatItem.updatedAt = message.createdAt ?? new Date().toISOString();
        chatItem.lastMessage = message;
        items.splice(idx, 1);
        items.unshift(chatItem);
        draft.items = items;
      }),
    );
  }, [chatId, dispatch]);

  const createPendingMessage = useCallback((partial: { type?: string; text?: string; attachments?: any[]; replyTo?: Message | null; forwardOf?: Message | null }) => {
    const pendingId = `local-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
    const pendingMessage = {
      id: pendingId,
      chatId,
      senderId: meId,
      createdAt: new Date().toISOString(),
      type: partial.type ?? 'TEXT',
      text: partial.text ?? '',
      sender: me ?? { id: meId ?? 'me', username: 'Вы', avatarUrl: null },
      attachments: partial.attachments ?? [],
      reads: [],
      replyTo: partial.replyTo ?? null,
      forwardOf: partial.forwardOf ?? null,
      __pending: true,
    };
    setPendingMessages((prev) => [...prev, pendingMessage]);
    return pendingId;
  }, [chatId, me, meId]);

  const removePendingMessage = useCallback((pendingId: string) => {
    setPendingMessages((prev) => prev.filter((item) => item.id !== pendingId));
  }, []);

  const resetComposerState = useCallback(() => {
    setText('');
    setFiles([]);
    setReplyTo(null);
    setEditingMessage(null);
    setShowEmojiPicker(false);
    if (fileInputRef.current) fileInputRef.current.value = '';
    requestAnimationFrame(() => resizeTextarea());
  }, [resizeTextarea]);

  const onSend = async () => {
    if (isSending || isRecordingAudio || !canWriteInChat) return;

    if (editingMessage) {
      const value = text.trim();
      if (!value) return;
      await updateMessage({ chatId, messageId: editingMessage.id, text: value }).unwrap().catch(() => null);
      resetComposerState();
      return;
    }

    if (pendingVoice) {
      const pendingId = createPendingMessage({ type: 'AUDIO', attachments: [{ id: pendingVoice.file.name, url: pendingVoice.url, mime: pendingVoice.file.type }] });
      const result = await sendMessage({ chatId, type: 'AUDIO', files: [pendingVoice.file], replyToId: replyTo?.id ?? null }).unwrap().catch(() => null);
      removePendingMessage(pendingId);
      if (result?.message) {
        updateCachesWithMessage(result.message);
        URL.revokeObjectURL(pendingVoice.url);
        setPendingVoice(null);
        setReplyTo(null);
        bottomRef.current?.scrollIntoView({ block: 'end' });
      }
      return;
    }

    if (pendingVideo) {
      const pendingId = createPendingMessage({ type: 'VIDEO_NOTE', attachments: [{ id: pendingVideo.file.name, url: pendingVideo.url, mime: pendingVideo.file.type }] });
      const result = await sendMessage({ chatId, type: 'VIDEO_NOTE', files: [pendingVideo.file], replyToId: replyTo?.id ?? null }).unwrap().catch(() => null);
      removePendingMessage(pendingId);
      if (result?.message) {
        updateCachesWithMessage(result.message);
        URL.revokeObjectURL(pendingVideo.url);
        setPendingVideo(null);
        setReplyTo(null);
        bottomRef.current?.scrollIntoView({ block: 'end' });
      }
      return;
    }

    const value = text.trim();
    if ((!value && !files.length) || isRecordingAudio) return;

    const pendingAttachments = files.map((file, index) => ({ id: `pending-${index}`, url: filePreviews[index]?.url, mime: file.type, name: file.name }));
    const pendingId = createPendingMessage({
      type: files.length && !value ? 'IMAGE' : 'TEXT',
      text: value || undefined,
      attachments: pendingAttachments,
      replyTo,
    });

    const result = await sendMessage({ chatId, text: value || undefined, files: files.length ? files : undefined, replyToId: replyTo?.id ?? null }).unwrap().catch(() => null);
    removePendingMessage(pendingId);
    if (result?.message) {
      updateCachesWithMessage(result.message);
      resetComposerState();
      bottomRef.current?.scrollIntoView({ block: 'end' });
    }
  };

  const stopVideoRecorder = async () => {
    try {
      recorderRef.current?.stop();
    } catch {
      // ignore
    }
  };

  const startVideoNoteRecording = async () => {
    if (isSending || isRecordingAudio || isRecordingVideoNote || text.trim() || files.length || pendingVoice || pendingVideo) return;
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
        const url = URL.createObjectURL(blob);
        setPendingVideo((prev) => {
          if (prev?.url) URL.revokeObjectURL(prev.url);
          return { file, url };
        });
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
    if (!element) return;
    const distance = element.scrollHeight - element.scrollTop - element.clientHeight;
    setIsNearBottom(distance < 180);
    if (element.scrollTop > 90) return;
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

  const ensureMessageLoaded = useCallback(async (messageId: string) => {
    if (messages.some((message) => message.id === messageId)) return true;
    let cursor = nextCursor;
    while (cursor) {
      const result = await fetchOlder({ chatId, take: 50, cursor }).unwrap().catch(() => null);
      if (!result) return false;
      cursor = (result as any)?.nextCursor ?? null;
      setNextCursor(cursor);
      const asc = [...(result.items ?? [])].reverse();
      setOlderAsc((prev) => {
        const map = new Map<string, any>();
        for (const message of [...asc, ...prev]) map.set(message.id, message);
        return Array.from(map.values()).sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      });
      if ((result.items ?? []).some((item: any) => item.id === messageId)) return true;
    }
    return false;
  }, [chatId, fetchOlder, messages, nextCursor]);

  const scrollToMessage = useCallback(async (messageId: string) => {
    const loaded = await ensureMessageLoaded(messageId);
    if (!loaded) return;
    requestAnimationFrame(() => {
      const element = document.getElementById(`message-${messageId}`);
      if (!element) return;
      element.scrollIntoView({ block: 'center', behavior: 'smooth' });
      setHighlightedMessageId(messageId);
    });
  }, [ensureMessageLoaded]);

  const goToSearchResult = useCallback(async (index: number) => {
    if (!searchResults.length) return;
    const normalizedIndex = ((index % searchResults.length) + searchResults.length) % searchResults.length;
    setActiveSearchIndex(normalizedIndex);
    const target = searchResults[normalizedIndex];
    if (target?.id) await scrollToMessage(target.id);
  }, [scrollToMessage, searchResults]);

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

  const handleAudioRecordingComplete = async (blob: Blob, duration: number) => {
    setIsRecordingAudio(false);
    if (!blob.size) return;
    const extension = blob.type.includes('ogg') ? 'ogg' : blob.type.includes('mp4') ? 'm4a' : 'webm';
    const file = new File([blob], `voice-${Date.now()}.${extension}`, { type: blob.type || 'audio/webm' });
    const url = URL.createObjectURL(blob);
    setPendingVoice((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return { blob, file, url, duration };
    });
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

  const openForwardForMessages = (messageIds: string[]) => {
    setSelectedIds(messageIds);
    setSelectionMode(true);
    setForwardOpen(true);
    setForwardTargetIds({});
  };

  const handleForwardSubmit = async () => {
    if (!selectedForwardTargetIds.length || !selectedMessages.length) return;
    setForwarding(true);
    try {
      const messagesToForward = [...selectedMessages].sort((a, b) => new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime());
      for (const userId of selectedForwardTargetIds) {
        const direct = await createDirectChat({ userId }).unwrap().catch(() => null);
        const targetChatId = direct?.chat?.id;
        if (!targetChatId) continue;
        for (const message of messagesToForward) {
          const forwardId = message.forwardOf?.id ?? message.id;
          await sendMessage({ chatId: targetChatId, type: String(message.type ?? 'TEXT'), text: message.text ?? undefined, forwardOfId: forwardId }).unwrap().catch(() => null);
        }
      }
      setForwardOpen(false);
      setSelectionMode(false);
      setSelectedIds([]);
    } finally {
      setForwarding(false);
    }
  };

  const handleDeleteSelection = async () => {
    if (!canDeleteSelection) return;
    if (deletableSelected.length === 1) {
      await deleteMessage({ chatId, messageId: deletableSelected[0].id }).unwrap().catch(() => null);
    } else {
      await deleteMessagesBulk({ chatId, messageIds: deletableSelected.map((message) => message.id) }).unwrap().catch(() => null);
    }
    setSelectionMode(false);
    setSelectedIds([]);
  };

  const renderedItems = useMemo(() => {
    const items: Array<{ type: 'date'; key: string; label: string } | { type: 'message'; key: string; message: any }> = [];
    let prevDate: string | null = null;
    for (const message of messages) {
      const label = formatDateSeparator(message.createdAt);
      if (!prevDate || !isSameDay(prevDate, message.createdAt)) {
        items.push({ type: 'date', key: `date-${message.id}`, label });
      }
      items.push({ type: 'message', key: message.id, message });
      prevDate = message.createdAt;
    }
    return items;
  }, [messages]);

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
                <div className={styles.returnBannerText}>Групповой звонок всё ещё активен.</div>
                <Button className={styles.returnBannerButton} iconOnly type="button" onClick={() => joinCall(chatId)} aria-label="Вернуться в звонок" title="Вернуться в звонок">
                  <Icon name="play" size={16} />
                </Button>
              </div>
            ) : null}

            <div className={styles.top}>
              <Button className={styles.back} iconOnly type="button" onClick={() => router.push('/messages')} aria-label="Назад к чатам" title="Назад к чатам">
                <Icon name="arrowLeft" size={18} />
              </Button>
              <StoryRingAvatar userId={otherUser?.id} url={getChatAvatar(chat, meId)} name={getChatTitle(chat, meId)} size={36} disableStoryClick={chat?.type === 'GROUP'} />
              <div className={styles.topInfo}>
                <div className={styles.title}>{getChatTitle(chat, meId)}</div>
                <div className={styles.sub}>
                  {chat?.type === 'GROUP' ? (
                    'Групповой чат'
                  ) : (
                    <>
                      <span className={[styles.statusDot, otherPresence?.isOnline ? styles.statusDotOnline : styles.statusDotOffline].join(' ')} aria-label={otherPresence?.isOnline ? 'онлайн' : 'не в сети'} />
                      <span>{otherPresence?.isOnline ? 'онлайн' : formatLastSeen(otherPresence?.lastSeenAt ?? otherUser?.lastSeenAt)}</span>
                    </>
                  )}
                </div>
              </div>

              <div className={styles.headerActions}>
                <Button className={styles.mediaLink} iconOnly type="button" onClick={() => setSearchOpen((value) => !value)} aria-label={searchOpen ? 'Закрыть поиск' : 'Открыть поиск'} title={searchOpen ? 'Закрыть поиск' : 'Открыть поиск'}>
                  <Icon name="search" size={18} />
                </Button>
                <Button className={styles.mediaLink} iconOnly type="button" onClick={() => setMediaOpen((value) => !value)} aria-label={mediaOpen ? 'Скрыть медиа' : 'Показать медиа'} title={mediaOpen ? 'Скрыть медиа' : 'Показать медиа'}>
                  <Icon name="image" size={18} />
                </Button>
                <Button className={[styles.mediaLink, selectionMode ? styles.headerActionActive : ''].filter(Boolean).join(' ')} iconOnly type="button" onClick={() => { setSelectionMode((value) => !value); setSelectedIds([]); }} aria-label={selectionMode ? 'Отменить выбор' : 'Выбрать сообщения'} title={selectionMode ? 'Отменить выбор' : 'Выбрать сообщения'}>
                  <Icon name="select" size={18} />
                </Button>

                {hasLiveCall ? (
                  <Button className={styles.callActionJoin} iconOnly type="button" onClick={() => joinCall(chatId)} aria-label="Вернуться в звонок" title="Вернуться в звонок">
                    <Icon name="play" size={18} />
                  </Button>
                ) : null}

                {chat ? (
                  <Button className={[styles.callAction, activeGamesCount > 0 ? styles.callActionGamesActive : ''].filter(Boolean).join(' ')} iconOnly type="button" onClick={() => setGamesOpen(true)} aria-label="Открыть игры" title="Открыть игры">
                    <Icon name="game" size={18} />
                    {activeGamesCount > 0 ? <span className={styles.callActionCount}>{activeGamesCount}</span> : null}
                  </Button>
                ) : null}

                {chat ? (
                  <Button className={styles.callAction} iconOnly type="button" onClick={() => canCallInChat && startCall(chatId)} aria-label={chat.type === 'GROUP' ? 'Начать групповой звонок' : 'Начать звонок'} title={canCallInChat ? (chat.type === 'GROUP' ? 'Начать групповой звонок' : 'Начать звонок') : (callLockReason ?? 'Звонок недоступен')} disabled={!canCallInChat}>
                    <Icon name="phone" size={18} />
                  </Button>
                ) : null}
              </div>
            </div>

            {searchOpen ? (
              <div className={styles.searchBar}>
                <div className={styles.searchFieldWrap}>
                  <Icon name="search" size={16} className={styles.searchFieldIcon} />
                  <input className={styles.searchField} placeholder="Поиск по сообщениям" value={searchQuery} onChange={(event) => setSearchQuery(event.target.value)} />
                </div>
                <div className={styles.searchTools}>
                  <span className={styles.searchCounter}>
                    {searchRes.isFetching ? 'Ищем…' : searchResults.length ? `${activeSearchIndex + 1}/${searchResults.length}` : '0'}
                  </span>
                  <Button className={styles.searchNavBtn} iconOnly size="sm" onClick={() => void goToSearchResult(activeSearchIndex - 1)} disabled={!searchResults.length} aria-label="Предыдущее совпадение" title="Предыдущее совпадение">
                    <Icon name="chevronUp" size={16} />
                  </Button>
                  <Button className={styles.searchNavBtn} iconOnly size="sm" onClick={() => void goToSearchResult(activeSearchIndex + 1)} disabled={!searchResults.length} aria-label="Следующее совпадение" title="Следующее совпадение">
                    <Icon name="chevronDown" size={16} />
                  </Button>
                  <Button className={styles.searchNavBtn} iconOnly size="sm" onClick={() => { setSearchOpen(false); setSearchQuery(''); setSearchResults([]); }} aria-label="Закрыть поиск" title="Закрыть поиск">
                    <Icon name="close" size={16} />
                  </Button>
                </div>
              </div>
            ) : null}

            {selectionMode ? (
              <div className={styles.selectionBar}>
                <div className={styles.selectionInfo}>Выбрано: {selectedIds.length}</div>
                <div className={styles.selectionActions}>
                  <Button className={styles.selectionAction} iconOnly type="button" onClick={() => openForwardForMessages(selectedIds)} disabled={!selectedIds.length} aria-label="Переслать выбранные сообщения" title="Переслать выбранные сообщения">
                    <Icon name="forward" size={16} />
                  </Button>
                  <Button className={styles.selectionAction} iconOnly type="button" onClick={() => void handleDeleteSelection()} disabled={!canDeleteSelection || deleteRes.isLoading || bulkDeleteRes.isLoading} loading={deleteRes.isLoading || bulkDeleteRes.isLoading} aria-label="Удалить выбранные сообщения" title="Удалить выбранные сообщения">
                    <Icon name="trash" size={16} />
                  </Button>
                  <Button className={styles.selectionAction} iconOnly type="button" onClick={() => { setSelectionMode(false); setSelectedIds([]); }} aria-label="Закрыть режим выбора" title="Закрыть режим выбора">
                    <Icon name="close" size={16} />
                  </Button>
                </div>
              </div>
            ) : null}

            <div className={[styles.middle, mediaOpen ? styles.withMedia : ''].filter(Boolean).join(' ')}>
              <div className={styles.messages} ref={scrollRef} onScroll={onScroll}>
                {olderRes.isFetching ? <div className={styles.loadingMore}>Загрузка прошлых сообщений…</div> : null}
                {fetchingLatest && !messages.length ? (
                  <div style={{ display: 'grid', gap: 12, padding: '8px 0' }}>
                    {Array.from({ length: 6 }).map((_, index) => (
                      <div key={index} style={{ display: 'flex', justifyContent: index % 2 ? 'flex-end' : 'flex-start' }}>
                        <div style={{ maxWidth: '72%', minWidth: 180 }}>
                          <SkeletonText lines={3} />
                        </div>
                      </div>
                    ))}
                  </div>
                ) : null}

                {renderedItems.map((item) => {
                  if (item.type === 'date') {
                    return (
                      <div key={item.key} className={styles.dateRow}>
                        <div className={styles.dateBadge}>{item.label}</div>
                      </div>
                    );
                  }

                  const message = item.message;
                  const mine = message.senderId === meId;
                  const readByMe = (message.reads ?? []).some((read: any) => read.userId === meId);
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
                  const status = messageStatusLabel(message, meId, chat, presence);
                  const replyPreview = message.replyTo;
                  const forwardPreview = message.forwardOf;
                  const storyMeta = (message.metaJson as any)?.kind === 'storyReply' ? (message.metaJson as any) : null;
                  const isSelected = selectedIds.includes(message.id);
                  const canDelete = message.senderId === meId && message.type !== 'SYSTEM';
                  const canReply = message.type !== 'SYSTEM';
                  const canForward = message.type !== 'SYSTEM';
                  const canEdit = canEditMessage(message, meId);

                  if (messageType === 'SYSTEM') {
                    const clickable = isCallRecord(message.text);
                    const gameEvent = parseGameSystemMessage(message.text);
                    if (gameEvent) {
                      return (
                        <div key={message.id} className={styles.systemRow} id={`message-${message.id}`}>
                          <button type="button" className={[styles.systemCard, styles.systemCardInteractive].join(' ')} onClick={() => setGamesOpen(true)}>
                            <div className={styles.systemText}>🎮 {gameLabel(gameEvent.gameKey)} · {gameEvent.title}</div>
                            <div className={styles.systemMeta}>
                              <span>{gameStatusLabel(gameEvent.status)}</span>
                              <span>{formatMessageTime(message.createdAt)}</span>
                              <span className={styles.systemAction}>Открыть сессию</span>
                            </div>
                          </button>
                        </div>
                      );
                    }
                    return (
                      <div key={message.id} className={styles.systemRow} id={`message-${message.id}`}>
                        <button type="button" className={[styles.systemCard, clickable ? styles.systemCardInteractive : ''].filter(Boolean).join(' ')} onClick={clickable && canCallInChat ? () => (hasLiveCall ? joinCall(chatId) : startCall(chatId)) : undefined} disabled={!clickable || !canCallInChat}>
                          <div className={styles.systemText}>{message.text ?? 'Системное событие'}</div>
                          <div className={styles.systemMeta}>
                            <span>{formatMessageTime(message.createdAt)}</span>
                            {clickable ? <span className={styles.systemAction}>{hasLiveCall ? 'Вернуться в звонок' : 'Перезвонить'}</span> : null}
                          </div>
                        </button>
                      </div>
                    );
                  }

                  return (
                    <div key={message.id} id={`message-${message.id}`} className={[styles.msgRow, mine ? styles.mine : styles.their, highlightedMessageId === message.id ? styles.msgRowHighlighted : ''].filter(Boolean).join(' ')}>
                      {!mine ? <StoryRingAvatar userId={message.sender?.id} url={message.sender?.avatarUrl} name={message.sender?.username ?? 'U'} size={28} /> : null}

                      <div className={styles.messageShell}>
                        <div className={[styles.messageActions, openActionsMessageId === message.id ? styles.messageActionsVisible : ''].filter(Boolean).join(' ')}>
                          {canReply ? (
                            <button className={styles.msgActionBtn} type="button" onClick={() => { setReplyTo(message); setEditingMessage(null); textAreaRef.current?.focus(); }} aria-label="Ответить" title="Ответить">
                              <Icon name="reply" size={15} />
                            </button>
                          ) : null}
                          {canForward ? (
                            <button className={styles.msgActionBtn} type="button" onClick={() => openForwardForMessages([message.id])} aria-label="Переслать" title="Переслать">
                              <Icon name="forward" size={15} />
                            </button>
                          ) : null}
                          {canEdit ? (
                            <button className={styles.msgActionBtn} type="button" onClick={() => { setEditingMessage(message); setReplyTo(null); setText(String(message.text ?? '')); requestAnimationFrame(() => { textAreaRef.current?.focus(); resizeTextarea(); }); }} aria-label="Редактировать" title="Редактировать">
                              <Icon name="pencil" size={15} />
                            </button>
                          ) : null}
                          {canDelete ? (
                            <button className={styles.msgActionBtn} type="button" onClick={() => void deleteMessage({ chatId, messageId: message.id }).unwrap().catch(() => null)} aria-label="Удалить" title="Удалить">
                              <Icon name="trash" size={15} />
                            </button>
                          ) : null}
                          <button className={styles.msgActionBtn} type="button" onClick={() => setOpenActionsMessageId((value) => value === message.id ? null : message.id)} aria-label="Действия" title="Действия">
                            <Icon name="dots" size={15} />
                          </button>
                        </div>

                        <div className={[styles.bubble, imageAttachments.length ? styles.bubbleMedia : '', messageType === 'AUDIO' ? styles.bubbleAudio : '', messageType === 'VIDEO_NOTE' ? styles.bubbleVideo : '', mine ? styles.bubbleMine : styles.bubbleTheirs].filter(Boolean).join(' ')} onClick={() => { if (selectionMode) { setSelectedIds((prev) => prev.includes(message.id) ? prev.filter((id) => id !== message.id) : [...prev, message.id]); } }}>
                          {selectionMode ? <div className={[styles.selectMarker, isSelected ? styles.selectMarkerActive : ''].filter(Boolean).join(' ')}>{isSelected ? <Icon name="check" size={12} /> : null}</div> : null}
                          {!mine ? <div className={styles.sender} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{message.sender?.username}<AdminBadge role={message.sender?.role} /></div> : null}

                          {forwardPreview ? (
                            <div className={styles.forwardedBlock}>
                              <Icon name="forward" size={12} />
                              <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>Переслано от {forwardPreview.sender?.username ?? message.sender?.username}<AdminBadge role={forwardPreview.sender?.role ?? message.sender?.role} /></span>
                            </div>
                          ) : null}

                          {storyMeta ? (
                            <button
                              type="button"
                              className={styles.storyReplyBlock}
                              onClick={() => openViewer(String(storyMeta.storyAuthorId ?? ''), String(storyMeta.storyId ?? ''))}
                            >
                              <div className={styles.storyReplyThumb}>
                                {String(storyMeta.storyMediaType ?? '').startsWith('video/') ? (
                                  <video src={String(storyMeta.storyImageUrl ?? '')} muted playsInline />
                                ) : (
                                  <img src={String(storyMeta.storyImageUrl ?? '')} alt="Сторис" />
                                )}
                              </div>
                              <div className={styles.storyReplyMeta}>
                                <span className={styles.replyAuthor}>Ответ на сторис</span>
                                <span className={styles.replyText}>Открыть историю {storyMeta.storyAuthorName ?? ''}</span>
                              </div>
                            </button>
                          ) : null}

                          {replyPreview ? (
                            <button type="button" className={styles.replyBlock} onClick={() => void scrollToMessage(replyPreview.id)}>
                              <span className={styles.replyAuthor} style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>{replyPreview.sender?.username ?? 'Сообщение'}<AdminBadge role={replyPreview.sender?.role} /></span>
                              <span className={styles.replyText}>{formatPreviewText(replyPreview)}</span>
                            </button>
                          ) : null}

                          {messageType === 'AUDIO' && primaryAttachment?.url ? (
                            <AudioMessage url={primaryAttachment.url} duration={Number((primaryAttachment as any)?.durationSec ?? 0) || undefined} className={styles.audioBubble} />
                          ) : messageType === 'VIDEO_NOTE' && primaryAttachment?.url ? (
                            <div className={styles.videoBubbleWrap}>
                              <VideoRing src={primaryAttachment.url} size="large" showProgress className={styles.videoBubble} />
                            </div>
                          ) : (
                            <div className={[styles.msgText, emojiOnly ? styles.msgTextEmojiOnly : ''].filter(Boolean).join(' ')}>{highlightText(textValue, highlightedMessageId === message.id ? searchQuery : '')}</div>
                          )}

                          {message.attachments?.length && (imageAttachments.length || otherAttachments.length) ? (
                            <div className={styles.mediaBlock}>
                              {imageAttachments.length ? <ImageGallery images={imageAttachments} aspect={imageAttachments.length === 1 ? '4 / 5' : '4 / 3'} maxHeight={560} /> : null}
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
                            <span>{formatMessageTime(message.createdAt)}</span>
                            {unreadForMe ? <span className={styles.unreadMark}>Новое</span> : null}
                            {status ? (
                              <span className={styles.statusBadge} title={status.label}>
                                <Icon name={status.icon} size={12} />
                                <span>{status.label}</span>
                              </span>
                            ) : null}
                          </div>
                        </div>
                      </div>
                    </div>
                  );
                })}

                {!isNearBottom ? (
                  <button type="button" className={styles.scrollDown} onClick={() => bottomRef.current?.scrollIntoView({ block: 'end', behavior: 'smooth' })} aria-label="Вниз к последним сообщениям" title="Вниз к последним сообщениям">
                    <Icon name="arrowDown" size={18} />
                  </button>
                ) : null}

                <div ref={bottomRef} />
              </div>

              {mediaOpen ? (
                <div className={styles.mediaPanel}>
                  <div className={styles.mediaTop}>
                    <div className={styles.mediaTitle}>Медиа</div>
                    <div className={styles.mediaActions}>
                      <Button type="button" className={styles.mediaBtn} iconOnly onClick={() => refetchMedia()} loading={mediaFetching} aria-label="Обновить медиа" title="Обновить медиа">
                        <Icon name="refresh" size={16} />
                      </Button>
                      <Button type="button" className={styles.mediaBtn} iconOnly onClick={() => setMediaOpen(false)} aria-label="Закрыть медиа" title="Закрыть медиа">
                        <Icon name="close" size={16} />
                      </Button>
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
                    <div className={styles.mediaEmpty}>{mediaFetching ? 'Загружаем медиа…' : 'Изображений пока нет.'}</div>
                  )}
                </div>
              ) : null}
            </div>

            <div className={styles.composer}>
              {composerLockReason ? <div className={styles.lockBanner}>{composerLockReason}</div> : null}
              {(replyTo || editingMessage) ? (
                <div className={styles.composerMetaBar}>
                  <div className={styles.composerMetaText}>
                    <span className={styles.composerMetaLabel}>{editingMessage ? 'Редактирование' : 'Ответ'}</span>
                    <span>{editingMessage ? formatPreviewText(editingMessage) : `${replyTo?.sender?.username ?? ''}: ${formatPreviewText(replyTo)}`}</span>
                  </div>
                  <button type="button" className={styles.composerMetaClose} onClick={() => { setReplyTo(null); setEditingMessage(null); }} aria-label="Закрыть">
                    <Icon name="close" size={16} />
                  </button>
                </div>
              ) : null}

              {filePreviews.length ? (
                <div className={styles.filesPreview}>
                  {filePreviews.map((preview, index) => (
                    <div className={styles.fileThumb} key={preview.url}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={preview.url} alt="" />
                      <button className={styles.fileRemove} type="button" onClick={() => setFiles((items) => items.filter((_, itemIndex) => itemIndex !== index))} aria-label="Удалить файл">
                        <Icon name="close" size={12} />
                      </button>
                    </div>
                  ))}
                </div>
              ) : null}

              {pendingVoice ? (
                <div className={styles.previewPanel}>
                  <div className={styles.previewHead}>
                    <span>Предпрослушка голосового</span>
                    <button type="button" className={styles.previewRemove} onClick={() => { URL.revokeObjectURL(pendingVoice.url); setPendingVoice(null); }} aria-label="Удалить голосовое">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <AudioMessage url={pendingVoice.url} duration={pendingVoice.duration} />
                </div>
              ) : null}

              {pendingVideo ? (
                <div className={styles.previewPanel}>
                  <div className={styles.previewHead}>
                    <span>Предпросмотр видеосообщения</span>
                    <button type="button" className={styles.previewRemove} onClick={() => { URL.revokeObjectURL(pendingVideo.url); setPendingVideo(null); }} aria-label="Удалить видеосообщение">
                      <Icon name="close" size={14} />
                    </button>
                  </div>
                  <div className={styles.videoPreviewWrap}>
                    <VideoRing src={pendingVideo.url} size="medium" showProgress />
                  </div>
                </div>
              ) : null}

              {isRecordingAudio ? (
                <AudioRecorder variant="inline" className={styles.inlineRecorder} onCancel={() => setIsRecordingAudio(false)} onRecordingComplete={(blob, duration) => handleAudioRecordingComplete(blob, duration)} />
              ) : null}

              <input ref={fileInputRef} className={styles.fileInput} type="file" accept="image/*" multiple onChange={(event) => {
                const list = Array.from(event.target.files ?? []);
                if (!list.length) return;
                setFiles((prev) => [...prev, ...list].slice(0, 10));
                if (fileInputRef.current) fileInputRef.current.value = '';
              }} />

              <div className={styles.composerStage}>
                {showEmojiPicker ? (
                  <EmojiPicker className={styles.inlineEmojiPicker} onSelect={(emoji) => insertEmojiAtCursor(emoji)} onClose={() => { setShowEmojiPicker(false); textAreaRef.current?.focus(); }} />
                ) : null}

                <div className={styles.composerRow}>
                  <button className={styles.toolBtn} type="button" onClick={() => fileInputRef.current?.click()} aria-label="Прикрепить изображение" title="Прикрепить изображение" disabled={!canWriteInChat || Boolean(pendingVoice || pendingVideo || isRecordingVideoNote)}>
                    <Icon name="image" size={18} />
                  </button>
                  <button className={[styles.toolBtn, showEmojiPicker ? styles.toolBtnActive : ''].filter(Boolean).join(' ')} type="button" onClick={() => { setIsRecordingAudio(false); setShowEmojiPicker((value) => !value); }} aria-label="Открыть эмодзи" title="Эмодзи" disabled={!canWriteInChat || Boolean(pendingVoice || pendingVideo || isRecordingVideoNote)}>
                    <Icon name="sparkles" size={18} />
                  </button>
                  <button className={[styles.toolBtn, isRecordingAudio ? styles.toolBtnActive : ''].filter(Boolean).join(' ')} type="button" onClick={() => { if (!canWriteInChat || isRecordingVideoNote || text.trim() || files.length || pendingVoice || pendingVideo) return; setShowEmojiPicker(false); setIsRecordingAudio((value) => !value); }} aria-label="Записать голосовое сообщение" title="Голосовое сообщение" disabled={!canWriteInChat || isSending || isRecordingVideoNote || Boolean(text.trim() || files.length || pendingVoice || pendingVideo)}>
                    <Icon name="mic" size={18} />
                  </button>
                  <button className={[styles.toolBtn, isRecordingVideoNote ? styles.toolBtnDanger : ''].filter(Boolean).join(' ')} type="button" onClick={() => (isRecordingVideoNote ? stopVideoRecorder() : void startVideoNoteRecording())} aria-label="Записать видеосообщение" title="Видеосообщение" disabled={!canWriteInChat || isSending || isRecordingAudio || Boolean(text.trim() || files.length || pendingVoice || pendingVideo)}>
                    <Icon name={isRecordingVideoNote ? 'close' : 'video'} size={18} />
                  </button>

                  <textarea ref={textAreaRef} className={styles.input} placeholder={editingMessage ? 'Измените текст сообщения…' : isRecordingAudio ? 'Идёт запись голосового сообщения…' : 'Сообщение…'} value={text} onChange={(event) => setText(event.target.value.slice(0, 5000).normalize('NFC'))} onPaste={handleTextPaste} onKeyDown={handleTextKeyDown} rows={1} disabled={!canWriteInChat || isRecordingAudio || Boolean(pendingVoice || pendingVideo)} />
                  <Button className={styles.send} iconOnly type="button" onClick={onSend} loading={isSending} disabled={(!text.trim() && !files.length && !pendingVoice && !pendingVideo) || isRecordingAudio} aria-label={editingMessage ? 'Сохранить сообщение' : 'Отправить сообщение'} title={editingMessage ? 'Сохранить сообщение' : 'Отправить сообщение'}>
                    <Icon name={editingMessage ? 'check' : 'send'} size={18} />
                  </Button>
                </div>
              </div>
            </div>
          </Card>
        </div>
      </div>

      <Modal open={gamesOpen} onClose={() => setGamesOpen(false)} title="Игры в чате" size="game">
        <GameSessionPanel chat={chat} meId={meId ?? ''} />
      </Modal>

      <Modal open={forwardOpen} onClose={() => setForwardOpen(false)} title="Переслать сообщения">
        <div className={styles.forwardModal}>
          <div className={styles.forwardHint}>Выбери друзей, которым нужно переслать {selectedMessages.length === 1 ? 'сообщение' : 'сообщения'}.</div>
          <div className={styles.forwardList}>
            {friendsLoading ? (
              <div style={{ display: 'grid', gap: 10 }}>
                {Array.from({ length: 4 }).map((_, index) => <SkeletonText key={index} lines={1} />)}
              </div>
            ) : friends.map((friendship: any) => {
              const user = getFriendUser(friendship, meId);
              if (!user) return null;
              const checked = Boolean(forwardTargetIds[user.id]);
              return (
                <label key={user.id} className={[styles.forwardRow, checked ? styles.forwardRowChecked : ''].filter(Boolean).join(' ')}>
                  <div className={styles.forwardUserInfo}>
                    <StoryRingAvatar userId={user.id} url={user.avatarUrl} name={user.username} size={36} />
                    <div>
                      <div className={styles.forwardName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{user.username}<AdminBadge role={user.role} /></div>
                      <div className={styles.forwardSub}>Личный чат</div>
                    </div>
                  </div>
                  <input type="checkbox" checked={checked} onChange={(event) => setForwardTargetIds((prev) => ({ ...prev, [user.id]: event.target.checked }))} />
                </label>
              );
            })}
          </div>
          <div className={styles.forwardActions}>
            <Button type="button" onClick={handleForwardSubmit} loading={forwarding} disabled={!selectedForwardTargetIds.length}>Отправить</Button>
            <Button type="button" variant="ghost" onClick={() => setForwardOpen(false)}>Отмена</Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
