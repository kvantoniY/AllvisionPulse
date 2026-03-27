'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { useCreateCommentMutation, useGetCommentRepliesQuery, useGetCommentsQuery, useLikeCommentMutation, useUnlikeCommentMutation } from '@/shared/api/postsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Icon } from '@/shared/ui/Icon/Icon';
import type { Comment } from '@/shared/types/social';
import styles from './PostCommentsMobileModal.module.css';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';

const MAX_TEXT = 5000;
type ReplyTarget = { commentId: string; parentId: string; username: string };
type SortMode = 'new' | 'old' | 'top';

function sortComments<T extends { createdAt: string; _count?: { likes?: number } }>(items: T[], mode: SortMode) {
  const list = [...items];
  if (mode === 'top') return list.sort((a, b) => (b._count?.likes ?? 0) - (a._count?.likes ?? 0) || +new Date(b.createdAt) - +new Date(a.createdAt));
  if (mode === 'old') return list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function CommentItem({ comment, postId, parentId, onReply }: { comment: Comment; postId: string; parentId?: string; onReply: (comment: Comment, parentId?: string) => void }) {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const liked = !!me && (comment.likes ?? []).some((like) => like.userId === me.id);
  const [likeComment] = useLikeCommentMutation();
  const [unlikeComment] = useUnlikeCommentMutation();
  const lightbox = useLightbox();

  const onToggleLike = async () => {
    if (!me) return;
    if (liked) await unlikeComment({ commentId: comment.id, postId, parentId, userId: me.id }).unwrap().catch(() => null);
    else await likeComment({ commentId: comment.id, postId, parentId, userId: me.id }).unwrap().catch(() => null);
  };

  return (
    <div className={styles.comment}>
      <Avatar url={comment.author.avatarUrl} name={comment.author.username} size={40} />
      <div className={styles.commentBody}>
        <div className={styles.commentAuthorRow}>
          <span className={styles.commentAuthor}>{comment.author.username}</span>
          <AdminBadge role={comment.author.role} />
          {comment.parentId && comment.replyToUsername ? <span className={styles.replyTo}>· {comment.replyToUsername}</span> : null}
        </div>
        {comment.text ? <div className={styles.commentText}>{comment.text}</div> : null}
        {(comment.images ?? []).length ? (
          <div className={styles.commentImages}>
            {(comment.images ?? []).map((image, index) => (
              <img key={image.id} src={image.url} alt="" className={styles.commentImg} onClick={() => lightbox?.openLightbox((comment.images ?? []).map((item) => ({ id: item.id, url: item.url })), index)} />
            ))}
          </div>
        ) : null}
        <div className={styles.commentMetaRow}>
          <span>{new Date(comment.createdAt).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })}</span>
          <button type="button" className={styles.commentAction} onClick={() => onReply(comment, parentId ?? comment.id)}>Ответить</button>
          <button type="button" className={[styles.commentLikeBtn, liked ? styles.commentLikeBtnActive : ''].filter(Boolean).join(' ')} onClick={onToggleLike}>
            <Icon name="heart" size={16} />
            <span>{comment._count?.likes ?? 0}</span>
          </button>
        </div>
      </div>
    </div>
  );
}

function CommentThread({ comment, postId, sortMode, onReply }: { comment: Comment; postId: string; sortMode: SortMode; onReply: (comment: Comment, parentId?: string) => void }) {
  const hasReplies = (comment._count?.replies ?? 0) > 0;
  const { data } = useGetCommentRepliesQuery({ commentId: comment.id }, { skip: !hasReplies });
  const replies = useMemo(() => sortComments(data?.items ?? [], 'new'), [data?.items]);
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? replies : replies.slice(0, 2);

  return (
    <div className={styles.thread}>
      <CommentItem comment={comment} postId={postId} onReply={(current) => onReply(current, comment.id)} />
      {visible.length ? (
        <div className={styles.replies}>
          {visible.map((reply) => (
            <CommentItem key={reply.id} comment={reply} postId={postId} parentId={comment.id} onReply={(current) => onReply(current, comment.id)} />
          ))}
        </div>
      ) : null}
      {!expanded && replies.length > visible.length ? (
        <button type="button" className={styles.moreBtn} onClick={() => setExpanded(true)}>
          Показать ещё ответы ({replies.length - visible.length})
        </button>
      ) : null}
    </div>
  );
}

export function PostCommentsMobileModal({ open, onClose, postId }: { open: boolean; onClose: () => void; postId: string | null }) {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, isFetching } = useGetCommentsQuery({ postId: postId ?? '', take: 20, cursor }, { skip: !open || !postId });
  const [sortMode, setSortMode] = useState<SortMode>('new');
  const [sortOpen, setSortOpen] = useState(false);
  const comments = useMemo(() => sortComments(data?.items ?? [], sortMode), [data?.items, sortMode]);
  const nextCursor = data?.nextCursor ?? null;
  const [text, setText] = useState('');
  const [files, setFiles] = useState<File[]>([]);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [createComment, { isLoading }] = useCreateCommentMutation();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const previews = useMemo(() => files.map((file) => URL.createObjectURL(file)), [files]);

  useEffect(() => {
    if (!open) return;
    setCursor(null);
  }, [open, postId]);

  useEffect(() => () => previews.forEach((url) => URL.revokeObjectURL(url)), [previews]);

  const onSend = async () => {
    if (!postId || (!text.trim() && !files.length)) return;
    await createComment({
      postId,
      text: text.trim() || undefined,
      images: files,
      parentId: replyTarget?.parentId ?? null,
      widgetsJson: replyTarget ? { replyToUsername: replyTarget.username, replyToCommentId: replyTarget.commentId } : undefined,
    }).unwrap().catch(() => null);
    setText('');
    setFiles([]);
    setReplyTarget(null);
  };

  const sortLabel = sortMode === 'new' ? 'Сначала новые' : sortMode === 'old' ? 'Сначала старые' : 'Самые интересные';

  return (
    <MobileSheet open={open} onClose={onClose} title="Комментарии">
      <div className={styles.sheet}>
        <div className={styles.sortBar}>
          <button type="button" className={styles.sortTrigger} onClick={() => setSortOpen((v) => !v)}>
            <span>{sortLabel}</span>
            <Icon name="chevronDown" size={16} />
          </button>
          {sortOpen ? (
            <div className={styles.sortMenu}>
              {[
                ['new', 'Сначала новые'],
                ['old', 'Сначала старые'],
                ['top', 'Самые интересные'],
              ].map(([value, label]) => (
                <button key={value} type="button" className={[styles.sortOption, sortMode === value ? styles.sortOptionActive : ''].filter(Boolean).join(' ')} onClick={() => { setSortMode(value as SortMode); setSortOpen(false); }}>
                  {label}
                </button>
              ))}
            </div>
          ) : null}
        </div>

        <div className={styles.list}>
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              postId={postId ?? ''}
              sortMode={sortMode}
              onReply={(target, parentId) => setReplyTarget({ commentId: target.id, parentId: parentId ?? target.id, username: target.author.username })}
            />
          ))}

          {isFetching && !comments.length ? (
            <>
              <div className={styles.comment}><Skeleton circle style={{ width: 42, height: 42 }} /><div className={styles.commentBody}><SkeletonText lines={3} /></div></div>
              <div className={styles.comment}><Skeleton circle style={{ width: 42, height: 42 }} /><div className={styles.commentBody}><SkeletonText lines={2} /></div></div>
            </>
          ) : null}

          {!comments.length && !isFetching ? (
            <div className={styles.empty}>Пока нет комментариев</div>
          ) : null}

          {nextCursor ? (
            <button type="button" className={styles.moreBtn} onClick={() => setCursor(nextCursor)}>
              Показать ещё комментарии
            </button>
          ) : null}
        </div>

        <div className={styles.composerWrap}>
          {previews.length ? (
            <div className={styles.previewStrip}>
              {previews.map((preview, index) => (
                <div key={`${preview}:${index}`} className={styles.previewItem}>
                  <img src={preview} alt="" />
                  <button type="button" className={styles.previewRemove} onClick={() => setFiles((prev) => prev.filter((_, i) => i !== index))}>
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}
          {replyTarget ? (
            <div className={styles.replyChip}>ответ {replyTarget.username}<button type="button" onClick={() => setReplyTarget(null)}><Icon name="close" size={12} /></button></div>
          ) : null}
          <div className={styles.composer}>
            {me ? <Avatar url={me.avatarUrl} name={me.username} size={34} /> : <Skeleton circle style={{ width: 34, height: 34 }} />}
            <div className={styles.inputShell}>
              <textarea className={styles.textarea} placeholder={replyTarget ? 'Написать ответ...' : 'Комментарий'} value={text} onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT + 50))} rows={1} />
            </div>
            <button type="button" className={styles.toolBtn} onClick={() => inputRef.current?.click()} aria-label="Добавить изображение"><Icon name="image" size={18} /></button>
            <button type="button" className={styles.sendBtn} onClick={onSend} disabled={(!text.trim() && !files.length) || isLoading}><Icon name="send" size={19} /></button>
            <input ref={inputRef} type="file" accept="image/*" multiple hidden onChange={(event: ChangeEvent<HTMLInputElement>) => { const list = event.target.files; if (list) setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 8)); event.target.value = ''; }} />
          </div>
        </div>
      </div>
    </MobileSheet>
  );
}
