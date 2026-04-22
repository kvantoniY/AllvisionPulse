'use client';

import { useId } from 'react';
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

type ChartRecord = Record<string, number | string | null | undefined>;

type TrendSeries = {
  key: string;
  name: string;
  color: string;
  fillOpacity?: number;
  strokeWidth?: number;
};

type TrendAreaChartProps = {
  items: ChartRecord[];
  lines: TrendSeries[];
  xKey?: string;
  height?: number;
  emptyText?: string;
  valueFormatter?: (value: number) => string;
  yTickFormatter?: (value: number) => string;
  labelFormatter?: (value: string) => string;
};

type TinyLineChartProps = {
  items: ChartRecord[];
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

const EMPTY_TEXT = 'Данных пока недостаточно для построения графика';
const PRIMARY_LABEL = 'Значение';
const SECONDARY_LABEL = 'Сравнение';

export function TrendAreaChart({
  items,
  lines,
  xKey = 'date',
  height = 260,
  emptyText = EMPTY_TEXT,
  valueFormatter,
  yTickFormatter,
  labelFormatter = formatChartTick,
}: TrendAreaChartProps) {
  const chartId = useId().replace(/[:]/g, '');

  if (!items.length || !lines.length) {
    return <div className={styles.emptyText}>{emptyText}</div>;
  }

  const hasValues = items.some((item) =>
    lines.some((line) => {
      const raw = item[line.key];
      return raw !== null && raw !== undefined && Number.isFinite(Number(raw));
    }),
  );

  if (!hasValues) {
    return <div className={styles.emptyText}>{emptyText}</div>;
  }

  const chartData = items.map((item, index) => {
    const next: Record<string, number | string | null> = {
      index,
      label: item[xKey] ? labelFormatter(String(item[xKey])) : String(item.label ?? index + 1),
    };

    for (const line of lines) {
      const raw = item[line.key];
      next[line.key] = raw === null || raw === undefined || raw === '' ? null : Number(raw);
    }

    return next;
  });

  const formatValue = valueFormatter ?? ((value: number) => `${Math.round(value)}`);
  const formatTick = yTickFormatter ?? formatValue;

  return (
    <div className={styles.analyticsChartShell}>
      <ResponsiveContainer width="100%" height={height}>
        <AreaChart data={chartData} margin={{ top: 16, right: 12, left: -12, bottom: 0 }}>
          <defs>
            {lines.map((line, index) => (
              <linearGradient key={line.key} id={`${chartId}-${line.key}`} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={line.color} stopOpacity={line.fillOpacity ?? (index === 0 ? 0.28 : 0.16)} />
                <stop offset="100%" stopColor={line.color} stopOpacity={0.02} />
              </linearGradient>
            ))}
          </defs>

          <CartesianGrid vertical={false} stroke="rgba(255,255,255,0.08)" />
          <XAxis
            dataKey="label"
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'rgba(255,255,255,0.56)', fontSize: 12 }}
          />
          <YAxis
            tickLine={false}
            axisLine={false}
            tick={{ fill: 'rgba(255,255,255,0.46)', fontSize: 12 }}
            tickFormatter={(value) => formatTick(Number(value))}
            width={44}
            allowDecimals={false}
          />
          <RechartsTooltip
            cursor={{ stroke: 'rgba(120, 72, 24, 0.14)' }}
            contentStyle={{
              background: 'var(--panel)',
              border: '1px solid var(--stroke)',
              borderRadius: 14,
              color: 'var(--text)',
            }}
            formatter={(value: number | string, name: string) => {
              const nextValue = typeof value === 'number' ? value : Number(value);
              return [formatValue(nextValue), name];
            }}
            labelStyle={{ color: 'rgba(255,255,255,0.6)' }}
          />

          {lines.map((line) => (
            <Area
              key={line.key}
              type="monotone"
              dataKey={line.key}
              name={line.name}
              stroke={line.color}
              fill={`url(#${chartId}-${line.key})`}
              strokeWidth={line.strokeWidth ?? 2.4}
              dot={false}
              activeDot={{ r: 4 }}
              connectNulls
            />
          ))}
        </AreaChart>
      </ResponsiveContainer>
    </div>
  );
}

export function TinyLineChart({ items, keyProp, secondaryKey }: TinyLineChartProps) {
  const lines: TrendSeries[] = [];

  if (secondaryKey) {
    lines.push({ key: secondaryKey, name: SECONDARY_LABEL, color: '#2fd37b', fillOpacity: 0.14, strokeWidth: 2.1 });
  }

  lines.push({ key: keyProp, name: PRIMARY_LABEL, color: '#ff9a2f', fillOpacity: 0.28, strokeWidth: 2.5 });

  return <TrendAreaChart items={items} lines={lines} height={236} />;
}
