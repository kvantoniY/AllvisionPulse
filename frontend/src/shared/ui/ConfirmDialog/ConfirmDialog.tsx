'use client';

import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import styles from './ConfirmDialog.module.css';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';

type Props = {
  open: boolean;
  onClose: () => void;
  onConfirm: () => void | Promise<void>;
  title: string;
  description?: string;
  confirmLabel?: string;
  cancelLabel?: string;
  loading?: boolean;
  icon?: 'trash' | 'repeat' | 'comment';
};

export function ConfirmDialog({
  open,
  onClose,
  onConfirm,
  title,
  description,
  confirmLabel = 'Подтвердить',
  cancelLabel = 'Отмена',
  loading = false,
  icon = 'trash',
}: Props) {
  const isMobile = useIsMobile();

  const actions = (
    <div className={styles.actions}>
      <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={loading}>
        {cancelLabel}
      </button>
      <button type="button" className={styles.confirmBtn} onClick={() => void onConfirm()} disabled={loading}>
        {loading ? 'Выполняем…' : confirmLabel}
      </button>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet open={open} onClose={loading ? () => undefined : onClose} title={title}>
        <div className={styles.mobileLayout}>
          <div className={styles.mobileContent}>
            <div className={styles.mobileIconWrap}>
              <Icon name={icon} size={18} />
            </div>
            {description ? <div className={styles.mobileDescription}>{description}</div> : null}
          </div>
          {actions}
        </div>
      </MobileSheet>
    );
  }

  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      subtitle={description}
      icon={<Icon name={icon} size={18} />}
      size="md"
    >
      {actions}
    </Modal>
  );
}
