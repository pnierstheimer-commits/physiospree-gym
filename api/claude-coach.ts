/**
 * Vercel Serverless Function: POST /api/claude-coach  (STUB, Phase 0)
 *
 * Adaptive Coach-Empfehlungen (Progression, Deload, Erholung) über die Claude
 * API — ergänzt die deterministische Logik aus coachService (Regel 8).
 * Secrets bleiben serverseitig. Liefert in Phase 0 bewusst 501.
 */

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json', allow: 'POST' },
    });
  }

  // TODO(Phase 1): Workout-/Check-in-Kontext lesen, Anthropic Messages API
  // aufrufen, CoachAction[] zurückgeben.
  return new Response(
    JSON.stringify({ error: 'not_implemented', message: 'claude-coach ist noch ein Stub (Phase 0).' }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
}
