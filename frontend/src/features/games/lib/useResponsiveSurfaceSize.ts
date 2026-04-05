'use client';

import { useEffect, useRef, useState } from 'react';

export type ResponsiveSurfaceSize = {
  width: number;
  height: number;
  availableWidth: number;
  availableHeight: number;
  ready: boolean;
};

type FitMode = 'contain' | 'cover';

type FitSurfaceOptions = {
  availableWidth: number;
  availableHeight: number;
  aspectRatio: number;
  maxWidth?: number;
  maxHeight?: number;
  minWidth?: number;
  minHeight?: number;
  fit?: FitMode;
};

type UseResponsiveSurfaceSizeOptions = Omit<FitSurfaceOptions, 'availableWidth' | 'availableHeight'>;

function clampFinite(value: number | undefined, fallback: number) {
  return typeof value === 'number' && Number.isFinite(value) && value > 0 ? value : fallback;
}

export function fitResponsiveSurface({
  availableWidth,
  availableHeight,
  aspectRatio,
  maxWidth,
  maxHeight,
  minWidth,
  minHeight,
  fit = 'contain',
}: FitSurfaceOptions): ResponsiveSurfaceSize {
  const safeWidth = Math.max(0, availableWidth);
  const safeHeight = Math.max(0, availableHeight);
  const safeAspect = Number.isFinite(aspectRatio) && aspectRatio > 0 ? aspectRatio : 1;

  if (!safeWidth || !safeHeight) {
    return {
      width: 0,
      height: 0,
      availableWidth: safeWidth,
      availableHeight: safeHeight,
      ready: false,
    };
  }

  const boundedWidth = Math.min(safeWidth, clampFinite(maxWidth, safeWidth));
  const boundedHeight = Math.min(safeHeight, clampFinite(maxHeight, safeHeight));

  let width = boundedWidth;
  let height = width / safeAspect;

  if (fit === 'contain') {
    if (height > boundedHeight) {
      height = boundedHeight;
      width = height * safeAspect;
    }
  } else if (height < boundedHeight) {
    height = boundedHeight;
    width = height * safeAspect;
  }

  const targetMinWidth = clampFinite(minWidth, 0);
  const targetMinHeight = clampFinite(minHeight, 0);

  if (targetMinWidth > 0 && safeWidth >= targetMinWidth && width < targetMinWidth) {
    width = targetMinWidth;
    height = width / safeAspect;
  }

  if (targetMinHeight > 0 && safeHeight >= targetMinHeight && height < targetMinHeight) {
    height = targetMinHeight;
    width = height * safeAspect;
  }

  if (fit === 'contain') {
    if (width > boundedWidth) {
      width = boundedWidth;
      height = width / safeAspect;
    }
    if (height > boundedHeight) {
      height = boundedHeight;
      width = height * safeAspect;
    }
  } else {
    width = Math.max(width, boundedWidth);
    height = Math.max(height, boundedHeight);
  }

  return {
    width: Math.max(0, Math.round(width)),
    height: Math.max(0, Math.round(height)),
    availableWidth: Math.round(safeWidth),
    availableHeight: Math.round(safeHeight),
    ready: true,
  };
}

export function useResponsiveSurfaceSize({
  aspectRatio,
  maxWidth,
  maxHeight,
  minWidth,
  minHeight,
  fit = 'contain',
}: UseResponsiveSurfaceSizeOptions) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [size, setSize] = useState<ResponsiveSurfaceSize>({
    width: 0,
    height: 0,
    availableWidth: 0,
    availableHeight: 0,
    ready: false,
  });

  useEffect(() => {
    const element = containerRef.current;
    if (!element || typeof ResizeObserver === 'undefined') return undefined;

    let frameId = 0;

    const update = () => {
      const rect = element.getBoundingClientRect();
      const nextSize = fitResponsiveSurface({
        availableWidth: rect.width,
        availableHeight: rect.height,
        aspectRatio,
        maxWidth,
        maxHeight,
        minWidth,
        minHeight,
        fit,
      });

      setSize((current) => (
        current.width === nextSize.width
        && current.height === nextSize.height
        && current.availableWidth === nextSize.availableWidth
        && current.availableHeight === nextSize.availableHeight
        && current.ready === nextSize.ready
      ) ? current : nextSize);
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
  }, [aspectRatio, fit, maxHeight, maxWidth, minHeight, minWidth]);

  return { containerRef, size };
}
