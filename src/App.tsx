import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { CargaDiariaPage } from './pages/CargaDiariaPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { useAuth } from './hooks/useAuth';

function App() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <div className="flex min-h-screen items-center justify-center bg-slate-950 text-slate-300">Cargando...</div>;
  }

  return (
    <Routes>
      <Route path="/login" element={<LoginPage />} />
      <Route
        path="/carga-diaria"
        element={profile?.rol === 'encargado' ? <CargaDiariaPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/admin"
        element={profile?.rol === 'admin' ? <AdminDashboardPage /> : <Navigate to="/login" replace />}
      />
      <Route path="/*" element={<Navigate to={profile?.rol === 'admin' ? '/admin' : '/carga-diaria'} replace />} />
    </Routes>
  );
}

export default App;
