'use client';

import styles from '../../../app/(protected)/health/Health.module.css';
import { Card, CardHeader } from '@/shared/ui/Card/Card';
import { TinyLineChart } from './HealthCharts';

export function AnalyticsTab({
  analyticsData,
  pulseDay,
}: {
  analyticsData: any;
  pulseDay: any;
}) {
  return (
    <div className={styles.grid}>
      <Card className={styles.span4}>
        <CardHeader title="Ментальное здоровье" action={<span className={styles.badgeSoft}>7 дней</span>} />
        <div className={styles.metricRow}>
          <div className={styles.metricCard}><span>Общее состояние</span><strong>{pulseDay?.mental7Score ?? 0}%</strong></div>
          <div className={styles.metricCard}><span>Сегодня</span><strong>{pulseDay?.dayScore ?? 0}%</strong></div>
        </div>
        <TinyLineChart items={(analyticsData?.healthRows ?? []).map((row: any) => ({ date: row.date, todayScore: row.todayScore, pulse7Score: row.pulse7Score }))} keyProp="todayScore" secondaryKey="pulse7Score" />
      </Card>

      <Card className={styles.span4}>
        <CardHeader title="Калории и вес" />
        <TinyLineChart items={(analyticsData?.calorieLine ?? []).map((row: any) => ({ date: row.date, calories: row.calories, target: row.target }))} keyProp="calories" secondaryKey="target" />
        <TinyLineChart items={(analyticsData?.weightLine ?? []).map((row: any) => ({ date: row.date, value: row.value }))} keyProp="value" />
      </Card>

      <Card className={styles.span4}>
        <CardHeader title="Привычки и задачи" />
        <TinyLineChart items={(analyticsData?.taskSeries ?? []).map((row: any) => ({ date: row.date, percent: row.percent }))} keyProp="percent" />
        <div className={styles.list}>
          {(analyticsData?.habitStreaks ?? []).map((habit: any) => (
            <div key={habit.id} className={styles.listItem}>
              <strong>{habit.title}</strong>
              <span className={styles.badgeSoft}>{habit.streak} дн. подряд</span>
            </div>
          ))}
          {!analyticsData?.habitStreaks?.length ? <div className={styles.emptyText}>Когда появятся привычки, здесь будут их стрики.</div> : null}
        </div>
      </Card>

      <Card className={styles.span8}>
        <CardHeader title="Подсказки по Pulse" />
        <div className={styles.recommendations}>
          {(analyticsData?.suggestions ?? []).map((item: string) => (
            <div key={item} className={styles.tipItem}>• {item}</div>
          ))}
        </div>
      </Card>
    </div>
  );
}
