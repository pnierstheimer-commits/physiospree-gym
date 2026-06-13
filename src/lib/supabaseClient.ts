/**
 * Supabase-Client (clientseitig, nur Anon Key).
 *
 * Offline-First (Regel 9): Der Client wird lazy erzeugt und ist optional.
 * Fehlen die Env-Variablen, läuft die App rein lokal weiter — niemals werfen.
 * Der Service-Role-Key gehört NIE in den Client (nur in /api-Functions).
 */

import { createClient, type SupabaseClient } from '@supabase/supabase-js';

const url = import.meta.env.VITE_SUPABASE_URL as string | undefined;
const anonKey = import.meta.env.VITE_SUPABASE_ANON_KEY as string | undefined;

let client: SupabaseClient | null = null;

/**
 * Gibt den Supabase-Client zurück oder null, wenn nicht konfiguriert.
 * Aufrufer müssen mit null umgehen können (Offline-First).
 */
export function getSupabase(): SupabaseClient | null {
  if (client) return client;
  if (!url || !anonKey) {
    if (import.meta.env.DEV) {
      console.warn(
        '[supabase] VITE_SUPABASE_URL / VITE_SUPABASE_ANON_KEY fehlen — App läuft offline.',
      );
    }
    return null;
  }
  client = createClient(url, anonKey, {
    auth: { persistSession: true, autoRefreshToken: true },
  });
  return client;
}

/** True, wenn ein Supabase-Backend konfiguriert ist. */
export const isSupabaseConfigured = Boolean(url && anonKey);
