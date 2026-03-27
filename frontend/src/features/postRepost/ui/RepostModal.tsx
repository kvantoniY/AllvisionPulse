'use client';

import { useEffect, useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useCreatePostMutation } from '@/shared/api/postsApi';
import { useCreateDirectChatMutation, useGetChatsQuery, useSendMessageMutation } from '@/shared/api/chatsApi';
import { useGetMeQuery, useGetUserConnectionsQuery } from '@/shared/api/usersApi';
import type { Post } from '@/shared/types/social';
import type { Chat } from '@/shared/types/chat';
import { ROUTES } from '@/shared/config/app';
import styles from './RepostModal.module.css';

const MAX_TEXT = 5000;
type Mode = 'wall' | 'direct';

type Recipient = {
  id: string;
  username: string;
  avatarUrl?: string | null;
  role?: string;
  chatId?: string | null;
  canMessage: boolean;
  disabledReason?: string | null;
};

function getOriginalPost(post: Post): Post {
  let current = post;
  while (current.repostOf) current = current.repostOf;
  return current;
}

function buildMessageText(post: Post, note: string) {
  const source = getOriginalPost(post);
  const parts: string[] = [];
  if (note.trim()) parts.push(note.trim());
  parts.push(`Репост публикации от @${source.author.username}`);
  if (source.text?.trim()) parts.push(source.text.trim().slice(0, 900));
  const imageLinks = (source.images ?? []).slice(0, 8).map((item) => item.url);
  if (imageLinks.length) parts.push(imageLinks.join('\n'));
  return parts.filter(Boolean).join('\n\n');
}

function getDirectPartner(chat: Chat, myId?: string | null) {
  const partner = chat.members.find((member) => member.userId !== myId)?.user;
  if (!partner) return null;
  return {
    id: partner.id,
    username: partner.username,
    avatarUrl: partner.avatarUrl,
    role: partner.role,
    chatId: chat.id,
  };
}

export function RepostModal({ open, onClose, post }: { open: boolean; onClose: () => void; post: Post | null }) {
  const router = useRouter();
  const isMobile = useIsMobile();
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const [mode, setMode] = useState<Mode>('wall');
  const [note, setNote] = useState('');
  const [query, setQuery] = useState('');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);

  const { data: chatsData } = useGetChatsQuery(undefined, { skip: !open || mode !== 'direct' });
  const { data: followersData } = useGetUserConnectionsQuery(
    { username: me?.username ?? '', tab: 'followers' },
    { skip: !open || mode !== 'direct' || !me?.username },
  );
  const { data: followingData } = useGetUserConnectionsQuery(
    { username: me?.username ?? '', tab: 'following' },
    { skip: !open || mode !== 'direct' || !me?.username },
  );

  const [createPost, createState] = useCreatePostMutation();
  const [createDirectChat, createChatState] = useCreateDirectChatMutation();
  const [sendMessage, sendState] = useSendMessageMutation();

  useEffect(() => {
    if (!open) return;
    setMode('wall');
    setNote('');
    setQuery('');
    setSelectedIds([]);
  }, [open, post?.id]);

  const directMap = useMemo(() => {
    const map = new Map<string, { chatId: string }>();
    for (const chat of chatsData?.items ?? []) {
      if (chat.type !== 'DIRECT') continue;
      const partner = getDirectPartner(chat, me?.id);
      if (!partner) continue;
      map.set(partner.id, { chatId: chat.id });
    }
    return map;
  }, [chatsData?.items, me?.id]);

  const mutualRecipients = useMemo(() => {
    const followers = new Map<string, any>();
    const following = new Map<string, any>();

    for (const record of followersData?.items ?? []) {
      const user = record.senderId === me?.id ? record.receiver : record.sender;
      if (user?.id) followers.set(user.id, user);
    }

    for (const record of followingData?.items ?? []) {
      const user = record.receiverId === me?.id ? record.sender : record.receiver;
      if (user?.id) following.set(user.id, user);
    }

    const items: Recipient[] = [];
    for (const [id, user] of following.entries()) {
      if (!followers.has(id) || id === me?.id) continue;
      const allowMessagesFrom = user?.privacy?.allowMessagesFrom ?? 'everyone';
      const canMessage = allowMessagesFrom !== 'none';
      items.push({
        id,
        username: user.username,
        avatarUrl: user.avatarUrl,
        role: user.role,
        chatId: directMap.get(id)?.chatId ?? null,
        canMessage,
        disabledReason: canMessage ? null : 'Личные сообщения закрыты',
      });
    }

    return items.sort((a, b) => {
      if (!!a.chatId !== !!b.chatId) return a.chatId ? -1 : 1;
      if (a.canMessage !== b.canMessage) return a.canMessage ? -1 : 1;
      return a.username.localeCompare(b.username, 'ru');
    });
  }, [directMap, followersData?.items, followingData?.items, me?.id]);

  const filteredRecipients = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return mutualRecipients;
    return mutualRecipients.filter((item) => item.username.toLowerCase().includes(q));
  }, [mutualRecipients, query]);

  const selectedRecipients = useMemo(() => mutualRecipients.filter((item) => selectedIds.includes(item.id)), [mutualRecipients, selectedIds]);

  const busy = createState.isLoading || createChatState.isLoading || sendState.isLoading;
  const canSubmit = !!post && !busy && (mode === 'wall' ? true : selectedRecipients.length > 0 && selectedRecipients.every((item) => item.canMessage));

  const toggleRecipient = (item: Recipient) => {
    if (!item.canMessage) return;
    setSelectedIds((prev) => (prev.includes(item.id) ? prev.filter((id) => id !== item.id) : [...prev, item.id]));
  };

  const onSubmit = async () => {
    if (!post || !canSubmit) return;
    const original = getOriginalPost(post);

    if (mode === 'wall') {
      await createPost({ text: note.trim() || undefined, repostOfId: original.id }).unwrap().catch(() => null);
      onClose();
      return;
    }

    let firstChatId: string | null = null;
    for (const recipient of selectedRecipients) {
      let chatId = recipient.chatId ?? null;
      if (!chatId) {
        const created = await createDirectChat({ userId: recipient.id }).unwrap().catch(() => null);
        chatId = created?.chat?.id ?? null;
      }
      if (!chatId) continue;
      if (!firstChatId) firstChatId = chatId;
      const text = buildMessageText(original, note);
      await sendMessage({ chatId, text }).unwrap().catch(() => null);
    }
    onClose();
    if (firstChatId) router.push(`${ROUTES.app.messages}/${firstChatId}`);
  };

  const content = (
    <div className={styles.stack}>
      <div className={styles.segmented}>
        <button
          type="button"
          className={[styles.segmentBtn, mode === 'wall' ? styles.segmentBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => setMode('wall')}
        >
          <Icon name="user" size={16} />
          <span>Себе на стену</span>
        </button>
        <button
          type="button"
          className={[styles.segmentBtn, mode === 'direct' ? styles.segmentBtnActive : ''].filter(Boolean).join(' ')}
          onClick={() => setMode('direct')}
        >
          <Icon name="messages" size={16} />
          <span>В личные сообщения</span>
        </button>
      </div>

      <div className={styles.scrollArea}>
        {mode === 'direct' ? (
          <div className={styles.fieldBlock}>
            <label className={styles.label}>Кому отправить</label>
            <div className={styles.searchWrap}>
              <Icon name="search" size={16} className={styles.searchIcon} />
              <input
                className={styles.searchInput}
                value={query}
                onChange={(event) => setQuery(event.target.value)}
                placeholder="Найти среди взаимных подписок"
              />
            </div>
            {selectedRecipients.length ? (
              <div className={styles.selectedStrip}>
                {selectedRecipients.map((item) => (
                  <button key={item.id} type="button" className={styles.selectedChip} onClick={() => toggleRecipient(item)}>
                    <span>@{item.username}</span>
                    <Icon name="close" size={12} />
                  </button>
                ))}
              </div>
            ) : null}

            <div className={styles.recipientList}>
              {filteredRecipients.map((item) => (
                <button
                  type="button"
                  key={`${item.id}:${item.chatId ?? 'user'}`}
                  className={[
                    styles.recipientRow,
                    selectedIds.includes(item.id) ? styles.recipientRowActive : '',
                    !item.canMessage ? styles.recipientRowDisabled : '',
                  ].filter(Boolean).join(' ')}
                  onClick={() => toggleRecipient(item)}
                  disabled={!item.canMessage}
                >
                  <Avatar url={item.avatarUrl} name={item.username} size={38} />
                  <div className={styles.recipientMeta}>
                    <div className={styles.recipientNameRow}>
                      <span className={styles.recipientName}>@{item.username}</span>
                      {!item.canMessage ? (
                        <span className={styles.recipientBadge}>
                          <Icon name="shield" size={12} />
                          <span>Нельзя написать</span>
                        </span>
                      ) : null}
                    </div>
                    <div className={styles.recipientHint}>
                      {!item.canMessage ? item.disabledReason : item.chatId ? 'Уже есть диалог' : 'Создать новый диалог'}
                    </div>
                  </div>
                  {selectedIds.includes(item.id) ? <Icon name="check" size={16} /> : null}
                </button>
              ))}

              {!filteredRecipients.length ? (
                <div className={styles.emptyState}>
                  {query.trim().length
                    ? 'Никого не нашли среди взаимных подписок.'
                    : 'Здесь появятся пользователи, которым можно отправить репост.'}
                </div>
              ) : null}
            </div>
          </div>
        ) : null}

        <div className={styles.fieldBlock}>
          <label className={styles.label}>{mode === 'wall' ? 'Текст к репосту' : 'Сообщение'}</label>
          <textarea
            className={styles.textarea}
            value={note}
            onChange={(event) => setNote(event.target.value.slice(0, MAX_TEXT))}
            placeholder={mode === 'wall' ? 'Добавьте комментарий к репосту' : 'Добавьте текст к сообщению'}
            rows={4}
          />
          <div className={styles.counter}>{MAX_TEXT - note.length}</div>
        </div>
      </div>

      <div className={styles.footer}>
        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={busy}>
          Отмена
        </button>
        <button type="button" className={styles.submitBtn} onClick={() => void onSubmit()} disabled={!canSubmit}>
          {busy ? 'Отправляем…' : mode === 'wall' ? 'Опубликовать' : 'Отправить'}
        </button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet open={open} onClose={busy ? () => undefined : onClose} title="Поделиться">
        <div className={styles.mobileWrap}>{content}</div>
      </MobileSheet>
    );
  }

  return (
    <Modal open={open} onClose={busy ? () => undefined : onClose} title="Поделиться" icon={<Icon name="forward" size={18} />} size="md">
      {content}
    </Modal>
  );
}
