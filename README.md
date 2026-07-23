# Cene — navodila za postavitev

Tvoja osebna aplikacija za primerjavo cen. Bere podatke neposredno iz tvoje
Google preglednice, deluje na iPhonu kot navadna aplikacija (ikona na
domačem zaslonu), gostovanje pa je brezplačno na GitHub Pages.

Datoteke v tej mapi:
- `index.html` — glavna stran
- `style.css` — videz
- `app.js` — logika (branje podatkov, kategorije, filtri, razvrščanje)
- `manifest.json` — nastavitve za "Dodaj na domači zaslon"
- `icon.png` — ikona aplikacije

## 1. Ustvari repozitorij na GitHubu

1. Pojdi na [github.com/new](https://github.com/new)
2. Ime repozitorija: na primer `cene-app` (poljubno)
3. Nastavi na **Public** (mora biti javen, da GitHub Pages deluje brezplačno)
4. Klikni **Create repository**

## 2. Naloži datoteke

1. Na strani novega repozitorija klikni **"uploading an existing file"**
   (ali "Add file" → "Upload files")
2. Povleci vseh 5 datotek iz te mape (`index.html`, `style.css`, `app.js`,
   `manifest.json`, `icon.png`) v okno brskalnika
3. Spodaj klikni **Commit changes**

## 3. Vklopi GitHub Pages

1. V repozitoriju pojdi na **Settings** (zgornji meni)
2. V levem meniju izberi **Pages**
3. Pod "Build and deployment" → "Branch" izberi **main** in mapo **/ (root)**
4. Klikni **Save**
5. Počakaj približno minuto, nato osveži stran — na vrhu se prikaže povezava,
   nekaj takega kot:
   `https://<tvoje-uporabniško-ime>.github.io/cene-app/`

## 4. Dodaj na iPhone domači zaslon

1. Odpri zgornjo povezavo v **Safariju** na iPhonu (mora biti Safari, ne Chrome)
2. Tapni gumb **Deli** (kvadrat s puščico navzgor)
3. Izberi **"Dodaj na domači zaslon" / "Add to Home Screen"**
4. Potrdi — na domačem zaslonu dobiš ikono "Cene", ki se odpre čez cel zaslon
   brez naslovne vrstice, tako kot prava aplikacija

## Kako deluje

- Ob vsakem odprtju aplikacija povleče trenutne podatke iz tvoje Google
  preglednice (zavihek "Source") — ni potrebe po ponovnem nalaganju datotek.
- Če dodaš nove izdelke ali spremeniš cene v Google Sheets, se to v aplikaciji
  pozna takoj ob naslednjem odprtju (ali s tipko za osvežitev ⟳ zgoraj desno).
- Gumb ⟳ prisili ponovno nalaganje, če želiš sveže podatke brez zapiranja app.

## Če želiš kaj spremeniti kasneje

Vrni se v repozitorij na GitHubu, odpri datoteko (npr. `app.js` ali
`style.css`), klikni ikono svinčnika za urejanje, spremeni, klikni
**Commit changes**. Sprememba se čez cca. minuto pozna tudi na tvojem
iPhonu (samo ponovno odpri aplikacijo).

## Če se pojavi napaka pri nalaganju

Aplikacija bo pokazala rdeče obvestilo, če:
- ime zavihka v preglednici ni več "Source" (spremeni v `app.js`, vrstica
  `const SHEET_NAME = "Source";`)
- deljenje preglednice ni več nastavljeno na "Kdor koli s povezavo"
- si spremenil ID preglednice (URL) — v tem primeru posodobi `SHEET_ID`
  na vrhu `app.js`
