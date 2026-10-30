export function json(data: unknown, status = 200, cache = 'no-store'): Response {
  return new Response(JSON.stringify(data), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': cache },
  });
}
export function fail(message: string, status = 400): Response {
  return json({ error: message }, status);
}
export const COUNTRY_RE = /^[a-z]{2}$/;
