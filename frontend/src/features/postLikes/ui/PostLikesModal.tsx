'use client';

import Link from 'next/link';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Icon } from '@/shared/ui/Icon/Icon';
import { ROUTES } from '@/shared/config/app';
import { useGetPostLikesQuery } from '@/shared/api/postsApi';
import { Skeleton } from '@/shared/ui/Skeleton/Skeleton';
import styles from './PostLikesModal.module.css';

export function PostLikesModal({ open, onClose, postId }: { open: boolean; onClose: () => void; postId: string | null }) {
  const { data, isFetching } = useGetPostLikesQuery({ postId: postId ?? '' }, { skip: !open || !postId });
  const items = data?.items ?? [];

  return (
    <Modal open={open} onClose={onClose} title="Оценили публикацию" icon={<Icon name="heart" size={18} />} size="md">
      <div className={styles.list}>
        {isFetching ? (
          Array.from({ length: 6 }).map((_, index) => (
            <div key={index} className={styles.row} aria-hidden="true">
              <Skeleton circle style={{ width: 40, height: 40 }} />
              <div className={styles.meta}>
                <Skeleton style={{ width: 120, height: 14, borderRadius: 999 }} />
                <Skeleton style={{ width: 86, height: 12, borderRadius: 999 }} />
              </div>
            </div>
          ))
        ) : items.length ? (
          items.map((user) => (
            <Link href={ROUTES.app.profile(user.username)} key={user.id} className={styles.row} onClick={onClose}>
              <Avatar url={user.avatarUrl} name={user.username} size={40} />
              <div className={styles.meta}>
                <div className={styles.nameRow}>
                  <span className={styles.name}>@{user.username}</span>
                  <AdminBadge role={(user.role as any) ?? undefined} />
                </div>
                <div className={styles.caption}>Нравится публикация</div>
              </div>
              <Icon name="heart" size={16} className={styles.trailing} />
            </Link>
          ))
        ) : (
          <div className={styles.empty}>
            <Icon name="heart" size={24} />
            <div className={styles.emptyTitle}>Пока без лайков</div>
            <div className={styles.emptyText}>Когда публикацию кто-то оценит, список появится здесь.</div>
          </div>
        )}
      </div>
    </Modal>
  );
}
