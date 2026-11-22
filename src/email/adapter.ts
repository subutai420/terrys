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
    // Stage 7: attachments (voucher PDF, QR image) are saved next to the e-mail; inline images
    // (`cid:`) are rewritten to the saved file so the .html opens in a browser like in a client.
    let html = String(message.html ?? '')
    const files = outboxAttachments(message.attachments)
    const saved: {
      filename: string
      file: string
      cid: string | null
      contentType: string | null
    }[] = []
    for (const [i, attachment] of files.entries()) {
      const safe = attachment.filename.replace(/[^a-zA-Z0-9._-]+/g, '-')
      const file = `${base}.att${i + 1}-${safe}`
      await writeFile(file, attachment.content)
      saved.push({
        filename: attachment.filename,
        file: path.basename(file),
        cid: attachment.cid,
        contentType: attachment.contentType,
      })
      if (attachment.cid) html = html.split(`cid:${attachment.cid}`).join(path.basename(file))
    }
    await Promise.all([
      writeFile(`${base}.html`, html, 'utf8'),
      writeFile(`${base}.txt`, String(message.text ?? ''), 'utf8'),
      writeFile(`${base}.json`, JSON.stringify({ ...meta, attachments: saved }, null, 2), 'utf8'),
    ])
    payload.logger.info(
      `[e-mail] NOT SENT (no RESEND_API_KEY) – saved to ${base}.html (subject: ${message.subject})`,
    )
    return { file: `${base}.html` }
  },
})

type PlainAttachment = {
  filename: string
  content: Buffer
  contentType: string | null
  cid: string | null
}

/** Normalises nodemailer-style attachments (only in-memory Buffer/string content is used). */
function outboxAttachments(attachments: SendEmailOptions['attachments']): PlainAttachment[] {
  type Raw = { filename?: unknown; content?: unknown; contentType?: string; cid?: string }
  return ((attachments ?? []) as Raw[]).flatMap((a) => {
    const content =
      a.content instanceof Buffer
        ? a.content
        : typeof a.content === 'string'
          ? Buffer.from(a.content)
          : null
    if (!content || !a.filename) return []
    return [
      {
        filename: String(a.filename),
        content,
        contentType: a.contentType ?? null,
        cid: a.cid ?? null,
      },
    ]
  })
}

const RESEND_URL = 'https://api.resend.com/emails'

/**
 * Stage 7: e-mails WITH attachments go straight to the Resend REST API, because
 * `@payloadcms/email-resend` (3.94) drops the content id needed for inline images (the QR code is
 * referenced as `cid:` – Gmail/Outlook block `data:` images). Resend attachment fields:
 * `filename`, `content` (Base64), `content_type`, `content_id` (inline image) – see
 * https://resend.com/docs/api-reference/emails/send-email. Everything else keeps using the
 * Payload adapter.
 */
export async function sendViaResendWithAttachments(
  apiKey: string,
  message: SendEmailOptions,
  fetchImpl: typeof fetch = fetch,
): Promise<{ id?: string }> {
  const from = emailFrom()
  const override = process.env.EMAIL_OVERRIDE_TO
  const fromValue =
    typeof message.from === 'string'
      ? message.from
      : message.from?.address
        ? `${message.from.name || from.name} <${message.from.address}>`
        : `${from.name} <${from.address}>`
  const to = override ? [override] : addressList(message.to).split(', ').filter(Boolean)
  const replyTo = message.replyTo
    ? addressList(message.replyTo as SendEmailOptions['to'])
    : undefined
  const body = {
    from: fromValue,
    to,
    subject: message.subject ?? '',
    html: String(message.html ?? ''),
    text: String(message.text ?? ''),
    ...(replyTo ? { reply_to: replyTo } : {}),
    attachments: outboxAttachments(message.attachments).map((a) => ({
      filename: a.filename,
      content: a.content.toString('base64'),
      ...(a.contentType ? { content_type: a.contentType } : {}),
      ...(a.cid ? { content_id: a.cid } : {}),
    })),
  }
  const response = await fetchImpl(RESEND_URL, {
    method: 'POST',
    headers: { Authorization: `Bearer ${apiKey}`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
  const json = (await response.json().catch(() => ({}))) as { id?: string; message?: string }
  if (!response.ok) {
    throw new Error(`Resend ${response.status}: ${json.message ?? 'unknown error'}`)
  }
  return json
}

export function createEmailAdapter(): EmailAdapter {
  const apiKey = process.env.RESEND_API_KEY
  if (apiKey) {
    const from = emailFrom()
    const base = resendAdapter({
      apiKey,
      defaultFromAddress: from.address,
      defaultFromName: from.name,
      overrideRecipientAddress: process.env.EMAIL_OVERRIDE_TO || undefined,
    })
    return (args) => {
      const inner = base(args)
      return {
        ...inner,
        sendEmail: async (message) =>
          message.attachments?.length
            ? sendViaResendWithAttachments(apiKey, message)
            : inner.sendEmail(message),
      }
    }
  }
  return outboxEmailAdapter as EmailAdapter
}
