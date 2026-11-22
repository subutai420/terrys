# Terrys.cz – nový e-shop

Nový e-shop řeznictví **Terrys.cz** (prémiové maso a steaky). Jedna aplikace obsahuje:

- **obchod (storefront)** pro zákazníky – [Next.js](https://nextjs.org/) + [Tailwind CSS](https://tailwindcss.com/),
- **administraci** pro obsluhu e-shopu – [Payload CMS 3](https://payloadcms.com/) na adrese `/admin`,
- **databázi** [PostgreSQL](https://www.postgresql.org/) (lokálně běží v Dockeru).

Projekt vzniká po etapách (0–9). Toto je **etapa 0 – základ projektu**: běžící kostra, na kterou
navazují další etapy (katalog, doprava, košík a objednávky, vážení objednávek, napojení na další
služby). Pravidla pro vývoj a obchodní pravidla jsou v souboru [`CLAUDE.md`](./CLAUDE.md).

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
6. Otevřete v prohlížeči:
   - <http://localhost:3000> – obchod (zatím jen úvodní stránka „připravujeme“),
   - <http://localhost:3000/admin> – administrace. Při prvním spuštění vytvoříte prvního
     uživatele (e-mail a heslo).

Server zastavíte v terminálu klávesami `Ctrl+C`. Databázi zastavíte příkazem `docker compose down`
(data zůstanou zachovaná). Příkaz `docker compose down -v` databázi **smaže**.

Jazyk administrace se řídí nastavením prohlížeče: česky pro češtinu (a všechny jazyky kromě
angličtiny), anglicky pro anglický prohlížeč. Jazyk lze přepnout v administraci v nastavení účtu.

## Příkazy (scripts)

| Příkaz                    | Co dělá                                                                    |
| ------------------------- | -------------------------------------------------------------------------- |
| `pnpm dev`                | Spustí vývojový server na <http://localhost:3000>.                         |
| `pnpm build`              | Vytvoří produkční sestavení aplikace.                                      |
| `pnpm start`              | Spustí produkční sestavení (po `pnpm build`).                              |
| `pnpm lint`               | Zkontroluje kód nástrojem ESLint.                                          |
| `pnpm typecheck`          | Zkontroluje typy TypeScriptu.                                              |
| `pnpm test`               | Spustí rychlé jednotkové testy (Vitest).                                   |
| `pnpm test:e2e`           | Spustí testy v prohlížeči (Playwright). Databáze musí běžet.               |
| `pnpm format`             | Naformátuje kód nástrojem Prettier.                                        |
| `pnpm generate:types`     | Přegeneruje TypeScript typy z nastavení Payloadu (`src/payload-types.ts`). |
| `pnpm generate:importmap` | Přegeneruje mapu komponent administrace (po přidání vlastních komponent).  |
| `pnpm payload …`          | Příkazy Payload CLI, např. `pnpm payload migrate:create nazev`.            |

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
│   ├── collections/           # datové kolekce Payloadu (Users = uživatelé, Media = obrázky)
│   ├── lib/                   # pomocné funkce (např. formátování cen) + jejich testy
│   ├── migrations/            # migrace databáze (generuje Payload)
│   ├── payload.config.ts      # hlavní nastavení Payloadu
│   └── payload-types.ts       # generované typy (pnpm generate:types), neupravovat ručně
├── tests/e2e/                 # testy v prohlížeči (Playwright)
├── media/                     # nahrané obrázky (lokálně, není v Gitu)
├── docker-compose.yml         # lokální databáze PostgreSQL 16
├── .env.example               # vzor nastavení – zkopírujte na .env
├── CLAUDE.md                  # pravidla projektu pro vývojáře a AI asistenty
└── package.json               # závislosti a příkazy
```

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
