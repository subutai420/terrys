import QRCode from 'qrcode'

/**
 * Renders a QR Platba (SPAYD) string as a PNG, ready to embed in an e-mail as an inline (CID)
 * attachment.
 *
 * - Error correction level **M** (~15 % of the code may be damaged), as the QR Platba
 *   specification recommends for printed output (https://qr-platba.cz/pro-vyvojare/specifikace-formatu/).
 * - Black modules on white with a 4-module white quiet zone (the minimum the QR standard
 *   requires) – banking apps scan it reliably also from a dark-mode e-mail client.
 * - Default width 360 px: big enough to scan from a phone screen, small enough for e-mail.
 *
 * Library: `qrcode` (MIT, https://github.com/soldair/node-qrcode). The byte/alphanumeric mode is
 * chosen automatically from the content.
 */
export async function spaydQrPng(spayd: string, opts?: { size?: number }): Promise<Buffer> {
  return QRCode.toBuffer(spayd, {
    type: 'png',
    errorCorrectionLevel: 'M',
    margin: 4,
    width: opts?.size ?? 360,
    color: { dark: '#000000ff', light: '#ffffffff' },
  })
}
