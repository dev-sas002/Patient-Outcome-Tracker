/**
 * Outcome summarisation for a clinician.
 *
 * Two things are non-negotiable here and both are visible on screen: the panel
 * says which provider wrote the summary (a language model, or the deterministic
 * fallback when no key is configured), and it can show the exact aggregate
 * briefing the summary was written from. A decision-support answer whose inputs
 * you cannot inspect is not decision support.
 */
export default function InsightPanel({ insights, loading, error, onRefresh }) {
  const summary = insights?.summary;
  const provider = summary?.provider === 'anthropic' ? 'Claude' : 'Computed';
  const degraded = summary?.degradedFrom;

  return (
    <section className="card insight-card">
      <div className="card-head">
        <div>
          <h3>Outcome summary</h3>
          <p>Decision support for this clinic&apos;s aggregate record, not a diagnosis.</p>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
          <span className="insight-badge" title={degraded ? `Fell back from ${degraded}` : undefined}>
            {loading ? 'Working...' : `${provider}${degraded ? ' (fallback)' : ''}`}
          </span>
          <button className="btn btn-ghost" onClick={onRefresh} disabled={loading}>
            Refresh
          </button>
        </div>
      </div>

      <div className="card-body">
        {error && <div className="error-message">{error}</div>}

        {loading && !summary && (
          <div style={{ display: 'grid', gap: 8 }}>
            <div className="skeleton" style={{ height: 18, width: '55%' }} />
            <div className="skeleton" style={{ height: 13 }} />
            <div className="skeleton" style={{ height: 13, width: '88%' }} />
            <div className="skeleton" style={{ height: 13, width: '72%' }} />
          </div>
        )}

        {summary && (
          <>
            <p className="insight-headline">{summary.headline}</p>
            <ul className="insight-points">
              {summary.points.map((point) => (
                <li key={point}>{point}</li>
              ))}
            </ul>

            <p className="insight-disclaimer">{insights.disclaimer}</p>

            <details className="insight-inputs">
              <summary>Show the figures this summary was written from</summary>
              <pre>{JSON.stringify(insights.briefing, null, 2)}</pre>
            </details>
          </>
        )}
      </div>
    </section>
  );
}
