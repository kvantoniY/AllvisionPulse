'use client';

import { KeyboardEvent, MouseEvent } from 'react';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useGetStoriesRailQuery } from '@/shared/api/storiesApi';
import { useStoriesUi } from './StoriesContext';
import styles from './Stories.module.css';

export function StoryRingAvatar({
  userId,
  url,
  name,
  size = 38,
  status,
  className,
  disableStoryClick = false,
  showAddBadge = false,
  onClickOverride,
  onAddBadgeClick,
}: {
  userId?: string | null;
  url?: string | null;
  name?: string;
  size?: number;
  status?: 'online' | 'offline' | null;
  className?: string;
  disableStoryClick?: boolean;
  showAddBadge?: boolean;
  onClickOverride?: () => void;
  onAddBadgeClick?: () => void;
}) {
  const { data } = useGetStoriesRailQuery();
  const { openViewer } = useStoriesUi();
  const entry = userId ? (data?.items ?? []).find((item) => item.author.id === userId) : null;
  const hasStories = Boolean(entry?.totalStories);
  const ringClass = !hasStories
    ? styles.ringNone
    : entry?.isOwn
      ? styles.ringOwn
      : entry?.hasUnviewed
        ? styles.ringUnviewed
        : styles.ringViewed;

  const interactive = (!!onClickOverride || (hasStories && !disableStoryClick && !!userId));

  const handleOpen = () => {
    if (onClickOverride) {
      onClickOverride();
      return;
    }
    if (!hasStories || disableStoryClick || !userId) return;
    openViewer(userId);
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLSpanElement>) => {
    if (!interactive) return;
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      handleOpen();
    }
  };


  const handleAddBadgeClick = (event: MouseEvent<HTMLButtonElement>) => {
    event.preventDefault();
    event.stopPropagation();
    onAddBadgeClick?.();
  };

  return (
    <span
      className={[styles.ring, ringClass, interactive ? styles.ringInteractive : '', className ?? ''].filter(Boolean).join(' ')}
      onClick={(event) => {
        if (!interactive) return;
        event.preventDefault();
        event.stopPropagation();
        handleOpen();
      }}
      onKeyDown={handleKeyDown}
      role={interactive ? 'button' : undefined}
      tabIndex={interactive ? 0 : undefined}
      aria-label={interactive ? ((onClickOverride && !hasStories) ? `Добавить сторис ${name ?? ''}`.trim() : `Открыть сторис ${name ?? ''}`.trim()) : undefined}
    >
      <Avatar url={url} name={name} size={size} status={status} />
      {showAddBadge ? (
        <button
          type="button"
          className={styles.addBadge}
          onClick={handleAddBadgeClick}
          aria-label="Добавить сторис"
        >
          <Icon name="plus" size={11} />
        </button>
      ) : null}
    </span>
  );
}
