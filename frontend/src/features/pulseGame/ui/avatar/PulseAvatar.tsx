'use client';

import dynamic from 'next/dynamic';
import type { CSSProperties } from 'react';
import type { PulseAvatarAppearance } from '../../lib/avatarAppearance';

const AvataaarsAvatar = dynamic(() => import('avataaars'), { ssr: false });

type Props = {
  appearance: PulseAvatarAppearance;
  className?: string;
  style?: CSSProperties;
};

export function PulseAvatar({ appearance, className, style }: Props) {
  return (
    <AvataaarsAvatar
      {...appearance}
      className={className}
      style={style}
      viewBox="0 0 264 280"
    />
  );
}
