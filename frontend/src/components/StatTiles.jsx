import { OUTCOME_ORDER, OUTCOME_META, formatPercent } from '../lib/outcomes';

function Tile({ label, swatch, value, sub }) {
  return (
    <div className="card stat-tile">
      <div className="stat-label">
        {swatch && <i className={`swatch swatch-${swatch}`} />}
        {label}
      </div>
      <div className="stat-value">{value}</div>
      <div className="stat-sub">{sub}</div>
    </div>
  );
}

export default function StatTiles({ stats }) {
  const total = stats?.total ?? 0;
  const share = (n) => (total ? formatPercent(n / total) : '-');

  return (
    <div className="stat-grid">
      <Tile
        label="Total records"
        value={total.toLocaleString()}
        sub={total ? 'across this clinic' : 'nothing recorded yet'}
      />
      {OUTCOME_ORDER.map((key) => (
        <Tile
          key={key}
          label={OUTCOME_META[key].label}
          swatch={OUTCOME_META[key].className}
          value={(stats?.[key] ?? 0).toLocaleString()}
          sub={`${share(stats?.[key] ?? 0)} of records`}
        />
      ))}
    </div>
  );
}
