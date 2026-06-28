/**
 * Response headers for serving stored media bytes from a PUBLIC endpoint.
 *
 * SECURITY: a user-uploaded SVG (or XML) served inline with its own
 * `image/svg+xml` content type executes any embedded `<script>` in the app's
 * own origin — stored XSS on an unauthenticated surface. For those types we
 * force a download (`Content-Disposition: attachment`) and sandbox them via CSP
 * so they can never render in the app security context. `X-Content-Type-Options:
 * nosniff` is set for ALL media so the browser can't MIME-sniff bytes into an
 * executable type (e.g. a "png" that is really HTML).
 */
const DANGEROUS_INLINE_MIME = new Set(['image/svg+xml', 'text/xml', 'application/xml']);

export function buildMediaServingHeaders(
  mimeType: string,
  sizeBytes: number
): Record<string, string> {
  const headers: Record<string, string> = {
    'Content-Type': mimeType,
    'Content-Length': String(sizeBytes),
    'Cache-Control': 'public, max-age=300, must-revalidate',
    'X-Content-Type-Options': 'nosniff'
  };
  if (DANGEROUS_INLINE_MIME.has(mimeType.trim().toLowerCase())) {
    headers['Content-Disposition'] = 'attachment';
    headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
  }
  return headers;
}
