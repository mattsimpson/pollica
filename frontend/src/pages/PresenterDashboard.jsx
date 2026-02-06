import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { sessionService, adminService } from '../services/api';

function PresenterDashboard({ user }) {
  const [sessions, setSessions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [newSession, setNewSession] = useState({ title: '', description: '' });
  const navigate = useNavigate();

  // Admin filter state
  const [presenters, setPresenters] = useState([]);
  const [filters, setFilters] = useState({
    search: '',
    presenterId: '',
    status: ''
  });

  const isAdmin = user?.role === 'admin';

  useEffect(() => {
    loadSessions();
    if (isAdmin) {
      loadPresenters();
    }
  }, [isAdmin]);

  useEffect(() => {
    if (isAdmin) {
      loadSessions();
    }
  }, [filters, isAdmin]);

  const loadPresenters = async () => {
    try {
      const response = await adminService.getUsers();
      setPresenters(response.data.users);
    } catch (err) {

    }
  };

  const loadSessions = async () => {
    try {
      let response;
      if (isAdmin) {
        const params = {};
        if (filters.search) params.search = filters.search;
        if (filters.presenterId) params.presenterId = filters.presenterId;
        if (filters.status) params.status = filters.status;
        response = await adminService.getAllSessions(params);
      } else {
        response = await sessionService.getMySessions();
      }
      setSessions(response.data.sessions);
      setError('');
    } catch (err) {
      setError('Failed to load sessions');
    } finally {
      setLoading(false);
    }
  };

  const handleCreateSession = async (e) => {
    e.preventDefault();
    try {
      await sessionService.createSession(newSession);
      setShowCreateModal(false);
      setNewSession({ title: '', description: '' });
      loadSessions();
    } catch (err) {
      setError('Failed to create session');
    }
  };

  const handleSessionClick = (sessionId) => {
    navigate(`/presenter/session/${sessionId}`);
  };

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <div className="main-content">
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '2rem' }}>
        <h1>{isAdmin ? 'All Sessions' : 'My Sessions'}</h1>
        <button className="btn btn-primary" onClick={() => setShowCreateModal(true)}>
          Create New Session
        </button>
      </div>

      {isAdmin && (
        <div className="filter-bar">
          <input
            type="text"
            className="form-input"
            placeholder="Search by title..."
            value={filters.search}
            onChange={(e) => setFilters({ ...filters, search: e.target.value })}
            style={{ maxWidth: '250px' }}
          />
          <select
            className="form-select"
            value={filters.presenterId}
            onChange={(e) => setFilters({ ...filters, presenterId: e.target.value })}
            style={{ maxWidth: '200px' }}
          >
            <option value="">All Presenters</option>
            {presenters.map((p) => (
              <option key={p.id} value={p.id}>
                {p.firstName} {p.lastName}
              </option>
            ))}
          </select>
          <select
            className="form-select"
            value={filters.status}
            onChange={(e) => setFilters({ ...filters, status: e.target.value })}
            style={{ maxWidth: '150px' }}
          >
            <option value="">All Status</option>
            <option value="open">Open</option>
            <option value="closed">Closed</option>
          </select>
        </div>
      )}

      {error && (
        <div className="alert alert-error">{error}</div>
      )}

      <div className="grid grid-2">
        {sessions.map((session) => (
          <div
            key={session.id}
            className="card"
            style={{ cursor: 'pointer' }}
            onClick={() => handleSessionClick(session.id)}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'start' }}>
              <h3>{session.title}</h3>
              <span className={`badge ${session.is_active ? 'badge-active' : 'badge-inactive'}`}>
                {session.is_active ? 'Active' : 'Closed'}
              </span>
            </div>
            {session.description && (
              <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>{session.description}</p>
            )}
            <div style={{ marginTop: '0.5rem', display: 'flex', gap: '1rem', fontSize: '0.875rem', color: '#6b7280' }}>
              <span>{session.question_count} questions</span>
              <span>{session.participant_count} participants</span>
            </div>
            <div style={{ marginTop: '0.5rem', display: 'flex', justifyContent: 'space-between', fontSize: '0.875rem', color: '#9ca3af' }}>
              <span>Created {new Date(session.created_at).toLocaleDateString()}</span>
              {(isAdmin || session.presenter_first_name) && (
                <span>{session.presenter_first_name} {session.presenter_last_name}</span>
              )}
            </div>
          </div>
        ))}
      </div>

      {sessions.length === 0 && (
        <div className="card" style={{ textAlign: 'center', padding: '3rem' }}>
          <h3>No sessions yet</h3>
          <p style={{ color: '#6b7280', marginTop: '0.5rem' }}>
            Create your first session to get started
          </p>
        </div>
      )}

      {showCreateModal && (
        <div className="modal-overlay" onClick={() => setShowCreateModal(false)}>
          <div className="modal" onClick={(e) => e.stopPropagation()}>
            <div className="modal-header">
              <h2 className="modal-title">Create New Session</h2>
              <button className="close-btn" onClick={() => setShowCreateModal(false)}>&times;</button>
            </div>

            <form onSubmit={handleCreateSession}>
              <div className="form-group">
                <label className="form-label">Session Title</label>
                <input
                  type="text"
                  className="form-input"
                  value={newSession.title}
                  onChange={(e) => setNewSession({ ...newSession, title: e.target.value })}
                  required
                  autoFocus
                />
              </div>

              <div className="form-group">
                <label className="form-label">Description (optional)</label>
                <textarea
                  className="form-textarea"
                  value={newSession.description}
                  onChange={(e) => setNewSession({ ...newSession, description: e.target.value })}
                />
              </div>

              <div style={{ display: 'flex', gap: '1rem', justifyContent: 'flex-end' }}>
                <button
                  type="button"
                  className="btn btn-secondary"
                  onClick={() => setShowCreateModal(false)}
                >
                  Cancel
                </button>
                <button type="submit" className="btn btn-primary">
                  Create Session
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}

export default PresenterDashboard;
