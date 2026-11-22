import { z } from 'zod'

import { type FieldErrors, issuesToFieldErrors } from './checkoutSchema'
import { isValidEmail } from './validators'

/**
 * Input of the online withdrawal function (`POST /api/checkout/withdrawal`). Only what is needed
 * to identify the customer and the contract and to send the confirmation; a reason is NEVER
 * required (the law forbids making extra data mandatory).
 */
export const withdrawalInputSchema = z.object({
  name: z.string().trim().min(1, 'Vyplňte jméno a příjmení.').max(200),
  email: z
    .string()
    .trim()
    .min(1, 'Vyplňte e-mail, na který vám pošleme potvrzení.')
    .max(254)
    .refine(isValidEmail, 'Zadejte e-mail ve tvaru jmeno@domena.cz.')
    .transform((value) => value.toLowerCase()),
  orderNumber: z
    .string()
    .trim()
    .min(1, 'Vyplňte číslo objednávky (najdete ho v potvrzovacím e-mailu).')
    .max(40),
  phone: z.string().trim().max(40).optional(),
  items: z.string().trim().max(2000).optional(),
  message: z.string().trim().max(2000).optional(),
  formToken: z.string().max(200),
  website: z.string().max(200).optional(),
  turnstileToken: z.string().max(4096).optional(),
})

export type WithdrawalInput = z.infer<typeof withdrawalInputSchema>

export function parseWithdrawalInput(
  raw: unknown,
): { ok: true; data: WithdrawalInput } | { ok: false; errors: FieldErrors } {
  const parsed = withdrawalInputSchema.safeParse(raw)
  return parsed.success
    ? { ok: true, data: parsed.data }
    : { ok: false, errors: issuesToFieldErrors(parsed.error.issues) }
}
