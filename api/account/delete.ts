/**
 * Vercel Serverless Function: POST /api/account/delete
 *
 * Vollständige Account-Löschung (DSGVO Art. 17). Leert ALLE gym_-Tabellen für
 * die user_id des Aufrufers und löscht anschließend den Auth-User.
 *
 * Sicherheit (CLAUDE.md, Konventionen):
 * - Der Aufrufer authentifiziert sich mit seinem eigenen Access-Token
 *   (Authorization: Bearer <token>). Die user_id wird serverseitig aus dem
 *   Token aufgelöst — ein Nutzer kann ausschließlich SICH SELBST löschen,
 *   niemals eine fremde user_id.
 * - Der Service-Role-Key (umgeht RLS + Admin-API) liegt NUR serverseitig.
 *
 * Löschreihenfolge: erst abhängige Tabellen (Foreign Keys), gym_user_profiles
 * zuletzt, danach auth.users. So bricht keine FK-Beziehung mid-delete.
 */

import { createClient } from '@supabase/supabase-js';
import type { VercelRequest, VercelResponse } from '@vercel/node';

export const config = { runtime: 'nodejs', maxDuration: 30 };

/**
 * Alle gym_-Tabellen in Löschreihenfolge: Kinder vor Eltern.
 *   gym_workout_sets      -> gym_workout_exercises (FK, CASCADE)
 *   gym_workout_exercises -> gym_workouts          (FK, CASCADE)
 *   gym_checkins          -> gym_workouts          (FK, SET NULL)
 *   gym_plan_weeks        -> gym_plan_frameworks    (FK, CASCADE)
 * gym_coach_actions / gym_chat_messages sind unabhängig.
 * gym_user_profiles steht ZULETZT (vor auth.users).
 */
const GYM_TABLES_DELETE_ORDER = [
  'gym_workout_sets',
  'gym_workout_exercises',
  'gym_checkins',
  'gym_workouts',
  'gym_plan_weeks',
  'gym_plan_frameworks',
  'gym_coach_actions',
  'gym_chat_messages',
  'gym_user_profiles',
] as const;

function sendJson(res: VercelResponse, status: number, body: unknown): void {
  res.status(status).json(body);
}

function bearerToken(req: VercelRequest): string | null {
  const raw = req.headers['authorization'] ?? req.headers['Authorization' as 'authorization'];
  const header = Array.isArray(raw) ? raw[0] : raw;
  if (!header) return null;
  const m = /^Bearer\s+(.+)$/i.exec(header.trim());
  return m ? m[1].trim() : null;
}

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.setHeader('Allow', 'POST');
    sendJson(res, 405, { error: 'method_not_allowed' });
    return;
  }

  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    // TEMP DEBUG (wird direkt nach der Messung wieder entfernt): nur KEY-NAMEN,
    // niemals Werte — zeigt, welche Env-Variablen die Lambda tatsächlich sieht.
    sendJson(res, 500, {
      error: 'config_error',
      message: 'SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY sind serverseitig nicht gesetzt.',
      debug: {
        hasSupabaseUrl: !!process.env.SUPABASE_URL,
        hasViteUrl: !!process.env.VITE_SUPABASE_URL,
        hasServiceKey: !!process.env.SUPABASE_SERVICE_ROLE_KEY,
        relevantKeyNames: Object.keys(process.env)
          .filter((k) => /sup|vite|anthro|role|service|key/i.test(k))
          .sort(),
        allKeyNames: Object.keys(process.env).sort(),
      },
    });
    return;
  }

  const token = bearerToken(req);
  if (!token) {
    sendJson(res, 401, { error: 'unauthorized', message: 'Bearer-Token fehlt.' });
    return;
  }

  // Admin-Client (Service Role): umgeht RLS + erlaubt die Admin-Auth-API.
  const admin = createClient(url, serviceKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  // user_id aus dem Token auflösen — verhindert Löschen fremder Accounts.
  const { data: userData, error: userErr } = await admin.auth.getUser(token);
  const userId = userData?.user?.id;
  if (userErr || !userId) {
    sendJson(res, 401, { error: 'unauthorized', message: 'Token ungültig oder abgelaufen.' });
    return;
  }

  // 1) Alle gym_-Tabellen leeren (Kinder zuerst, Profile zuletzt).
  const deleted: Record<string, boolean> = {};
  for (const table of GYM_TABLES_DELETE_ORDER) {
    const { error } = await admin.from(table).delete().eq('user_id', userId);
    if (error) {
      sendJson(res, 500, {
        error: 'delete_failed',
        message: `Löschen aus ${table} fehlgeschlagen: ${error.message}`,
        table,
        deleted,
      });
      return;
    }
    deleted[table] = true;
  }

  // 2) Auth-User löschen (Supabase Admin API).
  const { error: authErr } = await admin.auth.admin.deleteUser(userId);
  if (authErr) {
    sendJson(res, 500, {
      error: 'auth_delete_failed',
      message: `Auth-User konnte nicht gelöscht werden: ${authErr.message}`,
      deleted,
    });
    return;
  }

  sendJson(res, 200, { ok: true, userId, tables: Object.keys(deleted) });
}
