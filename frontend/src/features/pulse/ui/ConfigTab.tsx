'use client';

import styles from '../../../app/(protected)/health/Health.module.css';
import { Switch } from '@/shared/ui/Switch/Switch';
import { PulseIcon } from './HealthPageWidgets';

type ConfigKey = 'healthEnabled' | 'mentalEnabled' | 'nutritionEnabled' | 'tasksEnabled';

const healthModules: Array<{ key: ConfigKey; title: string; description: string; icon: Parameters<typeof PulseIcon>[0]['name'] }> = [
  { key: 'healthEnabled', title: 'Трекер здоровья', description: 'Общий модуль здоровья', icon: 'heart' },
  { key: 'mentalEnabled', title: 'Ментальное здоровье', description: 'Сон, стресс, самочувствие и продуктивность', icon: 'brain' },
  { key: 'nutritionEnabled', title: 'Питание', description: 'Калории, БЖУ и приёмы пищи', icon: 'meal' },
];

const taskModules: Array<{ key: ConfigKey; title: string; description: string; icon: Parameters<typeof PulseIcon>[0]['name'] }> = [
  { key: 'tasksEnabled', title: 'Трекер задач', description: 'Задачи, привычки и цели', icon: 'check' },
];

export function ConfigTab({
  config,
  configSaving,
  financeActiveModules,
  handleConfigToggle,
}: {
  config: any;
  configSaving: boolean;
  financeActiveModules: string[];
  handleConfigToggle: (key: ConfigKey) => void;
}) {
  return (
    <div className={styles.configScene}>
      <section className={styles.configHeroCard}>
        <div>
          <div className={styles.configHeroTitle}><PulseIcon name="spark" className={styles.sectionIconAccent} />Конфигурация трекеров</div>
          <p className={styles.configHeroSubtitle}>Утилитарный экран включения модулей и их базового поведения без лишнего dashboard-веса.</p>
        </div>
        <span className={styles.configHeroBadge}>Активно: {financeActiveModules.length}</span>
      </section>

      <section className={styles.configSectionCard}>
        <div className={styles.configSectionTitle}><PulseIcon name="heart" className={styles.healthSubnavIcon} />Здоровье</div>
        <div className={styles.configModuleList}>
          {healthModules.map((item) => (
            <article key={item.key} className={styles.configModuleRow}>
              <div className={styles.configModuleLead}>
                <span className={styles.configModuleIcon}><PulseIcon name={item.icon} className={styles.healthSubnavIcon} /></span>
              </div>
              <div className={styles.configSwitchRowWrap}>
                <Switch
                  label={item.title}
                  description={item.description}
                  checked={Boolean(config?.[item.key])}
                  onChange={() => handleConfigToggle(item.key)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.configSectionCard}>
        <div className={styles.configSectionTitle}><PulseIcon name="check" className={styles.healthSubnavIcon} />Ежедневник</div>
        <div className={styles.configModuleList}>
          {taskModules.map((item) => (
            <article key={item.key} className={styles.configModuleRow}>
              <div className={styles.configModuleLead}>
                <span className={styles.configModuleIcon}><PulseIcon name={item.icon} className={styles.healthSubnavIcon} /></span>
              </div>
              <div className={styles.configSwitchRowWrap}>
                <Switch
                  label={item.title}
                  description={item.description}
                  checked={Boolean(config?.[item.key])}
                  onChange={() => handleConfigToggle(item.key)}
                />
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className={styles.configSectionCard}>
        <div className={styles.configSectionTitle}><PulseIcon name="gear" className={styles.healthSubnavIcon} />Расширенные настройки</div>
        <div className={styles.configSummaryLine}>
          <span>Финансовые дубликаты и вторичные автосвязи лучше держать здесь, а не в первом экране конфигурации.</span>
          <strong>{configSaving ? 'Сохранение…' : 'Изменения применяются сразу'}</strong>
        </div>
      </section>
    </div>
  );
}
