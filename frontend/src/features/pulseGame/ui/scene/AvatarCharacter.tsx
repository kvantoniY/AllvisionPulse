'use client';

import { useId } from 'react';
import type { AvatarState, SceneScenario } from '../../lib/types';

type Props = {
  avatar: AvatarState;
  scenario: SceneScenario;
};

const SHIRT: Record<SceneScenario, { hi: string; base: string; shadow: string; collar: string; button: string }> = {
  novice: { hi: '#ffbf88', base: '#f28a3a', shadow: '#b75612', collar: '#ffd59f', button: '#7a3a0c' },
  active: { hi: '#ffac5e', base: '#ec7d21', shadow: '#a84f0e', collar: '#ffd29c', button: '#6d3208' },
  tired: { hi: '#a7b5e5', base: '#7a8bc8', shadow: '#4a5c94', collar: '#dde3fb', button: '#2e3d70' },
};

const JEANS: Record<SceneScenario, { hi: string; base: string; shadow: string; stitch: string }> = {
  novice: { hi: '#6382bd', base: '#3f5e9a', shadow: '#253e70', stitch: 'rgba(255, 210, 140, 0.58)' },
  active: { hi: '#5c7ab6', base: '#385590', shadow: '#1f3764', stitch: 'rgba(255, 210, 140, 0.58)' },
  tired: { hi: '#768bc0', base: '#506aa2', shadow: '#2d4276', stitch: 'rgba(255, 210, 140, 0.5)' },
};

const HAIR_MALE = { hi: '#5c3a1f', base: '#3a2312', shadow: '#1d100a' };
const HAIR_FEMALE = { hi: '#70452b', base: '#4a2c18', shadow: '#24130a' };

export function AvatarCharacter({ avatar, scenario }: Props) {
  const uid = useId().replace(/:/g, '');
  const ids = {
    shirt: `a-shirt-${uid}`,
    shirtGloss: `a-gloss-${uid}`,
    jeans: `a-jeans-${uid}`,
    jeansGloss: `a-jeansGloss-${uid}`,
    skin: `a-skin-${uid}`,
    skinSide: `a-skinside-${uid}`,
    hair: `a-hair-${uid}`,
    hairGloss: `a-hairgloss-${uid}`,
    shoes: `a-shoes-${uid}`,
    shoeSole: `a-shoesole-${uid}`,
    scale: `a-scale-${uid}`,
    shadow: `a-dropshadow-${uid}`,
  };

  const shirt = SHIRT[scenario];
  const jeans = JEANS[scenario];
  const hair = avatar.gender === 'female' ? HAIR_FEMALE : HAIR_MALE;

  const eyeOpen = avatar.mood === 'tired' ? 0.55 : 1;
  const mouthPath =
    avatar.mood === 'tired'
      ? 'M74 80 Q80 77 86 80'
      : avatar.mood === 'bright'
        ? 'M73 76 Q80 84 87 76'
        : avatar.mood === 'focused'
          ? 'M74 79 L86 79'
          : 'M74 78 Q80 82 86 78';
  const cheekAlpha = avatar.mood === 'bright' ? 0.7 : avatar.mood === 'tired' ? 0.38 : 0.56;
  const headTilt = avatar.posture === 'slouched' ? -3 : avatar.posture === 'relaxed' ? -1 : 0;
  const bodyLift = avatar.energy === 'rested' ? -1.5 : avatar.energy === 'tired' ? 1.5 : 0;

  return (
    <svg viewBox="0 0 160 240" width="100%" height="100%" aria-hidden="true">
      <defs>
        <filter id={ids.shadow} x="-40%" y="-40%" width="180%" height="180%">
          <feDropShadow dx="0" dy="8" stdDeviation="6" floodColor="#3a1d08" floodOpacity="0.26" />
        </filter>

        <radialGradient id={ids.skin} cx="38%" cy="28%" r="85%">
          <stop offset="0%" stopColor="#ffeeda" />
          <stop offset="60%" stopColor="#ffdcb9" />
          <stop offset="100%" stopColor="#f6c39a" />
        </radialGradient>

        <linearGradient id={ids.skinSide} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffdcb9" stopOpacity="0" />
          <stop offset="100%" stopColor="#d89971" stopOpacity="0.3" />
        </linearGradient>

        <linearGradient id={ids.hair} x1="0" y1="0" x2="0.3" y2="1">
          <stop offset="0%" stopColor={hair.hi} />
          <stop offset="55%" stopColor={hair.base} />
          <stop offset="100%" stopColor={hair.shadow} />
        </linearGradient>

        <linearGradient id={ids.hairGloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.32)" />
          <stop offset="100%" stopColor="rgba(255, 255, 255, 0)" />
        </linearGradient>

        <linearGradient id={ids.shirt} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor={shirt.hi} />
          <stop offset="50%" stopColor={shirt.base} />
          <stop offset="100%" stopColor={shirt.shadow} />
        </linearGradient>

        <linearGradient id={ids.shirtGloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.4)" />
          <stop offset="45%" stopColor="rgba(255, 255, 255, 0)" />
          <stop offset="100%" stopColor="rgba(90, 40, 8, 0.2)" />
        </linearGradient>

        <linearGradient id={ids.jeans} x1="0" y1="0" x2="0.2" y2="1">
          <stop offset="0%" stopColor={jeans.hi} />
          <stop offset="55%" stopColor={jeans.base} />
          <stop offset="100%" stopColor={jeans.shadow} />
        </linearGradient>

        <linearGradient id={ids.jeansGloss} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="rgba(255, 255, 255, 0.2)" />
          <stop offset="55%" stopColor="rgba(255, 255, 255, 0)" />
          <stop offset="100%" stopColor="rgba(10, 20, 40, 0.18)" />
        </linearGradient>

        <linearGradient id={ids.shoes} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffffff" />
          <stop offset="70%" stopColor="#f1ece1" />
          <stop offset="100%" stopColor="#d4cab6" />
        </linearGradient>

        <linearGradient id={ids.shoeSole} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3e2a16" />
          <stop offset="100%" stopColor="#1f1108" />
        </linearGradient>

        <linearGradient id={ids.scale} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f7ede0" />
          <stop offset="100%" stopColor="#c9b28d" />
        </linearGradient>
      </defs>

      <ellipse cx="80" cy="234" rx="48" ry="5" fill="rgba(32, 16, 2, 0.2)" />

      <g>
        <rect x="34" y="214" width="92" height="14" rx="5" fill={`url(#${ids.scale})`} />
        <rect x="34" y="214" width="92" height="2.5" rx="1.2" fill="rgba(255, 255, 255, 0.75)" />
        <rect x="34" y="225.5" width="92" height="2.5" rx="1.2" fill="rgba(80, 48, 18, 0.22)" />
        <rect x="64" y="218" width="32" height="8" rx="2" fill="#ffffff" stroke="rgba(82, 52, 18, 0.28)" strokeWidth="0.8" />
        <path d="M70 222 L74 222 M78 222 L82 222 M86 222 L90 222" stroke="rgba(82, 52, 18, 0.55)" strokeWidth="0.9" strokeLinecap="round" />
      </g>

      <g filter={`url(#${ids.shadow})`} transform={`translate(0 ${bodyLift})`}>
        <path
          d="M58 140 C56 162 54 186 57 208 Q66 213 76 209 C78 188 78 164 77 140 Z"
          fill={`url(#${ids.jeans})`}
        />
        <path
          d="M83 140 C82 164 82 188 84 209 Q94 213 102 208 C105 186 104 162 102 140 Z"
          fill={`url(#${ids.jeans})`}
        />
        <path
          d="M58 140 C56 162 54 186 57 208 Q66 213 76 209 C78 188 78 164 77 140 Z"
          fill={`url(#${ids.jeansGloss})`}
          opacity="0.7"
        />
        <path
          d="M83 140 C82 164 82 188 84 209 Q94 213 102 208 C105 186 104 162 102 140 Z"
          fill={`url(#${ids.jeansGloss})`}
          opacity="0.7"
        />

        <path d="M66 150 Q65 180 65 206" stroke={jeans.stitch} strokeWidth="0.8" strokeDasharray="1.6 1.2" fill="none" />
        <path d="M94 150 Q95 180 95 206" stroke={jeans.stitch} strokeWidth="0.8" strokeDasharray="1.6 1.2" fill="none" />

        <path d="M60 146 Q64 158 74 158" stroke={jeans.stitch} strokeWidth="0.9" fill="none" />
        <path d="M100 146 Q96 158 86 158" stroke={jeans.stitch} strokeWidth="0.9" fill="none" />

        <path d="M54 205 Q66 210 78 207" stroke={jeans.shadow} strokeWidth="1.2" fill="none" opacity="0.45" />
        <path d="M82 207 Q94 210 106 205" stroke={jeans.shadow} strokeWidth="1.2" fill="none" opacity="0.45" />

        <path d="M50 206 Q62 202 76 208 L78 214 Q62 218 50 214 Z" fill={`url(#${ids.shoes})`} stroke="rgba(82, 52, 18, 0.32)" strokeWidth="0.7" />
        <path d="M82 208 Q96 202 110 206 L110 214 Q98 218 82 214 Z" fill={`url(#${ids.shoes})`} stroke="rgba(82, 52, 18, 0.32)" strokeWidth="0.7" />
        <path d="M50 212 Q62 215 78 212 L78 214 Q62 218 50 214 Z" fill={`url(#${ids.shoeSole})`} />
        <path d="M82 212 Q96 215 110 212 L110 214 Q98 218 82 214 Z" fill={`url(#${ids.shoeSole})`} />
        <path d="M60 206 L62 212 M66 205 L66 211 M72 206 L70 211" stroke="#b2a896" strokeWidth="0.9" strokeLinecap="round" />
        <path d="M88 206 L90 211 M94 205 L94 211 M100 206 L98 212" stroke="#b2a896" strokeWidth="0.9" strokeLinecap="round" />

        <path
          d="M50 96 C50 90 56 84 64 84 L96 84 C104 84 110 90 110 96 L113 140 Q108 146 98 146 L62 146 Q52 146 47 140 Z"
          fill={`url(#${ids.shirt})`}
        />
        <path
          d="M50 96 C50 90 56 84 64 84 L96 84 C104 84 110 90 110 96 L113 140 Q108 146 98 146 L62 146 Q52 146 47 140 Z"
          fill={`url(#${ids.shirtGloss})`}
        />
        <path d="M48 142 Q80 148 112 142" stroke="rgba(82, 40, 10, 0.22)" strokeWidth="1.6" fill="none" />

        <path
          d="M50 92 C42 96 36 108 38 122 C38 126 42 127 46 125 L56 122 L58 94 Z"
          fill={`url(#${ids.shirt})`}
        />
        <path
          d="M38 120 Q46 126 58 122"
          stroke={shirt.shadow}
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          opacity="0.5"
        />
        <path
          d="M110 92 C118 96 124 108 122 122 C122 126 118 127 114 125 L104 122 L102 94 Z"
          fill={`url(#${ids.shirt})`}
        />
        <path
          d="M122 120 Q114 126 102 122"
          stroke={shirt.shadow}
          strokeWidth="1.3"
          fill="none"
          strokeLinecap="round"
          opacity="0.5"
        />

        <path
          d="M42 124 C40 136 44 150 48 158 L56 156 Q58 142 54 122 Z"
          fill={`url(#${ids.skin})`}
        />
        <path
          d="M118 124 C120 136 116 150 112 158 L104 156 Q102 142 106 122 Z"
          fill={`url(#${ids.skin})`}
        />

        <ellipse cx="50" cy="162" rx="7.5" ry="8.5" fill={`url(#${ids.skin})`} />
        <ellipse cx="110" cy="162" rx="7.5" ry="8.5" fill={`url(#${ids.skin})`} />

        <path
          d="M66 84 L80 100 L94 84 L92 92 L80 106 L68 92 Z"
          fill={shirt.collar}
          stroke={shirt.shadow}
          strokeWidth="1"
          strokeLinejoin="round"
        />
        <rect x="78.2" y="100" width="3.6" height="20" rx="1" fill={shirt.collar} opacity="0.55" />
        <circle cx="80" cy="106" r="1.3" fill={shirt.button} />
        <circle cx="80" cy="114" r="1.3" fill={shirt.button} />

        <rect x="74" y="80" width="12" height="10" rx="3.5" fill={`url(#${ids.skin})`} />
        <ellipse cx="80" cy="88" rx="10" ry="2.4" fill="rgba(200, 140, 90, 0.28)" />

        <g transform={`rotate(${headTilt} 80 82)`}>
          <ellipse cx="50" cy="58" rx="4.2" ry="6" fill={`url(#${ids.skin})`} />
          <ellipse cx="110" cy="58" rx="4.2" ry="6" fill={`url(#${ids.skin})`} />
          <ellipse cx="50" cy="60" rx="1.8" ry="2.6" fill="rgba(200, 140, 90, 0.35)" />
          <ellipse cx="110" cy="60" rx="1.8" ry="2.6" fill="rgba(200, 140, 90, 0.35)" />

          <path
            d="M52 50 C52 22 64 12 80 12 C96 12 108 22 108 50 C108 68 100 82 80 84 C60 82 52 68 52 50 Z"
            fill={`url(#${ids.skin})`}
          />

          <ellipse cx="80" cy="78" rx="18" ry="6" fill={`url(#${ids.skinSide})`} />

          {avatar.gender === 'female' ? (
            <>
              <path
                d="M50 52 C47 22 62 10 80 10 C98 10 113 22 110 52 L114 94 Q108 102 102 98 L102 60 Q94 82 80 82 Q66 82 58 60 L58 98 Q52 102 46 94 Z"
                fill={`url(#${ids.hair})`}
              />
              <path
                d="M52 46 C50 22 64 10 80 10 C96 10 110 22 108 46 C102 36 92 30 82 30 C72 30 62 36 52 46 Z"
                fill={`url(#${ids.hair})`}
              />
              <path d="M52 54 Q48 72 54 88 Q58 80 56 66 Z" fill={`url(#${ids.hair})`} />
              <path d="M108 54 Q112 72 106 88 Q102 80 104 66 Z" fill={`url(#${ids.hair})`} />
              <ellipse cx="80" cy="22" rx="26" ry="7" fill={`url(#${ids.hairGloss})`} />
              <path d="M64 24 Q76 16 92 20" stroke="rgba(255, 225, 180, 0.32)" strokeWidth="2" fill="none" strokeLinecap="round" />
            </>
          ) : (
            <>
              <path
                d="M52 44 C50 18 62 8 80 8 C98 8 110 18 108 44 C100 32 90 28 80 28 C70 28 60 32 52 44 Z"
                fill={`url(#${ids.hair})`}
              />
              <path
                d="M56 36 C60 24 72 18 86 20 C94 22 98 28 96 38 C88 34 78 34 70 36 C62 38 58 38 56 36 Z"
                fill={`url(#${ids.hair})`}
              />
              <path d="M52 46 Q51 54 52 62 Q55 58 55 46 Z" fill={`url(#${ids.hair})`} />
              <path d="M108 46 Q109 54 108 62 Q105 58 105 46 Z" fill={`url(#${ids.hair})`} />
              <ellipse cx="80" cy="20" rx="24" ry="6" fill={`url(#${ids.hairGloss})`} />
              <path d="M62 22 Q78 14 92 18" stroke="rgba(255, 220, 180, 0.32)" strokeWidth="2" fill="none" strokeLinecap="round" />
            </>
          )}

          <path d="M60 54 Q66 51 74 54" stroke={hair.shadow} strokeWidth="2.4" fill="none" strokeLinecap="round" />
          <path d="M86 54 Q94 51 100 54" stroke={hair.shadow} strokeWidth="2.4" fill="none" strokeLinecap="round" />

          <ellipse cx="67" cy="64" rx="4.2" ry={5.4 * eyeOpen} fill="#ffffff" stroke="rgba(26, 14, 7, 0.22)" strokeWidth="0.55" />
          <ellipse cx="93" cy="64" rx="4.2" ry={5.4 * eyeOpen} fill="#ffffff" stroke="rgba(26, 14, 7, 0.22)" strokeWidth="0.55" />
          <ellipse cx="67" cy="65" rx="3" ry={3.8 * eyeOpen} fill="#3a2312" />
          <ellipse cx="93" cy="65" rx="3" ry={3.8 * eyeOpen} fill="#3a2312" />
          <circle cx="68.2" cy="63.6" r="1.3" fill="#ffffff" />
          <circle cx="94.2" cy="63.6" r="1.3" fill="#ffffff" />
          <circle cx="65.5" cy="66" r="0.7" fill="#ffffff" opacity="0.6" />
          <circle cx="91.5" cy="66" r="0.7" fill="#ffffff" opacity="0.6" />

          <ellipse cx="60" cy="74" rx="5.5" ry="3" fill={`rgba(255, 150, 118, ${cheekAlpha})`} />
          <ellipse cx="100" cy="74" rx="5.5" ry="3" fill={`rgba(255, 150, 118, ${cheekAlpha})`} />

          <ellipse cx="80" cy="72" rx="1.3" ry="1.7" fill="rgba(200, 130, 90, 0.42)" />

          <path
            d={mouthPath}
            stroke="#6a3218"
            strokeWidth={avatar.mood === 'focused' ? 2.2 : 2}
            fill="none"
            strokeLinecap="round"
          />
        </g>
      </g>
    </svg>
  );
}
