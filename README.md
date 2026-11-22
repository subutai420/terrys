# Terrys.cz – nový e-shop

Nový e-shop řeznictví **Terrys.cz** (prémiové maso a steaky). Jedna aplikace obsahuje:

- **obchod (storefront)** pro zákazníky – [Next.js](https://nextjs.org/) + [Tailwind CSS](https://tailwindcss.com/),
- **administraci** pro obsluhu e-shopu – [Payload CMS 3](https://payloadcms.com/) na adrese `/admin`,
- **databázi** [PostgreSQL](https://www.postgresql.org/) (lokálně běží v Dockeru).

Projekt vzniká po etapách (0–9). Hotové jsou **etapa 0 – základ projektu**, **etapa 1 – katalog
a obsah v administraci** (produkty, kategorie, číselníky, články, recepty, stránky, nastavení)
a **etapa 2 – doručování** (způsoby dopravy, PSČ, rozvozové oblasti, kalendář výjimek a svátků,
výpočet termínů doručení). Navazují další etapy (obchod pro zákazníky, košík a objednávky, vážení
objednávek, napojení na další služby). Pravidla pro vývoj a obchodní pravidla jsou v souboru [`CLAUDE.md`](./CLAUDE.md).

## Co je potřeba nainstalovat

1. **Node.js 24 LTS** (nebo 22.23.5 a novější) – <https://nodejs.org/>. Verzi ověříte příkazem
   `node -v`. Payload starší verze nepodporuje.
2. **pnpm** – správce balíčků. Nemusíte ho instalovat zvlášť, stačí jednou spustit
   `corepack enable` (pokud hlásí chybu oprávnění, spusťte příkazový řádek jako správce, nebo
   použijte `corepack enable --install-directory "%APPDATA%\npm"`). Správnou verzi pnpm si Corepack
   vezme z `package.json`.
3. **Docker Desktop** – <https://www.docker.com/products/docker-desktop/>. Slouží jen ke spuštění
   databáze na vašem počítači.
4. **Git** a editor, doporučujeme **VS Code** (projekt obsahuje doporučená rozšíření).

## Spuštění na vlastním počítači krok za krokem

Všechny příkazy se zadávají v terminálu ve složce projektu.

1. **Spusťte Docker Desktop** a počkejte, až se ikona velryby ustálí („Engine running“).
2. **Připravte soubor s nastavením.** Zkopírujte `.env.example` na `.env`:
   ```bash
   cp .env.example .env
   ```
   V souboru `.env` změňte `PAYLOAD_SECRET` na dlouhý náhodný řetězec. Vygenerujete ho třeba takto:
   ```bash
   node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
   ```
   Soubor `.env` obsahuje tajné údaje – **nikdy ho nenahrávejte do Gitu** (je v `.gitignore`).
3. **Spusťte databázi:**
   ```bash
   docker compose up -d
   ```
   Pokud Docker hlásí `port is already allocated`, používá port 5432 jiný program. V `.env` pak
   nastavte `POSTGRES_PORT=5433` a v `DATABASE_URL` změňte `5432` na `5433`, a příkaz zopakujte.
4. **Nainstalujte závislosti** (poprvé a vždy po změně `package.json`):
   ```bash
   pnpm install
   ```
5. **Spusťte vývojový server:**
   ```bash
   pnpm dev
   ```
6. **Naplňte databázi ukázkovými daty** (jen poprvé, viz níže [Ukázková data](#ukázková-data-pnpm-seed)):
   ```bash
   pnpm seed
   ```
7. Otevřete v prohlížeči:
   - <http://localhost:3000> – obchod (zatím jen úvodní stránka „připravujeme“),
   - <http://localhost:3000/admin> – administrace. Při prvním spuštění vytvoříte prvního
     uživatele (e-mail a heslo).

Server zastavíte v terminálu klávesami `Ctrl+C`. Databázi zastavíte příkazem `docker compose down`
(data zůstanou zachovaná). Příkaz `docker compose down -v` databázi **smaže**.

Jazyk administrace se řídí nastavením prohlížeče: česky pro češtinu (a všechny jazyky kromě
angličtiny), anglicky pro anglický prohlížeč. Jazyk lze přepnout v administraci v nastavení účtu.

## Příkazy (scripts)

| Příkaz                    | Co dělá                                                                      |
| ------------------------- | ---------------------------------------------------------------------------- |
| `pnpm dev`                | Spustí vývojový server na <http://localhost:3000>.                           |
| `pnpm build`              | Vytvoří produkční sestavení aplikace.                                        |
| `pnpm start`              | Spustí produkční sestavení (po `pnpm build`).                                |
| `pnpm lint`               | Zkontroluje kód nástrojem ESLint.                                            |
| `pnpm typecheck`          | Zkontroluje typy TypeScriptu.                                                |
| `pnpm test`               | Spustí všechny testy (Vitest): jednotkové + integrační. Databáze musí běžet. |
| `pnpm test:unit`          | Jen rychlé jednotkové testy (bez databáze).                                  |
| `pnpm test:int`           | Jen integrační testy (Payload + dočasná testovací databáze).                 |
| `pnpm seed`               | Naplní databázi výchozími a ukázkovými daty (lze spouštět opakovaně).        |
| `pnpm test:e2e`           | Spustí testy v prohlížeči (Playwright). Databáze musí běžet.                 |
| `pnpm format`             | Naformátuje kód nástrojem Prettier.                                          |
| `pnpm generate:types`     | Přegeneruje TypeScript typy z nastavení Payloadu (`src/payload-types.ts`).   |
| `pnpm generate:importmap` | Přegeneruje mapu komponent administrace (po přidání vlastních komponent).    |
| `pnpm payload …`          | Příkazy Payload CLI, např. `pnpm payload migrate:create nazev`.              |

Před prvním spuštěním `pnpm test:e2e` je potřeba jednou stáhnout prohlížeč:
`pnpm exec playwright install chromium`.

## Struktura složek

```
.
├── .github/workflows/ci.yml   # automatické kontroly na GitHubu (lint, typy, testy, build)
├── src/
│   ├── app/
│   │   ├── (frontend)/        # obchod pro zákazníky (stránky, layout, globals.css s barvami)
│   │   └── (payload)/         # administrace Payload a API (generované soubory, neupravovat)
│   ├── access/                # kdo co smí (role a přístupová práva) + testy
│   ├── collections/           # datové kolekce Payloadu (produkty, kategorie, číselníky, obsah…)
│   ├── components/admin/      # vlastní části administrace (import PSČ, svátky, kalendář)
│   ├── delivery/              # doručování: načtení pravidel z databáze, API, import PSČ
│   ├── fields/                # společná pole (slug, SEO, původní URL, pořadí)
│   ├── globals/               # nastavení obchodu (Settings)
│   ├── lib/                   # pomocné funkce (ceny, odhad ceny, slug) + jejich testy
│   │   └── delivery/          # výpočet termínů doručení, svátky, CSV (bez databáze) + testy
│   ├── seed/                  # ukázková data pro pnpm seed (+ obrázky v seed/assets)
│   ├── migrations/            # migrace databáze (generuje Payload)
│   ├── payload.config.ts      # hlavní nastavení Payloadu
│   └── payload-types.ts       # generované typy (pnpm generate:types), neupravovat ručně
├── tests/e2e/                 # testy v prohlížeči (Playwright)
├── tests/int/                 # integrační testy (Payload + dočasná databáze)
├── media/                     # nahrané obrázky (lokálně, není v Gitu)
├── docker-compose.yml         # lokální databáze PostgreSQL 16
├── .env.example               # vzor nastavení – zkopírujte na .env
├── CLAUDE.md                  # pravidla projektu pro vývojáře a AI asistenty
└── package.json               # závislosti a příkazy
```

## Administrace: co kde najdete

| Skupina v menu | Co obsahuje                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| **Katalog**    | Produkty (cena, varianty, fotky, vlastnosti) a Kategorie (strom kategorií, menu) |
| **Číselníky**  | Řezy, Země původu, Druhy masa, Hodí se na, Trvanlivost a skladování              |
| **Obsah**      | Články (Magazín, Terrys Academy), Recepty, Stránky, Obrázky                      |
| **Doručování** | Způsoby dopravy, Rozvozové oblasti, Výjimky v kalendáři, PSČ                     |
| **Přehledy**   | Kalendář doručování (které dny se pro dané PSČ doručuje)                         |
| **Nastavení**  | Provozovny a odběrná místa, Uživatelé, Nastavení obchodu                         |

- **Koncepty a publikování:** produkty, články, recepty a stránky se na webu ukážou až po kliknutí
  na „Publikovat“. Do té doby jsou to koncepty; předchozí verze lze obnovit v záložce „Verze“.
- **Slug** (adresa v URL) se vytvoří sám z názvu bez diakritiky („Svíčková“ → `svickova`). Po
  zveřejnění ho neměňte, jinak přestanou fungovat odkazy.
- **Ceny:** cena se zadává za 1 kg (nebo za 100 g, u omáček apod. „za kus“) včetně DPH. Varianty
  (250 g, 500 g, celý kus…) mají hmotnost a obchod u nich ukáže **odhad** ceny = cena × hmotnost.
  Výsledná cena se řídí skutečnou hmotností po zvážení. Slevy ani akční ceny se nezadávají.
- **Obrázky:** u každého obrázku je povinný popis (alternativní text). Menší velikosti pro web se
  vytvoří automaticky.

## Role uživatelů

| Role              | Co smí                                                                                                                                      |
| ----------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **Administrátor** | Vše: produkty, obsah, číselníky, uživatelé, provozovny, nastavení obchodu.                                                                  |
| **Obsluha**       | Produkty, kategorie, číselníky, obsah, obrázky a výjimky v kalendáři doručování. Ne uživatele, nastavení, způsoby dopravy, oblasti ani PSČ. |
| **Řezník**        | Zatím jen prohlíží (později bude vážit objednávky).                                                                                         |

První uživatel vytvořený v prázdné databázi je vždy administrátor. Nové uživatele zakládá a role
mění jen administrátor (Nastavení → Uživatelé). Každý si může změnit své jméno a heslo.

## Ukázková data (`pnpm seed`)

Příkaz `pnpm seed` naplní databázi tím, co je potřeba pro start:

- číselníky (řezy, země původu, druhy masa, „hodí se na“, trvanlivost),
- strom kategorií (Steaky podle původu a řezu, Wagyu, Telecí, Zvěřina, …),
- 12 produktů Rib Eye z návrhu e-shopu (s fotkami a variantami 250 g – 1 kg),
- prodejnu Praha 2 – Vinohrady (Italská 17) a sklad Slivínko,
- nastavení obchodu (doprava 229 Kč),
- doručování: 4 způsoby dopravy (rozvoz vlastním vozem, kurýr PPL, osobní odběr v prodejně
  a ve Slivínku) s **provizorním** nastavením (út–pá, uzávěrka 12:00 – označeno „PROVIZORNÍ“
  v interní poznámce), rozvozovou oblast „Praha (PROVIZORNÍ)“, **ukázkový vzorek** 20 PSČ
  (ne úplný seznam!) a státní svátky letošního (jen budoucí) a příštího roku,
- prázdné koncepty stálých stránek, jeden **ukázkový** článek a jeden **ukázkový** recept
  (jako koncepty, s textem „UKÁZKA“ – před zveřejněním je nahraďte skutečným obsahem).

Údaje, které neznáme (telefon, otevírací doba, IČO, trvanlivost, popisy produktů), seed
**nevyplňuje** nebo je označí slovem „DOPLNIT“. Doplňte je v administraci.

Příkaz lze spustit opakovaně: chybějící položky doplní, existující nechá beze změny (vaše úpravy
nepřepíše). V produkci (`NODE_ENV=production`) se odmítne spustit, pokud nenastavíte `SEED_FORCE=1`.

Na úplně prázdné databázi můžete seedem rovnou vytvořit administrátora: v `.env` vyplňte
`SEED_ADMIN_EMAIL` a `SEED_ADMIN_PASSWORD`. Jinak prvního uživatele vytvoříte v prohlížeči na
<http://localhost:3000/admin>.

## Doručování (etapa 2)

### Jak to funguje

Zákazník v košíku nejdřív zadá **PSČ**. Obchod mu podle něj nabídne způsoby dopravy a ke každému
dny, kdy může objednávku dostat (nebo vyzvednout). Vše se nastavuje v administraci ve skupině
**Doručování**:

1. **Způsoby dopravy** – rozvoz vlastním chladicím vozem, kurýr (přes Balíkobot, dnes PPL)
   a osobní odběry (prodejna Italská 17, sklad Slivínko). U každého je:
   - **dny doručení** (výchozí út–pá; sobotu lze kdykoli zaškrtnout),
   - **uzávěrka** – kdo objedná před tímto časem, může dostat nejbližší možný den; kdo objedná
     přesně v tento čas nebo později, dostane o den později. Vždy podle pražského času,
   - **příprava (dní)** – 1 = nejdříve zítra,
   - **kam se doručuje** – jen v rozvozových oblastech / všude v ČR / „záložní“ = všude, kam
     nejezdí vlastní vůz (typicky kurýr),
   - **cena** se tu nezadává: rozvoz i kurýr stojí vždy jednotnou cenu z **Nastavení obchodu →
     Cena dopravy** (229 Kč, doprava zdarma neexistuje). Osobní odběr je vždy zdarma.
2. **Rozvozové oblasti** – která PSČ obsluhuje daný způsob dopravy, případně s vlastními dny.
   PSČ se nezadávají po jednom: stačí začátek s hvězdičkou. `1*` = celá Praha, `252*` = všechna
   PSČ začínající 252, `250 01` = jen toto PSČ. Když na jedno PSČ pasuje víc oblastí stejného
   způsobu dopravy, platí ta přesnější (celé PSČ > delší začátek > kratší začátek).
   Příklad: oblast „Mladoboleslavsko“, PSČ `293*, 294*`, dny jen středa.
3. **PSČ** – seznam všech PSČ v ČR (plní se importem, viz níže). Doručujeme jen na PSČ, která
   v seznamu jsou; jinak zákazník uvidí jen osobní odběr. U PSČ lze zaškrtnout **„Nedoručujeme“**
   (pak jen osobní odběr).
4. **Výjimky v kalendáři** – svátky, dovolená, porucha vozu… (viz níže).
5. **Kalendář doručování** (v menu „Přehledy“) – zadáte PSČ a měsíc a uvidíte, ve které dny se
   kterým způsobem doručuje a proč ne (svátek, dovolená, není to rozvozový den).

V **Nastavení obchodu** je ještě „Kolik dní dopředu nabízet termíny“ (výchozí 21).

### Jak vypnout den (svátek, dovolená, porucha)

**Doručování → Výjimky v kalendáři → Vytvořit**: vyplňte datum, důvod a pro koho výjimka platí
(vše / jeden způsob dopravy / osobní odběr na jednom místě) a uložte. Hotovo – jeden záznam.

- **Období** (např. dovolená 6.–19. 7.): vyplňte i pole „Do (včetně)“.
- **Mimořádně otevřeno** (např. předvánoční sobota): typ výjimky „Mimořádně otevřeno“. Pokud
  na stejný den platí i „Zavřeno“, má přednost „Zavřeno“.
- Výjimky smí upravovat administrátor i obsluha.

### Státní svátky

Svátky nejsou natvrdo v programu – jsou to obyčejné výjimky, které lze smazat (např. když se
rozhodnete 1. 5. rozvážet). V seznamu **Výjimky v kalendáři** je tlačítko **„Předvyplnit svátky“**
pro zvolený rok (včetně Velkého pátku a Velikonočního pondělí). Už zadané svátky nezdvojí.
Pozor: když svátek smažete a tlačítko pro stejný rok použijete znovu, svátek se vrátí.
`pnpm seed` předvyplní letošní (jen budoucí) a příští rok. Svátky na další rok předvyplňte
každý rok (např. v listopadu).

### Import a export PSČ

V **Doručování → PSČ** je nad seznamem rámeček **Import a export PSČ (CSV)** (jen pro
administrátora):

1. Připravte soubor CSV (např. uložením z Excelu jako „CSV (oddělený středníkem)“). První řádek
   jsou názvy sloupců: `psc;obec;okres;nedorucujeme`. Povinný je jen `psc`. Ve sloupci
   `nedorucujeme` pište `ano`/`ne`.
2. Klikněte na „Vybrat soubor“, zvolte soubor a „Importovat CSV“.
3. Zobrazí se souhrn: kolik PSČ bylo vytvořeno, aktualizováno, beze změny, kolik řádků bylo
   přeskočeno (duplicitní PSČ) a které řádky mají chybu (s číslem řádku).

Pravidla importu: nic se nemaže; prázdné buňky nic nepřepíšou; když v souboru chybí sloupec
`nedorucujeme`, zůstane u PSČ to, co je nastaveno v administraci. Funguje kódování UTF-8
i Windows-1250 (české Excely). Odkaz **„Stáhnout všechna PSČ (CSV)“** stáhne aktuální seznam
(lze ho upravit v Excelu a znovu naimportovat). Hromadně lze PSČ upravit i přímo v seznamu
(zaškrtnout řádky → Upravit).

**Úplný seznam PSČ:** `pnpm seed` vkládá jen **ukázkový vzorek 20 PSČ** (soubor
`src/seed/postcodes-sample.csv`). Oficiální seznam zveřejňuje Česká pošta na
<https://www.ceskaposta.cz/ke-stazeni/zakaznicke-vystupy> („Seznam adresních PSČ“, CSV v archivu
ZIP). Stáhněte ho, rozbalte a naimportujte. Import rozpozná sloupec `PSC` a název pošty/obce ve
sloupcích jako `NAZPOST`, `NAZEV_POSTY` nebo `NAZOBCE`; po prvním importu zkontrolujte souhrn
a pár PSČ v seznamu. Před spuštěním e-shopu je to nutné – bez toho se rozvoz nabídne jen na PSČ
ze vzorku.

### Pro košík (programátorsky)

`GET /api/delivery/options?psc=12000` vrátí pro PSČ seznam způsobů dopravy s cenou a volnými
termíny (bez přihlášení, bez interních údajů). Podrobnosti v `CLAUDE.md`.

## Databáze a migrace (stručně)

- Při `pnpm dev` Payload sám upravuje strukturu lokální databáze podle kódu.
- Pro produkci a CI se struktura vytváří **migracemi** ze složky `src/migrations`. Po každé změně
  kolekcí je potřeba vytvořit novou migraci: `pnpm payload migrate:create popis-zmeny`.
  Produkční server (`pnpm start`) migrace při startu sám spustí.
- Lokální databázi upravovanou přes `pnpm dev` nekombinujte s migracemi. Pokud chcete lokálně
  zkoušet `pnpm start`, použijte samostatnou prázdnou databázi (jiný název v `DATABASE_URL`), nebo
  databázi smažte (`docker compose down -v`) a začněte znovu.

## Barvy značky (Tailwind)

Definované v `src/app/(frontend)/globals.css`, používají se jako třídy Tailwindu:

| Token             | Barva     | Příklad třídy          |
| ----------------- | --------- | ---------------------- |
| `brand-red`       | `#B00004` | `bg-brand-red`         |
| `brand-brown`     | `#3A2317` | `text-brand-brown`     |
| `brand-beige`     | `#E4DFD8` | `bg-brand-beige`       |
| `brand-gold`      | `#D6CC89` | `border-brand-gold`    |
| `brand-gold-dark` | `#D19723` | `text-brand-gold-dark` |
