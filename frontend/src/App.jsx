import React, { useState, useEffect } from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from 'react-router-dom';
import Navbar from './components/Navbar';
import Login from './components/Login';
import PresenterDashboard from './pages/PresenterDashboard';
import PresenterSession from './pages/PresenterSession';
import AudiencePage from './pages/AudiencePage';
import AdminUsers from './pages/AdminUsers';
import { authService } from './services/api';
import './styles/App.css';

// Wrapper component to conditionally render Navbar
function AppContent({ user, setUser }) {
  const location = useLocation();
  const isAudiencePage = location.pathname.startsWith('/go/');

  return (
    <div className="app-container">
      {!isAudiencePage && <Navbar user={user} setUser={setUser} />}
      <Routes>
        <Route
          path="/"
          element={
            user ? (
              <Navigate to="/presenter/dashboard" replace />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        <Route
          path="/login"
          element={user ? <Navigate to="/presenter/dashboard" replace /> : <Login setUser={setUser} />}
        />

        {/* Presenter Routes (accessible by both presenter and admin) */}
        <Route
          path="/presenter/dashboard"
          element={
            user?.role === 'presenter' || user?.role === 'admin' ? (
              <PresenterDashboard user={user} />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />
        <Route
          path="/presenter/session/:sessionId"
          element={
            user?.role === 'presenter' || user?.role === 'admin' ? (
              <PresenterSession />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Admin-only Routes */}
        <Route
          path="/admin/users"
          element={
            user?.role === 'admin' ? (
              <AdminUsers />
            ) : (
              <Navigate to="/login" replace />
            )
          }
        />

        {/* Anonymous audience route */}
        <Route path="/go/:code" element={<AudiencePage />} />

        {/* 404 */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </div>
  );
}

function App() {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const validateSession = async () => {
      const token = localStorage.getItem('token');
      if (token) {
        try {
          // Validate token against server and refresh user data
          const response = await authService.getProfile();
          const profile = response.data;
          const userData = {
            id: profile.id,
            email: profile.email,
            role: profile.role,
            firstName: profile.firstName,
            lastName: profile.lastName
          };
          localStorage.setItem('user', JSON.stringify(userData));
          setUser(userData);
        } catch (err) {
          // Token invalid or expired — clear and force re-login
          localStorage.removeItem('user');
          localStorage.removeItem('token');
          setUser(null);
        }
      }
      setLoading(false);
    };

    validateSession();

    // Register service worker for PWA
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker.register('/service-worker.js').catch(() => {});
    }
  }, []);

  if (loading) {
    return <div className="loading">Loading...</div>;
  }

  return (
    <Router>
      <AppContent user={user} setUser={setUser} />
    </Router>
  );
}

export default App;
