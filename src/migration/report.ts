import { BRAND_RULE_LABELS } from './brandCheck'
import type { InventoryRow } from './inventory'
import { type Action, IMPORT_KINDS, type ImportKind, type ImportResult } from './loader'

/**
 * migration/report.md – written by every `pnpm migrate:import` run (Czech, for the owner).
 */

const KIND_LABELS: Record<ImportKind, string> = {
  categories: 'Kategorie',
  products: 'Produkty',
  articles: 'Články (magazín, academy, slovník)',
  recipes: 'Recepty',
  pages: 'Stránky',
}

const ACTION_LABELS: Record<Action, string> = {
  created: 'vytvořeno',
  updated: 'aktualizováno',
  unchanged: 'beze změny',
  'skipped-edited': 'přeskočeno (upraveno v administraci)',
  'skipped-locked': 'přeskočeno (zamčeno)',
  failed: 'chyba',
}

const esc = (s: string) => s.replace(/\|/g, '\\|').replace(/\r?\n/g, ' ')

function table(headers: string[], rows: string[][]): string {
  if (!rows.length) return '_žádné_\n'
  return [
    `| ${headers.join(' | ')} |`,
    `| ${headers.map(() => '---').join(' | ')} |`,
    ...rows.map((r) => `| ${r.map((c) => esc(c)).join(' | ')} |`),
  ].join('\n') + '\n'
}

function counted(record: Record<string, number>): string[][] {
  return Object.entries(record)
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .map(([k, v]) => [k, String(v)])
}

export function renderReport(result: ImportResult, inventory: InventoryRow[], databaseName: string): string {
  const out: string[] = []
  const push = (...lines: string[]) => out.push(...lines)
  push(
    '# Migrace ze starého terrys.cz – report importu',
    '',
    `Vygenerováno příkazem \`pnpm migrate:import\` ${result.finishedAt ?? result.startedAt} ` +
      `(databáze \`${databaseName}\`${result.dryRun ? ', **zkušební běh – nic se nezapsalo**' : ''}).`,
    `Volby: ${[
      result.options.only?.length ? `--only=${result.options.only.join(',')}` : 'všechny typy',
      result.options.limit ? `--limit=${result.options.limit}` : '',
      result.options.force ? '--force' : '',
    ]
      .filter(Boolean)
      .join(' ')}.`,
    '',
    'Report se přepisuje při každém běhu. Inventura všech starých URL je v `migration/url-inventory.csv`.',
    '',
  )

  // ------------------------------------------------------------- counts
  push('## Souhrn', '')
  const rows = IMPORT_KINDS.map((kind) => {
    const items = result.items.filter((i) => i.kind === kind)
    const n = (a: Action) => String(items.filter((i) => i.action === a).length)
    return [
      KIND_LABELS[kind],
      String(result.found[kind]),
      n('created'),
      n('updated'),
      n('unchanged'),
      String(items.filter((i) => i.action === 'skipped-edited' || i.action === 'skipped-locked').length),
      n('failed'),
      String(items.filter((i) => i.draft && i.action !== 'failed').length),
    ]
  })
  push(table(['Typ', 'Nalezeno', 'Vytvořeno', 'Aktualizováno', 'Beze změny', 'Přeskočeno', 'Chyba', 'Z toho koncept'], rows))
  push(
    `Obrázky: nahráno ${result.mediaUploaded}, použito znovu (stejný obsah) ${result.mediaReused}, ` +
      `problémů ${result.mediaProblems.length}.`,
    '',
  )

  const invCounts: Record<string, number> = {}
  for (const row of inventory) invCounts[row.type] = (invCounts[row.type] ?? 0) + 1
  push('### Inventura starých URL podle typu', '', table(['Typ stránky', 'Počet URL'], counted(invCounts)))
  const mapped = inventory.filter((r) => r.new_collection).length
  push(`URL s přiřazeným cílem v novém webu: ${mapped} z ${inventory.length}.`, '')

  // ------------------------------------------------------------- failures and skips
  push('## Chyby validace a importu', '')
  push(
    table(
      ['Typ', 'Stará URL', 'Název', 'Chyba'],
      result.items.filter((i) => i.action === 'failed').map((i) => [i.kind, i.legacyUrl, i.title, i.error ?? '']),
    ),
  )
  push('## Přeskočené položky (upravené v administraci nebo zamčené)', '')
  push(
    table(
      ['Typ', 'Stará URL', 'Název', 'Důvod'],
      result.items
        .filter((i) => i.action === 'skipped-edited' || i.action === 'skipped-locked')
        .map((i) => [i.kind, i.legacyUrl, i.title, ACTION_LABELS[i.action]]),
    ),
  )

  push('## Produkty bez ceny nebo bez fotky (uloženy jako koncept)', '')
  push(
    table(
      ['Problém', 'Stará URL'],
      [
        ...result.productsWithoutPrice.map((u) => ['bez ceny', u]),
        ...result.productsWithoutImage.map((u) => ['bez fotky', u]),
      ],
    ),
  )

  push('## Nefunkční obrázky', '')
  push(table(['Obrázek', 'Použit na', 'Důvod'], result.mediaProblems.map((p) => [p.url, p.usedOn, p.reason])))

  push('## Stránky, u kterých nešlo určit typ', '')
  push(table(['URL', 'HTTP', 'Titulek'], result.unknownPages.map((p) => [p.url, String(p.status ?? ''), p.title ?? ''])))
  push('## Soubory pod adresou stránky (neimportováno, přenést ručně)', '')
  push(table(['URL', 'Typ obsahu'], result.files.map((f) => [f.url, f.contentType ?? ''])))

  // ------------------------------------------------------------- brand rules
  push(
    '## Kontrola pravidel značky (k posouzení majitelem)',
    '',
    'Texty starého webu, které zmiňují slevy, slevové kódy, „doprava zdarma“, přeškrtnuté ceny, ' +
      'starý název SelaVita nebo fotobanky. Import je přenesl beze změny – upravte je v administraci. ' +
      'Původní ani akční cena se nikam neimportuje (taková pole v novém webu nejsou).',
    '',
  )
  push(
    table(
      ['Pravidlo', 'Stará URL', 'Název', 'Úryvek'],
      result.brandHits.flatMap((b) => b.hits.map((h) => [BRAND_RULE_LABELS[h.rule], b.legacyUrl, b.title, h.snippet])),
    ),
  )
  push('### Písma starého webu (nic se nekopíruje)', '')
  const fonts = result.fonts.map((f) => [f, /fonts\.gstatic\.com|fonts\.googleapis\.com/.test(f) ? 'Google Fonts – v pořádku' : 'není z Google Fonts – nepřebírat'])
  push(table(['Soubor', 'Posouzení'], fonts))

  // ------------------------------------------------------------- warnings per item
  push('## Upozornění k jednotlivým položkám', '')
  push(
    table(
      ['Typ', 'Stará URL', 'Výsledek', 'Upozornění'],
      result.items.filter((i) => i.warnings.length).map((i) => [i.kind, i.legacyUrl, ACTION_LABELS[i.action], i.warnings.join(' • ')]),
    ),
  )

  push('## Ceny: odvozená jednotka', '', 'Starý web nemá cenu za jednotku, jen cenu každé varianty. Jak import cenu odvodil:', '')
  const byNote: Record<string, number> = {}
  for (const p of result.priceUnits) byNote[`${p.unit} – ${p.note ?? ''}`] = (byNote[`${p.unit} – ${p.note ?? ''}`] ?? 0) + 1
  push(table(['Jednotka – pravidlo', 'Produktů'], counted(byNote)))
  push(
    '<details><summary>Produkty s cenou za kus</summary>',
    '',
    table(
      ['Stará URL', 'Název', 'Cena'],
      result.priceUnits.filter((p) => p.unit === 'piece').map((p) => [p.legacyUrl, p.title, String(p.price ?? '')]),
    ),
    '</details>',
    '',
  )

  push('## Dostupnost na starém webu → nový stav', '')
  push(
    'Mapování: Skladem / dle aktuální zásoby / Na objednávku → Skladem; Na cestě do ČR → Na cestě; ' +
      'Vyprodáno / Není skladem / Nedostupné → Vyprodáno. Produkty, které nejsou v žádné kategorii ' +
      'starého webu, dostaly stav Skryto.',
    '',
  )
  push(table(['Text na starém webu', 'Produktů'], counted(result.availabilityTexts)))
  push('### Produkty mimo kategorie (stav Skryto)', '', table(['Stará URL'], result.hiddenProducts.map((u) => [u])))

  push(
    '## Porcování („porcovat / neporcovat“)',
    '',
    'Volba porcování na starém webu nemá v novém modelu pole (nepřidáno). Produkty s volbou:',
    '',
  )
  const porc: Record<string, number> = {}
  for (const p of result.portioning) porc[p.options.join(' / ')] = (porc[p.options.join(' / ')] ?? 0) + 1
  push(table(['Možnosti', 'Produktů'], counted(porc)))

  push('## Údaje starého webu bez pole v novém modelu', '')
  const extra: Record<string, number> = {}
  for (const [k, v] of Object.entries(result.extraOldFields)) {
    const label = k.split(':')[0]
    if (label === 'Zrání masa' || label === 'Štítek') extra[k] = v
    else extra[`${label}: (různé hodnoty)`] = (extra[`${label}: (různé hodnoty)`] ?? 0) + v
  }
  push(table(['Údaj', 'Produktů'], counted(extra)))
  push(
    'Trvanlivost a skladování jsou přeneseny do číselníku „Trvanlivost a skladování“ (jedna položka ' +
      'na kombinaci). Velikost kusu je použita jako průměrná hmotnost variant „Celý kus“ / „1/2 kusu“.',
    '',
  )
  push('### Rubriky článků a receptů (nový model rubriky nemá)', '', table(['Rubrika', 'Položek'], counted(result.rubrics)))

  push('## Recepty: co bylo strukturované', '')
  push(table(['Stará URL', 'Poznámky'], result.recipeNotes.filter((r) => r.notes.length).map((r) => [r.legacyUrl, r.notes.join(' • ')])))

  push('## Nově založené položky číselníků', '')
  push(table(['Číselník', 'Název'], result.createdCodeListItems.map((c) => [c.collection, c.name])))

  push('## Kategorie mimo menu starého webu (bez nadřazené kategorie)', '')
  push(table(['Stará URL'], result.categoriesNotInMenu.map((u) => [u])))

  push('## Nenalezené vazby (odkaz na položku, která se neimportovala)', '')
  push(table(['Z', 'Na', 'Pole'], result.unresolvedLinks.map((u) => [u.from, u.to, u.field])))

  push('## Externí odkazy v přenesených textech', '')
  const ext: Record<string, number> = {}
  for (const l of result.externalLinks) ext[l.url] = (ext[l.url] ?? 0) + 1
  push(table(['Odkaz', 'Výskytů'], counted(ext)))
  push('## Vložená média (videa, iframe)', '', 'Editor neumí vložené přehrávače; v textu je místo nich odkaz na video.', '')
  push(table(['Zdroj', 'Použito na'], result.embeds.map((e) => [e.url, e.usedOn])))

  return out.join('\n')
}
