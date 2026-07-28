import { useEffect, useState } from 'react';
import { Session, User } from '@supabase/supabase-js';
import { supabase } from '../lib/supabaseClient';
import { UsuarioSistema } from '../types';

export function useAuth() {
  const [session, setSession] = useState<Session | null>(null);
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UsuarioSistema | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchProfile(userId: string) {
      const { data } = await supabase.from('usuarios_sistema').select('*').eq('id', userId).single();
      const profileData = data as UsuarioSistema | null;
      setProfile(profileData);
    }

    async function init() {
      const { data } = await supabase.auth.getSession();
      setSession(data.session);
      setUser(data.session?.user ?? null);
      if (data.session?.user) {
        await fetchProfile(data.session.user.id);
      }
      setLoading(false);
    }

    init();

    const {
      data: { subscription }
    } = supabase.auth.onAuthStateChange(async (_event, authSession) => {
      setSession(authSession);
      setUser(authSession?.user ?? null);
      if (authSession?.user) {
        await fetchProfile(authSession.user.id);
      } else {
        setProfile(null);
      }
    });

    return () => subscription?.unsubscribe();
  }, []);

  async function signOut() {
    await supabase.auth.signOut();
    setProfile(null);
    setUser(null);
    setSession(null);
  }

  return {
    session,
    user,
    profile,
    loading,
    signOut
  };
}
