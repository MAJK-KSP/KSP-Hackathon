/**
 * @file App.tsx
 * @description Main React Application component. Manages application routes, session validation, authentication state, loading spinner, and global wrappers.
 * All 8 sidebar routes (Dashboard, Users, Map, Network, Chat, Decision Support, Profile, Settings) are 100% matched and functional.
 */

import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { LanguageProvider } from './LanguageContext';
import { Layout } from './Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Settings } from './components/Settings';
import { AiChat } from './components/AiChat';
import { UserManagement } from './components/UserManagement';
import { GisMap } from './components/GisMap';
import { NetworkAnalysis } from './components/NetworkAnalysis';
import { DecisionSupport } from './components/DecisionSupport';
import { FirGenerator } from './components/FirGenerator';
import { ProtectedRoute } from './components/ProtectedRoute';

interface User {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
  role?: string;
}

// Inner component to access router hooks
const AppContent: React.FC = () => {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  
  const navigate = useNavigate();
  const location = useLocation();

  const checkSession = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        setUser(data.user);
      } else {
        setUser(null);
      }
    } catch (err) {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    checkSession();
  }, []);

  const handleLoginSuccess = (loggedInUser: User) => {
    setUser(loggedInUser);
    navigate('/dashboard');
  };

  const handleLogout = async () => {
    try {
      await fetch('/api/auth/logout', { method: 'POST' });
    } catch (err) {
      console.error('Logout error:', err);
    } finally {
      setUser(null);
      navigate('/');
    }
  };

  if (loading) {
    return (
      <div style={{ 
        display: 'flex', 
        justifyContent: 'center', 
        alignItems: 'center', 
        height: '100vh', 
        backgroundColor: '#070f19',
        color: '#ffffff',
        fontFamily: 'Outfit, sans-serif'
      }}>
        <h2>Loading Security Command Terminal...</h2>
      </div>
    );
  }

  // If not logged in, show login page
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Login onLoginSuccess={handleLoginSuccess} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // If logged in, wrap routes with Layout
  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route
          path="/users"
          element={
            <ProtectedRoute userRole={user.role} allowedRoles={['admin']}>
              <UserManagement />
            </ProtectedRoute>
          }
        />
        <Route path="/map" element={<GisMap />} />
        <Route
          path="/fir-generator"
          element={
            <ProtectedRoute userRole={user.role} allowedRoles={['admin', 'supervisors', 'policymakers']}>
              <FirGenerator />
            </ProtectedRoute>
          }
        />
        <Route
          path="/network"
          element={
            <ProtectedRoute userRole={user.role} allowedRoles={['admin', 'supervisors', 'analysts']}>
              <NetworkAnalysis />
            </ProtectedRoute>
          }
        />
        <Route path="/chat" element={<AiChat isFullPage={true} />} />
        <Route
          path="/decision-support"
          element={
            <ProtectedRoute userRole={user.role} allowedRoles={['admin', 'supervisors', 'investigators']}>
              <DecisionSupport />
            </ProtectedRoute>
          }
        />
        <Route path="/profile" element={<Navigate to="/settings" replace />} />
        <Route path="/settings" element={<Settings user={user} onMfaEnabled={checkSession} />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      {location.pathname !== '/chat' && <AiChat isFullPage={false} />}
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <LanguageProvider>
      <BrowserRouter>
        <AppContent />
      </BrowserRouter>
    </LanguageProvider>
  );
};
export default App;
