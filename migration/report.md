# Migrace ze starého terrys.cz – report importu

Vygenerováno příkazem `pnpm migrate:import` 2026-11-22T17:28:39.500Z (databáze `terrys_migration`).
Volby: všechny typy.

Report se přepisuje při každém běhu. Inventura všech starých URL je v `migration/url-inventory.csv`.

## Souhrn

| Typ | Nalezeno | Vytvořeno | Aktualizováno | Beze změny | Přeskočeno | Chyba | Z toho koncept |
| --- | --- | --- | --- | --- | --- | --- | --- |
| Kategorie | 53 | 0 | 0 | 53 | 0 | 0 | 0 |
| Produkty | 257 | 0 | 0 | 257 | 0 | 0 | 0 |
| Články (magazín, academy, slovník) | 38 | 0 | 0 | 38 | 0 | 0 | 0 |
| Recepty | 12 | 0 | 0 | 12 | 0 | 0 | 0 |
| Stránky | 12 | 0 | 0 | 12 | 0 | 0 | 0 |

Obrázky: nahráno 0, použito znovu (stejný obsah) 0, problémů 0.

### Inventura starých URL podle typu

| Typ stránky | Počet URL |
| --- | --- |
| product | 258 |
| article | 155 |
| recipe | 107 |
| category-page | 79 |
| category | 62 |
| product-listing | 23 |
| glossary-term | 20 |
| static | 12 |
| article-listing | 9 |
| glossary-listing | 3 |
| recipe-listing | 3 |
| academy | 2 |
| academy-article | 2 |
| home | 2 |
| store | 2 |
| file | 1 |
| store-listing | 1 |
| unknown | 1 |

URL s přiřazeným cílem v novém webu: 691 z 742.

## Chyby validace a importu

_žádné_

## Přeskočené položky (upravené v administraci nebo zamčené)

_žádné_

## Produkty bez ceny nebo bez fotky (uloženy jako koncept)

| Problém | Stará URL |
| --- | --- |
| bez ceny | /produkty/valentyn-promo-wagyu-burger-pouze-9-2-13-2-2026-detail-28803 |
| bez fotky | /produkty/113g-vega-burger-detail-1131 |
| bez fotky | /produkty/australsky-hovezi-skirt-steak-detail-29390 |
| bez fotky | /produkty/kureci-kridla-detail-1010 |
| bez fotky | /produkty/namibijske-hovezi-hrudi-brisket-point-end-detail-961 |
| bez fotky | /produkty/niva-detail-1185 |
| bez fotky | /produkty/treska-detail-1070 |
| bez fotky | /produkty/valentyn-promo-wagyu-burger-pouze-9-2-13-2-2026-detail-28803 |
| bez fotky | /produkty/vysocina-premium-detail-199 |
| bez fotky | /produkty/wagyu-chuck-roll-aus-bms-8-9-detail-28773 |
| bez fotky | /produkty/wagyu-flank-chile-bms-5-7-detail-1291 |
| bez fotky | /produkty/wagyu-picanha-aus-bms-8-detail-28771 |
| bez fotky | /produkty/wagyu-rib-eye-chile-bms-5-7-detail-1294 |
| bez fotky | /produkty/wagyu-striploin-chile-bms-5-7-detail-1295 |
| bez fotky | /produkty/wagyu-tenderloin-chile-bms-5-7-detail-1296 |
| bez fotky | /produkty/wagyu-tenderloin-japonsko-a3-detail-1234 |
| bez fotky | /produkty/wagyu-top-blade-aus-bms-8-detail-28776 |

## Nefunkční obrázky

_žádné_

## Stránky, u kterých nešlo určit typ

_žádné_

## Soubory pod adresou stránky (neimportováno, přenést ručně)

| URL | Typ obsahu |
| --- | --- |
| /jidelni-listek | application/pdf |

## Kontrola pravidel značky (k posouzení majitelem)

Texty starého webu, které zmiňují slevy, slevové kódy, „doprava zdarma“, přeškrtnuté ceny, starý název SelaVita nebo fotobanky. Import je přenesl beze změny – upravte je v administraci. Původní ani akční cena se nikam neimportuje (taková pole v novém webu nejsou).

| Pravidlo | Stará URL | Název | Úryvek |
| --- | --- | --- | --- |
| starý název SelaVita | /produkty/jehneci-kyta-bez-kosti-detail-542 | Jehněčí kýta BEZ kosti | …noční hodování Jak by jehněčí kýtu upravil garant SelaVita Academy šéfkuchař Mirek Grusz? Vybral jednoduchý… |
| slevy / slevové kódy / akce | /produkty/valentyn-promo-wagyu-burger-pouze-9-2-13-2-2026-detail-28803 | VALENTÝN promo Wagyu burger POUZE 9.2. - 13.2.2026 | …i MEGA šťavnatý burger :-) VALENTÝNSKÁ PROMO AKCE -50% PLATNÁ POUZE PRO VYZVEDNUTÍ/ DORUČENÍ OD 9/2/2026… |
| starý název SelaVita | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | SelaVita se mění na TERRYS - první specializovanou prodejnu steakových mas | SelaVita se mění na TERRYS - první specializovanou prodejn… |
| starý název SelaVita | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | SelaVita se mění na TERRYS - první specializovanou prodejnu steakových mas | …í steakové abstinence a vystoupení ze společnosti SelaVita, jsem přijmul výzvu ex-majitelů Kamila a Tomáše a… |
| starý název SelaVita | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | SelaVita se mění na TERRYS - první specializovanou prodejnu steakových mas | …Tomáše a převzal od nich kompletní provoz e-shopu SelaVita a výdejního místa řeznictví na Italské ulici 17 v… |
| starý název SelaVita | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | SelaVita se mění na TERRYS - první specializovanou prodejnu steakových mas | …teru. Všechny Vás s úctou zdravím, Lukáš Komjáti. SelaVita se mění na TERRYS - první specializovanou prodejn… |
| starý název SelaVita | /videa | Videa | …s rozmarýnem Video na YouTube Seznamte se: garant SelaVita Academy Mirek Grusz Video na YouTube Sůl nad zlat… |

### Písma starého webu (nic se nekopíruje)

| Soubor | Posouzení |
| --- | --- |
| /templates/widgets/font-awesome/fonts/fontawesome-webfont.eot | není z Google Fonts – nepřebírat |
| /templates/widgets/font-awesome/fonts/fontawesome-webfont.ttf | není z Google Fonts – nepřebírat |
| /templates/widgets/font-awesome/fonts/fontawesome-webfont.woff | není z Google Fonts – nepřebírat |
| /templates/widgets/font-awesome/fonts/fontawesome-webfont.woff2 | není z Google Fonts – nepřebírat |
| externí CSS (nestahováno): https://cdnjs.cloudflare.com/ajax/libs/paymentfont/1.2.5/css/paymentfont.min.css | není z Google Fonts – nepřebírat |
| https://fonts.gstatic.com/s/quicksand/v6/32nyIRHyCu6iqEka_hbKsj0LW-43aMEzIO6XUTLjad8.woff2 | Google Fonts – v pořádku |
| https://fonts.gstatic.com/s/quicksand/v6/32nyIRHyCu6iqEka_hbKsugdm0LZdjqr5-oayXSOefg.woff2 | Google Fonts – v pořádku |
| https://fonts.gstatic.com/s/quicksand/v6/FRGja7LlrG1Mypm0hCq0Dj0LW-43aMEzIO6XUTLjad8.woff2 | Google Fonts – v pořádku |
| https://fonts.gstatic.com/s/quicksand/v6/FRGja7LlrG1Mypm0hCq0Dugdm0LZdjqr5-oayXSOefg.woff2 | Google Fonts – v pořádku |
| https://fonts.gstatic.com/s/quicksand/v6/qhfoJiLu10kFjChCCTvGlD0LW-43aMEzIO6XUTLjad8.woff2 | Google Fonts – v pořádku |
| https://fonts.gstatic.com/s/quicksand/v6/qhfoJiLu10kFjChCCTvGlOgdm0LZdjqr5-oayXSOefg.woff2 | Google Fonts – v pořádku |
| https://fonts.gstatic.com/s/quicksand/v6/s2PXW4WrV3VLrOUpHiqsfRJtnKITppOI_IvcXXDNrsc.woff2 | Google Fonts – v pořádku |
| https://fonts.gstatic.com/s/quicksand/v6/sKd0EMYPAh5PYCRKSryvW1tXRa8TVwTICgirnJhmVJw.woff2 | Google Fonts – v pořádku |

## Upozornění k jednotlivým položkám

| Typ | Stará URL | Výsledek | Upozornění |
| --- | --- | --- | --- |
| products | /produkty/113g-vega-burger-detail-1131 | beze změny | cena za kus, varianty se liší cenou (2ks 148 Kč, 3ks 222 Kč) – varianty nepřeneseny • bez obrázku |
| products | /produkty/120g-jeleni-burger-sul-detail-1090 | beze změny | cena za kus, varianty se liší cenou (2ks 72 Kč, 3ks 108 Kč) – varianty nepřeneseny |
| products | /produkty/200g-burger-ze-stareneho-hov-masa-s-koriandrem-detail-550 | beze změny | cena za kus, varianty se liší cenou (1ks 120 Kč, 2ks 240 Kč, 3ks 360 Kč, 4ks 480 Kč, 5ks 600 Kč, 6ks 720 Kč) – varianty nepřeneseny |
| products | /produkty/australska-hovezi-zebra-short-ribs-detail-28801 | beze změny | varianta „celé balení (2ks)“: velikost kusu 1800 g neodpovídá ceně (3600 g), použita hmotnost podle ceny |
| products | /produkty/australsky-hovezi-brisket-hrudi-detail-1314 | beze změny | varianta „1/2 kusu“: velikost kusu 3250 g neodpovídá ceně (3000 g), použita hmotnost podle ceny |
| products | /produkty/australsky-hovezi-skirt-steak-detail-29390 | beze změny | varianta „1ks“: velikost kusu 1100 g neodpovídá ceně (1000 g), použita hmotnost podle ceny • bez obrázku |
| products | /produkty/brdska-jemna-klobasa-detail-1224 | beze změny | varianta „1ks“: velikost kusu 200 g neodpovídá ceně (180 g), použita hmotnost podle ceny • varianta „2ks“: velikost kusu 400 g neodpovídá ceně (360 g), použita hmotnost podle ceny • varianta „3ks“: velikost kusu 600 g neodpovídá ceně (540 g), použita hmotnost podle ceny • varianta „4ks“: velikost kusu 800 g neodpovídá ceně (720 g), použita hmotnost podle ceny • varianta „5ks“: velikost kusu 1000 g neodpovídá ceně (900 g), použita hmotnost podle ceny |
| products | /produkty/brdska-paliva-klobasa-detail-1226 | beze změny | varianta „1ks“: velikost kusu 200 g neodpovídá ceně (180 g), použita hmotnost podle ceny • varianta „2ks“: velikost kusu 400 g neodpovídá ceně (360 g), použita hmotnost podle ceny • varianta „3ks“: velikost kusu 600 g neodpovídá ceně (540 g), použita hmotnost podle ceny • varianta „4ks“: velikost kusu 800 g neodpovídá ceně (720 g), použita hmotnost podle ceny • varianta „5ks“: velikost kusu 1000 g neodpovídá ceně (900 g), použita hmotnost podle ceny |
| products | /produkty/bulka-cerstva-se-sezamem-90g-cca-13cm-detail-1012 | beze změny | cena za kus, varianty se liší cenou (1ks 20 Kč, 2ks 40 Kč, 3ks 60 Kč, 5ks 100 Kč) – varianty nepřeneseny |
| products | /produkty/danci-hrbet-detail-326 | beze změny | varianta „2,5kg“ stojí 1780 Kč, podle jednotkové ceny by měla 2225 Kč |
| products | /produkty/danci-krk-detail-328 | beze změny | varianta „2,5kg“ stojí 598 Kč, podle jednotkové ceny by měla 748 Kč |
| products | /produkty/farmarska-hovezi-svickova-detail-147 | beze změny | varianta „1ks“: velikost kusu 1800 g neodpovídá ceně (1500 g), použita hmotnost podle ceny |
| products | /produkty/hovezi-burger-chilli-cokolada-detail-1082 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 150g - 10 cm průměr 78 Kč, 1 ks \| 200g - 13 cm průměr 104 Kč) – varianty nepřeneseny |
| products | /produkty/hovezi-burger-jahoda-a-mandle-detail-1210 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 150g - 10 cm průměr 78 Kč, 1 ks \| 200g - 13 cm průměr 104 Kč) – varianty nepřeneseny |
| products | /produkty/hovezi-burger-jalapenos-detail-1109 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 150g - 10 cm průměr 68 Kč, 1 ks \| 200g - 13 cm průměr 90 Kč) – varianty nepřeneseny |
| products | /produkty/hovezi-burger-rum-orechy-detail-1189 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 200g - 13 cm průměr 104 Kč, 1 ks \| 150g - 10 cm průměr 78 Kč) – varianty nepřeneseny |
| products | /produkty/hovezi-burger-sul-detail-1084 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 150g - 10 cm průměr 60 Kč, 1 ks \| 200g - 13 cm průměr 80 Kč) – varianty nepřeneseny |
| products | /produkty/hovezi-burger-svestka-skorice-detail-1105 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 150g - 10 cm průměr 78 Kč, 1 ks \| 200g - 13 cm průměr 104 Kč) – varianty nepřeneseny |
| products | /produkty/irsky-hovezi-chuck-tender-detail-956 | beze změny | varianta „1/2 kusu“: velikost kusu 650 g neodpovídá ceně (600 g), použita hmotnost podle ceny |
| products | /produkty/jeleni-plec-detail-354 | beze změny | varianta „2,5kg“ stojí 698 Kč, podle jednotkové ceny by měla 873 Kč |
| products | /produkty/jelito-detail-1222 | beze změny | varianta „1ks“: velikost kusu 200 g neodpovídá ceně (180 g), použita hmotnost podle ceny • varianta „2ks“: velikost kusu 400 g neodpovídá ceně (360 g), použita hmotnost podle ceny • varianta „3ks“: velikost kusu 600 g neodpovídá ceně (540 g), použita hmotnost podle ceny • varianta „4ks“: velikost kusu 800 g neodpovídá ceně (720 g), použita hmotnost podle ceny • varianta „5ks“: velikost kusu 1000 g neodpovídá ceně (900 g), použita hmotnost podle ceny |
| products | /produkty/jitrnice-detail-1220 | beze změny | varianta „1ks“: velikost kusu 200 g neodpovídá ceně (180 g), použita hmotnost podle ceny • varianta „2ks“: velikost kusu 400 g neodpovídá ceně (360 g), použita hmotnost podle ceny • varianta „3ks“: velikost kusu 600 g neodpovídá ceně (540 g), použita hmotnost podle ceny • varianta „4ks“: velikost kusu 800 g neodpovídá ceně (720 g), použita hmotnost podle ceny • varianta „5ks“: velikost kusu 1000 g neodpovídá ceně (900 g), použita hmotnost podle ceny |
| products | /produkty/kureci-kridla-detail-1010 | beze změny | bez obrázku |
| products | /produkty/namibijska-hovezi-svickova-4-5-detail-962 | beze změny | varianta „1/2 kusu“: velikost kusu 850 g neodpovídá ceně (800 g), použita hmotnost podle ceny |
| products | /produkty/namibijske-hovezi-hrudi-brisket-point-end-detail-961 | beze změny | bez obrázku |
| products | /produkty/niva-detail-1185 | beze změny | varianta „1ks výseč“: velikost kusu 2000 g neodpovídá ceně (250 g), použita hmotnost podle ceny • bez obrázku |
| products | /produkty/teleci-burger-sul-detail-1086 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 150g - 10 cm průměr 68 Kč, 1 ks \| 200g - 13 cm průměr 90 Kč) – varianty nepřeneseny |
| products | /produkty/teleci-mlete-maso-solene-detail-552 | beze změny | varianta „1ks“: velikost kusu 500 g neodpovídá ceně (600 g), použita hmotnost podle ceny |
| products | /produkty/treska-detail-1070 | beze změny | bez obrázku |
| products | /produkty/us-hovezi-chuck-flap-detail-1191 | beze změny | varianta „1,4“: velikost kusu 2500 g neodpovídá ceně (1400 g), použita hmotnost podle ceny |
| products | /produkty/us-hovezi-prime-rib-rib-eye-s-kratkou-kosti-detail-1310 | beze změny | varianta „celý hřbet“: velikost kusu 1000 g neodpovídá ceně (7000 g), použita hmotnost podle ceny |
| products | /produkty/us-hovezi-short-ribs-zebra-detail-1306 | beze změny | varianta „celé balení (2ks)“: velikost kusu 1800 g neodpovídá ceně (3600 g), použita hmotnost podle ceny |
| products | /produkty/us-hovezi-skirt-steak-detail-28779 | beze změny | varianta „1/2 kusu“: velikost kusu 550 g neodpovídá ceně (500 g), použita hmotnost podle ceny |
| products | /produkty/valentyn-promo-wagyu-burger-pouze-9-2-13-2-2026-detail-28803 | beze změny | detail produktu se na starém webu nezobrazuje (vypnutý produkt) – importován jako skrytý koncept • cena nenalezena • bez obrázku |
| products | /produkty/veprove-mlete-maso-solene-detail-1008 | beze změny | varianta „1ks“: velikost kusu 500 g neodpovídá ceně (600 g), použita hmotnost podle ceny |
| products | /produkty/veprovy-burger-sul-detail-1088 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 150g - 10 cm průměr 33 Kč, 1 ks \| 200g - 13 cm průměr 44 Kč) – varianty nepřeneseny |
| products | /produkty/vysocina-premium-detail-199 | beze změny | bez obrázku |
| products | /produkty/wagyu-burger-japan-detail-1187 | beze změny | cena za kus, varianty se liší cenou (1 ks \| 200g - 13 cm průměr 360 Kč, 1 ks \| 150g - 10 cm průměr 270 Kč) – varianty nepřeneseny |
| products | /produkty/wagyu-chuck-roll-aus-bms-8-9-detail-28773 | beze změny | bez obrázku |
| products | /produkty/wagyu-flank-chile-bms-5-7-detail-1291 | beze změny | varianta „1/2 kusu“: velikost kusu 550 g neodpovídá ceně (600 g), použita hmotnost podle ceny • bez obrázku |
| products | /produkty/wagyu-flap-chile-bms-5-7-detail-1127 | beze změny | varianta „Půlka kusu“: velikost kusu 1000 g neodpovídá ceně (750 g), použita hmotnost podle ceny • varianta „1ks“: velikost kusu 2000 g neodpovídá ceně (1500 g), použita hmotnost podle ceny |
| products | /produkty/wagyu-flap-urug-bms-5-7-detail-1292 | beze změny | varianta „1/2 kusu“: velikost kusu 750 g neodpovídá ceně (800 g), použita hmotnost podle ceny |
| products | /produkty/wagyu-picanha-aus-bms-8-detail-28771 | beze změny | bez obrázku |
| products | /produkty/wagyu-rib-eye-chile-bms-5-7-detail-1294 | beze změny | bez obrázku |
| products | /produkty/wagyu-striploin-chile-bms-5-7-detail-1295 | beze změny | bez obrázku |
| products | /produkty/wagyu-tenderloin-chile-bms-5-7-detail-1296 | beze změny | bez obrázku |
| products | /produkty/wagyu-tenderloin-japonsko-a3-detail-1234 | beze změny | bez obrázku |
| products | /produkty/wagyu-top-blade-aus-bms-8-detail-28776 | beze změny | bez obrázku |
| recipes | /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762 | beze změny | neznámá obtížnost „Jednuduché“ |
| recipes | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| recipes | /recepty/jehneci-kyta-s-rozmarynem-detail-870 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| recipes | /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| recipes | /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| recipes | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| recipes | /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 | beze změny | krok „Po necelé hodině temperování, již se son…“ má 2 fotky, přenesena první • krok „Oba steaky následně současně zprudka zag…“ má 3 fotky, přenesena první • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| recipes | /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| recipes | /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| recipes | /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| recipes | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | beze změny | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| recipes | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | beze změny | suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| pages | /pages/cookies/table.aspx | beze změny | stránka nemá nadpis h1 – obsah nelze spolehlivě vyříznout • stránka nemá žádný text (obsah je asi skládaný skriptem nebo z widgetů) |

## Ceny: odvozená jednotka

Starý web nemá cenu za jednotku, jen cenu každé varianty. Jak import cenu odvodil:

| Jednotka – pravidlo | Produktů |
| --- | --- |
| kg – cena a jednotka podle detailu produktu | 180 |
| piece – cena a jednotka podle detailu produktu | 44 |
| 100g – cena a jednotka podle detailu produktu | 30 |
| kg –  | 3 |

<details><summary>Produkty s cenou za kus</summary>

| Stará URL | Název | Cena |
| --- | --- | --- |
| /produkty/113g-vega-burger-detail-1131 | 113g Vega burger | 74 |
| /produkty/120g-jeleni-burger-sul-detail-1090 | 120g Jelení burger sůl | 36 |
| /produkty/200g-burger-ze-stareneho-hov-masa-s-koriandrem-detail-550 | 200g burger ze stařeného hov. masa s koriandrem | 120 |
| /produkty/americka-steakova-smes-koreni-120g-detail-1277 | Americká steaková směs koření 120g | 149 |
| /produkty/bbq-omacka-honey-chipotle-detail-1273 | BBQ omáčka Honey Chipotle | 119 |
| /produkty/bbq-omacka-original-detail-1271 | BBQ omáčka originál | 119 |
| /produkty/bulka-cerstva-se-sezamem-90g-cca-13cm-detail-1012 | Bulka čerstvá se sezamem 90g (cca 13cm) | 20 |
| /produkty/bulka-velka-balena-se-sezamem-4x-75g-detail-1214 | Bulka velká, balená se sezamem 4x 75g | 60 |
| /produkty/darkovy-poukaz-1-000-kc-detail-866 | Dárkový poukaz 1 000 Kč | 1000 |
| /produkty/darkovy-poukaz-2-000-kc-detail-28794 | Dárkový poukaz 2 000 Kč | 2000 |
| /produkty/darkovy-poukaz-5-000-kc-detail-28792 | Dárkový poukaz 5 000 Kč | 5000 |
| /produkty/darkovy-poukaz-500-kc-detail-864 | Dárkový poukaz 500 Kč | 500 |
| /produkty/darkovy-steakovy-set-krabicka-mala-detail-1124 | Dárkový steakový set - krabička malá | 40 |
| /produkty/darkovy-steakovy-set-krabicka-velka-detail-1232 | Dárkový steakový set - krabička velká | 40 |
| /produkty/demi-glace-160g-detail-1249 | Demi Glace 160g | 230 |
| /produkty/dort-detsky-spider-man-detail-28809 | Dort dětský SPIDER-MAN | 3900 |
| /produkty/drstkova-polevka-detail-1255 | Dršťková polévka | 159 |
| /produkty/francouzska-makronka-malinova-5ks-detail-28765 | Francouzská Makronka malinová 5ks | 150 |
| /produkty/francouzska-makronka-pistaciova-5ks-detail-28805 | Francouzská Makronka pistaciová 5ks | 150 |
| /produkty/francouzska-makronka-s-motivem-5ks-detail-28807 | Francouzská Makronka s motivem 5ks | 200 |
| /produkty/gulasova-polevka-detail-1257 | Gulášová polévka | 159 |
| /produkty/hovezi-burger-chilli-cokolada-detail-1082 | Hovězí burger chilli&čokoláda | 78 |
| /produkty/hovezi-burger-jahoda-a-mandle-detail-1210 | Hovězí burger jahoda a mandle | 78 |
| /produkty/hovezi-burger-jalapenos-detail-1109 | Hovězí burger Jalapeños | 68 |
| /produkty/hovezi-burger-rum-orechy-detail-1189 | Hovězí burger Rum&ořechy | 78 |
| /produkty/hovezi-burger-sul-detail-1084 | Hovězí burger sůl | 60 |
| /produkty/hovezi-burger-svestka-skorice-detail-1105 | Hovězí burger švestka&skořice | 78 |
| /produkty/jarni-kuratko-detail-1068 | Jarní kuřátko | 99 |
| /produkty/koreni-na-bylinkove-maslo-40g-detail-1279 | Koření na bylinkové máslo 40g | 149 |
| /produkty/koreni-na-grilovanou-zeleninu-100g-detail-1281 | Koření na grilovanou zeleninu 100g | 149 |
| /produkty/koriandr-rezany-180g-detail-589 | Koriandr řezaný 180g | 200 |
| /produkty/mata-rezana-180g-detail-591 | Máta řezaná 180g | 200 |
| /produkty/peprova-omacka-160g-detail-1251 | Pepřová omáčka 160g | 230 |
| /produkty/profesionalni-brouseni-noze-detail-1212 | Profesionální broušení nože | 180 |
| /produkty/rozmaryn-rezany-180g-detail-593 | Rozmarýn řezaný 180g | 200 |
| /produkty/sadlo-skvarene-detail-1267 | Sádlo škvařené | 119 |
| /produkty/segedinsky-gulas-detail-1263 | Segedínský guláš | 169 |
| /produkty/selsky-hovezi-gulas-detail-1261 | Selský hovězí guláš | 169 |
| /produkty/teleci-burger-sul-detail-1086 | Telecí burger sůl | 68 |
| /produkty/trhane-hovezi-maso-v-bbq-detail-1259 | Trhané hovězí maso v BBQ | 319 |
| /produkty/veprove-ve-vlastni-stave-detail-1265 | Vepřové ve vlastní šťávě | 169 |
| /produkty/veprovy-burger-sul-detail-1088 | Vepřový burger sůl | 33 |
| /produkty/vlockova-sul-cornisch-100g-detail-1275 | Vločková sůl cornisch 100g | 149 |
| /produkty/wagyu-burger-japan-detail-1187 | Wagyu burger JAPAN | 270 |

</details>

## Dostupnost na starém webu → nový stav

Mapování: Skladem / dle aktuální zásoby / Na objednávku → Skladem; Na cestě do ČR → Na cestě; Vyprodáno / Není skladem / Nedostupné → Vyprodáno. Produkty, které nejsou v žádné kategorii starého webu, dostaly stav Skryto.

| Text na starém webu | Produktů |
| --- | --- |
| Skladem | 129 |
| Vyprodáno | 76 |
| dle aktuální zásoby | 18 |
| Na cestě do ČR | 18 |
| Není skladem | 11 |
| Na objednávku | 3 |
| (prázdné) | 1 |
| Nedostupné | 1 |

### Produkty mimo kategorie (stav Skryto)

| Stará URL |
| --- |
| /produkty/valentyn-promo-wagyu-burger-pouze-9-2-13-2-2026-detail-28803 |

## Porcování („porcovat / neporcovat“)

Volba porcování na starém webu nemá v novém modelu pole (nepřidáno). Produkty s volbou:

| Možnosti | Produktů |
| --- | --- |
| po 250g / V celku | 34 |
| Krájené / V celku | 11 |
| po 350g / V celku | 10 |
| po 200g / V celku | 9 |
| po 450g / V celku | 8 |
| po 300g / V celku | 4 |
| po 400g / V celku | 4 |
| po 700g / V celku | 3 |
| po 1kg / V celku | 2 |
| po 500g / V celku | 2 |
| po 150g / V celku | 1 |
| po 350g / po 400g / po 450g / V celku | 1 |
| po 600g / V celku | 1 |

## Údaje starého webu bez pole v novém modelu

| Údaj | Produktů |
| --- | --- |
| Trvanlivost: (různé hodnoty) | 239 |
| Skladování: (různé hodnoty) | 232 |
| Velikost kusu: (různé hodnoty) | 223 |
| Štítek: Bezlepkové | 199 |
| Zrání masa: Vyzrálé | 121 |
| Štítek: Bezlepkové, Novinka | 7 |

Trvanlivost a skladování jsou přeneseny do číselníku „Trvanlivost a skladování“ (jedna položka na kombinaci). Velikost kusu je použita jako průměrná hmotnost variant „Celý kus“ / „1/2 kusu“.

### Rubriky článků a receptů (nový model rubriky nemá)

| Rubrika | Položek |
| --- | --- |
| slovník pojmů (importováno do Terrys Academy) | 20 |
| recept: Hlavní jídla | 11 |
| magazín: Představujeme řezy | 5 |
| magazín: Poznáváme zvěřinu | 3 |
| magazín: Rady a tipy | 3 |
| magazín: Život v Terrysu | 3 |
| magazín: Poznáváme plemena hovězího | 2 |
| magazín: Novinky | 1 |

## Recepty: co bylo strukturované

| Stará URL | Poznámky |
| --- | --- |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| /recepty/jehneci-kyta-s-rozmarynem-detail-870 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 | krok „Po necelé hodině temperování, již se son…“ má 2 fotky, přenesena první • krok „Oba steaky následně současně zprudka zag…“ má 3 fotky, přenesena první • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | postup není strukturovaný (číslovaný seznam), ponechán jako text receptu • suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | suroviny nejsou ve strukturovaném bloku, zůstávají v textu receptu |

## Nově založené položky číselníků

_žádné_

## Kategorie mimo menu starého webu (bez nadřazené kategorie)

| Stará URL |
| --- |
| /produkty/chuck-krk-110 |

## Nenalezené vazby (odkaz na položku, která se neimportovala)

_žádné_

## Externí odkazy v přenesených textech

| Odkaz | Výskytů |
| --- | --- |
| http://www.facebook.com/selavitamaso | 4 |
| https://wa.me/605185000 | 3 |
| mailto:terrys@terrys.cz | 3 |
| https://www.facebook.com/terryssteaky | 2 |
| mailto:lukas@terrys.cz | 2 |
| https://www.selavita.cz/academy | 1 |
| mailto:blanka@terrys.cz | 1 |
| mailto:italska@terrys.cz | 1 |
| mailto:marketing@terrys.cz | 1 |
| mailto:objednavky@terrys.cz | 1 |
| mailto:petr@terrys.cz | 1 |
| tel:+420605185000 | 1 |

## Vložená média (videa, iframe)

Editor neumí vložené přehrávače; v textu je místo nich odkaz na video.

| Zdroj | Použito na |
| --- | --- |
| https://www.youtube.com/embed/e5N-dqR9bzQ | /videa |
| https://www.youtube.com/embed/IWQITZmL8iM | /videa |
| https://www.youtube.com/embed/iyhVMi_xUe4 | /videa |
| https://www.youtube.com/embed/HPsg2auzdBU | /videa |
| https://www.youtube.com/embed/fvbFWSPPCQo | /videa |
| https://www.youtube.com/embed/IFoQZ6ISMJY | /videa |
