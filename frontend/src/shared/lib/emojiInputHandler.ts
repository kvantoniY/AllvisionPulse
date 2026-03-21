import { useMemo } from 'react';

export interface EmojiInputHandlerConfig {
  onEmojiInput: (emoji: string) => void;
  disabled?: boolean;
  maxConsecutiveEmojiCount?: number;
}

const EMOJI_CLUSTER_REGEX = /^(?:\p{Regional_Indicator}{2}|\p{Emoji}(?:\p{Emoji_Modifier}|\uFE0F)?(?:\u200D\p{Emoji}(?:\p{Emoji_Modifier}|\uFE0F)?)*)$/u;

function splitGraphemes(input: string): string[] {
  if (!input) return [];
  const SegmenterCtor = (Intl as any)?.Segmenter;
  if (typeof SegmenterCtor === 'function') {
    const segmenter = new SegmenterCtor(undefined, { granularity: 'grapheme' });
    return Array.from(segmenter.segment(input), (item: any) => item.segment);
  }
  return Array.from(input);
}

function isEmojiCluster(cluster: string): boolean {
  if (!cluster) return false;
  return EMOJI_CLUSTER_REGEX.test(cluster);
}

function extractLeadingEmojiCluster(text: string): { emoji?: string; remaining: string } {
  const [first, ...rest] = splitGraphemes(text);
  if (first && isEmojiCluster(first)) {
    return { emoji: first, remaining: rest.join('') };
  }
  return { remaining: text };
}

function extractEmojiClusters(text: string): string[] {
  return splitGraphemes(text).filter(isEmojiCluster);
}

export class EmojiInputHandler {
  private onEmojiInput: (emoji: string) => void;
  private disabled: boolean;
  private maxConsecutiveEmojiCount: number;
  private lastEmojiTime = 0;
  private consecutiveEmojiCount = 0;

  constructor(config: EmojiInputHandlerConfig) {
    this.onEmojiInput = config.onEmojiInput;
    this.disabled = config.disabled ?? false;
    this.maxConsecutiveEmojiCount = config.maxConsecutiveEmojiCount ?? 10;
  }

  handlePickerEmoji(emoji: string): void {
    if (this.disabled || !emoji) return;
    this.onEmojiInput(EmojiInputHandler.normalizeEmoji(emoji));
  }

  handleTextInput(text: string): { emoji?: string; remaining: string } {
    if (this.disabled || !text) {
      return { remaining: text };
    }

    const result = extractLeadingEmojiCluster(text);
    if (!result.emoji) {
      this.consecutiveEmojiCount = 0;
      return { remaining: text };
    }

    const now = Date.now();
    if (now - this.lastEmojiTime < 100) {
      this.consecutiveEmojiCount += 1;
      if (this.consecutiveEmojiCount > this.maxConsecutiveEmojiCount) {
        return { remaining: result.remaining };
      }
    } else {
      this.consecutiveEmojiCount = 1;
    }

    this.lastEmojiTime = now;
    const normalized = EmojiInputHandler.normalizeEmoji(result.emoji);
    this.onEmojiInput(normalized);
    return { emoji: normalized, remaining: result.remaining };
  }

  handlePaste(text: string): string {
    if (this.disabled || !text) return text;
    const trimmed = text.trim();
    if (!trimmed) return text;

    if (EmojiInputHandler.isOnlyEmoji(trimmed)) {
      for (const emoji of extractEmojiClusters(trimmed)) {
        this.onEmojiInput(EmojiInputHandler.normalizeEmoji(emoji));
      }
      return '';
    }

    return text.normalize('NFC');
  }

  static isOnlyEmoji(text: string): boolean {
    const clusters = splitGraphemes(text.trim());
    return clusters.length > 0 && clusters.every(isEmojiCluster);
  }

  static countEmoji(text: string): number {
    return extractEmojiClusters(text).length;
  }

  static extractEmojis(text: string): string[] {
    return extractEmojiClusters(text);
  }

  static normalizeEmoji(emoji: string): string {
    return emoji.normalize('NFC');
  }

  static splitGraphemes(text: string): string[] {
    return splitGraphemes(text);
  }

  setDisabled(disabled: boolean): void {
    this.disabled = disabled;
  }
}

export function useEmojiInputHandler(onEmojiInput: (emoji: string) => void, disabled = false) {
  const handler = useMemo(() => new EmojiInputHandler({ onEmojiInput, disabled }), [onEmojiInput, disabled]);

  return {
    onPickerEmoji: (emoji: string) => handler.handlePickerEmoji(emoji),
    onTextInput: (text: string) => handler.handleTextInput(text),
    onPaste: (text: string) => handler.handlePaste(text),
    isOnlyEmoji: (text: string) => EmojiInputHandler.isOnlyEmoji(text),
    countEmoji: (text: string) => EmojiInputHandler.countEmoji(text),
    extractEmojis: (text: string) => EmojiInputHandler.extractEmojis(text),
    splitGraphemes: (text: string) => EmojiInputHandler.splitGraphemes(text),
  };
}
