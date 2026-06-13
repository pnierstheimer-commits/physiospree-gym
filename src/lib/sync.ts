/**
 * Sync localStorage <-> Supabase (STUB, Phase 0).
 *
 * Strategie (Regel 5): jede Entität trägt id (UUID) + updatedAt. Sync läuft
 * additiv und non-blocking (Regel 9) — Last-Write-Wins über updatedAt,
 * Soft-Delete über deletedAt. Hier nur Signaturen, Implementierung folgt.
 */

import { getSupabase } from './supabaseClient';
import type { PersistedState } from '../shared/types';

export interface SyncResult {
  ok: boolean;
  pushed: number;
  pulled: number;
  syncedAt: string;
  error?: string;
}

/**
 * Push lokaler Änderungen seit lastSyncedAt nach Supabase.
 * TODO(Phase 1): pro Tabelle Upsert mit updatedAt-Vergleich.
 */
export async function pushChanges(_state: PersistedState): Promise<SyncResult> {
  const now = new Date().toISOString();
  if (!getSupabase()) {
    return { ok: false, pushed: 0, pulled: 0, syncedAt: now, error: 'offline' };
  }
  // Stub: noch nicht implementiert.
  return { ok: false, pushed: 0, pulled: 0, syncedAt: now, error: 'not_implemented' };
}

/**
 * Pull serverseitiger Änderungen seit lastSyncedAt und Merge in den State.
 * TODO(Phase 1): Konfliktauflösung Last-Write-Wins über updatedAt.
 */
export async function pullChanges(state: PersistedState): Promise<PersistedState> {
  // Stub: gibt unveränderten State zurück.
  return state;
}

/**
 * Vollständiger Sync-Durchlauf (push + pull). Darf die UI nie blockieren.
 * TODO(Phase 1): orchestriert pushChanges + pullChanges, setzt lastSyncedAt.
 */
export async function fullSync(state: PersistedState): Promise<SyncResult> {
  return pushChanges(state);
}
