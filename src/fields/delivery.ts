import type { SelectField, TextFieldSingleValidation } from 'payload'

import { parseTimeOfDay } from '@/lib/delivery/calendar'
import { WEEKDAY_OPTIONS } from '@/lib/delivery/constants'

/** Weekday multi-select used by shipping methods and delivery zones. */
export function weekdaysField(overrides: Partial<SelectField> = {}): SelectField {
  return {
    name: 'weekdays',
    type: 'select',
    hasMany: true,
    label: 'Dny doručení',
    options: WEEKDAY_OPTIONS,
    ...overrides,
  } as SelectField
}

/** "HH:MM" validation for cut-off times. */
export const validateTimeOfDay: TextFieldSingleValidation = (value) => {
  if (typeof value !== 'string' || parseTimeOfDay(value) === null) {
    return 'Zadejte čas ve tvaru HH:MM (24 hodin), např. 12:00.'
  }
  return true
}
