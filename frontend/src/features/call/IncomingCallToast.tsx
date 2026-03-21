'use client';

import { useEffect, useMemo, useRef } from 'react';
import styles from './callUi.module.css';
import type { Chat } from '@/shared/types/chat';
import { Avatar } from '@/shared/ui/Avatar/Avatar';
import { bindAudioUnlock, startLoopingRing } from '@/shared/lib/audio';

type Props = {
  open: boolean;
  chat?: Chat;
  fromUserId?: string;
  participantIds?: string[];
  onAccept: () => void;
  onDecline: () => void;
};

function getTitle(chat?: Chat, fromUserId?: string) {
  if (!chat) return 'Incoming call';
  if (chat.type === 'GROUP') return chat.title ?? 'Group call';
  const other = chat.members.find((member) => member.userId === fromUserId) ?? chat.members.find((member) => member.userId !== fromUserId);
  return other?.user?.username ?? 'Incoming call';
}

export function IncomingCallToast({ open, chat, fromUserId, participantIds = [], onAccept, onDecline }: Props) {
  const ringRef = useRef<{ stop: () => void } | null>(null);

  useEffect(() => {
    bindAudioUnlock();
    if (!open) {
      ringRef.current?.stop();
      ringRef.current = null;
      return;
    }

    let cancelled = false;
    void startLoopingRing({ frequency: 620, pulseMs: 900, gainValue: 0.05 })
      .then((ring) => {
        if (cancelled) {
          ring.stop();
          return;
        }
        ringRef.current = ring;
      })
      .catch(() => null);

    return () => {
      cancelled = true;
      ringRef.current?.stop();
      ringRef.current = null;
    };
  }, [open]);

  const title = getTitle(chat, fromUserId);
  const avatarUrl = chat?.type === 'GROUP' ? null : chat?.members.find((member) => member.userId === fromUserId)?.user.avatarUrl ?? null;
  const connectedNames = useMemo(
    () =>
      participantIds
        .map((participantId) => chat?.members.find((member) => member.userId === participantId)?.user.username)
        .filter((value): value is string => Boolean(value)),
    [chat, participantIds],
  );

  if (!open) return null;

  return (
    <div className={styles.incomingWrap} role="dialog" aria-modal="true">
      <div className={styles.incomingCard}>
        <div className={styles.incomingLeft}>
          <Avatar url={avatarUrl ?? undefined} name={title} size={48} />
          <div className={styles.incomingMeta}>
            <div className={styles.incomingTitle}>{title}</div>
            <div className={styles.incomingSub}>{chat?.type === 'GROUP' ? 'Group call' : 'Incoming call'}</div>
            {chat?.type === 'GROUP' && connectedNames.length ? (
              <div className={styles.incomingParticipants}>
                {connectedNames.slice(0, 4).map((name) => (
                  <span key={name} className={styles.incomingParticipant}>
                    {name}
                  </span>
                ))}
                {connectedNames.length > 4 ? <span className={styles.incomingMore}>+{connectedNames.length - 4}</span> : null}
              </div>
            ) : null}
          </div>
        </div>

        <div className={styles.incomingActions}>
          <button type="button" className={[styles.ctrlBtn, styles.ctrlAccept].join(' ')} onClick={onAccept} aria-label="accept call">
            Accept
          </button>
          <button type="button" className={[styles.ctrlBtn, styles.ctrlHang].join(' ')} onClick={onDecline} aria-label="decline call">
            Decline
          </button>
        </div>
      </div>
    </div>
  );
}
