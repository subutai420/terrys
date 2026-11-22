import jsQR from 'jsqr'
import { PNG } from 'pngjs'
import { describe, expect, it } from 'vitest'

import { buildSpayd } from '@/lib/vouchers/spayd'

import { spaydQrPng } from './qr'

function decode(png: Buffer): { text: string; width: number; height: number } {
  const image = PNG.sync.read(png)
  const result = jsQR(new Uint8ClampedArray(image.data), image.width, image.height)
  if (!result) throw new Error('QR code not found in the PNG')
  return { text: result.data, width: image.width, height: image.height }
}

describe('spaydQrPng', () => {
  it('produces a PNG that decodes back to the exact SPAYD string', async () => {
    // Official example from https://qr-platba.cz/pro-vyvojare/specifikace-formatu/
    const spayd =
      'SPD*1.0*ACC:CZ9106000000000000000123*AM:450.00*CC:CZK*MSG:PLATBA ZA ZBOZI*X-VS:1234567890'
    const png = await spaydQrPng(spayd)
    expect(png.subarray(1, 4).toString('ascii')).toBe('PNG')
    const decoded = decode(png)
    expect(decoded.text).toBe(spayd)
    expect(decoded.width).toBe(360)
    expect(decoded.height).toBe(360)
  })

  it('keeps escaped characters and mixed case intact, honours the size option', async () => {
    const spayd = buildSpayd({
      iban: 'CZ9106000000000000000123', // spec example account, not a real shop account
      amount: 2000,
      message: 'Dárkový poukaz *K7MQ* 100%',
      recipientName: 'Terrys – řeznictví',
      variableSymbol: '2026000123',
    })
    expect(spayd).toContain('%2A')
    const decoded = decode(await spaydQrPng(spayd, { size: 300 }))
    expect(decoded.text).toBe(spayd)
    expect(decoded.width).toBe(300)
  })
})
