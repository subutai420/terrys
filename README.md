# Terrys.cz – nový e-shop

Nový e-shop řeznictví **Terrys.cz** (prémiové maso a steaky). Jedna aplikace obsahuje:

- **obchod (storefront)** pro zákazníky – [Next.js](https://nextjs.org/) + [Tailwind CSS](https://tailwindcss.com/),
- **administraci** pro obsluhu e-shopu – [Payload CMS 3](https://payloadcms.com/) na adrese `/admin`,
- **databázi** [PostgreSQL](https://www.postgresql.org/) (lokálně běží v Dockeru).

Projekt vzniká po etapách (0–9). Hotové jsou **etapa 0 – základ projektu**, **etapa 1 – katalog
a obsah v administraci** (produkty, kategorie, číselníky, články, recepty, stránky, nastavení)
**etapa 2 – doručování** (způsoby dopravy, PSČ, rozvozové oblasti, kalendář výjimek a svátků,
výpočet termínů doručení) **etapa 3 – obchod pro zákazníky** a **etapa 4 – košík a objednávky** (viz níže). Z etapy 8 (migrace) je hotová první část: **přenos katalogu a obsahu
ze starého webu** (viz níže). Navazují další etapy (košík a objednávky, vážení
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
   - <http://localhost:3000> – obchod,
   - <http://localhost:3000/admin> – administrace. Při prvním spuštění vytvoříte prvního
     uživatele (e-mail a heslo).

Server zastavíte v terminálu klávesami `Ctrl+C`. Databázi zastavíte příkazem `docker compose down`
(data zůstanou zachovaná). Příkaz `docker compose down -v` databázi **smaže**.

Jazyk administrace se řídí nastavením prohlížeče: česky pro češtinu (a všechny jazyky kromě
angličtiny), anglicky pro anglický prohlížeč. Jazyk lze přepnout v administraci v nastavení účtu.

## Příkazy (scripts)

| Příkaz                    | Co dělá                                                                                                                         |
| ------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| `pnpm dev`                | Spustí vývojový server na <http://localhost:3000>.                                                                              |
| `pnpm build`              | Vytvoří produkční sestavení aplikace.                                                                                           |
| `pnpm start`              | Spustí produkční sestavení (po `pnpm build`).                                                                                   |
| `pnpm lint`               | Zkontroluje kód nástrojem ESLint.                                                                                               |
| `pnpm typecheck`          | Zkontroluje typy TypeScriptu.                                                                                                   |
| `pnpm test`               | Spustí všechny testy (Vitest): jednotkové + integrační. Databáze musí běžet.                                                    |
| `pnpm test:unit`          | Jen rychlé jednotkové testy (bez databáze).                                                                                     |
| `pnpm test:int`           | Jen integrační testy (Payload + dočasná testovací databáze).                                                                    |
| `pnpm seed`               | Naplní databázi výchozími a ukázkovými daty (lze spouštět opakovaně). `--only=settings,locations,delivery` = jen některé části. |
| `pnpm migrate:crawl`      | Projde starý terrys.cz a uloží ho (viz Přenos dat ze starého webu).                                                             |
| `pnpm migrate:import`     | Nahraje uložený starý web do administrace (viz Přenos dat ze starého webu).                                                     |
| `pnpm test:e2e`           | Spustí testy v prohlížeči (Playwright). Databáze musí běžet.                                                                    |
| `pnpm format`             | Naformátuje kód nástrojem Prettier.                                                                                             |
| `pnpm generate:types`     | Přegeneruje TypeScript typy z nastavení Payloadu (`src/payload-types.ts`).                                                      |
| `pnpm generate:importmap` | Přegeneruje mapu komponent administrace (po přidání vlastních komponent).                                                       |
| `pnpm payload …`          | Příkazy Payload CLI, např. `pnpm payload migrate:create nazev`.                                                                 |

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
│   ├── fields/                # společná pole (slug, SEO, původní URL, pořadí)
│   ├── globals/               # nastavení obchodu (Settings)
│   ├── lib/                   # pomocné funkce (ceny, odhad ceny, slug) + jejich testy
│   ├── migration/             # přenos ze starého webu (crawler, převod stránek, import)
│   │   └── delivery/          # výpočet termínů doručení, svátky, CSV (bez databáze) + testy
│   ├── seed/                  # ukázková data pro pnpm seed (+ obrázky v seed/assets)
│   ├── migrations/            # migrace databáze (generuje Payload)
│   ├── payload.config.ts      # hlavní nastavení Payloadu
│   └── payload-types.ts       # generované typy (pnpm generate:types), neupravovat ručně
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

| Skupina v menu | Co obsahuje                                                                      |
| -------------- | -------------------------------------------------------------------------------- |
| **Objednávky** | Objednávky z e-shopu a odstoupení od smlouvy (etapa 4)                           |
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
| **Řezník**        | Prohlíží (i objednávky); vážit objednávky bude v etapě 5.                                                                                   |

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
6. Objednávka je v administraci v **Objednávky → Objednávky** se stavem „Přijato“. Vážení,
   další stavy, faktury a Balíkobot přijdou v etapě 5.

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
