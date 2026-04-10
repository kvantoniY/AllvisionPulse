'use client';

import { ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
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
  useLikeCommentMutation,
  useLikePostMutation,
  useUnlikeCommentMutation,
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
import { EditPostModal } from '@/features/postEdit/ui/EditPostModal';
import { lockBodyScroll } from '@/shared/lib/dom/scrollLock';
import { PulseShareCard } from '@/shared/ui/PulseShareCard/PulseShareCard';
import { PulseSharePicker } from '@/shared/ui/PulseSharePicker/PulseSharePicker';
import type { ShareArtifact } from '@/shared/types/programs';
import { toPulseShareWidgetPayload, type PulseShareWidgetPayload } from '@/shared/lib/pulseShare';
import { getPulseShareWidgetPayload } from '@/shared/lib/socialWidgets';

const MAX_TEXT = 5000;

type ReplyTarget = {
  commentId: string;
  parentId: string;
  username: string;
};

type SortMode = 'new' | 'old' | 'top';
type PendingAttachment = { id: string; file: File; url: string };

const createPendingAttachment = (file: File): PendingAttachment => ({
  id: typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID() : `${Date.now()}-${Math.random().toString(36).slice(2)}`,
  file,
  url: URL.createObjectURL(file),
});

const revokePendingAttachments = (items: PendingAttachment[]) => {
  for (const item of items) URL.revokeObjectURL(item.url);
};

function commentWidgetLabel(widget: PulseShareWidgetPayload | null) {
  if (!widget) return '';
  const snapshot = widget.artifact.snapshotJson ?? {};
  const title = typeof snapshot.title === 'string' ? snapshot.title : widget.artifact.title ?? 'Pulse artifact';
  return `Виджет Pulse: ${title}`;
}

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

function sortComments<T extends { createdAt: string; _count?: { likes?: number } }>(items: T[], mode: SortMode) {
  const list = [...items];
  if (mode === 'top') return list.sort((a, b) => (b._count?.likes ?? 0) - (a._count?.likes ?? 0) || +new Date(b.createdAt) - +new Date(a.createdAt));
  if (mode === 'old') return list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function CommentBubble({
  comment,
  postId,
  parentId,
  meId,
  canDelete,
  deleting,
  onAskDelete,
  onReply,
}: {
  comment: Comment;
  postId: string;
  parentId?: string;
  meId?: string | null;
  canDelete: boolean;
  deleting?: boolean;
  onAskDelete: () => void;
  onReply: () => void;
}) {
  const lightbox = useLightbox();
  const pulseShareWidget = useMemo(() => getPulseShareWidgetPayload(comment.widgetsJson), [comment.widgetsJson]);
  const liked = !!meId && (comment.likes ?? []).some((item) => item.userId === meId);
  const [likeComment] = useLikeCommentMutation();
  const [unlikeComment] = useUnlikeCommentMutation();


  const onToggleLike = async () => {
    if (!meId) return;
    if (liked) await unlikeComment({ commentId: comment.id, postId, parentId, userId: meId }).unwrap().catch(() => null);
    else await likeComment({ commentId: comment.id, postId, parentId, userId: meId }).unwrap().catch(() => null);
  };

  return (
    <div className={styles.comment}>
      <Avatar url={comment.author.avatarUrl} name={comment.author.username} size={34} />
      <div className={styles.commentBody}>
        <div className={styles.commentTop}>
          <div style={{ minWidth: 0 }}>
            <div className={styles.commentAuthorRow}>
              <span className={styles.commentAuthor}>{comment.author.username}</span>
              <AdminBadge role={comment.author.role} username={comment.author.username} />
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

        {pulseShareWidget ? (
          <PulseShareCard
            artifactId={String(pulseShareWidget.artifactId ?? '')}
            artifact={pulseShareWidget.artifact ?? null}
            compact
          />
        ) : null}

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
          <button type="button" className={[styles.commentLikeBtn, liked ? styles.commentLikeBtnActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike}>
            <Icon name="heart" size={15} />
            <span>{comment._count?.likes ?? 0}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentThread({
  rootComment,
  postId,
  meId,
  isAdmin,
  canDeleteIds,
  deletingCommentId,
  onAskDelete,
  onReply,
}: {
  rootComment: Comment;
  postId: string;
  meId?: string | null;
  isAdmin?: boolean;
  canDeleteIds: Set<string>;
  deletingCommentId?: string | null;
  onAskDelete: (comment: Comment) => void;
  onReply: (comment: Comment, rootParentId?: string) => void;
}) {
  const hasReplies = (rootComment._count?.replies ?? 0) > 0;
  const { data: repliesData } = useGetCommentRepliesQuery({ commentId: rootComment.id }, { skip: !hasReplies });
  const replies = useMemo(() => sortComments(repliesData?.items ?? [], 'new'), [repliesData?.items]);
  const [expanded, setExpanded] = useState(false);
  const visibleReplies = expanded ? replies : replies.slice(0, 2);
  const hiddenCount = Math.max(0, replies.length - visibleReplies.length);

  return (
    <div className={styles.thread}>
      <CommentBubble
        comment={rootComment}
        postId={postId}
        meId={meId}
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
              postId={postId}
              parentId={rootComment.id}
              meId={meId}
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
  attachments,
  onAddFiles,
  onRemoveFile,
  widget,
  widgetLabel,
  onOpenSharePicker,
  onClearWidget,
  replyTarget,
  onClearReply,
  onSend,
  sending,
}: {
  me: { avatarUrl?: string | null; username: string } | null;
  value: string;
  onChange: (value: string) => void;
  attachments: PendingAttachment[];
  onAddFiles: (files: FileList | File[] | null) => void;
  onRemoveFile: (index: number) => void;
  widget: PulseShareWidgetPayload | null;
  widgetLabel: string;
  onOpenSharePicker: () => void;
  onClearWidget: () => void;
  replyTarget: ReplyTarget | null;
  onClearReply: () => void;
  onSend: () => void;
  sending: boolean;
}) {
  const ref = useRef<HTMLTextAreaElement | null>(null);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  useAutosize(ref, value);
  const canSend = (!!value.trim() || attachments.length > 0 || !!widget) && !sending;

  return (
    <div className={styles.commentComposer}>
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

        {attachments.length ? (
          <div className={styles.attachmentsPreview}>
            {attachments.map((attachment, index) => (
              <div key={attachment.id} className={styles.attachmentItem}>
                <img src={attachment.url} alt="" className={styles.attachmentImage} />
                <button type="button" className={styles.attachmentRemove} onClick={() => onRemoveFile(index)} aria-label="Удалить изображение">
                  <Icon name="close" size={12} />
                </button>
              </div>
            ))}
          </div>
        ) : null}

        {widget ? (
          <div className={styles.replyChip}>
            <span>{widgetLabel}</span>
            <button type="button" className={styles.replyChipClose} onClick={onClearWidget} aria-label="Удалить виджет">
              <Icon name="close" size={12} />
            </button>
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
              ref={fileInputRef}
              id={fileInputId}
              className={styles.fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={(e: ChangeEvent<HTMLInputElement>) => {
                const files = e.target.files ? Array.from(e.target.files) : [];
                onAddFiles(files);
                e.target.value = '';
              }}
            />
            <button
              type="button"
              className={styles.inputToolBtn}
              aria-label="Добавить изображение"
              onClick={() => {
                const input = fileInputRef.current;
                if (!input) return;
                input.value = '';
                input.click();
              }}
            >
              <Icon name="image" size={17} />
            </button>
            <button type="button" className={styles.inputToolBtn} aria-label="Прикрепить виджет Pulse" onClick={onOpenSharePicker}>
              <Icon name="paperclip" size={17} />
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

  const commentsRef = useRef<HTMLElement | null>(null);
  const surfaceScrollRef = useRef<HTMLDivElement | null>(null);
  const pendingMediaResetRef = useRef(false);
  const [commentText, setCommentText] = useState('');
  const [commentAttachments, setCommentAttachments] = useState<PendingAttachment[]>([]);
  const [shareWidget, setShareWidget] = useState<PulseShareWidgetPayload | null>(null);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const commentAttachmentsRef = useRef<PendingAttachment[]>([]);

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
  const [commentsExpanded, setCommentsExpanded] = useState(false);
  const [sortMode, setSortMode] = useState<SortMode>('new');
  const [sortOpen, setSortOpen] = useState(false);
  const [menuOpen, setMenuOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);
  const descriptionRef = useRef<HTMLDivElement | null>(null);
  const [showTextToggle, setShowTextToggle] = useState(false);

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

  const replaceCommentAttachments = (updater: (prev: PendingAttachment[]) => PendingAttachment[]) => {
    setCommentAttachments((prev) => {
      const next = updater(prev);
      commentAttachmentsRef.current = next;
      return next;
    });
  };

  const clearCommentAttachments = () => {
    setCommentAttachments((prev) => {
      revokePendingAttachments(prev);
      commentAttachmentsRef.current = [];
      return [];
    });
  };

  const resetSurfaceScroll = () => {
    const node = surfaceScrollRef.current;
    if (!node) return;
    node.scrollTop = 0;
    node.scrollTo?.({ top: 0, left: 0, behavior: 'auto' });
  };

  const handleMediaReady = () => {
    if (!pendingMediaResetRef.current) return;
    resetSurfaceScroll();
    requestAnimationFrame(() => resetSurfaceScroll());
    pendingMediaResetRef.current = false;
  };

  useEffect(() => {
    if (!open) {
      clearCommentAttachments();
      setShareWidget(null);
      setReplyTarget(null);
      setCommentText('');
      return;
    }
    pendingMediaResetRef.current = true;
    resetSurfaceScroll();
    setCommentText('');
    clearCommentAttachments();
    setShareWidget(null);
    setReplyTarget(null);
    setCursor(null);
    setCommentToDelete(null);
    setConfirmDeletePostOpen(false);
    setShareOpen(false);
    setLikesOpen(false);
    setTextExpanded(false);
    setShowTextToggle(false);
    setCommentsExpanded(false);
    setSortMode('new');
    setSortOpen(false);
    setMenuOpen(false);
    setEditOpen(false);
  }, [open, postId]);

  useEffect(() => {
    if (!open || !post?.id) return;
    resetSurfaceScroll();
  }, [open, post?.id]);

  const actualLiked = !!me && !!post && (post.likes ?? []).some((item) => item.userId === me.id);
  const actualLikesCount = post?._count?.likes ?? 0;
  const [optimisticLiked, setOptimisticLiked] = useState(actualLiked);
  const [optimisticLikesCount, setOptimisticLikesCount] = useState(actualLikesCount);
  const canDeletePost = !!me && !!post && (post.authorId === me.id || me.role === 'ADMIN');

  const onSend = async () => {
    if (!postId || (!commentText.trim() && !commentAttachments.length && !shareWidget)) return;
    const widgetsJson = {
      ...(replyTarget ? { replyToUsername: replyTarget.username, replyToCommentId: replyTarget.commentId } : {}),
      ...(shareWidget ?? {}),
    };
    await createComment({
      postId,
      text: commentText.trim() || undefined,
      images: commentAttachments.map((item) => item.file),
      parentId: replyTarget?.parentId ?? null,
      widgetsJson: Object.keys(widgetsJson).length ? widgetsJson : undefined,
    }).unwrap().catch(() => null);
    setCommentText('');
    clearCommentAttachments();
    setShareWidget(null);
    setReplyTarget(null);
  };

  useEffect(() => () => revokePendingAttachments(commentAttachmentsRef.current), []);

  const onToggleLike = async () => {
    if (!postId || !post || !me) return;
    const nextLiked = !optimisticLiked;
    const previousLiked = optimisticLiked;
    const previousCount = optimisticLikesCount;
    setOptimisticLiked(nextLiked);
    setOptimisticLikesCount((count) => Math.max(0, count + (nextLiked ? 1 : -1)));

    const result = nextLiked
      ? await like({ postId, userId: me.id }).unwrap().catch(() => null)
      : await unlike({ postId, userId: me.id }).unwrap().catch(() => null);

    if (!result) {
      setOptimisticLiked(previousLiked);
      setOptimisticLikesCount(previousCount);
    }
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

  const images = mediaPost?.images ?? [];
  const singleImage = images.length === 1 ? images[0] : null;
  const hasMedia = images.length > 0;
  const postPulseShareWidget = useMemo(() => getPulseShareWidgetPayload(post?.widgetsJson), [post?.widgetsJson]);
  const textContent = post?.text || (!hasMedia && mediaPost && mediaPost.id !== post?.id ? mediaPost.text || '' : '');
  const descriptionClassName = [styles.description, !textExpanded ? styles.descriptionCollapsed : ''].filter(Boolean).join(' ');

  useEffect(() => {
    setOptimisticLiked(actualLiked);
    setOptimisticLikesCount(actualLikesCount);
  }, [actualLiked, actualLikesCount, post?.id]);

  useEffect(() => {
    if (!open || textExpanded) return;
    const frame = requestAnimationFrame(() => {
      const node = descriptionRef.current;
      setShowTextToggle(Boolean(node && node.scrollHeight > node.clientHeight + 2));
    });
    return () => cancelAnimationFrame(frame);
  }, [open, postId, textContent, textExpanded, hasMedia]);

  if (!open) return null;

  const sortedComments = sortComments(comments, sortMode);
  const sortLabel = sortMode === 'new' ? 'Сначала новые' : sortMode === 'old' ? 'Сначала старые' : 'Самые интересные';
  const visibleComments = commentsExpanded ? sortedComments : sortedComments.slice(0, 3);
  const showMoreToggle = (!commentsExpanded && (sortedComments.length > 3 || !!nextCursor)) || (commentsExpanded && !!nextCursor);

  const actionRow = (
    <div className={styles.actionRow}>
      <div className={styles.metricGroup}>
        <button className={[styles.metricIconBtn, optimisticLiked ? styles.metricBtnActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike} disabled={!me || liking || unliking}>
          <Icon name="heart" size={18} />
        </button>
        <button className={styles.metricCountBtn} type="button" onClick={() => setLikesOpen(true)}>
          {optimisticLikesCount}
        </button>
      </div>

      <button className={styles.metricBtn} type="button" onClick={() => commentsRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' })}>
        <Icon name="comment" size={18} />
        <span>{post?._count?.comments ?? 0}</span>
      </button>

      <button className={styles.metricBtn} type="button" onClick={() => setShareOpen(true)}>
        <Icon name="forward" size={18} />
        <span>{post?._count?.reposts ?? 0}</span>
      </button>
    </div>
  );

  const commentsSection = (
    <section ref={commentsRef} data-comments-section="1" className={styles.commentsSection}>
      <div className={styles.commentsTopBar}>
        <div className={styles.commentsHeader}>Комментарии</div>
        <div className={styles.sortWrap}>
          <button type="button" className={styles.sortTrigger} onClick={() => setSortOpen((value) => !value)}>
            <span>{sortLabel}</span>
            <Icon name="chevronDown" size={14} />
          </button>
          {sortOpen ? (
            <div className={styles.sortMenu}>
              {[
                ['new', 'Сначала новые'],
                ['old', 'Сначала старые'],
                ['top', 'Самые интересные'],
              ].map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[styles.sortOption, sortMode === value ? styles.sortOptionActive : ''].filter(Boolean).join(' ')}
                  onClick={() => {
                    setSortMode(value as SortMode);
                    setSortOpen(false);
                  }}
                >
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      </div>

      {visibleComments.length ? (
        <div className={styles.commentsList}>
          {visibleComments.map((comment) => (
            <CommentThread
              key={comment.id}
              rootComment={comment}
              postId={postId!}
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
        </div>
      ) : isFetching ? (
        <div className={styles.commentsList}>
          <div className={styles.comment}><Skeleton circle style={{ width: 34, height: 34 }} /><div className={styles.commentBody}><SkeletonText lines={3} /></div></div>
          <div className={styles.comment}><Skeleton circle style={{ width: 34, height: 34 }} /><div className={styles.commentBody}><SkeletonText lines={2} /></div></div>
        </div>
      ) : (
        <div className={styles.emptyComments}>
          <Icon name="comment" size={26} />
          <div>Пока нет комментариев</div>
          <div className={styles.emptyCommentsHint}>Станьте первым, кто начнёт обсуждение.</div>
        </div>
      )}

      {showMoreToggle ? (
        <button
          className={styles.loadMore}
          onClick={() => {
            if (!commentsExpanded) {
              setCommentsExpanded(true);
              if (sortedComments.length <= 3 && nextCursor) setCursor(nextCursor);
              return;
            }
            if (nextCursor) setCursor(nextCursor);
          }}
          disabled={isFetching && commentsExpanded}
        >
          {!commentsExpanded ? 'Показать ещё' : isFetching ? 'Загрузка…' : 'Показать ещё комментарии'}
        </button>
      ) : null}
    </section>
  );

  const composerElement = (
    <CommentComposer
      me={me ? { avatarUrl: me.avatarUrl, username: me.username } : null}
      value={commentText}
      onChange={setCommentText}
      attachments={commentAttachments}
      onAddFiles={(incoming) => {
        const files = Array.isArray(incoming) ? incoming : incoming ? Array.from(incoming) : [];
        if (!files.length) return;
        replaceCommentAttachments((prev) => {
          const available = Math.max(0, 8 - prev.length);
          if (!available) return prev;
          const nextItems = files
            .filter((file) => file.type.startsWith('image/'))
            .slice(0, available)
            .map(createPendingAttachment);
          return nextItems.length ? [...prev, ...nextItems] : prev;
        });
      }}
      onRemoveFile={(index) => replaceCommentAttachments((prev) => {
        const target = prev[index];
        if (target) URL.revokeObjectURL(target.url);
        return prev.filter((_, i) => i !== index);
      })}
      widget={shareWidget}
      widgetLabel={commentWidgetLabel(shareWidget)}
      onOpenSharePicker={() => setSharePickerOpen(true)}
      onClearWidget={() => setShareWidget(null)}
      replyTarget={replyTarget}
      onClearReply={() => setReplyTarget(null)}
      onSend={onSend}
      sending={sending}
    />
  );

  return (
    <>
      <PulseSharePicker open={sharePickerOpen} onClose={() => setSharePickerOpen(false)} onPick={(artifact: ShareArtifact) => setShareWidget(toPulseShareWidgetPayload(artifact))} />
      <div className={styles.backdrop} role="dialog" aria-modal="true" onMouseDown={onClose}>
        <button className={styles.close} onClick={onClose} aria-label="Закрыть">
          <Icon name="close" size={22} />
        </button>

        <div className={[styles.surface, hasMedia ? styles.surfaceWithMedia : ''].filter(Boolean).join(' ')} onMouseDown={(e) => e.stopPropagation()}>
          <div ref={surfaceScrollRef} className={styles.surfaceScroll}>
            {post ? (
              <>
                {hasMedia ? (
                  <div className={[styles.mediaPane, singleImage ? styles.mediaPaneSingle : images.length > 1 ? styles.mediaPaneGallery : ''].filter(Boolean).join(' ')}>
                    {postFetching && !post ? <SkeletonCard className={styles.postSkeleton} /> : null}
                    {images.length ? <ImageGallery images={images} maxHeight={760} rounded={false} fit="contain" adaptive mode="modal" onActiveImageLoad={handleMediaReady} /> : null}
                  </div>
                ) : null}

                <div className={styles.contentPane}>
                {(textContent || post.repostOf || postPulseShareWidget || !hasMedia) ? (
                  <div className={styles.textBlock}>
                    <div className={styles.postMetaRow}>
                      <div className={styles.author}>
                        <Avatar url={post.author.avatarUrl} name={post.author.username} size={42} />
                        <div className={styles.authorText}>
                          <div className={styles.authorNameRow}>
                            <span className={styles.authorName}>{post.author.username}</span>
                            <AdminBadge role={post.author.role} username={post.author.username} />
                          </div>
                          <div className={styles.authorMeta}>{formatAbsoluteDate(post.createdAt)}</div>
                          {post.repostOf ? <div className={styles.repostMeta}>репостнул публикацию</div> : null}
                        </div>
                      </div>

                      {canDeletePost ? (
                        <div className={styles.modalMenuWrap}>
                          <button className={styles.headerToolBtn} type="button" onClick={() => setMenuOpen((value) => !value)} aria-label="Действия с публикацией">
                            <Icon name="dots" size={16} />
                          </button>
                          {menuOpen ? (
                            <div className={styles.modalMenuPopover}>
                              <button type="button" className={styles.modalMenuAction} onClick={() => { setMenuOpen(false); setEditOpen(true); }}>
                                <Icon name="pencil" size={14} />
                                <span>Редактировать</span>
                              </button>
                              <button type="button" className={[styles.modalMenuAction, styles.modalMenuActionDanger].join(' ')} onClick={() => { setMenuOpen(false); setConfirmDeletePostOpen(true); }}>
                                <Icon name="trash" size={14} />
                                <span>Удалить</span>
                              </button>
                            </div>
                          ) : null}
                        </div>
                      ) : null}
                    </div>

                    {textContent ? <div ref={descriptionRef} className={descriptionClassName}>{textContent}</div> : null}
                    {showTextToggle ? (
                      <button type="button" className={styles.moreTextBtnModal} onClick={() => setTextExpanded((value) => !value)}>
                        {textExpanded ? 'Свернуть' : 'Показать ещё'}
                      </button>
                    ) : null}

                    {postPulseShareWidget ? (
                      <PulseShareCard
                        artifactId={String(postPulseShareWidget.artifactId ?? '')}
                        artifact={postPulseShareWidget.artifact ?? null}
                        className={styles.postWidgetCard}
                      />
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
                  </div>
                ) : null}

                {actionRow}
                {commentsSection}
                </div>
              </>
            ) : (
              <div className={styles.modalSkeleton}>
                <SkeletonText lines={3} />
              </div>
            )}
          </div>

          {post ? composerElement : null}
        </div>
      </div>

      {confirmDeletePostOpen ? (
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
      ) : null}

      {commentToDelete ? (
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
      ) : null}

      {shareOpen ? <RepostModal open={shareOpen} onClose={() => setShareOpen(false)} post={post ?? null} /> : null}
      {likesOpen ? <PostLikesModal open={likesOpen} onClose={() => setLikesOpen(false)} postId={post?.id ?? null} /> : null}
      {editOpen ? <EditPostModal open={editOpen} onClose={() => setEditOpen(false)} post={post ?? null} /> : null}
    </>
  );
}
