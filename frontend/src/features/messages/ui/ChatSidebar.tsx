'use client';

import { useMemo, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { useGetChatsQuery, useGetMessagesQuery, useCreateGroupChatMutation } from '@/shared/api/chatsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useGetFriendsQuery } from '@/shared/api/friendsApi';
import { useAppSelector } from '@/shared/lib/storeHooks';
import styles from './ChatSidebar.module.css';

function getChatTitle(chat: any, meId: string | undefined) {
  if (chat.type === 'GROUP') return chat.title ?? 'Group';
  const other = (chat.members ?? []).find((m: any) => m.userId !== meId)?.user;
  return other?.username ?? 'Direct';
}

function getChatAvatar(chat: any, meId: string | undefined) {
  if (chat.type === 'GROUP') return null;
  const other = (chat.members ?? []).find((m: any) => m.userId !== meId)?.user;
  return other?.avatarUrl ?? null;
}

function ChatListItem({ chat, meId, unread, activeId, onOpen, presence }: any) {
  const cachedLast = (chat as any).lastMessage as any | undefined;
  const { data } = useGetMessagesQuery({ chatId: chat.id, take: 1, cursor: null }, { skip: Boolean(cachedLast) });
  const last = cachedLast ?? (data?.items?.[0] ?? null);

  const lastText = last?.text ? String(last.text) : last ? `[${last.type ?? 'MESSAGE'}]` : '—';
  const lastAt = last?.createdAt ?? chat.updatedAt;

  const mine = last?.senderId && meId && last.senderId === meId;
  const otherId = chat.type === 'DIRECT' ? (chat.members ?? []).find((m: any) => m.userId !== meId)?.userId : null;
  const readByOther = mine && otherId ? (last.reads ?? []).some((r: any) => r.userId === otherId) : false;
  const status = mine ? (readByOther ? 'прочитано' : 'не прочитано') : unread > 0 ? 'не прочитано' : '';

  const otherUser = chat.type === 'DIRECT' ? (chat.members ?? []).find((m: any) => m.userId !== meId)?.user : null;
  const p = otherUser?.id ? presence?.[otherUser.id] : null;
  const avatarStatus = chat.type === 'DIRECT' ? (p?.isOnline ? 'online' : 'offline') : null;

  return (
    <button
      type="button"
      className={[styles.item, activeId === chat.id ? styles.itemActive : ''].join(' ')}
      onClick={onOpen}
    >
      <Avatar url={getChatAvatar(chat, meId)} name={getChatTitle(chat, meId)} size={40} status={avatarStatus} />
      <div style={{ minWidth: 0, flex: 1 }}>
        <div className={styles.itemTop}>
          <div className={styles.itemTitle}>{getChatTitle(chat, meId)}</div>
          {unread > 0 ? <span className={styles.unreadBadge}>{unread}</span> : null}
        </div>
        <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
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

export function ChatSidebar({ activeChatId }: { activeChatId?: string | null }) {
  const router = useRouter();
  const { data: meData } = useGetMeQuery();
  const meId = meData?.user?.id;

  const { data, isFetching } = useGetChatsQuery();
  const chats = data?.items ?? [];
  const unreadByChat = useAppSelector((s) => s.chatUi.unreadByChat);
  const presence = useAppSelector((s) => s.presence.byUserId);

  const [groupOpen, setGroupOpen] = useState(false);
  const { data: friendsData } = useGetFriendsQuery(undefined, { skip: !groupOpen });
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
        <div className={styles.title}>Messages</div>
        <div className={styles.actions}>
          <button className={styles.actionBtn} type="button" onClick={() => setGroupOpen(true)}>
            + Группа
          </button>
        </div>
      </div>

      <div className={styles.list}>
        {isFetching && !chats.length ? <div style={{ color: 'var(--muted)', padding: 10 }}>Loading…</div> : null}
        {chats.map((c) => (
          <ChatListItem
            key={c.id}
            chat={c}
            meId={meId}
            unread={unreadByChat[c.id] ?? 0}
            activeId={activeChatId}
            onOpen={() => router.push(`/messages/${c.id}`)}
            presence={presence}
          />
        ))}
        {!isFetching && !chats.length ? <div style={{ color: 'var(--muted)', padding: 10 }}>No chats yet.</div> : null}
      </div>

      {groupOpen ? (
        <div className={styles.modalBackdrop} onMouseDown={() => setGroupOpen(false)}>
          <div className={styles.modal} onMouseDown={(e) => e.stopPropagation()}>
            <div style={{ fontWeight: 900 }}>Новый групповой чат</div>
            <div className={styles.formRow}>
              <input className={styles.input} placeholder="Название" value={title} onChange={(e) => setTitle(e.target.value)} />
              <button className={styles.actionBtn} type="button" onClick={onCreate} disabled={!title.trim() || createRes.isLoading}>
                {createRes.isLoading ? '…' : 'Создать'}
              </button>
              <button className={styles.actionBtn} type="button" onClick={() => setGroupOpen(false)}>
                Отмена
              </button>
            </div>

            <div style={{ marginTop: 10, color: 'var(--muted)', fontSize: 12 }}>Участники (друзья)</div>
            <div className={styles.friendList}>
              {friends.map((fr: any) => {
                const u = fr.sender?.id === meId ? fr.receiver : fr.sender;
                if (!u) return null;
                const checked = Boolean(selected[u.id]);
                return (
                  <div key={u.id} className={styles.friendRow}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <Avatar url={u.avatarUrl} name={u.username} size={28} />
                      <div>{u.username}</div>
                    </div>
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => setSelected((p) => ({ ...p, [u.id]: e.target.checked }))}
                    />
                  </div>
                );
              })}
              {!friends.length ? <div style={{ color: 'var(--muted)' }}>Нет друзей для добавления.</div> : null}
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
