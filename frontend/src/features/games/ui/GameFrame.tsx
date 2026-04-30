'use client';

import { useEffect, useLayoutEffect, useRef, useState, type CSSProperties, type ReactNode } from 'react';
import { Icon } from '@/shared/ui/Icon/Icon';
import type { GamePresentationSpec } from '../lib/gamePresentation';
import {
  useGameFullscreen,
  type FullscreenScope,
  type GameViewState,
} from '../lib/useGameFullscreen';
import styles from './GameFrame.module.css';

type StageSize = {
  width: number;
  height: number;
  availableWidth: number;
  availableHeight: number;
};

type RenderState = GameViewState & {
  isFullscreen: boolean;
  enterFullscreen: () => Promise<void>;
  exitFullscreen: () => Promise<void>;
  toggleFullscreen: () => Promise<void>;
  stageSize: StageSize;
};

type GameFrameProps = {
  mode: 'chat' | 'call';
  fullscreenScope?: FullscreenScope;
  onFullscreenScopeChange?: (scope: FullscreenScope) => void;
  onViewStateChange?: (state: GameViewState) => void;
  presentation: GamePresentationSpec;
  title: string;
  subtitle?: string;
  eyebrow?: string;
  badge?: ReactNode;
  meta?: ReactNode;
  headerActions?: ReactNode;
  secondary?: ReactNode;
  secondaryPosition?: 'right' | 'bottom';
  allowFullscreen?: boolean;
  hideHeader?: boolean;
  flushViewport?: boolean;
  viewportKey?: string;
  immersiveExitLabel?: string;
  hideHeaderInFullscreen?: boolean;
  className?: string;
  stageClassName?: string;
  children: ReactNode | ((state: RenderState) => ReactNode);
};

export function GameFrame({
  mode,
  fullscreenScope,
  onFullscreenScopeChange,
  onViewStateChange,
  presentation,
  title,
  subtitle,
  eyebrow,
  badge,
  meta,
  headerActions,
  secondary,
  secondaryPosition = 'right',
  allowFullscreen = true,
  hideHeader = false,
  flushViewport = false,
  viewportKey,
  immersiveExitLabel = 'Свернуть',
  hideHeaderInFullscreen = true,
  className,
  stageClassName,
  children,
}: GameFrameProps) {
  const stageViewportRef = useRef<HTMLDivElement | null>(null);
  const fullscreen = useGameFullscreen({
    source: mode,
    controlledScope: fullscreenScope,
    onFullscreenScopeChange,
    onViewStateChange,
    enabled: allowFullscreen && presentation.allowFullscreen,
  });
  const [stageSize, setStageSize] = useState<StageSize>({
    width: 0,
    height: 0,
    availableWidth: 0,
    availableHeight: 0,
  });

  const { viewState } = fullscreen;

  useEffect(() => {
    const element = stageViewportRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;

    let frameId = 0;

    const update = () => {
      const rect = element.getBoundingClientRect();
      const next = {
        width: Math.max(0, Math.round(rect.width)),
        height: Math.max(0, Math.round(rect.height)),
        availableWidth: Math.max(0, Math.round(rect.width)),
        availableHeight: Math.max(0, Math.round(rect.height)),
      };

      setStageSize((current) => (
        current.width === next.width
        && current.height === next.height
        && current.availableWidth === next.availableWidth
        && current.availableHeight === next.availableHeight
      ) ? current : next);
    };

    const scheduleUpdate = () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      frameId = window.requestAnimationFrame(update);
    };

    scheduleUpdate();

    const observer = new ResizeObserver(scheduleUpdate);
    observer.observe(element);

    return () => {
      if (frameId) window.cancelAnimationFrame(frameId);
      observer.disconnect();
    };
  }, [viewportKey]);

  useLayoutEffect(() => {
    if (typeof window === 'undefined') return undefined;
    const viewport = stageViewportRef.current;
    if (!viewport) return undefined;

    const resetScrollableDescendants = () => {
      viewport.scrollTop = 0;
      viewport.scrollLeft = 0;

      const descendants = viewport.querySelectorAll<HTMLElement>('*');
      descendants.forEach((element) => {
        const styles = window.getComputedStyle(element);
        const canScrollY = (styles.overflowY === 'auto' || styles.overflowY === 'scroll') && element.scrollHeight > element.clientHeight;
        const canScrollX = (styles.overflowX === 'auto' || styles.overflowX === 'scroll') && element.scrollWidth > element.clientWidth;

        if (canScrollY) element.scrollTop = 0;
        if (canScrollX) element.scrollLeft = 0;
      });
    };

    resetScrollableDescendants();
    const frameId = window.requestAnimationFrame(resetScrollableDescendants);
    const followUpFrameId = window.requestAnimationFrame(() => window.requestAnimationFrame(resetScrollableDescendants));
    const timeoutId = window.setTimeout(resetScrollableDescendants, 120);

    return () => {
      window.cancelAnimationFrame(frameId);
      window.cancelAnimationFrame(followUpFrameId);
      window.clearTimeout(timeoutId);
    };
  }, [viewportKey]);

  const renderState: RenderState = {
    ...viewState,
    isFullscreen: viewState.fullscreenScope !== 'none',
    enterFullscreen: fullscreen.enterFullscreen,
    exitFullscreen: fullscreen.exitFullscreen,
    toggleFullscreen: fullscreen.toggleFullscreen,
    stageSize,
  };

  const style = {
    ['--frame-stage-max-width' as never]: `${presentation.maxStageWidth ?? 1280}px`,
    ['--frame-stage-max-height' as never]: `${presentation.maxStageHeight ?? 920}px`,
    ['--frame-stage-min-width' as never]: `${presentation.minPlayableWidth ?? 280}px`,
    ['--frame-stage-min-height' as never]: `${presentation.minPlayableHeight ?? 280}px`,
    ['--frame-preferred-aspect' as never]: String(presentation.preferredAspect ?? 1.2),
  } as CSSProperties;

  const bodyClassName = [
    styles.body,
    secondary && secondaryPosition === 'right' ? styles.bodyWithSecondaryRight : '',
    secondary && secondaryPosition === 'bottom' ? styles.bodyWithSecondaryBottom : '',
  ].filter(Boolean).join(' ');
  const viewportClassName = [
    styles.viewport,
    flushViewport ? styles.viewportFlush : '',
  ].filter(Boolean).join(' ');
  const immersiveMode = allowFullscreen && viewState.fullscreenScope !== 'none' && hideHeaderInFullscreen;

  return (
    <div
      ref={fullscreen.rootRef}
      style={style}
      className={[
        styles.frame,
        styles[mode === 'chat' ? 'modeChat' : 'modeCall'],
        viewState.mode === 'fullscreen' ? styles.modeFullscreen : '',
        immersiveMode ? styles.immersiveFrame : '',
        styles[`orientation${presentation.orientation[0].toUpperCase()}${presentation.orientation.slice(1)}`],
        styles[`fit${presentation.fit[0].toUpperCase()}${presentation.fit.slice(1)}`],
        viewState.fullscreenScope !== 'none' ? styles.appFullscreen : '',
        viewState.fullscreenScope === 'browser' ? styles.browserFullscreen : '',
        className ?? '',
      ].filter(Boolean).join(' ')}
    >
      {!immersiveMode ? (
        hideHeader ? null : (
          <div className={styles.header}>
            <div className={styles.headerMain}>
              {eyebrow ? <div className={styles.eyebrow}>{eyebrow}</div> : null}
              <div className={styles.titleRow}>
                {badge ? <div className={styles.badge}>{badge}</div> : null}
                <div className={styles.titleStack}>
                  <div className={styles.title}>{title}</div>
                  {subtitle ? <div className={styles.subtitle}>{subtitle}</div> : null}
                  {meta ? <div className={styles.meta}>{meta}</div> : null}
                </div>
              </div>
            </div>

            <div className={styles.actions}>
              {headerActions ? <div className={styles.headerActions}>{headerActions}</div> : null}
              {allowFullscreen && presentation.allowFullscreen ? (
                <button
                  type="button"
                  className={styles.fullscreenToggle}
                  onClick={() => void fullscreen.toggleFullscreen()}
                  aria-label={viewState.fullscreenScope === 'none' ? 'На весь экран' : 'Свернуть'}
                  title={viewState.fullscreenScope === 'none' ? 'На весь экран' : 'Свернуть'}
                >
                  <Icon name={viewState.fullscreenScope === 'none' ? 'expand' : 'arrowDown'} size={18} />
                  <span className={styles.srOnly}>{viewState.fullscreenScope === 'none' ? 'На весь экран' : 'Свернуть'}</span>
                </button>
              ) : null}
            </div>
          </div>
        )
      ) : (
        <button type="button" className={styles.immersiveExit} onClick={() => void fullscreen.exitFullscreen()}>
          <Icon name="arrowDown" size={16} />
          <span>{immersiveExitLabel}</span>
        </button>
      )}

      <div className={bodyClassName}>
        <div className={viewportClassName}>
          <div
            key={viewportKey}
            ref={stageViewportRef}
            className={styles.stageViewport}
            data-game-stage-viewport="true"
            data-flush-viewport={flushViewport ? 'true' : undefined}
          >
            <div className={[styles.stageSurface, stageClassName ?? ''].filter(Boolean).join(' ')}>
              {typeof children === 'function' ? children(renderState) : children}
            </div>
          </div>
        </div>

        {secondary ? (
          <aside className={[styles.secondary, secondaryPosition === 'bottom' ? styles.secondaryBottom : ''].filter(Boolean).join(' ')}>
            {secondary}
          </aside>
        ) : null}
      </div>
    </div>
  );
}
