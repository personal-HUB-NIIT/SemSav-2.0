import { BrowserRouter, Routes, Route, Navigate } from 'react-router-dom';
import { Toaster } from 'react-hot-toast';
import { useAuth } from './hooks/useAuth';

// Pages
import LandingPage from './pages/LandingPage';
import IntroPage from './pages/IntroPage';
import RoleSelection from './pages/RoleSelection';
import Login from './pages/Login';
import SetPassword from './pages/SetPassword';
import AdminLogin from './pages/AdminLogin';
import Onboarding from './pages/Onboarding';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Notes from './pages/Notes';
import Attendance from './pages/Attendance';
import KarmaPoll from './pages/KarmaPoll';
import MyClassroom from './pages/MyClassroom';
import AdminDashboard from './pages/AdminDashboard';
import AuthCallback from './pages/AuthCallback';
import Unauthorized from './pages/Unauthorized';
import NotFound from './pages/NotFound';

// Components
import ProtectedRoute from './components/ProtectedRoute';

function LandingRoute() {
  const { session, loading } = useAuth();
  if (loading) {
    return (
      <div className="min-h-screen bg-[#09090b] flex items-center justify-center">
        <div className="w-8 h-8 border-2 border-indigo-500 border-t-transparent rounded-full animate-spin" />
      </div>
    );
  }
  if (session) return <Navigate to="/dashboard" replace />;
  return <LandingPage />;
}

export default function App() {
  return (
    <BrowserRouter>
      {/* Aurora animated background */}
      <div className="aurora-bg" />

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
        <Route path="/"             element={<LandingRoute />} />
        <Route path="/intro" element={<IntroPage />} />
        <Route path="/role" element={<RoleSelection />} />
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

        <Route path="/attendance" element={
          <ProtectedRoute>
            <Attendance />
          </ProtectedRoute>
        } />

        <Route path="/karma-poll" element={
          <ProtectedRoute>
            <KarmaPoll />
          </ProtectedRoute>
        } />

        <Route path="/classroom" element={
          <ProtectedRoute>
            <MyClassroom />
          </ProtectedRoute>
        } />

        {/* Protected admin routes */}
        <Route path="/admin/dashboard" element={
          <ProtectedRoute requireAdmin>
            <AdminDashboard />
          </ProtectedRoute>
        } />

        {/* 404 fallback */}
        <Route path="*" element={<NotFound />} />
      </Routes>
    </BrowserRouter>
  );
}
