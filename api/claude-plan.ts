/**
 * Vercel Serverless Function: POST /api/claude-plan  (STUB, Phase 0)
 *
 * Erstellt/verfeinert ein PlanFramework über die Claude API. Secrets
 * (ANTHROPIC_API_KEY) bleiben serverseitig (Regel 8 — "langsame" KI-Spur).
 * Liefert in Phase 0 bewusst 501 Not Implemented.
 */

export const config = { runtime: 'nodejs' };

export default async function handler(req: Request): Promise<Response> {
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), {
      status: 405,
      headers: { 'content-type': 'application/json', allow: 'POST' },
    });
  }

  // TODO(Phase 1): PlanRequest lesen, Anthropic Messages API aufrufen
  // (Modell: claude-opus-4-8 o. claude-sonnet-4-6), PlanResponse validieren.
  return new Response(
    JSON.stringify({ error: 'not_implemented', message: 'claude-plan ist noch ein Stub (Phase 0).' }),
    { status: 501, headers: { 'content-type': 'application/json' } },
  );
}
