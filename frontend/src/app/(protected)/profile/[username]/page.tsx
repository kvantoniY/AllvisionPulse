'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../Profile.module.css';
import { useGetMeQuery, useGetUserByUsernameQuery, useGetUserConnectionsQuery, useUpdateProfileMutation } from '@/shared/api/usersApi';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { ProfileStoriesPanel, StoryRingAvatar } from '@/features/stories';
import { Button } from '@/shared/ui/Button/Button';
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useDeclineFriendRequestMutation,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from '@/shared/api/friendsApi';
import { StartChatModal } from '@/features/startChat/ui/StartChatModal';
import { useCreateDirectChatMutation } from '@/shared/api/chatsApi';
import { useGetFeedQuery, useLazyGetFeedQuery } from '@/shared/api/postsApi';
import { PostCard } from '@/entities/post/ui/PostCard';
import { PostComposer } from '@/features/postComposer/ui/PostComposer';
import { PostModal } from '@/features/postModal/ui/PostModal';
import { useIntersection } from '@/shared/lib/hooks/useIntersection';
import { useAppSelector } from '@/shared/lib/storeHooks';
import { formatLastSeen } from '@/shared/lib/formatLastSeen';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { Modal } from '@/shared/ui/Modal/Modal';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { useDeleteUserAsAdminMutation, useSuspendUserMutation, useUnsuspendUserMutation } from '@/shared/api/adminApi';

function ConnectionList({
  tab,
  username,
  open,
}: {
  tab: 'followers' | 'following';
  username: string;
  open: boolean;
}) {
  const { data, isLoading } = useGetUserConnectionsQuery({ username, tab }, { skip: !open });
  const items = data?.items ?? [];

  return (
    <div className={styles.connectionModalBody}>
      {isLoading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <SkeletonText lines={2} />
          <SkeletonText lines={2} />
        </div>
      ) : null}
      {!isLoading && data?.canView === false ? <div className={styles.connectionEmpty}>Список скрыт настройками приватности или недоступен из-за чёрного списка.</div> : null}
      {!isLoading && data?.canView !== false && !items.length ? <div className={styles.connectionEmpty}>Здесь пока пусто.</div> : null}
      {!isLoading && data?.canView !== false ? items.map((record: any) => {
        const user = tab === 'followers' ? record.sender : record.receiver;
        if (!user) return null;
        return (
          <div key={record.id} className={styles.connectionRow}>
            <div className={styles.connectionUser}>
              <StoryRingAvatar userId={user.id} url={user.avatarUrl} name={user.username} size={42} />
              <div className={styles.connectionMeta}>
                <div className={styles.connectionName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{user.username}<AdminBadge role={user.role} /></div>
                <div className={styles.connectionHandle}>@{user.username}</div>
              </div>
            </div>
          </div>
        );
      }) : null}
    </div>
  );
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const { data, isLoading, isError, refetch: refetchUser } = useGetUserByUsernameQuery(username);
  const user = data?.user;
  const relationship = data?.relationship;
  const isSelf = Boolean(me && user && me.id === user.id);
  const presence = useAppSelector((s) => s.presence.byUserId);
  const p = user?.id ? presence[user.id] : undefined;
  const canViewProfile = Boolean(isSelf || relationship?.canViewProfile);
  const canMessage = Boolean(isSelf || relationship?.canMessage);
  const isBlocked = Boolean(relationship?.isBlocked);
  const isAdmin = me?.role === 'ADMIN';
  const canModerateUser = Boolean(isAdmin && user && me && user.id !== me.id);
  const isUserSuspended = Boolean(user?.suspendedPermanent || (user?.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()));

  const { data: feedData, isFetching: feedFetching } = useGetFeedQuery(undefined);
  const [fetchFeedPage] = useLazyGetFeedQuery();
  const feedItems = feedData?.items ?? [];
  const feedNextCursor = feedData?.nextCursor ?? null;

  const [chatStartOpen, setChatStartOpen] = useState(false);
  const [chatStartId, setChatStartId] = useState<string | null>(null);
  const [createDirectChat, { isLoading: creatingChat }] = useCreateDirectChatMutation();
  const [sendFollow, { isLoading: sendingFollow }] = useSendFriendRequestMutation();
  const [acceptFollow, { isLoading: accepting }] = useAcceptFriendRequestMutation();
  const [declineFollow, { isLoading: declining }] = useDeclineFriendRequestMutation();
  const [unfollow, { isLoading: removing }] = useRemoveFriendMutation();
  const [blockUser, { isLoading: blocking }] = useBlockUserMutation();
  const [unblockUser, { isLoading: unblocking }] = useUnblockUserMutation();
  const [edit, setEdit] = useState(false);
  const [bio, setBio] = useState('');
  const [saveBio, { isLoading: savingBio }] = useUpdateProfileMutation();
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState<'followers' | 'following' | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [adminReason, setAdminReason] = useState('');
  const [suspendUser, { isLoading: suspendingUser }] = useSuspendUserMutation();
  const [unsuspendUser, { isLoading: unsuspendingUser }] = useUnsuspendUserMutation();
  const [deleteUserAsAdmin, { isLoading: deletingUserAsAdmin }] = useDeleteUserAsAdminMutation();

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inView = useIntersection(sentinelRef, { rootMargin: '220px 0px' });

  useEffect(() => {
    if (typeof user?.bio === 'string') setBio(user.bio);
  }, [user?.bio]);

  useEffect(() => {
    if (!inView || !feedNextCursor || !canViewProfile) return;
    fetchFeedPage(feedNextCursor).catch(() => null);
  }, [canViewProfile, feedNextCursor, fetchFeedPage, inView]);

  const userPosts = useMemo(() => {
    if (!user?.id || !canViewProfile) return [];
    return feedItems.filter((item: any) => item.authorId === user.id);
  }, [canViewProfile, feedItems, user?.id]);

  const onSubmitBio = async () => {
    await saveBio({ bio }).unwrap().catch(() => null);
    refetchUser();
    setEdit(false);
  };

  const startMessage = async () => {
    if (!user?.id || !canMessage) return;
    const res = await createDirectChat({ userId: user.id }).unwrap().catch(() => null);
    const cid = res?.chat?.id;
    if (!cid) return;
    setChatStartId(cid);
    setChatStartOpen(true);
  };

  const handlePrimaryFollowAction = async () => {
    if (!user || isSelf || isBlocked) return;

    if (relationship?.incomingRequest && relationship.userToViewer?.id) {
      await acceptFollow({ friendshipId: relationship.userToViewer.id }).unwrap().catch(() => null);
      refetchUser();
      return;
    }

    if (relationship?.isFollowing || relationship?.outgoingRequest) {
      await unfollow({ userId: user.id }).unwrap().catch(() => null);
      refetchUser();
      return;
    }

    await sendFollow({ userId: user.id }).unwrap().catch(() => null);
    refetchUser();
  };

  const primaryAction = useMemo(() => {
    if (isSelf) return { label: 'Редактировать профиль', tone: 'primary' as const, loading: false, disabled: false };
    if (relationship?.blockedByMe) return { label: 'В чёрном списке', tone: 'muted' as const, loading: false, disabled: true };
    if (relationship?.blockedMe) return { label: 'Доступ ограничен', tone: 'muted' as const, loading: false, disabled: true };
    if (relationship?.incomingRequest) return { label: 'Принять запрос', tone: 'primary' as const, loading: accepting, disabled: false };
    if (relationship?.isFollowing) return { label: 'Отписаться', tone: 'soft' as const, loading: removing, disabled: false };
    if (relationship?.outgoingRequest) return { label: 'Отменить запрос', tone: 'soft' as const, loading: removing, disabled: false };
    return { label: relationship?.followsYou ? 'Подписаться в ответ' : 'Подписаться', tone: 'primary' as const, loading: sendingFollow, disabled: false };
  }, [accepting, isSelf, relationship, removing, sendingFollow]);

  const handleAdminSuspend = async (payload: { durationDays?: number | null; permanent?: boolean }) => {
    if (!user?.id || !canModerateUser) return;
    await suspendUser({ userId: user.id, reason: adminReason.trim() || null, ...payload }).unwrap().catch(() => null);
    await refetchUser();
  };

  const handleAdminDelete = async () => {
    if (!user?.id || !canModerateUser) return;
    const ok = window.confirm(`Удалить аккаунт @${user.username} без возможности восстановления?`);
    if (!ok) return;
    await deleteUserAsAdmin({ userId: user.id }).unwrap().catch(() => null);
    router.replace('/feed');
  };

  const restrictionMessage = relationship?.blockedMe
    ? 'Пользователь добавил вас в чёрный список. Публикации, подписки и общение скрыты.'
    : relationship?.blockedByMe
      ? 'Вы добавили пользователя в чёрный список. Публикации и общение скрыты, пока пользователь находится в ЧС.'
      : 'Профиль скрыт настройками приватности. Чтобы увидеть подробности, нужно быть подтверждённым подписчиком.';

  if (isLoading) {
    return (
      <div className="container">
        <Card>
          <CardHeader title="Профиль" />
          <div style={{ display: 'grid', gap: 16 }}><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Skeleton circle style={{ width: 74, height: 74 }} /><div style={{ flex: 1 }}><SkeletonText lines={3} /></div></div><SkeletonText lines={3} /></div>
        </Card>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className="container">
        <Card>
          <CardHeader title="Профиль недоступен" />
          <CardMuted>Пользователь скрыт, заблокирован администрацией или не существует.</CardMuted>
        </Card>
      </div>
    );
  }

  return (
    <div className="container">
      <PostModal postId={openPostId} open={!!openPostId} onClose={() => setOpenPostId(null)} />
      <StartChatModal open={chatStartOpen} chatId={chatStartId} title="Новое сообщение" onClose={() => setChatStartOpen(false)} onSent={(cid) => router.push(`/messages/${cid}`)} />
      <Modal open={actionsOpen} onClose={() => setActionsOpen(false)} title="Действия с профилем">
        <div className={styles.profileActionsModal}>
          {relationship?.blockedByMe ? (
            <Button onClick={() => unblockUser({ userId: user.id }).unwrap().then(refetchUser).finally(() => setActionsOpen(false)).catch(() => null)} loading={unblocking}>Убрать из чёрного списка</Button>
          ) : (
            <Button onClick={() => blockUser({ userId: user.id }).unwrap().then(refetchUser).finally(() => setActionsOpen(false)).catch(() => null)} loading={blocking}>Добавить в чёрный список</Button>
          )}
          {canModerateUser ? (
            <div className={styles.adminPanel}>
              <div className={styles.adminPanelTitle}>Админ-действия</div>
              <div className={styles.adminPanelHint}>Эти действия работают через серверные проверки роли из БД. Старые токены не дадут обхода доступа.</div>
              <textarea
                className={styles.textarea}
                value={adminReason}
                onChange={(event) => setAdminReason(event.target.value.slice(0, 500))}
                rows={3}
                placeholder="Причина блокировки (необязательно)"
              />
              <div className={styles.adminActionGrid}>
                <Button onClick={() => handleAdminSuspend({ durationDays: 1 })} loading={suspendingUser}>Заблокировать на 1 день</Button>
                <Button onClick={() => handleAdminSuspend({ durationDays: 7 })} loading={suspendingUser}>На 7 дней</Button>
                <Button onClick={() => handleAdminSuspend({ durationDays: 30 })} loading={suspendingUser}>На 30 дней</Button>
                <Button variant="primary" onClick={() => handleAdminSuspend({ permanent: true })} loading={suspendingUser}>Бессрочно</Button>
                <Button onClick={() => user?.id && unsuspendUser({ userId: user.id }).unwrap().then(refetchUser).catch(() => null)} loading={unsuspendingUser} disabled={!isUserSuspended}>Снять блокировку</Button>
                <Button onClick={handleAdminDelete} loading={deletingUserAsAdmin}>Удалить аккаунт</Button>
              </div>
            </div>
          ) : null}
          {relationship?.incomingRequest && relationship.userToViewer?.id ? (
            <Button onClick={() => declineFollow({ friendshipId: relationship.userToViewer!.id }).unwrap().then(refetchUser).finally(() => setActionsOpen(false)).catch(() => null)} loading={declining}>Отклонить запрос</Button>
          ) : null}
        </div>
      </Modal>
      <Modal open={connectionsOpen !== null} onClose={() => setConnectionsOpen(null)} title={connectionsOpen === 'followers' ? 'Подписчики' : 'Подписки'}>
        {connectionsOpen ? <ConnectionList tab={connectionsOpen} username={user.username} open={Boolean(connectionsOpen)} /> : null}
      </Modal>

      <div className={styles.header}>
        <div className={styles.user}>
          <StoryRingAvatar userId={user.id} url={user.avatarUrl} name={user.username} size={74} />
          <div className={styles.identity}>
            <div className={styles.name} style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>{user.username}<AdminBadge role={user.role} />{isUserSuspended ? <span className={styles.suspendedChip}>{user.suspendedPermanent ? 'Заблокирован бессрочно' : `Заблокирован до ${new Date(user.suspendedUntil as string).toLocaleDateString('ru-RU')}`}</span> : null}</div>
            <div className={styles.handle}>@{user.username}</div>
            <div className={styles.statusRow}>
              <span className={[styles.dot, p?.isOnline ? styles.dotOnline : styles.dotOffline].join(' ')} />
              <span>{p?.isOnline ? 'онлайн' : formatLastSeen(p?.lastSeenAt ?? user.lastSeenAt)}</span>
            </div>
            <div className={styles.bio}>{canViewProfile ? (user.bio ?? 'Пока без описания.') : restrictionMessage}</div>
            <div className={styles.counts}>
              <button type="button" className={styles.countItem} onClick={() => setConnectionsOpen('followers')} disabled={!canViewProfile && !isSelf}>
                <div className={styles.countValue}>{user.followersCount ?? 0}</div>
                <div className={styles.countLabel}>Подписчики</div>
              </button>
              <button type="button" className={styles.countItem} onClick={() => setConnectionsOpen('following')} disabled={!canViewProfile && !isSelf}>
                <div className={styles.countValue}>{user.followingCount ?? 0}</div>
                <div className={styles.countLabel}>Подписки</div>
              </button>
              <div className={styles.countItem}>
                <div className={styles.countValue}>{user.postsCount ?? 0}</div>
                <div className={styles.countLabel}>Посты</div>
              </div>
            </div>
          </div>
        </div>
        <div className={styles.actions}>
          {isSelf ? (
            <Button variant="primary" onClick={() => setEdit((prev) => !prev)}>
              <Icon name="pencil" size={16} />
              {edit ? 'Закрыть' : 'Редактировать'}
            </Button>
          ) : (
            <>
              <Button
                variant={primaryAction.tone === 'primary' ? 'primary' : 'default'}
                onClick={handlePrimaryFollowAction}
                loading={primaryAction.loading}
                disabled={primaryAction.disabled}
              >
                {primaryAction.label}
              </Button>
              <Button onClick={startMessage} loading={creatingChat} disabled={!canMessage || isBlocked}>Сообщение</Button>
              <Button iconOnly type="button" aria-label="Ещё" onClick={() => setActionsOpen(true)}>
                <Icon name="dots" size={16} />
              </Button>
            </>
          )}
        </div>
      </div>

      {canViewProfile || isSelf ? <ProfileStoriesPanel userId={user.id} isSelf={Boolean(isSelf)} /> : null}

      {edit ? (
        <Card className={styles.editCard}>
          <CardHeader title="Редактирование профиля" />
          <div className={styles.editBody}>
            <textarea className={styles.textarea} value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
            <div className={styles.editActions}>
              <Button variant="primary" onClick={onSubmitBio} loading={savingBio}>Сохранить</Button>
              <Button onClick={() => setEdit(false)}>Отмена</Button>
            </div>
          </div>
        </Card>
      ) : null}

      {!canViewProfile ? (
        <Card>
          <CardHeader title={relationship?.blockedMe ? 'Вы в чёрном списке' : relationship?.blockedByMe ? 'Пользователь в вашем чёрном списке' : 'Профиль ограничен'} />
          <CardMuted>{restrictionMessage}</CardMuted>
        </Card>
      ) : (
        <>
          <div className={styles.sectionTitle} style={{ marginTop: 18 }}>Публикации</div>
          {isSelf ? <PostComposer context="profile" /> : null}
          {userPosts.length ? userPosts.map((post) => <PostCard key={post.id} post={post} onOpen={() => setOpenPostId(post.id)} />) : (
            <Card>{feedFetching ? <div style={{ display: 'grid', gap: 12 }}><SkeletonText lines={3} /><Skeleton style={{ width: '100%', aspectRatio: '16 / 10' }} /></div> : <CardMuted>Пока нет публикаций.</CardMuted>}</Card>
          )}
          <div ref={sentinelRef} style={{ height: 1 }} />
        </>
      )}
    </div>
  );
}
