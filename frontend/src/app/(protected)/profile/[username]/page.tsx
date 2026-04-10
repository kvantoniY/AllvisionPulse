'use client';

import { useEffect, useMemo, useRef, useState, type ChangeEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { useParams, useRouter } from 'next/navigation';
import styles from '../Profile.module.css';
import { useGetMeQuery, useGetUserByUsernameQuery, useGetUserConnectionsQuery, useUpdateProfileMutation } from '@/shared/api/usersApi';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { ProfileStoriesPanel, StoryRingAvatar, useStoriesUi } from '@/features/stories';
import { useGetUserStoriesQuery } from '@/shared/api/storiesApi';
import { Button } from '@/shared/ui/Button/Button';
import {
  useAcceptFriendRequestMutation,
  useBlockUserMutation,
  useDeclineFriendRequestMutation,
  useRemoveFriendMutation,
  useSendFriendRequestMutation,
  useUnblockUserMutation,
} from '@/shared/api/friendsApi';
import { StartChatModal } from '@/features/startChat/ui/StartChatModal';
import { useCreateDirectChatMutation } from '@/shared/api/chatsApi';
import { useGetUserPostsQuery, useLazyGetUserPostsQuery } from '@/shared/api/postsApi';
import { PostCard } from '@/entities/post/ui/PostCard';
import { PostComposer } from '@/features/postComposer/ui/PostComposer';
import { ProfileAchievementsSection } from '@/features/programs/ui/ProfileAchievementsSection';
import { PostModal } from '@/features/postModal/ui/PostModal';
import { useIntersection } from '@/shared/lib/hooks/useIntersection';
import { useAppSelector } from '@/shared/lib/storeHooks';
import { ROUTES } from '@/shared/config/app';
import { Icon } from '@/shared/ui/Icon/Icon';
import { Skeleton, SkeletonText } from '@/shared/ui/Skeleton/Skeleton';
import { Modal } from '@/shared/ui/Modal/Modal';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';
import { useDeleteUserAsAdminMutation, useSuspendUserMutation, useUnsuspendUserMutation } from '@/shared/api/adminApi';

function ConnectionList({
  tab,
  username,
  open,
}: {
  tab: 'followers' | 'following';
  username: string;
  open: boolean;
}) {
  const { data, isLoading } = useGetUserConnectionsQuery({ username, tab }, { skip: !open });
  const items = data?.items ?? [];

  return (
    <div className={styles.connectionModalBody}>
      {isLoading ? (
        <div style={{ display: 'grid', gap: 12 }}>
          <SkeletonText lines={2} />
          <SkeletonText lines={2} />
        </div>
      ) : null}
      {!isLoading && data?.canView === false ? <div className={styles.connectionEmpty}>Список скрыт настройками приватности или недоступен из-за чёрного списка.</div> : null}
      {!isLoading && data?.canView !== false && !items.length ? <div className={styles.connectionEmpty}>Здесь пока пусто.</div> : null}
      {!isLoading && data?.canView !== false ? items.map((record: any) => {
        const user = tab === 'followers' ? record.sender : record.receiver;
        if (!user) return null;
        const userFullName = [user.firstName, user.lastName].filter((value: string | null | undefined) => Boolean(value?.trim())).join(' ');
        return (
          <div key={record.id} className={styles.connectionRow}>
            <div className={styles.connectionUser}>
              <StoryRingAvatar userId={user.id} url={user.avatarUrl} name={user.username} size={42} />
              <div className={styles.connectionMeta}>
                <div className={styles.connectionName} style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  {user.username}
                  <AdminBadge role={user.role} username={user.username} />
                </div>
                <div className={styles.connectionHandle}>{userFullName || `@${user.username}`}</div>
              </div>
            </div>
          </div>
        );
      }) : null}
    </div>
  );
}
type AvatarCropSource = { file: File; url: string; mode: 'quick' | 'draft' };

type AvatarCropOffset = { x: number; y: number };

const AVATAR_CROP_STAGE = 280;
const AVATAR_CROP_FRAME_RATIO = 0.86;
const AVATAR_CROP_FRAME_SIZE = AVATAR_CROP_STAGE * AVATAR_CROP_FRAME_RATIO;
const AVATAR_EXPORT_SIZE = 640;
const AVATAR_MAX_ZOOM = 3;

function clampAvatarCropOffset(offset: AvatarCropOffset, renderedWidth: number, renderedHeight: number, stageSize: number): AvatarCropOffset {
  const maxOffsetX = Math.max(0, (renderedWidth - stageSize) / 2);
  const maxOffsetY = Math.max(0, (renderedHeight - stageSize) / 2);
  return {
    x: Math.min(maxOffsetX, Math.max(-maxOffsetX, offset.x)),
    y: Math.min(maxOffsetY, Math.max(-maxOffsetY, offset.y)),
  };
}

async function buildAvatarCropFile({
  sourceUrl,
  originalFile,
  naturalWidth,
  naturalHeight,
  zoom,
  offset,
}: {
  sourceUrl: string;
  originalFile: File;
  naturalWidth: number;
  naturalHeight: number;
  zoom: number;
  offset: AvatarCropOffset;
}): Promise<File> {
  const image = await new Promise<HTMLImageElement>((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error('Не удалось загрузить изображение для кадрирования'));
    img.src = sourceUrl;
  });

  const canvas = document.createElement('canvas');
  canvas.width = AVATAR_EXPORT_SIZE;
  canvas.height = AVATAR_EXPORT_SIZE;

  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas недоступен');

  const baseScale = Math.max(AVATAR_EXPORT_SIZE / naturalWidth, AVATAR_EXPORT_SIZE / naturalHeight);
  const drawWidth = naturalWidth * baseScale * zoom;
  const drawHeight = naturalHeight * baseScale * zoom;
  const translateFactor = AVATAR_EXPORT_SIZE / AVATAR_CROP_FRAME_SIZE;
  const centerX = AVATAR_EXPORT_SIZE / 2 + offset.x * translateFactor;
  const centerY = AVATAR_EXPORT_SIZE / 2 + offset.y * translateFactor;

  context.clearRect(0, 0, canvas.width, canvas.height);
  context.imageSmoothingEnabled = true;
  context.imageSmoothingQuality = 'high';
  context.drawImage(image, centerX - drawWidth / 2, centerY - drawHeight / 2, drawWidth, drawHeight);

  const outputType = ['image/png', 'image/webp'].includes(originalFile.type) ? originalFile.type : 'image/jpeg';
  const extension = outputType === 'image/png' ? 'png' : outputType === 'image/webp' ? 'webp' : 'jpg';
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, outputType, 0.92));
  if (!blob) throw new Error('Не удалось сохранить кадр аватара');

  const baseName = originalFile.name.replace(/\.[^.]+$/, '') || 'avatar';
  return new File([blob], `${baseName}-avatar.${extension}`, {
    type: outputType,
    lastModified: Date.now(),
  });
}

function AvatarCropModal({
  open,
  source,
  onClose,
  onApply,
}: {
  open: boolean;
  source: AvatarCropSource | null;
  onClose: () => void;
  onApply: (file: File) => Promise<void> | void;
}) {
  const [zoom, setZoom] = useState(1);
  const [offset, setOffset] = useState<AvatarCropOffset>({ x: 0, y: 0 });
  const [natural, setNatural] = useState({ width: 0, height: 0 });
  const [applying, setApplying] = useState(false);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    if (!open || !source) return;
    setZoom(1);
    setOffset({ x: 0, y: 0 });
    setNatural({ width: 0, height: 0 });
  }, [open, source?.url]);

  const geometry = useMemo(() => {
    if (!natural.width || !natural.height) {
      return {
        renderedWidth: AVATAR_CROP_FRAME_SIZE,
        renderedHeight: AVATAR_CROP_FRAME_SIZE,
      };
    }
    const baseScale = Math.max(AVATAR_CROP_FRAME_SIZE / natural.width, AVATAR_CROP_FRAME_SIZE / natural.height);
    return {
      renderedWidth: natural.width * baseScale * zoom,
      renderedHeight: natural.height * baseScale * zoom,
    };
  }, [natural.height, natural.width, zoom]);

  useEffect(() => {
    setOffset((prev) => clampAvatarCropOffset(prev, geometry.renderedWidth, geometry.renderedHeight, AVATAR_CROP_FRAME_SIZE));
  }, [geometry.renderedHeight, geometry.renderedWidth]);

  const handlePointerDown = (event: ReactPointerEvent<HTMLDivElement>) => {
    if (!natural.width || !natural.height || applying) return;
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: offset.x,
      originY: offset.y,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  };

  const handlePointerMove = (event: ReactPointerEvent<HTMLDivElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    const next = clampAvatarCropOffset(
      {
        x: drag.originX + (event.clientX - drag.startX),
        y: drag.originY + (event.clientY - drag.startY),
      },
      geometry.renderedWidth,
      geometry.renderedHeight,
      AVATAR_CROP_FRAME_SIZE,
    );
    setOffset(next);
  };

  const clearDrag = (event?: ReactPointerEvent<HTMLDivElement>) => {
    if (event && dragRef.current?.pointerId === event.pointerId && event.currentTarget.hasPointerCapture(event.pointerId)) {
      event.currentTarget.releasePointerCapture(event.pointerId);
    }
    dragRef.current = null;
  };

  const handleApply = async () => {
    if (!source || !natural.width || !natural.height || applying) return;
    setApplying(true);
    try {
      const file = await buildAvatarCropFile({
        sourceUrl: source.url,
        originalFile: source.file,
        naturalWidth: natural.width,
        naturalHeight: natural.height,
        zoom,
        offset,
      });
      await onApply(file);
    } finally {
      setApplying(false);
    }
  };

  return (
    <Modal open={open} onClose={() => !applying && onClose()} title="Обрезка аватара" size="md">
      <div className={styles.cropModalBody}>
        <div className={styles.cropHint}>Перетащите фото и настройте масштаб — в аватар попадёт только область внутри круга.</div>
        <div className={styles.cropStageWrap}>
          <div
            className={styles.cropStage}
            onPointerDown={handlePointerDown}
            onPointerMove={handlePointerMove}
            onPointerUp={clearDrag}
            onPointerCancel={clearDrag}
          >
            {source ? (
              <img
                src={source.url}
                alt="Подготовка аватара"
                className={styles.cropImage}
                draggable={false}
                onLoad={(event) => {
                  const target = event.currentTarget;
                  setNatural({ width: target.naturalWidth, height: target.naturalHeight });
                }}
                style={{
                  width: geometry.renderedWidth,
                  height: geometry.renderedHeight,
                  left: '50%',
                  top: '50%',
                  transform: `translate(calc(-50% + ${offset.x}px), calc(-50% + ${offset.y}px))`,
                }}
              />
            ) : null}
            <div className={styles.cropShadow} />
            <div className={styles.cropFrame} />
          </div>
        </div>
        <label className={styles.cropControl}>
          <span className={styles.editFieldLabel}>Масштаб</span>
          <input
            type="range"
            min="1"
            max={String(AVATAR_MAX_ZOOM)}
            step="0.01"
            value={zoom}
            onChange={(event) => setZoom(Number(event.target.value))}
          />
        </label>
        <div className={styles.cropActionsRow}>
          <Button onClick={() => { setZoom(1); setOffset({ x: 0, y: 0 }); }} disabled={applying}>Сбросить</Button>
          <div className={styles.editActions}>
            <Button onClick={onClose} disabled={applying}>Отмена</Button>
            <Button variant="primary" onClick={handleApply} loading={applying} disabled={!natural.width || !natural.height}>Применить</Button>
          </div>
        </div>
      </div>
    </Modal>
  );
}

export default function ProfilePage() {
  const { username } = useParams<{ username: string }>();
  const router = useRouter();
  const { openViewer } = useStoriesUi();
  const { data: meData } = useGetMeQuery();
  const me = meData?.user;
  const { data, isLoading, isError, refetch: refetchUser } = useGetUserByUsernameQuery(username);
  const user = data?.user;
  const relationship = data?.relationship;
  const isSelf = Boolean(me && user && me.id === user.id);
  const presence = useAppSelector((s) => s.presence.byUserId);
  const p = user?.id ? presence[user.id] : undefined;
  const canViewProfile = Boolean(isSelf || relationship?.canViewProfile);
  const canMessage = Boolean(isSelf || relationship?.canMessage);
  const isBlocked = Boolean(relationship?.isBlocked);
  const isAdmin = me?.role === 'ADMIN';
  const canModerateUser = Boolean(isAdmin && user && me && user.id !== me.id);
  const isUserSuspended = Boolean(user?.suspendedPermanent || (user?.suspendedUntil && new Date(user.suspendedUntil).getTime() > Date.now()));
  const { data: liveStoriesData } = useGetUserStoriesQuery({ userId: user?.id ?? '' }, { skip: !user?.id, refetchOnFocus: true, refetchOnReconnect: true });

  const { data: userPostsData, isFetching: feedFetching } = useGetUserPostsQuery({ username }, { skip: !canViewProfile });
  const [fetchUserPostsPage] = useLazyGetUserPostsQuery();
  const feedItems = userPostsData?.items ?? [];
  const feedNextCursor = userPostsData?.nextCursor ?? null;

  const [chatStartOpen, setChatStartOpen] = useState(false);
  const [chatStartId, setChatStartId] = useState<string | null>(null);
  const [createDirectChat, { isLoading: creatingChat }] = useCreateDirectChatMutation();
  const [sendFollow, { isLoading: sendingFollow }] = useSendFriendRequestMutation();
  const [acceptFollow, { isLoading: accepting }] = useAcceptFriendRequestMutation();
  const [declineFollow, { isLoading: declining }] = useDeclineFriendRequestMutation();
  const [unfollow, { isLoading: removing }] = useRemoveFriendMutation();
  const [blockUser, { isLoading: blocking }] = useBlockUserMutation();
  const [unblockUser, { isLoading: unblocking }] = useUnblockUserMutation();
  const [updateProfile, { isLoading: savingProfile }] = useUpdateProfileMutation();
  const [openPostId, setOpenPostId] = useState<string | null>(null);
  const [connectionsOpen, setConnectionsOpen] = useState<'followers' | 'following' | null>(null);
  const [actionsOpen, setActionsOpen] = useState(false);
  const [profileEditOpen, setProfileEditOpen] = useState(false);
  const [avatarMenuOpen, setAvatarMenuOpen] = useState(false);
  const [avatarViewerOpen, setAvatarViewerOpen] = useState(false);
  const [bio, setBio] = useState('');
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [avatarDraftFile, setAvatarDraftFile] = useState<File | null>(null);
  const [avatarDraftUrl, setAvatarDraftUrl] = useState<string | null>(null);
  const [avatarCropSource, setAvatarCropSource] = useState<AvatarCropSource | null>(null);
  const [adminReason, setAdminReason] = useState('');
  const [suspendUser, { isLoading: suspendingUser }] = useSuspendUserMutation();
  const [unsuspendUser, { isLoading: unsuspendingUser }] = useUnsuspendUserMutation();
  const [deleteUserAsAdmin, { isLoading: deletingUserAsAdmin }] = useDeleteUserAsAdminMutation();

  const avatarMenuRef = useRef<HTMLDivElement | null>(null);
  const quickAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const modalAvatarInputRef = useRef<HTMLInputElement | null>(null);
  const sentinelRef = useRef<HTMLDivElement | null>(null);
  const inView = useIntersection(sentinelRef, { rootMargin: '220px 0px' });

  const fullName = useMemo(() => [user?.firstName?.trim(), user?.lastName?.trim()].filter(Boolean).join(' '), [user?.firstName, user?.lastName]);
  const profileSubtitle = fullName || `@${user?.username ?? ''}`;
  const hasLiveStory = Boolean(liveStoriesData?.items?.length);
  const avatarStatus = p?.isOnline ? 'online' : 'offline';
  const avatarPreviewSrc = avatarDraftUrl || user?.avatarUrl || null;

  useEffect(() => {
    if (typeof user?.bio === 'string') setBio(user.bio);
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setAvatarDraftFile(null);
    setAvatarDraftUrl(null);
  }, [user?.bio, user?.firstName, user?.lastName, user?.avatarUrl, user?.id]);

  useEffect(() => {
    if (!avatarDraftUrl) return;
    return () => {
      URL.revokeObjectURL(avatarDraftUrl);
    };
  }, [avatarDraftUrl]);

  useEffect(() => {
    if (!avatarCropSource?.url) return;
    return () => {
      URL.revokeObjectURL(avatarCropSource.url);
    };
  }, [avatarCropSource?.url]);

  useEffect(() => {
    if (!avatarMenuOpen) return;
    const handleOutside = (event: MouseEvent | TouchEvent) => {
      if (!avatarMenuRef.current?.contains(event.target as Node)) setAvatarMenuOpen(false);
    };
    document.addEventListener('mousedown', handleOutside);
    document.addEventListener('touchstart', handleOutside, { passive: true });
    return () => {
      document.removeEventListener('mousedown', handleOutside);
      document.removeEventListener('touchstart', handleOutside);
    };
  }, [avatarMenuOpen]);

  useEffect(() => {
    if (!inView || !feedNextCursor || !canViewProfile) return;
    fetchUserPostsPage({ username, cursor: feedNextCursor, take: 20 }).catch(() => null);
  }, [canViewProfile, feedNextCursor, fetchUserPostsPage, inView, username]);

  const userPosts = useMemo(() => {
    if (!canViewProfile) return [];
    return feedItems;
  }, [canViewProfile, feedItems]);

  const resetProfileDraft = () => {
    if (avatarDraftUrl) URL.revokeObjectURL(avatarDraftUrl);
    setBio(user?.bio ?? '');
    setFirstName(user?.firstName ?? '');
    setLastName(user?.lastName ?? '');
    setAvatarDraftFile(null);
    setAvatarDraftUrl(null);
  };

  const applyProfileUpdate = async (payload: { bio?: string | null; firstName?: string | null; lastName?: string | null; avatar?: File | null; avatarUrl?: string | null }) => {
    await updateProfile(payload).unwrap().catch(() => null);
    await refetchUser();
  };

  const onSubmitProfile = async () => {
    await applyProfileUpdate({
      bio: bio.trim() ? bio : null,
      firstName: firstName.trim() ? firstName.trim() : null,
      lastName: lastName.trim() ? lastName.trim() : null,
      avatar: avatarDraftFile,
    });
    setProfileEditOpen(false);
    setAvatarDraftFile(null);
    setAvatarDraftUrl(null);
  };

  const openAvatarCrop = (file: File, mode: 'quick' | 'draft') => {
    setAvatarCropSource((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return {
        file,
        mode,
        url: URL.createObjectURL(file),
      };
    });
  };

  const openQuickAvatarPicker = () => {
    if (!quickAvatarInputRef.current) return;
    quickAvatarInputRef.current.value = '';
    quickAvatarInputRef.current.click();
  };

  const handleQuickAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = '';
    if (!file) return;
    setAvatarMenuOpen(false);
    openAvatarCrop(file, 'quick');
  };

  const openModalAvatarPicker = () => {
    if (!modalAvatarInputRef.current) return;
    modalAvatarInputRef.current.value = '';
    modalAvatarInputRef.current.click();
  };

  const handleModalAvatarChange = (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0] ?? null;
    event.target.value = '';
    if (!file) return;
    openAvatarCrop(file, 'draft');
  };

  const closeAvatarCrop = () => {
    setAvatarCropSource((prev) => {
      if (prev?.url) URL.revokeObjectURL(prev.url);
      return null;
    });
  };

  const handleAvatarCropApply = async (file: File) => {
    if (!avatarCropSource) return;
    if (avatarCropSource.mode === 'quick') {
      await applyProfileUpdate({ avatar: file });
    } else {
      if (avatarDraftUrl) URL.revokeObjectURL(avatarDraftUrl);
      setAvatarDraftFile(file);
      setAvatarDraftUrl(URL.createObjectURL(file));
    }
    closeAvatarCrop();
  };

  const startMessage = async () => {
    if (!user?.id || !canMessage) return;
    const res = await createDirectChat({ userId: user.id }).unwrap().catch(() => null);
    const cid = res?.chat?.id;
    if (!cid) return;
    setChatStartId(cid);
    setChatStartOpen(true);
  };

  const handlePrimaryFollowAction = async () => {
    if (!user || isSelf || isBlocked) return;

    if (relationship?.incomingRequest && relationship.userToViewer?.id) {
      await acceptFollow({ friendshipId: relationship.userToViewer.id }).unwrap().catch(() => null);
      refetchUser();
      return;
    }

    if (relationship?.isFollowing || relationship?.outgoingRequest) {
      await unfollow({ userId: user.id }).unwrap().catch(() => null);
      refetchUser();
      return;
    }

    await sendFollow({ userId: user.id }).unwrap().catch(() => null);
    refetchUser();
  };

  const primaryAction = useMemo(() => {
    if (isSelf) return { label: 'Редактировать профиль', tone: 'primary' as const, loading: false, disabled: false };
    if (relationship?.blockedByMe) return { label: 'В чёрном списке', tone: 'muted' as const, loading: false, disabled: true };
    if (relationship?.blockedMe) return { label: 'Доступ ограничен', tone: 'muted' as const, loading: false, disabled: true };
    if (relationship?.incomingRequest) return { label: 'Принять запрос', tone: 'primary' as const, loading: accepting, disabled: false };
    if (relationship?.isFollowing) return { label: 'Отписаться', tone: 'soft' as const, loading: removing, disabled: false };
    if (relationship?.outgoingRequest) return { label: 'Отменить запрос', tone: 'soft' as const, loading: removing, disabled: false };
    return { label: relationship?.followsYou ? 'Подписаться в ответ' : 'Подписаться', tone: 'primary' as const, loading: sendingFollow, disabled: false };
  }, [accepting, isSelf, relationship, removing, sendingFollow]);

  const handleAdminSuspend = async (payload: { durationDays?: number | null; permanent?: boolean }) => {
    if (!user?.id || !canModerateUser) return;
    await suspendUser({ userId: user.id, reason: adminReason.trim() || null, ...payload }).unwrap().catch(() => null);
    await refetchUser();
  };

  const handleAdminDelete = async () => {
    if (!user?.id || !canModerateUser) return;
    const ok = window.confirm(`Удалить аккаунт @${user.username} без возможности восстановления?`);
    if (!ok) return;
    await deleteUserAsAdmin({ userId: user.id }).unwrap().catch(() => null);
    router.replace('/feed');
  };

  const restrictionMessage = relationship?.blockedMe
    ? 'Пользователь добавил вас в чёрный список. Публикации, подписки и общение скрыты.'
    : relationship?.blockedByMe
      ? 'Вы добавили пользователя в чёрный список. Публикации и общение скрыты, пока пользователь находится в ЧС.'
      : 'Профиль скрыт настройками приватности. Чтобы увидеть подробности, нужно быть подтверждённым подписчиком.';

  if (isLoading) {
    return (
      <div className={["container", "appPage", styles.page].join(' ')}>
        <Card className={styles.noticeCard}>
          <CardHeader title="Профиль" />
          <div style={{ display: 'grid', gap: 16 }}><div style={{ display: 'flex', gap: 14, alignItems: 'center' }}><Skeleton circle style={{ width: 74, height: 74 }} /><div style={{ flex: 1 }}><SkeletonText lines={3} /></div></div><SkeletonText lines={3} /></div>
        </Card>
      </div>
    );
  }

  if (isError || !user) {
    return (
      <div className={["container", "appPage", styles.page].join(' ')}>
        <Card className={styles.noticeCard}>
          <CardHeader title="Профиль недоступен" />
          <CardMuted>Пользователь скрыт, заблокирован администрацией или не существует.</CardMuted>
        </Card>
      </div>
    );
  }

  return (
    <div className={["container", "appPage", styles.page].join(' ')}>
      <PostModal postId={openPostId} open={!!openPostId} onClose={() => setOpenPostId(null)} onOpenPost={setOpenPostId} />
      <StartChatModal open={chatStartOpen} chatId={chatStartId} title="Новое сообщение" onClose={() => setChatStartOpen(false)} onSent={(cid) => router.push(`/messages/${cid}`)} />
      <AvatarCropModal open={Boolean(avatarCropSource)} source={avatarCropSource} onClose={closeAvatarCrop} onApply={handleAvatarCropApply} />
      <Modal open={actionsOpen} onClose={() => setActionsOpen(false)} title="Действия с профилем">
        <div className={styles.profileActionsModal}>
          {relationship?.blockedByMe ? (
            <Button onClick={() => unblockUser({ userId: user.id }).unwrap().then(refetchUser).finally(() => setActionsOpen(false)).catch(() => null)} loading={unblocking}>Убрать из чёрного списка</Button>
          ) : (
            <Button onClick={() => blockUser({ userId: user.id }).unwrap().then(refetchUser).finally(() => setActionsOpen(false)).catch(() => null)} loading={blocking}>Добавить в чёрный список</Button>
          )}
          {canModerateUser ? (
            <div className={styles.adminPanel}>
              <div className={styles.adminPanelTitle}>Админ-действия</div>
              <div className={styles.adminPanelHint}>Эти действия работают через серверные проверки роли из БД. Старые токены не дадут обхода доступа.</div>
              <textarea
                className={styles.textarea}
                value={adminReason}
                onChange={(event) => setAdminReason(event.target.value.slice(0, 500))}
                rows={3}
                placeholder="Причина блокировки (необязательно)"
              />
              <div className={styles.adminActionGrid}>
                <Button onClick={() => handleAdminSuspend({ durationDays: 1 })} loading={suspendingUser}>Заблокировать на 1 день</Button>
                <Button onClick={() => handleAdminSuspend({ durationDays: 7 })} loading={suspendingUser}>На 7 дней</Button>
                <Button onClick={() => handleAdminSuspend({ durationDays: 30 })} loading={suspendingUser}>На 30 дней</Button>
                <Button variant="primary" onClick={() => handleAdminSuspend({ permanent: true })} loading={suspendingUser}>Бессрочно</Button>
                <Button onClick={() => user?.id && unsuspendUser({ userId: user.id }).unwrap().then(refetchUser).catch(() => null)} loading={unsuspendingUser} disabled={!isUserSuspended}>Снять блокировку</Button>
                <Button onClick={handleAdminDelete} loading={deletingUserAsAdmin}>Удалить аккаунт</Button>
              </div>
            </div>
          ) : null}
          {relationship?.incomingRequest && relationship.userToViewer?.id ? (
            <Button onClick={() => declineFollow({ friendshipId: relationship.userToViewer!.id }).unwrap().then(refetchUser).finally(() => setActionsOpen(false)).catch(() => null)} loading={declining}>Отклонить запрос</Button>
          ) : null}
        </div>
      </Modal>
      <Modal open={connectionsOpen !== null} onClose={() => setConnectionsOpen(null)} title={connectionsOpen === 'followers' ? 'Подписчики' : 'Подписки'}>
        {connectionsOpen ? <ConnectionList tab={connectionsOpen} username={user.username} open={Boolean(connectionsOpen)} /> : null}
      </Modal>
      <Modal open={profileEditOpen} onClose={() => { resetProfileDraft(); setProfileEditOpen(false); }} title="Редактирование профиля">
        <div className={styles.editBody}>
          <div className={styles.avatarEditorRow}>
            <div className={styles.avatarEditorPreviewWrap}>
              <StoryRingAvatar userId={user.id} url={avatarPreviewSrc} name={user.username} size={74} status={avatarStatus} disableStoryClick />
            </div>
            <div className={styles.avatarEditorMeta}>
              <div className={styles.editFieldLabel}>Фото профиля</div>
              <div className={styles.editFieldHint}>Можно загрузить новое фото и сразу посмотреть, как оно будет выглядеть в профиле.</div>
              <div className={styles.avatarEditorActions}>
                <Button onClick={openModalAvatarPicker}><Icon name="image" size={16} />Сменить аватар</Button>
                {user.avatarUrl ? (
                  <Button variant="ghost" onClick={() => setAvatarViewerOpen(true)}><Icon name="play" size={14} />Открыть фото</Button>
                ) : null}
              </div>
            </div>
          </div>
          <div className={styles.editGrid}>
            <label className={styles.editField}>
              <span className={styles.editFieldLabel}>Имя</span>
              <input className={styles.input} value={firstName} onChange={(event) => setFirstName(event.target.value.slice(0, 60))} placeholder="Имя" />
            </label>
            <label className={styles.editField}>
              <span className={styles.editFieldLabel}>Фамилия</span>
              <input className={styles.input} value={lastName} onChange={(event) => setLastName(event.target.value.slice(0, 60))} placeholder="Фамилия" />
            </label>
          </div>
          <label className={styles.editField}>
            <span className={styles.editFieldLabel}>Описание профиля</span>
            <textarea className={styles.textarea} value={bio} onChange={(e) => setBio(e.target.value.slice(0, 280))} rows={4} placeholder="Расскажите немного о себе" />
          </label>
          <div className={styles.editActions}>
            <Button variant="primary" onClick={onSubmitProfile} loading={savingProfile}>Сохранить</Button>
            <Button onClick={() => { resetProfileDraft(); setProfileEditOpen(false); }}>Отмена</Button>
          </div>
          <input ref={modalAvatarInputRef} type="file" accept="image/*" hidden onChange={handleModalAvatarChange} />
        </div>
      </Modal>
      <Modal open={avatarViewerOpen} onClose={() => setAvatarViewerOpen(false)} title="Фото профиля" size="md">
        <div className={styles.avatarViewer}>
          {user.avatarUrl ? <img src={user.avatarUrl} alt={`Фото профиля ${user.username}`} className={styles.avatarViewerImage} /> : <CardMuted>Фото профиля пока не загружено.</CardMuted>}
        </div>
      </Modal>
      <input ref={quickAvatarInputRef} type="file" accept="image/*" hidden onChange={handleQuickAvatarChange} />

      <div className={styles.stack}>
        <section className={styles.hero}>
          <div className={styles.header}>
            <div className={styles.user}>
              <div className={styles.avatarMenuAnchor} ref={avatarMenuRef}>
                <div className={styles.avatarButton} role="button" tabIndex={0} aria-haspopup="menu" aria-expanded={avatarMenuOpen} onClick={() => setAvatarMenuOpen((prev) => !prev)} onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); setAvatarMenuOpen((prev) => !prev); } }}>
                  <span className={styles.avatarSlot}>
                    <StoryRingAvatar userId={user.id} url={user.avatarUrl} name={user.username} size={74} status={avatarStatus} disableStoryClick />
                  </span>
                </div>
                {avatarMenuOpen ? (
                  <div className={styles.avatarMenu} role="menu">
                    {hasLiveStory ? (
                      <button
                        type="button"
                        className={styles.avatarMenuItem}
                        onClick={() => {
                          setAvatarMenuOpen(false);
                          openViewer(user.id, liveStoriesData?.items?.[0]?.id ?? null);
                        }}
                      >
                        <Icon name="play" size={15} />
                        <span>Открыть историю</span>
                      </button>
                    ) : null}
                    {isSelf ? (
                      <button type="button" className={styles.avatarMenuItem} onClick={openQuickAvatarPicker}>
                        <Icon name="pencil" size={15} />
                        <span>Редактировать аватар</span>
                      </button>
                    ) : null}
                    <button type="button" className={styles.avatarMenuItem} onClick={() => { setAvatarMenuOpen(false); setAvatarViewerOpen(true); }} disabled={!user.avatarUrl}>
                      <Icon name="image" size={15} />
                      <span>Открыть фото</span>
                    </button>
                  </div>
                ) : null}
              </div>
              <div className={styles.identity}>
                <div className={styles.nameRow}>
                  <div className={styles.name}>{user.username}</div>
                  <AdminBadge role={user.role} username={user.username} />
                  {isUserSuspended ? <span className={styles.suspendedChip}>{user.suspendedPermanent ? 'Заблокирован бессрочно' : `Заблокирован до ${new Date(user.suspendedUntil as string).toLocaleDateString('ru-RU')}`}</span> : null}
                </div>
                <div className={styles.handle}>{profileSubtitle}</div>
                <div className={styles.bio}>{canViewProfile ? (user.bio ?? 'Пока без описания.') : restrictionMessage}</div>
              </div>
              <div className={styles.counts}>
                <button type="button" className={styles.countItem} onClick={() => setConnectionsOpen('followers')} disabled={!canViewProfile && !isSelf}>
                  <div className={styles.countValue}>{user.followersCount ?? 0}</div>
                  <div className={styles.countLabel}>Подписчики</div>
                </button>
                <button type="button" className={styles.countItem} onClick={() => setConnectionsOpen('following')} disabled={!canViewProfile && !isSelf}>
                  <div className={styles.countValue}>{user.followingCount ?? 0}</div>
                  <div className={styles.countLabel}>Подписки</div>
                </button>
                <div className={styles.countItem}>
                  <div className={styles.countValue}>{user.postsCount ?? 0}</div>
                  <div className={styles.countLabel}>Посты</div>
                </div>
              </div>
            </div>
            <div className={[styles.actions, isSelf ? styles.selfActions : styles.peerActions].join(' ')}>
              {isSelf ? (
                <>
                  <Button variant="primary" onClick={() => { resetProfileDraft(); setProfileEditOpen(true); }}>
                  <Icon name="pencil" size={16} />
                  Редактировать
                  </Button>
                  <Button onClick={() => router.push(ROUTES.app.pro)}>
                    <Icon name="pulse" size={16} />
                    Пульс Про
                  </Button>
                </>
              ) : (
                <>
                  <Button
                    variant={primaryAction.tone === 'primary' ? 'primary' : 'default'}
                    onClick={handlePrimaryFollowAction}
                    loading={primaryAction.loading}
                    disabled={primaryAction.disabled}
                  >
                    {primaryAction.label}
                  </Button>
                  <Button onClick={startMessage} loading={creatingChat} disabled={!canMessage || isBlocked}>Сообщение</Button>
                  <Button iconOnly type="button" aria-label="Ещё" onClick={() => setActionsOpen(true)}>
                    <Icon name="dots" size={16} />
                  </Button>
                </>
              )}
            </div>
          </div>
          {canViewProfile || isSelf ? (
            <div className={styles.heroStories}>
              <ProfileStoriesPanel userId={user.id} isSelf={Boolean(isSelf)} embedded />
            </div>
          ) : null}
        </section>

        {!canViewProfile ? (
          <Card className={styles.sectionCard}>
            <CardHeader title={relationship?.blockedMe ? 'Вы в чёрном списке' : relationship?.blockedByMe ? 'Пользователь в вашем чёрном списке' : 'Профиль ограничен'} />
            <CardMuted>{restrictionMessage}</CardMuted>
          </Card>
        ) : (
          <>
            <ProfileAchievementsSection username={user.username} />
            <div className={styles.sectionHeader}>
              <div className={styles.sectionTitle}>Публикации</div>
            </div>
            {isSelf ? <div className={styles.composerWrap}><PostComposer context="profile" surface="flat" /></div> : null}
            {userPosts.length ? (
              <div className={styles.postsList}>
                {userPosts.map((post) => <PostCard key={post.id} post={post} onOpenPost={setOpenPostId} surface="flat" />)}
              </div>
            ) : (
              <Card className={styles.sectionCard}>{feedFetching ? <div style={{ display: 'grid', gap: 12 }}><SkeletonText lines={3} /><Skeleton style={{ width: '100%', aspectRatio: '16 / 10' }} /></div> : <CardMuted>Пока нет публикаций.</CardMuted>}</Card>
            )}
            <div ref={sentinelRef} style={{ height: 1 }} />
          </>
        )}
      </div>
    </div>
  );
}

