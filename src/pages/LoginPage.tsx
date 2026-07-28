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

    const { data: profile, error: profileError } = await supabase
      .from('usuarios_sistema')
      .select('rol')
      .eq('id', userId)
      .single();

    if (profileError || !profile) {
      await supabase.auth.signOut();
      setError('El usuario inició sesión, pero no tiene un perfil válido en usuarios_sistema.');
      setLoading(false);
      return;
    }

    const role = profile?.rol;

    if (role === 'encargado') {
      navigate('/carga-diaria');
    } else if (role === 'admin' || role === 'gerencial') {
      navigate('/admin');
    } else {
      await supabase.auth.signOut();
      setError('El perfil del usuario no tiene un rol permitido.');
      setLoading(false);
    }
  }

  return (
    <AuthLayout title="Inicio de Sesión" description="Accede al sistema de nómina protegido por contraseña.">
      <form className="space-y-5" onSubmit={handleSubmit}>
        <div>
          <label className="block text-sm font-semibold text-slate-300">Correo electrónico</label>
          <input
            autoComplete="username"
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            className="field mt-2"
            placeholder="usuario@plasticcenter.com"
            type="email"
            required
          />
        </div>
        <div>
          <label className="block text-sm font-semibold text-slate-300">Contraseña</label>
          <input
            autoComplete="current-password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="field mt-2"
            placeholder="********"
            type="password"
            required
          />
        </div>
        {error && <p role="alert" className="rounded-xl border border-rose-500/20 bg-rose-500/10 p-3 text-sm text-rose-300">{error}</p>}
        <button
          type="submit"
          disabled={loading}
          className="btn-primary w-full"
        >
          {loading ? 'Verificando...' : 'Iniciar sesión'}
        </button>
      </form>
    </AuthLayout>
  );
}
