import { useState } from 'react';
import { api } from '../api/client';
import { OUTCOME_ORDER, OUTCOME_META } from '../lib/outcomes';

const INITIAL_FORM = {
  patientName: '',
  age: '',
  diagnosis: '',
  treatment: '',
  outcome: 'improved',
  metricId: '',
  metricValue: '',
  notes: '',
};

/**
 * The measure dropdown is populated from `GET /api/outcomes/metrics`, not from
 * a list hardcoded here. Adding a measure server-side makes it appear in this
 * form with its own unit and range, with no frontend change.
 */
export default function OutcomeForm({ metrics, onCreated, onClose }) {
  const [form, setForm] = useState(INITIAL_FORM);
  const [error, setError] = useState('');
  const [saving, setSaving] = useState(false);

  const selectedMetric = metrics.find((metric) => metric.id === form.metricId) || null;

  function handleChange(event) {
    const { name, value } = event.target;
    setForm((prev) => ({ ...prev, [name]: value }));
  }

  async function handleSubmit(event) {
    event.preventDefault();
    setError('');
    setSaving(true);
    try {
      const payload = {
        patientName: form.patientName,
        diagnosis: form.diagnosis,
        treatment: form.treatment,
        outcome: form.outcome,
      };
      if (form.age) payload.age = Number.parseInt(form.age, 10);
      if (form.notes) payload.notes = form.notes;
      if (form.metricId && form.metricValue !== '') {
        payload.measures = { [form.metricId]: Number(form.metricValue) };
      }

      await api.createOutcome(payload);
      setForm(INITIAL_FORM);
      onCreated?.();
    } catch (err) {
      setError(err.data?.errors?.map((e) => e.message).join(', ') || err.message);
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="modal-content"
        role="dialog"
        aria-modal="true"
        aria-label="Record a new patient outcome"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-header">
          <h3>Record a patient outcome</h3>
          <button type="button" className="btn-close" aria-label="Close" onClick={onClose}>
            &times;
          </button>
        </div>

        <form className="modal-body" onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="patientName">Patient name *</label>
              <input
                id="patientName"
                name="patientName"
                value={form.patientName}
                onChange={handleChange}
                placeholder="Full name"
                required
              />
            </div>
            <div className="form-group">
              <label htmlFor="age">Age</label>
              <input
                id="age"
                name="age"
                type="number"
                min="0"
                max="150"
                value={form.age}
                onChange={handleChange}
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="diagnosis">Diagnosis *</label>
            <input
              id="diagnosis"
              name="diagnosis"
              value={form.diagnosis}
              onChange={handleChange}
              placeholder="Primary diagnosis"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="treatment">Treatment *</label>
            <input
              id="treatment"
              name="treatment"
              value={form.treatment}
              onChange={handleChange}
              placeholder="Treatment administered"
              required
            />
          </div>

          <div className="form-group">
            <label htmlFor="outcome">Outcome *</label>
            <select id="outcome" name="outcome" value={form.outcome} onChange={handleChange}>
              {OUTCOME_ORDER.map((key) => (
                <option key={key} value={key}>
                  {OUTCOME_META[key].label}
                </option>
              ))}
            </select>
          </div>

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="metricId">Outcome measure</label>
              <select id="metricId" name="metricId" value={form.metricId} onChange={handleChange}>
                <option value="">None</option>
                {metrics.map((metric) => (
                  <option key={metric.id} value={metric.id}>
                    {metric.label}
                  </option>
                ))}
              </select>
            </div>
            <div className="form-group">
              <label htmlFor="metricValue">Value</label>
              <input
                id="metricValue"
                name="metricValue"
                type="number"
                step="any"
                min={selectedMetric?.min}
                max={selectedMetric?.max}
                value={form.metricValue}
                onChange={handleChange}
                disabled={!selectedMetric}
              />
              {selectedMetric && (
                <span className="field-hint">
                  {selectedMetric.min}-{selectedMetric.max} {selectedMetric.unit}
                </span>
              )}
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes">Notes</label>
            <textarea
              id="notes"
              name="notes"
              value={form.notes}
              onChange={handleChange}
              placeholder="Additional notes"
              rows={3}
            />
          </div>

          <div className="form-actions">
            <button type="button" className="btn btn-outline" onClick={onClose}>
              Cancel
            </button>
            <button type="submit" className="btn btn-primary" disabled={saving}>
              {saving ? 'Saving...' : 'Save outcome'}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
