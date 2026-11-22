/**
 * Stage 9: send ONE test e-mail of EVERY kind the shop sends to one address.
 *
 *   pnpm ops:test-emails -- --to=vas.email@gmail.com [--only=order-confirmation,voucher-issued]
 *
 * - Without RESEND_API_KEY (local): nothing leaves the computer – the e-mails are saved to
 *   EMAIL_OUTBOX_DIR (default .emails/) as .html/.txt/.json; open the .html in a browser.
 * - With RESEND_API_KEY + EMAIL_FROM_ADDRESS (staging / production env): really sent through
 *   Resend from the configured sender – use it to check Gmail, Outlook (Seznam.cz too) and
 *   Apple Mail: inbox vs spam, sender name, Reply-To, "SPF/DKIM/DMARC: PASS" in the message
 *   source, and that the QR code shows inline in the voucher e-mail.
 * Sample data only (subject starts with "[TEST]", fake order numbers 999001/999002, the QR Platba
 * specification's example account) – no database records are created or changed.
 */
import type { SendEmailOptions } from 'payload'

import { QR_CID } from '@/email/templates/vouchers'
import { buildSpayd } from '@/lib/vouchers/spayd'
import { absoluteUrl } from '@/lib/urls'
import { spaydQrPng } from '@/vouchers/qr'

import { sampleEmails } from './emailSamples'

function arg(name: string): string | undefined {
  const found = process.argv.find((value) => value.startsWith(`--${name}=`))
  return found?.slice(name.length + 3)
}

async function main() {
  const to = arg('to')
  if (!to || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(to)) {
    console.error('Usage: pnpm ops:test-emails -- --to=address@example.com [--only=kind1,kind2]')
    process.exit(1)
  }
  const only = arg('only')
    ?.split(',')
    .map((s) => s.trim())
    .filter(Boolean)
  // No schema push from a script (same as the seed); config imported after setting the switch.
  process.env.PAYLOAD_MIGRATING = 'true'
  const { getPayload } = await import('payload')
  const { default: config } = await import('@payload-config')
  const payload = await getPayload({ config })
  const settings = await payload.findGlobal({ slug: 'settings', depth: 0 })
  const shop = {
    siteUrl: absoluteUrl('/').replace(/\/$/, ''),
    contactEmail: settings.contact?.email ?? null,
    contactPhone: settings.contact?.phone ?? null,
    companyLine: settings.company?.name ?? null,
  }
  const replyTo = process.env.EMAIL_REPLY_TO || shop.contactEmail || undefined
  const spayd = buildSpayd({
    iban: 'CZ9106000000000000000123',
    amount: 1000,
    currency: 'CZK',
    variableSymbol: '999002',
    message: 'Darkovy poukaz Terrys 999002',
  })
  const qr = await spaydQrPng(spayd)
  const provider = process.env.RESEND_API_KEY
    ? 'Resend'
    : `outbox folder (${process.env.EMAIL_OUTBOX_DIR || '.emails'})`
  console.log(`Sending test e-mails to ${to} via ${provider}…`)

  let failed = 0
  for (const { kind, email } of sampleEmails(shop, absoluteUrl('/odstoupeni-od-smlouvy'))) {
    if (only && !only.includes(kind)) continue
    const isVoucherIssued = kind === 'voucher-issued'
    const message: SendEmailOptions = {
      to,
      subject: email.subject,
      html: email.html,
      text: email.text,
      ...(replyTo && !kind.endsWith('-internal') ? { replyTo } : {}),
      ...(isVoucherIssued
        ? {
            attachments: [
              { filename: 'qr-platba.png', content: qr, contentType: 'image/png', cid: QR_CID },
            ],
          }
        : {}),
    }
    try {
      await payload.sendEmail(message)
      console.log(`  ✓ ${kind}: ${email.subject}`)
    } catch (error) {
      failed += 1
      console.log(`  ✗ ${kind}: ${error instanceof Error ? error.message : String(error)}`)
    }
  }
  console.log(failed ? `${failed} failed.` : 'Done.')
  process.exit(failed ? 1 : 0)
}

// Top-level await: the Payload CLI exits as soon as this module has finished.
await main()
