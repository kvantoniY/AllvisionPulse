'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostModal.module.css';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useGetMeQuery } from '@/shared/api/usersApi';
import {
  useCreateCommentMutation,
  useDeleteCommentMutation,
  useDeletePostMutation,
  useGetCommentRepliesQuery,
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
import { lockBodyScroll } from '@/shared/lib/dom/scrollLock';

const MAX_TEXT = 5000;

type ReplyTarget = {
  commentId: string;
  parentId: string;
  username: string;
};

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

function CommentBubble({
  comment,
  canDelete,
  deleting,
  onAskDelete,
  onReply,
}: {
  comment: Comment;
  canDelete: boolean;
  deleting?: boolean;
  onAskDelete: () => void;
  onReply: () => void;
}) {
  const lightbox = useLightbox();
  return (
    <div className={styles.comment}>
      <Avatar url={comment.author.avatarUrl} name={comment.author.username} size={34} />
      <div className={styles.commentBody}>
        <div className={styles.commentTop}>
          <div style={{ minWidth: 0 }}>
            <div className={styles.commentAuthorRow}>
              <span className={styles.commentAuthor}>{comment.author.username}</span>
              <AdminBadge role={comment.author.role} />
              {comment.parentId && comment.replyToUsername ? <span className={styles.commentReplyTo}>· {comment.replyToUsername}</span> : null}
            </div>
            <div className={styles.commentMeta}>{formatRelative(comment.createdAt)}</div>
          </div>
          {canDelete ? (
            <button className={styles.commentDelete} type="button" onClick={onAskDelete} disabled={deleting} aria-label="Удалить комментарий">
              <Icon name="trash" size={14} />
            </button>
          ) : null}
        </div>
        {comment.text ? <div className={styles.commentText}>{comment.text}</div> : null}
        {(comment.images ?? []).length ? (
          <div className={styles.commentImages}>
            {(comment.images ?? []).slice(0, 8).map((img, index) => (
              <img
                key={img.id}
                src={img.url}
                className={styles.commentImg}
                alt=""
                loading="lazy"
                onClick={() => lightbox?.openLightbox((comment.images ?? []).map((item) => ({ id: item.id, url: item.url })), index)}
              />
            ))}
          </div>
        ) : null}
        <div className={styles.commentActions}>
          <button type="button" className={styles.commentActionBtn} onClick={onReply}>
            Ответить
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentThread({
  rootComment,
  meId,
  isAdmin,
  canDeleteIds,
  deletingCommentId,
  onAskDelete,
  onReply,
}: {
  rootComment: Comment;
  meId?: string | null;
  isAdmin?: boolean;
  canDeleteIds: Set<string>;
  deletingCommentId?: string | null;
  onAskDelete: (comment: Comment) => void;
  onReply: (comment: Comment, rootParentId?: string) => void;
}) {
  const hasReplies = (rootComment._count?.replies ?? 0) > 0;
  const { data: repliesData } = useGetCommentRepliesQuery({ commentId: rootComment.id }, { skip: !hasReplies });
  const replies = repliesData?.items ?? [];
  const [expanded, setExpanded] = useState(false);
  const visibleReplies = expanded ? replies : replies.slice(0, 2);
  const hiddenCount = Math.max(0, replies.length - visibleReplies.length);

  return (
    <div className={styles.thread}>
      <CommentBubble
        comment={rootComment}
        canDelete={canDeleteIds.has(rootComment.id)}
        deleting={deletingCommentId === rootComment.id}
        onAskDelete={() => onAskDelete(rootComment)}
        onReply={() => onReply(rootComment, rootComment.id)}
      />

      {visibleReplies.length ? (
        <div className={styles.replies}>
          {visibleReplies.map((reply) => (
            <CommentBubble
              key={reply.id}
              comment={reply}
              canDelete={!!meId && (reply.authorId === meId || !!isAdmin)}
              deleting={deletingCommentId === reply.id}
              onAskDelete={() => onAskDelete(reply)}
              onReply={() => onReply(reply, rootComment.id)}
            />
          ))}
        </div>
      ) : null}

      {hiddenCount > 0 ? (
        <button type="button" className={styles.loadMoreInline} onClick={() => setExpanded(true)}>
          Показать ещё ответы ({hiddenCount})
        </button>
      ) : null}
    </div>
  );
}

function CommentComposer({
  me,
  value,
  onChange,
  files,
  onAddFiles,
  onRemoveFile,
  replyTarget,
  onClearReply,
  onSend,
  sending,
  compact,
}: {
  me: { avatarUrl?: string | null; username: string } | null;
  value: string;
  onChange: (value: string) => void;
  files: File[];
  onAddFiles: (files: FileList | null) => void;
  onRemoveFile: (index: number) => void;
  replyTarget: ReplyTarget | null;
  onClearReply: () => void;
  onSend: () => void;
  sending: boolean;
  compact?: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);
  useAutosize(ref, value);
  const canSend = (!!value.trim() || files.length > 0) && !sending;

  return (
    <div className={[styles.commentComposer, compact ? styles.commentComposerInline : ''].filter(Boolean).join(' ')}>
      {me ? <Avatar url={me.avatarUrl} name={me.username} size={36} /> : <Skeleton circle style={{ width: 36, height: 36 }} />}
      <div className={styles.commentInputWrap}>
        {replyTarget ? (
          <div className={styles.replyChip}>
            <span>ответ {replyTarget.username}</span>
            <button type="button" className={styles.replyChipClose} onClick={onClearReply} aria-label="Сбросить ответ">
              <Icon name="close" size={12} />
            </button>
          </div>
        ) : null}

        {files.length ? (
          <div className={styles.attachmentsPreview}>
            {files.map((file, index) => (
              <div key={`${file.name}:${index}`} className={styles.attachmentItem}>
                <img src={URL.createObjectURL(file)} alt="" className={styles.attachmentImage} />
                <button type="button" className={styles.attachmentRemove} onClick={() => onRemoveFile(index)} aria-label="Удалить изображение">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        <div className={styles.textareaShell}>
          <textarea
            ref={ref}
            className={styles.textarea}
            value={value}
            onChange={(e) => onChange(e.target.value.slice(0, MAX_TEXT + 50))}
            placeholder={replyTarget ? 'Написать ответ...' : 'Написать комментарий...'}
            rows={1}
          />
          <div className={styles.textareaTools}>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                onAddFiles(e.target.files);
                e.target.value = '';
              }}
            />
            <button type="button" className={styles.inputToolBtn} onClick={() => inputRef.current?.click()} aria-label="Добавить изображение">
              <Icon name="image" size={17} />
            </button>
          </div>
        </div>
      </div>
      <button className={styles.sendBtn} onClick={onSend} disabled={!canSend} aria-label="Отправить комментарий">
        <Icon name="send" size={18} />
      </button>
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
  const originalPost = post?.repostOf ? getOriginalPost(post.repostOf) : null;
  const mediaPost = originalPost ?? post ?? null;

  const [cursor, setCursor] = useState<string | null>(null);
  const { data: commentsData, isFetching } = useGetCommentsQuery({ postId: postId!, take: 20, cursor }, { skip: !open || !postId });
  const comments = commentsData?.items ?? [];
  const nextCursor = commentsData?.nextCursor ?? null;

  const lightbox = useLightbox();
  const [commentText, setCommentText] = useState('');
  const [commentFiles, setCommentFiles] = useState<File[]>([]);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);

  const [createComment, { isLoading: sending }] = useCreateCommentMutation();
  const [deleteComment, { isLoading: deletingComment }] = useDeleteCommentMutation();
  const [deletePost, { isLoading: deletingPost }] = useDeletePostMutation();
  const [like, { isLoading: liking }] = useLikePostMutation();
  const [unlike, { isLoading: unliking }] = useUnlikePostMutation();

  const [commentToDelete, setCommentToDelete] = useState<Comment | null>(null);
  const [confirmDeletePostOpen, setConfirmDeletePostOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [likesOpen, setLikesOpen] = useState(false);
  const [textExpanded, setTextExpanded] = useState(false);

  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    const unlock = lockBodyScroll();
    document.addEventListener('keydown', onKey);
    return () => {
      unlock();
      document.removeEventListener('keydown', onKey);
    };
  }, [open, onClose]);

  useEffect(() => {
    if (!open) return;
    setCommentText('');
    setCommentFiles([]);
    setReplyTarget(null);
    setCursor(null);
    setCommentToDelete(null);
    setConfirmDeletePostOpen(false);
    setShareOpen(false);
    setLikesOpen(false);
    setTextExpanded(false);
  }, [open, postId]);

  const liked = !!me && !!post && (post.likes ?? []).some((item) => item.userId === me.id);
  const canDeletePost = !!me && !!post && (post.authorId === me.id || me.role === 'ADMIN');

  const onSend = async () => {
    if (!postId || (!commentText.trim() && !commentFiles.length)) return;
    await createComment({
      postId,
      text: commentText.trim() || undefined,
      images: commentFiles,
      parentId: replyTarget?.parentId ?? null,
      widgetsJson: replyTarget ? { replyToUsername: replyTarget.username, replyToCommentId: replyTarget.commentId } : undefined,
    }).unwrap().catch(() => null);
    setCommentText('');
    setCommentFiles([]);
    setReplyTarget(null);
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
    const ok = await deleteComment({
      commentId: commentToDelete.id,
      postId: commentToDelete.postId,
      parentId: commentToDelete.parentId ?? null,
    }).unwrap().catch(() => null);
    if (ok) setCommentToDelete(null);
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

  const images = mediaPost?.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;
  const hasMedia = images.length > 0;
  const textContent = post?.text || (!hasMedia && mediaPost && mediaPost.id !== post?.id ? mediaPost.text || '' : '');
  const longText = textContent.length > (hasMedia ? 320 : 700);
  const descriptionClassName = [
    styles.description,
    hasMedia ? styles.descriptionScrollable : styles.descriptionTextOnly,
    longText && !textExpanded ? styles.descriptionCollapsed : '',
  ].filter(Boolean).join(' ');

  const actionRow = (
    <div className={[styles.actionRow, !hasMedia ? styles.actionRowTextOnly : ''].filter(Boolean).join(' ')}>
      <div className={styles.metricGroup}>
        <button className={[styles.metricIconBtn, liked ? styles.metricBtnActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike} disabled={!me || liking || unliking}>
          <Icon name="heart" size={18} />
        </button>
        <button className={styles.metricCountBtn} type="button" onClick={() => setLikesOpen(true)}>
          {post?._count?.likes ?? 0}
        </button>
      </div>
      <button className={styles.metricBtn} type="button" disabled>
        <Icon name="comment" size={18} />
        <span>{post?._count?.comments ?? 0}</span>
      </button>
      <button className={styles.metricBtn} type="button" onClick={() => setShareOpen(true)}>
        <Icon name="repeat" size={18} />
        <span>{post?._count?.reposts ?? 0}</span>
      </button>
    </div>
  );

  const commentsSection = (
    <div className={[styles.commentsSection, !hasMedia ? styles.commentsSectionTextOnly : ''].filter(Boolean).join(' ')}>
      <div className={styles.commentsHeader}>Комментарии</div>
      <div className={styles.commentsList}>
        {comments.map((comment) => (
          <CommentThread
            key={comment.id}
            rootComment={comment}
            meId={me?.id}
            isAdmin={me?.role === 'ADMIN'}
            canDeleteIds={canDeleteIds}
            deletingCommentId={deletingComment ? commentToDelete?.id ?? null : null}
            onAskDelete={setCommentToDelete}
            onReply={(target, rootParentId) =>
              setReplyTarget({
                commentId: target.id,
                parentId: rootParentId ?? target.id,
                username: target.author.username,
              })
            }
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
          {isFetching ? 'Загрузка…' : 'Показать ещё комментарии'}
        </button>
      ) : null}
    </div>
  );

  const composerElement = (
    <CommentComposer
      me={me ? { avatarUrl: me.avatarUrl, username: me.username } : null}
      value={commentText}
      onChange={setCommentText}
      files={commentFiles}
      onAddFiles={(list) => setCommentFiles((prev) => [...prev, ...(list ? Array.from(list).slice(0, Math.max(0, 8 - prev.length)) : [])])}
      onRemoveFile={(index) => setCommentFiles((prev) => prev.filter((_, i) => i !== index))}
      replyTarget={replyTarget}
      onClearReply={() => setReplyTarget(null)}
      onSend={onSend}
      sending={sending}
      compact={!hasMedia}
    />
  );

  return (
    <>
      <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
        <button className={styles.close} onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={22} />
        </button>

        <div className={[styles.surface, !hasMedia ? styles.surfaceCompact : ''].filter(Boolean).join(' ')} onMouseDown={(e) => e.stopPropagation()}>
          {hasMedia ? (
            <div className={styles.mediaPane}>
              {postFetching && !post ? <SkeletonCard className={styles.postSkeleton} /> : null}
              {mediaPost ? (
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
                </>
              ) : null}
            </div>
          ) : null}

          <aside className={[styles.sidePane, !hasMedia ? styles.sidePaneTextOnly : ''].filter(Boolean).join(' ')}>
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
                      {post.repostOf ? <div className={styles.repostMeta}>репостнул публикацию</div> : null}
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

                {hasMedia ? (
                  <>
                    {actionRow}
                    {textContent ? <div className={descriptionClassName}>{textContent}</div> : null}
                    {longText ? (
                      <button type="button" className={styles.moreTextBtnModal} onClick={() => setTextExpanded((value) => !value)}>
                        {textExpanded ? 'Свернуть' : 'Показать ещё'}
                      </button>
                    ) : null}
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
                    <div className={styles.commentsDock}>
                      {commentsSection}
                      {composerElement}
                    </div>
                  </>
                ) : (
                  <>
                    <div className={styles.textFlow}>
                      {textContent ? <div className={descriptionClassName}>{textContent}</div> : null}
                      {longText ? (
                        <button type="button" className={styles.moreTextBtnModal} onClick={() => setTextExpanded((value) => !value)}>
                          {textExpanded ? 'Свернуть' : 'Показать ещё'}
                        </button>
                      ) : null}
                      {post.repostOf && originalPost ? (
                        <div className={styles.repostRowInline}>
                          <span className={styles.repostLabel}>Оригинал: @{originalPost.author.username}</span>
                          {onOpenPost ? (
                            <button type="button" className={styles.repostLinkBtn} onClick={() => onOpenPost(originalPost.id)}>
                              Открыть оригинал
                            </button>
                          ) : null}
                        </div>
                      ) : null}
                      {actionRow}
                      {composerElement}
                    </div>
                    {commentsSection}
                  </>
                )}
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
