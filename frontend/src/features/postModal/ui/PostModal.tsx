'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostModal.module.css';
import { Modal } from '@/shared/ui/Modal/Modal';
import { PostCard } from '@/entities/post/ui/PostCard';
import { StoryRingAvatar } from '@/features/stories';
import { Button } from '@/shared/ui/Button/Button';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useCreateCommentMutation, useDeleteCommentMutation, useGetCommentsQuery, useGetPostQuery } from '@/shared/api/postsApi';
import { formatRelative } from '@/shared/lib/time';
import type { Comment } from '@/shared/types/social';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Skeleton, SkeletonCard, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';

const MAX_TEXT = 5000;

function useAutosize(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [ref, value]);
}

function CommentItem({ c, canDelete, onDelete, deleting }: { c: Comment; canDelete: boolean; onDelete: () => void; deleting?: boolean }) {
  return (
    <div className={styles.comment}>
      <StoryRingAvatar userId={c.author.id} url={c.author.avatarUrl} name={c.author.username} size={36} />
      <div className={styles.commentBody}>
        <div className={styles.commentTop}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600, display: 'flex', alignItems: 'center', gap: 6 }}>{c.author.username}<AdminBadge role={c.author.role} /></div>
            <div className={styles.commentMeta}>{formatRelative(c.createdAt)}</div>
          </div>
          {canDelete ? (
            <Button className={styles.linkBtn} iconOnly size="sm" loading={deleting} type="button" onClick={onDelete} aria-label="Удалить комментарий" title="Удалить комментарий">
              <Icon name="trash" size={14} />
            </Button>
          ) : null}
        </div>
        {c.text ? <div className={styles.commentText}>{c.text}</div> : null}
        {(c.images ?? []).length ? (
          <div className={styles.images}>
            {(c.images ?? []).slice(0, 6).map((img) => (
              <img key={img.id} src={img.url} className={styles.img} alt="" loading="lazy" />
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}

export function PostModal({ postId, open, onClose }: { postId: string | null; open: boolean; onClose: () => void }) {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const { data: postData, isFetching: postFetching } = useGetPostQuery({ postId: postId! }, { skip: !open || !postId });
  const post = postData?.post;

  const [cursor, setCursor] = useState<string | null>(null);
  const { data: commentsData, isFetching } = useGetCommentsQuery({ postId: postId!, take: 30, cursor }, { skip: !open || !postId });
  const comments = commentsData?.items ?? [];
  const nextCursor = (commentsData as any)?.nextCursor ?? null;

  const [commentText, setCommentText] = useState('');
  const ref = useRef<HTMLTextAreaElement | null>(null);
  useAutosize(ref, commentText);

  const [createComment, { isLoading: sending }] = useCreateCommentMutation();
  const [deleteComment, { isLoading: deleting }] = useDeleteCommentMutation();

  useEffect(() => {
    if (!open) return;
    setCommentText('');
    setCursor(null);
  }, [open, postId]);

  const canSend = commentText.trim().length > 0 && commentText.length <= MAX_TEXT && !sending;

  const onSend = async () => {
    if (!postId || !canSend) return;
    await createComment({ postId, text: commentText.trim() }).unwrap().catch(() => null);
    setCommentText('');
  };

  const canDeleteIds = useMemo(() => {
    const set = new Set<string>();
    if (!me) return set;
    for (const c of comments) if (c.authorId === me.id) set.add(c.id);
    return set;
  }, [comments, me]);

  return (
    <Modal open={open} onClose={onClose} title="Публикация" size="lg">
      <div className={styles.wrap}>
        {post ? <PostCard post={post} compact onOpen={() => {}} /> : null}
        {postFetching && !post ? <SkeletonCard className={styles.postSkeleton} /> : null}

        <div className={styles.commentBox}>
          {me ? <StoryRingAvatar userId={me.id} url={me?.avatarUrl} name={me?.username} size={40} /> : <Skeleton circle style={{ width: 40, height: 40 }} />}
          <div style={{ flex: 1, minWidth: 0 }}>
            <textarea
              ref={ref}
              className={styles.textarea}
              value={commentText}
              onChange={(e) => setCommentText(e.target.value.slice(0, MAX_TEXT + 50))}
              placeholder="Написать комментарий…"
              rows={1}
            />
            <div className={styles.commentActions}>
              <div className={styles.commentMeta}>{MAX_TEXT - commentText.length}</div>
              <Button variant="primary" onClick={onSend} disabled={!canSend} loading={sending}>
                Отправить
              </Button>
            </div>
          </div>
        </div>

        {nextCursor ? <Button onClick={() => nextCursor && setCursor(nextCursor)} loading={isFetching}>Показать ещё</Button> : null}

        <div style={{ display: 'grid', gap: 14 }}>
          {comments.map((c) => (
            <CommentItem key={c.id} c={c} canDelete={!!me && (me.role === 'ADMIN' || canDeleteIds.has(c.id))} deleting={deleting} onDelete={() => deleteComment({ commentId: c.id, postId: c.postId }).unwrap().catch(() => null)} />
          ))}
          {isFetching && !comments.length ? (
            <>
              <div className={styles.comment}><Skeleton circle style={{ width: 36, height: 36 }} /><div className={styles.commentBody}><SkeletonText lines={3} /></div></div>
              <div className={styles.comment}><Skeleton circle style={{ width: 36, height: 36 }} /><div className={styles.commentBody}><SkeletonText lines={2} /></div></div>
            </>
          ) : null}
          {!comments.length && !isFetching ? <div style={{ color: 'var(--muted)' }}>Комментариев пока нет.</div> : null}
          {deleting ? <div style={{ color: 'var(--muted)', fontSize: 12 }}>Обновляем список…</div> : null}
        </div>
      </div>
    </Modal>
  );
}
