'use client';

import Link from 'next/link';
import styles from './FriendsModal.module.css';
import { Modal } from '@/shared/ui/Modal/Modal';
import { useGetFriendsQuery } from '@/shared/api/friendsApi';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { ROUTES } from '@/shared/config/app';
import { useGetMeQuery } from '@/shared/api/usersApi';

export function FriendsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const { data, isLoading } = useGetFriendsQuery();
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const friends = data?.friends ?? [];

  return (
    <Modal open={open} onClose={onClose} title={`Friends (${friends.length})`}>
      {isLoading ? <div className={styles.muted}>Loading…</div> : null}
      {!isLoading && friends.length === 0 ? <div className={styles.muted}>No friends yet.</div> : null}
      <div className={styles.list}>
        {friends.map((f: any) => {
          const u = me && f.senderId === me.id ? f.receiver : f.sender;
          // fallback if API shape is {user}
          const user = u || f.user || f.friend || f.otherUser;
          if (!user) return null;
          return (
            <Link key={f.id} href={ROUTES.app.profile(user.username)} className={styles.item} onClick={onClose}>
              <Avatar url={user.avatarUrl} name={user.username} size={38} />
              <div className={styles.text}>
                <div className={styles.name}>{user.username}</div>
                <div className={styles.handle}>@{user.username}</div>
              </div>
            </Link>
          );
        })}
      </div>
    </Modal>
  );
}
