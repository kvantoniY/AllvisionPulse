'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { StoryRingAvatar } from '@/features/stories';
import { Button } from '@/shared/ui/Button/Button';
import { useGetChatsQuery, useCreateGroupChatMutation } from '@/shared/api/chatsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useGetFriendsQuery } from '@/shared/api/friendsApi';
import { useAppSelector } from '@/shared/lib/storeHooks';
import styles from './ChatSidebar.module.css';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { NotificationStatusPill } from '@/features/notifications/ui/NotificationStatusPill';

function getChatTitle(chat: any, meId: string | undefined) {
  if (chat.type === 'GROUP') return chat.title ?? 'Группа';
  const other = (chat.members ?? []).find((m: any) => m.userId !== meId)?.user;
  return other?.username ?? 'Диалог';
}

function getChatAvatar(chat: any, meId: string | undefined) {
  if (chat.type === 'GROUP') return null;
  const other = (chat.members ?? []).find((m: any) => m.userId !== meId)?.user;
  return other?.avatarUrl ?? null;
}

function ChatListItem({ chat, meId, unread, activeId, onOpen, presence }: any) {
  const last = (chat as any).lastMessage ?? null;

  const typeLabel = last?.type === 'AUDIO' ? 'Голосовое' : last?.type === 'VIDEO_NOTE' ? 'Видеосообщение' : last?.attachments?.length ? 'Вложение' : last?.type === 'SYSTEM' ? 'Системное сообщение' : 'Сообщение';
  const lastText = last?.text ? String(last.text) : last ? typeLabel : '—';
  const lastAt = last?.createdAt ?? chat.updatedAt;

  const mine = last?.senderId && meId && last.senderId === meId;
  const otherId = chat.type === 'DIRECT' ? (chat.members ?? []).find((m: any) => m.userId !== meId)?.userId : null;
  const readByOther = mine && otherId ? (last.reads ?? []).some((r: any) => r.userId === otherId) : false;
  const status = mine ? (readByOther ? 'прочитано' : 'доставлено') : unread > 0 ? 'новое' : '';

  const otherUser = chat.type === 'DIRECT' ? (chat.members ?? []).find((m: any) => m.userId !== meId)?.user : null;
  const p = otherUser?.id ? presence?.[otherUser.id] : null;
  const avatarStatus = chat.type === 'DIRECT' ? (p?.isOnline ? 'online' : 'offline') : null;

  return (
    <button type="button" className={[styles.item, activeId === chat.id ? styles.itemActive : ''].join(' ')} onClick={onOpen}>
      <StoryRingAvatar userId={otherUser?.id} url={getChatAvatar(chat, meId)} name={getChatTitle(chat, meId)} size={44} status={avatarStatus} disableStoryClick={chat.type === 'GROUP'} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className={styles.itemTop}>
          <div className={styles.itemTitle}>{getChatTitle(chat, meId)}</div>
          {unread > 0 ? <span className={styles.unreadBadge}>{unread}</span> : null}
        </div>
        <div className={styles.itemMeta}>
          <span className={styles.preview}>{lastText}</span>
          <span className={styles.metaRight}>
            {status ? <span className={styles.status}>{status}</span> : null}
            <span className={styles.time}>{new Date(lastAt).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span>
          </span>
        </div>
      </div>
    </button>
  );
}

function ChatListSkeleton() {
  return (
    <div className={styles.list}>
      {Array.from({ length: 5 }).map((_, index) => (
        <div key={index} className={styles.item}>
          <Skeleton circle style={{ width: 44, height: 44 }} />
          <div style={{ flex: 1, minWidth: 0 }}>
            <SkeletonText lines={2} />
          </div>
        </div>
      ))}
    </div>
  );
}

export function ChatSidebar({ activeChatId }: { activeChatId?: string | null }) {
  const router = useRouter();
  const { data: meData } = useGetMeQuery();
  const meId = meData?.user?.id;

  const { data, isFetching, isError, refetch } = useGetChatsQuery(undefined, { refetchOnFocus: true, refetchOnReconnect: true });
  const chats = data?.items ?? [];
  const unreadByChat = useAppSelector((s) => s.chatUi.unreadByChat);
  const presence = useAppSelector((s) => s.presence.byUserId);

  const [groupOpen, setGroupOpen] = useState(false);
  const { data: friendsData, isFetching: friendsLoading } = useGetFriendsQuery(undefined, { skip: !groupOpen });
  const friends = friendsData?.friends ?? [];

  const [title, setTitle] = useState('');
  const [selected, setSelected] = useState<Record<string, boolean>>({});
  const [createGroup, createRes] = useCreateGroupChatMutation();
  const selectedIds = useMemo(() => Object.keys(selected).filter((id) => selected[id]), [selected]);

  const onCreate = async () => {
    const t = title.trim();
    if (!t) return;
    const res = await createGroup({ title: t, memberIds: selectedIds }).unwrap().catch(() => null);
    if (res?.chat?.id) {
      setGroupOpen(false);
      setTitle('');
      setSelected({});
      router.push(`/messages/${res.chat.id}`);
    }
  };

  return (
    <div className={styles.side}>
      <div className={styles.header}>
        <div>
          <div className={styles.eyebrow}>Сообщения</div>
          <div className={styles.title}>Ваши чаты</div>
          <div style={{ marginTop: 8 }}>
            <NotificationStatusPill compact />
          </div>
        </div>
        <div className={styles.actions}>
          <Button className={styles.actionBtn} iconOnly type="button" onClick={() => setGroupOpen(true)} aria-label="Новая группа" title="Новая группа">
            <Icon name="plus" size={16} />
          </Button>
        </div>
      </div>

      {isFetching && !chats.length ? <ChatListSkeleton /> : null}
      {isError && !chats.length ? (
        <div className={styles.list}>
          <div className={styles.state}>Не удалось загрузить чаты.</div>
          <Button className={styles.actionBtn} type="button" onClick={() => refetch()}>Повторить</Button>
        </div>
      ) : null}
      {!isFetching || chats.length ? (
        <div className={styles.list}>
          {chats.map((c) => (
            <ChatListItem key={c.id} chat={c} meId={meId} unread={unreadByChat[c.id] ?? 0} activeId={activeChatId} onOpen={() => router.push(`/messages/${c.id}`)} presence={presence} />
          ))}
          {!isFetching && !chats.length ? <div className={styles.state}>У вас пока нет чатов.</div> : null}
        </div>
      ) : null}

      {groupOpen ? (
        <div className={styles.modalBackdrop} onMouseDown={() => setGroupOpen(false)}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div className={styles.modalTitle}>Новый групповой чат</div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Название группы" value={title} onChange={(e) => setTitle(e.target.value)} />
            </div>
            <div className={styles.formActions}>
              <Button className={styles.actionBtn} type="button" onClick={onCreate} disabled={!title.trim()} loading={createRes.isLoading}>Создать</Button>
              <Button className={styles.actionBtn} type="button" onClick={() => setGroupOpen(false)}>Отмена</Button>
            </div>

            <div className={styles.friendsCaption}>Участники</div>
            <div className={styles.friendList}>
              {friendsLoading ? <ChatListSkeleton /> : null}
              {!friendsLoading ? friends.map((fr: any) => {
                const u = fr.sender?.id === meId ? fr.receiver : fr.sender;
                if (!u) return null;
                const checked = Boolean(selected[u.id]);
                return (
                  <label key={u.id} className={styles.friendRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <StoryRingAvatar userId={u.id} url={u.avatarUrl} name={u.username} size={30} />
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{u.username}<AdminBadge role={u.role} /></div>
                    </div>
                    <input type="checkbox" checked={checked} onChange={(e) => setSelected((p) => ({ ...p, [u.id]: e.target.checked }))} />
                  </label>
                );
              }) : null}
              {!friendsLoading && !friends.length ? <div className={styles.state}>Нет друзей для добавления.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
