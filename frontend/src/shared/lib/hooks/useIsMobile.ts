'use client';

import { useEffect, useState } from 'react';

export function useIsMobile(maxWidth = 900) {
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    const query = `(max-width: ${maxWidth}px)`;
    const media = window.matchMedia(query);
    const update = () => setIsMobile(media.matches);
    update();
    media.addEventListener?.('change', update);
    return () => media.removeEventListener?.('change', update);
  }, [maxWidth]);

  return isMobile;
}
