'use client';

import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import styles from './ConfirmDialog.module.css';

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
  return (
    <Modal
      open={open}
      onClose={loading ? () => undefined : onClose}
      title={title}
      subtitle={description}
      icon={<Icon name={icon} size={18} />}
      size="md"
    >
      <div className={styles.actions}>
        <button type="button" className={styles.cancelBtn} onClick={onClose} disabled={loading}>
          {cancelLabel}
        </button>
        <button type="button" className={styles.confirmBtn} onClick={() => void onConfirm()} disabled={loading}>
          {loading ? 'Выполняем…' : confirmLabel}
        </button>
      </div>
    </Modal>
  );
}
