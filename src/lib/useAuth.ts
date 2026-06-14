/**
 * useAuth — Supabase-Auth über OTP-Code (kein Magic Link).
 *
 * Harter Login-Gate (Phase 4). signInWithOtp OHNE emailRedirectTo erzwingt
 * einen 6-stelligen Code statt eines Magic Links; verifyOtp erzeugt die
 * Session direkt in der PWA (persistSession via supabaseClient). Ein
 * onAuthStateChange-Listener hält session/user aktuell (Login/Logout/Refresh).
 *
 * Offline-First (Regel 9): Fehlt der Supabase-Client, bleibt loading false und
 * session null — die App wirft nie.
 */

import { useEffect, useState } from 'react';
import type { Session, User } from '@supabase/supabase-js';
import { getSupabase } from './supabaseClient';

export interface AuthState {
  session: Session | null;
  user: User | null;
  loading: boolean;
  /** Sendet einen OTP-Code an die E-Mail (kein Magic Link). */
  sendOtp: (email: string) => Promise<{ error: string | null }>;
  /** Verifiziert den Code und erzeugt die Session. */
  verifyOtp: (email: string, token: string) => Promise<{ error: string | null }>;
  /** Meldet ab. */
  signOut: () => Promise<void>;
}

export function useAuth(): AuthState {
  const [session, setSession] = useState<Session | null>(null);
  // Ohne Backend gar nicht erst "loading" — vermeidet sync setState im Effect.
  const [loading, setLoading] = useState(() => getSupabase() !== null);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;

    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setSession(data.session);
      setLoading(false);
    });

    const { data } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setLoading(false);
    });

    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const sendOtp = async (email: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Kein Backend konfiguriert.' };
    // OHNE emailRedirectTo -> Supabase sendet einen Code, keinen Magic Link.
    const { error } = await supabase.auth.signInWithOtp({ email });
    return { error: error ? error.message : null };
  };

  const verifyOtp = async (email: string, token: string): Promise<{ error: string | null }> => {
    const supabase = getSupabase();
    if (!supabase) return { error: 'Kein Backend konfiguriert.' };
    const { error } = await supabase.auth.verifyOtp({ email, token, type: 'email' });
    return { error: error ? error.message : null };
  };

  const signOut = async (): Promise<void> => {
    const supabase = getSupabase();
    if (supabase) await supabase.auth.signOut();
  };

  return {
    session,
    user: session?.user ?? null,
    loading,
    sendOtp,
    verifyOtp,
    signOut,
  };
}
