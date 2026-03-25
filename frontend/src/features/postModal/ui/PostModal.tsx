'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostModal.module.css';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useGetMeQuery } from '@/shared/api/usersApi';
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useDeletePostMutation,
  useGetCommentsQuery,
  useGetPostQuery,
  useLikePostMutation,
  useUnlikePostMutation,
} from '@/shared/api/postsApi';
import { formatRelative } from '@/shared/lib/time';
import type { Comment, Post } from '@/shared/types/social';
import { Skeleton, SkeletonCard, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { ImageGallery } from '@/shared/ui/ImageGallery/ImageGallery';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';
import { ConfirmDialog } from '@/shared/ui/ConfirmDialog/ConfirmDialog';
import { RepostModal } from '@/features/postRepost/ui/RepostModal';
import { PostLikesModal } from '@/features/postLikes/ui/PostLikesModal';

const MAX_TEXT = 5000;

function getOriginalPost(post: Post): Post {
  let current = post;
  while (current.repostOf) current = current.repostOf;
  return current;
}

function useAutosize(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 46), 120)}px`;
  }, [ref, value]);
}

function formatAbsoluteDate(value: string) {
  try {
    return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' }).format(new Date(value));
  } catch {
    return value;
  }
}

function CommentItem({ c, canDelete, onAskDelete, deleting }: { c: Comment; canDelete: boolean; onAskDelete: () => void; deleting?: boolean }) {
  const lightbox = useLightbox();
  return (
    <div className={styles.comment}>
      <Avatar url={c.author.avatarUrl} name={c.author.username} size={34} />
      <div className={styles.commentBody}>
        <div className={styles.commentTop}>
          <div style={{ minWidth: 0 }}>
            <div className={styles.commentAuthorRow}>
              <span className={styles.commentAuthor}>{c.author.username}</span>
              <AdminBadge role={c.author.role} />
            </div>
            <div className={styles.commentMeta}>{formatRelative(c.createdAt)}</div>
          </div>
          {canDelete ? (
            <button className={styles.commentDelete} type="button" onClick={onAskDelete} disabled={deleting} aria-label="Удалить комментарий">
              <Icon name="trash" size={14} />
            </button>
          ) : null}
        </div>
        {c.text ? <div className={styles.commentText}>{c.text}</div> : null}
        {(c.images ?? []).length ? (
          <div className={styles.images}>
            {(c.images ?? []).slice(0, 6).map((img, index) => (
              <img
                key={img.id}
                src={img.url}
                className={styles.img}
                alt=""
                loading="lazy"
                onClick={() => lightbox?.openLightbox((c.images ?? []).map((item) => ({ id: item.id, url: item.url })), index)}
              />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PostModal({
  postId,
  open,
  onClose,
  onOpenPost,
}: {
  postId: string | null;
  open: boolean;
  onClose: () => void;
  onOpenPost?: (postId: string) => void;
}) {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const { data: postData, isFetching: postFetching } = useGetPostQuery({ postId: postId! }, { skip: !open || !postId });
  const post = postData?.post;
  const originalPost = post ? getOriginalPost(post) : null;
  const displayPost = originalPost ?? post ?? null;

  const [cursor, setCursor] = useState<string | null>(null);
  const { data: commentsData, isFetching } = useGetCommentsQuery({ postId: postId!, take: 30, cursor }, { skip: !open || !postId });
  const comments = commentsData?.items ?? [];
  const nextCursor = commentsData?.nextCursor ?? null;

  const lightbox = useLightbox();
  const [commentText, setCommentText] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useAutosize(ref, commentText);

  const [createComment, { isLoading: sending }] = useCreateCommentMutation();
  const [deleteComment, { isLoading: deletingComment }] = useDeleteCommentMutation();
  const [deletePost, { isLoading: deletingPost }] = useDeletePostMutation();
  const [like, { isLoading: liking }] = useLikePostMutation();
  const [unlike, { isLoading: unliking }] = useUnlikePostMutation();

  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);
  const [confirmDeletePostOpen, setConfirmDeletePostOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    document.addEventListener('keydown', onKey);
    return () => {
      document.body.style.overflow = prev;
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setCommentText('');
    setCursor(null);
    setCommentToDelete(null);
    setConfirmDeletePostOpen(false);
    setShareOpen(false);
    setLikesOpen(false);
  }, [open, postId]);

  const canSend = commentText.trim().length > 0 && commentText.length <= MAX_TEXT && !sending;
  const liked = !!me && !!post && (post.likes ?? []).some((item) => item.userId === me.id);
  const canDeletePost = !!me && !!post && (post.authorId === me.id || me.role === 'ADMIN');

  const onSend = async () => {
    if (!postId || !canSend) return;
    await createComment({ postId, text: commentText.trim() }).unwrap().catch(() => null);
    setCommentText('');
  };

  const onToggleLike = async () => {
    if (!postId || !post) return;
    if (liked) await unlike({ postId, userId: me?.id }).unwrap().catch(() => null);
    else await like({ postId, userId: me?.id }).unwrap().catch(() => null);
  };

  const onDeletePost = async () => {
    if (!postId) return;
    const ok = await deletePost({ postId }).unwrap().catch(() => null);
    if (ok) {
      setConfirmDeletePostOpen(false);
      onClose();
    }
  };

  const onDeleteComment = async () => {
    if (!commentToDelete) return;
    const ok = await deleteComment({ commentId: commentToDelete.id, postId: commentToDelete.postId }).unwrap().catch(() => null);
    if (ok) {
      setCommentToDelete(null);
    }
  };

  const canDeleteIds = useMemo(() => {
    const set = new Set<string>();
    if (!me) return set;
    for (const c of comments) {
      if (c.authorId === me.id || me.role === 'ADMIN') set.add(c.id);
    }
    return set;
  }, [comments, me]);

  if (!open) return null;

  const images = displayPost?.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;

  return (
    <>
      <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
        <button className={styles.close} onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={22} />
        </button>

        <div className={styles.surface} onMouseDown={(e) => e.stopPropagation()}>
          <div className={styles.mediaPane}>
            {postFetching && !post ? <SkeletonCard className={styles.postSkeleton} /> : null}

            {displayPost ? (
              <>
                {singleImage ? (
                  <img
                    src={singleImage.url}
                    alt=""
                    className={styles.mainImage}
                    onClick={() => lightbox?.openLightbox([{ id: singleImage.id, url: singleImage.url }], 0)}
                  />
                ) : null}
                {images.length > 1 ? <ImageGallery images={images} aspect="4 / 5" maxHeight={880} /> : null}
                {!images.length ? (
                  <div className={styles.textOnlyState}>
                    <div className={styles.textOnlyLabel}>{post?.repostOf ? `Репост из @${displayPost.author.username}` : 'Публикация'}</div>
                    <div className={styles.textOnlyContent}>{displayPost.text || 'Без вложений'}</div>
                  </div>
                ) : null}
              </>
            ) : null}
          </div>

          <aside className={styles.sidePane}>
            {post ? (
              <>
                <div className={styles.sideHeader}>
                  <div className={styles.author}>
                    <Avatar url={post.author.avatarUrl} name={post.author.username} size={42} />
                    <div className={styles.authorText}>
                      <div className={styles.authorNameRow}>
                        <span className={styles.authorName}>{post.author.username}</span>
                        <AdminBadge role={post.author.role} />
                      </div>
                      <div className={styles.authorMeta}>{formatAbsoluteDate(post.createdAt)}</div>
                    </div>
                  </div>

                  <div className={styles.headerTools}>
                    {canDeletePost ? (
                      <button className={styles.headerToolBtn} type="button" onClick={() => setConfirmDeletePostOpen(true)} aria-label="Удалить публикацию">
                        <Icon name="trash" size={16} />
                      </button>
                    ) : null}
                  </div>
                </div>

                <div className={styles.actionRow}>
                  <div className={styles.metricGroup}>
                    <button className={[styles.metricIconBtn, liked ? styles.metricBtnActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike} disabled={!me || liking || unliking}>
                      <Icon name="heart" size={18} />
                    </button>
                    <button className={styles.metricCountBtn} type="button" onClick={() => setLikesOpen(true)}>
                      {post._count?.likes ?? 0}
                    </button>
                  </div>
                  <button className={styles.metricBtn} type="button" disabled>
                    <Icon name="comment" size={18} />
                    <span>{post._count?.comments ?? 0}</span>
                  </button>
                  <button className={styles.metricBtn} type="button" onClick={() => setShareOpen(true)}>
                    <Icon name="forward" size={18} />
                    <span>{post._count?.reposts ?? 0}</span>
                  </button>
                </div>

                {post.text ? <div className={styles.description}>{post.text}</div> : null}
                {post.repostOf && originalPost ? (
                  <div className={styles.repostRow}>
                    <span className={styles.repostLabel}>Оригинал: @{originalPost.author.username}</span>
                    {onOpenPost ? (
                      <button type="button" className={styles.repostLinkBtn} onClick={() => onOpenPost(originalPost.id)}>
                        Открыть оригинал
                      </button>
                    ) : null}
                  </div>
                ) : null}

                <div className={styles.commentsSection}>
                  <div className={styles.commentsHeader}>Комментарии</div>

                  <div className={styles.commentsList}>
                    {comments.map((c) => (
                      <CommentItem
                        key={c.id}
                        c={c}
                        canDelete={canDeleteIds.has(c.id)}
                        deleting={deletingComment && commentToDelete?.id === c.id}
                        onAskDelete={() => setCommentToDelete(c)}
                      />
                    ))}

                    {isFetching && !comments.length ? (
                      <>
                        <div className={styles.comment}><Skeleton circle style={{ width: 34, height: 34 }} /><div className={styles.commentBody}><SkeletonText lines={3} /></div></div>
                        <div className={styles.comment}><Skeleton circle style={{ width: 34, height: 34 }} /><div className={styles.commentBody}><SkeletonText lines={2} /></div></div>
                      </>
                    ) : null}

                    {!comments.length && !isFetching ? (
                      <div className={styles.emptyComments}>
                        <Icon name="comment" size={26} />
                        <div>Пока нет комментариев</div>
                        <div className={styles.emptyCommentsHint}>Станьте первым, кто начнёт обсуждение.</div>
                      </div>
                    ) : null}
                  </div>

                  {nextCursor ? (
                    <button className={styles.loadMore} onClick={() => nextCursor && setCursor(nextCursor)} disabled={isFetching}>
                      {isFetching ? 'Загрузка…' : 'Показать ещё'}
                    </button>
                  ) : null}
                </div>

                <div className={styles.commentComposer}>
                  {me ? <Avatar url={me.avatarUrl} name={me.username} size={36} /> : <Skeleton circle style={{ width: 36, height: 36 }} />}
                  <div className={styles.commentInputWrap}>
                    <textarea
                      ref={ref}
                      className={styles.textarea}
                      value={commentText}
                      onChange={(e) => setCommentText(e.target.value.slice(0, MAX_TEXT + 50))}
                      placeholder="Написать комментарий..."
                      rows={1}
                    />
                  </div>
                  <button className={styles.sendBtn} onClick={onSend} disabled={!canSend} aria-label="Отправить комментарий">
                    <Icon name="send" size={18} />
                  </button>
                </div>
              </>
            ) : null}
          </aside>
        </div>
      </div>

      <ConfirmDialog
        open={confirmDeletePostOpen}
        onClose={() => setConfirmDeletePostOpen(false)}
        onConfirm={onDeletePost}
        title="Удалить публикацию?"
        description="Пост исчезнет из ленты и профиля. Это действие нельзя быстро отменить."
        confirmLabel="Удалить"
        loading={deletingPost}
        icon="trash"
      />

      <ConfirmDialog
        open={!!commentToDelete}
        onClose={() => setCommentToDelete(null)}
        onConfirm={onDeleteComment}
        title="Удалить комментарий?"
        description="Комментарий исчезнет из обсуждения. Это действие нельзя быстро отменить."
        confirmLabel="Удалить"
        loading={deletingComment}
        icon="trash"
      />

      <RepostModal open={shareOpen} onClose={() => setShareOpen(false)} post={post ?? null} />
      <PostLikesModal open={likesOpen} onClose={() => setLikesOpen(false)} postId={post?.id ?? null} />
    </>
  );
}
