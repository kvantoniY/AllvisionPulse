'use client';

import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { useListShareArtifactsQuery } from '@/shared/api/programsApi';
import type { ShareArtifact } from '@/shared/types/programs';
import { PulseShareCard } from '@/shared/ui/PulseShareCard/PulseShareCard';
import styles from './PulseSharePicker.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  onPick: (artifact: ShareArtifact) => void;
  title?: string;
  subtitle?: string;
};

export function PulseSharePicker({
  open,
  onClose,
  onPick,
  title = 'Поделиться из Pulse',
  subtitle = 'Выберите один из недавних Pulse-артефактов.',
}: Props) {
  const isMobile = useIsMobile();
  const { data, isFetching } = useListShareArtifactsQuery(20, { skip: !open });
  const items = data?.items ?? [];

  const content = (
    <div className={styles.shell}>
      <div className={styles.hint}>{subtitle}</div>

      {isFetching ? <div className={styles.empty}>Загружаю недавние артефакты...</div> : null}

      {!isFetching && !items.length ? (
        <div className={styles.empty}>Пока ничего нет. Сначала создайте шаринг из программы, прохождения, сессии или достижения.</div>
      ) : null}

      {!!items.length ? (
        <div className={styles.list}>
          {items.map((artifact) => (
            <button
              key={artifact.id}
              type="button"
              className={styles.item}
              onClick={() => {
                onPick(artifact);
                onClose();
              }}
            >
              <PulseShareCard artifactId={artifact.id} artifact={artifact} compact interactive={false} />
            </button>
          ))}
        </div>
      ) : null}

      <div className={styles.actions}>
        <Button size="sm" onClick={onClose}>
          <Icon name="close" size={14} />
          Закрыть
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet open={open} onClose={onClose} title={title}>
        {content}
      </MobileSheet>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title={title} size="md">
      {content}
    </Modal>
  );
}
