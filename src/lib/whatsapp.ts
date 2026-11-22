/**
 * WhatsApp click-to-chat link from the number in settings (stage 6). Pure; no third-party script –
 * a plain https://wa.me/<digits> link (WhatsApp's documented format: international number, digits
 * only, no "+", no leading zeros). Null when the number is empty or not plausible.
 */
export function whatsappUrl(raw: string | null | undefined, text?: string): string | null {
  const value = raw?.trim()
  if (!value || value.toUpperCase().startsWith('DOPLNIT')) return null
  let digits = value.replace(/\D/g, '')
  if (value.startsWith('00')) digits = digits.slice(2)
  else if (!value.startsWith('+') && digits.length === 9) digits = `420${digits}`
  if (digits.length < 10 || digits.length > 15) return null
  return `https://wa.me/${digits}${text ? `?text=${encodeURIComponent(text)}` : ''}`
}
