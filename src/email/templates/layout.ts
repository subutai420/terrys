/**
 * Shared building blocks of the HTML e-mails (stage 4).
 *
 * Why plain template functions instead of React Email: the e-mails are rendered inside Payload
 * hooks/endpoints and in tests; plain functions need no extra renderer, no react-dom/server in the
 * Next.js server bundle and are trivially unit-testable. The markup follows the e-mail-client
 * rules React Email would produce anyway: table layout, inline styles, max 600 px, web-safe fonts,
 * no SVG, no external CSS, a plain-text alternative for every e-mail.
 */

export const BRAND = {
  red: '#B00004',
  redDark: '#8E0003',
  brown: '#3A2317',
  beige: '#E4DFD8',
  beigeLight: '#EFEBE6',
  gold: '#D19723',
  ink: '#2B1A11',
  muted: '#5F544C',
  line: '#D3CBC1',
}

const FONT = "'Segoe UI', Arial, Helvetica, sans-serif"
const SLAB = "Georgia, 'Times New Roman', serif"

/** Escapes text for HTML. Every value that comes from a customer or the CMS goes through it. */
export function esc(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;')
}

/** Multi-line text (customer note) → escaped HTML with <br>. */
export function escMultiline(value: unknown): string {
  return esc(value).replace(/\r?\n/g, '<br>')
}

export function heading(text: string): string {
  return `<h2 style="margin:28px 0 10px;font-family:${SLAB};font-size:19px;line-height:1.3;color:${BRAND.brown};">${esc(text)}</h2>`
}

export function paragraph(html: string, style = ''): string {
  return `<p style="margin:0 0 12px;font-size:15px;line-height:1.55;color:${BRAND.ink};${style}">${html}</p>`
}

/** Highlighted box (estimate notice, payment info). */
export function notice(html: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:16px 0;border-collapse:collapse;"><tr><td style="background:${BRAND.beigeLight};border-left:4px solid ${BRAND.gold};padding:14px 16px;font-size:14px;line-height:1.55;color:${BRAND.ink};">${html}</td></tr></table>`
}

/** Two-column key/value table. */
export function keyValueTable(rows: [string, string | null | undefined][]): string {
  const body = rows
    .filter(([, value]) => value !== null && value !== undefined && value !== '')
    .map(
      ([key, value]) =>
        `<tr><td style="padding:6px 12px 6px 0;font-size:14px;color:${BRAND.muted};vertical-align:top;white-space:nowrap;">${esc(key)}</td><td style="padding:6px 0;font-size:14px;color:${BRAND.ink};vertical-align:top;">${value}</td></tr>`,
    )
    .join('')
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="border-collapse:collapse;">${body}</table>`
}

export function button(href: string, label: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:16px 0;"><tr><td style="background:${BRAND.red};border-radius:6px;"><a href="${esc(href)}" style="display:inline-block;padding:12px 20px;font-family:${FONT};font-size:15px;font-weight:bold;color:#ffffff;text-decoration:none;">${esc(label)}</a></td></tr></table>`
}

/** Whole e-mail document. `preheader` = the preview text e-mail clients show in the inbox. */
export function emailLayout({
  title,
  preheader,
  body,
  footer,
}: {
  title: string
  preheader: string
  body: string
  footer: string
}): string {
  return `<!DOCTYPE html>
<html lang="cs">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<meta name="x-apple-disable-message-reformatting">
<meta name="color-scheme" content="light">
<title>${esc(title)}</title>
</head>
<body style="margin:0;padding:0;background:${BRAND.beige};font-family:${FONT};color:${BRAND.ink};">
<div style="display:none;max-height:0;overflow:hidden;opacity:0;">${esc(preheader)}</div>
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:${BRAND.beige};border-collapse:collapse;">
<tr><td align="center" style="padding:24px 12px;">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:600px;border-collapse:collapse;">
<tr><td style="background:${BRAND.red};padding:18px 24px;border-radius:6px 6px 0 0;">
<span style="font-family:${SLAB};font-size:24px;font-weight:bold;letter-spacing:2px;color:#ffffff;">TERRYS</span>
<span style="font-family:${FONT};font-size:13px;letter-spacing:3px;color:#f3d9d9;">&nbsp;STEAK</span>
</td></tr>
<tr><td style="background:#ffffff;padding:24px;font-family:${FONT};">
${body}
</td></tr>
<tr><td style="background:${BRAND.brown};padding:18px 24px;border-radius:0 0 6px 6px;font-family:${FONT};font-size:13px;line-height:1.55;color:#eadfd2;">
${footer}
</td></tr>
</table>
</td></tr>
</table>
</body>
</html>`
}
