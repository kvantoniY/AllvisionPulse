export function lockBodyScroll() {
  if (typeof document === 'undefined') return () => {};
  const body = document.body;
  const current = Number(body.dataset.scrollLockCount ?? '0');
  if (current === 0) {
    body.dataset.scrollLockOverflow = body.style.overflow || '';
    body.style.overflow = 'hidden';
  }
  body.dataset.scrollLockCount = String(current + 1);
  return () => {
    const next = Math.max(0, Number(body.dataset.scrollLockCount ?? '1') - 1);
    if (next === 0) {
      body.style.overflow = body.dataset.scrollLockOverflow ?? '';
      delete body.dataset.scrollLockCount;
      delete body.dataset.scrollLockOverflow;
      return;
    }
    body.dataset.scrollLockCount = String(next);
  };
}
