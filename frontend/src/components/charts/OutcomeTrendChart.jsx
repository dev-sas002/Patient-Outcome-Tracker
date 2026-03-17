import { useMemo, useState } from 'react';
import { OUTCOME_ORDER, OUTCOME_META, shortMonth, monthTitle } from '../../lib/outcomes';

const VIEW_W = 760;
const VIEW_H = 260;
const PAD = { top: 16, right: 12, bottom: 28, left: 36 };

const PLOT_W = VIEW_W - PAD.left - PAD.right;
const PLOT_H = VIEW_H - PAD.top - PAD.bottom;

const SEGMENT_GAP = 2; // surface gap between stacked segments
const CORNER = 4; // rounded data-end, anchored to the baseline

/** Nice round axis maximum, so ticks land on readable numbers. */
function axisMax(value) {
  if (value <= 4) return 4;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

/** A rect whose top corners are rounded only when it is the top of the stack. */
function segmentPath(x, y, width, height, roundTop) {
  if (height <= 0) return '';
  const r = roundTop ? Math.min(CORNER, height, width / 2) : 0;
  return [
    `M ${x} ${y + height}`,
    `L ${x} ${y + r}`,
    r ? `Q ${x} ${y} ${x + r} ${y}` : '',
    `L ${x + width - r} ${y}`,
    r ? `Q ${x + width} ${y} ${x + width} ${y + r}` : '',
    `L ${x + width} ${y + height}`,
    'Z',
  ]
    .filter(Boolean)
    .join(' ');
}

/**
 * Outcome counts per month, stacked.
 *
 * One y-axis, one unit (records). Measures with their own units get their own
 * charts rather than a second axis here - a dual-axis chart lets the reader
 * invent a correlation by choosing the scales.
 */
export default function OutcomeTrendChart({ months }) {
  const [hover, setHover] = useState(null);

  const model = useMemo(() => {
    const maxTotal = Math.max(1, ...months.map((m) => m.total));
    const top = axisMax(maxTotal);
    const band = PLOT_W / Math.max(months.length, 1);
    const barWidth = Math.min(40, band * 0.6);

    const bars = months.map((month, index) => {
      const cx = PAD.left + band * (index + 0.5);
      const x = cx - barWidth / 2;

      let cursor = PAD.top + PLOT_H;
      const topmost = [...OUTCOME_ORDER].reverse().find((key) => month[key] > 0);

      const segments = OUTCOME_ORDER.map((key) => {
        const count = month[key] || 0;
        if (count === 0) return null;
        const rawHeight = (count / top) * PLOT_H;
        const height = Math.max(rawHeight - SEGMENT_GAP, 1);
        const y = cursor - rawHeight;
        cursor -= rawHeight;
        return { key, count, d: segmentPath(x, y, barWidth, height, key === topmost) };
      }).filter(Boolean);

      return {
        ...month,
        cx,
        x,
        band,
        barWidth,
        segments,
        topY: PAD.top + PLOT_H - (month.total / top) * PLOT_H,
      };
    });

    const ticks = [0, top / 2, top];
    return { bars, top, ticks };
  }, [months]);

  const hovered = hover === null ? null : model.bars[hover];

  return (
    <div className="chart-frame">
      <svg
        className="chart-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        role="img"
        aria-label="Recorded outcomes per month, stacked by outcome"
        onMouseLeave={() => setHover(null)}
      >
        {model.ticks.map((tick) => {
          const y = PAD.top + PLOT_H - (tick / model.top) * PLOT_H;
          return (
            <g key={tick}>
              <line
                x1={PAD.left}
                x2={VIEW_W - PAD.right}
                y1={y}
                y2={y}
                stroke="var(--line-grid)"
                strokeWidth="1"
              />
              <text
                x={PAD.left - 8}
                y={y + 3.5}
                textAnchor="end"
                fontSize="10"
                fill="var(--ink-muted)"
              >
                {tick}
              </text>
            </g>
          );
        })}

        <line
          x1={PAD.left}
          x2={VIEW_W - PAD.right}
          y1={PAD.top + PLOT_H}
          y2={PAD.top + PLOT_H}
          stroke="var(--line-strong)"
          strokeWidth="1"
        />

        {model.bars.map((bar, index) => (
          <g key={bar.month} opacity={hover === null || hover === index ? 1 : 0.45}>
            {bar.segments.map((segment) => (
              <path key={segment.key} d={segment.d} fill={OUTCOME_META[segment.key].color} />
            ))}
            {/* Direct label on the total only - never a number on every segment. */}
            {bar.total > 0 && (
              <text
                x={bar.cx}
                y={bar.topY - 6}
                textAnchor="middle"
                fontSize="10"
                fontWeight="600"
                fill="var(--ink-secondary)"
              >
                {bar.total}
              </text>
            )}
            <text
              x={bar.cx}
              y={VIEW_H - 9}
              textAnchor="middle"
              fontSize="10"
              fill="var(--ink-muted)"
            >
              {shortMonth(bar.month)}
            </text>
            {/* Hit target spans the whole band, not just the bar. */}
            <rect
              x={PAD.left + bar.band * index}
              y={PAD.top}
              width={bar.band}
              height={PLOT_H}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          </g>
        ))}
      </svg>

      {hovered && (
        <div
          className="chart-tooltip"
          style={{
            left: `${(hovered.cx / VIEW_W) * 100}%`,
            top: `${(Math.max(hovered.topY - 12, PAD.top) / VIEW_H) * 100}%`,
          }}
        >
          <h5>{monthTitle(hovered.month)}</h5>
          {OUTCOME_ORDER.map((key) => (
            <div className="chart-tooltip-row" key={key}>
              <span>
                <i className="swatch" style={{ background: OUTCOME_META[key].color }} />
                {OUTCOME_META[key].label}
              </span>
              <b>{hovered[key] || 0}</b>
            </div>
          ))}
          <div className="chart-tooltip-row">
            <span>Total</span>
            <b>{hovered.total}</b>
          </div>
        </div>
      )}
    </div>
  );
}
