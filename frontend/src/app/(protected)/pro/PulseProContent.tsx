'use client';

import { useState } from 'react';
import styles from './Pro.module.css';
import {
  PULSE_PRO_PLANS,
  formatPulseProExpiry,
  formatPulseProPrice,
  formatPulseProRemaining,
  getPulseProPlan,
  type PulseProPlanKey,
  type PulseProSubscriptionRecord,
  usePulseProSubscription,
} from '@/shared/lib/pulsePro';
import { Card, CardHeader, CardMuted } from '@/shared/ui/Card/Card';
import { Button } from '@/shared/ui/Button/Button';
import { Modal } from '@/shared/ui/Modal/Modal';
import { Icon } from '@/shared/ui/Icon/Icon';
import { PulseProBadge } from '@/shared/ui/PulseProBadge/PulseProBadge';
import { AdminBadge } from '@/shared/ui/AdminBadge/AdminBadge';

function getDurationLabel(months: number) {
  if (months === 1) return '1 месяц';
  if (months >= 2 && months <= 4) return `${months} месяца`;
  return `${months} месяцев`;
}

export function PulseProContent({ embedded = false }: { embedded?: boolean }) {
  const subscription = usePulseProSubscription();
  const [successRecord, setSuccessRecord] = useState<PulseProSubscriptionRecord | null>(null);
  const [successPlanKey, setSuccessPlanKey] = useState<PulseProPlanKey | null>(null);

  const currentPlan = subscription.plan;
  const previewUsername = subscription.currentUser?.username ?? 'pulse_user';
  const successPlan = successPlanKey ? getPulseProPlan(successPlanKey) : null;
  const statusTitle =
    subscription.status === 'active'
      ? 'Подписка активна'
      : subscription.status === 'expired'
        ? 'Подписка закончилась'
        : 'Подписка не подключена';

  const statusHint =
    subscription.status === 'active'
      ? `Действует до ${subscription.expiresAtLabel}${subscription.remainingLabel ? ` • осталось ${subscription.remainingLabel}` : ''}`
      : subscription.status === 'expired'
        ? `Последняя подписка закончилась ${subscription.expiresAtLabel}`
        : 'После активации у профиля появится синяя галочка Пульс Про.';
  const isAdmin = subscription.currentUser?.role === 'ADMIN';
  const previewBadge = isAdmin
    ? <AdminBadge role='ADMIN' username={subscription.currentUser?.username} />
    : subscription.isActive
      ? <AdminBadge role={subscription.currentUser?.role} username={subscription.currentUser?.username} />
      : <PulseProBadge />;

  const handlePurchase = (planKey: PulseProPlanKey) => {
    const nextRecord = subscription.activate(planKey);
    if (!nextRecord) return;

    setSuccessPlanKey(planKey);
    setSuccessRecord(nextRecord);
  };

  const handleReset = () => {
    setSuccessRecord(null);
    setSuccessPlanKey(null);
    subscription.clear();
  };

  return (
    <div className={embedded ? styles.page : `container appPage ${styles.page}`}>
      <Modal
        open={Boolean(successRecord)}
        onClose={() => setSuccessRecord(null)}
        title='Пульс Про активирован'
        subtitle={successRecord ? `Подписка действует до ${formatPulseProExpiry(successRecord.expiresAt)}` : undefined}
        icon={<div className={styles.successIcon}><Icon name="sparkles" size={18} /></div>}
      >
        <div className={styles.successBody}>
          <div className={styles.successTitle}>Вы теперь подписчик "Пульс Про"!</div>
          <div className={styles.successText}>
            {successPlan ? `${successPlan.title} уже активирован. ` : ''}
            Синяя галочка уже появилась рядом с вашим профилем.
          </div>
          <div className={styles.successPreview}>
            <span>@{previewUsername}</span>
            {isAdmin ? <AdminBadge role='ADMIN' username={subscription.currentUser?.username} /> : <PulseProBadge />}
          </div>
          <div className={styles.successMeta}>
            До {successRecord ? formatPulseProExpiry(successRecord.expiresAt) : '—'}
            {successRecord?.expiresAt ? ` • осталось ${formatPulseProRemaining(successRecord.expiresAt)}` : ''}
          </div>
          <div className={styles.successActions}>
            <Button variant='primary' onClick={() => setSuccessRecord(null)}>Продолжить</Button>
          </div>
        </div>
      </Modal>

      <Card className={styles.heroCard}>
        <div className={styles.heroGrid}>
          <div className={styles.heroCopy}>
            <div className={styles.heroEyebrow}>Подписка</div>
            <h1 className={styles.heroTitle}>Пульс Про</h1>
            <p className={styles.heroText}>
              Пока это заглушка покупки: выбираете срок, нажимаете кнопку, и подписка активируется сразу без реального платежного шлюза.
            </p>

            <div className={styles.heroStatusRow}>
              <div className={styles.statusChip}>
                <span className={styles.statusChipLabel}>Статус</span>
                <strong>{statusTitle}</strong>
              </div>
              <div className={styles.statusChip}>
                <span className={styles.statusChipLabel}>Текущий срок</span>
                <strong>{subscription.status === 'active' ? subscription.remainingLabel ?? 'активен' : 'не подключен'}</strong>
              </div>
            </div>
          </div>

          <div className={styles.previewPanel}>
            <div className={styles.previewLabel}>Что получает пользователь</div>
            <div className={styles.previewIdentity}>
              <div className={styles.previewAvatar}>{previewUsername.slice(0, 1).toUpperCase()}</div>
              <div className={styles.previewMeta}>
                <div className={styles.previewName}>
                  {previewUsername}
                  {previewBadge}
                </div>
                <div className={styles.previewHint}>Синяя галочка возле профиля по всему приложению</div>
              </div>
            </div>
            <div className={styles.stubHint}>
              Сейчас в Пульс Про только 1 бонус: синяя галочка возле имени пользователя.
            </div>
          </div>
        </div>
      </Card>

      <div className={styles.statusGrid}>
        <Card className={styles.infoCard}>
          <CardHeader title='Текущая подписка' />
          <div className={styles.infoValue}>{statusTitle}</div>
          <CardMuted>{statusHint}</CardMuted>
          <div className={styles.infoFacts}>
            <div className={styles.factRow}>
              <span className={styles.factLabel}>Текущий тариф</span>
              <strong>{currentPlan?.title ?? 'Нет активной подписки'}</strong>
            </div>
            <div className={styles.factRow}>
              <span className={styles.factLabel}>Активна до</span>
              <strong>{subscription.status === 'inactive' ? '—' : subscription.expiresAtLabel}</strong>
            </div>
          </div>
        </Card>

        <Card className={styles.infoCard}>
          <CardHeader title='Что входит сейчас' />
          <div className={styles.featureList}>
            <div className={styles.featureItem}>
              <PulseProBadge />
              <span>Синяя галочка Пульс Про рядом с именем пользователя.</span>
            </div>
          </div>
          <CardMuted>
            Дополнительный функционал в Пульс Про пока не включаем, только визуальный статус подписчика.
          </CardMuted>
        </Card>

        <Card className={styles.infoCard}>
          <CardHeader title='Для разработки' />
          <CardMuted>
            Тестовая кнопка полностью сбрасывает локальную подписку Пульс Про на этом устройстве.
          </CardMuted>
          <div className={styles.devActions}>
            <Button onClick={handleReset}>Сбросить подписку</Button>
          </div>
        </Card>
      </div>

      <section className={styles.planSection}>
        <div className={styles.sectionHead}>
          <h2 className={styles.sectionTitle}>Выберите срок подписки</h2>
          <p className={styles.sectionText}>Цена и срок показаны сразу, без скрытых условий.</p>
        </div>

        <div className={styles.planGrid}>
          {PULSE_PRO_PLANS.map((plan) => {
            const isCurrentPlan = subscription.isActive && currentPlan?.key === plan.key;
            const monthlySaving = 217 - plan.monthlyPrice;

            return (
              <Card key={plan.key} className={[styles.planCard, plan.key === 'year' ? styles.planCardFeatured : ''].filter(Boolean).join(' ')}>
                <div className={styles.planTop}>
                  <div>
                    <div className={styles.planTitleRow}>
                      <div className={styles.planTitle}>{plan.title}</div>
                      {plan.badge ? <span className={styles.planBadge}>{plan.badge}</span> : null}
                    </div>
                    <div className={styles.planSubtitle}>{plan.note}</div>
                  </div>
                  {isCurrentPlan ? <span className={styles.planActive}>Активен</span> : null}
                </div>

                <div className={styles.planPrice}>{formatPulseProPrice(plan.totalPrice)}</div>
                <div className={styles.planMeta}>
                  <div className={styles.planMetaRow}>
                    <span>Срок</span>
                    <strong>{getDurationLabel(plan.months)}</strong>
                  </div>
                  <div className={styles.planMetaRow}>
                    <span>Цена в месяц</span>
                    <strong>{formatPulseProPrice(plan.monthlyPrice)}</strong>
                  </div>
                  <div className={styles.planMetaRow}>
                    <span>Экономия к месячному тарифу</span>
                    <strong>{monthlySaving > 0 ? formatPulseProPrice(monthlySaving * plan.months) : '—'}</strong>
                  </div>
                </div>

                <Button variant='primary' onClick={() => handlePurchase(plan.key)}>
                  {subscription.isActive ? `Продлить на ${getDurationLabel(plan.months)}` : `Купить за ${formatPulseProPrice(plan.totalPrice)}`}
                </Button>
              </Card>
            );
          })}
        </div>
      </section>
    </div>
  );
}
