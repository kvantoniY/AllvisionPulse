'use client';

import { ChangeEvent, useEffect, useMemo, useRef, useState } from 'react';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Icon } from '@/shared/ui/Icon/Icon';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';
import { formatRelative } from '@/shared/lib/time';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import {
  useCreateCommentMutation,
  useGetCommentRepliesQuery,
  useGetCommentsQuery,
} from '@/shared/api/postsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import type { Comment } from '@/shared/types/social';
import styles from './PostCommentsMobileModal.module.css';

const MAX_TEXT = 5000;

type ReplyTarget = {
  commentId: string;
  parentId: string;
  username: string;
};

function CommentItem({
  comment,
  onReply,
}: {
  comment: Comment;
  onReply: (comment: Comment) => void;
}) {
  const lightbox = useLightbox();
  return (
    <div className={styles.comment}>
      <Avatar url={comment.author.avatarUrl} name={comment.author.username} size={42} />
      <div className={styles.commentBody}>
        <div className={styles.commentAuthorRow}>
          <span className={styles.commentAuthor}>{comment.author.username}</span>
          <AdminBadge role={comment.author.role} />
          {comment.parentId && comment.replyToUsername ? <span className={styles.replyTo}>· {comment.replyToUsername}</span> : null}
        </div>
        {comment.text ? <div className={styles.commentText}>{comment.text}</div> : null}
        {(comment.images ?? []).length ? (
          <div className={styles.commentImages}>
            {(comment.images ?? []).map((img, index) => (
              <img
                key={img.id}
                src={img.url}
                alt=""
                className={styles.commentImg}
                onClick={() => lightbox?.openLightbox((comment.images ?? []).map((item) => ({ id: item.id, url: item.url })), index)}
              />
            ))}
          </div>
        ) : null}
        <div className={styles.commentMetaRow}>
          <span>{formatRelative(comment.createdAt)}</span>
          <button type="button" className={styles.commentAction} onClick={() => onReply(comment)}>Ответить</button>
          <span className={styles.commentLikes}><Icon name="heart" size={16} /></span>
        </div>
      </div>
    </div>
  );
}

function CommentThread({ comment, onReply }: { comment: Comment; onReply: (comment: Comment, parentId?: string) => void }) {
  const hasReplies = (comment._count?.replies ?? 0) > 0;
  const { data } = useGetCommentRepliesQuery({ commentId: comment.id }, { skip: !hasReplies });
  const replies = data?.items ?? [];
  const [expanded, setExpanded] = useState(false);
  const visible = expanded ? replies : replies.slice(0, 2);

  return (
    <div className={styles.thread}>
      <CommentItem comment={comment} onReply={(current) => onReply(current, comment.id)} />
      {visible.length ? (
        <div className={styles.replies}>
          {visible.map((reply) => (
            <CommentItem key={reply.id} comment={reply} onReply={(current) => onReply(current, comment.id)} />
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

export function PostCommentsMobileModal({
  open,
  onClose,
  postId,
}: {
  open: boolean;
  onClose: () => void;
  postId: string | null;
}) {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const [cursor, setCursor] = useState<string | null>(null);
  const { data, isFetching } = useGetCommentsQuery({ postId: postId ?? '', take: 20, cursor }, { skip: !open || !postId });
  const comments = data?.items ?? [];
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

  return (
    <MobileSheet open={open} onClose={onClose} title="Комментарии">
      <div className={styles.sheet}>
        <div className={styles.sortRow}>Сначала новые <Icon name="chevronDown" size={16} /></div>

        <div className={styles.list}>
          {comments.map((comment) => (
            <CommentThread
              key={comment.id}
              comment={comment}
              onReply={(target, parentId) =>
                setReplyTarget({
                  commentId: target.id,
                  parentId: parentId ?? target.id,
                  username: target.author.username,
                })
              }
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
              <textarea
                className={styles.textarea}
                placeholder={replyTarget ? 'Написать ответ...' : 'Комментарий'}
                value={text}
                onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT + 50))}
                rows={1}
              />
            </div>
            <button type="button" className={styles.toolBtn} onClick={() => inputRef.current?.click()} aria-label="Добавить изображение">
              <Icon name="image" size={18} />
            </button>
            <button type="button" className={styles.sendBtn} onClick={onSend} disabled={(!text.trim() && !files.length) || isLoading}>
              <Icon name="send" size={19} />
            </button>
            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              multiple
              hidden
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const list = event.target.files;
                if (list) setFiles((prev) => [...prev, ...Array.from(list)].slice(0, 8));
                event.target.value = '';
              }}
            />
          </div>
        </div>
      </div>
    </MobileSheet>
  );
}
