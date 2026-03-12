import { useState, useEffect } from 'react';
import { useAuth } from '../context/useAuth';
import { api } from '../api/client';

export default function Login() {
  const { login } = useAuth();
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const [showClinicsModal, setShowClinicsModal] = useState(false);
  const [clinics, setClinics] = useState([]);
  const [clinicsLoading, setClinicsLoading] = useState(false);
  const [clinicsError, setClinicsError] = useState('');

  useEffect(() => {
    if (!showClinicsModal) return;
    setClinicsError('');
    setClinicsLoading(true);
    api
      .getClinics()
      .then((res) => setClinics(res.data.clinics || []))
      .catch((err) => setClinicsError(err.message || 'Failed to load clinics'))
      .finally(() => setClinicsLoading(false));
  }, [showClinicsModal]);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setLoading(true);
    try {
      await login(username, password);
    } catch (err) {
      setError(err.message || 'Login failed');
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="login-container">
      <div className="login-card">
        <div className="login-header">
          <div className="login-icon">
            <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M22 12h-4l-3 9L9 3l-3 9H2" />
            </svg>
          </div>
          <h1>Patient Outcome Tracker</h1>
          <p>Sign in to your clinic portal</p>
        </div>

        <form onSubmit={handleSubmit}>
          {error && <div className="error-message">{error}</div>}

          <div className="form-group">
            <label htmlFor="username">Username</label>
            <input
              id="username"
              type="text"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              placeholder="Enter your username"
              required
              autoFocus
            />
          </div>

          <div className="form-group">
            <label htmlFor="password">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="Enter your password"
              required
            />
          </div>

          <button type="submit" className="btn btn-primary btn-block" disabled={loading}>
            {loading ? 'Signing in...' : 'Sign in'}
          </button>

          <button
            type="button"
            className="btn btn-outline btn-block"
            style={{ marginTop: 10 }}
            onClick={() => setShowClinicsModal(true)}
          >
            Clinics
          </button>
        </form>

        {showClinicsModal && (
          <div className="modal-overlay" onClick={() => setShowClinicsModal(false)}>
            <div className="modal-content clinics-modal" onClick={(e) => e.stopPropagation()}>
              <div className="modal-header">
                <h3>Clinics</h3>
                <button
                  type="button"
                  className="btn-close"
                  aria-label="Close"
                  onClick={() => setShowClinicsModal(false)}
                >
                  ×
                </button>
              </div>
              <div className="modal-body">
                {clinicsLoading && <p className="clinics-loading">Loading clinics...</p>}
                {clinicsError && <p className="clinics-error">{clinicsError}</p>}
                {!clinicsLoading && !clinicsError && clinics.length === 0 && (
                  <p className="clinics-empty">No clinics found.</p>
                )}
                {!clinicsLoading && !clinicsError && clinics.length > 0 && (
                  <ul className="clinics-list">
                    {clinics.map((c) => (
                      <li key={c.clinicId || c.name}>{c.name}</li>
                    ))}
                  </ul>
                )}
              </div>
            </div>
          </div>
        )}

        <div className="login-footer">
          <p>Demo accounts</p>
          <div className="demo-accounts">
            <div className="demo-account">
              <strong>Sunrise Medical</strong>
              <span>dr.smith / password123</span>
            </div>
            <div className="demo-account">
              <strong>Bayview Clinic</strong>
              <span>dr.chen / password123</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
