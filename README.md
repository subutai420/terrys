# Terrys.cz – nový e-shop

Nový e-shop řeznictví **Terrys.cz** (prémiové maso a steaky). Jedna aplikace obsahuje:

- **obchod (storefront)** pro zákazníky – [Next.js](https://nextjs.org/) + [Tailwind CSS](https://tailwindcss.com/),
- **administraci** pro obsluhu e-shopu – [Payload CMS 3](https://payloadcms.com/) na adrese `/admin`,
- **databázi** [PostgreSQL](https://www.postgresql.org/) (lokálně běží v Dockeru).

Projekt vzniká po etapách (0–9). Hotové jsou **etapa 0 – základ projektu**, **etapa 1 – katalog
a obsah v administraci** (produkty, kategorie, číselníky, články, recepty, stránky, nastavení)
**etapa 2 – doručování** (způsoby dopravy, PSČ, rozvozové oblasti, kalendář výjimek a svátků,
výpočet termínů doručení) **etapa 3 – obchod pro zákazníky**, **etapa 4 – košík a objednávky**, **etapa 5 – vážení a expedice objednávek**, **etapa 6 – měření a feedy** a **etapa 7 – prodej dárkových poukazů** (viz níže). Z etapy 8 (migrace) je hotová první část: **přenos katalogu a obsahu
ze starého webu** (viz níže). Navazují další etapy (měření a marketing, dárkové
poukazy, spuštění). Pravidla pro vývoj a obchodní pravidla jsou v souboru [`CLAUDE.md`](./CLAUDE.md).

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
   - <http://localhost:3000> – obchod,
   - <http://localhost:3000/admin> – administrace. Při prvním spuštění vytvoříte prvního
     uživatele (e-mail a heslo).

Server zastavíte v terminálu klávesami `Ctrl+C`. Databázi zastavíte příkazem `docker compose down`
(data zůstanou zachovaná). Příkaz `docker compose down -v` databázi **smaže**.

Jazyk administrace se řídí nastavením prohlížeče: česky pro češtinu (a všechny jazyky kromě
angličtiny), anglicky pro anglický prohlížeč. Jazyk lze přepnout v administraci v nastavení účtu.

## Příkazy (scripts)

| Příkaz                    | Co dělá                                                                                                                                                   |
| ------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                | Spustí vývojový server na <http://localhost:3000>.                                                                                                        |
| `pnpm build`              | Vytvoří produkční sestavení aplikace.                                                                                                                     |
| `pnpm start`              | Spustí produkční sestavení (po `pnpm build`).                                                                                                             |
| `pnpm lint`               | Zkontroluje kód nástrojem ESLint.                                                                                                                         |
| `pnpm typecheck`          | Zkontroluje typy TypeScriptu.                                                                                                                             |
| `pnpm test`               | Spustí všechny testy (Vitest): jednotkové + integrační. Databáze musí běžet.                                                                              |
| `pnpm test:unit`          | Jen rychlé jednotkové testy (bez databáze).                                                                                                               |
| `pnpm test:int`           | Jen integrační testy (Payload + dočasná testovací databáze).                                                                                              |
| `pnpm seed`               | Naplní databázi výchozími a ukázkovými daty vč. ukázkových objednávek (lze spouštět opakovaně). `--only=settings,locations,delivery` = jen některé části. |
| `pnpm migrate:crawl`      | Projde starý terrys.cz a uloží ho (viz Přenos dat ze starého webu).                                                                                       |
| `pnpm migrate:import`     | Nahraje uložený starý web do administrace (viz Přenos dat ze starého webu).                                                                               |
| `pnpm test:e2e`           | Spustí testy v prohlížeči (Playwright). Databáze musí běžet.                                                                                              |
| `pnpm format`             | Naformátuje kód nástrojem Prettier.                                                                                                                       |
| `pnpm generate:types`     | Přegeneruje TypeScript typy z nastavení Payloadu (`src/payload-types.ts`).                                                                                |
| `pnpm generate:importmap` | Přegeneruje mapu komponent administrace (po přidání vlastních komponent).                                                                                 |
| `pnpm payload …`          | Příkazy Payload CLI, např. `pnpm payload migrate:create nazev`.                                                                                           |

Před prvním spuštěním `pnpm test:e2e` je potřeba jednou stáhnout prohlížeč:
`pnpm exec playwright install chromium`. Testy obchodu počítají s daty z `pnpm seed`: spouštějte je
nad prázdnou databází, do které jste pustili `pnpm payload migrate` a `pnpm seed` (stejně jako CI).

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
│   ├── components/storefront/ # části obchodu (hlavička, menu, karty produktů, výběr varianty…)
│   ├── storefront/            # načítání dat pro obchod, vyhledávání, obnova po úpravách
│   ├── proxy.ts               # přesměrování starých adres kategorií na stránku kategorie (interně)
│   ├── delivery/              # doručování: načtení pravidel z databáze, API, import PSČ
│   ├── fulfilment/            # vyřizování objednávek: vážení, vyúčtování, stavy, e-maily, tisk
│   ├── shipping/              # napojení na dopravce (Balíkobot, simulace)
│   ├── integrations/          # etapa 6: Meta CAPI, Heureka, Ecomail (fronta, opakování)
│   ├── feeds/                 # etapa 6: generování produktových feedů (Google, Meta, Heureka, Zboží)
│   ├── app/feeds/[file]/      # etapa 6: adresy /feeds/google.xml, meta.xml, heureka.xml, zbozi.xml
│   ├── fields/                # společná pole (slug, SEO, původní URL, pořadí)
│   ├── globals/               # nastavení obchodu (Settings)
│   ├── lib/                   # pomocné funkce (ceny, odhad ceny, slug) + jejich testy
│   ├── migration/             # přenos ze starého webu (crawler, převod stránek, import)
│   │   └── delivery/          # výpočet termínů doručení, svátky, CSV (bez databáze) + testy
│   ├── seed/                  # ukázková data pro pnpm seed (+ obrázky v seed/assets)
│   ├── migrations/            # migrace databáze (generuje Payload)
│   ├── payload.config.ts      # hlavní nastavení Payloadu
│   └── payload-types.ts       # generované typy (pnpm generate:types), neupravovat ručně
├── docs/screenshots/          # snímky obrazovek po etapách
├── tests/e2e/                 # testy v prohlížeči (Playwright)
├── tests/int/                 # integrační testy (Payload + dočasná databáze)
├── migration/                 # inventura starých URL, report importu, uložené vzorové stránky
├── media/                     # nahrané obrázky (lokálně, není v Gitu)
├── docker-compose.yml         # lokální databáze PostgreSQL 16
├── .env.example               # vzor nastavení – zkopírujte na .env
├── CLAUDE.md                  # pravidla projektu pro vývojáře a AI asistenty
└── package.json               # závislosti a příkazy
```

## Administrace: co kde najdete

| Skupina v menu | Co obsahuje                                                                             |
| -------------- | --------------------------------------------------------------------------------------- |
| **Objednávky** | Expedice (vážení, vyúčtování, štítky), Objednávky, Odstoupení od smlouvy, Historie změn |
| **Poukazy**    | Poukazy – platby (párování plateb, hledání kódu, staré poukazy), Dárkové poukazy, Šarže |
| **Katalog**    | Produkty (cena, varianty, fotky, vlastnosti) a Kategorie (strom kategorií, menu)        |
| **Číselníky**  | Řezy, Země původu, Druhy masa, Hodí se na, Trvanlivost a skladování                     |
| **Obsah**      | Články (Magazín, Terrys Academy), Recepty, Stránky, Obrázky                             |
| **Doručování** | Způsoby dopravy, Rozvozové oblasti, Výjimky v kalendáři, PSČ                            |
| **Přehledy**   | Kalendář doručování (které dny se pro dané PSČ doručuje)                                |
| **Nastavení**  | Provozovny a odběrná místa, Uživatelé, Fronta marketingu, Nastavení obchodu, Marketing  |

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
| **Řezník**        | Prohlíží (i objednávky) a váží objednávky (viz Vyřizování objednávek).                                                                      |

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

## Obchod pro zákazníky (etapa 3)

Obchod má vzhled podle návrhu **A „Řeznictví“** (červená hlavička, dlaždice zemí, filtry v levém
sloupci). Všechno, co zákazník vidí, se bere z administrace – nic se nepíše do programu.

### Odkud se bere obsah

| Na webu                              | Kde se upravuje v administraci                                                                                   |
| ------------------------------------ | ---------------------------------------------------------------------------------------------------------------- |
| Menu „Sortiment“                     | **Katalog → Kategorie**: pole „Sloupec v menu“ (podle druhu masa / řezu / původu / samostatně) a „Pořadí v menu“ |
| Kategorie (úvodní text, text dole)   | **Katalog → Kategorie**                                                                                          |
| Produkty, ceny, varianty, dostupnost | **Katalog → Produkty**                                                                                           |
| Filtry v kategorii                   | Číselníky (řez, země původu, druh masa, hodí se na) vyplněné u produktů + dostupnost                             |
| Úvodní stránka                       | **Obsah → Úvodní stránka** (viz níže)                                                                            |
| Magazín, Terrys Academy, slovník     | **Obsah → Články** (rubrika Magazín / Terrys Academy)                                                            |
| Recepty                              | **Obsah → Recepty** (pole „V tomto receptu jsme použili“ = produkty s tlačítkem do košíku)                       |
| Stálé stránky                        | **Obsah → Stránky**                                                                                              |
| Patička: kontakty, firma, sítě       | **Nastavení → Nastavení obchodu**                                                                                |
| Prodejny, otevírací doba             | **Nastavení → Provozovny** (pole „Stránka prodejny na webu“ propojí provozovnu se stránkou)                      |
| Cena dopravy (229 Kč), text u odhadu | **Nastavení → Nastavení obchodu**                                                                                |

- Změna v administraci se na webu projeví **hned při dalším načtení stránky** (web si stránky
  pamatuje kvůli rychlosti a po každém uložení si je obnoví).
- Koncepty a produkty se stavem „Skryto“ se na webu nikdy neukážou. Vyprodané produkty se ukazují
  (kvůli vyhledávačům), ale nejdou přidat do košíku.
- **Náhled konceptu:** u produktu, článku, receptu nebo stránky klikněte v administraci na
  „Náhled“. Web se otevře i s uloženými, ale ještě nezveřejněnými změnami a nahoře bude žlutý pruh
  „Náhled konceptů“. Funguje jen přihlášeným redaktorům.
- Když u provozovny vyplníte otevírací dobu, ukáže se na stránce prodejny „Dnes otevřeno do …“
  nebo „Dnes zavřeno“. Prázdná otevírací doba = nic se neukazuje (nic si nedomýšlíme).
- Údaje začínající slovem „DOPLNIT“ se zákazníkům nikdy nezobrazí.

### Jak upravit úvodní stránku

**Obsah → Úvodní stránka** má tři záložky:

1. **Úvod** – nadpis, text a fotka velkého pruhu nahoře, dvě tlačítka a lišta „Proč nakoupit
   u nás“ (max. 4 body; `{doprava}` se nahradí cenou dopravy).
2. **Kategorie a produkty** – výběr kategorií do velkých karet („Naše nejoblíbenější steaky“),
   výběr a pořadí zemí, malé dlaždice „Další maso a dárky“ a doporučené produkty.
3. **Příběh a magazín** – hnědý pás „O nás“ (ukáže se jen s nadpisem a textem) a nadpisy sekcí
   magazínu a receptů. Nejnovější články a recepty se doplňují samy.

Když výběr necháte prázdný, web si poradí sám: karty řezů vezme ze sloupce menu „Podle řezu“,
dlaždice zemí ze zemí původu, ke kterým máme produkty (kam dlaždice vede, nastavíte u země polem
„Kategorie země“), a fotky kategorií z fotek jejich produktů.

### Adresy stránek (URL) – důležité pro vyhledávače

- Vše, co se přeneslo ze starého webu, má **stejnou adresu jako na starém webu** (pole „Původní
  URL“), např. `/produkty/argentinsky-hovezi-rib-eye-detail-406`. Nic se nepřesměrovává.
- Nové položky založené v administraci dostanou adresu ze slugu: produkt
  `/produkty/detail/slug`, kategorie `/produkty/kategorie/slug`, článek `/magazin/clanek/slug`
  (Terrys Academy `/academy-magazin/clanek/slug`), recept `/recepty/recept/slug`, stránka
  `/stranky/slug`. Tyto adresy se se starými nikdy nepotkají.
- Pole „Původní URL“ a slug po zveřejnění neměňte – změnila by se adresa a staré odkazy by
  přestaly fungovat.
- Vyhledávání zůstává na staré adrese `/vyhledavani?ProductsSearch=…` (používá se v reklamách)
  a najde i slova bez diakritiky („svickova“ najde „Svíčková“).
- Filtrované výpisy (`?puvod=argentina`) a vyhledávání se do Googlu neindexují; mapa webu je na
  `/sitemap.xml`.

### Spuštění obchodu nad daty ze starého webu

```bash
# PowerShell; databáze terrys_migration z importu (etapa 8)
$env:DATABASE_URL='postgres://terrys:terrys@127.0.0.1:5433/terrys_migration'
pnpm payload migrate
pnpm seed --only=settings,locations,delivery   # jen nastavení, provozovny a doprava, ne ukázkové produkty
pnpm build; pnpm start                          # nebo: $env:PAYLOAD_MIGRATING='true'; pnpm dev
```

Přihlášení k newsletteru v patičce se zatím jen kontroluje a nikam neodesílá (Ecomail v etapě 6).

## Košík a objednávky (etapa 4)

### Jak objednávka probíhá

1. **Košík** (`/kosik`) – zákazník vidí zboží s fotkou, variantou, odhadem hmotnosti a odhadem
   ceny. Při otevření košíku obchod ověří u serveru aktuální ceny a dostupnost; když se něco
   vyprodalo, zmizelo nebo zdražilo, košík se upraví a zákazník uvidí proč.
2. **Doprava a termín** (v košíku) – zákazník zadá **PSČ**, vybere způsob dopravy (u nedostupných
   je vysvětlení) a den (nabízí se jen dny, kdy se opravdu vozí / vydává). Rozvoz i kurýr stojí
   cenu z Nastavení obchodu, osobní odběr je zdarma. PSČ, kam nevozíme, dostane jen osobní odběr.
3. **Dokončení objednávky** (`/objednavka`, jedna stránka) – kontakt, adresa (nebo místo
   odběru), nepovinně firma (IČO/DIČ), poznámka pro řezníka, číslo dárkového poukazu (neověřuje
   se – zkontroluje ho kolega a odečte při vážení), souhlas s obchodními podmínkami, nepovinně
   newsletter (nezaškrtnutý), možnost odmítnout dotazník Heureka. Tlačítko „Objednávka zavazující
   k platbě“. Vše je odhad, zákazník platí až při převzetí podle skutečné hmotnosti.
4. **Server vše přepočítá** – ceny ze zákazníkova prohlížeče se nikdy nepoužijí. Pokud mezitím
   uplynula uzávěrka a zvolený den už nejde, zákazník dostane hlášku a vybere jiný.
5. **Děkovná stránka** (`/objednavka/dekujeme/…`) a **e-maily**: potvrzení zákazníkovi a kopie
   obchodu se všemi údaji (pojistka, kdyby nešla administrace).
6. Objednávka je v administraci v **Objednávky → Objednávky** (a v **Expedici**) se stavem
   „Přijato“. Co se s ní děje dál, popisuje kapitola Vyřizování objednávek.

Čísla objednávek jdou po sobě od **100001** (číslo se může výjimečně přeskočit, to nevadí).

### Odstoupení od smlouvy

V patičce je odkaz **Odstoupení od smlouvy** (`/odstoupeni-od-smlouvy`): zákazník vyplní jméno,
e-mail a číslo objednávky a potvrdí. Dostane e-mail s potvrzením (obsah + datum a čas), obchod
dostane upozornění a záznam je v **Objednávky → Odstoupení od smlouvy** (u dohledané objednávky
i na její kartě v záložce „Interní“). Zda se odstoupení na zboží vztahuje (maso podléhající rychlé
zkáze obvykle ne), posuzuje obchod – formulář je záměrně neutrální.

### Co je potřeba nastavit (proměnné v `.env`, vše je nepovinné)

| Proměnná                                                 | K čemu                                                                                                                |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------- |
| `RESEND_API_KEY`                                         | Odesílání e-mailů přes [Resend](https://resend.com). **Bez klíče se nic neodesílá** – e-maily se jen uloží do složky. |
| `EMAIL_FROM_ADDRESS`, `EMAIL_FROM_NAME`                  | Odesílatel (doména musí být v Resend ověřená – záznamy SPF/DKIM v DNS).                                               |
| `EMAIL_REPLY_TO`                                         | Kam zákazník odpoví (jinak kontaktní e-mail z Nastavení obchodu).                                                     |
| `EMAIL_OVERRIDE_TO`                                      | Jen pro testovací server: všechny e-maily půjdou na tuto jednu adresu.                                                |
| `EMAIL_OUTBOX_DIR`                                       | Složka pro neodeslané e-maily (výchozí `.emails/`).                                                                   |
| `ORDER_NOTIFICATION_EMAIL`                               | Kam posílat kopii objednávky, pokud není vyplněno v **Nastavení obchodu → Objednávky**.                               |
| `FOXENTRY_API_KEY`, `FOXENTRY_API_VERSION`               | Kontrola adres přes Foxentry (viz níže).                                                                              |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Ochrana formulářů Cloudflare Turnstile (obě hodnoty, nebo žádná).                                                     |

Bez těchto proměnných obchod funguje celý: e-maily se uloží do `.emails/` (otevřete `.html`
v prohlížeči) a u objednávky bude „Neodesláno – jen uloženo do složky“.

**Foxentry – co musí majitel dodat:** v administraci Foxentry projekt se službou pro adresy
(„location“), z něj **API klíč** (`FOXENTRY_API_KEY`) a potvrzení, kterou verzi API projekt
používá (výchozí `2.0`). Klíč se používá jen na serveru (do prohlížeče se nedostane). Obchod
pak po vyplnění adresy nabídne opravu („Nemysleli jste…?“) a výsledek kontroly uloží
k objednávce. Špatná adresa objednávku nikdy nezablokuje.

**Před spuštěním vyplňte v Nastavení obchodu:** firmu (název, IČO, sídlo – zobrazují se před
odesláním objednávky jako údaje o prodávajícím), kontaktní e-mail a telefon a e-mail pro kopie
objednávek.

### Vyzkoušení na vlastním počítači

- `pnpm dev` a nakupte jako zákazník. E-maily najdete ve složce `.emails/`.
- Testy: `pnpm test` (výpočty cen, validace, objednávky proti dočasné databázi) a
  `pnpm test:e2e` (celý nákup v prohlížeči na velikosti mobilu – viz „Příkazy“).
- Testovací objednávky v cizí databázi smažte: v administraci (jen administrátor) nebo SQL
  `DELETE FROM withdrawals; DELETE FROM orders;`.

## Vyřizování objednávek – vážení a expedice (etapa 5)

Všechno se dělá v administraci ve skupině **Objednávky → Expedice**. Na úvodní stránce
administrace je navíc rámeček **„Dnes“**: kolik objednávek čeká na vážení, na odeslání, na
vyzvednutí, kolik je „ke kontrole“ a nová odstoupení od smlouvy. Klepnutím na číslo se otevře
příslušný seznam.

![Expedice](docs/screenshots/etapa-5/expedice.png)

### Denní postup krok za krokem

1. **Ráno otevřete Expedici.** Nahoře je pruh dní (včera, dnes, zítra a dalších 6 dní) – u každého
   dne počet objednávek, odhad kilogramů a kolik zbývá zvážit. Klepněte na den. Objednávky jsou
   rozdělené na **Rozvoz vlastním vozem**, **Kurýr** a **Osobní odběr**. Barevný proužek vlevo
   ukazuje stav (šedá = přijato, oranžová = zváženo, modrá = odesláno/připraveno).
   Hledání (číslo objednávky, jméno, telefon) prohledá všechny dny.
2. **Vytiskněte výrobní list** (tlačítko „Výrobní list“). Nahoře je souhrn „Co připravit“ – kolik
   kusů a kilogramů kterého masa a varianty je na ten den potřeba, pod ním každá objednávka zvlášť
   s cílovými hmotnostmi, poznámkou zákazníka a prázdným sloupcem „Skutečně (g)“ na zapsání.
3. **Řezník váží** – na tabletu nebo telefonu: Expedice → u objednávky **„Vážit“**.
   - U každé položky vidí cílovou hmotnost a cenu za kg. Do velkého pole napíše **gramy** a hned
     vidí cenu a odchylku od odhadu. Klávesa „Další“ skočí na další položku.
   - Více kusů jedné položky se váží **dohromady** (jedno číslo). Kdo chce, klepne na „Vážit po
     kusech“ a zadá každý kus zvlášť – součet se spočítá sám.
   - Když se hmotnost liší víc než o povolených **±15 %** (nastavení), objeví se oranžový rámeček:
     řezník klepne na připravený důvod („Celý kus nejde rozdělit“, „Zákazník souhlasil po
     telefonu“…) nebo napíše vlastní. Vážení to nezastaví, objednávka se jen označí „ke kontrole“.
   - **„Není k dispozici“** = položka se nedodá (0 Kč). **„Náhrada“** = místo objednaného masa jde
     jiné; řezník ho zváží a napíše, co to je (cena zůstává podle původní ceny za kg – obsluha
     to zkontroluje).
   - Kusové zboží (omáčky…) se neváží.
   - **„Uložit rozpracované“** uloží, co je hotové (lze pokračovat později).
     **„Hotovo – zváženo“** jde stisknout, až je vše vyřešené.

   ![Vážení na tabletu](docs/screenshots/etapa-5/vazeni-tablet.png)
   ![Odchylka nad limit](docs/screenshots/etapa-5/vazeni-tablet-odchylka.png)

4. **Obsluha vyúčtuje** – Expedice → **„Vyřídit“** (stránka „Vyřízení objednávky“):
   - Zkontrolujte oranžový rámeček „Ke kontrole“ (velké odchylky, náhrady, nedostupné zboží).
   - **Dárkový poukaz:** pokud zákazník zadal kód, je vidět. Kód ověřte (zatím ručně), pak
     „+ Přidat poukaz“ (kód se předvyplní), částka a do poznámky kdo ověřil. Poukaz je **způsob
     platby, ne sleva** – cena ani DPH se nemění, jen se sníží „K úhradě při převzetí“. Poukazy
     nesmí být vyšší než cena objednávky.
   - **Číslo faktury** opište z účetního programu (faktury vystavuje Blanka v účetnictví jako
     dosud). Pokud stejné číslo už má jiná objednávka, obrazovka hned upozorní a uložení odmítne.
     Pro kurýra na dobírku musí být číslo faktury jen z číslic (je to variabilní symbol).
   - Částka **„K úhradě při převzetí“** je to, co vybere řidič / kurýr / prodejna.
   - **„Potvrdit vyúčtování a poslat zákazníkovi cenu“** – zákazník dostane e-mail s výslednou
     cenou po položkách, částkou k zaplacení a termínem.

   ![Vyúčtování](docs/screenshots/etapa-5/vyrizeni-vyuctovani.png)

5. **Odeslání:**
   - **Kurýr (Balíkobot):** v Expedici „Vytvořit zásilky kurýra“ (nebo u jedné objednávky „Vytvořit
     zásilku a štítek“) → „Štítky dne“ vytiskne PDF se štítky (u jedné objednávky „Tisk štítku“,
     lze tisknout opakovaně) → štítky nalepit → **„Předat dopravci (uzavřít svoz)“**. Tím se
     zásilky předají dopravci, objednávky přejdou do stavu „Odesláno“ a zákazník dostane e-mail
     s odkazem na sledování. Dobírka = částka k úhradě, variabilní symbol = číslo faktury.
     Zásilku, která ještě nebyla předána, lze „Zrušit zásilku“ a vytvořit znovu (např. po opravě
     částky).
   - **Vlastní vůz:** „Rozvoz a výdej“ vytiskne **rozvozový list** pro řidiče (adresa, telefon,
     kolik vybrat, poznámka, podpis). Když řidič vyráží: „Řidič vyráží“ – objednávky dne přejdou
     do „Odesláno“ a zákazníci dostanou e-mail „náš řidič k vám vyráží“.
   - **Osobní odběr:** po přípravě na stránce objednávky „→ Připraveno k odběru“ – zákazník dostane
     e-mail s místem, otevírací dobou (pokud je vyplněná u provozovny) a částkou.
6. **Po předání** nastavte ručně „→ Doručeno“ / „→ Vyzvednuto“.

**Balicí list** (tlačítko u objednávky nebo „Balicí listy“ pro celý den) obsahuje položky se
skutečnou hmotností a cenou a částku k úhradě – přikládá se k zásilce.

**Tisk:** tiskové stránky se otevřou v nové záložce, nahoře je tlačítko „Vytisknout“ (nebo
Ctrl+P). Jsou připravené na A4; tisknou se bez lišty.

### Zrušení objednávky

Na stránce objednávky „Zrušit objednávku…“, napište důvod (pošle se zákazníkovi e-mailem) a
potvrďte. Objednávku s vytvořenou, ale nepředanou zásilkou nejdřív „Zrušit zásilku“.

### E-maily zákazníkovi

| Kdy                                 | E-mail                                              |
| ----------------------------------- | --------------------------------------------------- |
| Obsluha potvrdí vyúčtování (poprvé) | výsledná cena po položkách, k zaplacení, termín     |
| Odesláno – kurýr                    | číslo zásilky a odkaz na sledování                  |
| Odesláno – vlastní vůz              | „náš řidič k vám vyráží <den>“ a částka k zaplacení |
| Připraveno k odběru                 | místo, otevírací doba, částka                       |
| Zrušeno                             | důvod zrušení                                       |

Každý e-mail se pošle automaticky **jen jednou**. Všechny odeslané e-maily jsou vidět na stránce
objednávky; tlačítkem „Poslat znovu“ lze e-mail zopakovat (např. po změně ceny). Bez nastaveného
Resendu se e-maily jen ukládají do složky `.emails/` (stav „Neodesláno – jen uloženo“).

### Kdo co smí

| Role              | Vyřizování objednávek                                                                                                |
| ----------------- | -------------------------------------------------------------------------------------------------------------------- |
| **Administrátor** | Vše, navíc mazání objednávek.                                                                                        |
| **Obsluha**       | Vše kromě mazání: vážení i opravy vážení, poukazy, číslo faktury, potvrzení ceny, zásilky, stavy, e-maily.           |
| **Řezník**        | Vidí objednávky, Expedici a tiskne listy; **jen váží** a označí „Zváženo“. Nemění ceny, údaje zákazníka, nic nemaže. |

Každá změna hmotnosti, ceny, poukazu, čísla faktury, stavu a zásilky se zapisuje do **Historie
změn** (kdo, kdy, původně → nově). Historii nikdo nemůže upravit ani smazat.

### Nastavení

**Nastavení → Nastavení obchodu → Objednávky:** „Povolená odchylka při vážení (%)“ (výchozí 15) a
„Hmotnost obalu zásilky (g)“ (termobox, chladicí vložky – přičte se k masu u kurýra; výchozí
1000 g). **Doručování → Způsoby dopravy → Kurýr → Balíkobot:** kód dopravce (`ppl`) a **kód
služby** Balíkobotu (bez něj ostrý Balíkobot zásilku nevytvoří).

### Balíkobot a simulace

| Proměnná v `.env`                         | K čemu                                                             |
| ----------------------------------------- | ------------------------------------------------------------------ |
| `BALIKOBOT_API_USER`, `BALIKOBOT_API_KEY` | Přístup k Balíkobotu (klientská zóna → expediční místo → API).     |
| `BALIKOBOT_API_URL`                       | Nepovinné, výchozí `https://apiv2.balikobot.cz`.                   |
| `BALIKOBOT_SIMULATION=1`                  | Vynutí simulaci (testy, zkušební server). Na ostrém e-shopu nikdy. |

**Simulace** = bez přihlašovacích údajů se nic neposílá žádnému dopravci. Tlačítka fungují
normálně, ale zásilka dostane vymyšlené číslo `SIM…`, štítek je jen ukázkové PDF s nápisem
SIMULACE a v Expedici i u objednávky svítí červený pruh „SIMULACE“. Slouží k vyzkoušení celého
postupu. Na produkčním serveru se simulace bez `BALIKOBOT_SIMULATION=1` nezapne – bez údajů
tam vytvoření zásilky skončí chybou (aby zákazník nikdy nedostal falešné sledování).
**Napojení na skutečný Balíkobot zatím nebylo vyzkoušeno** (nemáme účet) – před spuštěním je
potřeba poslat zkušební zásilku (viz CLAUDE.md, etapa 9).

Když Balíkobot zásilku odmítne (např. špatné PSČ), u objednávky se zobrazí červený rámeček
s důvodem česky. Údaje se před odesláním kontrolují (telefon, PSČ, číslo faktury jako
variabilní symbol…).

### Ukázkové objednávky

`pnpm seed` (mimo produkci) vytvoří 6 ukázkových objednávek na dnešek a zítřek v různých stavech
(zákazníci `…@example.test`, interní poznámka „UKÁZKOVÁ OBJEDNÁVKA“), aby obrazovky nebyly
prázdné. Na databázi s importovaným katalogem se spouští jen na požádání:
`pnpm seed --only=orders`. Před spuštěním e-shopu je smažte (filtr e-mailu `example.test`).

Snímky obrazovek všech obrazovek jsou ve složce `docs/screenshots/etapa-5/` (výrobní list i jako
PDF). Znovu je vytvoří `SCREENSHOTS=1 pnpm test:e2e`.

## Měření, cookies a produktové feedy (etapa 6)

Shrnutí pro marketing: web sám **nevkládá žádný měřicí kód** (GA4, Meta pixel, Google Ads,
Heureka, Sklik). Posílá jen data do **GTM dataLayer** a všechno ostatní se nastavuje v kontejneru
Google Tag Manageru `GTM-NBGRZCL`. Na serveru navíc běží Meta Conversions API, Heureka Ověřeno
zákazníky a Ecomail. Vše je vypnuté, dokud se na serveru nevyplní příslušné proměnné prostředí.

### Lišta se souhlasem s cookies

- Vlastní lišta (bez externího nástroje), dole na stránce, nezakrývá obsah. Tlačítka
  **„Odmítnout vše“ a „Přijmout vše“ vypadají stejně**, třetí „Nastavit“ otevře okno s volbou
  kategorií. Nic není předem zaškrtnuté. Znovu se otevře z patičky odkazem **„Nastavení soukromí“**.
- Kategorie: **Nezbytné** (vždy: košík, objednávka, tato volba), **Analytické** (GA4 a náš
  záznam, odkud zákazník poprvé přišel), **Marketingové** (Google Ads, Meta vč. serverového
  předání nákupu, Seznam/Zboží, Heureka).
- Volba se ukládá do cookie `terrys_consent` (verze textu, analytické 0/1, marketingové 0/1, čas)
  na 180 dní. **Když přidáte nový nástroj nebo změníte text lišty, změňte v Nastavení → Marketing
  „Verzi textu souhlasu“** – všem se lišta zobrazí znovu.
- Google Consent Mode v2: ještě před načtením GTM se nastaví vše „denied“
  (`ad_storage`, `ad_user_data`, `ad_personalization`, `analytics_storage`; `wait_for_update` 500 ms,
  `ads_data_redaction`). Po volbě (a při každé další návštěvě s uloženou volbou) web pošle
  `gtag('consent','update', …)` a do dataLayer událost `consent_update`
  (`consent_analytics`, `consent_marketing` = `granted`/`denied`).
- Odvolání souhlasu smaže náš záznam o zdroji návštěvy a cookies `_ga*` (analytické) /
  `_gcl*`, `_fbp`, `_fbc` (marketingové) na naší doméně.
- Záznam „odkud zákazník přišel“ (UTM, gclid, fbclid – připojuje se k objednávce) se ukládá do
  prohlížeče **jen se souhlasem s analytickými cookies** (§ 89 odst. 3 zákona o elektronických
  komunikacích vyžaduje souhlas pro každé ukládání do zařízení, které není nezbytné pro službu,
  o kterou zákazník požádal; viz CLAUDE.md). Bez souhlasu nebude u objednávky zdroj vyplněný.

### Kde se GTM načte

Jen když platí všechno: `GTM_ENABLED=1`, `GTM_ID`, a **adresa stránky je v seznamu
`GTM_ALLOWED_HOSTS`** (produkce: `terrys.cz,www.terrys.cz`). Klon webu na cizí doméně (dříve
terrys.live) proto GTM nenačte a nezkreslí statistiky. Na počítači vývojáře a v testech se GTM
nenačítá nikdy; produkční kontejner `GTM-NBGRZCL` se mimo produkční server odmítne.

### Události v dataLayer (pro nastavení GTM)

Před každou e-commerce událostí web pošle `{ ecommerce: null }` (vyčištění, doporučení Googlu).
Každá událost má navíc `event_id` (unikátní, pro Meta pixel „Event ID“) a `value_is_estimate: true`.

| Událost (`event`)   | Kdy                                                           | Hlavní parametry v `ecommerce`                                                       |
| ------------------- | ------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `virtual_page_view` | každé zobrazení stránky, i přechody bez obnovení (Next.js)    | (mimo `ecommerce`) `page_location`, `page_path`, `page_title`, `page_referrer`       |
| `view_item_list`    | kategorie, /produkty, vyhledávání                             | `item_list_id`, `item_list_name`, `items[]` (s `index`)                              |
| `select_item`       | klik na produkt v seznamu                                     | `item_list_id`, `item_list_name`, `items[1]`                                         |
| `view_item`         | detail produktu                                               | `currency`, `value`, `items[1]` (výchozí varianta)                                   |
| `add_to_cart`       | „Do košíku“, „+“ v košíku                                     | `currency`, `value`, `items[]`                                                       |
| `remove_from_cart`  | „−“, „Odebrat“ v košíku                                       | `currency`, `value`, `items[]`                                                       |
| `view_cart`         | otevření košíku                                               | `currency`, `value`, `items[]`                                                       |
| `add_shipping_info` | košík → „Pokračovat k objednávce“                             | `currency`, `value`, `shipping_tier`, `items[]`; nahoře `delivery_date`              |
| `begin_checkout`    | stránka objednávky (jednou za nákup)                          | `currency`, `value`, `items[]`                                                       |
| `purchase`          | stránka „Děkujeme“ – **jednou za objednávku** (ani reload ne) | `transaction_id`, `currency`, `value`, `tax`, `shipping`, `shipping_tier`, `items[]` |
| `consent_update`    | volba v liště                                                 | (mimo `ecommerce`) `consent_analytics`, `consent_marketing`                          |
| `newsletter_signup` | přihlášení k newsletteru v patičce                            | (mimo `ecommerce`) `method`                                                          |

**Položka (`items[]`):** `item_id` (viz níže), `item_name`, `item_variant` (např. „500 g“),
`item_brand` (producent, jinak „Terrys“), `item_category` … `item_category5` (kategorie produktu
a nadřazené), `price` (odhad za 1 kus vč. DPH), `quantity`, `index`, `item_list_id/name`, a
vlastní parametry `item_group_id` (ID produktu), `price_per_kg`, `estimated_weight_grams`,
`price_is_estimate`. Nikdy `coupon` ani `discount`.

**Navíc u `purchase` (mimo `ecommerce`):** `event_id` = ID objednávky pro deduplikaci s Meta
Conversions API, `value_net` (zboží bez DPH), `value_tax_goods`, `order_total` (zboží + doprava
vč. DPH), `delivery_price`, `delivery_type` (např. `PPL`, `VLASTNI_VYDEJNI_MISTA`) a – **jen se
souhlasem s marketingovými cookies** – `user_data` pro rozšířené konverze / advanced matching:
`{ email, phone_number (E.164, +420…), address: { first_name, last_name, street, city,
postal_code, country: 'CZ' } }` (nešifrované; Google i Meta si je samy normalizují a hashují).

### Hodnota objednávky – co znamená `value`

| Kam                          | Hodnota                                                    | Proč                                                                       |
| ---------------------------- | ---------------------------------------------------------- | -------------------------------------------------------------------------- |
| GA4 `ecommerce.value`        | **odhad za zboží vč. DPH, bez dopravy** (= Σ cena × počet) | GA4 nechce dopravu ve value; ceny položek jsou vč. DPH, value jim odpovídá |
| GA4 `shipping` / `tax`       | 229 / 0 Kč; DPH obsažená v celé objednávce                 | zvlášť, jak GA4 chce                                                       |
| Google Ads konverze (tROAS)  | doporučeno `ecommerce.value` (vč. DPH) – nebo `value_net`  | rozhodněte jednou a nechte (změna rozbije srovnání ROAS)                   |
| Meta pixel + CAPI `Purchase` | odhad za zboží vč. DPH, bez dopravy, `CZK`                 | stejné jako GA4; server posílá totéž                                       |
| Zboží/Seznam (SEM)           | `value_net` (bez DPH), `value_tax_goods`, `delivery_price` | Seznam chce value bez DPH                                                  |
| Heureka měření konverzí      | položky `price` × `quantity`, celkem `order_total`         | podle jejich skriptu                                                       |

Všechny hodnoty jsou **odhad v okamžiku objednávky** (řezník váží, výsledná cena se liší obvykle do
±15 %). Doprava ve feedech i v událostech je vždy 229 Kč (osobní odběr 0 Kč jen jako samostatná
možnost odběru).

### Jednotné ID produktu (`item_id`)

Stejné ID je v dataLayer, ve všech feedech, v Meta CAPI (`content_ids`) a v Heurece:
**varianta = `<ID produktu>-<ID varianty>`** (např. `406-6b03246590708426ec932438`), produkt bez
variant (omáčka, koření) = `<ID produktu>`. ID skupiny variant (`item_group_id`) = ID produktu.
ID varianty se nemění při úpravách v administraci (přejmenování, jiná hmotnost, pořadí); změní se
jen, když variantu smažete a založíte znovu.

### Co je potřeba nastavit v GTM (kontejner GTM-NBGRZCL)

1. **Proměnné (Data Layer Variable, verze 2):** `ecommerce.transaction_id`, `ecommerce.value`,
   `ecommerce.currency`, `ecommerce.items`, `ecommerce.tax`, `ecommerce.shipping`, `event_id`,
   `value_net`, `order_total`, `user_data`, `page_location`, `page_path`, `page_title`.
2. **Google tag (GA4 G-PXMZXR26RG):** spouštěč _Initialization – All Pages_, v nastavení
   `send_page_view` = `false` a v GA4 (Datové proudy → Rozšířené měření → Zobrazení stránek →
   _vypnout_ „změny stránky na základě událostí historie prohlížeče“). Pak **GA4 Event tag
   `page_view`** na vlastní událost `virtual_page_view` s parametry `page_location`,
   `page_title`, `page_referrer` z dataLayer (URL stránky „Děkujeme“ je tak bez tajného tokenu).
3. **GA4 e-commerce:** jeden GA4 Event tag s názvem `{{Event}}` a volbou „Send Ecommerce data“
   (zdroj: Data Layer), spouštěč vlastní událost regex
   `^(view_item_list|select_item|view_item|add_to_cart|remove_from_cart|view_cart|begin_checkout|add_shipping_info|purchase)$`.
4. **Google Ads:** konverze „Nákup“ na `purchase`: hodnota `{{ecommerce.value}}` (nebo
   `{{value_net}}`), měna `{{ecommerce.currency}}`, ID transakce `{{ecommerce.transaction_id}}`.
   Rozšířené konverze: v Google tagu zapnout „Allow user-provided data“, v tagu konverze
   proměnná _User-Provided Data_ → „Code“ → Data Layer proměnná `user_data`.
   Dynamický remarketing: `items[].item_id` odpovídá ID v Merchant Center feedu.
5. **Meta pixel:** PageView na `virtual_page_view`; ViewContent/AddToCart/InitiateCheckout/
   Purchase na příslušné události; **Event ID = `{{event_id}}`** (u Purchase je to stejné ID,
   které posílá server – Meta obě události spáruje), `content_ids` = položky `item_id`,
   `content_type` = `product`, `value`/`currency`. Advanced matching z `user_data`.
6. **Souhlas:** Admin → Container settings → _Enable consent overview_. GA4 tagy: vyžadovat
   `analytics_storage`; Google Ads, Meta, Sklik/Zboží, Heureka: vyžadovat `ad_storage` (u Meta,
   Sklik a Heureka zvolit „Require additional consent“, protože nemají vestavěný Consent Mode).
   Doporučujeme „basic“ režim (tagy bez souhlasu vůbec nepálí); „advanced“ (anonymní pingy Googlu
   bez souhlasu) jen po odsouhlasení právníkem. Výchozí stav souhlasu nastavuje web, **v GTM
   nepřidávejte žádnou jinou CMP šablonu ani vlastní „consent default“**.
7. **Heureka měření konverzí:** Custom HTML tag podle návodu Heureky (SDK v2, _veřejný_ klíč),
   spouštěč `purchase`: `set_order_id` = `{{ecommerce.transaction_id}}`, `add_product` pro každou
   položku (`item_id`, `item_name`, `price`, `quantity` – ID odpovídají Heureka feedu),
   `set_total_vat` = `{{order_total}}`, měna CZK. Souhlas: marketingový.
8. **Zboží.cz / Sklik:** šablona „Seznam SEM“ z galerie komunitních šablon (čte GA4 `ecommerce`
   z dataLayer) nebo starší konverzní kód `rc.js` jako Custom HTML; `value` = `{{value_net}}`
   (bez DPH), `orderId` = `{{ecommerce.transaction_id}}`, `delivery_type` = `{{delivery_type}}`,
   `consent` = 1 jen s marketingovým souhlasem.
9. Odstraňte ze starého kontejneru tagy navázané na starý web (EasyWeb události, staré proměnné).

**Testování:** GTM → Náhled (Preview) → zadejte adresu webu. Na zkušebním serveru použijte GTM
prostředí (`GTM_AUTH`, `GTM_PREVIEW`) a jeho doménu přidejte do `GTM_ALLOWED_HOSTS`. Meta: v Events
Manageru → Test events zkopírujte kód do `META_CAPI_TEST_EVENT_CODE` – serverové události se pak
ukážou jen tam (na ostrém webu proměnnou smažte). V administraci objednávky (záložka Interní →
„Marketing a měření“) vidíte, co server odeslal; podrobnosti v Nastavení → **Fronta marketingu**.

### Serverové odesílání (Meta CAPI, Heureka, Ecomail)

| Služba                        | Kdy                                        | Podmínka                                        |
| ----------------------------- | ------------------------------------------ | ----------------------------------------------- |
| Meta Conversions API Purchase | hned po přijetí objednávky                 | souhlas s marketingovými cookies                |
| Heureka Ověřeno zákazníky     | hned po přijetí objednávky (podle Heureky) | zákazník NEzaškrtl „Nesouhlasím s dotazníkem“   |
| Ecomail (kontakt + jméno)     | hned po přijetí objednávky                 | zákazník zaškrtl souhlas s newsletterem         |
| Ecomail (patička webu)        | po odeslání formuláře                      | double opt-in: Ecomail pošle potvrzovací e-mail |

Odesílá se až po uložení objednávky a nezdrží ani nezablokuje nákup. Když služba neodpoví,
zkusí se to znovu za 1 min, 5 min, 30 min, 2 h, 12 h (cron `/api/integrations/retry` každých
15 minut, nastavený ve `vercel.json`; potřebuje `CRON_SECRET`). Meta přijímá události nejvýš 7 dní
staré.

### Produktové feedy

| Kanál                  | Adresa                                    | Kam ji zadat                                                         |
| ---------------------- | ----------------------------------------- | -------------------------------------------------------------------- |
| Google Merchant Center | `https://www.terrys.cz/feeds/google.xml`  | Produkty → Zdroje dat → Přidat zdroj → „Načíst soubor z URL“ (denně) |
| Meta katalog           | `https://www.terrys.cz/feeds/meta.xml`    | Commerce Manager → Katalog → Zdroje dat → Datový feed → Plánovaný    |
| Heureka.cz             | `https://www.terrys.cz/feeds/heureka.xml` | Administrace Heureky → Nastavení → XML feed (nahradit starou adresu) |
| Zboží.cz               | `https://www.terrys.cz/feeds/zbozi.xml`   | Administrace Zboží (Sklik) → Provozovna → XML feed                   |

- Jedna položka = jedna **varianta** (konkrétní hmotnost a odhad ceny), odkaz vede na produkt
  s předvybranou variantou (`?varianta=…`), takže web ukazuje přesně cenu z feedu. Cena za kg je
  v polích jednotkové ceny (Google `unit_pricing_measure` „500 g“ / `unit_pricing_base_measure`
  „1 kg“, Meta `unit_price`), u Heureky a Zboží je v popisu věta „Cena je odhad za 500 g
  (990 Kč/kg)…“.
- Jen publikované a ne skryté produkty. Vyprodané: Google a Meta je mají jako „není skladem“,
  Heureka a Zboží je nedostávají vůbec. „Na cestě“: Google `backorder` s datem dostupnosti, Meta
  „in stock“ (lze objednat), Heureka/Zboží doba dodání ze Nastavení → Marketing.
- Doprava 229 Kč (kurýr PPL), u Zboží navíc osobní odběr 0 Kč (`VLASTNI_VYDEJNI_MISTA`). Náš
  rozvoz po Praze se do feedů neuvádí – `VLASTNI_PREPRAVA` smí jen dopravce po celé ČR.
- Bez EAN (vlastní zboží): Google `identifier_exists = no`. Nikdy `sale_price`.
- Kategorie: výchozí v Nastavení → Marketing (Google 4628 Maso, Heureka „… | Maso, drůbež,
  ryby“, Zboží „Potraviny a nápoje | Potraviny | Maso a ryby“), u kategorie lze přepsat
  (Katalog → Kategorie → záložka **Feedy**). **Doplňte prosím** u kategorií, které nejsou maso:
  Omáčky a koření (Google 427), Sýry (429), Terrys Cake / Dorty / Makronky, Termotašky, Lanýže,
  Hotová jídla, Ryby, Vegetariánské produkty; **vyřaďte** Broušení nožů a případně Dárkové
  poukazy (zaškrtávátko „Nevkládat do feedů“ u kategorie nebo u produktu).
- Feed se po úpravě produktu přegeneruje při dalším stažení, jinak nejpozději za hodinu. Přehled
  (čas vytvoření, počet položek) je v Nastavení → Marketing.
- Stav na importovaném katalogu (22. 11. 2026): 241 veřejných produktů → Google/Meta 731 položek
  z 238 produktů, Heureka/Zboží 515 položek ze 160 produktů (bez vyprodaných); vyřazeny 3 produkty
  s cenou za kg bez variant (Termotaška malá, Termotaška XL, Wagyu Flank URUG_BMS 6-7 – nedají se
  objednat). Vytvoření jednoho feedu trvá 0,1–0,4 s.

### Newsletter (Ecomail)

Formulář v patičce posílá adresu do Ecomailu s **double opt-in** (Ecomail pošle e-mail
s potvrzovacím odkazem; text souhlasu je pod formulářem). Zákazníci, kteří při objednávce
zaškrtnou newsletter, se do stejného seznamu přidají se jménem (zdroj „objednavka“). Nákupní
data, opuštěné košíky a historie objednávek se do Ecomailu zatím **neposílají** (po spuštění webu).
V Ecomailu nastavte potvrzovací (double opt-in) e-mail seznamu a uvítací automatizaci.

### WhatsApp

Číslo z Nastavení obchodu → Kontakty → WhatsApp se zobrazí jako odkaz v patičce a na detailu
produktu (obyčejný odkaz `wa.me`, žádný skript třetí strany). Prázdné pole = odkaz se neukáže.

### Proměnné prostředí (etapa 6)

`GTM_ENABLED`, `GTM_ID`, `GTM_ALLOWED_HOSTS`, `GTM_AUTH`, `GTM_PREVIEW`, `META_PIXEL_ID`,
`META_CAPI_ACCESS_TOKEN`, `META_CAPI_TEST_EVENT_CODE`, `META_CAPI_API_VERSION`,
`HEUREKA_OVERENO_API_KEY`, `ECOMAIL_API_KEY`, `ECOMAIL_LIST_ID`, `CRON_SECRET`,
`INTEGRATIONS_ALLOW_NONPROD` – popis a produkční hodnoty v `.env.example`.

### Co udělat v jednotlivých nástrojích při spuštění webu

- **GTM:** body 1–9 výše, otestovat v Náhledu, publikovat.
- **Merchant Center:** nový zdroj dat z URL feedu, zkontrolovat Diagnostiku (ceny vs. web, obrázky),
  starý zdroj vypnout až po schválení nového. Doprava: v nastavení účtu 229 Kč, doba doručení.
- **Meta Commerce Manager:** feed jako plánovaný zdroj; v Events Manageru propojit katalog
  s pixelem (shoda `content_ids`), vygenerovat CAPI token, zapnout automatické advanced matching
  jen pokud nepoužijete `user_data`.
- **Heureka:** nová adresa feedu, klíč Ověřeno zákazníky do `HEUREKA_OVERENO_API_KEY`, veřejný
  klíč měření konverzí do GTM, zkontrolovat párování kategorií.
- **Zboží.cz:** nová adresa feedu, kategorie, měřicí kód (SEM nebo rc.js) v GTM.
- **Ecomail:** API klíč a ID seznamu do env, potvrzovací e-mail double opt-in v nastavení seznamu.

## Dárkové poukazy (etapa 7)

Poukazy se prodávají jako dosud ve dvou provedeních. Zákazník na stránce poukazu vybere hodnotu
(500 / 1 000 / 2 000 / 5 000 Kč) a provedení:

| Provedení        | Jak ho zákazník dostane                                             | Jak platí                                                | Kdy poukaz platí           |
| ---------------- | ------------------------------------------------------------------- | -------------------------------------------------------- | -------------------------- |
| **Elektronický** | PDF e-mailem **hned po objednávce**, bez dopravy a bez termínu      | **převodem do 72 hodin** (QR kód a údaje jsou v e-mailu) | až když dorazí platba      |
| **Tištěný**      | přibalíme k objednávce masa (doprava 229 Kč) nebo k osobnímu odběru | při převzetí, stejně jako maso                           | až po převzetí a zaplacení |

- **Elektronický poukaz nejde koupit v jedné objednávce s masem** (jako na starém webu – každá
  část se platí jinak). Košík to zákazníkovi vysvětlí a nabídne „Změnit na tištěný poukaz“.
- Více kusů = více kódů. Firmy vyplní IČO/DIČ v objednávce. Zákazník může dopsat „Pro koho“
  a krátké věnování – vytisknou se na poukaz.
- Poukaz je **platidlo, ne sleva**: při uplatnění se cena masa ani DPH nemění, jen zákazník méně
  doplácí. Poukaz lze čerpat **postupně** (zůstatek zůstává na poukazu) až do data platnosti.

V administraci je nová skupina **Poukazy**: **Poukazy – platby** (denní práce), **Dárkové
poukazy** (všechny poukazy) a **Šarže poukazů**. Řezník poukazy nevidí.

![Poukazy – platby](docs/screenshots/etapa-7/poukazy-platby.png)

### Než začnete prodávat (jednou)

1. **Nastavení → Nastavení obchodu → záložka Dárkové poukazy → Bankovní účet**: zadejte číslo
   účtu (např. `123456789/0800`) nebo IBAN. Překlep se neuloží (kontroluje se kontrolní součet).
   **Bez účtu obchod elektronické poukazy nenabídne** (v administraci svítí červené upozornění).
   Tamtéž: splatnost (výchozí 72 hodin) a co dělat s nezaplacenými poukazy (viz níže).
2. **Poukazy → Šarže poukazů → Vytvořit**: písmeno šarže, datum „Platnost poukazů do“,
   zaškrtnout **Aktivní**. Bez aktivní šarže se elektronické poukazy také neprodávají.
3. U produktů „Dárkový poukaz …“ je v bočním panelu zaškrtnuto **„Tento produkt je dárkový
   poukaz“**, hodnota a provedení (elektronický / tištěný). Cena se nastaví sama podle hodnoty.
   **Sazbu DPH poukazů určí účetní** (viz otázky níže) – nastavuje se u produktu.

### Každý den: párování plateb (Poukazy → Poukazy – platby)

1. Otevřete **Poukazy – platby**. V tabulce **Čekají na platbu** je každá objednávka
   elektronického poukazu: **VS (obj.)** = variabilní symbol = číslo objednávky, částka, zákazník,
   kdy objednal a do kdy má zaplatit. **Červený řádek = po splatnosti.**
2. V internetovém bankovnictví najděte příchozí platbu a porovnejte **variabilní symbol**
   a **částku**.
3. U objednávky nastavte den, kdy platba přišla (výchozí dnes), a klikněte **„✓ Zaplaceno“**.
   Poukazy se tím stanou platnými a zákazník dostane krátký e-mail „Platba přijata – poukaz je
   platný“ (jen jednou, i když kliknete dvakrát).
4. **Spletla jsem se?** V části „Zaplaceno za posledních 14 dní“ je u objednávky **„Vrátit
   (omyl)“** – jde to, dokud poukaz nikdo nepoužil. Vše se zapisuje do historie (kdo a kdy).
5. Když zákazník nezaplatí: **„Připomenout“** pošle e-mail s platebními údaji a QR kódem znovu.
   **„Zrušit…“** zruší objednávku i poukazy (napište důvod).

Na úvodní stránce administrace (rámeček **Dnes**) vidíte, kolik poukazů čeká na platbu a kolik je
po splatnosti.

**Nezaplacený poukaz po 72 hodinách** (nastavení „Když poukaz není včas zaplacený“): výchozí je
**označit k řešení + poslat jednu připomínku**. Automatické zrušení se zapne jen volbou „… po
dalších dnech automaticky zrušit“ (výchozí 14 dní po splatnosti). Proč tak opatrně: poukaz už
zákazník má v e-mailu a často ho dal jako dárek – platba může přijít i pozdě a zrušení by
obdarovaného nepříjemně překvapilo; poukaz ale nikdy neplatí, dokud nezaplatíte „Zaplaceno“.

### Uplatnění poukazu (stránka „Vyřízení objednávky“)

1. Zákazník kód poukazu napíše do objednávky (pole „Dárkový poukaz“), nebo ho ukáže v prodejně.
2. Po zvážení otevřete objednávku v **Expedici → Vyřídit**. V části **Úhrada dárkovým poukazem**
   klikněte **„+ Přidat poukaz“** – kód zákazníka se předvyplní (mezery, pomlčky ani malá písmena
   nevadí).
3. Pod kódem se hned ukáže stav: **✓ platný, zbývá … Kč, platí do …**, nebo proč ho nelze použít
   (nezaplacený, vyčerpaný, propadlý, zrušený). Tlačítko **„Použít až … Kč“** vyplní částku (nejvýš
   tolik, kolik stojí objednávka).
4. **„Potvrdit vyúčtování“** – zůstatek poukazu se sníží ve stejném okamžiku, kdy se uloží
   objednávka (dvě obsluhy nemohou jeden poukaz utratit dvakrát). Na poukazu je vidět, v které
   objednávce a kolik se z něj zaplatilo. Odebrání poukazu z objednávky (nebo zrušení objednávky)
   částku na poukaz vrátí.
5. **Najít poukaz:** dole na stránce Poukazy – platby je **„Najít poukaz podle kódu“** – ukáže
   stav, hodnotu, zůstatek, platnost, kde se použil a historii.

### Tištěné poukazy

V objednávce s tištěným poukazem je na stránce Vyřízení rámeček **Tištěné dárkové poukazy**:
**„Vystavit kódy“** vytvoří kód(y) z aktivní šarže, **„Tisk poukazů (PDF)“** je vytiskne (nebo
kód opište na předtištěný poukaz) a přibalte k objednávce. Poukazy začnou platit, když objednávku
označíte **Doručeno / Vyzvednuto** (zákazník zaplatil při převzetí). Tisk 3 poukazů na A4 a
správa předtištěných poukazů přijdou po spuštění webu.

### Poukazy ze starého e-shopu

Staré poukazy v oběhu platí do svého data platnosti. Nový web je nezná, dokud je nezapíšete:

- **Jeden poukaz:** na stránce Vyřízení (když kód nenajde, nabídne **„Zapsat starý poukaz“**) nebo
  v Poukazy – platby → „+ Zapsat starý poukaz“: kód přesně z poukazu, hodnota, kolik zbývá (prázdné
  = celá hodnota), platnost do, poznámka. Poukaz se zapíše jako zaplacený.
- **Hromadně:** Poukazy – platby → „Hromadně nahrát staré poukazy (CSV)“. Soubor se sloupci
  `kod;hodnota;zbyva;platnost_do;poznamka` (datum `2027-12-31` nebo `31. 12. 2027`). Kódy, které
  už v evidenci jsou, se přeskočí.
- **Co potřebujeme ze starého systému:** seznam prodaných a ještě platných poukazů – kód, hodnota,
  datum platnosti, zda je zaplacený a kolik z něj už bylo vyčerpáno (případně číslo objednávky
  a datum prodeje). Nejlépe jako export do Excelu/CSV od dodavatele starého webu (EasyWeb).

### Nový rok = nová šarže

Každý poukaz má v kódu písmeno šarže (`XXXX-XXXX-XX`**`K`**`-XXX`) a všechny poukazy jedné šarže
platí do stejného dne. Před koncem platnosti (administrace upozorní 60 dní předem):

1. **Poukazy → Šarže poukazů → Vytvořit**: nové písmeno (např. další v abecedě), nové datum
   „Platnost poukazů do“, zaškrtněte **Aktivní**, uložte.
2. Předchozí šarže se sama vypne (už vydané poukazy dál platí do svého data). Platnost už vydaných
   poukazů lze jen **prodloužit**, ne zkrátit.

### Pro marketing

- Nákup poukazu se v měření (dataLayer `purchase`, Meta CAPI) zaznamená při objednávce jako
  každý jiný nákup – doprava 0, bez `shipping_tier`, nikdy `coupon`/`discount`. Uplatnění poukazu
  hodnotu objednávky nemění.
- Do produktových feedů poukazy **nejdou** (Nastavení → Marketing → Dárkové poukazy → „Zařadit
  dárkové poukazy do feedů“). Po zapnutí jde do feedů jen tištěný poukaz (s dopravou) v kategorii
  Google 53 „Dárkové certifikáty“, Heureka „… | Originální dárky | Dárkové poukazy“, Zboží
  „… | Oslavy a dárky | Dárkové poukazy“.
- Heureka „Ověřeno zákazníky“ se u objednávek jen s poukazy neposílá (lze zapnout tamtéž).

### Otázky pro majitele a účetní

- **Účetní – DPH poukazů:** víceúčelový poukaz se obvykle při prodeji nedaní a daní se až při
  uplatnění (zboží v objednávce má svou DPH); jednoúčelový se daní už při prodeji. Sazba se
  nastavuje u produktu poukazu (12 / 21 / 0 %). **Importované poukazy mají ze starého webu 12 %**
  – nechali jsme je beze změny, rozhodne účetní. Pozor: kdyby se poukaz zdanil při prodeji
  i u uplatnění, bylo by to dvakrát.
- **Majitel:** elektronický poukaz odchází **před zaplacením** (tak to zadání chce a tak to bylo
  i dosud) – v e-mailu i na webu je napsáno, že platí až po přijetí platby. Souhlasí?
- **Majitel:** text podmínek na poukazu (krátké podmínky v PDF) – zkontrolujte, případně upravte
  v kódu (`VOUCHER_TERMS` v `src/vouchers/pdf.ts`).
- **Majitel:** bankovní účet pro platby poukazů (zatím prázdný).

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

**Úplný seznam PSČ:** `pnpm seed` vkládá oficiální seznam 2 680 doručovacích PSČ s obcí a okresem
(soubor `src/seed/postcodes-cr.csv`, sestavený ze souboru „PSČ částí obcí“ České pošty, stav

1. 11. 2026, zdroj <https://www.ceskaposta.cz/ke-stazeni/zakaznicke-vystupy>). U PSČ sdílených více
       obcemi je uvedena nejčastější obec. Aktualizovaný seznam lze kdykoli naimportovat v administraci.

### Pro košík (programátorsky)

`GET /api/delivery/options?psc=12000` vrátí pro PSČ seznam způsobů dopravy s cenou a volnými
termíny (bez přihlášení, bez interních údajů). Podrobnosti v `CLAUDE.md`.

## Přenos dat ze starého webu (etapa 8, první část)

Dva příkazy přenesou katalog a obsah ze starého terrys.cz do nové administrace:

| Příkaz                | Co dělá                                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm migrate:crawl`  | Projde starý web (jen čte), uloží stránky a obrázky do `migration/.cache` a zapíše `migration/url-inventory.csv`.               |
| `pnpm migrate:import` | Z uložených stránek vytvoří/aktualizuje produkty, kategorie, články, recepty, stránky a obrázky a zapíše `migration/report.md`. |

### Jak na to

1. Vytvořte samostatnou databázi pro import a připravte v ní tabulky (jednou):
   ```bash
   docker exec terrys-postgres-1 psql -U terrys -d postgres -c "CREATE DATABASE terrys_migration"
   ```
   V PowerShellu pak: `$env:DATABASE_URL='postgres://terrys:terrys@127.0.0.1:5433/terrys_migration'; pnpm payload migrate`
2. V `.env` nastavte `MIGRATION_DATABASE_URL` na tuto databázi (viz `.env.example`). Bez ní by import
   zapisoval do vývojové databáze z `DATABASE_URL`.
3. `pnpm migrate:crawl` – trvá asi 30 minut (stránky stahuje pomalu, jednu po druhé, aby starý web
   nezatěžoval). Opakované spuštění stahuje jen to, co ještě v `migration/.cache` není; po smazání
   této složky se stáhne vše znovu (např. těsně před spuštěním nového webu).
4. `pnpm migrate:import --dry-run` – zkušební běh, nic nezapíše, jen ukáže v reportu, co by se stalo.
5. `pnpm migrate:import` – skutečný import. Další volby: `--only=products` (nebo `categories`,
   `articles`, `recipes`, `pages`, i více oddělených čárkou), `--limit=10` (jen prvních 10 od každého
   typu), `--force` (přepíše i položky upravené v administraci, zamčené ne).
6. Přečtěte si `migration/report.md`: chyby, produkty bez fotky nebo ceny, texty se slevami či
   „dopravou zdarma“ k úpravě, údaje, pro které nový web nemá pole.

### Co se přenáší a co ne

- **Přenáší se:** produkty (název, popisy, cena a jednotka, varianty s hmotností, dostupnost,
  kategorie, země původu, řez, druh masa, „hodí se na“, trvanlivost, dodavatel, všechny fotky,
  SEO, staré ID jako „Kód zboží“), strom kategorií, články magazínu a Terrys Academy, slovník pojmů
  (jako články Terrys Academy), recepty (suroviny a postup, kde je na starém webu strukturovaný,
  jinak zůstává v „Textu receptu“), stálé stránky a stránky prodejen. U každé položky se uloží
  původní adresa (pro pozdější přesměrování 301).
- **Nepřenáší se:** zákazníci, objednávky ani jiné osobní údaje (GDPR, vyžaduje export od dodavatele
  starého webu), původní/akční ceny (nový web slevy nemá), volba „porcovat / neporcovat“, štítky
  „Bezlepkové“/„Novinka“, „Zrání masa“, rubriky článků (vše je vypsané v reportu), PDF jídelní
  lístek (nahrát ručně), písma starého webu.
- Produkty bez fotky nebo bez ceny se uloží jako **koncept**. Produkty, které starý web nikde
  nenabízí, dostanou stav **Skryto**.

### Když po importu něco upravíte v administraci

Import upravenou položku **nepřepíše**: pozná, že byla po posledním importu změněna, přeskočí ji
a vypíše ji v reportu. Natrvalo ji ochráníte zaškrtnutím **„Nepřepisovat importem“** v bočním
panelu (rámeček „Import ze starého webu“). Položky beze změny import nechá být, položky, které se
změnily na starém webu, aktualizuje. Adresa (slug) se při opakovaném importu nikdy nemění.

## Databáze a migrace (stručně)

- Při `pnpm dev` Payload sám upravuje strukturu lokální databáze podle kódu.
- Pro produkci a CI se struktura vytváří **migracemi** ze složky `src/migrations`. Po každé změně
  kolekcí je potřeba vytvořit novou migraci: `pnpm payload migrate:create popis-zmeny`.
  Produkční server (`pnpm start`) migrace při startu sám spustí.
- Lokální databázi upravovanou přes `pnpm dev` nekombinujte s migracemi. Pokud chcete lokálně
  zkoušet `pnpm start`, použijte samostatnou prázdnou databázi (jiný název v `DATABASE_URL`), nebo
  databázi smažte (`docker compose down -v`) a začněte znovu.

## Barvy značky (Tailwind)

Definované v `src/app/(frontend)/globals.css`, používají se jako třídy Tailwindu (další odstíny
návrhu A: `brand-red-dark`, `brand-brown-light`, `brand-beige-light`, `brand-gold-light`, `ink`,
`muted`, `line`, `ok`, `night`). Písma Roboto Slab (nadpisy) a Quicksand (text) mají volnou
licenci (SIL OFL) a web je při sestavení stáhne a servíruje z vlastní domény.

| Token             | Barva     | Příklad třídy          |
| ----------------- | --------- | ---------------------- |
| `brand-red`       | `#B00004` | `bg-brand-red`         |
| `brand-brown`     | `#3A2317` | `text-brand-brown`     |
| `brand-beige`     | `#E4DFD8` | `bg-brand-beige`       |
| `brand-gold`      | `#D6CC89` | `border-brand-gold`    |
| `brand-gold-dark` | `#D19723` | `text-brand-gold-dark` |
