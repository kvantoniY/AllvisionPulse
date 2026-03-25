'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import styles from './EmojiPicker.module.css';

type EmojiEntry = {
  emoji: string;
  label: string;
  keywords: string[];
};

type EmojiCategory = {
  key: string;
  label: string;
  icon: string;
  items: EmojiEntry[];
};

const entry = (emoji: string, label: string, keywords: string[]): EmojiEntry => ({ emoji, label, keywords });

const RECENTS_STORAGE_KEY = 'allvision-pulse:emoji-recents';

const EMOJI_CATEGORIES: EmojiCategory[] = [
  {
    key: 'smileys',
    label: 'Смайлы',
    icon: '😊',
    items: [
      ['😀', 'grinning face', ['happy', 'smile', 'joy']],
      ['😄', 'smiling face', ['happy', 'laugh', 'joy']],
      ['😁', 'beaming face', ['grin', 'smile', 'teeth']],
      ['😂', 'face with tears of joy', ['lol', 'funny', 'cry']],
      ['🤣', 'rolling on the floor laughing', ['lol', 'rofl', 'funny']],
      ['🙂', 'slightly smiling face', ['smile', 'calm']],
      ['😉', 'winking face', ['wink', 'flirt']],
      ['😊', 'smiling face with smiling eyes', ['blush', 'warm']],
      ['😍', 'smiling face with heart-eyes', ['love', 'crush']],
      ['🥰', 'smiling face with hearts', ['love', 'cute']],
      ['😘', 'face blowing a kiss', ['kiss', 'love']],
      ['😎', 'smiling face with sunglasses', ['cool', 'vibe']],
      ['🤩', 'star-struck', ['wow', 'excited']],
      ['🥳', 'partying face', ['party', 'celebrate']],
      ['😇', 'smiling face with halo', ['angel', 'innocent']],
      ['🤗', 'hugging face', ['hug', 'support']],
      ['🤔', 'thinking face', ['hmm', 'question']],
      ['🫡', 'saluting face', ['respect', 'ok']],
      ['😌', 'relieved face', ['calm', 'peace']],
      ['🥺', 'pleading face', ['please', 'cute']],
      ['😭', 'loudly crying face', ['cry', 'sad']],
      ['😤', 'face with steam from nose', ['proud', 'mad']],
      ['😡', 'pouting face', ['angry', 'mad']],
      ['🤯', 'exploding head', ['mind blown', 'wow']],
      ['😴', 'sleeping face', ['sleep', 'tired']],
      ['🤖', 'robot', ['bot', 'tech']],
      ['👻', 'ghost', ['spooky', 'halloween']],
      ['💀', 'skull', ['dead', 'lol']],
    ].map((item) => entry(item[0] as string, item[1] as string, item[2] as string[])),
  },
  {
    key: 'people',
    label: 'Люди',
    icon: '🙌',
    items: [
      ['👍', 'thumbs up', ['like', 'yes', 'ok']],
      ['👎', 'thumbs down', ['no', 'bad']],
      ['👏', 'clapping hands', ['applause', 'bravo']],
      ['🙌', 'raising hands', ['celebrate', 'yay']],
      ['🙏', 'folded hands', ['please', 'thanks', 'pray']],
      ['🤝', 'handshake', ['deal', 'agree']],
      ['💪', 'flexed biceps', ['strong', 'gym']],
      ['👀', 'eyes', ['look', 'watch']],
      ['🔥', 'fire', ['lit', 'hot', 'trend']],
      ['✨', 'sparkles', ['shine', 'magic']],
      ['💯', 'hundred points', ['perfect', '100']],
      ['🎉', 'party popper', ['party', 'celebrate']],
      ['🤌', 'pinched fingers', ['italian', 'gesture']],
      ['🤝', 'handshake', ['contract', 'partnership']],
      ['🤟', 'love-you gesture', ['rock', 'hand sign']],
      ['✌️', 'victory hand', ['peace', 'two']],
      ['👋', 'waving hand', ['hello', 'bye']],
      ['🫶', 'heart hands', ['love', 'support']],
      ['🫠', 'melting face', ['awkward', 'hot']],
      ['🫣', 'face with peeking eye', ['peek', 'oops']],
      ['🤦', 'person facepalming', ['oops', 'mistake']],
      ['🙈', 'see-no-evil monkey', ['embarrassed', 'shy']],
      ['💃', 'woman dancing', ['dance', 'party']],
      ['🕺', 'man dancing', ['dance', 'party']],
    ].map((item) => entry(item[0] as string, item[1] as string, item[2] as string[])),
  },
  {
    key: 'nature',
    label: 'Природа',
    icon: '🌿',
    items: [
      ['❤️', 'red heart', ['love', 'heart']],
      ['🩷', 'pink heart', ['love', 'cute']],
      ['💙', 'blue heart', ['love', 'calm']],
      ['💚', 'green heart', ['love', 'nature']],
      ['💔', 'broken heart', ['sad', 'breakup']],
      ['🌹', 'rose', ['flower', 'romance']],
      ['🌸', 'cherry blossom', ['flower', 'spring']],
      ['🌷', 'tulip', ['flower', 'garden']],
      ['🌿', 'herb', ['leaf', 'green']],
      ['☀️', 'sun', ['weather', 'summer']],
      ['🌙', 'moon', ['night', 'sleep']],
      ['⭐', 'star', ['night', 'favorite']],
      ['🌈', 'rainbow', ['colorful', 'pride']],
      ['⚡', 'lightning', ['energy', 'storm']],
      ['🌊', 'water wave', ['sea', 'ocean']],
      ['❄️', 'snowflake', ['winter', 'cold']],
      ['☁️', 'cloud', ['weather', 'soft']],
      ['🍀', 'four leaf clover', ['luck']],
      ['🐶', 'dog face', ['pet', 'puppy']],
      ['🐱', 'cat face', ['pet', 'kitty']],
      ['🦊', 'fox', ['animal']],
      ['🐼', 'panda', ['animal', 'cute']],
      ['🦄', 'unicorn', ['magic', 'fantasy']],
      ['🐝', 'bee', ['honey', 'buzz']],
    ].map((item) => entry(item[0] as string, item[1] as string, item[2] as string[])),
  },
  {
    key: 'food',
    label: 'Еда',
    icon: '🍕',
    items: [
      ['☕', 'hot beverage', ['coffee', 'tea']],
      ['🍵', 'teacup', ['tea', 'matcha']],
      ['🍕', 'pizza', ['food', 'slice']],
      ['🍔', 'hamburger', ['food', 'burger']],
      ['🍟', 'french fries', ['food', 'fastfood']],
      ['🌮', 'taco', ['food', 'mexican']],
      ['🍣', 'sushi', ['food', 'japanese']],
      ['🍜', 'steaming bowl', ['ramen', 'soup']],
      ['🍩', 'doughnut', ['sweet', 'dessert']],
      ['🍪', 'cookie', ['dessert', 'sweet']],
      ['🎂', 'birthday cake', ['cake', 'party']],
      ['🍓', 'strawberry', ['fruit', 'berry']],
      ['🍇', 'grapes', ['fruit', 'wine']],
      ['🍉', 'watermelon', ['fruit', 'summer']],
      ['🍑', 'peach', ['fruit']],
      ['🥑', 'avocado', ['fruit', 'healthy']],
      ['🍿', 'popcorn', ['movie', 'snack']],
      ['🥂', 'clinking glasses', ['cheers', 'celebrate']],
      ['🍻', 'clinking beer mugs', ['beer', 'party']],
      ['🥤', 'cup with straw', ['drink', 'soda']],
    ].map((item) => entry(item[0] as string, item[1] as string, item[2] as string[])),
  },
  {
    key: 'travel',
    label: 'Путешествия',
    icon: '🚀',
    items: [
      ['🚗', 'car', ['drive', 'road']],
      ['🚕', 'taxi', ['cab', 'ride']],
      ['🛴', 'scooter', ['ride', 'city']],
      ['🚲', 'bicycle', ['bike', 'ride']],
      ['✈️', 'airplane', ['flight', 'travel']],
      ['🚀', 'rocket', ['space', 'launch']],
      ['🛸', 'flying saucer', ['ufo', 'space']],
      ['🏖️', 'beach with umbrella', ['vacation', 'summer']],
      ['🏔️', 'snow-capped mountain', ['mountain', 'travel']],
      ['🏙️', 'cityscape', ['city', 'night']],
      ['🏠', 'house', ['home']],
      ['🏡', 'house with garden', ['home']],
      ['🏟️', 'stadium', ['sports', 'concert']],
      ['🎡', 'ferris wheel', ['fun', 'park']],
      ['🎢', 'roller coaster', ['ride', 'fun']],
      ['🗽', 'statue of liberty', ['landmark', 'usa']],
      ['🗼', 'tokyo tower', ['landmark', 'japan']],
      ['🧭', 'compass', ['direction', 'travel']],
      ['🧳', 'luggage', ['trip', 'travel']],
      ['📍', 'round pushpin', ['location', 'pin']],
    ].map((item) => entry(item[0] as string, item[1] as string, item[2] as string[])),
  },
  {
    key: 'symbols',
    label: 'Символы',
    icon: '💬',
    items: [
      ['💬', 'speech balloon', ['chat', 'message']],
      ['🗨️', 'left speech bubble', ['chat', 'talk']],
      ['💭', 'thought balloon', ['think']],
      ['📌', 'pushpin', ['pin', 'important']],
      ['✅', 'check mark button', ['done', 'success']],
      ['❌', 'cross mark', ['close', 'wrong']],
      ['⚠️', 'warning', ['alert', 'careful']],
      ['⏳', 'hourglass', ['time', 'wait']],
      ['⌛', 'hourglass done', ['time']],
      ['🔔', 'bell', ['notification']],
      ['🔕', 'bell with slash', ['mute']],
      ['🎵', 'musical note', ['music', 'audio']],
      ['🎧', 'headphone', ['music', 'listen']],
      ['🎤', 'microphone', ['voice', 'record']],
      ['📷', 'camera', ['photo']],
      ['🎥', 'movie camera', ['video']],
      ['💻', 'laptop', ['work', 'tech']],
      ['📱', 'mobile phone', ['phone', 'device']],
      ['📎', 'paperclip', ['attach', 'file']],
      ['🔒', 'lock', ['secure', 'private']],
      ['🔓', 'open lock', ['unlock']],
    ].map((item) => entry(item[0] as string, item[1] as string, item[2] as string[])),
  },
];

export interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  onClose?: () => void;
  className?: string;
}

function readRecents(): string[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(RECENTS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as string[]) : [];
    return Array.isArray(parsed) ? parsed.slice(0, 24) : [];
  } catch {
    return [];
  }
}

function saveRecents(next: string[]) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(RECENTS_STORAGE_KEY, JSON.stringify(next.slice(0, 24)));
  } catch {
    // ignore storage failures
  }
}

export function EmojiPicker({ onSelect, onClose, className }: EmojiPickerProps) {
  const [searchQuery, setSearchQuery] = useState('');
  const [activeCategory, setActiveCategory] = useState(0);
  const [recentEmojis, setRecentEmojis] = useState<string[]>([]);
  const containerRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setRecentEmojis(readRecents());
  }, []);

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose?.();
    };
    document.addEventListener('keydown', handleKeyDown);
    return () => document.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    searchInputRef.current?.focus();
  }, []);

  useEffect(() => {
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        onClose?.();
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose]);

  const recentEntries = useMemo(() => {
    if (!recentEmojis.length) return [] as EmojiEntry[];
    const lookup = new Map(EMOJI_CATEGORIES.flatMap((category) => category.items.map((item) => [item.emoji, item] as const)));
    return recentEmojis.map((emoji) => lookup.get(emoji) ?? { emoji, label: 'Недавний эмодзи', keywords: ['recent'] });
  }, [recentEmojis]);

  const categories = useMemo<EmojiCategory[]>(() => {
    return recentEntries.length
      ? [{ key: 'recent', label: 'Недавние', icon: '🕘', items: recentEntries }, ...EMOJI_CATEGORIES]
      : EMOJI_CATEGORIES;
  }, [recentEntries]);

  useEffect(() => {
    if (activeCategory > categories.length - 1) {
      setActiveCategory(0);
    }
  }, [activeCategory, categories.length]);

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const visibleEmojis = useMemo(() => {
    if (!normalizedQuery) return categories[activeCategory]?.items ?? [];

    const allItems = categories.flatMap((category) => category.items);
    const deduped = new Map<string, EmojiEntry>();
    for (const item of allItems) {
      if (deduped.has(item.emoji)) continue;
      const haystack = [item.label, ...item.keywords].join(' ').toLowerCase();
      if (haystack.includes(normalizedQuery)) deduped.set(item.emoji, item);
    }
    return Array.from(deduped.values()).slice(0, 72);
  }, [activeCategory, categories, normalizedQuery]);

  const handleEmojiSelect = (emoji: string) => {
    onSelect(emoji);
    const next = [emoji, ...recentEmojis.filter((item) => item !== emoji)].slice(0, 24);
    setRecentEmojis(next);
    saveRecents(next);
  };

  return (
    <div ref={containerRef} className={[styles.emojiPicker, className].filter(Boolean).join(' ')}>
      <div className={styles.header}>
        <div>
          <div className={styles.title}>Эмодзи</div>
          <div className={styles.subtitle}>Быстрый выбор для сообщения.</div>
        </div>
        {onClose ? (
          <button type="button" className={styles.closeButton} onClick={onClose} aria-label="Закрыть выбор эмодзи">
            ✕
          </button>
        ) : null}
      </div>

      <div className={styles.searchSection}>
        <div className={styles.searchContainer}>
          <svg className={styles.searchIcon} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8">
            <circle cx="11" cy="11" r="7" />
            <path d="m20 20-3.5-3.5" />
          </svg>
          <input
            ref={searchInputRef}
            type="text"
            className={styles.searchInput}
            placeholder="Поиск эмодзи"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery ? (
            <button type="button" className={styles.clearButton} onClick={() => setSearchQuery('')} aria-label="Очистить поиск">
              ✕
            </button>
          ) : null}
        </div>
      </div>

      {!searchQuery ? (
        <div className={styles.categoriesBar}>
          {categories.map((category, index) => (
            <button
              key={category.key}
              type="button"
              className={[styles.categoryTab, index === activeCategory ? styles.categoryTabActive : ''].filter(Boolean).join(' ')}
              onClick={() => setActiveCategory(index)}
              aria-label={category.label}
              title={category.label}
            >
              <span className={styles.categoryIcon}>{category.icon}</span>
              <span className={styles.categoryLabel}>{category.label}</span>
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.emojisGrid}>
        {visibleEmojis.map((item) => (
          <button
            key={`${item.emoji}-${item.label}`}
            type="button"
            className={styles.emojiButton}
            onClick={() => handleEmojiSelect(item.emoji)}
            title={item.label}
            aria-label={item.label}
          >
            <span className={styles.emojiGlyph}>{item.emoji}</span>
            <span className={styles.emojiLabel}>{item.label}</span>
          </button>
        ))}
      </div>

      {visibleEmojis.length === 0 ? (
        <div className={styles.emptyState}>
          <div className={styles.emptyIcon}>🔎</div>
          <p>Ничего не найдено по запросу «{searchQuery}».</p>
        </div>
      ) : null}
    </div>
  );
}

export function useEmojiInput(callback: (emoji: string) => void) {
  useEffect(() => {
    const handlePaste = (e: ClipboardEvent) => {
      const text = e.clipboardData?.getData('text')?.trim() ?? '';
      if (!text) return;
      if (/^(?:\p{Regional_Indicator}{2}|\p{Emoji}(?:\p{Emoji_Modifier}|\uFE0F)?(?:\u200D\p{Emoji}(?:\p{Emoji_Modifier}|\uFE0F)?)*)+$/u.test(text)) {
        callback(text);
        e.preventDefault();
      }
    };
    document.addEventListener('paste', handlePaste as any);
    return () => document.removeEventListener('paste', handlePaste as any);
  }, [callback]);
}
