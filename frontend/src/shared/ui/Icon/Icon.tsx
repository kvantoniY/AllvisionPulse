import type { ReactNode, SVGProps } from 'react';

type IconName =
  | 'home'
  | 'pulse'
  | 'users'
  | 'game'
  | 'messages'
  | 'user'
  | 'settings'
  | 'shield'
  | 'support'
  | 'logout'
  | 'bell'
  | 'search'
  | 'image'
  | 'sparkles'
  | 'heart'
  | 'comment'
  | 'repeat'
  | 'close'
  | 'plus'
  | 'arrowLeft'
  | 'arrowDown'
  | 'arrowUp'
  | 'phone'
  | 'phoneOff'
  | 'video'
  | 'mic'
  | 'micOff'
  | 'send'
  | 'refresh'
  | 'trash'
  | 'pencil'
  | 'check'
  | 'checkDouble'
  | 'play'
  | 'reply'
  | 'forward'
  | 'dots'
  | 'chevronDown'
  | 'chevronUp'
  | 'chevronLeft'
  | 'chevronRight'
  | 'select'
  | 'clock'
  | 'menu'
  | 'paperclip';

const line = { fill: 'none', stroke: 'currentColor', strokeWidth: '1.8', strokeLinecap: 'round', strokeLinejoin: 'round' } as const;

const paths: Record<IconName, ReactNode> = {
  home: <path d="M4 10.5 12 4l8 6.5V20a1 1 0 0 1-1 1h-4.5v-5h-5v5H5a1 1 0 0 1-1-1v-9.5Z" {...line} />,
  pulse: <><path d="M4 12h3l1.8-3.2L11.8 16l2.4-4H20" {...line} /><path d="M5.5 5.5a4.5 4.5 0 0 1 6.36 0L12 5.64l.14-.14a4.5 4.5 0 0 1 6.36 6.36L12 18.36l-6.5-6.5a4.5 4.5 0 0 1 0-6.36Z" {...line} /></>,
  users: <><path d="M8 11a3.5 3.5 0 1 0 0-7 3.5 3.5 0 0 0 0 7Z" {...line}/><path d="M16.5 12.5a3 3 0 1 0 0-6 3 3 0 0 0 0 6Z" {...line}/><path d="M2.5 19a5.5 5.5 0 0 1 11 0" {...line}/><path d="M13.5 19a4.5 4.5 0 0 1 8 0" {...line}/></>,
  game: <path d="M8 7h8m-4-3v6M7 14h.01M17 14h.01M7 18h10a4 4 0 0 0 3.87-5l-.7-3.15A4 4 0 0 0 16.27 7H7.73A4 4 0 0 0 3.83 9.85L3.13 13A4 4 0 0 0 7 18Z" {...line} />,
  messages: <path d="M6 17.5 3 20V6a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v9.5a2 2 0 0 1-2 2H6Z" {...line} />,
  user: <><path d="M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Z" {...line}/><path d="M4 20a8 8 0 0 1 16 0" {...line}/></>,
  settings: <path d="M12 8.5a3.5 3.5 0 1 0 0 7 3.5 3.5 0 0 0 0-7Zm8 3.5-.9-.52a7.93 7.93 0 0 0-.47-1.12l.52-.9a1 1 0 0 0-.13-1.22l-1.48-1.48a1 1 0 0 0-1.22-.13l-.9.52c-.36-.18-.73-.34-1.12-.47L14 4a1 1 0 0 0-.99-1h-2.02a1 1 0 0 0-.99 1l-.12 1.03c-.39.13-.76.29-1.12.47l-.9-.52a1 1 0 0 0-1.22.13L5.17 6.59a1 1 0 0 0-.13 1.22l.52.9c-.18.36-.34.73-.47 1.12L4 10.99a1 1 0 0 0-1 1v2.02a1 1 0 0 0 1 .99l1.03.12c.13.39.29.76.47 1.12l-.52.9a1 1 0 0 0 .13 1.22l1.48 1.48a1 1 0 0 0 1.22.13l.9-.52c.36.18.73.34 1.12.47L10.99 20a1 1 0 0 0 .99 1h2.02a1 1 0 0 0 .99-1l.12-1.03c.39-.13.76-.29 1.12-.47l.9.52a1 1 0 0 0 1.22-.13l1.48-1.48a1 1 0 0 0 .13-1.22l-.52-.9c.18-.36.34-.73.47-1.12L20 13.01a1 1 0 0 0 1-.99v-2.02a1 1 0 0 0-1-.99Z" fill="none" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" strokeLinejoin="round" />,
  shield: <><path d="M12 3 19 6v5c0 5-3.4 8.6-7 10-3.6-1.4-7-5-7-10V6l7-3Z" {...line}/><path d="M8.5 12.5 11 15l4.5-5" {...line}/></>,
  support: <><circle cx="12" cy="12" r="8" {...line}/><path d="M9.5 9a2.5 2.5 0 1 1 4.33 1.67c-.73.75-1.58 1.3-1.58 2.33" {...line}/><circle cx="12" cy="17" r=".9" fill="currentColor"/></>,
  logout: <><path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" {...line}/><path d="M10 12h11M17 8l4 4-4 4" {...line}/></>,
  bell: <><path d="M6 9a6 6 0 1 1 12 0c0 4 1.5 5.5 2 6H4c.5-.5 2-2 2-6Z" {...line}/><path d="M10 18a2 2 0 0 0 4 0" {...line}/></>,
  search: <><circle cx="11" cy="11" r="6.5" {...line}/><path d="m16 16 4.5 4.5" {...line}/></>,
  image: <><rect x="3.5" y="5" width="17" height="14" rx="3" {...line}/><path d="m7 15 3.2-3.2a1 1 0 0 1 1.42 0L15 15l1.8-1.8a1 1 0 0 1 1.4 0L20.5 15" {...line}/><circle cx="8.5" cy="9.2" r="1.2" fill="currentColor"/></>,
  sparkles: <><path d="M12 3 13.8 8.2 19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" {...line}/><path d="m19 3 .8 2.2L22 6l-2.2.8L19 9l-.8-2.2L16 6l2.2-.8L19 3ZM5 15l.8 2.2L8 18l-2.2.8L5 21l-.8-2.2L2 18l2.2-.8L5 15Z" {...line}/></>,
  heart: <path d="M12 20.5 4.8 13.3a4.9 4.9 0 0 1 0-6.93 4.9 4.9 0 0 1 6.93 0L12 6.64l.27-.27a4.9 4.9 0 0 1 6.93 6.93L12 20.5Z" {...line} />,
  comment: <path d="M5 18.5 3.5 20V6a2.5 2.5 0 0 1 2.5-2.5h12A2.5 2.5 0 0 1 20.5 6v9A2.5 2.5 0 0 1 18 17.5H5Z" {...line} />,
  repeat: <><path d="M8 7h8l-2.6-2.6" {...line} /><path d="M16 7l-2.6 2.6" {...line} /><path d="M16 17H8l2.6 2.6" {...line} /><path d="M8 17l2.6-2.6" {...line} /><path d="M18.5 9.5v2a3.5 3.5 0 0 1-3.5 3.5H8" {...line} /><path d="M5.5 14.5v-2A3.5 3.5 0 0 1 9 9h7" {...line} /></>,
  close: <path d="M6 6 18 18M18 6 6 18" {...line} />,
  plus: <path d="M12 5v14M5 12h14" {...line} />,
  arrowLeft: <path d="M15 18 9 12l6-6M9 12h10" {...line} />,
  arrowDown: <path d="M12 5v14M6 13l6 6 6-6" {...line} />,
  arrowUp: <path d="M12 19V5M18 11l-6-6-6 6" {...line} />,
  phone: <path d="M6.62 10.79a15.05 15.05 0 0 0 6.59 6.59l2.2-2.2a1 1 0 0 1 1.02-.24c1.12.3 2.3.46 3.57.46a1 1 0 0 1 1 1V20a2 2 0 0 1-2 2C9.4 22 2 14.6 2 5a2 2 0 0 1 2-2h3.6a1 1 0 0 1 1 1c0 1.27.16 2.45.46 3.57a1 1 0 0 1-.24 1.02l-2.2 2.2Z" {...line} />,
  phoneOff: <><path d="M3 3l18 18" {...line}/><path d="M8.3 8.3c-.2-.71-.3-1.46-.3-2.3a1 1 0 0 0-1-1H4a2 2 0 0 0-2 2c0 9.4 7.6 17 17 17a2 2 0 0 0 2-2v-3a1 1 0 0 0-1-1c-.84 0-1.59-.1-2.3-.3" {...line}/></>,
  video: <><rect x="3" y="6" width="13" height="12" rx="3" {...line}/><path d="m16 10 5-3v10l-5-3" {...line}/></>,
  mic: <><rect x="9" y="3" width="6" height="11" rx="3" {...line}/><path d="M6 11.5a6 6 0 1 0 12 0M12 17.5V21M9 21h6" {...line}/></>,
  micOff: <><path d="M4 4l16 16" {...line}/><path d="M9 9V7a3 3 0 0 1 5.12-2.12M15 12a3 3 0 0 1-3 3M6 11.5a6 6 0 0 0 8.77 5.29M12 17.5V21M9 21h6" {...line}/></>,
  send: <path d="M4 11.5 20 4l-4.5 16-3.3-5.2L4 11.5Zm8.2 3.3L20 4" {...line} />,
  refresh: <path d="M20 6v5h-5M4 18v-5h5M6.7 9A7 7 0 0 1 19 11M17.3 15A7 7 0 0 1 5 13" {...line} />,
  trash: <><path d="M4 7h16" {...line}/><path d="M10 11v6M14 11v6" {...line}/><path d="M6 7l1 12a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2l1-12M9 7V5a1 1 0 0 1 1-1h4a1 1 0 0 1 1 1v2" {...line}/></>,
  pencil: <><path d="m4 20 4.5-1 9.8-9.8a2.1 2.1 0 1 0-3-3L5.5 16 4 20Z" {...line}/><path d="m13.5 7.5 3 3" {...line}/></>,
  check: <path d="M5 12.5 10 17l9-10" {...line} />,
  checkDouble: <><path d="M2.5 12.5 7 17l4.5-5" {...line} /><path d="M8.5 12.5 13 17l8.5-10" {...line} /></>,
  play: <path d="M8 5.14v13.72a1 1 0 0 0 1.53.85l10.9-6.86a1 1 0 0 0 0-1.7L9.53 4.29A1 1 0 0 0 8 5.14Z" fill="currentColor" />,
  reply: <path d="M10 8 5 12l5 4M6 12h9a4 4 0 0 1 4 4v0" {...line} />,
  forward: <path d="M14 8l5 4-5 4M5 12h13" {...line} />,
  dots: <><circle cx="5" cy="12" r="1.5" fill="currentColor"/><circle cx="12" cy="12" r="1.5" fill="currentColor"/><circle cx="19" cy="12" r="1.5" fill="currentColor"/></>,
  chevronDown: <path d="m6 9 6 6 6-6" {...line} />,
  chevronUp: <path d="m6 15 6-6 6 6" {...line} />,
  chevronLeft: <path d="m14.5 5.5-6 6 6 6" {...line} />,
  chevronRight: <path d="m9.5 5.5 6 6-6 6" {...line} />,
  select: <><rect x="4" y="4" width="16" height="16" rx="4" {...line}/><path d="M8 12.5 11 15l5-6" {...line}/></>,
  clock: <><circle cx="12" cy="12" r="8" {...line}/><path d="M12 8v4.5l3 1.5" {...line}/></>,
  menu: <><path d="M4 7h16" {...line}/><path d="M4 12h16" {...line}/><path d="M4 17h16" {...line}/></>,
  paperclip: <path d="M9.5 12.5 16 6a3 3 0 1 1 4.24 4.24l-8.13 8.13a5 5 0 1 1-7.07-7.07l8.48-8.49" {...line} />,
};

export function Icon({ name, size = 20, className, ...props }: SVGProps<SVGSVGElement> & { name: IconName; size?: number }) {
  return (
    <svg viewBox="0 0 24 24" width={size} height={size} className={className} fill="none" aria-hidden="true" {...props}>
      {paths[name]}
    </svg>
  );
}
