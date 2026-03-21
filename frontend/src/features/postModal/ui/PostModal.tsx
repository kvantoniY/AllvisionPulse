'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './PostModal.module.css';
import { Modal } from '@/shared/ui/Modal/Modal';
import { PostCard } from '@/entities/post/ui/PostCard';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Button } from '@/shared/ui/Button/Button';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { useCreateCommentMutation, useDeleteCommentMutation, useGetCommentsQuery, useGetPostQuery } from '@/shared/api/postsApi';
import { formatRelative } from '@/shared/lib/time';
import type { Comment } from '@/shared/types/social';

const MAX_TEXT = 5000;

function useAutosize(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(el.scrollHeight, 180)}px`;
  }, [ref, value]);
}

function CommentItem({ c, canDelete, onDelete }: { c: Comment; canDelete: boolean; onDelete: () => void }) {
  return (
    <div className={styles.comment}>
      <Avatar url={c.author.avatarUrl} name={c.author.username} size={34} />
      <div className={styles.commentBody}>
        <div className={styles.commentTop}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontWeight: 600 }}>{c.author.username}</div>
            <div className={styles.commentMeta}>{formatRelative(c.createdAt)}</div>
          </div>
          <div className={styles.commentActions}>
            {canDelete ? (
              <button className={styles.linkBtn} type="button" onClick={onDelete}>
                Delete
              </button>
            ) : null}
          </div>
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

  const { data: postData } = useGetPostQuery({ postId: postId! }, { skip: !open || !postId });
  const post = postData?.post;

  const [cursor, setCursor] = useState<string | null>(null);
  const { data: commentsData, isFetching } = useGetCommentsQuery(
    { postId: postId!, take: 30, cursor },
    { skip: !open || !postId },
  );

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
    <Modal open={open} onClose={onClose} title="Post">
      <div className={styles.wrap}>
        {post ? <PostCard post={post} compact onOpen={() => {}} /> : null}

        <div className={styles.commentBox}>
          <Avatar url={me?.avatarUrl} name={me?.username ?? 'me'} size={34} />
          <div style={{ flex: 1, minWidth: 0, display: 'grid', gap: 8 }}>
            <textarea
              ref={ref}
              className={styles.commentInput}
              placeholder="Write a comment…"
              value={commentText}
              onChange={(e) => setCommentText(e.target.value.slice(0, MAX_TEXT + 50))}
            />
            <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10, alignItems: 'center' }}>
              <div style={{ opacity: 0.6, fontSize: 12 }}>{MAX_TEXT - commentText.length}</div>
              <Button variant="primary" disabled={!canSend} onClick={onSend}>
                {sending ? 'Sending…' : 'Comment'}
              </Button>
            </div>
          </div>
        </div>

        {nextCursor ? (
          <button
            className={styles.loadMore}
            type="button"
            disabled={isFetching}
            onClick={() => {
              if (!postId || !nextCursor) return;
              setCursor(nextCursor);
            }}
          >
            {isFetching ? 'Loading…' : 'Load more'}
          </button>
        ) : null}

        <div style={{ display: 'grid', gap: 12 }}>
          {comments.map((c) => (
            <CommentItem
              key={c.id}
              c={c}
              canDelete={!!me && (me.role === 'ADMIN' || canDeleteIds.has(c.id))}
              onDelete={() =>
                deleteComment({ commentId: c.id, postId: c.postId }).unwrap().catch(() => null)
              }
            />
          ))}
          {isFetching ? <div style={{ opacity: 0.7 }}>Loading…</div> : null}
          {!comments.length && !isFetching ? <div style={{ opacity: 0.7 }}>No comments yet.</div> : null}
          {deleting ? <div style={{ opacity: 0.6, fontSize: 12 }}>Updating…</div> : null}
        </div>
      </div>
    </Modal>
  );
}
