import { describe, expect, it } from 'vitest'

import { slugify } from './slugify'

describe('slugify', () => {
  it('folds Czech diacritics', () => {
    expect(slugify('Svíčková')).toBe('svickova')
    expect(slugify('Příliš žluťoučký kůň úpěl ďábelské ódy')).toBe(
      'prilis-zlutoucky-kun-upel-dabelske-ody',
    )
    expect(slugify('ŘEZNÍK Ťažký Ňadro')).toBe('reznik-tazky-nadro')
  })

  it('turns spaces and punctuation into single dashes', () => {
    expect(slugify('Wagyu Rib Eye Japonsko A5+')).toBe('wagyu-rib-eye-japonsko-a5')
    expect(slugify('Wagyu Tomahawk Austrálie BMS 8/9')).toBe('wagyu-tomahawk-australie-bms-8-9')
    expect(slugify('  Doprava   a platba  ')).toBe('doprava-a-platba')
    expect(slugify('--Rib--Eye--')).toBe('rib-eye')
  })

  it('handles ampersands, apostrophes and special letters', () => {
    expect(slugify('Flank & Flap')).toBe('flank-a-flap')
    expect(slugify("Terry's steaky")).toBe('terrys-steaky')
    expect(slugify('Straße Øresund Łódź')).toBe('strasse-oresund-lodz')
  })

  it('returns an empty string for empty input', () => {
    expect(slugify('')).toBe('')
    expect(slugify(null)).toBe('')
    expect(slugify(undefined)).toBe('')
    expect(slugify('!!!')).toBe('')
  })

  it('keeps an already valid slug unchanged', () => {
    expect(slugify('argentinsky-hovezi-rib-eye')).toBe('argentinsky-hovezi-rib-eye')
  })
})
