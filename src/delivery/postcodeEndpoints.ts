import type { Endpoint } from 'payload'

import { isAdminUser } from '@/access'
import { decodeCsvBytes } from '@/lib/delivery/postcodeCsv'

import { exportPostcodesCsv, importPostcodesCsv } from './postcodeImport'

/** Max upload size: the full official list is well under 2 MB. */
const MAX_BYTES = 5 * 1024 * 1024

const forbidden = () =>
  Response.json({ message: 'Import a export PSČ smí jen administrátor.' }, { status: 403 })

/**
 * `POST /api/postcodes/import` – body = the raw CSV file (any content type). Administrators only.
 * Returns the summary as JSON (created / updated / unchanged / skipped / errors).
 */
export const postcodeImportEndpoint: Endpoint = {
  path: '/import',
  method: 'post',
  handler: async (req) => {
    if (!isAdminUser(req.user)) return forbidden()
    if (!req.arrayBuffer) {
      return Response.json({ message: 'Chybí obsah souboru.' }, { status: 400 })
    }
    const bytes = new Uint8Array(await req.arrayBuffer())
    if (bytes.byteLength === 0) {
      return Response.json({ message: 'Soubor je prázdný.' }, { status: 400 })
    }
    if (bytes.byteLength > MAX_BYTES) {
      return Response.json({ message: 'Soubor je příliš velký (max. 5 MB).' }, { status: 413 })
    }
    const summary = await importPostcodesCsv(req.payload, decodeCsvBytes(bytes))
    req.payload.logger.info(
      `Import PSČ: vytvořeno ${summary.created}, aktualizováno ${summary.updated}, ` +
        `beze změny ${summary.unchanged}, přeskočeno ${summary.skipped}, chyb ${summary.errorCount}`,
    )
    return Response.json(summary, { headers: { 'Cache-Control': 'no-store' } })
  },
}

/** `GET /api/postcodes/export` – all postcodes as a CSV download. Administrators only. */
export const postcodeExportEndpoint: Endpoint = {
  path: '/export',
  method: 'get',
  handler: async (req) => {
    if (!isAdminUser(req.user)) return forbidden()
    const csv = await exportPostcodesCsv(req.payload)
    return new Response(csv, {
      headers: {
        'Content-Type': 'text/csv; charset=utf-8',
        'Content-Disposition': 'attachment; filename="psc-terrys.csv"',
        'Cache-Control': 'no-store',
      },
    })
  },
}
