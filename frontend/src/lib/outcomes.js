/**
 * Outcome presentation constants, in one place so the chart, the legend, the
 * stat tiles and the table can never disagree about what "declined" looks like.
 *
 * These are the reserved status colours, not categorical series colours: an
 * outcome is a state with a polarity, not an identity. Every use pairs the
 * colour with the written label, so colour never carries the meaning alone.
 */
export const OUTCOME_ORDER = ['improved', 'stable', 'declined'];

export const OUTCOME_META = {
  improved: { label: 'Improved', color: 'var(--state-improved)', className: 'improved' },
  stable: { label: 'Stable', color: 'var(--state-stable)', className: 'stable' },
  declined: { label: 'Declined', color: 'var(--state-declined)', className: 'declined' },
};

const MONTH_LABELS = [
  'Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun',
  'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec',
];

/** "2026-03" -> "Mar". The year is carried by the axis, not by every tick. */
export function shortMonth(key) {
  const month = Number(String(key).slice(5, 7));
  return MONTH_LABELS[month - 1] || key;
}

export function monthTitle(key) {
  const [year, month] = String(key).split('-');
  return `${MONTH_LABELS[Number(month) - 1] || month} ${year}`;
}

export function formatPercent(value) {
  if (!Number.isFinite(value)) return '-';
  return `${Math.round(value * 100)}%`;
}

export function formatDate(value) {
  if (!value) return '-';
  return new Date(value).toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: 'numeric',
  });
}
