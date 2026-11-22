import { expect, test } from '@playwright/test'

/**
 * Public delivery endpoint for the cart. Works on an empty database too (CI): then there are
 * simply no shipping methods.
 */
test.describe('GET /api/delivery/options', () => {
  test('returns delivery options for a valid postcode', async ({ request }) => {
    const response = await request.get('/api/delivery/options?psc=120%2000')
    expect(response.status()).toBe(200)
    expect(response.headers()['cache-control']).toContain('s-maxage=60')
    const body = await response.json()
    expect(body.postcode.code).toBe('12000')
    expect(body.timeZone).toBe('Europe/Prague')
    expect(Array.isArray(body.methods)).toBe(true)
    for (const method of body.methods) {
      expect(method).not.toHaveProperty('balikobot')
      expect(method).not.toHaveProperty('internalNote')
      if (method.type === 'pickup') expect(method.price).toBe(0)
      else expect(method.price).toBeGreaterThan(0)
    }
  })

  test('rejects an invalid postcode with a Czech message', async ({ request }) => {
    const response = await request.get('/api/delivery/options?psc=abc')
    expect(response.status()).toBe(400)
    expect((await response.json()).message).toContain('PSČ')
  })

  test('does not expose shipping methods through the generic REST API', async ({ request }) => {
    const response = await request.get('/api/shipping-methods')
    expect(response.status()).toBe(403)
  })
})
