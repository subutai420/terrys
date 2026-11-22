import { describe, expect, it } from 'vitest'

import { formatCzk } from './format'

// Czech number formatting uses non-breaking spaces (U+00A0); normalise them for readable asserts.
const normalise = (value: string) => value.replace(/ /g, ' ')

describe('formatCzk', () => {
  it('formats the flat delivery price', () => {
    expect(normalise(formatCzk(229))).toBe('229 Kč')
  })

  it('groups thousands the Czech way', () => {
    expect(normalise(formatCzk(1290))).toBe('1 290 Kč')
  })
})
