# Přesměrování starých adres – plán a rozhodnutí

Vygenerováno příkazem `pnpm migrate:redirects` 2026-11-22T22:42:50.131Z (databáze `terrys_migration`).
Report se přepisuje při každém běhu. Strojová podoba je v `migration/redirect-plan.csv`; podle ní
kontroluje běžící web příkaz `pnpm migrate:check-redirects`.

Pravidla jsou v kódu (`src/lib/redirects/legacy.ts`), nic z toho není potřeba zadávat ručně.
Výjimky zadáte v administraci: **Nastavení → Přesměrování** (bez nasazení nové verze).

## Souhrn (742 adres z inventury starého webu)

| Výsledek | Počet |
| --- | --- |
| 200 – stránka je na stejné adrese | 363 |
| 308 – jedno přesměrování na správnou stránku | 379 |
| 404 – nic nepasuje | 0 |
| z toho k rozhodnutí majitele | 11 |
| nesouhlasí s importem (chyba) | 0 |

Odkazy uvnitř importovaných textů: 42 různých interních adres – přesměrovaných: 17, nefunkčních (404): 0.

### Podle pravidla

| Pravidlo | Význam | Počet |
| --- | --- | --- |
| served | stránka existuje na stejné adrese (200) | 363 |
| normalized | stará adresa s parametry / jiným tvarem → tatáž stránka | 333 |
| retired-product | produkt není veřejný (koncept / skrytý) → jeho kategorie | 16 |
| rubric | rubrika / výpis starého webu → výpis sekce | 11 |
| unknown-content | článek / recept / pojem / prodejna, který tu není → výpis sekce | 10 |
| same-id | stejné ID na starém webu, jiný slug → ten dokument | 7 |
| menu-pdf | PDF jídelní lístek → stránka prodejny | 1 |
| old-cart | starý košík → nový košík | 1 |

## K rozhodnutí majitele

Cíl je nejlepší odhad podle pravidla. Když chcete jiný, zadejte v administraci přesměrování pro
starou adresu (bez parametrů) – má přednost před automatickým pravidlem.

| Stará adresa | Cíl | Pravidlo | Poznámka |
| --- | --- | --- | --- |
| /magazin/chuck-roll-krk-detail-1060?page=2&catId=101&list=hide | /magazin | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /magazin/chuck-roll-krk-detail-1060?page=4&list=hide | /magazin | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /jidelni-listek | /prodejny/prodejna-terrys-steak-praha-detail-382 | menu-pdf | soubor (PDF) se nepřenáší |
| /recepty/anglicky-roastbeef-detail-868?page=4&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/anglicky-roastbeef-detail-868?page=4&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/kanci-kyta-se-sipkovou-omackou-detail-1039?page=2&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/kanci-kyta-se-sipkovou-omackou-detail-1039?page=2&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/tatarak-podle-terrys-steak-detail-1321?page=2&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/tatarak-podle-terrys-steak-detail-1321?page=2&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/trhane-hovezi-v-bbq-omacce-z-hoveziho-brisketu-us-prime-quality-v-keramickem-grillu-detail-28813?page=4&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/trhane-hovezi-v-bbq-omacce-z-hoveziho-brisketu-us-prime-quality-v-keramickem-grillu-detail-28813?page=4&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |

## Neveřejné produkty → nejužší kategorie

Produkty importované jako koncept (bez fotky / ceny) nebo skryté. Dokud nejsou zveřejněné, jejich
stará adresa vede do kategorie (nejhlubší v menu, při shodě ta s nejméně produkty). Po zveřejnění
produktu se přesměrování samo vypne a adresa ukáže produkt.

| Stará adresa | Cíl | Pravidlo | Poznámka |
| --- | --- | --- | --- |
| /produkty/113g-vega-burger-detail-1131 | /produkty/vegetarianske-produkty-118 | retired-product | importovaný produkt není veřejný |
| /produkty/australsky-hovezi-skirt-steak-detail-29390 | /produkty/pupek-flank-flap-111 | retired-product | importovaný produkt není veřejný |
| /produkty/kureci-kridla-detail-1010 | /produkty/kureci-maso-57 | retired-product | importovaný produkt není veřejný |
| /produkty/namibijske-hovezi-hrudi-brisket-point-end-detail-961 | /produkty/svickova-tenderloin-109 | retired-product | importovaný produkt není veřejný |
| /produkty/niva-detail-1185 | /produkty/syry-70 | retired-product | importovaný produkt není veřejný |
| /produkty/treska-detail-1070 | /produkty/ryby-40 | retired-product | importovaný produkt není veřejný |
| /produkty/valentyn-promo-wagyu-burger-pouze-9-2-13-2-2026-detail-28803 | /produkty/mlete-maso-na-burgery-62 | retired-product | importovaný produkt není veřejný |
| /produkty/vysocina-premium-detail-199 | /produkty/uzeniny-27 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-chuck-roll-aus-bms-8-9-detail-28773 | /produkty/wagyu-australie-103 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-flank-chile-bms-5-7-detail-1291 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-picanha-aus-bms-8-detail-28771 | /produkty/wagyu-australie-103 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-rib-eye-chile-bms-5-7-detail-1294 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-striploin-chile-bms-5-7-detail-1295 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-tenderloin-chile-bms-5-7-detail-1296 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-tenderloin-japonsko-a3-detail-1234 | /produkty/wagyu-japonsko-102 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-top-blade-aus-bms-8-detail-28776 | /produkty/wagyu-australie-103 | retired-product | importovaný produkt není veřejný |

## Přesměrování na úvodní stránku

Jen tam, kde nic lepšího není (zákaznický účet a přihlášení starého e-shopu – nový e-shop účty nemá).

| Stará adresa | Cíl | Pravidlo | Poznámka |
| --- | --- | --- | --- |
| /?Id=807 | / | normalized |  |

## Nesouhlasí s importem

Cíl podle pravidel je jiný dokument, než do kterého byla adresa importována. Mělo by být prázdné.

_žádné_

## Všechna přesměrování z inventury (379)

| Stará adresa | Cíl | Pravidlo | Poznámka |
| --- | --- | --- | --- |
| /academy-magazin | /academy | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /academy-magazin/kdo-je-nas-gastronomicky-guru-mirek-grusz-detail-145?list=hide | /academy-magazin/kdo-je-nas-gastronomicky-guru-mirek-grusz-detail-145 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?catId=100 | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?catId=100&list=hide | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?Id=807 | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?list=hide | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?page=2 | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?page=3 | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?page=4 | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?page=4&list=hide | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?page=5 | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized |  |
| /magazin/chuck-roll-krk-detail-1060?page=2&catId=101&list=hide | /magazin | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /magazin/chuck-roll-krk-detail-1060?page=4&list=hide | /magazin | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /magazin/danci-maso-detail-1143?catId=120 | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/danci-maso-detail-1143?catId=120&list=hide | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/danci-maso-detail-1143?Id=807 | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/danci-maso-detail-1143?page=2 | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/danci-maso-detail-1143?page=3 | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/danci-maso-detail-1143?page=3&list=hide | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/danci-maso-detail-1143?page=4 | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/danci-maso-detail-1143?page=5 | /magazin/danci-maso-detail-1143 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?catId=101 | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?catId=101&list=hide | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?Id=807 | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?list=hide | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?page=2 | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?page=2&catId=101 | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?page=3 | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?page=4 | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769?page=5 | /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?catId=101 | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?catId=101&list=hide | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?Id=807 | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?list=hide | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?page=2 | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?page=2&catId=101 | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?page=3 | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?page=4 | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/hovezi-svickova-tenderloin-detail-1049?page=5 | /magazin/hovezi-svickova-tenderloin-detail-1049 | normalized |  |
| /magazin/jak-pripravit-hovezi-steak-detail-857?catId=86 | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized |  |
| /magazin/jak-pripravit-hovezi-steak-detail-857?catId=86&list=hide | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized |  |
| /magazin/jak-pripravit-hovezi-steak-detail-857?list=hide | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized |  |
| /magazin/jak-pripravit-hovezi-steak-detail-857?page=2 | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized |  |
| /magazin/jak-pripravit-hovezi-steak-detail-857?page=3 | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized |  |
| /magazin/jak-pripravit-hovezi-steak-detail-857?page=4 | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized |  |
| /magazin/jak-pripravit-hovezi-steak-detail-857?page=5 | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?catId=82 | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?catId=82&list=hide | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?list=hide | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?page=2 | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?page=2&list=hide | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?page=3 | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?page=4 | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?page=5 | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized |  |
| /magazin/kanci-maso-detail-1141?catId=120 | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/kanci-maso-detail-1141?catId=120&list=hide | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/kanci-maso-detail-1141?Id=807 | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/kanci-maso-detail-1141?page=2 | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/kanci-maso-detail-1141?page=3 | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/kanci-maso-detail-1141?page=3&list=hide | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/kanci-maso-detail-1141?page=4 | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/kanci-maso-detail-1141?page=5 | /magazin/kanci-maso-detail-1141 | normalized |  |
| /magazin/pravidla-pro-grilovani-zveriny-detail-839?catId=86 | /magazin/pravidla-pro-grilovani-zveriny-detail-839 | normalized |  |
| /magazin/pravidla-pro-grilovani-zveriny-detail-839?catId=86&list=hide | /magazin/pravidla-pro-grilovani-zveriny-detail-839 | normalized |  |
| /magazin/pravidla-pro-grilovani-zveriny-detail-839?page=2 | /magazin/pravidla-pro-grilovani-zveriny-detail-839 | normalized |  |
| /magazin/pravidla-pro-grilovani-zveriny-detail-839?page=3 | /magazin/pravidla-pro-grilovani-zveriny-detail-839 | normalized |  |
| /magazin/pravidla-pro-grilovani-zveriny-detail-839?page=4 | /magazin/pravidla-pro-grilovani-zveriny-detail-839 | normalized |  |
| /magazin/pravidla-pro-grilovani-zveriny-detail-839?page=5 | /magazin/pravidla-pro-grilovani-zveriny-detail-839 | normalized |  |
| /magazin/pravidla-pro-grilovani-zveriny-detail-839?page=5&list=hide | /magazin/pravidla-pro-grilovani-zveriny-detail-839 | normalized |  |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855?catId=86 | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | normalized |  |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855?catId=86&list=hide | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | normalized |  |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855?page=2 | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | normalized |  |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855?page=3 | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | normalized |  |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855?page=4 | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | normalized |  |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855?page=4&list=hide | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | normalized |  |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855?page=5 | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?catId=101 | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?catId=101&list=hide | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?Id=807 | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?list=hide | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?page=2 | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?page=2&catId=101 | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?page=2&list=hide | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?page=3 | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?page=4 | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?page=5 | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/rump-kvetova-spicka-kyta-detail-1056?Id=807 | /magazin/rump-kvetova-spicka-kyta-detail-1056 | normalized |  |
| /magazin/rump-kvetova-spicka-kyta-detail-1056?page=2 | /magazin/rump-kvetova-spicka-kyta-detail-1056 | normalized |  |
| /magazin/rump-kvetova-spicka-kyta-detail-1056?page=2&catId=101&list=hide | /magazin/rump-kvetova-spicka-kyta-detail-1056 | normalized |  |
| /magazin/rump-kvetova-spicka-kyta-detail-1056?page=2&list=hide | /magazin/rump-kvetova-spicka-kyta-detail-1056 | normalized |  |
| /magazin/rump-kvetova-spicka-kyta-detail-1056?page=3 | /magazin/rump-kvetova-spicka-kyta-detail-1056 | normalized |  |
| /magazin/rump-kvetova-spicka-kyta-detail-1056?page=4 | /magazin/rump-kvetova-spicka-kyta-detail-1056 | normalized |  |
| /magazin/rump-kvetova-spicka-kyta-detail-1056?page=5 | /magazin/rump-kvetova-spicka-kyta-detail-1056 | normalized |  |
| /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005?catId=21 | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | normalized |  |
| /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005?catId=21&list=hide | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | normalized |  |
| /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005?page=2 | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | normalized |  |
| /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005?page=3 | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | normalized |  |
| /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005?page=4 | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | normalized |  |
| /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005?page=4&list=hide | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | normalized |  |
| /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005?page=5 | /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 | normalized |  |
| /magazin/srnci-maso-detail-1139?catId=120 | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/srnci-maso-detail-1139?catId=120&list=hide | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/srnci-maso-detail-1139?Id=807 | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/srnci-maso-detail-1139?page=2 | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/srnci-maso-detail-1139?page=3 | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/srnci-maso-detail-1139?page=3&list=hide | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/srnci-maso-detail-1139?page=4 | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/srnci-maso-detail-1139?page=5 | /magazin/srnci-maso-detail-1139 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?catId=101 | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?catId=101&list=hide | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?Id=807 | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?page=2 | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?page=2&catId=101 | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?page=2&list=hide | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?page=3 | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?page=4 | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/striploin-nizky-rostenec-detail-1051?page=5 | /magazin/striploin-nizky-rostenec-detail-1051 | normalized |  |
| /magazin/terrys.cz/magazin/rib-eye-vysoky-rostenec-detail-1053?page=3&list=hide | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized |  |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?catId=82 | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized |  |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?catId=82&list=hide | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized |  |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?page=2 | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized |  |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?page=2&list=hide | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized |  |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?page=3 | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized |  |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?page=4 | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized |  |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?page=5 | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized |  |
| /magazin/vzpominky-na-uruguay-detail-403?catId=82 | /magazin/vzpominky-na-uruguay-detail-403 | normalized |  |
| /magazin/vzpominky-na-uruguay-detail-403?catId=82&list=hide | /magazin/vzpominky-na-uruguay-detail-403 | normalized |  |
| /magazin/vzpominky-na-uruguay-detail-403?page=2 | /magazin/vzpominky-na-uruguay-detail-403 | normalized |  |
| /magazin/vzpominky-na-uruguay-detail-403?page=3 | /magazin/vzpominky-na-uruguay-detail-403 | normalized |  |
| /magazin/vzpominky-na-uruguay-detail-403?page=4 | /magazin/vzpominky-na-uruguay-detail-403 | normalized |  |
| /magazin/vzpominky-na-uruguay-detail-403?page=5 | /magazin/vzpominky-na-uruguay-detail-403 | normalized |  |
| /magazin/vzpominky-na-uruguay-detail-403?page=5&list=hide | /magazin/vzpominky-na-uruguay-detail-403 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?catId=100 | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?catId=100&list=hide | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?Id=807 | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?page=2 | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?page=3 | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?page=3&list=hide | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?page=4 | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047?page=5 | /magazin/wagyu-nejluxusnejsi-hovezi-maso-na-svete-1-dil-detail-1047 | normalized |  |
| /magazin/?Id=807 | /magazin | normalized | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /magazin/novinky-21 | /magazin | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /magazin/poznavame-plemena-hoveziho-100 | /magazin | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /magazin/poznavame-zverinu-120 | /magazin | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /magazin/predstavujeme-rezy-101 | /magazin | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /magazin/rady-a-tipy-86 | /magazin | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /magazin/stolovani-80 | /magazin | rubric |  |
| /magazin/zivot-v-terrysu-82 | /magazin | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /produkty/australske-hovezi-96?druh_masa=svickova | /produkty/australske-hovezi-96 | normalized |  |
| /produkty/rib-eye-106 | /produkty/vysoky-rostenec-rib-eye-106 | same-id |  |
| /produkty/rib-eye-vysoky-rostenec-106 | /produkty/vysoky-rostenec-rib-eye-106 | same-id |  |
| /produkty/severoamericke-hovezi-94?druh_masa=svickova | /produkty/severoamericke-hovezi-94 | normalized |  |
| /produkty/striploin-108 | /produkty/nizky-rostenec-striploin-108 | same-id |  |
| /produkty/striploin-nizky-rostenec-108 | /produkty/nizky-rostenec-striploin-108 | same-id |  |
| /produkty/svickova-109 | /produkty/svickova-tenderloin-109 | same-id |  |
| /produkty/tenderloin-svickova-109 | /produkty/svickova-tenderloin-109 | same-id |  |
| /produkty/wagyu-98?druh_masa=svickova | /produkty/wagyu-98 | normalized |  |
| /produkty/argentinske-hovezi-23/1 | /produkty/argentinske-hovezi-23 | normalized |  |
| /produkty/australske-hovezi-96/1 | /produkty/australske-hovezi-96 | normalized |  |
| /produkty/australske-hovezi-96/2 | /produkty/australske-hovezi-96 | normalized |  |
| /produkty/brazilske-hovezi-93/1 | /produkty/brazilske-hovezi-93 | normalized |  |
| /produkty/brouseni-nozu-122/1 | /produkty/brouseni-nozu-122 | normalized |  |
| /produkty/chuck-krk-110/1 | /produkty/chuck-krk-110 | normalized |  |
| /produkty/danci-maso-53/1 | /produkty/danci-maso-53 | normalized |  |
| /produkty/darkove-poukazy-a-krabicky-130/1 | /produkty/darkove-poukazy-a-krabicky-130 | normalized |  |
| /produkty/darkove-poukazy-set-90/1 | /produkty/darkove-poukazy-set-90 | normalized |  |
| /produkty/dorty-128/1 | /produkty/dorty-128 | normalized |  |
| /produkty/drubezi-26/1 | /produkty/drubezi-26 | normalized |  |
| /produkty/falesna-svickova-chuck-tender-terrys-steak-113/1 | /produkty/falesna-svickova-chuck-tender-terrys-steak-113 | normalized |  |
| /produkty/farmarske-hovezi-83/1 | /produkty/farmarske-hovezi-83 | normalized |  |
| /produkty/hotova-jidla-124/1 | /produkty/hotova-jidla-124 | normalized |  |
| /produkty/hovezi-z-ceskeho-chovu-39/1 | /produkty/hovezi-z-ceskeho-chovu-39 | normalized |  |
| /produkty/husi-maso-60/1 | /produkty/husi-maso-60 | normalized |  |
| /produkty/irske-hovezi-97/1 | /produkty/irske-hovezi-97 | normalized |  |
| /produkty/jehneci-maso-61/1 | /produkty/jehneci-maso-61 | normalized |  |
| /produkty/jeleni-maso-51/1 | /produkty/jeleni-maso-51 | normalized |  |
| /produkty/kachni-maso-59/1 | /produkty/kachni-maso-59 | normalized |  |
| /produkty/kanci-maso-52/1 | /produkty/kanci-maso-52 | normalized |  |
| /produkty/krk-chuck-roll-112/1 | /produkty/krk-chuck-roll-112 | normalized |  |
| /produkty/kruti-maso-58/1 | /produkty/kruti-maso-58 | normalized |  |
| /produkty/kureci-maso-57/1 | /produkty/kureci-maso-57 | normalized |  |
| /produkty/kvetova-spicka-rumpsteak-117/1 | /produkty/kvetova-spicka-rumpsteak-117 | normalized |  |
| /produkty/lanyze-121/1 | /produkty/lanyze-121 | normalized |  |
| /produkty/loupana-plec-top-blade-116/1 | /produkty/loupana-plec-top-blade-116 | normalized |  |
| /produkty/makronky-127/1 | /produkty/makronky-127 | normalized |  |
| /produkty/mlete-maso-na-burgery-62/1 | /produkty/mlete-maso-na-burgery-62 | normalized |  |
| /produkty/mlete-maso-na-burgery-62/2 | /produkty/mlete-maso-na-burgery-62 | normalized |  |
| /produkty/namibijske-hovezi-95/1 | /produkty/namibijske-hovezi-95 | normalized |  |
| /produkty/nizky-rostenec-striploin-108/1 | /produkty/nizky-rostenec-striploin-108 | normalized |  |
| /produkty/nizky-rostenec-striploin-108/2 | /produkty/nizky-rostenec-striploin-108 | normalized |  |
| /produkty/omacky-a-koreni-123/1 | /produkty/omacky-a-koreni-123 | normalized |  |
| /produkty/ostatni-30/1 | /produkty/ostatni-30 | normalized |  |
| /produkty/ostatni-30/2 | /produkty/ostatni-30 | normalized |  |
| /produkty/ostatni-30/3 | /produkty/ostatni-30 | normalized |  |
| /produkty/ostatni-30/4 | /produkty/ostatni-30 | normalized |  |
| /produkty/ostatni-30/5 | /produkty/ostatni-30 | normalized |  |
| /produkty/pupek-flank-flap-111/1 | /produkty/pupek-flank-flap-111 | normalized |  |
| /produkty/pupek-flank-flap-111/2 | /produkty/pupek-flank-flap-111 | normalized |  |
| /produkty/ryby-40/1 | /produkty/ryby-40 | normalized |  |
| /produkty/severoamericke-hovezi-94/1 | /produkty/severoamericke-hovezi-94 | normalized |  |
| /produkty/severoamericke-hovezi-94/2 | /produkty/severoamericke-hovezi-94 | normalized |  |
| /produkty/srnci-maso-55/1 | /produkty/srnci-maso-55 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/1 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/2 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/3 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/4 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/5 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/6 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/7 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105/8 | /produkty/steaky-podle-rezu-hovezi-maso-terrys-steak-105 | normalized |  |
| /produkty/svickova-tenderloin-109/1 | /produkty/svickova-tenderloin-109 | normalized |  |
| /produkty/svickova-tenderloin-109/2 | /produkty/svickova-tenderloin-109 | normalized |  |
| /produkty/syry-70/1 | /produkty/syry-70 | normalized |  |
| /produkty/teleci-50/1 | /produkty/teleci-50 | normalized |  |
| /produkty/termotasky-131/1 | /produkty/termotasky-131 | normalized |  |
| /produkty/terrys-cake-126/1 | /produkty/terrys-cake-126 | normalized |  |
| /produkty/uruguayske-hovezi-38/1 | /produkty/uruguayske-hovezi-38 | normalized |  |
| /produkty/uzeniny-27/1 | /produkty/uzeniny-27 | normalized |  |
| /produkty/uzeniny-27/2 | /produkty/uzeniny-27 | normalized |  |
| /produkty/uzeniny-27/3 | /produkty/uzeniny-27 | normalized |  |
| /produkty/vegetarianske-produkty-118/1 | /produkty/vegetarianske-produkty-118 | normalized |  |
| /produkty/veprove-28/1 | /produkty/veprove-28 | normalized |  |
| /produkty/vysoky-rostenec-rib-eye-106/1 | /produkty/vysoky-rostenec-rib-eye-106 | normalized |  |
| /produkty/vysoky-rostenec-rib-eye-106/2 | /produkty/vysoky-rostenec-rib-eye-106 | normalized |  |
| /produkty/wagyu-98/1 | /produkty/wagyu-98 | normalized |  |
| /produkty/wagyu-98/2 | /produkty/wagyu-98 | normalized |  |
| /produkty/wagyu-98/3 | /produkty/wagyu-98 | normalized |  |
| /produkty/wagyu-98/4 | /produkty/wagyu-98 | normalized |  |
| /produkty/wagyu-australie-103/1 | /produkty/wagyu-australie-103 | normalized |  |
| /produkty/wagyu-australie-103/2 | /produkty/wagyu-australie-103 | normalized |  |
| /produkty/wagyu-chile-125/1 | /produkty/wagyu-chile-125 | normalized |  |
| /produkty/wagyu-japonsko-102/1 | /produkty/wagyu-japonsko-102 | normalized |  |
| /produkty/wagyu-japonsko-102/2 | /produkty/wagyu-japonsko-102 | normalized |  |
| /produkty/wagyu-uruguay-104/1 | /produkty/wagyu-uruguay-104 | normalized |  |
| /produkty/zverina-29/1 | /produkty/zverina-29 | normalized |  |
| /produkty/zverina-29/2 | /produkty/zverina-29 | normalized |  |
| /jidelni-listek | /prodejny/prodejna-terrys-steak-praha-detail-382 | menu-pdf | soubor (PDF) se nepřenáší |
| /pojmy/podle-typu-masa-74 | /pojmy | rubric |  |
| /pojmy/podle-typu-pripravy-75 | /pojmy | rubric |  |
| /?Id=807 | / | normalized |  |
| /produkty/113g-vega-burger-detail-1131 | /produkty/vegetarianske-produkty-118 | retired-product | importovaný produkt není veřejný |
| /produkty/australsky-hovezi-skirt-steak-detail-29390 | /produkty/pupek-flank-flap-111 | retired-product | importovaný produkt není veřejný |
| /produkty/kureci-kridla-detail-1010 | /produkty/kureci-maso-57 | retired-product | importovaný produkt není veřejný |
| /produkty/namibijske-hovezi-hrudi-brisket-point-end-detail-961 | /produkty/svickova-tenderloin-109 | retired-product | importovaný produkt není veřejný |
| /produkty/niva-detail-1185 | /produkty/syry-70 | retired-product | importovaný produkt není veřejný |
| /produkty/treska-detail-1070 | /produkty/ryby-40 | retired-product | importovaný produkt není veřejný |
| /produkty/valentyn-promo-wagyu-burger-pouze-9-2-13-2-2026-detail-28803 | /produkty/mlete-maso-na-burgery-62 | retired-product | importovaný produkt není veřejný |
| /produkty/vlockova-sul-cornisch-detail-1275 | /produkty/vlockova-sul-cornisch-100g-detail-1275 | same-id |  |
| /produkty/vysocina-premium-detail-199 | /produkty/uzeniny-27 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-chuck-roll-aus-bms-8-9-detail-28773 | /produkty/wagyu-australie-103 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-flank-chile-bms-5-7-detail-1291 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-picanha-aus-bms-8-detail-28771 | /produkty/wagyu-australie-103 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-rib-eye-chile-bms-5-7-detail-1294 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-striploin-chile-bms-5-7-detail-1295 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-tenderloin-chile-bms-5-7-detail-1296 | /produkty/wagyu-chile-125 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-tenderloin-japonsko-a3-detail-1234 | /produkty/wagyu-japonsko-102 | retired-product | importovaný produkt není veřejný |
| /produkty/wagyu-top-blade-aus-bms-8-detail-28776 | /produkty/wagyu-australie-103 | retired-product | importovaný produkt není veřejný |
| /produkty?Page=1 | /produkty | normalized |  |
| /produkty?Page=10 | /produkty | normalized |  |
| /produkty?Page=11 | /produkty | normalized |  |
| /produkty?Page=12 | /produkty | normalized |  |
| /produkty?Page=13 | /produkty | normalized |  |
| /produkty?Page=14 | /produkty | normalized |  |
| /produkty?Page=15 | /produkty | normalized |  |
| /produkty?Page=16 | /produkty | normalized |  |
| /produkty?Page=17 | /produkty | normalized |  |
| /produkty?Page=18 | /produkty | normalized |  |
| /produkty?Page=19 | /produkty | normalized |  |
| /produkty?Page=2 | /produkty | normalized |  |
| /produkty?Page=20 | /produkty | normalized |  |
| /produkty?Page=21 | /produkty | normalized |  |
| /produkty?Page=22 | /produkty | normalized |  |
| /produkty?Page=3 | /produkty | normalized |  |
| /produkty?Page=4 | /produkty | normalized |  |
| /produkty?Page=5 | /produkty | normalized |  |
| /produkty?Page=6 | /produkty | normalized |  |
| /produkty?Page=7 | /produkty | normalized |  |
| /produkty?Page=8 | /produkty | normalized |  |
| /produkty?Page=9 | /produkty | normalized |  |
| /recepty/anglicky-roastbeef-detail-868?page=4&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/anglicky-roastbeef-detail-868?page=4&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762?Id=807 | /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762 | normalized |  |
| /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762?page=2 | /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762 | normalized |  |
| /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762?page=3 | /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762 | normalized |  |
| /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762?page=3&catId=31&list=hide | /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762 | normalized |  |
| /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762?page=3&list=hide | /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762 | normalized |  |
| /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762?page=4 | /recepty/farmarsky-hovezi-burger-s-dresinkem-detail-762 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?catId=31 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?catId=31&list=hide | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?Id=807 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?list=hide | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?page=2 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?page=2&catId=31 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?page=3 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?page=3&catId=31 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?page=4 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836?page=4&catId=31 | /recepty/hovezi-zebra-short-ribs-us-prime-detail-28836 | normalized |  |
| /recepty/jehneci-kyta-s-rozmarynem-detail-870?Id=807 | /recepty/jehneci-kyta-s-rozmarynem-detail-870 | normalized |  |
| /recepty/jehneci-kyta-s-rozmarynem-detail-870?page=2 | /recepty/jehneci-kyta-s-rozmarynem-detail-870 | normalized |  |
| /recepty/jehneci-kyta-s-rozmarynem-detail-870?page=3 | /recepty/jehneci-kyta-s-rozmarynem-detail-870 | normalized |  |
| /recepty/jehneci-kyta-s-rozmarynem-detail-870?page=4 | /recepty/jehneci-kyta-s-rozmarynem-detail-870 | normalized |  |
| /recepty/jehneci-kyta-s-rozmarynem-detail-870?page=4&catId=31&list=hide | /recepty/jehneci-kyta-s-rozmarynem-detail-870 | normalized |  |
| /recepty/jehneci-kyta-s-rozmarynem-detail-870?page=4&list=hide | /recepty/jehneci-kyta-s-rozmarynem-detail-870 | normalized |  |
| /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835?Id=807 | /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | normalized |  |
| /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835?page=2 | /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | normalized |  |
| /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835?page=2&catId=31&list=hide | /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | normalized |  |
| /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835?page=3 | /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | normalized |  |
| /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835?page=3&list=hide | /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | normalized |  |
| /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835?page=4 | /recepty/kanci-hrbet-na-bylinkach-peceny-v-celku-detail-835 | normalized |  |
| /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758?Id=807 | /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | normalized |  |
| /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758?page=2 | /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | normalized |  |
| /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758?page=2&catId=31&list=hide | /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | normalized |  |
| /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758?page=2&list=hide | /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | normalized |  |
| /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758?page=3 | /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | normalized |  |
| /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758?page=4 | /recepty/kanci-hrbet-v-pomerancovo-zazvorove-marinade-detail-758 | normalized |  |
| /recepty/kanci-kyta-se-sipkovou-omackou-detail-1039?page=2&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/kanci-kyta-se-sipkovou-omackou-detail-1039?page=2&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?catId=31 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?catId=31&list=hide | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?Id=807 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?list=hide | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?page=2 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?page=2&catId=31 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?page=3 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?page=3&catId=31 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?page=4 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844?page=4&catId=31 | /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 | normalized |  |
| /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762?Id=807 | /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 | normalized |  |
| /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762?list=hide | /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 | normalized |  |
| /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762?page=2 | /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 | normalized |  |
| /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762?page=3 | /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 | normalized |  |
| /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762?page=4 | /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 | normalized |  |
| /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833?Id=807 | /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | normalized |  |
| /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833?page=2 | /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | normalized |  |
| /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833?page=3 | /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | normalized |  |
| /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833?page=3&catId=31&list=hide | /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | normalized |  |
| /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833?page=4 | /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | normalized |  |
| /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833?page=4&list=hide | /recepty/srnci-kyta-marinovana-v-cervenem-vine-se-skorici-detail-833 | normalized |  |
| /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831?Id=807 | /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | normalized |  |
| /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831?page=2 | /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | normalized |  |
| /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831?page=3 | /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | normalized |  |
| /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831?page=3&catId=31&list=hide | /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | normalized |  |
| /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831?page=3&list=hide | /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | normalized |  |
| /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831?page=4 | /recepty/srnci-steaky-z-kyty-po-lesnicku-detail-831 | normalized |  |
| /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837?Id=807 | /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | normalized |  |
| /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837?page=2 | /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | normalized |  |
| /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837?page=3 | /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | normalized |  |
| /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837?page=3&catId=31&list=hide | /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | normalized |  |
| /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837?page=3&list=hide | /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | normalized |  |
| /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837?page=4 | /recepty/steak-z-divocaka-na-grilu-marinovany-v-brusinkach-a-cerstvych-bylinkach-detail-837 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?catId=31 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?catId=31&list=hide | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?Id=807 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?page=2 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?page=2&catId=31 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?page=2&list=hide | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?page=3 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?page=3&catId=31 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?page=4 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330?page=4&catId=31 | /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 | normalized |  |
| /recepty/tatarak-podle-terrys-steak-detail-1321?page=2&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/tatarak-podle-terrys-steak-detail-1321?page=2&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/trhane-hovezi-v-bbq-omacce-z-hoveziho-brisketu-us-prime-quality-v-keramickem-grillu-detail-28813?page=4&catId=31&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/trhane-hovezi-v-bbq-omacce-z-hoveziho-brisketu-us-prime-quality-v-keramickem-grillu-detail-28813?page=4&list=hide | /recepty | unknown-content | stránka na starém webu existuje, ale nebyla stažena (jen odkaz s ?list=hide) – doplní nové stažení |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?catId=31 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?catId=31&list=hide | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?Id=807 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?list=hide | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?page=2 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?page=2&catId=31 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?page=3 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?page=3&catId=31 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?page=4 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840?page=4&catId=31 | /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 | normalized |  |
| /recepty/?Id=807 | /recepty | normalized | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /recepty/hlavni-jidla-31 | /recepty | rubric | starý web dočasně (302) přesměrovával na nejnovější článek; nový web má výpis |
| /pages/cookies/info.aspx?Lang=cs | /pages/cookies/info.aspx | normalized |  |
| /pages/cookies/table.aspx?lang=cs | /pages/cookies/table.aspx | normalized |  |
| /obchod/kosik | /kosik | old-cart |  |

## Odkazy v importovaných textech

Interní odkazy v textech produktů, článků, receptů a stránek (importér je přepsal na staré
adresy). Fungují přes přesměrování; v administraci je můžete časem opravit na cílovou adresu.

| Stará adresa | Cíl | Pravidlo | Poznámka |
| --- | --- | --- | --- |
| / | / | served | adresa je i v inventuře; odkaz na /magazin/selavita-se-meni-na-terrys-prvni-specializovanou-prodejnu-steakovych-mas-detail-1005 |
| /kontaktni-informace | /kontaktni-informace | served | adresa je i v inventuře; odkaz na /produkty/darkovy-poukaz-1-000-kc-detail-866 |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | served | adresa je i v inventuře; odkaz na /magazin/hovezi-svickova-tenderloin-detail-1049 |
| /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041?list=hide | /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 | normalized | adresa je i v inventuře; odkaz na /produkty/australska-hovezi-svickova-detail-941 |
| /magazin/jak-pripravit-hovezi-steak-detail-857 | /magazin/jak-pripravit-hovezi-steak-detail-857 | served | adresa je i v inventuře; odkaz na /magazin/propeceni-steaku-rare-medium-well-done-detail-855 |
| /magazin/jak-pripravit-hovezi-steak-detail-857?list=hide | /magazin/jak-pripravit-hovezi-steak-detail-857 | normalized | adresa je i v inventuře; odkaz na /recepty/steak-z-hovezi-svickove-priprava-v-grilu-detail-1330 |
| /magazin/jak-pro-vas-balime-steaky-detail-1164?list=hide | /magazin/jak-pro-vas-balime-steaky-detail-1164 | normalized | adresa je i v inventuře; odkaz na /magazin/rib-eye-vysoky-rostenec-detail-1053 |
| /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | /magazin/propeceni-steaku-rare-medium-well-done-detail-855 | served | adresa je i v inventuře; odkaz na /magazin/jak-pripravit-hovezi-steak-detail-857 |
| /magazin/rib-eye-vysoky-rostenec-detail-1053?page=2&list=hide | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized | adresa je i v inventuře; odkaz na /magazin/striploin-nizky-rostenec-detail-1051 |
| /magazin/terrys.cz/magazin/rib-eye-vysoky-rostenec-detail-1053?page=3&list=hide | /magazin/rib-eye-vysoky-rostenec-detail-1053 | normalized | adresa je i v inventuře; odkaz na /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 |
| /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166?page=2&list=hide | /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 | normalized | adresa je i v inventuře; odkaz na /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 |
| /pages/cookies/table.aspx?lang=cs | /pages/cookies/table.aspx | normalized | adresa je i v inventuře; odkaz na /pages/cookies/info.aspx |
| /prodejny | /prodejny | served | adresa je i v inventuře; odkaz na /produkty/darkovy-poukaz-1-000-kc-detail-866 |
| /produkty | /produkty | served | adresa je i v inventuře; odkaz na /magazin/jak-pripravit-hovezi-steak-detail-857 |
| /produkty/argentinska-hovezi-svickova-3-4-detail-413 | /produkty/argentinska-hovezi-svickova-3-4-detail-413 | served | adresa je i v inventuře; odkaz na /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 |
| /produkty/argentinske-hovezi-23 | /produkty/argentinske-hovezi-23 | served | adresa je i v inventuře; odkaz na /magazin/angus-jedno-z-nejvice-oblibenych-masnych-plemen-pro-chov-na-svete-detail-1041 |
| /produkty/argentinsky-hovezi-flank-steak-detail-415 | /produkty/argentinsky-hovezi-flank-steak-detail-415 | served | adresa je i v inventuře; odkaz na /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 |
| /produkty/australska-hovezi-svickova-detail-941 | /produkty/australska-hovezi-svickova-detail-941 | served | adresa je i v inventuře; odkaz na /magazin/hovezi-svickova-tenderloin-detail-1049 |
| /produkty/australske-hovezi-96?druh_masa=svickova | /produkty/australske-hovezi-96 | normalized | adresa je i v inventuře; odkaz na /magazin/hovezi-svickova-tenderloin-detail-1049 |
| /produkty/australsky-hovezi-tomahawk-steak-detail-1133 | /produkty/australsky-hovezi-tomahawk-steak-detail-1133 | served | adresa je i v inventuře; odkaz na /produkty/us-hovezi-prime-rib-rib-eye-s-kratkou-kosti-detail-1310 |
| /produkty/chuck-krk-110 | /produkty/chuck-krk-110 | served | adresa je i v inventuře; odkaz na /produkty/argentinsky-hovezi-rib-eye-detail-406 |
| /produkty/lanyze-121 | /produkty/lanyze-121 | served | adresa je i v inventuře; odkaz na /recepty/priprava-hovezi-svickove-wellington-v-keramickem-grilu-ci-jakemkoliv-grilu-s-vikem-popripade-v-domaci-troube-detail-28844 |
| /produkty/pupek-flank-flap-111 | /produkty/pupek-flank-flap-111 | served | adresa je i v inventuře; odkaz na /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 |
| /produkty/rib-eye-106 | /produkty/vysoky-rostenec-rib-eye-106 | same-id | adresa je i v inventuře; odkaz na /magazin/jak-pripravit-hovezi-steak-detail-857 |
| /produkty/rib-eye-vysoky-rostenec-106 | /produkty/vysoky-rostenec-rib-eye-106 | same-id | adresa je i v inventuře; odkaz na /magazin/rib-eye-vysoky-rostenec-detail-1053 |
| /produkty/severoamericke-hovezi-94?druh_masa=svickova | /produkty/severoamericke-hovezi-94 | normalized | adresa je i v inventuře; odkaz na /magazin/hovezi-svickova-tenderloin-detail-1049 |
| /produkty/striploin-108 | /produkty/nizky-rostenec-striploin-108 | same-id | adresa je i v inventuře; odkaz na /produkty/argentinska-hovezi-svickova-3-4-detail-413 |
| /produkty/striploin-nizky-rostenec-108 | /produkty/nizky-rostenec-striploin-108 | same-id | adresa je i v inventuře; odkaz na /produkty/argentinsky-hovezi-rib-eye-detail-406 |
| /produkty/svickova-109 | /produkty/svickova-tenderloin-109 | same-id | adresa je i v inventuře; odkaz na /produkty/svickova-tenderloin-109 |
| /produkty/tenderloin-svickova-109 | /produkty/svickova-tenderloin-109 | same-id | adresa je i v inventuře; odkaz na /magazin/rib-eye-vysoky-rostenec-detail-1053 |
| /produkty/uruguayske-hovezi-38 | /produkty/uruguayske-hovezi-38 | served | adresa je i v inventuře; odkaz na /magazin/vzpominky-na-uruguay-detail-403 |
| /produkty/us-hovezi-flap-steak-detail-924 | /produkty/us-hovezi-flap-steak-detail-924 | served | adresa je i v inventuře; odkaz na /magazin/flank-steak-flap-steak-hovezi-pupek-detail-28769 |
| /produkty/vlockova-sul-cornisch-detail-1275 | /produkty/vlockova-sul-cornisch-100g-detail-1275 | same-id | adresa je i v inventuře; odkaz na /magazin/jak-pripravit-hovezi-steak-detail-857 |
| /produkty/vysoky-rostenec-rib-eye-106 | /produkty/vysoky-rostenec-rib-eye-106 | served | adresa je i v inventuře; odkaz na /recepty/priprava-rib-eye-steaku-reverzni-metodou-reverse-sear-detail-28762 |
| /produkty/wagyu-98 | /produkty/wagyu-98 | served | adresa je i v inventuře; odkaz na /produkty/argentinska-hovezi-svickova-3-4-detail-413 |
| /produkty/wagyu-98?druh_masa=svickova | /produkty/wagyu-98 | normalized | adresa je i v inventuře; odkaz na /magazin/hovezi-svickova-tenderloin-detail-1049 |
| /produkty/wagyu-brisket-hrudi-aus-bms-8-9-detail-28838 | /produkty/wagyu-brisket-hrudi-aus-bms-8-9-detail-28838 | served | adresa je i v inventuře; odkaz na /recepty/wagyu-hovezi-brisket-v-keramickem-grillu-zauzeny-tresni-detail-28840 |
| /produkty/wagyu-rib-eye-japonsko-a4-detail-1153 | /produkty/wagyu-rib-eye-japonsko-a4-detail-1153 | served | adresa je i v inventuře; odkaz na /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 |
| /produkty/wagyu-rib-eye-japonsko-a5-high-quality-detail-1080 | /produkty/wagyu-rib-eye-japonsko-a5-high-quality-detail-1080 | served | adresa je i v inventuře; odkaz na /magazin/velikost-steaku-aneb-jak-si-spravne-vybrat-detail-1166 |
| /produkty/wagyu-tenderloin-aus-bms-8-9-detail-1031 | /produkty/wagyu-tenderloin-aus-bms-8-9-detail-1031 | served | adresa je i v inventuře; odkaz na /magazin/hovezi-svickova-tenderloin-detail-1049 |
| /produkty/wagyu-tenderloin-japonsko-a5-high-quality-detail-1146 | /produkty/wagyu-tenderloin-japonsko-a5-high-quality-detail-1146 | served | adresa je i v inventuře; odkaz na /magazin/hovezi-svickova-tenderloin-detail-1049 |
| /slozeni | /slozeni | served | adresa je i v inventuře; odkaz na /produkty/anglicka-slanina-detail-215 |

## Co se nepřesměrovává

- Staré obrázky `/ew/ew_images/image_of_object?ObjectIdentifier=…` a další soubory systému EasyWeb:
  vrací 404. Nejsou to stránky; obrázky jsou v novém webu nahrané znovu (Média) a vyhledávače
  si nové adresy najdou ze stránek. Přesměrovat by je šlo jen ručně po jednom (nemá smysl).
- Košík a účet starého e-shopu (`/obchod/kosik` → `/kosik`, účet → úvodní stránka): viz výše.
- `www` / bez `www`, `http` → `https`: patří do nastavení domény (Cloudflare / Vercel), ne do
  aplikace – viz README, etapa 9.
