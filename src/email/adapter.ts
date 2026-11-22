import { resendAdapter } from '@payloadcms/email-resend'
import { mkdir, writeFile } from 'fs/promises'
import path from 'path'
import type { EmailAdapter, SendEmailOptions } from 'payload'

/**
 * E-mail transport of Payload (stage 4), chosen from environment variables:
 *
 * - `RESEND_API_KEY` set → e-mails are sent through Resend (https://resend.com).
 * - otherwise → NOTHING is sent: every e-mail is written as `.html` + `.txt` + `.json` into
 *   `EMAIL_OUTBOX_DIR` (default `.emails/`, git-ignored) and logged, so it can be opened in a
 *   browser. The order then records the e-mail as "outbox" (not sent) in the admin.
 *
 * Sender: `EMAIL_FROM_ADDRESS` / `EMAIL_FROM_NAME` (the domain must be verified in Resend).
 * `EMAIL_OVERRIDE_TO` (optional, Resend only) sends every e-mail to one test address instead of
 * the real recipient – use it on a staging server.
 */

export const OUTBOX_ADAPTER_NAME = 'terrys-outbox'

export function emailFrom() {
  return {
    address: process.env.EMAIL_FROM_ADDRESS || 'objednavky@example.invalid',
    name: process.env.EMAIL_FROM_NAME || 'Terrys Steak',
  }
}

export function outboxDir(): string {
  return path.resolve(process.cwd(), process.env.EMAIL_OUTBOX_DIR || '.emails')
}

const addressList = (value: SendEmailOptions['to']): string => {
  if (!value) return ''
  const list = Array.isArray(value) ? value : [value]
  return list.map((item) => (typeof item === 'string' ? item : item.address)).join(', ')
}

/** Writes e-mails into a local folder instead of sending them (no provider configured). */
export const outboxEmailAdapter: EmailAdapter<{ file: string }> = ({ payload }) => ({
  name: OUTBOX_ADAPTER_NAME,
  defaultFromAddress: emailFrom().address,
  defaultFromName: emailFrom().name,
  sendEmail: async (message) => {
    const dir = outboxDir()
    await mkdir(dir, { recursive: true })
    const stamp = new Date().toISOString().replace(/[:.]/g, '-')
    const slug = String(message.subject ?? 'email')
      .normalize('NFD')
      .replace(/[̀-ͯ]/g, '')
      .replace(/[^a-zA-Z0-9]+/g, '-')
      .slice(0, 60)
    const base = path.join(dir, `${stamp}-${Math.random().toString(36).slice(2, 6)}-${slug}`)
    const meta = {
      to: addressList(message.to),
      from: message.from,
      replyTo: message.replyTo,
      subject: message.subject,
      headers: message.headers,
    }
    await Promise.all([
      writeFile(`${base}.html`, String(message.html ?? ''), 'utf8'),
      writeFile(`${base}.txt`, String(message.text ?? ''), 'utf8'),
      writeFile(`${base}.json`, JSON.stringify(meta, null, 2), 'utf8'),
    ])
    payload.logger.info(
      `[e-mail] NOT SENT (no RESEND_API_KEY) – saved to ${base}.html (subject: ${message.subject})`,
    )
    return { file: `${base}.html` }
  },
})

export function createEmailAdapter(): EmailAdapter {
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    const from = emailFrom()
    return resendAdapter({
      apiKey,
      defaultFromAddress: from.address,
      defaultFromName: from.name,
      overrideRecipientAddress: process.env.EMAIL_OVERRIDE_TO || undefined,
    })
  }
  return outboxEmailAdapter as EmailAdapter
}
