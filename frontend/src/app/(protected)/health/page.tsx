'use client';

import { useEffect, useMemo, useState } from 'react';
import styles from './Health.module.css';
import { Card } from '@/shared/ui/Card/Card';
import { ProgressRing } from '@/shared/ui/ProgressRing/ProgressRing';
import { Button } from '@/shared/ui/Button/Button';
import { Switch } from '@/shared/ui/Switch/Switch';
import { useGetByDateQuery, useGetTodayQuery, useUpsertCheckinMutation } from '@/shared/api/healthApi';

function fmtDate(d: Date) {
  const yyyy = d.getFullYear();
  const mm = String(d.getMonth() + 1).padStart(2, '0');
  const dd = String(d.getDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
}

type FormState = {
  sleepHours: number | null;
  sleepQuality: number | null;
  alcohol: boolean;
  coffee: boolean;
  wellbeing: number | null;
  stress: number | null;
  activity: boolean;
  productivity: number | null;
  nutrition: number | null;
  smoking: boolean;
  comment: string;
};

const empty: FormState = {
  sleepHours: 7.5,
  sleepQuality: 7,
  alcohol: false,
  coffee: false,
  wellbeing: 7,
  stress: 4,
  activity: true,
  productivity: 7,
  nutrition: 7,
  smoking: false,
  comment: '',
};

export default function HealthPage() {
  const todayStr = useMemo(() => fmtDate(new Date()), []);
  const [date, setDate] = useState(todayStr);

  const { data: todayData } = useGetTodayQuery();
  const { data, isFetching } = useGetByDateQuery(date);
  const day = data?.day ?? null;

  const [form, setForm] = useState<FormState>(empty);
  const [save, { isLoading: isSaving }] = useUpsertCheckinMutation();

  useEffect(() => {
    if (!day) {
      // reset to defaults when there is no check-in for that day
      setForm((p) => ({ ...empty, comment: p.comment }));
      return;
    }
    setForm({
      sleepHours: day.sleepHours,
      sleepQuality: day.sleepQuality,
      alcohol: day.alcohol,
      coffee: day.coffee,
      wellbeing: day.wellbeing,
      stress: day.stress,
      activity: day.activity,
      productivity: day.productivity,
      nutrition: day.nutrition,
      smoking: day.smoking,
      comment: day.comment ?? '',
    });
  }, [day?.id]);

  const todayScore = (day ?? todayData?.day)?.todayScore ?? 0;
  const pulse7 = (day ?? todayData?.day)?.pulse7Score ?? 0;

  const tip = useMemo(() => {
    const sleep = form.sleepHours ?? 0;
    const stress = form.stress ?? 0;
    if (sleep > 0 && sleep < 7) return { title: 'Top influence: Sleep', text: 'Try to sleep 30 min more tonight' };
    if (stress >= 7) return { title: 'Top influence: Stress', text: 'Try a short walk or breathing break today' };
    return { title: 'Top influence: Balance', text: 'Keep consistent habits for a steadier 7‑day pulse' };
  }, [form.sleepHours, form.stress]);

  const onSave = async () => {
    await save({ date, ...form, comment: form.comment || null }).unwrap();
  };

  return (
    <div className="container">
      <div className={styles.topRow}>
        <div className={styles.tabs}>
          <div className={[styles.tab, styles.tabActive].join(' ')}>Check-in</div>
          <div className={styles.tab}>Planner</div>
          <div className={styles.tab}>Stats</div>
        </div>

        <div className={styles.datePicker}>
          <label className={styles.dateLabel}>
            <span className="srOnly">Date</span>
            <input
              className={styles.dateInput}
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              max={todayStr}
            />
          </label>
        </div>
      </div>

      <div className={styles.cards}>
        <Card className={styles.cardCenter}>
          <ProgressRing value={todayScore} label="Today Score" size={140} />
        </Card>
        <Card className={styles.cardCenter}>
          <ProgressRing value={pulse7} label="7-Day Pulse" size={140} />
        </Card>
      </div>

      <Card className={styles.tip}>
        <div className={styles.tipIcon}>💡</div>
        <div>
          <div className={styles.tipTitle}>{tip.title}</div>
          <div className={styles.tipText}>{tip.text}</div>
        </div>
      </Card>

      <Card>
        <div className={styles.sectionTitle}>Daily Check-in</div>

        <div className={styles.formGrid}>
          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <div className={styles.sliderLabel}>Sleep</div>
              <div className={styles.sliderValue}>{form.sleepHours?.toFixed(1)}h</div>
            </div>
            <input
              className={styles.range}
              type="range"
              min={0}
              max={12}
              step={0.1}
              value={form.sleepHours ?? 0}
              onChange={(e) => setForm((p) => ({ ...p, sleepHours: Number(e.target.value) }))}
            />
            <div className={styles.smallTicks}>
              <span>6h</span><span>7h</span><span>8h</span>
            </div>
          </div>

          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <div className={styles.sliderLabel}>Stress</div>
              <div className={styles.sliderValue}>{form.stress ?? 0}</div>
            </div>
            <input
              className={styles.range}
              type="range"
              min={1}
              max={10}
              step={1}
              value={form.stress ?? 1}
              onChange={(e) => setForm((p) => ({ ...p, stress: Number(e.target.value) }))}
            />
          </div>

          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <div className={styles.sliderLabel}>Wellbeing</div>
              <div className={styles.sliderValue}>{form.wellbeing ?? 0}</div>
            </div>
            <input
              className={styles.range}
              type="range"
              min={1}
              max={10}
              step={1}
              value={form.wellbeing ?? 1}
              onChange={(e) => setForm((p) => ({ ...p, wellbeing: Number(e.target.value) }))}
            />
          </div>

          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <div className={styles.sliderLabel}>Productivity</div>
              <div className={styles.sliderValue}>{form.productivity ?? 0}</div>
            </div>
            <input
              className={styles.range}
              type="range"
              min={1}
              max={10}
              step={1}
              value={form.productivity ?? 1}
              onChange={(e) => setForm((p) => ({ ...p, productivity: Number(e.target.value) }))}
            />
          </div>

          <div className={styles.sliderRow}>
            <div className={styles.sliderHead}>
              <div className={styles.sliderLabel}>Nutrition</div>
              <div className={styles.sliderValue}>{form.nutrition ?? 0}</div>
            </div>
            <input
              className={styles.range}
              type="range"
              min={1}
              max={10}
              step={1}
              value={form.nutrition ?? 1}
              onChange={(e) => setForm((p) => ({ ...p, nutrition: Number(e.target.value) }))}
            />
          </div>

          <div className={styles.toggles}>
            <Switch label="Alcohol" checked={form.alcohol} onChange={(v) => setForm((p) => ({ ...p, alcohol: v }))} />
            <Switch label="Coffee" checked={form.coffee} onChange={(v) => setForm((p) => ({ ...p, coffee: v }))} />
            <Switch label="Activity" checked={form.activity} onChange={(v) => setForm((p) => ({ ...p, activity: v }))} />
            <Switch label="Smoking" checked={form.smoking} onChange={(v) => setForm((p) => ({ ...p, smoking: v }))} />
          </div>

          <div className={styles.comment}>
            <label className={styles.commentLabel}>Comment</label>
            <textarea
              className={styles.textarea}
              value={form.comment}
              onChange={(e) => setForm((p) => ({ ...p, comment: e.target.value }))}
              placeholder="How was your day?"
              rows={4}
            />
          </div>
        </div>

        <div className={styles.actions}>
          <Button variant="primary" onClick={onSave} disabled={isSaving || isFetching}>
            {isSaving ? 'Saving…' : 'Save check-in'}
          </Button>
          <Button variant="default" disabled>
            Share
          </Button>
        </div>
      </Card>
    </div>
  );
}
