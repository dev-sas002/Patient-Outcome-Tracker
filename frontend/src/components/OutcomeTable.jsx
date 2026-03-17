import { OUTCOME_ORDER, OUTCOME_META, formatDate } from '../lib/outcomes';

function MeasureChips({ measures, metricsById }) {
  const entries = Object.entries(measures || {});
  if (entries.length === 0) return <span className="muted">-</span>;
  return (
    <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
      {entries.map(([id, value]) => {
        const definition = metricsById[id];
        return (
          <span className="measure-chip" key={id} title={definition?.label || id}>
            {definition?.short || id} <b>{value}</b>
          </span>
        );
      })}
    </div>
  );
}

export default function OutcomeTable({
  outcomes,
  pagination,
  metricsById,
  loading,
  filter,
  onFilterChange,
  onPageChange,
}) {
  const page = pagination?.page ?? 1;
  const pages = pagination?.pages ?? 1;
  const total = pagination?.total ?? 0;

  return (
    <section className="card">
      <div className="card-head">
        <div>
          <h3>Patient outcomes</h3>
          <p>
            {total.toLocaleString()} record{total === 1 ? '' : 's'}
            {filter ? ` filtered to ${OUTCOME_META[filter].label.toLowerCase()}` : ''}
          </p>
        </div>
        <div className="list-toolbar">
          <label className="muted" htmlFor="outcome-filter">
            Outcome
          </label>
          <select
            id="outcome-filter"
            className="select-control"
            value={filter}
            onChange={(event) => onFilterChange(event.target.value)}
          >
            <option value="">All outcomes</option>
            {OUTCOME_ORDER.map((key) => (
              <option key={key} value={key}>
                {OUTCOME_META[key].label}
              </option>
            ))}
          </select>
        </div>
      </div>

      {loading && outcomes.length === 0 ? (
        <div className="card-body" style={{ display: 'grid', gap: 8 }}>
          {[0, 1, 2, 3, 4].map((row) => (
            <div key={row} className="skeleton" style={{ height: 34 }} />
          ))}
        </div>
      ) : outcomes.length === 0 ? (
        <div className="empty-state">
          <strong>No records match this view</strong>
          <span>
            {filter
              ? 'Clear the outcome filter to see every record.'
              : 'Add the first outcome with "New outcome".'}
          </span>
        </div>
      ) : (
        <div className="table-scroll">
          <table className="data-table">
            <thead>
              <tr>
                <th>Patient</th>
                <th>Diagnosis</th>
                <th>Treatment</th>
                <th>Measure</th>
                <th>Outcome</th>
                <th>Recorded</th>
                <th>By</th>
              </tr>
            </thead>
            <tbody>
              {outcomes.map((row) => (
                <tr key={row._id}>
                  <td>
                    <div className="patient-cell">
                      <strong>{row.patientName}</strong>
                      {row.age != null && <span>{row.age} yrs</span>}
                    </div>
                  </td>
                  <td>
                    <span className="truncate" title={row.diagnosis}>
                      {row.diagnosis}
                    </span>
                  </td>
                  <td>
                    <span className="truncate" title={row.treatment}>
                      {row.treatment}
                    </span>
                  </td>
                  <td>
                    <MeasureChips measures={row.measures} metricsById={metricsById} />
                  </td>
                  <td>
                    <span className={`outcome-pill ${OUTCOME_META[row.outcome].className}`}>
                      <i className="swatch" style={{ background: OUTCOME_META[row.outcome].color }} />
                      {OUTCOME_META[row.outcome].label}
                    </span>
                  </td>
                  <td style={{ whiteSpace: 'nowrap' }}>{formatDate(row.recordedAt)}</td>
                  <td className="muted" style={{ whiteSpace: 'nowrap' }}>
                    {row.createdBy}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {pages > 1 && (
        <div className="pagination-bar">
          <span>
            Page {page} of {pages}
          </span>
          <div className="pagination-controls">
            <button
              className="btn btn-outline"
              onClick={() => onPageChange(page - 1)}
              disabled={page <= 1 || loading}
            >
              Previous
            </button>
            <button
              className="btn btn-outline"
              onClick={() => onPageChange(page + 1)}
              disabled={page >= pages || loading}
            >
              Next
            </button>
          </div>
        </div>
      )}
    </section>
  );
}
