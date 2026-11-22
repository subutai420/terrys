# Provoz e-shopu Terrys.cz – co dělat, když…

Krátká příručka pro běžný provoz. Spuštění webu popisuje [`docs/spusteni.md`](./spusteni.md).
Kde se co nastavuje: Vercel (web a proměnné), Neon (databáze), Resend (e-maily), Sentry (chyby).

## Kde hledat jako první

1. **`https://www.terrys.cz/api/health`**: rychlá kontrola stavu.
   - `"status":"ok"`: vše v pořádku.
   - `"status":"degraded"`: obchod funguje, ale v `problems` je, co opravit:
     - `order-emails-failed`: neodešly e-maily k objednávce,
     - `integration-jobs-expired`: Meta / Heureka / Ecomail to po 6 pokusech vzdaly,
     - `integration-jobs-stuck`: fronta marketingu se zasekla,
     - `email-provider-missing` / `email-from-missing`: chybí nastavení Resendu,
     - `media-storage-not-persistent`: chybí Vercel Blob,
     - `cron-secret-missing`: chybí `CRON_SECRET`.
   - HTTP 503 a `"status":"down"`: nedostupná databáze nebo nespuštěné migrace. Obchod nebere
     objednávky, jednejte hned.
2. **Administrace → panel „Dnes“** na úvodní stránce: chybné e-maily, objednávky ke kontrole.
3. **Vercel → projekt → Logs**: každá odmítnutá objednávka je řádek `order.rejected` s kódem
   (`delivery-unavailable`, `prices-changed`, `cart-changed`, `invalid-input`, `bot`…). Chyba
   serveru je `order.place_failed`. Logy neobsahují jména ani e-maily zákazníků.
4. **Sentry** (pokud je nastavené): chyba s počtem výskytů a místem v kódu.

## E-maily neodcházejí

Příznaky: v objednávce „Chyba“ u e-mailu, panel „Dnes“, health `order-emails-failed`.

1. Resend → **Emails**: je tam e-mail se stavem `bounced` / `failed`? Bounce = špatná adresa
   zákazníka. Zavolejte mu.
2. Resend → **Domains**: je doména `terrys.cz` stále „Verified“? Nesmazal někdo DNS záznamy
   v Cloudflare?
3. Vercel → proměnné: `RESEND_API_KEY` a `EMAIL_FROM_ADDRESS` jsou nastavené a doména adresy
   odesílatele je ověřená. Po změně proměnné je potřeba **Redeploy**.
4. Když je chyba opravená: v administraci na stránce **Vyřízení objednávky** tlačítko „Poslat
   znovu“ u daného e-mailu (výsledná cena, odesláno, připraveno, zrušeno). Úvodní potvrzení objednávky
   tlačítkem znovu poslat nejde: zákazníkovi napište ručně, nebo mu po vážení přijde e-mail
   s výslednou cenou.
5. Vyzkoušení odesílání: `pnpm ops:test-emails -- --to=vase@adresa.cz` (se stejnými proměnnými
   jako produkce).

## Zaseknutá fronta marketingu (Meta, Heureka, Ecomail)

Administrace → Nastavení → **Fronta marketingu**.

- `Chyba (opakuje se)`: systém to sám zkusí znovu (1 min, 5 min, 30 min, 2 h, 12 h). Nic nedělejte.
- `Vypršelo`: po 6 pokusech nebo trvalá chyba (špatný klíč, událost starší 7 dní). Podívejte se
  na „Poslední chyba“. Opravte klíč v proměnných Vercelu, Redeploy, pak řádek přepněte na „Čeká“
  (jen administrátor) a počkejte na další běh cronu (každých 15 min).
- Nic se neopakuje vůbec: chybí `CRON_SECRET` nebo cron ve Vercelu (Settings → Cron Jobs; tarif
  Hobby povoluje jen denní crony, proto Pro). Ručně spustit:
  `curl -H "Authorization: Bearer <CRON_SECRET>" https://www.terrys.cz/api/integrations/retry`.

Objednávky na frontě marketingu **nikdy nezávisí**. Když Meta nefunguje, objednávky běží dál.

## Dopravce (Balíkobot / PPL) nefunguje

Příznaky: „Vytvořit zásilku“ hlásí chybu, chyba je uložená u zásilky na stránce Vyřízení.

1. Chyba s popisem pole (např. telefon, PSČ, variabilní symbol): oprava je v datech objednávky.
   Text chyby je česky.
2. Chyba spojení / 5xx / „timeout“: výpadek Balíkobotu nebo PPL. Zkontrolujte status Balíkobotu
   a zkuste to za chvíli. Mezitím lze balík odeslat ručně přes klientskou zónu Balíkobotu nebo
   PPL. Číslo zásilky a odkaz na sledování pak zapište do objednávky (pole Tracking) a změňte
   stav na Odesláno. Zákazník dostane e-mail.
3. Chyba přihlášení (401): klíč v proměnných `BALIKOBOT_API_USER` / `BALIKOBOT_API_KEY`.
4. Vlastní rozvoz a osobní odběr Balíkobot nepotřebují a fungují vždy.

## Nasazení rozbilo web (návrat k předchozí verzi)

Vercel → projekt → **Deployments** → předchozí funkční nasazení → **⋯ → Instant Rollback**
(na tarifu Pro na kterékoli dřívější produkční nasazení). Web je zpět během pár sekund.

Pozor:

- Po rollbacku Vercel **přestane automaticky nasazovat** nové verze na produkční doménu. Až
  bude oprava hotová, nasaďte ji a v Deployments ji „Promote to Production“ (nebo zrušte
  rollback).
- Rollback **nevrací databázi**. Pokud nová verze spustila migraci (změnu struktury databáze),
  stará verze s novou strukturou obvykle funguje (migrace jen přidávají sloupce). Když ne, je
  potřeba obnova databáze (níže). Proto migrace vždy nejdřív na zkušebním nasazení.
- Rollback nevrací proměnné prostředí, ty se mění zvlášť.

Nasazení, při kterém selže migrace nebo sestavení, se **vůbec nespustí**. Dál běží předchozí
verze, není co vracet.

## Obnova databáze

**Hlavní záloha je Neon** (obnova k libovolnému okamžiku v rámci „restore window“, nastavte
aspoň 7 dní).

1. Neon → projekt → **Restore** (Branches → Restore). Vyberte čas těsně před problémem.
   Doporučený postup: obnovu udělat **do nové větve** (branch), zkontrolovat data (např. připojit
   na zkušební nasazení) a teprve pak větev povýšit na hlavní / přepnout `DATABASE_URL`.
2. Pozor: obnova k času X **ztratí všechny objednávky po čase X**. Předtím si vyexportujte nové
   objednávky (seznam objednávek nebo interní kopie v e-mailech) a doplňte je ručně.

**Záložní kopie do souboru** (mimo Neon, např. před spuštěním nebo velkým importem):

```powershell
# přímá adresa databáze (bez -pooler); pg_dump verze >= verze serveru
pnpm db:backup -- --url="postgres://…"
```

Soubor `backups/<databáze>-<čas>.dump` obsahuje osobní údaje. Ukládejte ho šifrovaně
(např. firemní úložiště s omezeným přístupem) a staré kopie mažte (viz doby uchování níže).

**Obnova ze souboru** do NOVÉ databáze (nikdy přes běžící produkční):

```powershell
pg_restore --no-owner --no-acl -d "postgres://…/nova_databaze" backups/terrys-….dump
```

**Zkouška obnovy** (doporučeno jednou za čtvrtletí, trvá minutu):

```powershell
pnpm db:restore-test -- --dump=backups/terrys-….dump --source="postgres://…(databáze, odkud záloha je)"
# lokálně bez nainstalovaného PostgreSQL: přidejte --docker=terrys-postgres-1
```

Skript založí dočasnou databázi, obnoví do ní zálohu, porovná počty řádků všech tabulek
a dočasnou databázi zase smaže. Výsledek zapište (datum, počet tabulek a řádků).

## Obrázky (Vercel Blob)

Obrázky jsou ve Vercel Blob (proměnná `BLOB_READ_WRITE_TOKEN`). Zobrazují se stále přes adresu
`/api/media/file/…` webu, takže se odkazy při změně úložiště nemění.

- **Záloha obrázků:** originály jsou i ve starém webu a v místní složce `media/` z importu.
  Nové fotky nahrané v administraci jsou jen v Blobu. Jednou měsíčně je stáhněte:
  Vercel → Storage → Blob → Browse, nebo `vercel blob list` / `vercel blob get` (Vercel CLI).
  Smazaný obrázek z administrace se smaže i z Blobu, Vercel ho neuchovává.
- Velké fotky (přes 4,5 MB) nahrává administrace přímo z prohlížeče do Blobu. Funguje to i pro
  20MB fotky z mobilu.

## Přihlášení do administrace

- 5 špatných hesel = účet zamčený na 15 minut. Odemknout může administrátor (Uživatelé →
  uživatel → Odemknout), nebo stačí počkat.
- Z jedné IP adresy nejvýš 20 pokusů o přihlášení / zapomenuté heslo za 15 minut.
- Odhlášení nebo změna hesla ukončí přihlášení i na ostatních zařízeních (sessions).
- **Dvoufázové ověření (2FA):** Payload 3.94 ho oficiálně neumí. Existují jen komunitní
  doplňky (`payload-totp`). Návrh:
  1. Hned: jen nutné účty, každý s vlastním silným heslem ze správce hesel. Odcházejícím
     zaměstnancům účet smazat týž den.
  2. Po spuštění (samostatný úkol pro vývojáře): přidat `payload-totp` pro role Administrátor
     a Obsluha. Doplněk je udržovaný (verze 3.0.7, říjen 2026), ale není oficiální: před
     nasazením projít jeho kód a vyzkoušet na zkušebním nasazení.
  3. Alternativa **Cloudflare Access** (přihlášení e-mailem s jednorázovým kódem před
     `/admin`, zdarma do 50 uživatelů) vyžaduje zapnutou proxy Cloudflaru („oranžový mráček“).
     To jde proti doporučení Vercelu (DNS only) a omezovače pokusů by pak viděly IP adresu
     Cloudflaru místo zákazníka. Navíc by bylo nutné kontrolovat token Cloudflaru v aplikaci,
     jinak jde ochranu obejít přes adresu `….vercel.app`. Pro tento e-shop proto
     nedoporučujeme.

## Content Security Policy (CSP)

Web posílá prohlížečům seznam povolených zdrojů skriptů. Výchozí režim `report-only` nic
neblokuje, jen hlásí. Hlášení jsou ve Vercel Logs jako `csp.violation` (směrnice, zablokovaná
adresa, stránka).

- Hlášení z domény nového marketingového nástroje (nový tag v GTM) → doménu přidejte do
  `CSP_EXTRA_SOURCES` (`https://domena.cz`, víc oddělených mezerou) a Redeploy.
- Až týden nechodí nic nečekaného: `CSP_MODE=enforce` + Redeploy. Kdyby po zapnutí něco
  přestalo fungovat: `CSP_MODE=report-only` + Redeploy (nebo Instant Rollback).

## Omezení počtu pokusů (rate limit)

Pokladna, košík, odstoupení, kontrola adresy, termíny doručení, PDF poukazu, health a přihlášení
mají limity pokusů na IP adresu. Počítadla jsou v paměti každé běžící instance serveru. Na
Vercelu jich běží několik, takže skutečný limit je násobek nastaveného. Proti robotům to stačí
spolu s pastí na roboty, časovým tokenem a Turnstile. Přesné sdílené počítadlo (např. Upstash
Redis) se vyplatí, jen kdyby logy ukazovaly zneužívání (hodně `rate-limited`, spam objednávky).

## Ochrana osobních údajů (GDPR)

### Žádost zákazníka

Administrace → **Ochrana údajů → Osobní údaje (GDPR)** (jen administrátor):

- **Export**: zadejte e-mail → stáhne se JSON se všemi objednávkami, odstoupeními, poukazy
  a záznamy o přihlášení k newsletteru. Data v Ecomailu, GA4, Metě a Resendu se vyžadují
  zvlášť v daném nástroji (export to připomíná).
- **Anonymizace na žádost**: e-mail → „Zkontrolovat (nic nemění)“ → seznam → zaškrtnout
  „Rozumím“ → „Anonymizovat“. Nahradí jméno, e-mail, telefon, adresu, poznámky, věnování na
  poukazu, údaje o původu návštěvy a adresáty v historii e-mailů. **Zůstanou** položky, částky,
  DPH, číslo faktury, firma s IČO/DIČ, poukazy (částky) a historie stavů, kvůli účetnictví.
  Nevyřízené objednávky se nezmění (nejdřív je dokončete nebo zrušte). Každá anonymizace se
  zapíše do Historie změn objednávek.
- Žádost o výmaz neruší povinnost uchovat účetní doklady. Zákazníkovi odpovězte, že účetní
  údaje uchováváme po zákonnou dobu.

### Návrh dob uchování (**potvrdí právník a účetní**)

| Údaje                                                               | Návrh                                         | Proč / poznámka                                                                               |
| ------------------------------------------------------------------- | --------------------------------------------- | --------------------------------------------------------------------------------------------- |
| Účetní údaje objednávky (položky, ceny, DPH, číslo faktury, platba) | 10 let od konce roku                          | Zákon o DPH (§ 35) 10 let, zákon o účetnictví (§ 31) 5 let: delší z obou. Účetní potvrdí.     |
| Osobní údaje na objednávce (jméno, kontakt, adresa, poznámky)       | 3 roky od vyřízení, pak anonymizace           | Promlčecí lhůta nároků ze smlouvy (3 roky, OZ). V administraci „Starší objednávky“ 36 měsíců. |
| Odstoupení od smlouvy                                               | 3 roky od podání                              | Doklad pro případný spor.                                                                     |
| Fronta marketingu (obsah volání Meta / Heureka / Ecomail)           | 90 dní po odeslání (zatím ručně, anonymizací) | Obsah je potřeba jen na opakování. Po odeslání Meta CAPI se IP a prohlížeč mažou hned.        |
| Souhlas s newsletterem (text, čas)                                  | Po dobu odběru + 3 roky                       | Důkaz souhlasu. Vlastní evidence je v Ecomailu.                                               |
| Atribuce (utm, gclid, fbclid) v prohlížeči                          | 90 dní (localStorage), jen se souhlasem       | Na objednávce se maže s ostatními osobními údaji.                                             |
| Složka `.emails` (jen místní počítač / zkušební nasazení)           | 30 dní                                        | Na produkci se e-maily neukládají, odcházejí přes Resend (jeho logy podle nastavení Resendu). |
| Zálohy v souborech (`pnpm db:backup`)                               | 90 dní                                        | Obsahují osobní údaje. Uchovávat šifrovaně.                                                   |
| Logy Vercelu                                                        | podle tarifu Vercelu                          | Neobsahují osobní údaje zákazníků (strukturované logy je vynechávají).                        |

Anonymizace po uplynutí doby se v této verzi **nespouští automaticky**. Administrátor ji pouští
ručně jednou za čtvrtletí: „Starší objednávky (doba uchování)“ → počet měsíců → Zkontrolovat →
Anonymizovat. Automatizace (cron) je možná, až právník doby potvrdí.
