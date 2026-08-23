import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';

// Pages
import RoleSelection from './pages/RoleSelection';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import AdminLogin from './pages/AdminLogin';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Notes from './pages/Notes';
import KarmaPoll from './pages/KarmaPoll';
import AdminDashboard from './pages/AdminDashboard';
import AuthCallback from './pages/AuthCallback';
import Unauthorized from './pages/Unauthorized';

// Components
import ProtectedRoute from './components/ProtectedRoute';

export default function App() {
  return (
    <BrowserRouter>
      {/* Toast notifications - top center */}
      <Toaster
        position="top-center"
        toastOptions={{
          style: {
            background: '#1e293b',
            color: '#f1f5f9',
            border: '1px solid #334155',
            borderRadius: '12px',
            fontSize: '14px',
          },
          success: { iconTheme: { primary: '#10b981', secondary: '#fff' } },
          error:   { iconTheme: { primary: '#ef4444', secondary: '#fff' } },
        }}
      />

      <Routes>
        {/* Public routes */}
        <Route path="/"             element={<RoleSelection />} />
        <Route path="/auth/student" element={<Login />} />
        <Route path="/admin/login"  element={<AdminLogin />} />
        <Route path="/auth/callback" element={<AuthCallback />} />
        <Route path="/unauthorized" element={<Unauthorized />} />

        {/* Redirect old login to new login route just in case */}
        <Route path="/login" element={<Navigate to="/auth/student" replace />} />

        {/* Protected student routes */}
        <Route path="/auth/set-password" element={
          <ProtectedRoute>
            <SetPassword />
          </ProtectedRoute>
        } />
        
        <Route path="/auth/student-onboarding" element={
          <ProtectedRoute>
            <Onboarding />
          </ProtectedRoute>
        } />
        
        <Route path="/dashboard" element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        } />
        
        <Route path="/upload" element={
          <ProtectedRoute>
            <Upload />
          </ProtectedRoute>
        } />

        <Route path="/notes" element={
          <ProtectedRoute>
            <Notes />
          </ProtectedRoute>
        } />

        <Route path="/karma-poll" element={
          <ProtectedRoute>
            <KarmaPoll />
          </ProtectedRoute>
        } />

        {/* Protected admin routes */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        {/* 404 fallback */}
        <Route path="*" element={<Navigate to="/" replace />} />
      </Routes>
    </BrowserRouter>
  );
}