'use client';

import { useEffect, useMemo, useState } from 'react';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { MobileSheet } from '@/shared/ui/MobileSheet/MobileSheet';
import { Icon } from '@/shared/ui/Icon/Icon';
import { useIsMobile } from '@/shared/lib/hooks/useIsMobile';
import { extractApiError } from '@/shared/lib/apiError';
import { getPulseShareRoute } from '@/shared/lib/pulseShare';
import { useCreateShareArtifactMutation } from '@/shared/api/programsApi';
import type { ProgramAccessMode, ProgramShareMode, PulseShareArtifactKind, ShareArtifact } from '@/shared/types/programs';
import { accessModeLabel, shareModeLabel } from './programUi';
import styles from './ProgramsShell.module.css';

type Props = {
  open: boolean;
  onClose: () => void;
  sourceType: 'PROGRAM' | 'PROGRAM_RUN' | 'PROGRAM_SESSION' | 'TODAY_ACTIONS' | 'ACHIEVEMENT' | 'SESSION_INVITE';
  sourceId?: string | null;
  defaultKind: PulseShareArtifactKind;
  title: string;
  description?: string | null;
  disabledReason?: string | null;
  initialMode?: ProgramShareMode;
};

const shareModes: ProgramShareMode[] = ['SNAPSHOT', 'REFERENCE', 'INVITE'];
const visibilityModes: ProgramAccessMode[] = ['PRIVATE', 'RESTRICTED', 'PUBLIC'];

function artifactKindLabel(kind: PulseShareArtifactKind) {
  if (kind === 'PROGRAM') return 'Карточка программы';
  if (kind === 'PROGRAM_INVITE') return 'Приглашение в программу';
  if (kind === 'PROGRAM_PROGRESS') return 'Прогресс программы';
  if (kind === 'SESSION_INVITE') return 'Инвайт в сессию';
  if (kind === 'TODAY_ACTIONS') return 'Действия на сегодня';
  if (kind === 'ACHIEVEMENT') return 'Достижение';
  if (kind === 'PROGRAM_SUMMARY') return 'Итоги программы';
  return kind;
}

export function ProgramShareSheet({
  open,
  onClose,
  sourceType,
  sourceId,
  defaultKind,
  title,
  description,
  disabledReason,
  initialMode = 'SNAPSHOT',
}: Props) {
  const isMobile = useIsMobile();
  const [mode, setMode] = useState<ProgramShareMode>(initialMode);
  const [visibilityScope, setVisibilityScope] = useState<ProgramAccessMode>('PRIVATE');
  const [explicitPublicShare, setExplicitPublicShare] = useState(false);
  const [artifact, setArtifact] = useState<ShareArtifact | null>(null);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [createShareArtifact, { isLoading }] = useCreateShareArtifactMutation();

  useEffect(() => {
    if (!open) return;
    setMode(initialMode);
    setArtifact(null);
    setErrorMessage(null);
    setExplicitPublicShare(false);
  }, [initialMode, open]);

  const previewUrl = useMemo(() => {
    if (!artifact || typeof window === 'undefined') return '';
    return `${window.location.origin}${getPulseShareRoute(artifact.id, artifact)}`;
  }, [artifact]);

  const createArtifact = async () => {
    if (disabledReason) {
      setErrorMessage(disabledReason);
      return;
    }

    try {
      const response = await createShareArtifact({
        sourceType,
        sourceId: sourceId ?? null,
        kind: defaultKind,
        mode,
        visibilityScope,
        title,
        description: description ?? null,
        explicitPublicShare,
      }).unwrap();

      setArtifact(response.artifact);
      setErrorMessage(null);
    } catch (error) {
      setArtifact(null);
      setErrorMessage(extractApiError(error).message);
    }
  };

  const content = (
    <div className={styles.formCard}>
      {disabledReason ? (
        <div className={styles.noticeCard}>
          <div className={styles.sectionTitle}>Сначала подготовьте программу</div>
          <div className={styles.sectionHint}>{disabledReason}</div>
        </div>
      ) : null}

      <div className={styles.stack}>
        <div>
          <h3 className={styles.sectionTitle}>Как поделиться</h3>
          <div className={styles.sectionHint}>Выберите формат и уровень доступа. Публичный режим для чувствительных данных доступен только с явным подтверждением.</div>
        </div>

        <div className={styles.inlineActions}>
          {shareModes.map((option) => (
            <button key={option} type="button" className={[styles.tab, mode === option ? styles.tabActive : ''].filter(Boolean).join(' ')} onClick={() => setMode(option)}>
              {shareModeLabel(option)}
            </button>
          ))}
        </div>

        <div className={styles.inlineActions}>
          {visibilityModes.map((option) => (
            <button
              key={option}
              type="button"
              className={[styles.tab, visibilityScope === option ? styles.tabActive : ''].filter(Boolean).join(' ')}
              onClick={() => setVisibilityScope(option)}
            >
              {accessModeLabel(option)}
            </button>
          ))}
        </div>

        {visibilityScope === 'PUBLIC' ? (
          <div className={styles.noticeCard}>
            <div className={styles.sectionHint}>Если внутри есть здоровье, финансы или другой чувствительный контент, подтвердите, что публичный доступ выбран осознанно.</div>
            <div className={styles.noticeActions}>
              <Button size="sm" variant={explicitPublicShare ? 'primary' : 'default'} onClick={() => setExplicitPublicShare((value) => !value)}>
                <Icon name="shield" size={14} />
                {explicitPublicShare ? 'Подтверждено' : 'Подтвердить публикацию'}
              </Button>
            </div>
          </div>
        ) : null}
      </div>

      <div className={styles.sharePreview}>
        <div className={styles.statusLine}>
          <span className={styles.iconBadge}>
            <Icon name="forward" size={15} />
          </span>
          <div className={styles.summaryLabel}>{artifactKindLabel(defaultKind)}</div>
        </div>
        <div className={styles.sectionTitle}>{title}</div>
        {description ? <div className={[styles.sectionHint, styles.clamp2].join(' ')}>{description}</div> : null}
      </div>

      {errorMessage ? <div className={styles.dangerState}>{errorMessage}</div> : null}

      {artifact && previewUrl ? (
        <div className={styles.successState}>
          Артефакт создан. Теперь его можно прикрепить в чат, пост, сторис или комментарий, а ссылку можно сразу скопировать.
        </div>
      ) : null}

      {artifact && previewUrl ? (
        <div className={styles.sharePreview}>
          <div className={styles.summaryLabel}>Ссылка готова</div>
          <div className={styles.sectionHint}>{previewUrl}</div>
          <div className={styles.inlineActions}>
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(previewUrl);
              }}
            >
              <Icon name="paperclip" size={14} />
              Копировать ссылку
            </Button>
            <Button
              size="sm"
              onClick={async () => {
                await navigator.clipboard.writeText(artifact.id);
              }}
            >
              <Icon name="checkDouble" size={14} />
              Копировать ID
            </Button>
          </div>
        </div>
      ) : null}

      <div className={styles.inlineActions}>
        <Button size="sm" variant="primary" loading={isLoading} onClick={createArtifact} disabled={Boolean(disabledReason)}>
          <Icon name="forward" size={14} />
          Создать артефакт
        </Button>
        <Button size="sm" onClick={onClose}>
          Закрыть
        </Button>
      </div>
    </div>
  );

  if (isMobile) {
    return (
      <MobileSheet open={open} onClose={onClose} title="Поделиться">
        {content}
      </MobileSheet>
    );
  }

  return (
    <Modal open={open} onClose={onClose} title="Поделиться" icon={<Icon name="forward" size={18} />} size="md">
      {content}
    </Modal>
  );
}
