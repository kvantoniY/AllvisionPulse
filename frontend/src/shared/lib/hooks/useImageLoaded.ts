import { useCallback, useEffect, useRef, useState } from 'react';

/**
 * Tracks whether an image URL has fully loaded.
 * Returns [loaded, onLoad, onError] to wire into <img>.
 * Resets automatically when `src` changes.
 */
export function useImageLoaded(src: string | undefined | null) {
  const [loaded, setLoaded] = useState(false);
  const prevSrc = useRef(src);

  useEffect(() => {
    if (src !== prevSrc.current) {
      setLoaded(false);
      prevSrc.current = src;
    }
  }, [src]);

  const onLoad = useCallback(() => setLoaded(true), []);
  const onError = useCallback(() => setLoaded(true), []);

  return { loaded, onLoad, onError } as const;
}
