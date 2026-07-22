import React, { useState, useEffect } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useNavigate, useLocation } from 'react-router-dom';
import { ThemeProvider } from './ThemeContext';
import { LanguageProvider } from './LanguageContext';
import { Layout } from './Layout';
import { Login } from './components/Login';
import { Dashboard } from './components/Dashboard';
import { Profile } from './components/Profile';
import { Security } from './components/Security';
import { AiChat } from './components/AiChat';
import { GisMap } from './components/GisMap';
import { NetworkGraphVisualizer } from './components/NetworkGraphVisualizer';

interface User {
  id: string;
  email: string;
  mfa_enabled: boolean;
  created_at: string;
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
        backgroundColor: 'var(--bg-primary, #070f19)',
        color: 'var(--text-primary, #ffffff)',
        fontFamily: 'Outfit, sans-serif'
      }}>
        <h2>Loading Security Command Terminal...</h2>
      </div>
    );
  }

  // If not logged in, they can only see the login page
  if (!user) {
    return (
      <Routes>
        <Route path="/" element={<Login onLoginSuccess={handleLoginSuccess} />} />
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    );
  }

  // If logged in, redirect root to dashboard
  return (
    <Layout user={user} onLogout={handleLogout}>
      <Routes>
        <Route path="/" element={<Navigate to="/dashboard" replace />} />
        <Route path="/dashboard" element={<Dashboard />} />
        <Route path="/profile" element={<Profile />} />
        <Route path="/security" element={<Security user={user} onMfaEnabled={checkSession} />} />
        <Route path="/map" element={<GisMap />} />
        <Route path="/network" element={<NetworkGraphVisualizer />} />
        <Route path="*" element={<Navigate to="/dashboard" replace />} />
      </Routes>
      <AiChat />
    </Layout>
  );
};

export const App: React.FC = () => {
  return (
    <ThemeProvider>
      <LanguageProvider>
        <BrowserRouter>
          <AppContent />
        </BrowserRouter>
      </LanguageProvider>
    </ThemeProvider>
  );
};
export default App;

