'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../Profile.module.css';
import { useGetMeQuery, useGetUserByUsernameQuery, useUpdateProfileMutation } from '@/shared/api/usersApi';
import { useGetStatsQuery } from '@/shared/api/healthApi';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Button } from '@/shared/ui/Button/Button';
import {
  useAcceptFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useGetFriendsQuery,
} from '@/shared/api/friendsApi';
import { FriendsModal } from '@/features/friendsModal/ui/FriendsModal';
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

function pickFriendship(relationship: any) {
  if (!relationship) return null;
  if (relationship.friendship) return relationship.friendship;
  return relationship;
}

export default function ProfilePage() {
  
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const { data, isLoading, refetch: refetchUser } = useGetUserByUsernameQuery(username);
  const user = data?.user;
  const isSelf = me && user && me.id === user.id;
  const presence = useAppSelector((s) => s.presence.byUserId);
  const p = user?.id ? presence[user.id] : undefined;

  // IMPORTANT: keep hooks order stable across renders.
  // Profile can render a loading state before user data arrives, so any data hooks
  // must be declared BEFORE conditional returns.
  const { data: feedData, isFetching: feedFetching } = useGetFeedQuery(undefined);
  const [fetchFeedPage] = useLazyGetFeedQuery();
  const feedItems = feedData?.items ?? [];
  const feedNextCursor = feedData?.nextCursor ?? null;

  const { data: myFriends } = useGetFriendsQuery(undefined, { skip: !isSelf });
  const friendsCount: number =
    (user as any)?.friendsCount ?? (data as any)?.friendsCount ?? (isSelf ? myFriends?.friends?.length ?? 0 : 0);

  const [friendsOpen, setFriendsOpen] = useState(false);
  const [chatStartOpen, setChatStartOpen] = useState(false);
  const [chatStartId, setChatStartId] = useState<string | null>(null);
  const [createDirectChat, { isLoading: creatingChat }] = useCreateDirectChatMutation();

  const startMessage = async () => {
    if (!user?.id) return;
    const res = await createDirectChat({ userId: user.id }).unwrap().catch(() => null);
    const cid = res?.chat?.id;
    if (!cid) return;
    setChatStartId(cid);
    setChatStartOpen(true);
  };

  const friendship = pickFriendship(data?.relationship);

  const { data: stats } = useGetStatsQuery(30);

  const noAlcoholStreak = stats?.streaks?.noAlcohol ?? 0;
  const sleepAvg = useMemo(() => {
    const rows = stats?.rows ?? [];
    const sleep = rows.map((r: any) => r.sleepHours).filter((n: any) => typeof n === 'number');
    if (!sleep.length) return null;
    const avg = sleep.reduce((a: number, b: number) => a + b, 0) / sleep.length;
    return avg;
  }, [stats]);

  const moodToday = stats?.rows?.length ? stats.rows[stats.rows.length - 1].todayScore : null;

  const [edit, setEdit] = useState(false);
  const [bio, setBio] = useState('');
  const [saveBio, { isLoading: savingBio }] = useUpdateProfileMutation();

  const [sendReq, { isLoading: sendingReq }] = useSendFriendRequestMutation();
  const [acceptReq, { isLoading: accepting }] = useAcceptFriendRequestMutation();
  const [declineReq, { isLoading: declining }] = useDeclineFriendRequestMutation();
  const [removeFriend, { isLoading: removing }] = useRemoveFriendMutation();
 const userPosts = useMemo(() => feedItems.filter((p) => p.author.username === username), [feedItems, username]);

  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const nearEnd = useIntersection(sentinelRef, { rootMargin: '900px' });

  const [openPostId, setOpenPostId] = useState<string | null>(null);

  useEffect(() => {
    // If this profile has few posts loaded and we still have more global feed pages, keep fetching.
    // This is a pragmatic MVP until we add a dedicated backend endpoint.
    if (userPosts.length >= 10) return;
    if (!feedNextCursor) return;
    if (!nearEnd) return;
    if (feedFetching) return;
    fetchFeedPage({ cursor: feedNextCursor, take: 20 });
  }, [userPosts.length, feedNextCursor, nearEnd, feedFetching, fetchFeedPage]);
  const onStartEdit = () => {
    setBio(user?.bio ?? '');
    setEdit(true);
  };

  const onSubmitBio = async () => {
    await saveBio({ bio: bio || null }).unwrap();
    setEdit(false);
  };

  if (isLoading || !user) {
    return (
      <div className="container">
        <Card>
          <CardHeader title="Профиль" />
          <div style={{ display: 'grid', gap: 16 }}><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Skeleton circle style={{ width: 74, height: 74 }} /><div style={{ flex: 1 }}><SkeletonText lines={3} /></div></div><SkeletonText lines={3} /></div>
        </Card>
      </div>
    );
  }

  const showWidgets = user.privacy?.showHealthWidgets ?? true;

  const renderFriendActions = () => {
    if (isSelf) {
      return (
        <Button variant="primary" onClick={onStartEdit}>
          <Icon name="pencil" size={16} />
          Редактировать
        </Button>
      );
    }

    const status = friendship?.status as string | undefined;
    const isIncoming = !!me && friendship && friendship.receiverId === me.id;
    const isOutgoing = !!me && friendship && friendship.senderId === me.id;

    if (status === 'ACCEPTED') {
      return (
        <>
          <Button variant="primary" disabled>
            <Icon name="check" size={16} />
            В друзьях
          </Button>
          <Button
            onClick={async () => {
              await removeFriend({ userId: user.id }).unwrap().catch(() => null);
              refetchUser();
            }}
            loading={removing}
          >
            Удалить
          </Button>
          <Button onClick={startMessage} loading={creatingChat}>
            Сообщение
          </Button>
        </>
      );
    }

    if (status === 'PENDING') {
      if (isIncoming) {
        return (
          <>
            <Button
              variant="primary"
              onClick={async () => {
                await acceptReq({ friendshipId: friendship.id }).unwrap().catch(() => null);
                refetchUser();
              }}
              loading={accepting}
            >
              Принять
            </Button>
            <Button
              onClick={async () => {
                await declineReq({ friendshipId: friendship.id }).unwrap().catch(() => null);
                refetchUser();
              }}
              loading={declining}
            >
              Отклонить
            </Button>
          </>
        );
      }
      if (isOutgoing) {
        return (
          <>
            <Button variant="primary" disabled>
              Заявка отправлена
            </Button>
            <Button disabled>Сообщение</Button>
          </>
        );
      }
    }

    if (status === 'BLOCKED') {
      return (
        <>
          <Button variant="primary" disabled>
            Заблокирован
          </Button>
        </>
      );
    }

    return (
      <>
        <Button
          variant="primary"
          onClick={async () => {
            await sendReq({ userId: user.id }).unwrap().catch(() => null);
            refetchUser();
          }}
          disabled={!me} loading={sendingReq}
        >
          Добавить в друзья
        </Button>
        <Button disabled>Сообщение</Button>
      </>
    );
  };
 

  return (
    <div className="container">
      <PostModal postId={openPostId} open={!!openPostId} onClose={() => setOpenPostId(null)} />
      {isSelf ? <FriendsModal open={friendsOpen} onClose={() => setFriendsOpen(false)} /> : null}
      <StartChatModal
        open={chatStartOpen}
        chatId={chatStartId}
        title="Новое сообщение"
        onClose={() => setChatStartOpen(false)}
        onSent={(cid) => router.push(`/messages/${cid}`)}
      />
      <div className={styles.header}>
        <div className={styles.user}>
          <Avatar url={user.avatarUrl} name={user.username} size={74} />
          <div>
            <div className={styles.name}>{user.username}</div>
            <div className={styles.handle}>@{user.username}</div>
            <div className={styles.statusRow}>
              <span className={[styles.dot, p?.isOnline ? styles.dotOnline : styles.dotOffline].join(' ')} aria-label={p?.isOnline ? 'online' : 'offline'} />
              <span>{p?.isOnline ? 'онлайн' : formatLastSeen(p?.lastSeenAt ?? user.lastSeenAt)}</span>
            </div>
            <div className={styles.bio}>{user.bio ?? '—'}</div>
            <div className={styles.counts}>
              <button className={styles.countItem} type="button" disabled={!isSelf} onClick={() => setFriendsOpen(true)}>
                <div className={styles.countValue}>{friendsCount}</div>
                <div className={styles.countLabel}>В друзьях</div>
              </button>
              <div className={styles.countItem}>
                <div className={styles.countValue}>{(user as any).postsCount ?? '—'}</div>
                <div className={styles.countLabel}>Посты</div>
              </div>
            </div>
          </div>
        </div>

        <div className={styles.actions}>{renderFriendActions()}</div>
      </div>

      {edit ? (
        <Card className={styles.editCard}>
          <CardHeader title="Редактирование профиля" />
          <div className={styles.editBody}>
            <textarea className={styles.textarea} value={bio} onChange={(e) => setBio(e.target.value)} rows={4} />
            <div className={styles.editActions}>
              <Button variant="primary" onClick={onSubmitBio} loading={savingBio}>
                Сохранить
              </Button>
              <Button onClick={() => setEdit(false)}>Отмена</Button>
            </div>
          </div>
        </Card>
      ) : null}

      <div className={styles.sectionRow}>
        <div className={styles.sectionTitle}>Виджеты</div>
        {isSelf ? <div className={styles.sectionAction}><Icon name="pencil" size={14} /> Редактировать</div> : null}
      </div>

      {showWidgets ? (
        <div className={styles.widgets}>
          <Card className={styles.widget}>
            <div className={styles.widgetValue}>{moodToday != null ? `${moodToday}%` : '—'}</div>
            <div className={styles.widgetLabel}>Настроение сегодня</div>
          </Card>
          <Card className={styles.widget}>
            <div className={styles.widgetValue}>{noAlcoholStreak}</div>
            <div className={styles.widgetLabel}>Дней без алкоголя</div>
          </Card>
          <Card className={styles.widget}>
            <div className={styles.widgetValue}>{sleepAvg != null ? `${sleepAvg.toFixed(1)}h` : '—'}</div>
            <div className={styles.widgetLabel}>Средний сон</div>
          </Card>
        </div>
      ) : (
        <Card>
          <CardMuted>Пользователь скрывает health-виджеты.</CardMuted>
        </Card>
      )}

      <div className={styles.sectionTitle} style={{ marginTop: 18 }}>
        Публикации
      </div>

      {isSelf ? <PostComposer context="profile" /> : null}

      {userPosts.length ? userPosts.map((p) => <PostCard key={p.id} post={p} onOpen={() => setOpenPostId(p.id)} />) : (
        <Card>
          {feedFetching ? <div style={{ display: 'grid', gap: 12 }}><SkeletonText lines={3} /><Skeleton style={{ width: '100%', aspectRatio: '16 / 10' }} /></div> : <CardMuted>Пока нет публикаций.</CardMuted>}
        </Card>
      )}

      <div ref={sentinelRef} style={{ height: 1 }} />
    </div>
  );
}
