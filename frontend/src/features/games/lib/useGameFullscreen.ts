'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { lockBodyScroll } from '@/shared/lib/dom/scrollLock';

export type GameViewMode = 'chat' | 'call' | 'fullscreen';
export type FullscreenScope = 'none' | 'app' | 'browser';

export type GameViewState = {
  mode: GameViewMode;
  fullscreenScope: FullscreenScope;
  source: 'chat' | 'call';
};

type UseGameFullscreenOptions = {
  source: 'chat' | 'call';
  enabled?: boolean;
  controlledScope?: FullscreenScope;
  onFullscreenScopeChange?: (scope: FullscreenScope) => void;
  onViewStateChange?: (state: GameViewState) => void;
};

function createHistoryToken() {
  return `${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export function useGameFullscreen({
  source,
  enabled = true,
  controlledScope,
  onFullscreenScopeChange,
  onViewStateChange,
}: UseGameFullscreenOptions) {
  const rootRef = useRef<HTMLDivElement | null>(null);
  const [uncontrolledScope, setUncontrolledScope] = useState<FullscreenScope>('none');
  const isControlled = controlledScope !== undefined;
  const fullscreenScope = controlledScope ?? uncontrolledScope;
  const historyActiveRef = useRef(false);
  const historyTokenRef = useRef('');
  const ignoreNextPopRef = useRef(false);

  const applyScope = useCallback((next: FullscreenScope) => {
    if (!isControlled) {
      setUncontrolledScope(next);
    }
    onFullscreenScopeChange?.(next);
  }, [isControlled, onFullscreenScopeChange]);

  const pushHistoryEntry = useCallback(() => {
    if (typeof window === 'undefined' || historyActiveRef.current) return;
    historyTokenRef.current = createHistoryToken();
    window.history.pushState(
      {
        ...(window.history.state ?? {}),
        __avGameFullscreen: historyTokenRef.current,
      },
      '',
    );
    historyActiveRef.current = true;
  }, []);

  const releaseHistoryEntry = useCallback(() => {
    if (typeof window === 'undefined' || !historyActiveRef.current) return;
    ignoreNextPopRef.current = true;
    historyActiveRef.current = false;
    window.history.back();
    window.setTimeout(() => {
      ignoreNextPopRef.current = false;
    }, 0);
  }, []);

  const exitBrowserFullscreen = useCallback(async () => {
    if (typeof document === 'undefined' || !document.fullscreenElement || typeof document.exitFullscreen !== 'function') return;
    try {
      await document.exitFullscreen();
    } catch {
      // ignore
    }
  }, []);

  const enterFullscreen = useCallback(async () => {
    if (!enabled) return;
    pushHistoryEntry();
    applyScope('app');
  }, [applyScope, enabled, pushHistoryEntry]);

  const exitFullscreen = useCallback(async () => {
    await exitBrowserFullscreen();
    applyScope('none');
    releaseHistoryEntry();
  }, [applyScope, exitBrowserFullscreen, releaseHistoryEntry]);

  const toggleFullscreen = useCallback(async () => {
    if (fullscreenScope === 'none') {
      await enterFullscreen();
      return;
    }
    await exitFullscreen();
  }, [enterFullscreen, exitFullscreen, fullscreenScope]);

  useEffect(() => {
    if (fullscreenScope === 'none') return;
    return lockBodyScroll();
  }, [fullscreenScope]);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    const handlePopState = () => {
      if (!historyActiveRef.current || ignoreNextPopRef.current) return;
      historyActiveRef.current = false;
      applyScope('none');
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, [applyScope]);

  useEffect(() => {
    if (typeof document === 'undefined') return;
    const handleFullscreenChange = () => {
      const element = rootRef.current;
      if (!element) return;
      const fullscreenElement = document.fullscreenElement;
      if (fullscreenElement === element) {
        if (fullscreenScope !== 'browser') applyScope('browser');
        return;
      }
      if (fullscreenScope === 'browser') {
        applyScope('app');
      }
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, [applyScope, fullscreenScope]);

  useEffect(() => {
    if (typeof window === 'undefined' || fullscreenScope === 'none') return;
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      if (fullscreenScope === 'browser') return;
      event.preventDefault();
      void exitFullscreen();
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [exitFullscreen, fullscreenScope]);

  const viewState = useMemo<GameViewState>(() => ({
    mode: fullscreenScope === 'none' ? source : 'fullscreen',
    fullscreenScope,
    source,
  }), [fullscreenScope, source]);

  useEffect(() => {
    onViewStateChange?.(viewState);
  }, [onViewStateChange, viewState]);

  useEffect(() => () => {
    void exitBrowserFullscreen();
    releaseHistoryEntry();
  }, [exitBrowserFullscreen, releaseHistoryEntry]);

  return {
    rootRef,
    viewState,
    enterFullscreen,
    exitFullscreen,
    toggleFullscreen,
    isFullscreen: fullscreenScope !== 'none',
  };
}
