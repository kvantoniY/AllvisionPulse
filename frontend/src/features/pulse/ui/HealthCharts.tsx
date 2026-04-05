'use client';

import {
  Area,
  AreaChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip as RechartsTooltip,
  XAxis,
  YAxis,
} from 'recharts';
import styles from '../../../app/(protected)/health/Health.module.css';

type TinyLineChartProps = {
  items: Array<Record<string, number | string | null>>;
  keyProp: string;
  secondaryKey?: string;
};

function parseDate(value?: string | Date | null) {
  if (!value) return null;
  if (value instanceof Date) {
    return Number.isNaN(value.getTime()) ? null : value;
  }

  const raw = String(value).trim();
  if (!raw) return null;

  if (/^\d{4}-\d{2}-\d{2}$/.test(raw)) {
    const dayOnly = new Date(`${raw}T00:00:00`);
    return Number.isNaN(dayOnly.getTime()) ? null : dayOnly;
  }

  const direct = new Date(raw);
  if (!Number.isNaN(direct.getTime())) return direct;

  const normalized = raw.split('T')[0] ?? raw;
  if (/^\d{4}-\d{2}-\d{2}$/.test(normalized)) {
    const fallback = new Date(`${normalized}T00:00:00`);
    return Number.isNaN(fallback.getTime()) ? null : fallback;
  }

  return null;
}

function formatChartTick(value: string) {
  const parsed = parseDate(value);
  if (!parsed) return value;

  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(parsed);
}

const EMPTY_TEXT = '\u0414\u0430\u043d\u043d\u044b\u0445 \u043f\u043e\u043a\u0430 \u043d\u0435\u0434\u043e\u0441\u0442\u0430\u0442\u043e\u0447\u043d\u043e \u0434\u043b\u044f \u043f\u043e\u0441\u0442\u0440\u043e\u0435\u043d\u0438\u044f \u0433\u0440\u0430\u0444\u0438\u043a\u0430';
const PRIMARY_LABEL = '\u0417\u043d\u0430\u0447\u0435\u043d\u0438\u0435';
const SECONDARY_LABEL = '\u0421\u0440\u0430\u0432\u043d\u0435\u043d\u0438\u0435';

export function TinyLineChart({ items, keyProp, secondaryKey }: TinyLineChartProps) {
  if (!items.length) {
    return <div className={styles.emptyText}>{EMPTY_TEXT}</div>;
  }

  const chartData = items.map((item, index) => ({
    index,
    label: item.date ? formatChartTick(String(item.date)) : String(item.label ?? index + 1),
    primary: Number(item[keyProp] ?? 0),
    secondary: secondaryKey ? Number(item[secondaryKey] ?? 0) : null,
  }));

  return (
    <div className={styles.chartCard}>
      <div className={styles.rechartsCardShell}>
        <ResponsiveContainer width="100%" height={236}>
          <AreaChart data={chartData} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}>
            <defs>
              <linearGradient id="pulsePrimaryArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#ff9a2f" stopOpacity={0.36} />
                <stop offset="100%" stopColor="#ff9a2f" stopOpacity={0.02} />
              </linearGradient>
              <linearGradient id="pulseSecondaryArea" x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor="#2fd37b" stopOpacity={0.22} />
                <stop offset="100%" stopColor="#2fd37b" stopOpacity={0.02} />
              </linearGradient>
            </defs>

            <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
            <XAxis
              dataKey="label"
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(255,255,255,0.64)', fontSize: 12 }}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tick={{ fill: 'rgba(255,255,255,0.54)', fontSize: 12 }}
              tickFormatter={(value) => `${Math.round(Number(value))}`}
              width={40}
            />
            <RechartsTooltip
              cursor={{ stroke: 'rgba(255,255,255,0.12)' }}
              contentStyle={{
                background: '#0f141c',
                border: '1px solid rgba(255,255,255,0.08)',
                borderRadius: 14,
                color: '#fff',
              }}
              formatter={(value: number, name: string) => [Math.round(value).toString(), name]}
              labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
            />

            {secondaryKey ? (
              <Area
                type="monotone"
                dataKey="secondary"
                name={SECONDARY_LABEL}
                stroke="#2fd37b"
                fill="url(#pulseSecondaryArea)"
                strokeWidth={2.2}
                dot={false}
                activeDot={{ r: 4 }}
              />
            ) : null}

            <Area
              type="monotone"
              dataKey="primary"
              name={PRIMARY_LABEL}
              stroke="#ff9a2f"
              fill="url(#pulsePrimaryArea)"
              strokeWidth={2.6}
              dot={false}
              activeDot={{ r: 4 }}
            />
          </AreaChart>
        </ResponsiveContainer>
      </div>
    </div>
  );
}
