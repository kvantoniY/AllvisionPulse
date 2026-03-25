'use client';

import Link from 'next/link';
import styles from './PostCard.module.css';
import type { Post } from '@/shared/types/social';
import { Card } from '@/shared/ui/Card/Card';
import { StoryRingAvatar } from '@/features/stories';
import { ROUTES } from '@/shared/config/app';
import { formatRelative } from '@/shared/lib/time';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useDeletePostMutation, useGetLastCommentQuery, useLikePostMutation, useUnlikePostMutation } from '@/shared/api/postsApi';
import { ImageGallery } from '@/shared/ui/ImageGallery/ImageGallery';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';

export function PostCard({ post, onOpen, compact = false }: { post: Post; onOpen?: () => void; compact?: boolean }) {
  const { data } = useGetMeQuery();
  const me = data?.user;
  const liked = !!me && (post.likes ?? []).some((l) => l.userId === me.id);
  const [like, { isLoading: liking }] = useLikePostMutation();
  const [unlike, { isLoading: unliking }] = useUnlikePostMutation();
  const [del, { isLoading: deleting }] = useDeletePostMutation();

  const canDeletePost = !!me && (post.authorId === me.id || me.role === 'ADMIN');
  const showPreview = (post._count?.comments ?? 0) > 0;
  const { data: lastCommentData } = useGetLastCommentQuery({ postId: post.id }, { skip: !showPreview });
  const last = lastCommentData?.items?.[0];

  const onToggleLike = async () => {
    if (!post.id) return;
    if (liked) await unlike({ postId: post.id, userId: me?.id }).unwrap().catch(() => null);
    else await like({ postId: post.id, userId: me?.id }).unwrap().catch(() => null);
  };

  const onDelete = async () => {
    if (!post.id) return;
    await del({ postId: post.id }).unwrap().catch(() => null);
  };

  const images = post.images ?? [];

  return (
    <Card className={styles.card}>
      <div className={styles.header}>
        <div className={styles.author}>
          <StoryRingAvatar userId={post.author.id} url={post.author.avatarUrl} name={post.author.username} size={42} />
          <Link href={ROUTES.app.profile(post.author.username)} style={{ minWidth: 0 }}>
            <div className={styles.name} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>{post.author.username}<AdminBadge role={post.author.role} /></div>
            <div className={styles.handle}>@{post.author.username}</div>
          </Link>
        </div>
        <div className={styles.right}>
          <div className={styles.time}>{formatRelative(post.createdAt)}</div>
          {canDeletePost ? (
            <button className={styles.menuBtn} type="button" onClick={onDelete} disabled={deleting} aria-label="Удалить публикацию">
              {deleting ? '…' : 'Удалить'}
            </button>
          ) : null}
        </div>
      </div>

      <div onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
        {post.text ? <div className={styles.text}>{post.text}</div> : null}

        {(post.widgetsJson as any)?.type === 'health' ? (
          <div className={styles.widget}>
            <div>
              <div className={styles.widgetTitle}>Виджет здоровья</div>
              <div style={{ opacity: 0.72, fontSize: 12 }}>Оценка дня и недельный пульс</div>
            </div>
            <div className={styles.widgetNums}>
              <div>{(post.widgetsJson as any).todayScore ?? '—'}%</div>
              <div>{(post.widgetsJson as any).pulse7Score ?? '—'}%</div>
            </div>
          </div>
        ) : null}
      </div>

      {images.length ? (
        <div className={styles.gallery}>
          <ImageGallery images={images} aspect="4 / 3" />
        </div>
      ) : null}

      {!compact && last ? (
        <div className={styles.commentPreview} onClick={onOpen} style={{ cursor: onOpen ? 'pointer' : 'default' }}>
          <div className={styles.commentPreviewMeta} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>Последний комментарий · {last.author.username}<AdminBadge role={last.author.role} /></div>
          <div>{last.text ?? ''}</div>
        </div>
      ) : null}

      <div className={styles.footer}>
        <div className={styles.actions}>
          <button className={[styles.iconBtn, liked ? styles.iconBtnActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike} disabled={liking || unliking || !me} aria-label="Нравится">
            <Icon name="heart" size={16} /> <span>{post._count?.likes ?? 0}</span>
          </button>
          <button className={styles.iconBtn} onClick={onOpen} aria-label="Комментарии">
            <Icon name="comment" size={16} /> <span>{post._count?.comments ?? 0}</span>
          </button>
          <button className={styles.iconBtn} disabled aria-label="Репосты">
            <Icon name="repeat" size={16} /> <span>{post._count?.reposts ?? 0}</span>
          </button>
        </div>
        <div className={styles.counts}>{post._count?.reposts ? `${post._count.reposts} репостов` : ''}</div>
      </div>
    </Card>
  );
}
