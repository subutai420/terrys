# Spuštění nového e-shopu Terrys.cz – kontrolní seznam

Tento dokument je pro člověka, který e-shop spouští a pak udržuje (marketér, ne programátor).
Kroky jdou **po sobě**. U každého je napsáno, **kdo** ho dělá:

- **Majitel**: rozhodnutí, smlouvy, platby za služby, bankovní účet.
- **Správce**: marketér, který web udržuje. Zakládá účty a nastavuje.
- **Právník** a **Účetní**: jejich odpovědi jsou na konci v části „Otevřené otázky“.

Co dělat, když se něco pokazí (e-maily, dopravce, nasazení, obnova databáze), je v
[`docs/provoz.md`](./provoz.md). Technické podrobnosti pro vývojáře jsou v `CLAUDE.md` v kapitole
„Operations (stage 9)“.

> Zásada: nic se nepřepíná „naostro“, dokud neprojde **zkouška nanečisto** (krok 13) na
> zkušební adrese `….vercel.app`.

---

## 0. Přehled: kde co poběží

| Co                               | Služba                                                       | Proč                                                                            |
| -------------------------------- | ------------------------------------------------------------ | ------------------------------------------------------------------------------- |
| Web + administrace               | **Vercel**, tarif **Pro**                                    | Next.js od výrobce. Tarif Hobby je jen pro nekomerční weby a crony má 1× denně. |
| Databáze                         | **Neon** (PostgreSQL), region Frankfurt                      | Napojení na Vercel, automatické zálohy a obnova k libovolnému okamžiku.         |
| Obrázky                          | **Vercel Blob**                                              | Disk funkcí na Vercelu se maže, obrázky musí být ve stálém úložišti.            |
| E-maily                          | **Resend**, region EU (Irsko)                                | Odesílání objednávkových e-mailů z adresy @terrys.cz.                           |
| Doména a DNS                     | **Cloudflare** (jen DNS, „šedý mráček“)                      | Doporučení Vercelu: proxy Cloudflaru by přidala zpoždění a druhou cache.        |
| Hlídání chyb (doporučeno)        | **Sentry**, datové centrum EU                                | Upozorní na chyby dřív než zákazník.                                            |
| Hlídání dostupnosti (doporučeno) | Libovolný „uptime monitor“ (např. Better Stack, UptimeRobot) | Volá adresu `/api/health` každou minutu a pošle SMS / e-mail.                   |
| Dopravce                         | **Balíkobot** (PPL)                                          | Štítky, sledování zásilek, dobírka.                                             |

Region funkcí na Vercelu je nastavený na Frankfurt (`fra1` ve `vercel.json`). **Databázi v Neonu
založte také ve Frankfurtu** (AWS eu-central-1), jinak bude každý dotaz cestovat přes půl Evropy.

---

## 1. Účty, které je potřeba založit (Majitel + Správce)

Účty zakládá Majitel nebo Správce na firemní e-mail (ne na osobní), s dvoufázovým ověřením
přihlášení. Ke každému účtu přidejte druhého člověka jako záložního správce.

1. **Vercel**: tým (Team), tarif Pro. Propojte s GitHubem, kde je kód.
2. **Neon**: projekt `terrys`, Postgres 16 nebo 17, region **AWS Europe Central 1 (Frankfurt)**.
   Propojte s Vercelem přes integraci (Vercel → Integrations → Neon). Integrace sama vytvoří
   proměnné `DATABASE_URL` a `DATABASE_URL_UNPOOLED`.
3. **Vercel Blob**: Vercel → Storage → Create → Blob, připojit k projektu. Vercel sám vytvoří
   `BLOB_READ_WRITE_TOKEN`.
4. **Resend**: účet, doména `terrys.cz` v regionu **eu-west-1**, DNS záznamy podle kroku 9.
5. **Sentry** (doporučeno): organizace v datovém centru EU, projekt typu Next.js.
6. **Balíkobot**: účet, expediční místo, API uživatel a API klíč (klientská zóna).
7. Už existující účty: Google Tag Manager / GA4, Meta (Events Manager), Heureka, Zboží.cz,
   Merchant Center, Ecomail, Cloudflare. Zkontrolujte, že k nim máte přístup.

### Proměnné prostředí (Vercel → Project → Settings → Environment Variables)

Nastavují se zvlášť pro **Production** a pro **Preview** (zkušební nasazení). Hodnoty
nikdy neposílejte e-mailem ani do chatu, vkládejte je rovnou do Vercelu. Vzor s popisem každé
proměnné je v souboru `.env.example`.

| Proměnná                                                 | Kde ji vzít                                                                             | Povinná?           | Co se stane, když chybí                                                                          |
| -------------------------------------------------------- | --------------------------------------------------------------------------------------- | ------------------ | ------------------------------------------------------------------------------------------------ |
| `DATABASE_URL`                                           | Neon integrace (pooled, adresa obsahuje `-pooler`)                                      | **ano**            | Web se nespustí.                                                                                 |
| `DATABASE_URL_UNPOOLED`                                  | Neon integrace (přímé spojení)                                                          | **ano**            | Migrace při sestavení jdou přes pooler (varování, může selhat).                                  |
| `PAYLOAD_SECRET`                                         | Vygenerovat: `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` | **ano**            | Web se nespustí. Změna hodnoty odhlásí všechny uživatele. Pro Preview jiná hodnota.              |
| `NEXT_PUBLIC_SERVER_URL`                                 | `https://www.terrys.cz` (na Preview adresa nasazení)                                    | **ano**            | Špatné odkazy v e-mailech, sitemapě, kanonické adresy; přihlášení bez „secure“ cookie.           |
| `BLOB_READ_WRITE_TOKEN`                                  | Vercel Blob (krok 3)                                                                    | **ano**            | Nahrané obrázky se ztratí. `/api/health` hlásí `media-storage-not-persistent`.                   |
| `RESEND_API_KEY`                                         | Resend → API Keys (oprávnění „Sending access“, jen doména terrys.cz)                    | **ano**            | Žádný e-mail neodejde. `/api/health` hlásí `email-provider-missing`.                             |
| `EMAIL_FROM_ADDRESS`                                     | Např. `objednavky@terrys.cz` (doména ověřená v Resendu)                                 | **ano**            | E-maily selžou (výchozí adresa je neplatná).                                                     |
| `EMAIL_FROM_NAME`                                        | Např. `Terrys Steak`                                                                    | ne                 | Použije se „Terrys Steak“.                                                                       |
| `EMAIL_REPLY_TO`                                         | Adresa, kam mají chodit odpovědi zákazníků                                              | ne                 | Odpovědi jdou na kontaktní e-mail z Nastavení obchodu.                                           |
| `ORDER_NOTIFICATION_EMAIL`                               | Kam chodí interní kopie objednávek                                                      | ne                 | Bere se z administrace (Nastavení obchodu → Objednávky), pak kontaktní e-mail.                   |
| `CRON_SECRET`                                            | Vygenerovat (aspoň 16 náhodných znaků)                                                  | **ano**            | Neopakují se neúspěšná odeslání do Meta / Heureky / Ecomailu a nehlídají se nezaplacené poukazy. |
| `BALIKOBOT_API_USER`, `BALIKOBOT_API_KEY`                | Balíkobot klientská zóna → expediční místo                                              | **ano** pro kurýra | Produkce odmítne vytvořit zásilku kurýra.                                                        |
| `NEXT_PUBLIC_TURNSTILE_SITE_KEY`, `TURNSTILE_SECRET_KEY` | Cloudflare → Turnstile                                                                  | doporučeno         | Formuláře chrání jen past na roboty a limit pokusů.                                              |
| `SENTRY_DSN`, `NEXT_PUBLIC_SENTRY_DSN`                   | Sentry → projekt → Client Keys (DSN)                                                    | doporučeno         | Chyby se zapisují jen do logu Vercelu.                                                           |
| `GTM_ENABLED`, `GTM_ID`, `GTM_ALLOWED_HOSTS`             | `1`, `GTM-NBGRZCL`, `terrys.cz,www.terrys.cz`                                           | ne                 | Měření (GA4, Meta pixel…) se nenačte.                                                            |
| `META_PIXEL_ID`, `META_CAPI_ACCESS_TOKEN`                | Meta Events Manager                                                                     | ne                 | Serverový Purchase do Mety se neposílá.                                                          |
| `HEUREKA_OVERENO_API_KEY`                                | Heureka → Ověřeno zákazníky                                                             | ne                 | Heureka nepošle dotazník.                                                                        |
| `ECOMAIL_API_KEY`, `ECOMAIL_LIST_ID`                     | Ecomail → Pro vývojáře                                                                  | ne                 | Přihlášky k newsletteru se neposílají do Ecomailu.                                               |
| `FOXENTRY_API_KEY`                                       | Foxentry                                                                                | ne                 | Adresy se nekontrolují (objednávky fungují).                                                     |
| `CSP_MODE`                                               | `report-only` (výchozí), později `enforce`                                              | ne                 | Platí `report-only`: nic se neblokuje, jen hlásí.                                                |
| `MIGRATE_ON_PREVIEW`                                     | `1` **jen v prostředí Preview**, když Neon vytváří pro náhledy vlastní větve databáze   | ne                 | Náhledová nasazení databázi nemigrují (bezpečné).                                                |

**Nikdy na produkci:** `SEED_ADMIN_EMAIL`, `SEED_ADMIN_PASSWORD`, `SEED_FORCE`,
`RATE_LIMIT_DISABLED`, `BALIKOBOT_SIMULATION`, `INTEGRATIONS_ALLOW_NONPROD`, `EMAIL_OVERRIDE_TO`
(ten jen na zkušebním nasazení) a `META_CAPI_TEST_EVENT_CODE` po skončení testu (krok 11).

---

## 2. Neon a Vercel: první nasazení na zkušební adresu (Správce)

1. Ve Vercelu založte projekt z GitHubu (Framework: Next.js). Build Command nechte prázdný:
   použije se `pnpm build:vercel` ze souboru `vercel.json`. Ten nejdřív spustí migrace databáze
   přes přímé spojení a pak sestaví web. Když migrace selže, nasazení se zastaví a dál běží
   předchozí verze.
2. Zkontrolujte proměnné z tabulky výše. Proměnné z integrace Neonu mají pro Production
   **produkční databázi** a pro Preview vlastní větev.
3. V Neonu: Settings → **Restore window** nastavte aspoň na **7 dní**. Platí to pro tarif
   Launch, výchozí hodnota je 1 den. Tarif Free má jen 6 hodin a nehodí se.
4. Spusťte první nasazení (Deploy). Po dokončení otevřete `https://<projekt>.vercel.app/api/health`.
   Musí vrátit `"database":{"ok":true}` a `"migrations":{"ok":true}`.
5. Otevřete `/admin` a vytvořte **prvního uživatele**. Ten je automaticky administrátor. Použijte
   silné heslo (aspoň 14 znaků, správce hesel).

> Ochrana administrace: po 5 špatných heslech se účet na 15 minut zamkne. Z jedné IP adresy jde
> zkusit nejvýš 20 přihlášení za 15 minut. Dvoufázové ověření Payload neumí. Doporučení je
> v `docs/provoz.md`, část „Přihlášení do administrace“.

---

## 3. Nastavení obchodu (Správce)

Ukázková data (`pnpm seed` bez omezení) se na produkci **nikdy nespouštějí**. Na produkci se
pouštějí jen tyto části seedu, z vlastního počítače proti produkční databázi:

```powershell
# PowerShell; DATABASE_URL = PŘÍMÁ adresa produkční databáze z Neonu (bez -pooler)
$env:DATABASE_URL='postgres://…'
$env:NODE_ENV='production'
$env:SEED_FORCE='1'
pnpm seed --only=settings,locations,delivery,vouchers
```

`NODE_ENV=production` zajistí, že část `vouchers` jen přiřadí 4 dárkové poukazy z importu.
Nevytvoří ukázkovou šarži, testovací bankovní účet ani ukázkové poukazy.

Pak v administraci doplňte:

1. **Nastavení obchodu**: kontakty, firma (IČO, DIČ, adresa, zápis v rejstříku), sociální sítě,
   `Kam posílat kopii objednávek`, text u odhadu ceny. Hodnoty `DOPLNIT` se na webu nezobrazí.
2. **Prodejny** (Italská 17, Slivínko): otevírací doba, telefon, mapa, parkování.
3. **Doručování**: způsoby dopravy ze seedu mají v interní poznámce **PROVIZORNÍ**. Majitel musí
   potvrdit cut-off 12:00, 1 den předem, dny út–pá, rozvozovou oblast (zatím jen Praha `1*`)
   a kurýra PPL jako „všude jinde“. Pak poznámku smažte.
4. **PSČ**: seed vloží jen 20 ukázkových PSČ. Stáhněte oficiální seznam PSČ České pošty (CSV)
   a nahrajte ho v Doručování → PSČ → Import (návod v README „Import a export PSČ“).
   Neznámé PSČ dostane jen osobní odběr.
5. **Výjimky doručování**: tlačítkem „Předvyplnit svátky“ doplňte státní svátky na letošní
   a příští rok, plus dovolené.
6. **Dárkové poukazy** (Nastavení obchodu → Dárkové poukazy): **skutečný bankovní účet** pro
   platby poukazů. Pak Poukazy → Šarže → nová šarže (písmeno, platnost do) → Aktivní. Bez účtu
   a aktivní šarže nejdou elektronické poukazy objednat.
7. **Kurýr PPL** (Doručování → Způsoby dopravy): Balíkobot kód dopravce `ppl` a kód služby.
   Seznam služeb ukáže Balíkobot. Seed nechává kód služby prázdný.
8. **Marketing** (Nastavení → Marketing): verze textu souhlasu s cookies, výchozí kategorie feedů.
9. **Uživatelé**: účty pro obsluhu (role Obsluha) a řezníky (role Řezník). Každý vlastní účet,
   nikdy sdílené heslo.

---

## 4. Import skutečného katalogu ze starého webu (Správce, s vývojářem)

Těsně před spuštěním (aby byly ceny a texty aktuální):

1. Smažte složku `migration/.cache` a znovu stáhněte starý web: `pnpm migrate:crawl`.
2. Import **rovnou do produkční databáze** (doporučeno). Obrázky jdou při tom přímo do Vercel
   Blob:
   ```powershell
   $env:MIGRATION_DATABASE_URL='postgres://… (PŘÍMÁ adresa produkční databáze)'
   $env:BLOB_READ_WRITE_TOKEN='vercel_blob_rw_…'   # Vercel → Storage → Blob → .env.local
   pnpm migrate:import -- --dry-run                # nejdřív zkouška (nic nezapisuje)
   pnpm migrate:import
   ```
   Import nikdy nepřepíše, co jste mezitím upravili v administraci. Výsledek je v
   `migration/report.md`. Projděte ho s majitelem.
3. Varianta, když už je katalog naimportovaný v místní databázi (`terrys_migration`) a přenáší
   se celá: záloha `pnpm db:backup` → obnova do Neonu přes `pg_restore` (`docs/provoz.md`)
   → nahrání obrázků:
   ```powershell
   $env:BLOB_READ_WRITE_TOKEN='vercel_blob_rw_…'
   pnpm media:upload-blob -- --url="postgres://… (produkční databáze)"            # zkouška
   pnpm media:upload-blob -- --url="postgres://… (produkční databáze)" --confirm  # nahraje
   ```
   Skript nahraje originál i všechny zmenšeniny pod stejnými názvy, takže adresy obrázků platí
   dál. V místní kopii je 348 obrázků, 1 422 souborů včetně zmenšenin.
4. Přesměrování starých adres: `pnpm migrate:redirects` (plán + report) a po nasazení kontrola
   `pnpm migrate:check-redirects --base=https://<projekt>.vercel.app`. Musí skončit
   bez chyb. Viz README „Přesměrování starých adres“.

---

## 5. Odstranění ukázkových dat (Správce)

Na produkci by ukázková data vůbec neměla být (krok 3). Pokud se tam dostala (např. databáze
zkopírovaná ze zkušebního prostředí), smažte je v administraci:

- Objednávky: hledat `example.test`, interní poznámka „UKÁZKOVÁ OBJEDNÁVKA“. Smazat může jen
  administrátor.
- Poukazy s poznámkou „UKÁZKOVÝ“, šarže `T` (bez poukazů jde smazat), testovací účet
  `CZ9106000000000000000123` v Nastavení obchodu → Dárkové poukazy.
- Ukázkové produkty poukazů s DPH 0 % (seed je vytváří jen mimo produkci).
- Uživatel `SEED_ADMIN_EMAIL`, pokud vznikl.

---

## 6. E-maily: Resend a DNS (Správce)

Přesné hodnoty záznamů ukáže Resend po přidání domény (Domains → terrys.cz). Mají vždy tento
tvar (Cloudflare → DNS → Add record, **Proxy status: DNS only**):

| Typ | Název               | Hodnota                                              | Poznámka                                        |
| --- | ------------------- | ---------------------------------------------------- | ----------------------------------------------- |
| TXT | `resend._domainkey` | `p=MIGf…` (dlouhý klíč z Resendu)                    | DKIM podpis                                     |
| MX  | `send`              | `feedback-smtp.eu-west-1.amazonses.com`, priorita 10 | návratová adresa (bounce), přesně podle Resendu |
| TXT | `send`              | `v=spf1 include:amazonses.com ~all`                  | SPF pro návratovou adresu                       |
| TXT | `_dmarc`            | viz níže                                             | DMARC                                           |

SPF se týká jen subdomény `send.terrys.cz`. **Stávající MX a SPF záznamy hlavní domény (pošta
terrys.cz) neměňte.**

DMARC zavádějte postupně. Pokud už záznam `_dmarc` existuje, upravte ho, nezakládejte druhý:

1. Hned: `v=DMARC1; p=none; rua=mailto:dmarc@terrys.cz` (jen sběr reportů, nic se neblokuje).
2. Po 2–4 týdnech čistých reportů (odesílá jen Resend a vaše pošta): `p=quarantine; pct=25`,
   pak `pct=100`.
3. Nakonec `p=reject`.

Zdroje: Resend „Domains“, „Cloudflare“ a „DMARC“ (resend.com/docs, čteno 22. 11. 2026). Gmail
a Yahoo vyžadují u hromadných odesílatelů DMARC aspoň `p=none`.

**Test doručitelnosti:** po ověření domény a nastavení proměnných pošlete z Vercelu (nebo
z počítače se stejnými proměnnými) všechny druhy e-mailů na své schránky:

```powershell
pnpm ops:test-emails -- --to=vas.email@gmail.com
```

Zkontrolujte v **Gmailu, Outlooku, Seznamu a Apple Mail**:

- e-mail dorazil do doručené pošty (ne do spamu),
- odesílatel je „Terrys Steak“, odpověď jde na kontaktní adresu,
- ve zdroji zprávy je `SPF=pass`, `DKIM=pass`, `DMARC=pass`,
- u poukazu se ukazuje QR kód přímo v textu,
- odkazy vedou na `https://www.terrys.cz`.

Bez `RESEND_API_KEY` (na vlastním počítači) se e-maily jen uloží do složky `.emails`.

---

## 7. Balíkobot: skutečná zkušební zásilka (Správce + expedice)

1. Na zkušebním nasazení nastavte `BALIKOBOT_API_USER` a `BALIKOBOT_API_KEY` a **odeberte**
   `BALIKOBOT_SIMULATION`.
2. Udělejte objednávku s kurýrem na vlastní adresu → zvážit → Potvrdit vyúčtování → Vytvořit
   zásilku → Štítek (A4/A6?) → zásilku zrušit (DROP) a vytvořit znovu → Předat dopravci (ORDER).
3. Ověřte: číslo zásilky a odkaz na sledování v e-mailu, dobírka = částka k úhradě, variabilní
   symbol = číslo faktury, telefon ve formátu +420. Bankovní účet pro dobírky nastavte v klientské
   zóně Balíkobotu.
4. S PPL ověřte, jestli je potřeba „ORDER“ (předání) každý den (je naprogramováno) a jak se
   objednává svoz (ORDERPICKUP naprogramovaný není).

Napojení se zatím nikdy nevyzkoušelo proti skutečnému účtu. Je to první ostrý test.

---

## 8. Měření, feedy, marketing (Správce)

Postup je v README, tady se jen odkazuje:

- GTM, souhlas s cookies, události: README „Měření, cookies a produktové feedy“ → „Co je potřeba
  nastavit v GTM“ a „Co udělat v jednotlivých nástrojích při spuštění webu“.
- Meta CAPI: jedna testovací objednávka s `META_CAPI_TEST_EVENT_CODE`, v Events Manageru
  zkontrolovat „Deduplicated“ a pak **testovací kód smazat**.
- Heureka Ověřeno zákazníky, Ecomail (dorazí potvrzovací e-mail double opt-in), feedy
  (`/feeds/google.xml`, `meta.xml`, `heureka.xml`, `zbozi.xml`) zaregistrovat v Merchant Center,
  Meta Commerce, Heurece a Zboží a přečíst jejich diagnostiku.
- Ověřte, že GTM se **nenačítá** na adrese `….vercel.app` (proměnná `GTM_ALLOWED_HOSTS` obsahuje
  jen terrys.cz a www.terrys.cz).
- Content Security Policy běží v režimu „report-only“. Po spuštění sledujte v logu Vercelu řádky
  `csp.violation` (`docs/provoz.md`). Až týden nepřijde nic nečekaného, nastavte
  `CSP_MODE=enforce` a znovu nasaďte. Nový nástroj v GTM může potřebovat přidat doménu do
  `CSP_EXTRA_SOURCES`.

---

## 9. Právní texty (Právník + Majitel)

- **Obchodní podmínky** na webu jsou z roku 2018 a odkazují na zrušené zákony. Právník je musí
  přepsat (vážení a výsledná cena, platba při převzetí, poukazy, odstoupení přes tlačítko).
- Text **odstoupení od smlouvy** ověřit proti finálnímu znění § 1830a OZ („tlačítko pro
  odstoupení“, účinnost očekávána 1. 1. 2027).
- **Zásady ochrany osobních údajů**: doplnit zpracovatele (Vercel, Neon, Resend, Sentry,
  Balíkobot/PPL, Ecomail, Heureka, Meta, Google) a doby uchování (`docs/provoz.md`, „Ochrana
  osobních údajů“).
- Texty lišty cookies a zařazení „atribuce“ pod analytické cookies.

---

## 10. Zálohy před spuštěním (Správce)

1. Neon: ověřte restore window (krok 2.3).
2. Těsně před přepnutím DNS udělejte zálohu do souboru (`pnpm db:backup`) a uložte ji šifrovaně
   mimo Neon.
3. Jednou si vyzkoušejte obnovu (`pnpm db:restore-test`, `docs/provoz.md`). Na místní kopii
   katalogu trvala obnova 1,4 s, 64 tabulek, 10 975 řádků, počty souhlasily.

---

## 11. Hlídání (Správce)

1. **Uptime monitor** na `https://www.terrys.cz/api/health`, kontrola každou minutu, poplach při
   HTTP jiném než 200. Volitelně klíčové slovo `"status":"ok"`, které při problémech hlásí
   `"degraded"` a seznam `problems`.
2. **Sentry**: upozornění e-mailem na nové chyby.
3. **Vercel**: Notifications → Deployment failed.
4. **Resend**: upozornění na odmítnuté (bounce) a stížnosti.

---

## 12. Kontrola webu před zkouškou (Správce)

- [ ] `/api/health` → `"status":"ok"`
- [ ] `pnpm migrate:check-redirects --base=https://<projekt>.vercel.app` → 0 chyb
- [ ] Zobrazení na mobilu: úvod, kategorie, produkt, košík, objednávka
- [ ] Lišta cookies: přijmout / odmítnout / nastavení. Bez souhlasu se nenačítá GTM.
- [ ] `/robots.txt` a `/sitemap.xml` ukazují adresy `https://www.terrys.cz/…`
- [ ] Administrace: nahrání velké fotky (přes 5 MB) projde. Obrázek se po novém nasazení
      neztratí (je ve Vercel Blob).

---

## 13. Zkouška nanečisto: objednávka od začátku do konce (všichni)

Na zkušební adrese, se skutečnými službami. Pro jistotu `EMAIL_OVERRIDE_TO` = vaše adresa.

1. Zákazník na mobilu: produkt → košík → PSČ → doprava → termín → objednávka → děkovací stránka.
2. E-maily: potvrzení zákazníkovi i interní kopie dorazily, texty sedí (maso / tištěný poukaz).
3. Expedice: výrobní list → řezník zváží na tabletu → obsluha potvrdí vyúčtování → e-mail
   s výslednou cenou → kurýr: zásilka + štítek + předání / rozvoz: rozvozový list + „Řidič
   vyráží“ / odběr: „Připraveno k odběru“ → Doručeno.
4. Elektronický poukaz: objednat → e-mail s PDF a QR → zaplatit převodem (malá částka) →
   „Zaplaceno“ → poukaz uplatnit v další objednávce masa.
5. Odstoupení od smlouvy přes formulář → potvrzovací e-mail.
6. GDPR: Nastavení → Osobní údaje → export podle e-mailu testovacího zákazníka.
7. Měření: GA4 DebugView / Realtime ukazuje `purchase`, Meta Test events Purchase
   (deduplikovaný), Fronta marketingu bez chyb.
8. Uklidit: zkušební objednávky stornovat. Testovací kódy a `EMAIL_OVERRIDE_TO` odebrat.

---

## 14. Přepnutí domény (Správce, v klidném dni, ne v pátek)

**Den předem:**

1. V Cloudflare snižte TTL záznamů `terrys.cz` a `www` na **5 minut** (nebo „Auto“). Poznamenejte
   si **současné hodnoty** záznamů (A/CNAME starého webu). Ty jsou plán pro návrat zpět.
2. Ve Vercelu přidejte domény `www.terrys.cz` (hlavní) a `terrys.cz` s přesměrováním na www
   (Settings → Domains → Redirect to). Vercel ukáže, jaké DNS záznamy čeká.
3. V produkčních proměnných musí být `NEXT_PUBLIC_SERVER_URL=https://www.terrys.cz`
   a `GTM_ALLOWED_HOSTS=terrys.cz,www.terrys.cz`.

**Přepnutí:**

4. V Cloudflare změňte záznamy podle Vercelu (typicky `www` CNAME na adresu od Vercelu, `terrys.cz`
   A záznam na IP od Vercelu), **Proxy status: DNS only**. MX a ostatní záznamy pošty neměnit.
5. Počkejte, až Vercel ukáže „Valid configuration“ a vydá certifikát (minuty).
6. Ihned: `/api/health`, objednávka na odběr (stornovat), přihlášení do administrace, kontrola
   přesměrování `pnpm migrate:check-redirects --base=https://www.terrys.cz --allow-live-host`.
7. Google Search Console: odeslat sitemapu, ověřit doménu.

**Návrat zpět (když je něco zásadně špatně):** v Cloudflare vraťte poznamenané hodnoty. Díky
nízkému TTL se většina návštěvníků vrátí na starý web do pár minut. Objednávky, které mezitím
přišly do nového e-shopu, zůstávají v jeho administraci. Vyřiďte je ručně. Starý web proto
**nevypínejte** aspoň 2 týdny po přepnutí.

Chyba v samotném kódu (ne v doméně) se řeší vrácením nasazení ve Vercelu (`docs/provoz.md`,
„Nasazení rozbilo web“). Na DNS se nesahá.

---

## 15. Prvních 48 hodin (Správce)

- Každé ráno a večer: `/api/health`, Expedice → panel „Dnes“, Objednávky → Fronta marketingu.
- Vercel → Logs: hledat `order.rejected` (proč zákazníci nedokončí objednávku, kód chyby),
  `order.place_failed` (chyba serveru, musí být 0), `csp.violation` (co by zablokovala CSP).
- Sentry: nové chyby.
- Resend: doručeno / odmítnuto.
- Search Console: chyby 404 a pokrytí. Merchant Center a Heureka: diagnostika feedů.
- GA4: počet `purchase` odpovídá počtu objednávek v administraci.
- Telefon a e-mail obchodu: ptají se zákazníci na něco, co web neříká jasně?
- Po 48 hodinách: TTL v Cloudflare zpět na „Auto“. HSTS lze po měsíci zpřísnit
  (`includeSubDomains`), pokud všechny subdomény terrys.cz běží na https.

---

## Otevřené otázky (sebrané z celého projektu)

### Majitel

1. Doručování: potvrdit cut-off 12:00, 1 den předem, út–pá, rozvozová oblast (jen Praha?),
   PPL všude jinde.
2. Postup při odchylce hmotnosti nad 15 % (dnes jen upozornění, neblokuje). Jak se oceňuje
   náhrada (dnes původní jednotkovou cenou).
3. Chlazená přeprava kurýrem: podmínky PPL, obal, léto.
4. Heureka „Ověřeno zákazníky“: posílat při objednávce (dnes) nebo až po doručení? Posílat
   i u objednávek jen s poukazy?
5. Elektronický poukaz se posílá před zaplacením (platí až po platbě). Vyhovuje to?
   Upomínka a automatické storno nezaplacených poukazů (Nastavení → Dárkové poukazy).
6. Report přesměrování: položky „K rozhodnutí majitele“ (`migration/redirects-report.md`).
7. Staré poukazy v oběhu zapsat jako „staré poukazy“ (README „Poukazy ze starého e-shopu“).
8. Vercel Pro, Neon Launch, Resend, Sentry: kdo platí a na koho jsou účty.
9. Dvoufázové přihlášení do administrace: přijmout doporučení (`docs/provoz.md`).
10. Valentýnská akce Wagyu Burger 1+1: jediná povolená výjimka ze zákazu slev. Až bude potřeba,
    je to samostatné zadání.

### Účetní

1. DPH dárkových poukazů (jednoúčelové poukazy, sazba u produktu poukazu; import nechal 12 %).
2. Rozpočítání DPH dopravy podle poměru zboží v sazbách.
3. Číslování faktur zůstává v účetním programu (e-shop jen přebírá číslo). Potvrdit postup.
4. Doba uchování účetních údajů objednávek (návrh 10 let, viz `docs/provoz.md`).

### Právník

1. Obchodní podmínky (z roku 2018, zrušené zákony), znění odstoupení podle § 1830a OZ.
2. Texty cookies, atribuce pod „analytické“, režim Consent Mode (basic / advanced).
3. Právní základ dotazníku Heureky (dnes odhlášení zaškrtávátkem v objednávce).
4. Doby uchování osobních údajů (návrh v `docs/provoz.md`) a zásady ochrany osobních údajů
   (zpracovatelé).
