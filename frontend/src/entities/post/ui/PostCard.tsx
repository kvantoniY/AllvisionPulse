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
import { memo, useEffect, useMemo, useRef, useState } from 'react';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog';
import { RepostModal } from '@/features/postRepost/ui/RepostModal';
import { PostLikesModal } from '@/features/postLikes/ui/PostLikesModal';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { PostCommentsMobileModal } from '@/features/postComments/ui/PostCommentsMobileModal';
import { EditPostModal } from '@/features/postEdit/ui/EditPostModal';
import { PulseShareCard } from '@/shared/ui/PulseShareCard/PulseShareCard';
import { MediaPlaceholder } from '@/shared/ui/MediaPlaceholder/MediaPlaceholder';
import { getLegacyHealthWidgetPayload, getPulseShareWidgetPayload } from '@/shared/lib/socialWidgets';

function getOriginalPost(post: Post): Post {
  let current = post;
  while (current.repostOf) current = current.repostOf;
  return current;
}

function QuoteCard({ post, onOpenOriginal, mobile }: { post: Post; onOpenOriginal?: () => void; mobile?: boolean }) {
  const lightbox = useLightbox();
  const images = post.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;
  const [quoteImgLoaded, setQuoteImgLoaded] = useState(false);

  useEffect(() => { setQuoteImgLoaded(false); }, [singleImage?.url]);

  return (
    <div
      className={[styles.quoteCard, mobile ? styles.quoteCardMobile : '', mobile && onOpenOriginal ? styles.quoteCardPressable : ''].filter(Boolean).join(' ')}
      onClick={mobile && onOpenOriginal ? onOpenOriginal : undefined}
      role={mobile && onOpenOriginal ? 'button' : undefined}
      tabIndex={mobile && onOpenOriginal ? 0 : undefined}
      onKeyDown={mobile && onOpenOriginal ? (event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onOpenOriginal(); } } : undefined}
    >
      <div className={styles.quoteHeader}>
        <Avatar url={post.author.avatarUrl} name={post.author.username} size={34} />
        <div className={styles.quoteMeta}>
          <div className={styles.quoteNameRow}>
            <span className={styles.quoteName}>{post.author.username}</span>
            <AdminBadge role={post.author.role} username={post.author.username} />
          </div>
          <div className={styles.quoteTime}>{formatRelative(post.createdAt)}</div>
        </div>
      </div>

      {post.text ? <div className={styles.quoteText}>{post.text}</div> : null}

      {singleImage ? (
        <div className={styles.quoteMediaSingle} style={{ position: 'relative' }}>
          <img
            src={singleImage.url}
            alt=""
            className={styles.quoteSingleImage}
            loading="lazy"
            ref={(node) => { if (node?.complete && node.naturalWidth > 0) setQuoteImgLoaded(true); }}
            onLoad={() => setQuoteImgLoaded(true)}
            onError={() => setQuoteImgLoaded(true)}
            onClick={(event) => { event.stopPropagation(); lightbox?.openLightbox([{ id: singleImage.id, url: singleImage.url }], 0); }}
          />
          <MediaPlaceholder loaded={quoteImgLoaded} small />
        </div>
      ) : null}

      {images.length > 1 ? (
        <div className={styles.quoteGalleryWrap} onClick={(event) => event.stopPropagation()}>
          <ImageGallery images={images} aspect="4 / 5" maxHeight={580} rounded={!mobile} fit="contain" adaptive />
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

function PostCardComponent({
  post,
  onOpen,
  onOpenPost,
  compact = false,
  surface = 'card',
}: {
  post: Post;
  onOpen?: () => void;
  onOpenPost?: (postId: string) => void;
  compact?: boolean;
  surface?: 'card' | 'flat';
}) {
  const { data } = useGetMeQuery();
  const me = data?.user;
  const actualLiked = !!me && (post.likes ?? []).some((l) => l.userId === me.id);
  const actualLikesCount = post._count?.likes ?? 0;
  const [optimisticLiked, setOptimisticLiked] = useState(actualLiked);
  const [optimisticLikesCount, setOptimisticLikesCount] = useState(actualLikesCount);
  const [like, { isLoading: liking }] = useLikePostMutation();
  const [unlike, { isLoading: unliking }] = useUnlikePostMutation();
  const [del, { isLoading: deleting }] = useDeletePostMutation();
  const lightbox = useLightbox();
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const [commentsOpen, setCommentsOpen] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);
  const [showTextToggle, setShowTextToggle] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const textRef = useRef<HTMLDivElement | null>(null);
  const isMobile = useIsMobile();

  useEffect(() => {
    setOptimisticLiked(actualLiked);
    setOptimisticLikesCount(actualLikesCount);
  }, [actualLiked, actualLikesCount, post.id]);

  useEffect(() => {
    if (!menuOpen) return;
    const onDoc = (event: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(event.target as Node)) setMenuOpen(false);
    };
    document.addEventListener('mousedown', onDoc);
    return () => document.removeEventListener('mousedown', onDoc);
  }, [menuOpen]);

  useEffect(() => {
    if (textExpanded) return;
    const frame = requestAnimationFrame(() => {
      const node = textRef.current;
      setShowTextToggle(Boolean(node && node.scrollHeight > node.clientHeight + 2));
    });
    return () => cancelAnimationFrame(frame);
  }, [post.text, isMobile, textExpanded]);

  const canDeletePost = !!me && (post.authorId === me.id || me.role === 'ADMIN');
  const originalPost = useMemo(() => (post.repostOf ? getOriginalPost(post.repostOf) : null), [post.repostOf]);
  const images = post.repostOf ? [] : post.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;
  const healthWidget = useMemo(() => getLegacyHealthWidgetPayload(post.widgetsJson), [post.widgetsJson]);
  const pulseShareWidget = useMemo(() => getPulseShareWidgetPayload(post.widgetsJson), [post.widgetsJson]);
  const [singleImgLoaded, setSingleImgLoaded] = useState(false);

  useEffect(() => { setSingleImgLoaded(false); }, [singleImage?.url]);

  const openCurrent = () => {
    if (isMobile) return;
    if (onOpenPost) onOpenPost(post.id);
    else onOpen?.();
  };

  const openOriginalOnMobile = () => {
    if (!isMobile || !originalPost || !onOpenPost) return;
    onOpenPost(originalPost.id);
  };

  const onToggleLike = async () => {
    if (!post.id || !me) return;
    const nextLiked = !optimisticLiked;
    const previousLiked = optimisticLiked;
    const previousCount = optimisticLikesCount;
    setOptimisticLiked(nextLiked);
    setOptimisticLikesCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));

    const result = nextLiked
      ? await like({ postId: post.id, userId: me.id }).unwrap().catch(() => null)
      : await unlike({ postId: post.id, userId: me.id }).unwrap().catch(() => null);

    if (!result) {
      setOptimisticLiked(previousLiked);
      setOptimisticLikesCount(previousCount);
    }
  };

  const onDelete = async () => {
    if (!post.id) return;
    await del({ postId: post.id }).unwrap().catch(() => null);
    setConfirmOpen(false);
  };

  const onOpenOriginal = originalPost && onOpenPost ? () => onOpenPost(originalPost.id) : undefined;
  const textClass = [styles.text, !textExpanded ? styles.textCollapsed : ''].filter(Boolean).join(' ');

  return (
    <>
      <Card className={[styles.card, compact ? styles.cardCompact : '', isMobile ? styles.cardMobile : '', surface === 'flat' && !isMobile ? styles.cardFlat : '', menuOpen || pulseShareWidget ? styles.cardUncontained : ''].filter(Boolean).join(' ')}>
        <div className={styles.header}>
          <div className={styles.author}>
            <Avatar url={post.author.avatarUrl} name={post.author.username} size={isMobile ? 42 : 44} />
            <Link href={ROUTES.app.profile(post.author.username)} className={styles.authorLink}>
              <div className={styles.nameRow}>
                <span className={styles.name}>{post.author.username}</span>
                <AdminBadge role={post.author.role} username={post.author.username} />
              </div>
              <div className={styles.handle}>@{post.author.username}</div>
              {post.repostOf ? <div className={styles.repostMeta}>репостнул публикацию</div> : null}
            </Link>
          </div>

          <div className={styles.right}>
            <div className={[styles.time, isMobile && originalPost ? styles.timeClickable : ''].filter(Boolean).join(' ')} onClick={originalPost ? openOriginalOnMobile : undefined}>{formatRelative(post.createdAt)}</div>
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
            <div
              ref={textRef}
              className={[textClass, isMobile && originalPost ? styles.textClickable : ''].filter(Boolean).join(' ')}
              onClick={!isMobile ? openCurrent : originalPost ? openOriginalOnMobile : undefined}
              style={{ cursor: !isMobile && (onOpen || onOpenPost) ? 'pointer' : isMobile && originalPost ? 'pointer' : 'default' }}
            >
              {post.text}
            </div>
            {showTextToggle ? (
              <button type="button" className={styles.moreTextBtn} onClick={() => setTextExpanded((value) => !value)}>
                {textExpanded ? 'Свернуть' : 'Показать ещё'}
              </button>
            ) : null}
          </>
        ) : null}

        {healthWidget ? (
          <button type="button" className={styles.widget} onClick={!isMobile ? openCurrent : undefined}>
            <div>
              <div className={styles.widgetTitle}>Сводка дня</div>
              <div className={styles.widgetHint}>Оценка дня и недельный пульс</div>
            </div>
            <div className={styles.widgetNums}>
              <span>{healthWidget.todayScore ?? '—'}%</span>
              <span>{healthWidget.pulse7Score ?? '—'}%</span>
            </div>
          </button>
        ) : null}

        {pulseShareWidget ? (
          <PulseShareCard
            artifactId={String(pulseShareWidget.artifactId ?? '')}
            artifact={pulseShareWidget.artifact ?? null}
            compact={compact || isMobile}
            surface={surface === 'flat' ? 'flat' : 'default'}
            className={styles.pulseWidgetCard}
          />
        ) : null}

        {originalPost ? (
          <div className={styles.repostWrap}>
            <QuoteCard post={originalPost} onOpenOriginal={isMobile ? openOriginalOnMobile : onOpenOriginal} mobile={isMobile} />
          </div>
        ) : null}

        {!originalPost && singleImage ? (
          <div className={styles.mediaSingle} style={{ position: 'relative' }}>
            <img
              src={singleImage.url}
              alt=""
              className={styles.singleImage}
              loading="lazy"
              ref={(node) => { if (node?.complete && node.naturalWidth > 0) setSingleImgLoaded(true); }}
              onLoad={() => setSingleImgLoaded(true)}
              onError={() => setSingleImgLoaded(true)}
              onClick={(event) => { event.stopPropagation(); lightbox?.openLightbox([{ id: singleImage.id, url: singleImage.url }], 0); }}
            />
            <MediaPlaceholder loaded={singleImgLoaded} />
          </div>
        ) : null}

        {!originalPost && images.length > 1 ? (
          <div className={styles.galleryWrap}>
            <ImageGallery images={images} aspect="4 / 5" maxHeight={isMobile ? 560 : 760} rounded={!isMobile} fit="contain" adaptive />
          </div>
        ) : null}

        <div className={styles.footer}>
          <div className={styles.actions}>
            <button className={[styles.actionStat, optimisticLiked ? styles.actionStatActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike} disabled={liking || unliking || !me} aria-label="Нравится">
              <Icon name="heart" size={18} />
              {isMobile ? (
                <span className={styles.actionCount}>{optimisticLikesCount}</span>
              ) : (
                <span className={styles.actionCount} onClick={(event) => { event.stopPropagation(); setLikesOpen(true); }}>{optimisticLikesCount}</span>
              )}
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

      {confirmOpen ? (
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
      ) : null}

      {shareOpen ? <RepostModal open={shareOpen} onClose={() => setShareOpen(false)} post={post} /> : null}
      {!isMobile && likesOpen ? <PostLikesModal open={likesOpen} onClose={() => setLikesOpen(false)} postId={post.id} /> : null}
      {commentsOpen ? <PostCommentsMobileModal open={commentsOpen} onClose={() => setCommentsOpen(false)} postId={post.id} /> : null}
      {editOpen ? <EditPostModal open={editOpen} onClose={() => setEditOpen(false)} post={post} /> : null}
    </>
  );
}


export const PostCard = memo(PostCardComponent, (prev, next) => prev.post === next.post && prev.compact === next.compact && prev.surface === next.surface && prev.onOpenPost === next.onOpenPost && prev.onOpen === next.onOpen);
PostCard.displayName = 'PostCard';
