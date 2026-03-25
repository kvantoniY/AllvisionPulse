'use client';

import Link from 'next/link';
import styles from './PostCard.module.css';
import type { Post } from '@/shared/types/social';
import { Card } from '@/shared/ui/Card/Card';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { ROUTES } from '@/shared/config/app';
import { formatRelative } from '@/shared/lib/time';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useDeletePostMutation, useLikePostMutation, useUnlikePostMutation } from '@/shared/api/postsApi';
import { ImageGallery } from '@/shared/ui/ImageGallery/ImageGallery';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';
import { Icon } from '@/shared/ui/Icon/Icon';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { useState } from 'react';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog';
import { RepostModal } from '@/features/postRepost/ui/RepostModal';
import { PostLikesModal } from '@/features/postLikes/ui/PostLikesModal';

function getOriginalPost(post: Post): Post {
  let current = post;
  while (current.repostOf) current = current.repostOf;
  return current;
}

function PostQuote({ post, onOpenOriginal }: { post: Post; onOpenOriginal?: () => void }) {
  const lightbox = useLightbox();
  const images = post.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;
  const original = getOriginalPost(post);

  return (
    <div className={styles.quoteCard}>
      <div className={styles.quoteHeader}>
        <Avatar url={post.author.avatarUrl} name={post.author.username} size={34} />
        <div className={styles.quoteMeta}>
          <div className={styles.quoteNameRow}>
            <span className={styles.quoteName}>{post.author.username}</span>
            <AdminBadge role={post.author.role} />
          </div>
          <div className={styles.quoteTime}>{formatRelative(post.createdAt)}</div>
        </div>
      </div>

      {post.text ? <div className={styles.quoteText}>{post.text}</div> : null}

      {singleImage ? (
        <div className={styles.quoteMediaSingle}>
          <img
            src={singleImage.url}
            alt=""
            className={styles.quoteSingleImage}
            loading="lazy"
            onClick={() => lightbox?.openLightbox([{ id: singleImage.id, url: singleImage.url }], 0)}
          />
        </div>
      ) : null}

      {images.length > 1 ? (
        <div className={styles.quoteGalleryWrap}>
          <ImageGallery images={images} aspect="4 / 5" maxHeight={580} />
        </div>
      ) : null}

      {post.repostOf ? (
        <div className={styles.quoteNested}>
          <PostQuote post={post.repostOf} onOpenOriginal={onOpenOriginal} />
        </div>
      ) : null}

      {onOpenOriginal ? (
        <button type="button" className={styles.quoteOpenBtn} onClick={onOpenOriginal}>
          <span>{original.id === post.id ? 'Открыть пост' : 'Открыть оригинал'}</span>
          <Icon name="arrowLeft" size={14} className={styles.quoteOpenIcon} />
        </button>
      ) : null}
    </div>
  );
}

export function PostCard({
  post,
  onOpen,
  onOpenPost,
  compact = false,
}: {
  post: Post;
  onOpen?: () => void;
  onOpenPost?: (postId: string) => void;
  compact?: boolean;
}) {
  const { data } = useGetMeQuery();
  const me = data?.user;
  const liked = !!me && (post.likes ?? []).some((l) => l.userId === me.id);
  const [like, { isLoading: liking }] = useLikePostMutation();
  const [unlike, { isLoading: unliking }] = useUnlikePostMutation();
  const [del, { isLoading: deleting }] = useDeletePostMutation();
  const lightbox = useLightbox();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);

  const canDeletePost = !!me && (post.authorId === me.id || me.role === 'ADMIN');
  const sourcePost = post.repostOf ?? null;
  const mediaPost = post.repostOf ? getOriginalPost(post.repostOf) : post;
  const images = mediaPost.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;

  const openCurrent = () => {
    if (onOpenPost) onOpenPost(post.id);
    else onOpen?.();
  };

  const onToggleLike = async () => {
    if (!post.id) return;
    if (liked) await unlike({ postId: post.id, userId: me?.id }).unwrap().catch(() => null);
    else await like({ postId: post.id, userId: me?.id }).unwrap().catch(() => null);
  };

  const onDelete = async () => {
    if (!post.id) return;
    await del({ postId: post.id }).unwrap().catch(() => null);
    setConfirmOpen(false);
  };

  const onOpenOriginal = sourcePost && onOpenPost ? () => onOpenPost(getOriginalPost(sourcePost).id) : undefined;

  return (
    <>
      <Card className={[styles.card, compact ? styles.cardCompact : ''].filter(Boolean).join(' ')}>
        <div className={styles.header}>
          <div className={styles.author}>
            <Avatar url={post.author.avatarUrl} name={post.author.username} size={44} />
            <Link href={ROUTES.app.profile(post.author.username)} className={styles.authorLink}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{post.author.username}</span>
                <AdminBadge role={post.author.role} />
              </div>
              <div className={styles.handle}>@{post.author.username}</div>
            </Link>
          </div>

          <div className={styles.right}>
            <div className={styles.time}>{formatRelative(post.createdAt)}</div>
            {canDeletePost ? (
              <button className={styles.menuBtn} type="button" onClick={() => setConfirmOpen(true)} disabled={deleting} aria-label="Удалить публикацию" title="Удалить публикацию">
                <Icon name="trash" size={14} />
              </button>
            ) : null}
          </div>
        </div>

        {post.text ? (
          <div className={styles.text} onClick={openCurrent} style={{ cursor: onOpen || onOpenPost ? 'pointer' : 'default' }}>
            {post.text}
          </div>
        ) : null}

        {(post.widgetsJson as any)?.type === 'health' ? (
          <button type="button" className={styles.widget} onClick={openCurrent}>
            <div>
              <div className={styles.widgetTitle}>Сводка дня</div>
              <div className={styles.widgetHint}>Оценка дня и недельный пульс</div>
            </div>
            <div className={styles.widgetNums}>
              <span>{(post.widgetsJson as any).todayScore ?? '—'}%</span>
              <span>{(post.widgetsJson as any).pulse7Score ?? '—'}%</span>
            </div>
          </button>
        ) : null}

        {sourcePost ? (
          <div className={styles.repostWrap}>
            <PostQuote post={sourcePost} onOpenOriginal={onOpenOriginal} />
          </div>
        ) : null}

        {!sourcePost && singleImage ? (
          <div className={styles.mediaSingle}>
            <img
              src={singleImage.url}
              alt=""
              className={styles.singleImage}
              loading="lazy"
              onClick={() => lightbox?.openLightbox([{ id: singleImage.id, url: singleImage.url }], 0)}
            />
          </div>
        ) : null}

        {!sourcePost && images.length > 1 ? (
          <div className={styles.galleryWrap}>
            <ImageGallery images={images} aspect="4 / 5" maxHeight={760} />
          </div>
        ) : null}

        <div className={styles.footer}>
          <div className={styles.actions}>
            <div className={styles.metricGroup}>
              <button className={[styles.iconBtn, liked ? styles.iconBtnActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike} disabled={liking || unliking || !me} aria-label="Нравится">
                <Icon name="heart" size={16} />
              </button>
              <button className={styles.countBtn} type="button" onClick={() => setLikesOpen(true)} aria-label="Кто поставил лайк">
                {post._count?.likes ?? 0}
              </button>
            </div>
            <button className={styles.iconBtn} onClick={openCurrent} aria-label="Комментарии">
              <Icon name="comment" size={16} />
              <span>{post._count?.comments ?? 0}</span>
            </button>
            <button className={styles.iconBtn} onClick={() => setShareOpen(true)} aria-label="Сделать репост">
              <Icon name="forward" size={16} />
              <span>{post._count?.reposts ?? 0}</span>
            </button>
          </div>
        </div>
      </Card>

      <ConfirmDialog
        open={confirmOpen}
        onClose={() => setConfirmOpen(false)}
        onConfirm={onDelete}
        title="Удалить публикацию?"
        description="Пост исчезнет из ленты и профиля. Это действие нельзя быстро отменить."
        confirmLabel="Удалить"
        loading={deleting}
        icon="trash"
      />

      <RepostModal open={shareOpen} onClose={() => setShareOpen(false)} post={post} />
      <PostLikesModal open={likesOpen} onClose={() => setLikesOpen(false)} postId={post.id} />
    </>
  );
}
