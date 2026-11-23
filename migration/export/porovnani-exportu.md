# Porovnání exportu produktů ze starého e-shopu s novým e-shopem

Porovnávaný soubor `Produkty.xlsx` je export z administrace starého e-shopu: 431 produktů a 42 sloupců.
Nový e-shop je katalog, který se 22. 11. 2026 importoval stažením veřejného webu (databáze
`terrys_migration`, 257 produktů). Porovnání proběhlo 23. 11. 2026. Skript a výstupy jsou ve složce
`migration/export/`. Do databáze ani do aplikace se nic nezapisovalo.

## Shrnutí – co je důležité

1. **Všech 257 produktů nového e-shopu se v exportu našlo** podle starého ID. Je to „Short Id“
   v exportu a číslo na konci staré adresy `…-detail-<id>`. U všech 257 produktů sedí i název.
   Opačným směrem: žádný produkt nového e-shopu v exportu nechybí.
2. **Ve stažení chybí 174 produktů z exportu. Všechny jsou ve starém e-shopu neaktivní**
   („Active = Unchecked“). Ze 256 aktivních produktů se importovalo všech 256. Nic, co se na starém
   webu dnes prodává, tedy nechybí.
3. **Ceny sedí na 100 %.** U 256 produktů se cena v exportu („Selling price“) shoduje s cenou
   v novém e-shopu. Jednotka („Cena za“) sedí u 254 produktů. Výjimkou je jen skrytý koncept
   „VALENTÝN promo Wagyu burger“, který v novém e-shopu cenu nemá (viz níže). Dovoz cen z exportu
   proto není potřeba.
4. **Export je o pár hodin novější než stažení webu.** Tři produkty se v exportu změnily večer
   22. 11. po stažení webu: Hovězí Pastrami („ve výrobě“) a dva Wagyu Tenderloin AUS („Na cestě do
   ČR“). Jen u nich se liší dostupnost (není-li počítáno „Na dotaz“, viz bod 3 níže).
5. **15 aktivních produktů je v novém e-shopu jen koncept, protože nemají fotku.** Export to
   potvrzuje: i ve starém e-shopu mají 0 obrázků. Bez fotek je zveřejnit nejde.
6. **Export obsahuje údaje, pro které nový e-shop nemá pole:** alergeny, „bezlepkový“, zrání,
   velikost porce (porcování), štítky (#Novinka#), ruční pořadí, počet zobrazení a odkaz „Složení“.
   **Alergeny jsou vyplněné jen u 10 produktů a jsou neúplné.** Například sýry (Emmentál, Gouda,
   Niva, Cheddar) nemají mléko, a přitom jsou označené jako bezlepkové. Pro správné označení
   potravin je tedy nutné alergeny doplnit ručně, z exportu je převzít nejde.
7. **Slevy:** 4 řádky mají nenulovou slevu a jinou „původní cenu“. Všechny jsou neaktivní promo
   akce. Sloupce se slevou se do nového e-shopu **nesmí** převádět (obchodní pravidlo 1).
8. **Dárkové poukazy sedí:** 4 řádky označené jako dárkový poukaz jsou přesně ty 4 poukazy
   v novém e-shopu (500 / 1 000 / 2 000 / 5 000 Kč).

## 1. Párování exportu s novým e-shopem

**Jak se páruje:** „Short Id“ z exportu se páruje s číslem na konci staré adresy produktu
(`/produkty/<název>-detail-<id>`). Stejné číslo má nový e-shop i v poli `sku`. Pravidlo jsem
ověřil: u všech 257 spárovaných produktů je po sjednocení mezer stejný i název. Záložní párování
podle názvu se nepoužilo ani jednou.

| | Počet |
| --- | --- |
| Řádků v exportu | 431 (aktivní 256, neaktivní 175) |
| Produktů v novém e-shopu | 257 |
| Spárováno | **257** (256 aktivních + 1 neaktivní) |
| V exportu, ale ne v novém e-shopu | **174**, všechny neaktivní |
| V novém e-shopu, ale ne v exportu | **0** |

**Neimportované produkty (174, všechny neaktivní) podle dostupnosti ve starém e-shopu:**
Skladem 110 · Na dotaz 40 · vyprodáno 14 · Na objednávku 4 · dle aktuální zásoby 3 ·
Nedostupné 2 · prázdné 1.
U neaktivních produktů tedy „Skladem“ nic neznamená, produkt se na webu nezobrazuje.

**Podle kategorie (nejčastější):** Bio hovězí 21 · Vepřové 20 · Víno 17 · Koloniál 13 · Uzeniny 11 ·
Farmářské hovězí 9 · Krůtí maso 9 · Marinované maso 7 · Hovězí z českého chovu 7 · Mufloní maso 7 ·
Telecí 7 · testovací kategorie 6 · ostatní menší kategorie.

**Kdy byly naposledy upravené:** 2022: 33 · 2023: 119 · 2024: 13 · 2025: 3 · 2026: 6. Většina je
dávno vypnutá. Nedávno upravené jsou sezónní zvěřina (Srnčí hřbet, Srnčí krk, Srnčí svíčková,
Kančí sádlo – březen 2026), Jehněčí kýta s kostí, Wagyu rib cap AUS, Argentinský Brisket a Bulka
malá. Celý seznam je v `chybi-v-novem-eshopu.csv`, seřazený podle počtu zobrazení na starém webu.

**Jeden neaktivní produkt se importoval:** „VALENTÝN promo Wagyu burger POUZE 9.2. – 13.2.2026“
(ID 28803). V novém e-shopu je jako skrytý koncept bez ceny. V exportu má prodejní cenu 135 Kč,
slevu 50 % a původní cenu 270 Kč. Takhle starý e-shop řešil valentýnskou akci Wagyu Burger 1+1,
jedinou povolenou výjimku z pravidla „žádné slevy“. Ať zůstane skrytý. Až na akci dojde, postaví se
podle zadání příslušné etapy.

### Velikosti (varianty)

**Export varianty vůbec neobsahuje.** Každý produkt má právě jeden řádek: 431 různých Short Id,
žádný produkt se neopakuje ve více velikostech. Sloupec „Weight“ je u 430 řádků 0.

Nový e-shop má 739 variant u 209 produktů. Všechny pocházejí ze stažených stránek starého webu,
kde je každá velikost samostatná položka s vlastní cenou.

Související sloupce v exportu:

| Sloupec | Co to je | Vztah k variantám v novém e-shopu |
| --- | --- | --- |
| Velikost kusu (kg) | hmotnost celého kusu | U 152 produktů lze porovnat s variantou „celý kus / 1 ks“: sedí 142, liší se 10 (např. Farmářská hovězí svíčková: kus 1,8 kg, varianta 1 500 g). Při importu se už použila jako záloha, když štítek varianty hmotnost neobsahoval. |
| Velikost porce | možnost porcování („po 250g“, „Krájené“, „Nelze porcovat“) | Nejde o variantu, ale o službu (rozporcovat kus). Nový e-shop pro ni pole nemá. Nějakou možnost porcování má 119 řádků exportu (včetně neaktivních). |
| Typ rozdělení | část jatečného těla (pupek, svíčková, vysoký roštěnec…) | Variantu neurčuje. U 113 ze 136 vyplněných se shoduje s „Druh“. Pravděpodobně slouží k vyznačení na obrázku „mapy masa“ (ověřeno to není). |
| Weight | hmotnost | Nepoužívá se (430× 0). |

**Závěr:** Varianty se z exportu doplnit nedají. U chybějících produktů by šlo nanejvýš vytvořit
jednu variantu „celý kus“ podle „Velikosti kusu“.

## 2. Porovnání polí u 257 spárovaných produktů

Úplný seznam rozdílů je v `rozdily.csv` (122 řádků). „Shodné“ znamená shodu po sjednocení
diakritiky a velkých a malých písmen. Export totiž u číselníků uvádí interní klíče bez diakritiky,
například „Ceska republika“ nebo „svickova“, kdežto web zobrazuje popisky „Česká republika“ nebo
„Svíčková“.

| Pole | Shodné | Rozdíl | Poznámka |
| --- | --- | --- | --- |
| Název | 219 přesně + 38 liší jen mezerami | 0 | Mezery na začátku a konci názvů v exportu nový e-shop už odstranil. |
| Cena („Selling price“ × `price`) | **256** | 0 | Valentýnský burger nemá cenu (skrytý koncept). |
| Jednotka („Cena za“ × `priceUnit`) | 254 | 1 | 2× prázdné v exportu (Termotaška malá a XL, v e-shopu správně „kus“). Rozdíl je jen u valentýnského burgeru (export „1_kus“, e-shop „kg“, nemá cenu). Převod: 1_kg → kg, 100_g → 100 g, 1_kus a 1_baleni → kus. |
| Aktivní × viditelnost | 241 aktivních je veřejných | 15 | 15 aktivních je konceptem, všechny kvůli chybějící fotce (export: 0 obrázků). 1 neaktivní = skrytý koncept (Valentýn). |
| Dostupnost | 242 | 14 | 11× „Na dotaz“ → „vyprodáno“ (zpráva importu uvádí 11× text „Není skladem“ na webu, takže web „Na dotaz“ zřejmě zobrazoval takto) · 1× „ve výrobě“ → skladem · 2× „Na cestě do ČR“ → skladem. Rozdíly kromě „Na dotaz“ jsou změny z večera 22. 11., platí export. |
| Kategorie | 254 (kategorie z exportu je mezi kategoriemi produktu) | 3 | Koriandr, Máta a Rozmarýn řezaný: v exportu „Koření a bylinky“, taková kategorie v novém e-shopu není, produkty jsou v „Ostatní“. |
| Původ | 242 (+ 11× obojí prázdné) | 4 | 3× jen jiný zápis klíče: „NovyZeland“ = Nový Zéland, „Franice“ = Francie (překlep v klíči, web ukazuje „Francie“). 1× Valentýn. |
| Výsek („Druh“ × `cut`) | 218 (+ 29× obojí prázdné) | 10 | 8× „Hovová jídla“ v exportu = „Hotová jídla“ na webu (překlep v klíči). Jeden z nich je ale Uruguayský Brisket, kde je hodnota zjevně špatně. 1× „plecloupana“ = Plec loupaná. 1× Valentýn. |
| Druh masa („Kategorie masa“ × `meatType`) | 124 + 44 slučitelných (hovězí → Wagyu/Telecí) + 19× obojí prázdné | 70 | Viz níže. |
| Vhodné pro (`usages`) | 207 (+ 49× obojí prázdné) | 1 | Valentýn. |
| Trvanlivost (dny) | 239 (+ 17× obojí prázdné) | 1 | Valentýn. |
| Chlazené / mražené („Typ“) | 243 (+ 13× obojí prázdné) | 1 | Valentýn. Údaj je dnes uložený v názvu položky číselníku Trvanlivost. |
| Skladování (teplota) | 232 (+ 24× obojí prázdné) | 1 | Valentýn. Také uloženo v názvu položky Trvanlivost. |
| Počet obrázků | 256 | 1 | Valentýn. |

**Druh masa:** Starý e-shop má pět hodnot (hovezi, veprove, drubezi, zverina, ostatni). Nový
e-shop odvodil druh masa z názvu produktu a kategorie a jeho seznam je jemnější (Hovězí, Wagyu,
Telecí, Jehněčí, Vepřové, Drůbež, Zvěřina). Rozdíly vznikly hlavně takhle:

- „ostatni“ v exportu znamená u 28 produktů uzeniny, sýry a ryby (nový e-shop prázdné) a u 29
  produktů něco jiného: 27× skutečné maso (hovězí, telecí, vepřové a jelení burgery, Wagyu,
  jehněčí), kde je údaj v novém e-shopu přesnější, a **2× bulky se sezamem, které nový e-shop
  chybně vede jako Hovězí** (slovo „burger“ nebo kategorie). Ty je potřeba opravit v administraci.
- Export má hovězí i u omáček, koření a bulek (BBQ omáčka, Demi Glace, sůl…). Nový e-shop u nich
  druh masa nemá, což je správně.
- Chyba v exportu: Australský hovězí Striploin (ID 949) je v exportu „drubezi“, v novém e-shopu
  správně Hovězí.

**Závěr:** Druh masa z exportu nepřebírat. Údaj v novém e-shopu je lepší. Majitel by měl jen
rozhodnout, jaký druh mají mít uzeniny a sýry (ve filtru se dnes nezobrazí).

**Které ceny jsou správné:** Rozdíl v cenách není ani jeden, takže tato otázka odpadá.
Nejnovější úprava v exportu je z 22. 11. 2026 večer, kdežto stahování webu začalo 22. 11. 2026
v 18:25. Pokud se ceny před spuštěním změní, rozhoduje novější zdroj. Export je k tomu vhodný,
protože u každého řádku má datum „Modified“.

## 3. Údaje z exportu, pro které nový e-shop nemá pole

| Sloupec | Vyplněno (z toho aktivní) | Hodnoty | Doporučení |
| --- | --- | --- | --- |
| **Alergeny** | 10 (6) | Čísla alergenů podle EU, např. `#1# #7# #11#` (lepek, mléko, sezam). Vyplněné u bulek, Debrecínských párků, Pastrami, Loveckého salámu, Tresky a 4 neaktivních uzenin. | **Přidat pole** do `products`: výběr více hodnot ze 14 alergenů EU s českými názvy. Zobrazit na detailu produktu (blok „Složení a alergeny“), v potvrzovacím e-mailu a ve strukturovaných datech. **Z exportu převzít jen jako výchozí stav. Data jsou neúplná** (sýry nemají mléko) a musí je doplnit a schválit majitel. |
| **Typ** (chlazené / mražené) | 352 (243) | Chlazene 337, Mražené 15 | Dnes je údaj schovaný v názvu položky číselníku Trvanlivost (25 kombinací typu „Chlazené, trvanlivost 14 dnů, 0 - 4 °C“). **Přidat samostatné pole** `storageType` (výběr chlazené / mražené). Hodí se do filtru, na detail a do feedů (dodání mraženého zboží). Převést z exportu: u spárovaných produktů sedí 243krát, jedinou výjimkou je valentýnský koncept. |
| **Skladování** (teplota) | 341 (232) | „0 - 4 °C“ 290, „0-4°C“ 21, „do 8°C“ 7, „-18°C a nižší“ 7, „- 18 °C“ 4… (13 zápisů, ve skutečnosti asi 6 hodnot) | Spolu s typem a trvanlivostí **rozdělit číselník Trvanlivost** na tři čistá pole: dny (číslo), typ (výběr), teplota (výběr nebo krátký text). Zápisy sjednotit. Jde o údaj pro označení potravin, na detailu by měl být vidět vždy. |
| **Bezlepkový** | 304 (206) | Checked / Unchecked | Spolehlivost je sporná: zaškrtnuté mají i sýry bez alergenů a neaktivní „v.1 Vepřová krkovice s kostí“ má zároveň alergen 1 (lepek). Označení „bez lepku“ je navíc regulované tvrzení. **Zatím nepřebírat**, nejdřív se zeptat majitele. Případně jako zaškrtávací pole jen pro interní potřebu nebo filtr. |
| **Zrání masa** | 135 (121) | jediná hodnota „Vyzrale“, jen u hovězího a Wagyu | Malý přínos. Buď zaškrtávací pole „Vyzrálé maso“ pro odznak nebo filtr, nebo nepřebírat. Nechat na majiteli. |
| **Velikost porce** (porcování) | 428 (253) | „Nelze porcovat“ 309, „po 250g“ 55, „Krájené“ 13, „po 200g“ 13, „po 350g“ 11, „po 450g“ 10… | Služba „rozporcovat“. Nový e-shop ji nemá (stejně tak uvádí zpráva importu v etapě 8). **Rozhodnutí majitele.** Pokud ano: pole `portioningOptions` (výběr více hodnot) na produktu, volba v košíku, přenos do řádku objednávky a na výrobní list. To je změna objednávkového procesu, ne jen importu. |
| **Tags** (štítky) | 17 (7) | Novinka 15, Vyhodne 3, Doporucujeme 1, Sezonni 1, Nejprodavanejsi 1 | Aktivní mají jen „#Novinka#“ (7× Wagyu). Pokud majitel chce odznaky, přidat výběr více hodnot `badges` (Novinka, Doporučujeme, Sezónní). **„Výhodné“ nepřebírat**, působí jako sleva (pravidlo 1). |
| **Cat. number** (katalogové číslo) | 0 | – | Prázdné, ignorovat. Kód produktu v novém e-shopu je staré ID (`sku`). Totéž platí pro „Ext. Id“. |
| **Index pozice** (ruční pořadí) | 308 (219) | 40–100 (nejčastěji 70, 90, 80) | Pořadí ve výpisu. Z dat nejde poznat, jestli se řadí vzestupně. **Doporučuji pole** `sortOrder` (číslo) na produktu a výchozí řazení kategorie podle něj. Převést z exportu, když majitel potvrdí význam. |
| **Web display count** (zobrazení) | 431 (256) | 0 až 233 523 (nejvíc Wagyu Tenderloin JAPONSKO A5+) | Historická oblíbenost. **Jednorázově převést** do pole jen pro čtení `legacyPopularity`, použít pro řazení „Nejoblíbenější“ a výběr na úvodní stránku. Hodnota stárne, časem ji nahradí data z prodejů. |
| **Složení – odkaz** + **Bocus – odkaz** | 17 (7) + 17 (7) | Čísla 2001–2173 a vždy `http://www.bocus.cz/` | Jen u uzenin. Číslo je zřejmě ID listu se složením u dodavatele (Bocus). To jsem neověřil. Samotné složení v exportu není. Doporučení: **zeptat se majitele.** Pokud jde o složení uzenin, patří do nového pole „Složení“ (prostý text) vedle alergenů. Odkaz nepřebírat. |
| **Podrobnější informace – titulek** | 33 (22) | např. „Večery v Buenos Aires“, „Proč si vybrat svíčkovou“, 2× „BLACK FRIDAY AKCE“ | Nadpis bloku s doplňujícím textem. Text samotný v exportu není. Nepřebírat (nadpis bez textu nemá smysl, „BLACK FRIDAY AKCE“ odporuje pravidlu 1). Jestli se text bloku dostal do popisu při stažení webu, by se muselo ověřit na stažených stránkách. |
| Skrýt informace k masu | 4 (4) | jen u 4 dárkových poukazů | Ignorovat, poukazy mají vlastní zobrazení. |
| filtr – cena / filtr – množství | 426 / 46 | A–E / A–C | Interní skupiny pro filtr starého webu. Ignorovat, nový e-shop filtruje podle skutečných hodnot. |
| Rounding type, Discount type, Sale class, Weight, Dostupnost – s řazením | – | – | Technické údaje starého systému. Ignorovat. |

### Slevy (obchodní pravidlo 1)

- Nenulové „Discount %“ mají **4 řádky**. „Price original“ se od „Selling price“ liší také
  u **4 řádků** (jsou to tytéž). „Discount type = percent“ má 24 řádků, ale 20 z nich má slevu 0 %.
- Ty 4 řádky: PROMO 50 Argentinský Rib Eye a Striploin (leden 2024), Telecí líčka (−10 %) a
  VALENTÝN promo Wagyu burger. Všechny jsou neaktivní.
- **Sloupce „Discount %“, „Price original“ a „Discount type“ se do nového e-shopu nepřevádějí.**
  Nový e-shop prodává za prodejní cenu a pole pro slevu ani původní cenu nemá a mít nebude.

## 4. Dárkové poukazy

Zaškrtnutý „Dárkový poukaz“ mají 4 řádky, všechny aktivní, v kategorii „Dárkové poukazy + set“:
Dárkový poukaz 500 Kč (ID 864), 1 000 Kč (866), 2 000 Kč (28794) a 5 000 Kč (28792).
**Odpovídají přesně čtyřem poukazům v novém e-shopu.** Mají stejné ID a stejnou cenu, poukaz je
zapnutý, hodnota se rovná ceně a jsou nabízené elektronicky i tištěně. Jiný řádek se slovem
„poukaz“ v názvu export nemá. DPH export neuvádí, takže otázka DPH poukazů pro účetní zůstává
otevřená.

## 5. Kvalita dat v exportu (pro majitele)

- **Mezery na začátku nebo konci názvu:** 92 řádků (38 aktivních), např. „ Marinovaný kančí hřbet “.
  V novém e-shopu jsou už odstraněné.
- **Stejný název dvakrát:** „Krůtí prsa“ (ID 515 neaktivní za 235 Kč, ID 1218 aktivní za 280 Kč).
- **Překlepy a nejednotné klíče v číselnících:** původ „Franice“ (Francie) a „NovyZeland“, výsek
  „Hovová jídla“ (Hotová jídla), „plecloupana“, typ rozdělení „vysokyRostenec“ vedle „vysoky
  rostenec“, kategorie „Hotová jídla “ s mezerou na konci. Skladování má 13 zápisů pro asi
  6 hodnot („0 - 4 °C“ / „0-4°C“ / „0-4 °C“, „- 18 °C“ / „- 18°C“ / „-18 °C“).
- **Chybné nebo protichůdné hodnoty:** Australský hovězí Striploin má druh masa „drubezi“.
  Uruguayský Brisket má výsek „Hovová jídla“. Brazilský Rib Eye má výsek „top blade“, ale typ
  rozdělení „vysoky rostenec“. Neaktivní Mufloní krk je „Mražené“ se skladováním 0–4 °C. Sýry jsou
  „bezlepkové“ bez alergenu mléko. Omáčky, koření a bulky mají druh masa „hovězí“.
- **Cena 0:** 40 řádků, všechny neaktivní. Aktivní produkt s cenou 0 není žádný.
- **Aktivní bez fotky:** 15 produktů (Wagyu CHILE a AUS, Treska, Niva, Kuřecí křídla, 113g Vega
  burger…). V novém e-shopu kvůli tomu čekají jako koncept.
- **Aktivní a vyprodané:** 77 produktů je aktivních s dostupností „vyprodáno“ nebo „Nedostupné“.
  V novém e-shopu se zobrazují, ale nejdou koupit. Majitel by měl zvážit, které skrýt.
- **Testovací data:** kategorie „testovací kategorie“ (6 neaktivních) a „Testovací výrobek“
  (ID 24, bez kategorie i dostupnosti).

## 6. Návrh dalšího postupu (od největšího přínosu)

Ceny, názvy, kategorie, původ, výsek, použití i trvanlivost se v novém e-shopu shodují s exportem.
**Hromadný přepis katalogu z exportu proto není potřeba.** Export má hodnotu hlavně jako zdroj
údajů, které ve stažených stránkách nebyly.

1. **Nová pole pro označení potravin (nejvyšší přínos):**
   - `products.allergens`: výběr více hodnot ze 14 alergenů EU, s volbou „neobsahuje alergeny“.
   - `products.storageType` (chlazené / mražené), `products.storageTemperature`
     a `products.shelfLifeDays` (číslo) místo dnešního číselníku Trvanlivost s 25 kombinacemi.
   - `products.ingredients` (text) pro složení uzenin a hotových jídel.

   Zobrazit na detailu produktu, typ chlazení i ve feedech. Majitel dodá úplné alergeny. Export
   je jen výchozí stav pro 6 aktivních produktů.
2. **Importér „doplnit z exportu“** (`pnpm migrate:enrich-export --file=…`, s režimem `--dry-run`):
   - Páruje podle Short Id = ID ze staré adresy (`legacyUrl`). Zapisuje jen do spárovaných
     produktů a jen nová pole: typ, teplota, dny trvanlivosti, alergeny (pokud je majitel schválí),
     ruční pořadí, historická oblíbenost, případně odznak Novinka.
   - Respektuje stávající pravidlo: přeskočí `migration.locked`, přeskočí produkty upravené
     v administraci po importu (kromě `--force`) a nezapisuje, když se data nezměnila.
     **Pozor:** zápis importéru posune `updatedAt`. Příští opakovaný import ze stažených stránek
     by pak produkt považoval za „upravený v administraci“ a přeskočil ho. Importér proto musí mít
     vlastní záznam (například `migration.exportImportedAt` + vlastní hash) a pravidlo „upraveno po
     importu“ musí počítat s oběma importy. Nebo se pustí až po finálním novém stažení webu.
   - Dostupnost přepíše jen tehdy, když je „Modified“ v exportu novější než `migration.importedAt`.
     Dnes se to týká 3 produktů.
   - **Nikdy** nepřebírá Discount %, Price original, Discount type, Rounding type ani štítek
     „Výhodné“. Ceny nepřebírá vůbec (sedí), nanejvýš je zobrazí jako kontrolu.
   - Neaktivní produkty (174) automaticky **nevytváří**. Vytvoří jen ty, které majitel vybere
     v `chybi-v-novem-eshopu.csv`, a to jako **koncept** bez variant. Export nemá varianty, popis
     ani fotky, nanejvýš „Velikost kusu“ pro variantu „celý kus“. Staré adresy těchto produktů
     export neobsahuje. Klíčem tedy musí být staré ID (`sku`), ne `legacyUrl`. Přesměrování
     starých adres podle ID už nový e-shop umí.
   - Výstupem je zpráva jako u etapy 8 (co se změnilo, co se přeskočilo a proč).
3. **Úklid v administraci (bez programování):** doplnit fotky 15 aktivním konceptům, rozhodnout
   o kategorii „Koření a bylinky“ (3 produkty jsou dnes v „Ostatní“), opravit dostupnost
   3 produktů změněných 22. 11. večer (nebo ji nechat na importéru).

### Co je potřeba zjistit od majitele předem

1. **Alergeny a složení:** Kdo dodá úplný seznam alergenů a složení ke každému produktu?
   Export je má jen u 10 produktů a neúplně. Nutnost a rozsah údajů při prodeji na dálku
   (nařízení EU 1169/2011) ať potvrdí právník nebo hygiena.
2. **„Bezlepkový“:** Platí zaškrtnutí opravdu? Chce majitel na webu tvrzení „bez lepku“?
3. **Porcování („Velikost porce“):** Má nový e-shop nabízet „rozporcovat po 250 g / krájené“?
   Je to změna košíku, objednávky i výrobního listu.
4. **Ruční pořadí („Index pozice“):** Řadí se od nejmenšího čísla? Má nový e-shop ruční pořadí
   převzít?
5. **Odznaky:** Chce majitel „Novinka“ (a „Doporučujeme“, „Sezónní“)? „Výhodné“ ne.
6. **Které neaktivní produkty vrátit** (např. sezónní zvěřina z března 2026)? Seznam je v
   `chybi-v-novem-eshopu.csv`.
7. **„Složení – odkaz“ / Bocus:** Co znamená číslo 2001–2173 a kde je samotné složení?
8. **Druh masa u uzenin, sýrů a ryb:** Nechat prázdné, nebo přidat druh „Ostatní“ či „Uzeniny“?
9. **Zrání („Vyzrálé“):** Zobrazovat jako odznak nebo filtr?
10. **Aktivní, ale vyprodané produkty (77):** Nechat na webu, nebo skrýt?

## Soubory

| Soubor | Obsah |
| --- | --- |
| `rozdily.csv` | rozdíly u spárovaných produktů: Short Id, název, pole, hodnota v exportu, hodnota v novém e-shopu, poznámka (122 řádků, z toho 70 druh masa) |
| `chybi-v-novem-eshopu.csv` | 174 řádků exportu bez produktu v novém e-shopu (aktivní, dostupnost, kategorie, cena, jednotka, datum úpravy, zobrazení, počet obrázků) |
| `chybi-v-exportu.csv` | produkty nového e-shopu, které v exportu nejsou: **žádné** (soubor má jen záhlaví) |
| `porovnani.mjs`, `xlsx.mjs` | skript porovnání (jen čte), spuštění viz níže |

Spuštění (z kořene repozitáře; adresa databáze se bere z proměnné prostředí, heslo se nikam
nezapisuje):

```
EXPORT_COMPARE_DATABASE_URL=postgres://…/terrys_migration node migration/export/porovnani.mjs "E:\Klienti\Terrys\Produkty.xlsx"
```

Soubory CSV jsou v UTF-8 s BOM a středníky, otevřou se přímo v Excelu. Skript vypíše souhrnná
čísla (JSON) na obrazovku.
