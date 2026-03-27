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
import { useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog';
import { RepostModal } from '@/features/postRepost/ui/RepostModal';
import { PostLikesModal } from '@/features/postLikes/ui/PostLikesModal';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { PostCommentsMobileModal } from '@/features/postComments/ui/PostCommentsMobileModal';
import { EditPostModal } from '@/features/postEdit/ui/EditPostModal';

function getOriginalPost(post: Post): Post {
  let current = post;
  while (current.repostOf) current = current.repostOf;
  return current;
}

function QuoteCard({ post, onOpenOriginal, mobile }: { post: Post; onOpenOriginal?: () => void; mobile?: boolean }) {
  const lightbox = useLightbox();
  const images = post.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;

  return (
    <div className={[styles.quoteCard, mobile ? styles.quoteCardMobile : ''].filter(Boolean).join(' ')}>
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
          <ImageGallery images={images} aspect="4 / 5" maxHeight={580} rounded={!mobile} />
        </div>
      ) : null}

      {onOpenOriginal && !mobile ? (
        <button type="button" className={styles.quoteOpenBtn} onClick={onOpenOriginal}>
          <span>Открыть оригинал</span>
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
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  const canDeletePost = !!me && (post.authorId === me.id || me.role === 'ADMIN');
  const originalPost = useMemo(() => (post.repostOf ? getOriginalPost(post.repostOf) : null), [post.repostOf]);
  const images = post.repostOf ? [] : post.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;
  const longText = (post.text ?? '').length > (isMobile ? 280 : 360);

  const openCurrent = () => {
    if (isMobile) return;
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

  const onOpenOriginal = originalPost && onOpenPost ? () => onOpenPost(originalPost.id) : undefined;
  const textClass = [styles.text, !textExpanded && longText ? styles.textCollapsed : ''].filter(Boolean).join(' ');

  return (
    <>
      <Card className={[styles.card, compact ? styles.cardCompact : '', isMobile ? styles.cardMobile : ''].filter(Boolean).join(' ')}>
        <div className={styles.header}>
          <div className={styles.author}>
            <Avatar url={post.author.avatarUrl} name={post.author.username} size={isMobile ? 42 : 44} />
            <Link href={ROUTES.app.profile(post.author.username)} className={styles.authorLink}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{post.author.username}</span>
                <AdminBadge role={post.author.role} />
              </div>
              <div className={styles.handle}>@{post.author.username}</div>
              {post.repostOf ? <div className={styles.repostMeta}>репостнул публикацию</div> : null}
            </Link>
          </div>

          <div className={styles.right}>
            <div className={styles.time}>{formatRelative(post.createdAt)}</div>
            {canDeletePost ? (
              <div className={styles.menuWrap} ref={menuRef}>
                <button className={styles.menuBtn} type="button" onClick={() => setMenuOpen((value) => !value)} disabled={deleting} aria-label="Действия с публикацией">
                  <Icon name="dots" size={16} />
                </button>
                {menuOpen ? (
                  <div className={styles.menuPopover}>
                    <button type="button" className={styles.menuAction} onClick={() => { setMenuOpen(false); setEditOpen(true); }}>
                      <Icon name="pencil" size={14} />
                      <span>Редактировать</span>
                    </button>
                    <button type="button" className={[styles.menuAction, styles.menuActionDanger].join(' ')} onClick={() => { setMenuOpen(false); setConfirmOpen(true); }}>
                      <Icon name="trash" size={14} />
                      <span>Удалить</span>
                    </button>
                  </div>
                ) : null}
              </div>
            ) : null}
          </div>
        </div>

        {post.text ? (
          <>
            <div className={textClass} onClick={!isMobile ? openCurrent : undefined} style={{ cursor: !isMobile && (onOpen || onOpenPost) ? 'pointer' : 'default' }}>
              {post.text}
            </div>
            {longText ? (
              <button type="button" className={styles.moreTextBtn} onClick={() => setTextExpanded((value) => !value)}>
                {textExpanded ? 'Свернуть' : 'Показать ещё'}
              </button>
            ) : null}
          </>
        ) : null}

        {(post.widgetsJson as any)?.type === 'health' ? (
          <button type="button" className={styles.widget} onClick={!isMobile ? openCurrent : undefined}>
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

        {originalPost ? (
          <div className={styles.repostWrap}>
            <QuoteCard post={originalPost} onOpenOriginal={onOpenOriginal} mobile={isMobile} />
          </div>
        ) : null}

        {!originalPost && singleImage ? (
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

        {!originalPost && images.length > 1 ? (
          <div className={styles.galleryWrap}>
            <ImageGallery images={images} aspect="4 / 5" maxHeight={isMobile ? 560 : 760} rounded={!isMobile} />
          </div>
        ) : null}

        <div className={styles.footer}>
          <div className={styles.actions}>
            <button className={[styles.actionStat, liked ? styles.actionStatActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike} disabled={liking || unliking || !me} aria-label="Нравится">
              <Icon name="heart" size={18} />
              <span className={styles.actionCount} onClick={(event) => { event.stopPropagation(); setLikesOpen(true); }}>{post._count?.likes ?? 0}</span>
            </button>
            <button className={styles.actionStat} onClick={isMobile ? () => setCommentsOpen(true) : openCurrent} aria-label="Комментарии">
              <Icon name="comment" size={18} />
              <span className={styles.actionCount}>{post._count?.comments ?? 0}</span>
            </button>
            <button className={styles.actionStat} onClick={() => setShareOpen(true)} aria-label="Сделать репост">
              <Icon name="forward" size={18} />
              <span className={styles.actionCount}>{post._count?.reposts ?? 0}</span>
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
      <PostCommentsMobileModal open={commentsOpen} onClose={() => setCommentsOpen(false)} postId={post.id} />
      <EditPostModal open={editOpen} onClose={() => setEditOpen(false)} post={post} />
    </>
  );
}
