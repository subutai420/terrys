/**
 * DEV ONLY – renders PDF pages to PNG images so a person (or a test) can look at the generated
 * voucher. Uses devDependencies (`unpdf` = PDF.js, `@napi-rs/canvas`), so never import this
 * from application code; only tests import it.
 *
 * Regenerate the screenshot docs/screenshots/etapa-7/poukaz-pdf.png:
 *
 *   VOUCHER_PDF_PREVIEW=1 corepack pnpm exec vitest run --project unit src/vouchers/pdf.test.ts
 *
 * (PowerShell: `$env:VOUCHER_PDF_PREVIEW='1'; corepack pnpm exec vitest run --project unit src/vouchers/pdf.test.ts`)
 */
export async function pdfToPngPages(pdf: Uint8Array, opts?: { scale?: number }): Promise<Buffer[]> {
  const { getDocumentProxy, renderPageAsImage } = await import('unpdf')
  // PDF.js may detach the buffer it gets; always hand it a copy.
  const doc = await getDocumentProxy(new Uint8Array(pdf))
  const pages: Buffer[] = []
  for (let page = 1; page <= doc.numPages; page++) {
    const png = await renderPageAsImage(doc, page, {
      canvasImport: () => import('@napi-rs/canvas'),
      scale: opts?.scale ?? 1.5,
    })
    pages.push(Buffer.from(png))
  }
  return pages
}
