/**
 * Tiny PDF writer for the SIMULATED shipping label (no dependency). One A6 page per label,
 * Helvetica, ASCII text only (diacritics are stripped – it is a placeholder, never a real label).
 */

export type LabelPage = { title: string; lines: string[] }

function ascii(text: string): string {
  return text
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[^\x20-\x7e]/g, '?')
    .replace(/([\\()])/g, '\\$1')
}

/** Builds a PDF (Buffer) with one A6 page (298 × 420 pt) per entry. */
export function simplePdf(pages: LabelPage[]): Buffer {
  const objects: string[] = []
  // 1 catalog, 2 pages, 3 font; then per page: page object + content stream.
  const pageIds = pages.map((_, i) => 4 + i * 2)
  objects[1] = '<< /Type /Catalog /Pages 2 0 R >>'
  objects[2] = `<< /Type /Pages /Kids [${pageIds.map((id) => `${id} 0 R`).join(' ')}] /Count ${pages.length} >>`
  objects[3] = '<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>'
  pages.forEach((page, i) => {
    const pageId = pageIds[i]
    const contentId = pageId + 1
    const ops = [
      '0.9 0.1 0.1 rg 10 360 278 50 re f',
      'BT 1 1 1 rg /F1 26 Tf 22 375 Td (SIMULACE) Tj ET',
      `BT 0 0 0 rg /F1 14 Tf 20 335 Td (${ascii(page.title)}) Tj ET`,
      ...page.lines.map(
        (line, n) => `BT 0 0 0 rg /F1 10 Tf 20 ${310 - n * 15} Td (${ascii(line)}) Tj ET`,
      ),
      'BT 0.4 0.4 0.4 rg /F1 8 Tf 20 20 Td (Neni to skutecny stitek - zasilka nebyla odeslana dopravci.) Tj ET',
    ].join('\n')
    objects[pageId] =
      `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 298 420] /Resources << /Font << /F1 3 0 R >> >> /Contents ${contentId} 0 R >>`
    objects[contentId] = `<< /Length ${ops.length} >>\nstream\n${ops}\nendstream`
  })

  let out = '%PDF-1.4\n'
  const offsets: number[] = []
  for (let id = 1; id < objects.length; id++) {
    offsets[id] = out.length
    out += `${id} 0 obj\n${objects[id]}\nendobj\n`
  }
  const xref = out.length
  out += `xref\n0 ${objects.length}\n0000000000 65535 f \n`
  for (let id = 1; id < objects.length; id++) {
    out += `${String(offsets[id]).padStart(10, '0')} 00000 n \n`
  }
  out += `trailer\n<< /Size ${objects.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`
  return Buffer.from(out, 'latin1')
}
