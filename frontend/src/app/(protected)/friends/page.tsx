'use client';

import { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import styles from './Friends.module.css';
import { Card } from '@/shared/ui/Card/Card';
import { StoryRingAvatar } from '@/features/stories';
import { Button } from '@/shared/ui/Button/Button';
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useDeclineFriendRequestMutation,
  useGetBlacklistQuery,
  useGetFollowersQuery,
  useGetFollowingQuery,
  useGetFriendRequestsQuery,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from '@/shared/api/friendsApi';
import { useAppSelector } from '@/shared/lib/storeHooks';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';

type Tab = 'following' | 'followers' | 'requests' | 'blacklist';

function RowSkeleton() {
  return (
    <div className={styles.row}>
      <div className={styles.user}>
        <Skeleton circle style={{ width: 44, height: 44 }} />
        <div className={styles.meta}><SkeletonText lines={2} /></div>
      </div>
      <div className={styles.actions}><Skeleton style={{ width: 120, height: 42 }} /></div>
    </div>
  );
}

export default function FriendsPage() {
  const searchParams = useSearchParams();
  const [tab, setTab] = useState<Tab>('following');
  const { data: followingData, isLoading: followingLoading } = useGetFollowingQuery(undefined, { skip: tab !== 'following' && tab !== 'followers' });
  const { data: followersData, isLoading: followersLoading } = useGetFollowersQuery(undefined, { skip: tab !== 'followers' });
  const { data: requestsData, isLoading: requestsLoading } = useGetFriendRequestsQuery(undefined, { skip: tab !== 'requests' });
  const { data: blacklistData, isLoading: blacklistLoading } = useGetBlacklistQuery(undefined, { skip: tab !== 'blacklist' });
  const [followAction, { isLoading: followLoading }] = useSendFriendRequestMutation();
  const [accept, { isLoading: acceptLoading }] = useAcceptFriendRequestMutation();
  const [decline, { isLoading: declineLoading }] = useDeclineFriendRequestMutation();
  const [removeFollow, { isLoading: removeLoading }] = useRemoveFriendMutation();
  const [blockUser, { isLoading: blockLoading }] = useBlockUserMutation();
  const [unblockUser, { isLoading: unblockLoading }] = useUnblockUserMutation();
  const presence = useAppSelector((s) => s.presence.byUserId);

  const following = followingData?.following ?? [];
  const followers = followersData?.followers ?? [];
  const incoming = requestsData?.incoming ?? [];
  const outgoing = requestsData?.outgoing ?? [];
  const blacklist = blacklistData?.blacklist ?? [];
  const followingIds = useMemo(() => new Set(following.map((item) => item.receiver?.id).filter(Boolean)), [following]);

  useEffect(() => {
    const queryTab = searchParams.get('tab');
    if (queryTab === 'following' || queryTab === 'followers' || queryTab === 'requests' || queryTab === 'blacklist') {
      setTab(queryTab);
    }
  }, [searchParams]);

  const tabs: Array<{ value: Tab; label: string; count?: number }> = [
    { value: 'following', label: 'Подписки', count: following.length || undefined },
    { value: 'followers', label: 'Подписчики', count: followers.length || undefined },
    { value: 'requests', label: 'Запросы', count: (incoming.length + outgoing.length) || undefined },
    { value: 'blacklist', label: 'Чёрный список', count: blacklist.length || undefined },
  ];

  const renderUserRow = (user: any, action: React.ReactNode, side?: React.ReactNode) => (
    <div key={user.id} className={styles.row}>
      <div className={styles.user}>
        <StoryRingAvatar userId={user.id} url={user.avatarUrl} name={user.username} size={44} status={presence[user.id]?.isOnline ? 'online' : 'offline'} />
        <div className={styles.meta}>
          <div className={styles.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{user.username}<AdminBadge role={user.role} /></div>
          <div className={styles.handle}>@{user.username}</div>
          <div className={styles.hint}>{user.bio || 'Короткого описания пока нет.'}</div>
        </div>
      </div>
      <div className={styles.actions}>
        {side}
        {action}
      </div>
    </div>
  );

  const statefulFollowButton = ({ userId, followsYou }: { userId: string; followsYou?: boolean }) => {
    const isFollowing = followingIds.has(userId);
    const label = isFollowing ? 'Отписаться' : followsYou ? 'Подписаться в ответ' : 'Подписаться';
    const onClick = () => (isFollowing ? removeFollow({ userId }).unwrap().catch(() => null) : followAction({ userId }).unwrap().catch(() => null));
    return (
      <Button variant={isFollowing ? 'default' : 'primary'} onClick={onClick} loading={followLoading || removeLoading}>
        {label}
      </Button>
    );
  };

  return (
    <div className={`container appPage ${styles.page}`}>
      <Card className={styles.heroPanel}>
        <div className={styles.hero}>
          <div>
            <div className={styles.title}>Подписки</div>
            <div className={styles.subtitle}>Компактный список подписок, подписчиков, запросов и чёрного списка без лишнего визуального шума.</div>
          </div>
          <div className={styles.summaryChips}>
            <span className={styles.chip}>{following.length} подписок</span>
            <span className={styles.chip}>{followers.length} подписчиков</span>
            {!!incoming.length ? <span className={styles.chipAccent}>{incoming.length} ждут подтверждения</span> : null}
          </div>
        </div>
      </Card>

      <div className={styles.tabs}>
        {tabs.map((item) => (
          <button key={item.value} type="button" className={[styles.tab, tab === item.value ? styles.tabActive : ''].filter(Boolean).join(' ')} onClick={() => setTab(item.value)}>
            <span>{item.label}</span>
            {item.count ? <em>{item.count}</em> : null}
          </button>
        ))}
      </div>

      {tab === 'following' ? (
        <div className={styles.list}>
          {followingLoading ? <><RowSkeleton /><RowSkeleton /></> : null}
          {!followingLoading && !following.length ? <Card className={styles.emptyStateCard}><div className={styles.muted}>Ты пока ни на кого не подписан.</div></Card> : null}
          {following.map((record) => {
            const user = record.receiver;
            if (!user) return null;
            return renderUserRow(
              user,
              <Button onClick={() => removeFollow({ userId: user.id }).unwrap().catch(() => null)} loading={removeLoading}>Отписаться</Button>,
              <button type="button" className={styles.iconAction} onClick={() => blockUser({ userId: user.id }).unwrap().catch(() => null)} aria-label="В чёрный список" title="В чёрный список">
                <Icon name="dots" size={16} />
              </button>,
            );
          })}
        </div>
      ) : null}

      {tab === 'followers' ? (
        <div className={styles.list}>
          {followersLoading ? <><RowSkeleton /><RowSkeleton /></> : null}
          {!followersLoading && !followers.length ? <Card className={styles.emptyStateCard}><div className={styles.muted}>Пока никто не подписан на тебя.</div></Card> : null}
          {followers.map((record) => {
            const user = record.sender;
            if (!user) return null;
            return renderUserRow(
              user,
              statefulFollowButton({ userId: user.id, followsYou: true }),
              <button type="button" className={styles.iconAction} onClick={() => blockUser({ userId: user.id }).unwrap().catch(() => null)} aria-label="В чёрный список" title="В чёрный список">
                <Icon name="dots" size={16} />
              </button>,
            );
          })}
        </div>
      ) : null}

      {tab === 'requests' ? (
        <div className={styles.list}>
          {requestsLoading ? <><RowSkeleton /><RowSkeleton /></> : null}
          {!requestsLoading && !incoming.length && !outgoing.length ? <Card className={styles.emptyStateCard}><div className={styles.muted}>Запросов на подписку сейчас нет.</div></Card> : null}
          {incoming.length ? <div className={styles.sectionLabel}>Входящие</div> : null}
          {incoming.map((record) => {
            const user = record.sender;
            if (!user) return null;
            return renderUserRow(
              user,
              <div className={styles.inlineActions}>
                <Button variant="primary" onClick={() => accept({ friendshipId: record.id }).unwrap().catch(() => null)} loading={acceptLoading}>Принять</Button>
                <Button onClick={() => decline({ friendshipId: record.id }).unwrap().catch(() => null)} loading={declineLoading}>Скрыть</Button>
              </div>,
            );
          })}
          {outgoing.length ? <div className={styles.sectionLabel}>Исходящие</div> : null}
          {outgoing.map((record) => {
            const user = record.receiver;
            if (!user) return null;
            return renderUserRow(
              user,
              <Button onClick={() => removeFollow({ userId: user.id }).unwrap().catch(() => null)} loading={removeLoading}>Отменить запрос</Button>,
            );
          })}
        </div>
      ) : null}

      {tab === 'blacklist' ? (
        <div className={styles.list}>
          {blacklistLoading ? <><RowSkeleton /><RowSkeleton /></> : null}
          {!blacklistLoading && !blacklist.length ? <Card className={styles.emptyStateCard}><div className={styles.muted}>Чёрный список пуст.</div></Card> : null}
          {blacklist.map((record) => {
            const user = record.blocked;
            if (!user) return null;
            return renderUserRow(
              user,
              <Button onClick={() => unblockUser({ userId: user.id }).unwrap().catch(() => null)} loading={unblockLoading}>Убрать из ЧС</Button>,
            );
          })}
        </div>
      ) : null}
    </div>
  );
}
