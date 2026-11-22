import {
  decideRedirect,
  type LegacyIndex,
  normalizePathShape,
  resolveLegacyPath,
  splitTarget,
} from '@/lib/redirects/legacy'

import { parseCsv } from './inventory'

/**
 * Redirect plan of the old addresses (stage 8b): what the new site must answer for every row of
 * `migration/url-inventory.csv` (and for internal links found in imported texts). Written by
 * `pnpm migrate:redirects` to `migration/redirect-plan.csv` + `migration/redirects-report.md`,
 * read by `pnpm migrate:check-redirects`, which asks a running new site and compares.
 *
 * Pure module (the script `redirects.ts` loads the database and calls it).
 */

export type PlanRow = {
  /** Old path + query (as on www.terrys.cz). */
  old_url: string
  /** Where the address comes from: `inventory` (crawl) or `text` (link inside imported content). */
  source: 'inventory' | 'text'
  /** 200 = served directly, 308 = one redirect hop, 404 = nothing fits (a failure to fix). */
  expected_status: '200' | '308' | '404'
  /** Final address (path + query) – the old URL itself for 200. */
  expected_target: string
  /** Rule that decided (see RULE_LABELS). */
  rule: string
  /** "ano" when the target is a best guess the owner should confirm. */
  needs_owner: '' | 'ano'
  note: string
}

export const PLAN_COLUMNS: (keyof PlanRow)[] = [
  'old_url',
  'source',
  'expected_status',
  'expected_target',
  'rule',
  'needs_owner',
  'note',
]

/** Czech names of the rules for the report. */
export const RULE_LABELS: Record<string, string> = {
  served: 'stránka existuje na stejné adrese (200)',
  normalized: 'stará adresa s parametry / jiným tvarem → tatáž stránka',
  owner: 'přesměrování zadané v administraci',
  'retired-product': 'produkt není veřejný (koncept / skrytý) → jeho kategorie',
  'same-id': 'stejné ID na starém webu, jiný slug → ten dokument',
  rubric: 'rubrika / výpis starého webu → výpis sekce',
  'unknown-content': 'článek / recept / pojem / prodejna, který tu není → výpis sekce',
  'old-cart': 'starý košík → nový košík',
  'old-account': 'zákaznický účet starého e-shopu → úvodní stránka',
  'menu-pdf': 'PDF jídelní lístek → stránka prodejny',
  slash: 'jen lomítko na konci',
  none: 'NIC NEPASUJE (404)',
}

/** Expected answer of the new site for one old address. */
export function planFor(oldUrl: string, index: LegacyIndex): Omit<PlanRow, 'source' | 'note'> {
  const url = new URL(oldUrl, 'http://plan.invalid')
  const decision = decideRedirect(url.pathname, url.search, index)
  if (decision) {
    return {
      old_url: oldUrl,
      expected_status: '308',
      expected_target: decision.location,
      rule: decision.rule,
      needs_owner: decision.needsOwner ? 'ano' : '',
    }
  }
  const resolution = resolveLegacyPath(normalizePathShape(url.pathname).toLowerCase(), index)
  if (resolution?.rule === 'served') {
    return { old_url: oldUrl, expected_status: '200', expected_target: oldUrl, rule: 'served', needs_owner: '' }
  }
  return { old_url: oldUrl, expected_status: '404', expected_target: '', rule: 'none', needs_owner: 'ano' }
}

/**
 * Cross-check with the importer's own record (inventory columns new_collection/new_slug): the
 * final page should be the document the row was imported into. Returns a note when it is not.
 * `docPath` = public path of that document, or null when the document is not public.
 */
export function crossCheck(row: Pick<PlanRow, 'expected_target' | 'rule'>, docPath: string | null | undefined): string {
  if (docPath === undefined) return ''
  if (docPath === null) {
    return row.rule === 'retired-product' ? 'importovaný produkt není veřejný' : 'importovaný dokument není veřejný'
  }
  const target = splitTarget(row.expected_target).path
  return target === docPath ? '' : `NESOUHLASÍ s importem: dokument je na ${docPath}`
}

function csvCell(value: string): string {
  return /[",\r\n]/.test(value) ? `"${value.replace(/"/g, '""')}"` : value
}

export function planToCsv(rows: PlanRow[]): string {
  const lines = [PLAN_COLUMNS.join(',')]
  for (const row of rows) lines.push(PLAN_COLUMNS.map((c) => csvCell(String(row[c] ?? ''))).join(','))
  return lines.join('\n') + '\n'
}

export function parsePlanCsv(text: string): PlanRow[] {
  return parseCsv(text) as unknown as PlanRow[]
}

const md = (value: string) => value.replace(/\|/g, '\\|')

/** `migration/redirects-report.md` (Czech, for the owner and the next developer). */
export function renderRedirectReport(rows: PlanRow[], meta: { generatedAt: string; database: string }): string {
  const count = (pred: (r: PlanRow) => boolean) => rows.filter(pred).length
  const inventory = rows.filter((r) => r.source === 'inventory')
  const byRule = new Map<string, number>()
  for (const r of inventory) byRule.set(r.rule, (byRule.get(r.rule) ?? 0) + 1)
  const table = (list: PlanRow[], withNote = true) =>
    list.length
      ? [
          `| Stará adresa | Cíl | Pravidlo${withNote ? ' | Poznámka' : ''} |`,
          `| --- | --- | ---${withNote ? ' | ---' : ''} |`,
          ...list.map(
            (r) =>
              `| ${md(r.old_url)} | ${md(r.expected_target || '–')} | ${md(r.rule)}${withNote ? ` | ${md(r.note)}` : ''} |`,
          ),
        ].join('\n')
      : '_žádné_'

  const needsOwner = rows.filter((r) => r.needs_owner === 'ano')
  const homepage = rows.filter((r) => r.expected_status === '308' && splitTarget(r.expected_target).path === '/')
  const mismatches = rows.filter((r) => r.note.startsWith('NESOUHLASÍ'))
  const redirects = inventory.filter((r) => r.expected_status === '308')
  const retired = rows.filter((r) => r.rule === 'retired-product')
  const text = rows.filter((r) => r.source === 'text')

  return `# Přesměrování starých adres – plán a rozhodnutí

Vygenerováno příkazem \`pnpm migrate:redirects\` ${meta.generatedAt} (databáze \`${meta.database}\`).
Report se přepisuje při každém běhu. Strojová podoba je v \`migration/redirect-plan.csv\`; podle ní
kontroluje běžící web příkaz \`pnpm migrate:check-redirects\`.

Pravidla jsou v kódu (\`src/lib/redirects/legacy.ts\`), nic z toho není potřeba zadávat ručně.
Výjimky zadáte v administraci: **Nastavení → Přesměrování** (bez nasazení nové verze).

## Souhrn (${inventory.length} adres z inventury starého webu)

| Výsledek | Počet |
| --- | --- |
| 200 – stránka je na stejné adrese | ${count((r) => r.source === 'inventory' && r.expected_status === '200')} |
| 308 – jedno přesměrování na správnou stránku | ${count((r) => r.source === 'inventory' && r.expected_status === '308')} |
| 404 – nic nepasuje | ${count((r) => r.source === 'inventory' && r.expected_status === '404')} |
| z toho k rozhodnutí majitele | ${count((r) => r.source === 'inventory' && r.needs_owner === 'ano')} |
| nesouhlasí s importem (chyba) | ${count((r) => r.source === 'inventory' && r.note.startsWith('NESOUHLASÍ'))} |

Odkazy uvnitř importovaných textů: ${text.length} různých interních adres – přesměrovaných: ${count((r) => r.source === 'text' && r.expected_status === '308')}, nefunkčních (404): ${count((r) => r.source === 'text' && r.expected_status === '404')}.

### Podle pravidla

| Pravidlo | Význam | Počet |
| --- | --- | --- |
${[...byRule.entries()]
  .sort((a, b) => b[1] - a[1])
  .map(([rule, n]) => `| ${rule} | ${RULE_LABELS[rule] ?? rule} | ${n} |`)
  .join('\n')}

## K rozhodnutí majitele

Cíl je nejlepší odhad podle pravidla. Když chcete jiný, zadejte v administraci přesměrování pro
starou adresu (bez parametrů) – má přednost před automatickým pravidlem.

${table(needsOwner)}

## Neveřejné produkty → nejužší kategorie

Produkty importované jako koncept (bez fotky / ceny) nebo skryté. Dokud nejsou zveřejněné, jejich
stará adresa vede do kategorie (nejhlubší v menu, při shodě ta s nejméně produkty). Po zveřejnění
produktu se přesměrování samo vypne a adresa ukáže produkt.

${table(retired)}

## Přesměrování na úvodní stránku

Jen tam, kde nic lepšího není (zákaznický účet a přihlášení starého e-shopu – nový e-shop účty nemá).

${table(homepage)}

## Nesouhlasí s importem

Cíl podle pravidel je jiný dokument, než do kterého byla adresa importována. Mělo by být prázdné.

${table(mismatches)}

## Všechna přesměrování z inventury (${redirects.length})

${table(redirects)}

## Odkazy v importovaných textech

Interní odkazy v textech produktů, článků, receptů a stránek (importér je přepsal na staré
adresy). Fungují přes přesměrování; v administraci je můžete časem opravit na cílovou adresu.

${table(text)}

## Co se nepřesměrovává

- Staré obrázky \`/ew/ew_images/image_of_object?ObjectIdentifier=…\` a další soubory systému EasyWeb:
  vrací 404. Nejsou to stránky; obrázky jsou v novém webu nahrané znovu (Média) a vyhledávače
  si nové adresy najdou ze stránek. Přesměrovat by je šlo jen ručně po jednom (nemá smysl).
- Košík a účet starého e-shopu (\`/obchod/kosik\` → \`/kosik\`, účet → úvodní stránka): viz výše.
- \`www\` / bez \`www\`, \`http\` → \`https\`: patří do nastavení domény (Cloudflare / Vercel), ne do
  aplikace – viz README, etapa 9.
`
}
