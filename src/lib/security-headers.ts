/**
 * Baseline browser protections for every page and API response the Worker
 * produces. They restrict framing, plugin content, base-URL and form-target
 * hijacking, referrer leakage and powerful device APIs. Script and style
 * sources are deliberately not restricted here: server-rendered pages emit
 * inline bootstrap scripts, so a script policy needs per-response nonces.
 */
const CONTENT_SECURITY_POLICY =
  "frame-ancestors 'none'; base-uri 'self'; object-src 'none'; form-action 'self'";
const DEFAULTS: Record<string, string> = {
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  // A stricter route policy, such as the sandbox on attachment downloads, wins.
  'Content-Security-Policy': CONTENT_SECURITY_POLICY,
};

export function withSecurityHeaders(
  response: Response,
  request: Request,
): Response {
  // A WebSocket upgrade carries its socket on the response and has no document.
  if (response.status === 101 || response.webSocket) return response;
  // Copying from the original keeps its status, body encoding and metadata
  // while making the headers mutable.
  const secured = new Response(response.body, response);
  for (const [name, value] of Object.entries(DEFAULTS))
    if (!secured.headers.has(name)) secured.headers.set(name, value);
  if (new URL(request.url).protocol === 'https:')
    secured.headers.set('Strict-Transport-Security', 'max-age=31536000');
  return secured;
}
