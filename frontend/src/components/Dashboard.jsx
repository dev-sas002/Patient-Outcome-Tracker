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
  const [outcomes, setOutcomes] = useState([]);
  const [pagination, setPagination] = useState(null);

  const [insights, setInsights] = useState(null);
  const [insightsLoading, setInsightsLoading] = useState(true);
  const [insightsError, setInsightsError] = useState('');

  const [filter, setFilter] = useState('');
  const [page, setPage] = useState(1);
  const [listLoading, setListLoading] = useState(true);
  const [error, setError] = useState('');
  const [formOpen, setFormOpen] = useState(false);

  // The record list reloads on its own when the filter or page changes; the
  // summaries only reload when the underlying data actually changed.
  const loadList = useCallback(async () => {
    setListLoading(true);
    try {
      const params = { page, limit: 10 };
      if (filter) params.outcome = filter;
      const res = await api.getOutcomes(params);
      setOutcomes(res.data.outcomes);
      setPagination(res.data.pagination);
      setError('');
    } catch (err) {
      setError(err.message || 'Failed to load outcomes');
      setOutcomes([]);
    } finally {
      setListLoading(false);
    }
  }, [filter, page]);

  const loadSummaries = useCallback(async () => {
    try {
      const [statsRes, trendsRes, cohortsRes, metricsRes] = await Promise.all([
        api.getStats(),
        api.getTrends({ months: 12 }),
        api.getCohorts(),
        api.getMetrics(),
      ]);
      setStats(statsRes.data);
      setTrends(trendsRes.data);
      setCohorts(cohortsRes.data);
      setMetrics(metricsRes.data.metrics);
    } catch (err) {
      setError(err.message || 'Failed to load clinic summaries');
    }
  }, []);

  const loadInsights = useCallback(async () => {
    setInsightsLoading(true);
    setInsightsError('');
    try {
      const res = await api.getInsights();
      setInsights(res.data);
    } catch (err) {
      setInsightsError(err.message || 'Failed to generate a summary');
    } finally {
      setInsightsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadList();
  }, [loadList]);

  useEffect(() => {
    loadSummaries();
    loadInsights();
  }, [loadSummaries, loadInsights]);

  const handleCreated = useCallback(() => {
    setFormOpen(false);
    setPage(1);
    loadList();
    loadSummaries();
    loadInsights();
  }, [loadList, loadSummaries, loadInsights]);

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
          <h2>Patient Outcome Tracker</h2>
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

        {error && <div className="error-message">{error}</div>}

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
            {visibleMeasures.length > 0 ? (
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
          insights={insights}
          loading={insightsLoading}
          error={insightsError}
          onRefresh={loadInsights}
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
          outcomes={outcomes}
          pagination={pagination}
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
          onClose={() => setFormOpen(false)}
        />
      )}
    </div>
  );
}
