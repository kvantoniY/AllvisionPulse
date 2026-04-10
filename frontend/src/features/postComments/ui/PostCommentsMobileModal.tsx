'use client';

import { ChangeEvent, useEffect, useId, useMemo, useRef, useState } from 'react';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { useCreateCommentMutation, useGetCommentRepliesQuery, useGetCommentsQuery, useGetPostLikesQuery, useLikeCommentMutation, useUnlikeCommentMutation } from '@/shared/api/postsApi';
import { useGetMeQuery } from '@/shared/api/usersApi';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { Icon } from '@/shared/ui/Icon/Icon';
import type { Comment } from '@/shared/types/social';
import styles from './PostCommentsMobileModal.module.css';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { useLightbox } from '@/shared/ui/Lightbox/LightboxProvider';
import { PulseShareCard } from '@/shared/ui/PulseShareCard/PulseShareCard';
import { PulseSharePicker } from '@/shared/ui/PulseSharePicker/PulseSharePicker';
import type { ShareArtifact } from '@/shared/types/programs';
import { toPulseShareWidgetPayload, type PulseShareWidgetPayload } from '@/shared/lib/pulseShare';
import { EmojiPicker } from '@/shared/ui/EmojiPicker';
import { getPulseShareWidgetPayload } from '@/shared/lib/socialWidgets';

const MAX_TEXT = 5000;
type ReplyTarget = { commentId: string; parentId: string; username: string };
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
  const title = typeof snapshot.title === 'string' ? snapshot.title : widget.artifact.title ?? 'Артефакт Pulse';
  return `Виджет Pulse: ${title}`;
}

function sortComments<T extends { createdAt: string; _count?: { likes?: number } }>(items: T[], mode: SortMode) {
  const list = [...items];
  if (mode === 'top') return list.sort((a, b) => (b._count?.likes ?? 0) - (a._count?.likes ?? 0) || +new Date(b.createdAt) - +new Date(a.createdAt));
  if (mode === 'old') return list.sort((a, b) => +new Date(a.createdAt) - +new Date(b.createdAt));
  return list.sort((a, b) => +new Date(b.createdAt) - +new Date(a.createdAt));
}

function useAutosize(ref: React.RefObject<HTMLTextAreaElement>, value: string) {
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = '0px';
    el.style.height = `${Math.min(Math.max(el.scrollHeight, 44), 120)}px`;
  }, [ref, value]);
}

function CommentItem({ comment, postId, parentId, onReply }: { comment: Comment; postId: string; parentId?: string; onReply: (comment: Comment, parentId?: string) => void }) {
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const pulseShareWidget = useMemo(() => getPulseShareWidgetPayload(comment.widgetsJson), [comment.widgetsJson]);
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
          <AdminBadge role={comment.author.role} username={comment.author.username} />
          {comment.parentId && comment.replyToUsername ? <span className={styles.replyTo}>· {comment.replyToUsername}</span> : null}
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

function CommentThread({ comment, postId, onReply }: { comment: Comment; postId: string; onReply: (comment: Comment, parentId?: string) => void }) {
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
  const { data: likesData } = useGetPostLikesQuery({ postId: postId ?? '' }, { skip: !open || !postId });
  const [sortMode, setSortMode] = useState<SortMode>('new');
  const [sortOpen, setSortOpen] = useState(false);
  const comments = useMemo(() => sortComments(data?.items ?? [], sortMode), [data?.items, sortMode]);
  const nextCursor = data?.nextCursor ?? null;
  const [text, setText] = useState('');
  const [attachments, setAttachments] = useState<PendingAttachment[]>([]);
  const [shareWidget, setShareWidget] = useState<PulseShareWidgetPayload | null>(null);
  const [sharePickerOpen, setSharePickerOpen] = useState(false);
  const [replyTarget, setReplyTarget] = useState<ReplyTarget | null>(null);
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [attachMenuOpen, setAttachMenuOpen] = useState(false);
  const [createComment, { isLoading }] = useCreateCommentMutation();
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);
  const fileInputId = useId();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const attachmentsRef = useRef<PendingAttachment[]>([]);
  const attachMenuRef = useRef<HTMLDivElement | null>(null);
  const emojiTriggerRef = useRef<HTMLButtonElement | null>(null);
  useAutosize(textareaRef, text);

  const replaceAttachments = (updater: (prev: PendingAttachment[]) => PendingAttachment[]) => {
    setAttachments((prev) => {
      const next = updater(prev);
      attachmentsRef.current = next;
      return next;
    });
  };

  const clearAttachments = () => {
    setAttachments((prev) => {
      revokePendingAttachments(prev);
      attachmentsRef.current = [];
      return [];
    });
  };

  const handlePickFiles = (incoming: FileList | File[] | null) => {
    const files = Array.isArray(incoming) ? incoming : incoming ? Array.from(incoming) : [];
    if (!files.length) return;
    replaceAttachments((prev) => {
      const available = Math.max(0, 8 - prev.length);
      if (!available) return prev;
      const nextItems = files
        .filter((file) => file.type.startsWith('image/'))
        .slice(0, available)
        .map(createPendingAttachment);
      return nextItems.length ? [...prev, ...nextItems] : prev;
    });
  };

  useEffect(() => {
    if (!open) {
      clearAttachments();
      setShareWidget(null);
      setReplyTarget(null);
      setText('');
      setAttachMenuOpen(false);
      setShowEmojiPicker(false);
      return;
    }
    clearAttachments();
    setShareWidget(null);
    setReplyTarget(null);
    setText('');
    setCursor(null);
    setSortOpen(false);
    setAttachMenuOpen(false);
    setShowEmojiPicker(false);
  }, [open, postId]);

  useEffect(() => {
    if (!attachMenuOpen) return;
    const onPointerDown = (event: MouseEvent) => {
      if (attachMenuRef.current?.contains(event.target as Node)) return;
      setAttachMenuOpen(false);
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [attachMenuOpen]);

  useEffect(() => () => revokePendingAttachments(attachmentsRef.current), []);

  const insertEmoji = (emoji: string) => {
    const textarea = textareaRef.current;
    if (!textarea) {
      setText((prev) => `${prev}${emoji}`.slice(0, MAX_TEXT + 50));
      return;
    }
    const start = textarea.selectionStart ?? text.length;
    const end = textarea.selectionEnd ?? text.length;
    const nextText = `${text.slice(0, start)}${emoji}${text.slice(end)}`;
    setText(nextText.slice(0, MAX_TEXT + 50));
    requestAnimationFrame(() => {
      textarea.focus();
      const nextCaret = start + emoji.length;
      textarea.setSelectionRange(nextCaret, nextCaret);
    });
  };

  const onSend = async () => {
    if (!postId || (!text.trim() && !attachments.length && !shareWidget)) return;
    const widgetsJson = {
      ...(replyTarget ? { replyToUsername: replyTarget.username, replyToCommentId: replyTarget.commentId } : {}),
      ...(shareWidget ?? {}),
    };
    await createComment({
      postId,
      text: text.trim() || undefined,
      images: attachments.map((item) => item.file),
      parentId: replyTarget?.parentId ?? null,
      widgetsJson: Object.keys(widgetsJson).length ? widgetsJson : undefined,
    }).unwrap().catch(() => null);

    setText('');
    clearAttachments();
    setShareWidget(null);
    setReplyTarget(null);
    setShowEmojiPicker(false);
    setAttachMenuOpen(false);
  };

  const sortLabel = sortMode === 'new' ? 'Сначала новые' : sortMode === 'old' ? 'Сначала старые' : 'Самые интересные';
  const likes = likesData?.items ?? [];

  return (
    <MobileSheet open={open} onClose={onClose} title="Комментарии">
      <PulseSharePicker open={sharePickerOpen} onClose={() => setSharePickerOpen(false)} onPick={(artifact: ShareArtifact) => setShareWidget(toPulseShareWidgetPayload(artifact))} />
      <div className={styles.sheet}>
        <div className={styles.sortBar}>
          <div className={styles.headerRow}>
            <button type="button" className={styles.sortTrigger} onClick={() => setSortOpen((value) => !value)}>
              <span>{sortLabel}</span>
              <Icon name="chevronDown" size={16} />
            </button>

            {likes.length ? (
              <div className={styles.likesSummary}>
                <span className={styles.likesLabel}>Оценили:</span>
                <div className={styles.likesPeople}>
                  {likes.slice(0, 8).map((item) => (
                    <div key={item.id} className={styles.likeChip}>
                      <Avatar url={item.avatarUrl} name={item.username} size={20} />
                      <span>{item.username}</span>
                    </div>
                  ))}
                </div>
              </div>
            ) : null}
          </div>

          {sortOpen ? (
            <div className={styles.sortMenu}>
              {([
                ['new', 'Сначала новые'],
                ['old', 'Сначала старые'],
                ['top', 'Самые интересные'],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  className={[styles.sortOption, sortMode === value ? styles.sortOptionActive : ''].filter(Boolean).join(' ')}
                  onClick={() => {
                    setSortMode(value);
                    setSortOpen(false);
                  }}
                >
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
            <div className={styles.empty}>Пока комментариев нет</div>
          ) : null}

          {nextCursor ? (
            <button type="button" className={styles.moreBtn} onClick={() => setCursor(nextCursor)}>
              Показать ещё комментарии
            </button>
          ) : null}
        </div>

        <div className={styles.composerWrap}>
          {attachments.length ? (
            <div className={styles.previewStrip}>
              {attachments.map((attachment) => (
                <div key={attachment.id} className={styles.previewItem}>
                  <img src={attachment.url} alt="" />
                  <button
                    type="button"
                    className={styles.previewRemove}
                    onClick={() => replaceAttachments((prev) => {
                      const removed = prev.find((item) => item.id === attachment.id);
                      if (removed) URL.revokeObjectURL(removed.url);
                      return prev.filter((item) => item.id !== attachment.id);
                    })}
                  >
                    <Icon name="close" size={12} />
                  </button>
                </div>
              ))}
            </div>
          ) : null}

          {replyTarget ? (
            <div className={styles.replyChip}>
              <span>Ответ пользователю {replyTarget.username}</span>
              <button type="button" onClick={() => setReplyTarget(null)}><Icon name="close" size={12} /></button>
            </div>
          ) : null}

          {shareWidget ? (
            <div className={styles.replyChip}>
              <span>{commentWidgetLabel(shareWidget)}</span>
              <button type="button" onClick={() => setShareWidget(null)}><Icon name="close" size={12} /></button>
            </div>
          ) : null}

          <div className={styles.composer}>
            {me ? <Avatar url={me.avatarUrl} name={me.username} size={34} /> : <Skeleton circle style={{ width: 34, height: 34 }} />}
            <div className={styles.inputShell}>
              <textarea ref={textareaRef} className={styles.textarea} placeholder={replyTarget ? 'Написать ответ...' : 'Написать комментарий...'} value={text} onChange={(event) => setText(event.target.value.slice(0, MAX_TEXT + 50))} rows={1} />
            </div>
            <div className={styles.attachWrap} ref={attachMenuRef}>
              <button
                type="button"
                className={[styles.toolBtn, attachMenuOpen ? styles.toolBtnActive : ''].filter(Boolean).join(' ')}
                aria-label="Прикрепить"
                onClick={() => {
                  setShowEmojiPicker(false);
                  setAttachMenuOpen((value) => !value);
                }}
              >
                <Icon name="paperclip" size={18} />
              </button>
              {attachMenuOpen ? (
                <div className={styles.attachMenu}>
                  <button
                    type="button"
                    className={styles.attachMenuItem}
                    onClick={() => {
                      const input = fileInputRef.current;
                      if (!input) return;
                      input.value = '';
                      input.click();
                      setAttachMenuOpen(false);
                    }}
                  >
                    <Icon name="image" size={16} />
                    <span>Фото</span>
                  </button>
                  <button
                    type="button"
                    className={styles.attachMenuItem}
                    onClick={() => {
                      setAttachMenuOpen(false);
                      setSharePickerOpen(true);
                    }}
                  >
                    <Icon name="paperclip" size={16} />
                    <span>Виджет Pulse</span>
                  </button>
                </div>
              ) : null}
            </div>
            <button
              ref={emojiTriggerRef}
              type="button"
              className={[styles.toolBtn, showEmojiPicker ? styles.toolBtnActive : ''].filter(Boolean).join(' ')}
              aria-label="Эмодзи"
              onClick={() => {
                setAttachMenuOpen(false);
                setShowEmojiPicker((value) => !value);
              }}
            >
              <Icon name="smile" size={18} />
            </button>
            <button type="button" className={styles.sendBtn} onClick={onSend} disabled={(!text.trim() && !attachments.length && !shareWidget) || isLoading}><Icon name="send" size={19} /></button>
            <input
              ref={fileInputRef}
              id={fileInputId}
              className={styles.fileInput}
              type="file"
              accept="image/*"
              multiple
              onChange={(event: ChangeEvent<HTMLInputElement>) => {
                const files = event.target.files ? Array.from(event.target.files) : [];
                handlePickFiles(files);
                event.target.value = '';
              }}
            />
          </div>
        </div>

        {showEmojiPicker ? (
          <EmojiPicker
            triggerRef={emojiTriggerRef}
            autoFocusSearch={false}
            onSelect={(emoji) => {
              insertEmoji(emoji);
              setShowEmojiPicker(false);
            }}
            onClose={() => setShowEmojiPicker(false)}
          />
        ) : null}
      </div>
    </MobileSheet>
  );
}
