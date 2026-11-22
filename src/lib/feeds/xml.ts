/** Tiny XML writer for the feeds (pure). Everything goes through `escapeXml`. */

/** Characters not allowed in XML 1.0 (control characters except tab, LF, CR). */
const INVALID_XML = /[\u0000-\u0008\u000B\u000C\u000E-\u001F￾￿]/g

export function escapeXml(value: string | number): string {
  return String(value)
    .replace(INVALID_XML, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;')
}

/** `<name>value</name>`, or '' when the value is empty / null. */
export function el(name: string, value: string | number | null | undefined): string {
  if (value === null || value === undefined || value === '') return ''
  return `<${name}>${escapeXml(value)}</${name}>`
}

/** `<name>children</name>` from already rendered children ('' when none). */
export function group(name: string, children: (string | false | null | undefined)[]): string {
  const inner = children.filter(Boolean).join('')
  return inner ? `<${name}>${inner}</${name}>` : ''
}

/** "495.00 CZK" (Google/Meta price format). */
export function money(value: number, currency = 'CZK'): string {
  return `${value.toFixed(2)} ${currency}`
}
