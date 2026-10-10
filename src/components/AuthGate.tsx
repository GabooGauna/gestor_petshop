import { useEffect, useState, type FormEvent, type ReactNode } from 'react';
import type { Session } from '@supabase/supabase-js';
import { LockKeyhole, Store } from 'lucide-react';
import { supabase } from '../lib/supabase';

export function AuthGate({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(null);
  const [checking, setChecking] = useState(true);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setChecking(false);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setChecking(false);
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const signIn = async (event: FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const { error: signInError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    if (signInError) setError('No pudimos iniciar sesión. Revisá el correo y la contraseña.');
    setSubmitting(false);
  };

  if (checking) {
    return <div className="app-workspace-background grid min-h-screen place-items-center text-slate-500">Verificando sesión…</div>;
  }

  if (!session) {
    return (
      <main className="app-workspace-background grid min-h-screen place-items-center px-5">
        <section className="w-full max-w-sm overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl shadow-slate-300/30">
          <div className="bg-[#0F172A] px-7 py-8 text-white">
            <div className="mb-6 flex items-center gap-3">
              <Store className="h-8 w-8" />
              <div><h1 className="text-xl font-bold">PetStock</h1><p className="text-xs text-slate-400">Acceso al negocio</p></div>
            </div>
            <p className="text-sm leading-6 text-slate-300">Ingresá con la cuenta asignada. El registro público no está habilitado.</p>
          </div>
          <form onSubmit={signIn} className="space-y-4 p-7">
            {error && <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700" role="alert">{error}</div>}
            <label className="block text-sm font-medium text-slate-700">Correo
              <input type="email" required autoComplete="email" value={email} onChange={e => setEmail(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <label className="block text-sm font-medium text-slate-700">Contraseña
              <input type="password" required autoComplete="current-password" value={password} onChange={e => setPassword(e.target.value)} className="mt-1.5 w-full rounded-lg border border-slate-300 px-3 py-2.5 outline-none focus:ring-2 focus:ring-blue-500" />
            </label>
            <button disabled={submitting} className="flex w-full items-center justify-center gap-2 rounded-lg bg-[#2563EB] px-4 py-3 font-semibold text-white hover:bg-blue-700 disabled:opacity-50">
              <LockKeyhole className="h-4 w-4" />{submitting ? 'Ingresando…' : 'Ingresar'}
            </button>
          </form>
        </section>
      </main>
    );
  }

  return children;
}
