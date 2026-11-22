/**
 * Stage 9: parsing Content-Security-Policy violation reports (pure, tested).
 *
 * Browsers send either the old format (`report-uri`, `{"csp-report": {...}}`, content type
 * application/csp-report) or the Reporting API format (`[{type: "csp-violation", body: {...}}]`).
 * Only the facts needed to adjust the policy are kept; URLs are cut to origin + path (a query
 * string could carry the thank-you token or a search term).
 */
export type CspViolation = {
  directive: string
  blocked: string
  page: string
  source?: string
}

function originAndPath(value: unknown): string {
  if (typeof value !== 'string' || !value) return ''
  if (!/^https?:/i.test(value)) return value.slice(0, 40) // 'inline', 'eval', 'data' …
  try {
    const url = new URL(value)
    const path = url.pathname.replace(
      /\/(objednavka\/dekujeme|api\/gift-vouchers\/pdf)\/[^/]+/,
      '/$1/[token]',
    )
    return `${url.origin}${path}`.slice(0, 200)
  } catch {
    return ''
  }
}

function fromBody(body: Record<string, unknown>): CspViolation | null {
  const directive = String(
    body['effective-directive'] ?? body.effectiveDirective ?? body['violated-directive'] ?? '',
  ).slice(0, 60)
  if (!directive) return null
  const violation: CspViolation = {
    directive,
    blocked: originAndPath(body['blocked-uri'] ?? body.blockedURL),
    page: originAndPath(body['document-uri'] ?? body.documentURL),
  }
  const source = originAndPath(body['source-file'] ?? body.sourceFile)
  if (source) violation.source = source
  return violation
}

export function parseCspReport(input: unknown): CspViolation[] {
  if (!input || typeof input !== 'object') return []
  if (Array.isArray(input)) {
    return input
      .map((entry) =>
        entry && typeof entry === 'object' && (entry as { body?: unknown }).body
          ? fromBody((entry as { body: Record<string, unknown> }).body)
          : null,
      )
      .filter((v): v is CspViolation => v !== null)
  }
  const legacy = (input as Record<string, unknown>)['csp-report']
  if (legacy && typeof legacy === 'object') {
    const violation = fromBody(legacy as Record<string, unknown>)
    return violation ? [violation] : []
  }
  return []
}
