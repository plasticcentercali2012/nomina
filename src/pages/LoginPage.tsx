import { useState } from 'react';
import { supabase } from '../lib/supabaseClient';
import { AuthLayout } from '../components/AuthLayout';
import { useNavigate } from 'react-router-dom';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function handleSubmit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setLoading(true);

    const { error: authError } = await supabase.auth.signInWithPassword({
      email,
      password
    });

    if (authError) {
      setError(authError.message);
      setLoading(false);
      return;
    }

    const { data } = await supabase.auth.getSession();
    const userId = data.session?.user.id;

    if (!userId) {
      setError('No se pudo iniciar sesión.');
      setLoading(false);
      return;
    }

    const { data: profile } = await supabase.from('usuarios_sistema').select('rol').eq('id', userId).single();
    const role = profile?.rol;

    if (role === 'encargado') {
      navigate('/carga-diaria');
    } else {
      navigate('/admin');
    }
  }

  return (
    <AuthLayout title="Inicio de Sesión" description="Accede al sistema de nómina protegido por contraseña.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-medium text-slate-200">Correo o usuario</label>
          <input
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="mt-2 w-full rounded-2xl px-4 py-3"
            placeholder="usuario@plasticcenter.com"
            type="email"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-medium text-slate-200">Contraseña</label>
          <input
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-2 w-full rounded-2xl px-4 py-3"
            placeholder="********"
            type="password"
            required
          />
        </div>
        {error && <p className="text-sm text-rose-400">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="w-full rounded-2xl bg-sky-500 px-4 py-3 font-semibold text-white transition hover:bg-sky-400 disabled:cursor-not-allowed disabled:opacity-60"
        >
          {loading ? 'Verificando...' : 'Iniciar sesión'}
        </button>
      </form>
    </AuthLayout>
  );
}
