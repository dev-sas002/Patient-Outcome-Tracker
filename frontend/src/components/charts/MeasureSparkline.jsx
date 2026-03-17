import { useMemo, useState } from 'react';
import { monthTitle } from '../../lib/outcomes';

const VIEW_W = 300;
const VIEW_H = 64;
const PAD = 8;

/**
 * One measure, one unit, one axis. Each measure gets its own plot rather than
 * sharing a second y-axis with the outcome counts, which would let the reader
 * invent a correlation by choosing the scales.
 */
export default function MeasureSparkline({ points, color = 'var(--accent)' }) {
  const [hover, setHover] = useState(null);

  const model = useMemo(() => {
    const observed = points.filter((p) => p.mean !== null);
    if (observed.length < 2) return null;

    const values = observed.map((p) => p.mean);
    const min = Math.min(...values);
    const max = Math.max(...values);
    const span = max - min || 1;
    const step = (VIEW_W - PAD * 2) / Math.max(points.length - 1, 1);

    const placed = points.map((point, index) => ({
      ...point,
      x: PAD + step * index,
      y:
        point.mean === null
          ? null
          : VIEW_H - PAD - ((point.mean - min) / span) * (VIEW_H - PAD * 2),
    }));

    // Gaps in recording break the line rather than being drawn through: a month
    // with no observations is not a straight line between its neighbours.
    const runs = [];
    let current = [];
    placed.forEach((point) => {
      if (point.y === null) {
        if (current.length > 1) runs.push(current);
        current = [];
      } else {
        current.push(point);
      }
    });
    if (current.length > 1) runs.push(current);

    return { placed, runs, observed: placed.filter((p) => p.y !== null) };
  }, [points]);

  if (!model) {
    return <p className="muted">Not enough observations yet to plot a trend.</p>;
  }

  const hovered = hover === null ? null : model.observed[hover];

  return (
    <div className="chart-frame">
      <svg
        className="chart-svg"
        viewBox={`0 0 ${VIEW_W} ${VIEW_H}`}
        preserveAspectRatio="none"
        role="img"
        aria-label="Monthly mean for this measure"
        style={{ height: 64 }}
        onMouseLeave={() => setHover(null)}
      >
        {model.runs.map((run) => (
          <polyline
            key={run[0].month}
            points={run.map((p) => `${p.x},${p.y}`).join(' ')}
            fill="none"
            stroke={color}
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            vectorEffect="non-scaling-stroke"
          />
        ))}
        {model.observed.map((point, index) => (
          <g key={point.month}>
            <circle
              cx={point.x}
              cy={point.y}
              r={hover === index ? 4.5 : 3}
              fill={color}
              stroke="var(--surface-card)"
              strokeWidth="2"
              vectorEffect="non-scaling-stroke"
            />
            <rect
              x={point.x - 10}
              y={0}
              width={20}
              height={VIEW_H}
              fill="transparent"
              onMouseEnter={() => setHover(index)}
            />
          </g>
        ))}
      </svg>

      {hovered && (
        <div
          className="chart-tooltip"
          style={{ left: `${(hovered.x / VIEW_W) * 100}%`, top: 0 }}
        >
          <h5>{monthTitle(hovered.month)}</h5>
          <div className="chart-tooltip-row">
            <span>Mean</span>
            <b>{hovered.mean}</b>
          </div>
          <div className="chart-tooltip-row">
            <span>Observations</span>
            <b>{hovered.n}</b>
          </div>
        </div>
      )}
    </div>
  );
}
