export function lockBodyScroll() {
  if (typeof document === 'undefined' || typeof window === 'undefined') return () => {};

  const body = document.body;
  const html = document.documentElement;
  const current = Number(body.dataset.scrollLockCount ?? '0');

  if (current === 0) {
    const scrollbarCompensation = Math.max(0, window.innerWidth - html.clientWidth);

    body.dataset.scrollLockBodyOverflow = body.style.overflow || '';
    body.dataset.scrollLockBodyPaddingRight = body.style.paddingRight || '';
    html.dataset.scrollLockHtmlOverflow = html.style.overflow || '';

    html.style.overflow = 'hidden';
    body.style.overflow = 'hidden';
    if (scrollbarCompensation > 0) {
      body.style.paddingRight = `${scrollbarCompensation}px`;
    }
    body.dataset.overlayOpen = '1';
  }

  body.dataset.scrollLockCount = String(current + 1);

  return () => {
    const next = Math.max(0, Number(body.dataset.scrollLockCount ?? '1') - 1);

    if (next === 0) {
      body.style.overflow = body.dataset.scrollLockBodyOverflow ?? '';
      body.style.paddingRight = body.dataset.scrollLockBodyPaddingRight ?? '';
      html.style.overflow = html.dataset.scrollLockHtmlOverflow ?? '';

      delete body.dataset.scrollLockCount;
      delete body.dataset.scrollLockBodyOverflow;
      delete body.dataset.scrollLockBodyPaddingRight;
      delete body.dataset.overlayOpen;
      delete html.dataset.scrollLockHtmlOverflow;
      return;
    }

    body.dataset.scrollLockCount = String(next);
    body.dataset.overlayOpen = '1';
  };
}
