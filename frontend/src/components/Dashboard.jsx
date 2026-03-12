import { useCallback, useEffect, useMemo, useState } from 'react';
import { useAuth } from '../context/useAuth';
import { api } from '../api/client';
import StatTiles from './StatTiles';
import OutcomeTrendChart from './charts/OutcomeTrendChart';
import MeasureSparkline from './charts/MeasureSparkline';
import CohortTable from './CohortTable';
import InsightPanel from './InsightPanel';
import OutcomeTable from './OutcomeTable';
import OutcomeForm from './OutcomeForm';
import { OUTCOME_ORDER, OUTCOME_META } from '../lib/outcomes';

export default function Dashboard() {
  const { user, logout } = useAuth();

  const [stats, setStats] = useState(null);
  const [trends, setTrends] = useState(null);
  const [cohorts, setCohorts] = useState(null);
  const [metrics, setMetrics] = useState([]);
  const [summaryError, setSummaryError] = useState('');

  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [formOpen, setFormOpen] = useState(false);

  // Bumped after a save, so every panel refetches even when the page and
  // filter are unchanged; the insight version is bumped by "Refresh" alone.
  const [dataVersion, setDataVersion] = useState(0);
  const [insightsVersion, setInsightsVersion] = useState(0);

  // Each response is stored with the request key it answers. A panel is
  // loading while its stored key is not the current one, and a response for
  // a superseded key is dropped, so a slow page-3 reply cannot overwrite page 1.
  const listKey = `${filter}|${page}|${dataVersion}`;
  const [list, setList] = useState({ key: null, outcomes: [], pagination: null, error: '' });
  const listLoading = list.key !== listKey;

  const insightsKey = `${dataVersion}|${insightsVersion}`;
  const [insights, setInsights] = useState({ key: null, data: null, error: '' });
  const insightsLoading = insights.key !== insightsKey;

  useEffect(() => {
    let cancelled = false;
    const params = { page, limit: 10 };
    if (filter) params.outcome = filter;
    api
      .getOutcomes(params)
      .then((res) => {
        if (cancelled) return;
        setList({ key: listKey, outcomes: res.data.outcomes, pagination: res.data.pagination, error: '' });
      })
      .catch((err) => {
        if (cancelled) return;
        setList({ key: listKey, outcomes: [], pagination: null, error: err.message || 'Failed to load outcomes' });
      });
    return () => {
      cancelled = true;
    };
  }, [filter, page, listKey]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([api.getStats(), api.getTrends({ months: 12 }), api.getCohorts(), api.getMetrics()])
      .then(([statsRes, trendsRes, cohortsRes, metricsRes]) => {
        if (cancelled) return;
        setStats(statsRes.data);
        setTrends(trendsRes.data);
        setCohorts(cohortsRes.data);
        setMetrics(metricsRes.data.metrics);
        setSummaryError('');
      })
      .catch((err) => {
        if (!cancelled) setSummaryError(err.message || 'Failed to load clinic summaries');
      });
    return () => {
      cancelled = true;
    };
  }, [dataVersion]);

  useEffect(() => {
    let cancelled = false;
    api
      .getInsights()
      .then((res) => {
        if (!cancelled) setInsights({ key: insightsKey, data: res.data, error: '' });
      })
      .catch((err) => {
        if (cancelled) return;
        setInsights((prev) => ({
          key: insightsKey,
          data: prev.data,
          error: err.message || 'Failed to generate a summary',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, [insightsKey]);

  const handleCreated = useCallback(() => {
    setFormOpen(false);
    setPage(1);
    setDataVersion((version) => version + 1);
  }, []);

  const closeForm = useCallback(() => setFormOpen(false), []);

  const metricsById = useMemo(
    () => Object.fromEntries(metrics.map((metric) => [metric.id, metric])),
    [metrics]
  );

  const recordedMonths = trends?.months?.filter((month) => month.total > 0).length ?? 0;

  // The measure panel shows the best-evidenced measures rather than every one
  // a clinic happens to have recorded; the rest are counted, not listed.
  const VISIBLE_MEASURES = 3;
  const visibleMeasures = trends?.measures.slice(0, VISIBLE_MEASURES) ?? [];
  const hiddenMeasures = Math.max((trends?.measures.length ?? 0) - VISIBLE_MEASURES, 0);

  return (
    <div className="dashboard">
      <header className="dashboard-header">
        <div className="header-left">
          <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
          </svg>
          <span className="brand-name">Patient Outcome Tracker</span>
        </div>
        <div className="header-right">
          <div className="user-info">
            <span className="user-name">{user.fullName}</span>
            <span className="clinic-name">{user.clinicName}</span>
          </div>
          <button className="btn btn-outline" onClick={logout}>
            Sign out
          </button>
        </div>
      </header>

      <main className="dashboard-main">
        <div className="page-title-row">
          <div>
            <h1>Clinic outcomes</h1>
            <p>
              {user.clinicName} &middot; {recordedMonths} month
              {recordedMonths === 1 ? '' : 's'} of recorded activity
            </p>
          </div>
          <button className="btn btn-primary" onClick={() => setFormOpen(true)}>
            New outcome
          </button>
        </div>

        {[summaryError, list.error].filter(Boolean).map((message) => (
          <div className="error-message" role="alert" key={message}>
            {message}
          </div>
        ))}

        <StatTiles stats={stats} />

        <div className="chart-grid">
          <section className="card">
            <div className="card-head">
              <div>
                <h3>Recorded outcomes by month</h3>
                <p>Last {trends?.windowMonths ?? 12} months, counted by when the outcome was observed</p>
              </div>
            </div>
            <div className="chart-legend">
              {OUTCOME_ORDER.map((key) => (
                <span className="legend-item" key={key}>
                  <i className="swatch" style={{ background: OUTCOME_META[key].color }} />
                  {OUTCOME_META[key].label}
                </span>
              ))}
            </div>
            <div className="chart-plot">
              {trends ? (
                <OutcomeTrendChart months={trends.months} />
              ) : (
                <div className="chart-empty">Loading trend...</div>
              )}
            </div>
          </section>

          <section className="card">
            <div className="card-head">
              <div>
                <h3>Measure trends</h3>
                <p>Monthly mean per measure, read in the direction that counts as better</p>
              </div>
            </div>
            {!trends ? (
              <div className="chart-empty">Loading measures...</div>
            ) : visibleMeasures.length > 0 ? (
              <div className="measure-list">
                {visibleMeasures.map((series) => (
                  <div className="measure-row" key={series.metricId}>
                    <div className="measure-head">
                      <div>
                        <h4>{series.label}</h4>
                        <span className="measure-meta">
                          {series.unit} &middot;{' '}
                          {series.direction === 'lower-is-better' ? 'lower is better' : 'higher is better'}
                        </span>
                      </div>
                      {series.change && (
                        <span
                          className={`measure-delta ${series.change.improving ? 'is-better' : 'is-worse'}`}
                        >
                          {series.change.improving ? '▲' : '▼'} {series.change.from} →{' '}
                          {series.change.to}
                        </span>
                      )}
                    </div>
                    <MeasureSparkline
                      points={series.points}
                      color={
                        series.change?.improving === false
                          ? 'var(--state-declined)'
                          : 'var(--accent)'
                      }
                    />
                  </div>
                ))}
                {hiddenMeasures > 0 && (
                  <div className="measure-row">
                    <p className="muted" style={{ margin: 0 }}>
                      {hiddenMeasures} further measure{hiddenMeasures === 1 ? '' : 's'} recorded
                      with fewer observations.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              <div className="chart-empty">No measures recorded yet.</div>
            )}
          </section>
        </div>

        <InsightPanel
          insights={insights.data}
          loading={insightsLoading}
          error={insightsLoading ? '' : insights.error}
          onRefresh={() => setInsightsVersion((version) => version + 1)}
        />

        <section className="card">
          <div className="card-head">
            <div>
              <h3>Outcomes by diagnosis</h3>
              <p>Cohorts smaller than the suppression floor are grouped, never listed individually</p>
            </div>
          </div>
          <CohortTable data={cohorts} />
        </section>

        <OutcomeTable
          outcomes={list.outcomes}
          pagination={list.pagination}
          metricsById={metricsById}
          loading={listLoading}
          filter={filter}
          onFilterChange={(value) => {
            setFilter(value);
            setPage(1);
          }}
          onPageChange={setPage}
        />
      </main>

      {formOpen && (
        <OutcomeForm
          metrics={metrics}
          onCreated={handleCreated}
          onClose={closeForm}
        />
      )}
    </div>
  );
}
