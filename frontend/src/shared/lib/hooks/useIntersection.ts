'use client';

import { useEffect, useState } from 'react';

export function useIntersection<T extends Element>(ref: React.RefObject<T>, options?: IntersectionObserverInit) {
  const [isIntersecting, setIntersecting] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const obs = new IntersectionObserver((entries) => {
      setIntersecting(entries[0]?.isIntersecting ?? false);
    }, options);
    obs.observe(el);
    return () => obs.disconnect();
  }, [ref, options?.root, options?.rootMargin, options?.threshold]);

  return isIntersecting;
}
