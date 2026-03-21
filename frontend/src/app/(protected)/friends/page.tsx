'use client';

import { useMemo, useState } from 'react';
import styles from './Friends.module.css';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Button } from '@/shared/ui/Button/Button';
import { useGetMeQuery } from '@/shared/api/usersApi';
import {
  useAcceptFriendRequestMutation,
  useDeclineFriendRequestMutation,
  useGetFriendRequestsQuery,
  useGetFriendsQuery,
  useRemoveFriendMutation,
} from '@/shared/api/friendsApi';
import { useAppSelector } from '@/shared/lib/storeHooks';

export default function FriendsPage() {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;

  const [tab, setTab] = useState<'friends' | 'requests'>('friends');
  const { data: friendsData, isLoading: friendsLoading } = useGetFriendsQuery(undefined, { skip: tab !== 'friends' });
  const { data: reqData, isLoading: reqLoading } = useGetFriendRequestsQuery(undefined, { skip: tab !== 'requests' });

  const [accept, { isLoading: acceptLoading }] = useAcceptFriendRequestMutation();
  const [decline, { isLoading: declineLoading }] = useDeclineFriendRequestMutation();
  const [remove, { isLoading: removeLoading }] = useRemoveFriendMutation();

  const friends = friendsData?.friends ?? [];
  const incoming = reqData?.incoming ?? [];
  const outgoing = reqData?.outgoing ?? [];
  const presence = useAppSelector((s) => s.presence.byUserId);

  const friendsUsers = useMemo(() => {
    return friends.map((f) => {
      const other = f.senderId === me?.id ? f.receiver : f.sender;
      return { friendship: f, other };
    }).filter((x) => !!x.other);
  }, [friends, me?.id]);

  return (
    <div className="container">
      <Card>
        <CardHeader title="Friends" />
        <CardMuted>Friend list & requests</CardMuted>
        <div className={styles.tabs}>
          <button className={[styles.tab, tab === 'friends' ? styles.tabActive : ''].filter(Boolean).join(' ')} onClick={() => setTab('friends')}>
            Friends
          </button>
          <button className={[styles.tab, tab === 'requests' ? styles.tabActive : ''].filter(Boolean).join(' ')} onClick={() => setTab('requests')}>
            Requests
          </button>
        </div>

        {tab === 'friends' ? (
          <div className={styles.list}>
            {friendsLoading ? <CardMuted>Loading…</CardMuted> : null}
            {!friendsLoading && friendsUsers.length === 0 ? <CardMuted>No friends yet.</CardMuted> : null}

            {friendsUsers.map(({ friendship, other }) => (
              <div key={friendship.id} className={styles.row}>
                <div className={styles.user}>
                  <Avatar
                    url={other!.avatarUrl}
                    name={other!.username}
                    size={38}
                    status={presence[other!.id]?.isOnline ? 'online' : 'offline'}
                  />
                  <div className={styles.meta}>
                    <div className={styles.name}>{other!.username}</div>
                    <div className={styles.handle}>@{other!.username}</div>
                  </div>
                </div>
                <div className={styles.actions}>
                  <Button
                    onClick={() => remove({ userId: other!.id }).unwrap().catch(() => null)}
                    disabled={removeLoading}
                  >
                    Remove
                  </Button>
                </div>
              </div>
            ))}
          </div>
        ) : (
          <div className={styles.list}>
            {reqLoading ? <CardMuted>Loading…</CardMuted> : null}

            {!reqLoading && incoming.length === 0 && outgoing.length === 0 ? <CardMuted>No requests.</CardMuted> : null}

            {incoming.length ? <div className={styles.badge}>Incoming</div> : null}
            {incoming.map((r) => {
              const u = r.sender;
              if (!u) return null;
              return (
                <div key={r.id} className={styles.row}>
                  <div className={styles.user}>
                    <Avatar url={u.avatarUrl} name={u.username} size={38} status={presence[u.id]?.isOnline ? 'online' : 'offline'} />
                    <div className={styles.meta}>
                      <div className={styles.name}>{u.username}</div>
                      <div className={styles.handle}>@{u.username}</div>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <Button
                      variant="primary"
                      onClick={() => accept({ friendshipId: r.id }).unwrap().catch(() => null)}
                      disabled={acceptLoading}
                    >
                      Accept
                    </Button>
                    <Button onClick={() => decline({ friendshipId: r.id }).unwrap().catch(() => null)} disabled={declineLoading}>
                      Decline
                    </Button>
                  </div>
                </div>
              );
            })}

            {outgoing.length ? <div className={styles.badge} style={{ marginTop: 10 }}>Outgoing</div> : null}
            {outgoing.map((r) => {
              const u = r.receiver;
              if (!u) return null;
              return (
                <div key={r.id} className={styles.row}>
                  <div className={styles.user}>
                    <Avatar url={u.avatarUrl} name={u.username} size={38} status={presence[u.id]?.isOnline ? 'online' : 'offline'} />
                    <div className={styles.meta}>
                      <div className={styles.name}>{u.username}</div>
                      <div className={styles.handle}>@{u.username}</div>
                    </div>
                  </div>
                  <div className={styles.actions}>
                    <div className={styles.badge}>Request sent</div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </Card>
    </div>
  );
}
