import { Navigate, Route, Routes } from 'react-router-dom';
import { LoginPage } from './pages/LoginPage';
import { CargaDiariaPage } from './pages/CargaDiariaPage';
import { AdminDashboardPage } from './pages/AdminDashboardPage';
import { useAuth } from './hooks/useAuth';
import { LoadingScreen } from './components/ui/LoadingScreen';
import { PwaUpdatePrompt } from './components/PwaUpdatePrompt';

function App() {
  const { profile, loading } = useAuth();

  if (loading) {
    return <><LoadingScreen /><PwaUpdatePrompt /></>;
  }

  return (
    <>
      <Routes>
      <Route
        path="/login"
        element={
          profile
            ? <Navigate to={profile.rol === 'encargado' ? '/carga-diaria' : '/admin'} replace />
            : <LoginPage />
        }
      />
      <Route
        path="/carga-diaria"
        element={profile?.rol === 'encargado' ? <CargaDiariaPage /> : <Navigate to="/login" replace />}
      />
      <Route
        path="/admin"
        element={profile?.rol === 'admin' || profile?.rol === 'gerencial' ? <AdminDashboardPage /> : <Navigate to="/login" replace />}
      />
      <Route path="/*" element={<Navigate to={profile?.rol === 'admin' || profile?.rol === 'gerencial' ? '/admin' : '/carga-diaria'} replace />} />
      </Routes>
      <PwaUpdatePrompt />
    </>
  );
}

export default App;
