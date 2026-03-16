import { OUTCOME_ORDER, OUTCOME_META, formatPercent } from '../lib/outcomes';

/**
 * Outcome split by diagnosis. The suppression note is rendered, not hidden:
 * a reader needs to know that small cohorts were folded together rather than
 * wondering why a diagnosis they recorded is missing.
 */
export default function CohortTable({ data }) {
  const cohorts = data?.cohorts ?? [];

  if (cohorts.length === 0) {
    return (
      <div className="empty-state">
        <strong>No cohorts yet</strong>
        <span>Diagnosis groups appear once records accumulate.</span>
      </div>
    );
  }

  return (
    <>
      <div className="table-scroll">
        <table className="data-table">
          <thead>
            <tr>
              <th>Diagnosis</th>
              <th>Outcome split</th>
              <th className="num">Records</th>
              <th className="num">Improved</th>
            </tr>
          </thead>
          <tbody>
            {cohorts.map((cohort) => (
              <tr key={cohort.diagnosis} className={cohort.grouped ? 'grouped-row' : undefined}>
                <td>{cohort.diagnosis}</td>
                <td>
                  <div
                    className="cohort-bar"
                    role="img"
                    aria-label={OUTCOME_ORDER.map(
                      (key) => `${OUTCOME_META[key].label} ${cohort[key]}`
                    ).join(', ')}
                  >
                    {OUTCOME_ORDER.map((key) =>
                      cohort[key] > 0 ? (
                        <span
                          key={key}
                          style={{
                            width: `${(cohort[key] / cohort.total) * 100}%`,
                            background: OUTCOME_META[key].color,
                          }}
                        />
                      ) : null
                    )}
                  </div>
                </td>
                <td className="num">{cohort.total}</td>
                <td className="num">{formatPercent(cohort.improvedRate)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      {data?.note && <p className="insight-disclaimer">{data.note}</p>}
    </>
  );
}
