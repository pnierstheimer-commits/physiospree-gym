/**
 * accountService — endgültige Account-Löschung (DSGVO Art. 17).
 *
 * Kapselt den Aufruf von POST /api/account/delete (Regel 4 — kein Fetch in der
 * UI). Der Endpoint authentifiziert den Nutzer über sein eigenes Bearer-Token,
 * löscht alle gym_-Daten + den Auth-User. Hier nur der Client-Aufruf.
 */

import { getSupabase } from '../supabaseClient';

const DELETE_ENDPOINT = '/api/account/delete';

/**
 * Löscht den eingeloggten Account unwiderruflich. Wirft bei fehlender Session
 * oder Server-Fehler — die UI zeigt dann den Fehlerhinweis.
 */
export async function deleteAccount(): Promise<void> {
  const supabase = getSupabase();
  if (!supabase) throw new Error('Kein Backend konfiguriert.');

  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error('Nicht angemeldet.');

  const res = await fetch(DELETE_ENDPOINT, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token}` },
  });

  if (!res.ok) {
    let detail = '';
    try {
      const body = (await res.json()) as { message?: string };
      if (body?.message) detail = ` — ${body.message}`;
    } catch {
      /* Body nicht lesbar — generische Meldung reicht. */
    }
    throw new Error(`Account-Löschung fehlgeschlagen (${res.status})${detail}`);
  }
}
