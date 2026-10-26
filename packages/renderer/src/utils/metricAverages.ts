import type { IMetricWindows } from '@gpu-monitor/shared';

/**
 * Display helper for rolling 1/5/10-minute average windows.
 * The micro-line carries plain numbers separated by " · " (units live
 * in the row label and the tooltip); windows without samples are omitted.
 */

export interface AvgDisplay {
  line: string;
  tooltip: string;
}

const WINDOW_LABELS: Array<['1m' | '5m' | '10m', 'm1' | 'm5' | 'm10']> = [
  ['1m', 'm1'],
  ['5m', 'm5'],
  ['10m', 'm10'],
];

export function avgDisplay(
  windows: IMetricWindows | undefined,
  opts: { unit: string, decimals?: number, scale?: number },
): AvgDisplay | null {
  if (!windows) {
    return null;
  }
  const scale = opts.scale ?? 1;
  const decimals = opts.decimals ?? 0;
  const format = (value: number): string => (value * scale).toFixed(decimals);

  const present = WINDOW_LABELS
    .map(([label, key]) => [label, windows[key]] as const)
    .filter((entry): entry is ['1m' | '5m' | '10m', number] => entry[1] !== null);

  if (present.length === 0) {
    return null;
  }

  return {
    line: present.map(([, value]) => format(value)).join(' · '),
    tooltip: present.map(([label, value]) => `${label}: ${format(value)}${opts.unit}`).join(' · '),
  };
}
