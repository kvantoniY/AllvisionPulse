'use client';

import styles from '../../../app/(protected)/health/Health.module.css';
import type { PulseAnalytics, PulseHealthDay, PulseOverview } from '@/shared/types/pulse';
import { TrendAreaChart } from './HealthCharts';
import { PulseIcon, type PulseIconName } from './HealthPageWidgets';

type PulseDay = PulseOverview['today'] | null | undefined;

function parseDate(value?: string | null) {
  if (!value) return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function formatDayLabel(value?: string | null) {
  const parsed = parseDate(value ?? null);
  if (!parsed) return 'Без даты';

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

function average(values: number[]) {
  if (!values.length) return 0;
  return values.reduce((sum, value) => sum + value, 0) / values.length;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function formatDecimal(value: number, digits = 1) {
  return value.toFixed(digits).replace('.', ',');
}

function formatSigned(value: number, suffix = '') {
  const rounded = Number(value.toFixed(1));
  if (!rounded) return `0${suffix}`;
  return `${rounded > 0 ? '+' : ''}${formatDecimal(rounded)}${suffix}`;
}

function formatWholeSigned(value: number, suffix = '') {
  const rounded = Math.round(value);
  if (!rounded) return `0${suffix}`;
  return `${rounded > 0 ? '+' : ''}${rounded}${suffix}`;
}

function buildHeroTitle(scoreDelta: number, taskAverage: number, onTargetDays: number, trackedDays: number) {
  if (scoreDelta >= 6) return 'Неделя набирает высоту';
  if (scoreDelta <= -6) return 'Неделя просит восстановления';
  if (taskAverage >= 70) return 'Ритм держится уверенно';
  if (trackedDays > 0 && onTargetDays >= Math.ceil(trackedDays / 2)) return 'Питание стало предсказуемее';
  return 'Картина недели собрана';
}

function buildHeroText({
  scoreDelta,
  averageScore,
  averageSleep,
  averageStress,
  taskAverage,
  topHabit,
}: {
  scoreDelta: number;
  averageScore: number;
  averageSleep: number;
  averageStress: number;
  taskAverage: number;
  topHabit: { title: string; streak: number } | null;
}) {
  if (scoreDelta >= 6) {
    return `Общий балл вырос на ${Math.round(scoreDelta)} пунктов. Сон держится около ${formatDecimal(averageSleep)} ч, а ритм задач остаётся на уровне ${Math.round(taskAverage)}%.`;
  }

  if (scoreDelta <= -6) {
    return `Баланс за неделю просел на ${Math.abs(Math.round(scoreDelta))} пунктов. Главный риск сейчас — нагрузка и восстановление: средний стресс ${formatDecimal(averageStress)}/10.`;
  }

  if (topHabit) {
    return `Неделя без резких провалов: средний Pulse ${Math.round(averageScore)}%, а самая сильная серия сейчас у привычки «${topHabit.title}» — ${topHabit.streak} дн. подряд.`;
  }

  return `Здесь собраны ключевые сигналы недели: общее состояние, питание, вес, задачи и привычки без лишнего шума.`;
}

function SummaryCard({
  icon,
  label,
  value,
  hint,
}: {
  icon: PulseIconName;
  label: string;
  value: string;
  hint: string;
}) {
  return (
    <article className={styles.analyticsSummaryCard}>
      <div className={styles.analyticsSummaryHead}>
        <span className={styles.analyticsSummaryIcon}>
          <PulseIcon name={icon} className={styles.healthSubnavIcon} />
        </span>
        <span className={styles.analyticsSummaryLabel}>{label}</span>
      </div>
      <strong className={styles.analyticsSummaryValue}>{value}</strong>
      <span className={styles.analyticsSummaryHint}>{hint}</span>
    </article>
  );
}

function StatCard({
  label,
  value,
  meta,
  tone = 'neutral',
}: {
  label: string;
  value: string;
  meta: string;
  tone?: 'neutral' | 'positive' | 'warning';
}) {
  return (
    <article className={styles.analyticsStatCard} data-tone={tone}>
      <span className={styles.analyticsStatLabel}>{label}</span>
      <strong className={styles.analyticsStatValue}>{value}</strong>
      <span className={styles.analyticsStatMeta}>{meta}</span>
    </article>
  );
}

function LegendItem({ label, color }: { label: string; color: string }) {
  return (
    <span className={styles.analyticsLegendItem}>
      <span className={styles.analyticsLegendSwatch} style={{ background: color }} />
      {label}
    </span>
  );
}

export function AnalyticsTab({
  analyticsData,
  pulseDay,
}: {
  analyticsData: PulseAnalytics | undefined;
  pulseDay: PulseDay;
}) {
  const healthRows = analyticsData?.healthRows ?? [];
  const taskSeries = analyticsData?.taskSeries ?? [];
  const calorieLine = analyticsData?.calorieLine ?? [];
  const weightLine = analyticsData?.weightLine ?? [];
  const habitStreaks = [...(analyticsData?.habitStreaks ?? [])].sort((left, right) => right.streak - left.streak);
  const topHabit = habitStreaks[0] ?? null;

  const averageScore = healthRows.length
    ? Math.round(average(healthRows.map((row) => row.todayScore)))
    : pulseDay?.mental7Score ?? 0;

  const currentScore = healthRows.at(-1)?.todayScore ?? pulseDay?.dayScore ?? 0;
  const currentBaseline = healthRows.at(-1)?.pulse7Score ?? pulseDay?.pulse7Score ?? 0;
  const scoreDelta = healthRows.length > 1
    ? (healthRows.at(-1)?.todayScore ?? 0) - (healthRows[0]?.todayScore ?? 0)
    : 0;
  const scoreSpread = healthRows.length
    ? Math.max(...healthRows.map((row) => row.todayScore)) - Math.min(...healthRows.map((row) => row.todayScore))
    : 0;
  const bestDay = healthRows.length
    ? healthRows.reduce((best, row) => (row.todayScore > best.todayScore ? row : best), healthRows[0] as PulseHealthDay)
    : null;

  const sleepValues = healthRows.map((row) => row.sleepHours).filter((value): value is number => typeof value === 'number');
  const stressValues = healthRows.map((row) => row.stress).filter((value): value is number => typeof value === 'number');
  const productivityValues = healthRows.map((row) => row.productivity).filter((value): value is number => typeof value === 'number');
  const averageSleep = average(sleepValues);
  const averageStress = average(stressValues);
  const averageProductivity = average(productivityValues);
  const smokeFreeDays = healthRows.filter((row) => !row.smoking).length;

  const calorieGaps = calorieLine
    .filter((row) => typeof row.target === 'number')
    .map((row) => ({ ...row, gap: row.calories - Number(row.target ?? 0) }));
  const trackedCalorieDays = calorieGaps.length;
  const onTargetDays = calorieGaps.filter((row) => Math.abs(row.gap) <= Math.max(120, Math.round(Number(row.target ?? 0) * 0.1))).length;
  const averageCalorieGap = calorieGaps.length ? average(calorieGaps.map((row) => row.gap)) : 0;
  const biggestCalorieGap = calorieGaps.length
    ? calorieGaps.reduce((best, row) => (Math.abs(row.gap) > Math.abs(best.gap) ? row : best), calorieGaps[0]!)
    : null;

  const weightPoints = weightLine.filter((row): row is { date: string; value: number } => typeof row.value === 'number');
  const weightDelta = weightPoints.length > 1 ? weightPoints.at(-1)!.value - weightPoints[0]!.value : 0;
  const lastWeight = weightPoints.at(-1)?.value ?? null;

  const averageTaskCompletion = taskSeries.length
    ? Math.round(average(taskSeries.map((row) => row.percent)))
    : pulseDay?.tasksPercent ?? 0;
  const totalTasksDone = sum(taskSeries.map((row) => row.completed));
  const totalTasksPlanned = sum(taskSeries.map((row) => row.total));
  const strongTaskDays = taskSeries.filter((row) => row.percent >= 70).length;
  const bestTaskDay = taskSeries.length
    ? taskSeries.reduce((best, row) => (row.percent > best.percent ? row : best), taskSeries[0]!)
    : null;

  const heroTitle = buildHeroTitle(scoreDelta, averageTaskCompletion, onTargetDays, trackedCalorieDays);
  const heroText = buildHeroText({
    scoreDelta,
    averageScore,
    averageSleep,
    averageStress,
    taskAverage: averageTaskCompletion,
    topHabit,
  });

  const generatedInsights = [
    scoreDelta >= 6
      ? {
          tone: 'positive' as const,
          title: 'Состояние пошло вверх',
          text: `Общий балл недели вырос на ${Math.round(scoreDelta)} п., а лучший день пришёлся на ${bestDay ? formatDayLabel(bestDay.date) : 'эту неделю'}.`,
        }
      : scoreDelta <= -6
        ? {
            tone: 'warning' as const,
            title: 'Нужна разгрузка',
            text: `Баланс просел на ${Math.abs(Math.round(scoreDelta))} п. При среднем стрессе ${formatDecimal(averageStress)}/10 стоит разгрузить темп и вернуть сон.`,
          }
        : null,
    trackedCalorieDays
      ? onTargetDays >= Math.ceil(trackedCalorieDays / 2)
        ? {
            tone: 'positive' as const,
            title: 'Питание держится рядом с целью',
            text: `${onTargetDays} из ${trackedCalorieDays} дней попали в комфортный коридор по калориям. Среднее отклонение — ${formatWholeSigned(averageCalorieGap, ' ккал')}.`,
          }
        : {
            tone: 'warning' as const,
            title: 'Калории гуляют сильнее нормы',
            text: `Только ${onTargetDays} из ${trackedCalorieDays} дней были рядом с целью. Самый сильный уход — ${formatWholeSigned(biggestCalorieGap?.gap ?? 0, ' ккал')} ${biggestCalorieGap ? `(${formatDayLabel(biggestCalorieGap.date)})` : ''}.`,
          }
      : null,
    taskSeries.length
      ? averageTaskCompletion >= 70
        ? {
            tone: 'positive' as const,
            title: 'Ритм задач устойчивый',
            text: `Среднее выполнение — ${averageTaskCompletion}%, а дней с сильным темпом уже ${strongTaskDays}.`,
          }
        : {
            tone: 'warning' as const,
            title: 'Ритм задач проседает',
            text: `Среднее выполнение держится на ${averageTaskCompletion}%. Стоит упростить план и вернуть 1–2 быстрых победы в день.`,
          }
      : null,
    topHabit
      ? {
          tone: 'positive' as const,
          title: 'Есть привычка-якорь',
          text: `Сильнейшая серия сейчас у «${topHabit.title}»: ${topHabit.streak} дн. подряд. Это хороший опорный ритуал на всю неделю.`,
        }
      : smokeFreeDays > 0
        ? {
            tone: 'positive' as const,
            title: 'Есть чистые дни',
            text: `${smokeFreeDays} из ${healthRows.length || 7} дней прошли без сигарет. Это уже заметный сигнал устойчивости.`,
          }
        : null,
  ].filter(Boolean) as Array<{ tone: 'positive' | 'warning'; title: string; text: string }>;

  const actionItems = (analyticsData?.suggestions?.length ? analyticsData.suggestions : pulseDay?.recommendations ?? []).slice(0, 4);

  return (
    <div className={styles.analyticsScene}>
      <section className={[styles.analyticsCard, styles.analyticsHeroCard].join(' ')}>
        <div className={styles.analyticsHeroTop}>
          <div className={styles.analyticsHeroCopy}>
            <span className={styles.analyticsEyebrow}>Аналитика Pulse</span>
            <h2 className={styles.analyticsHeroTitle}>{heroTitle}</h2>
            <p className={styles.analyticsHeroText}>{heroText}</p>
          </div>
          <span className={styles.analyticsHeroBadge}>{analyticsData?.days ?? 7} дней</span>
        </div>

        <div className={styles.analyticsSummaryGrid}>
          <SummaryCard
            icon="heart"
            label="Пульс недели"
            value={`${averageScore}%`}
            hint={bestDay ? `лучший день — ${formatDayLabel(bestDay.date)}` : 'нужны ещё наблюдения'}
          />
          <SummaryCard
            icon="check"
            label="Ритм задач"
            value={`${averageTaskCompletion}%`}
            hint={totalTasksPlanned ? `${totalTasksDone} из ${totalTasksPlanned} задач закрыто` : 'задач пока мало для вывода'}
          />
          <SummaryCard
            icon="meal"
            label="Точность питания"
            value={trackedCalorieDays ? `${onTargetDays}/${trackedCalorieDays}` : '—'}
            hint={trackedCalorieDays ? `среднее отклонение ${formatWholeSigned(averageCalorieGap, ' ккал')}` : 'нет данных по калориям'}
          />
          <SummaryCard
            icon={topHabit ? 'flame' : 'cigarette'}
            label={topHabit ? 'Сильная серия' : 'Чистые дни'}
            value={topHabit ? `${topHabit.streak} дн.` : `${smokeFreeDays}`}
            hint={topHabit ? topHabit.title : 'дней без сигарет за неделю'}
          />
        </div>

        {healthRows.length ? (
          <div className={styles.analyticsDayStrip}>
            {healthRows.map((row) => {
              const isBestDay = bestDay?.id === row.id;
              return (
                <article
                  key={row.id}
                  className={[styles.analyticsDayCard, isBestDay ? styles.analyticsDayCardAccent : ''].filter(Boolean).join(' ')}
                >
                  <span>{formatDayLabel(row.date)}</span>
                  <strong>{row.todayScore}%</strong>
                  <div className={styles.analyticsDayBar}>
                    <span style={{ width: `${Math.max(6, row.todayScore)}%` }} />
                  </div>
                </article>
              );
            })}
          </div>
        ) : null}
      </section>

      <section className={styles.analyticsCard}>
        <div className={styles.analyticsSectionHeader}>
          <div className={styles.analyticsSectionCopy}>
            <span className={styles.analyticsSectionKicker}>Состояние и восстановление</span>
            <h3 className={styles.analyticsSectionTitle}>Как шла неделя по самочувствию</h3>
            <p className={styles.analyticsSectionText}>Главный график сравнивает каждый день с вашей недельной базой, а рядом показывает, за счёт чего эта динамика сложилась.</p>
          </div>
          <span className={styles.badgeSoft}>обновляется ежедневно</span>
        </div>

        <div className={styles.analyticsSectionGrid}>
          <div className={styles.analyticsChartPanel}>
            <div className={styles.analyticsChartMeta}>
              <div className={styles.analyticsChartHeadline}>
                <strong>Баланс дня против недельной базы</strong>
                <span>Если оранжевая линия уходит ниже зелёной, неделя начинает накапливать усталость.</span>
              </div>
              <div className={styles.analyticsLegend}>
                <LegendItem label="День" color="#ff9a2f" />
                <LegendItem label="База 7 дней" color="#35d399" />
              </div>
            </div>
            <TrendAreaChart
              items={healthRows.map((row) => ({ date: row.date, score: row.todayScore, baseline: row.pulse7Score }))}
              lines={[
                { key: 'baseline', name: 'База 7 дней', color: '#35d399', fillOpacity: 0.14, strokeWidth: 2.2 },
                { key: 'score', name: 'Баланс дня', color: '#ff9a2f', fillOpacity: 0.28, strokeWidth: 2.6 },
              ]}
              height={300}
              valueFormatter={(value) => `${Math.round(value)}%`}
              yTickFormatter={(value) => `${Math.round(value)}`}
            />
          </div>

          <div className={styles.analyticsStatGrid}>
            <StatCard
              label="Сегодня"
              value={`${currentScore}%`}
              meta={`база недели ${currentBaseline}%`}
              tone={currentScore >= currentBaseline ? 'positive' : 'warning'}
            />
            <StatCard
              label="Разброс"
              value={`${Math.round(scoreSpread)} п.`}
              meta={scoreSpread <= 12 ? 'неделя довольно стабильна' : 'есть заметные скачки'}
              tone={scoreSpread <= 12 ? 'positive' : 'warning'}
            />
            <StatCard
              label="Средний сон"
              value={sleepValues.length ? `${formatDecimal(averageSleep)} ч` : '—'}
              meta={sleepValues.length ? (averageSleep >= 7 ? 'сон в комфортной зоне' : 'стоит вернуть 7–8 часов') : 'сон пока не заполнен'}
              tone={averageSleep >= 7 ? 'positive' : 'warning'}
            />
            <StatCard
              label="Средний стресс"
              value={stressValues.length ? `${formatDecimal(averageStress)}/10` : '—'}
              meta={stressValues.length ? (averageStress <= 4 ? 'уровень контролируемый' : 'нагрузка выше комфортной') : 'нет оценок стресса'}
              tone={averageStress <= 4 ? 'positive' : 'warning'}
            />
            <StatCard
              label="Продуктивность"
              value={productivityValues.length ? `${formatDecimal(averageProductivity)}/10` : '—'}
              meta={productivityValues.length ? 'среднее ощущение отдачи за неделю' : 'нет данных по продуктивности'}
              tone={averageProductivity >= 7 ? 'positive' : 'neutral'}
            />
            <StatCard
              label="Без сигарет"
              value={`${smokeFreeDays}/${healthRows.length || 7}`}
              meta={smokeFreeDays === (healthRows.length || 0) ? 'чистая неделя' : 'ещё есть пространство для серии'}
              tone={smokeFreeDays >= Math.ceil((healthRows.length || 7) / 2) ? 'positive' : 'neutral'}
            />
          </div>
        </div>
      </section>

      <section className={styles.analyticsCard}>
        <div className={styles.analyticsSectionHeader}>
          <div className={styles.analyticsSectionCopy}>
            <span className={styles.analyticsSectionKicker}>Питание и вес</span>
            <h3 className={styles.analyticsSectionTitle}>Насколько рацион совпадает с вашими целями</h3>
            <p className={styles.analyticsSectionText}>Здесь видно, где вы держите курс по калориям, а где привычки питания уже начинают двигать вес и самочувствие.</p>
          </div>
          <span className={styles.badgeSoft}>цель + отклонение</span>
        </div>

        <div className={styles.analyticsSplitGrid}>
          <div className={styles.analyticsChartPanel}>
            <div className={styles.analyticsChartMeta}>
              <div className={styles.analyticsChartHeadline}>
                <strong>Калории против плана</strong>
                <span>Полезно смотреть не только на пик, а на то, как часто вы вообще попадаете в коридор цели.</span>
              </div>
              <div className={styles.analyticsLegend}>
                <LegendItem label="Съедено" color="#ff9a2f" />
                <LegendItem label="Цель" color="#35d399" />
              </div>
            </div>
            <TrendAreaChart
              items={calorieLine.map((row) => ({ date: row.date, calories: row.calories, target: row.target }))}
              lines={[
                { key: 'target', name: 'Цель', color: '#35d399', fillOpacity: 0.14, strokeWidth: 2.1 },
                { key: 'calories', name: 'Съедено', color: '#ff9a2f', fillOpacity: 0.28, strokeWidth: 2.5 },
              ]}
              height={280}
              valueFormatter={(value) => `${Math.round(value)} ккал`}
              yTickFormatter={(value) => `${Math.round(value)}`}
            />
            <div className={styles.analyticsInlineStats}>
              <StatCard
                label="Точных дней"
                value={trackedCalorieDays ? `${onTargetDays}/${trackedCalorieDays}` : '—'}
                meta={trackedCalorieDays ? 'дней рядом с планом' : 'нет цели по калориям'}
                tone={trackedCalorieDays && onTargetDays >= Math.ceil(trackedCalorieDays / 2) ? 'positive' : 'neutral'}
              />
              <StatCard
                label="Средний сдвиг"
                value={trackedCalorieDays ? formatWholeSigned(averageCalorieGap, ' ккал') : '—'}
                meta="плюс — переедание, минус — дефицит"
                tone={Math.abs(averageCalorieGap) <= 120 ? 'positive' : 'warning'}
              />
              <StatCard
                label="Самый резкий день"
                value={biggestCalorieGap ? formatWholeSigned(biggestCalorieGap.gap, ' ккал') : '—'}
                meta={biggestCalorieGap ? formatDayLabel(biggestCalorieGap.date) : 'пока без данных'}
                tone={biggestCalorieGap && Math.abs(biggestCalorieGap.gap) <= 180 ? 'positive' : 'warning'}
              />
            </div>
          </div>

          <div className={styles.analyticsChartPanel}>
            <div className={styles.analyticsChartMeta}>
              <div className={styles.analyticsChartHeadline}>
                <strong>Тренд веса</strong>
                <span>Смотреть полезнее на траекторию, а не на одно случайное измерение. Даже небольшой сдвиг уже показывает направление.</span>
              </div>
              <div className={styles.analyticsLegend}>
                <LegendItem label="Вес" color="#7eb6ff" />
              </div>
            </div>
            <TrendAreaChart
              items={weightLine.map((row) => ({ date: row.date, weight: row.value }))}
              lines={[
                { key: 'weight', name: 'Вес', color: '#7eb6ff', fillOpacity: 0.22, strokeWidth: 2.4 },
              ]}
              height={280}
              valueFormatter={(value) => `${formatDecimal(value)} кг`}
              yTickFormatter={(value) => `${Math.round(value)}`}
              emptyText="Добавьте хотя бы пару измерений веса, и здесь появится осмысленный тренд."
            />
            <div className={styles.analyticsInlineStats}>
              <StatCard
                label="Последний вес"
                value={lastWeight !== null ? `${formatDecimal(lastWeight)} кг` : '—'}
                meta={lastWeight !== null ? 'последняя зафиксированная точка' : 'нет измерений'}
              />
              <StatCard
                label="Сдвиг"
                value={weightPoints.length > 1 ? formatSigned(weightDelta, ' кг') : '—'}
                meta={weightPoints.length > 1 ? (weightDelta < 0 ? 'вес снижается' : weightDelta > 0 ? 'вес растёт' : 'вес стабилен') : 'нужно больше точек'}
                tone={weightPoints.length > 1 ? 'positive' : 'neutral'}
              />
              <StatCard
                label="Плотность"
                value={weightPoints.length ? `${weightPoints.length} точ.` : '—'}
                meta="чем больше измерений, тем честнее тренд"
              />
            </div>
          </div>
        </div>
      </section>

      <section className={styles.analyticsCard}>
        <div className={styles.analyticsSectionHeader}>
          <div className={styles.analyticsSectionCopy}>
            <span className={styles.analyticsSectionKicker}>Исполнение и привычки</span>
            <h3 className={styles.analyticsSectionTitle}>Что реально удерживает ваш темп</h3>
            <p className={styles.analyticsSectionText}>Задачи показывают ритм дисциплины, а привычки — где уже появилась автоматичность. Вместе они дают картину устойчивости.</p>
          </div>
          <span className={styles.badgeSoft}>делаем ставку на повторяемость</span>
        </div>

        <div className={styles.analyticsSectionGrid}>
          <div className={styles.analyticsChartPanel}>
            <div className={styles.analyticsChartMeta}>
              <div className={styles.analyticsChartHeadline}>
                <strong>Выполнение задач по дням</strong>
                <span>Если линия рвётся, стоит упрощать план, а не добавлять ещё больше задач сверху.</span>
              </div>
              <div className={styles.analyticsLegend}>
                <LegendItem label="Выполнение" color="#ff9a2f" />
              </div>
            </div>
            <TrendAreaChart
              items={taskSeries.map((row) => ({ date: row.date, percent: row.percent }))}
              lines={[
                { key: 'percent', name: 'Выполнение', color: '#ff9a2f', fillOpacity: 0.28, strokeWidth: 2.5 },
              ]}
              height={280}
              valueFormatter={(value) => `${Math.round(value)}%`}
              yTickFormatter={(value) => `${Math.round(value)}`}
              emptyText="Появятся задачи на несколько дней — появится и динамика выполнения."
            />
            <div className={styles.analyticsInlineStats}>
              <StatCard
                label="Средний темп"
                value={`${averageTaskCompletion}%`}
                meta="среднее закрытие плана за неделю"
                tone={averageTaskCompletion >= 70 ? 'positive' : 'warning'}
              />
              <StatCard
                label="Сильных дней"
                value={`${strongTaskDays}`}
                meta="дней выше 70% выполнения"
                tone={strongTaskDays >= 3 ? 'positive' : 'neutral'}
              />
              <StatCard
                label="Лучший день"
                value={bestTaskDay ? `${bestTaskDay.percent}%` : '—'}
                meta={bestTaskDay ? formatDayLabel(bestTaskDay.date) : 'пока без данных'}
                tone={bestTaskDay && bestTaskDay.percent >= 80 ? 'positive' : 'neutral'}
              />
            </div>
          </div>

          <div className={styles.analyticsHabitPanel}>
            <div className={styles.analyticsChartHeadline}>
              <strong>Лидеры среди привычек</strong>
              <span>Это те действия, которые уже начинают работать почти без лишнего усилия.</span>
            </div>

            <div className={styles.analyticsHabitList}>
              {habitStreaks.slice(0, 4).map((habit) => (
                <article key={habit.id} className={styles.analyticsHabitRow}>
                  <div className={styles.analyticsHabitLead}>
                    <span className={styles.analyticsHabitIcon}>
                      <PulseIcon name="flame" className={styles.healthSubnavIcon} />
                    </span>
                    <div className={styles.analyticsHabitCopy}>
                      <strong>{habit.title}</strong>
                      <span>серия без пропусков</span>
                    </div>
                  </div>
                  <div className={styles.analyticsHabitValue}>{habit.streak} дн.</div>
                </article>
              ))}

              {!habitStreaks.length ? (
                <div className={styles.emptyText}>Как только в задачах накопятся привычки, здесь появится ваш реальный список опорных ритуалов.</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      <section className={styles.analyticsCard}>
        <div className={styles.analyticsSectionHeader}>
          <div className={styles.analyticsSectionCopy}>
            <span className={styles.analyticsSectionKicker}>Выводы недели</span>
            <h3 className={styles.analyticsSectionTitle}>Что удержать и куда смотреть дальше</h3>
            <p className={styles.analyticsSectionText}>Здесь собраны уже не сырые цифры, а короткие выводы по трендам и конкретные рекомендации, которые можно сразу применить.</p>
          </div>
        </div>

        <div className={styles.analyticsInsightsGrid}>
          <div className={styles.analyticsInsightStack}>
            {generatedInsights.map((item) => (
              <article
                key={item.title}
                className={styles.analyticsInsightCard}
                data-tone={item.tone}
              >
                <span className={styles.analyticsInsightIcon}>
                  <PulseIcon name={item.tone === 'positive' ? 'spark' : 'warning'} className={styles.healthSubnavIcon} />
                </span>
                <div className={styles.analyticsInsightCopy}>
                  <strong>{item.title}</strong>
                  <p>{item.text}</p>
                </div>
              </article>
            ))}

            {!generatedInsights.length ? (
              <div className={styles.emptyText}>Как только в трекерах накопится хотя бы неделя данных, Pulse начнёт собирать здесь более точные выводы.</div>
            ) : null}
          </div>

          <div className={styles.analyticsAdvicePanel}>
            <div className={styles.analyticsChartHeadline}>
              <strong>Рекомендации от Pulse</strong>
              <span>Короткий список действий, которые имеют наибольший шанс сдвинуть картину уже в ближайшие дни.</span>
            </div>

            <div className={styles.analyticsAdviceList}>
              {actionItems.map((item) => (
                <article key={item} className={styles.analyticsAdviceItem}>
                  <span className={styles.analyticsAdviceIcon}>
                    <PulseIcon name="arrow" className={styles.healthSubnavIcon} />
                  </span>
                  <span>{item}</span>
                </article>
              ))}

              {!actionItems.length ? (
                <div className={styles.emptyText}>Рекомендации появятся автоматически, когда Pulse увидит больше повторяемых паттернов.</div>
              ) : null}
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}
