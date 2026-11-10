# Počasí na mapě

**Živá aplikace:** <https://martalusek-hub.github.io/pocasi-na-mape/> – z tohoto odkazu jde aplikaci i nainstalovat na plochu (HTTPS).

Interaktivní webová mapa, která zobrazuje **srážky**, **sněžení**, **oblačnost** a **rychlost větru** pro libovolné místo na světě. Mezi vrstvami se přepíná jedním kliknutím, polohu lze zadat názvem města nebo kliknutím do mapy. Stejná data jde zobrazit i jako **graf předpovědi**.

![Vrstvy](https://img.shields.io/badge/vrstvy-sr%C3%A1%C5%BEky%20%7C%20sn%C4%9B%C5%BEen%C3%AD%20%7C%20obla%C4%8Dnost%20%7C%20v%C3%ADtr-38bdf8)

## Co to umí

- **Čtyři vrstvy** – srážky (mm/h), sněžení (cm/h), oblačnost (%), vítr (km/h) – přepínání je okamžité, bez nového načítání.
- **Přepínač mapa / graf** – v horní liště přepneš na velký graf vývoje zvolené veličiny na 3 dny dopředu pro střed aktuálního výřezu. Kliknutím do grafu nastavíš čas, který se pak zobrazí i na mapě.
- **Hodinová předpověď na 3 dny** – časová osa pod mapou, přehrávání animace a tlačítko „Teď“.
- **Vyhledávání měst** s našeptávačem (česky, včetně země a kraje).
- **Klik do mapy** – detail počasí v daném bodě + malý graf vývoje na dalších 12 hodin (včetně sněžení, když nějaké napadne).
- **Moje poloha** – tlačítko se šipkou zaměří mapu na aktuální polohu (vyžádá si svolení prohlížeče).
- **Legenda** s barevnou škálou a jednotkami pro každou vrstvu.
- **Vítr** je navíc znázorněný šipkami (ukazují, kam vítr fouká).
- **Automatická aktualizace** každých 10 minut a tlačítko pro ruční obnovení.
- **Responzivní** – funguje na počítači i na mobilu.
- **Instalace jako aplikace (PWA)** – ikona na ploše telefonu i počítače, spuštění na celou obrazovku a offline UI.
- Tmavý podklad mapy, aby vynikly barvy vrstev.

## Jak spustit

Aplikace je čistě statická (HTML + CSS + JS), nepotřebuje build ani instalaci závislostí.

### Varianta 1 – dvojklik

Otevři `index.html` v prohlížeči. Bude to fungovat, ale některé prohlížeče omezují práci s lokálními soubory; doporučuji variantu 2.

### Varianta 2 – lokální server (doporučeno)

Na tomto počítači není Node ani Python, proto je přiložený malý server v PowerShellu:

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8123
```

Pak otevři <http://localhost:8123>. Ukončení serveru: `Ctrl+C`.

Pro otestování z telefonu v domácí síti přidej `-Bind 0.0.0.0` (server pak poslouchá na všech rozhraních):

```powershell
powershell -ExecutionPolicy Bypass -File .\serve.ps1 -Port 8123 -Bind 0.0.0.0
```

## Instalace jako aplikace (PWA)

Aplikaci jde nainstalovat na plochu telefonu i počítače a spustit ji na celou obrazovku – bez obchodu s aplikacemi.

- **Počítač (Chrome / Edge):** otevři aplikaci a klikni na ikonu instalace v adresním řádku, nebo na tlačítko ⤓ v horní liště.
- **Android (Chrome):** menu ⋮ → „Nainstalovat aplikaci“ / „Přidat na plochu“.
- **iPhone / iPad (Safari):** tlačítko Sdílet → „Přidat na plochu“.

**Podmínka:** instalace funguje jen na `localhost` nebo přes **HTTPS**. Při otevření přes `http://192.168.x.x` se aplikace zobrazí, ale prohlížeč instalaci nenabídne, protože service worker vyžaduje zabezpečený kontext. Pro telefon proto použij HTTPS – třeba hosting na GitHub Pages / Netlify / Cloudflare Pages, nebo tunel (ngrok, Cloudflare Tunnel).

**Offline režim:** service worker ukládá HTML, CSS, JS, ikony i Leaflet, takže se aplikace otevře i bez sítě a zobrazí poslední stažená data. Mapové dlaždice a nová data ale potřebují internet.

**Aktualizace:** po úpravě souborů zvedni `VERSION` v `sw.js` (např. na `pocasi-v2`), aby si prohlížeče stáhly novou cache.

## Ovládání

| Akce | Výsledek |
| --- | --- |
| Klik na **Srážky / Sněžení / Oblačnost / Vítr** | přepne vrstvu (zvolený čas zůstane) |
| Přepínač **mapa / graf** v horní liště | zobrazí velký graf předpovědi pro střed mapy |
| Klik do grafu | nastaví vybranou hodinu (projeví se i na mapě) |
| **Časová osa** dole | výběr hodiny předpovědi (až +3 dny) |
| **▶ / ⏸** | přehraje / pozastaví animaci předpovědi |
| **Teď** | skok zpět na aktuální hodinu |
| Napsání názvu do vyhledávání | našeptávač měst, výběr myší nebo `Enter` |
| Šipky ↑ ↓ | pohyb v našeptávači |
| `Esc` | zavře našeptávač |
| Klik do mapy | detail počasí + graf na 12 h |
| Tlačítko ⌖ | moje poloha |
| Tlačítko ↻ | okamžitá aktualizace dat |
| Tlačítko ⤓ | nainstaluje aplikaci na plochu (když to prohlížeč nabízí) |
| Kolečko / tlačítka + − | zoom |

## Data a limity

- **Open-Meteo** – předpověď i aktuální počasí, zdarma a bez API klíče
  (<https://open-meteo.com>).
- **Geokódování** – Open-Meteo Geocoding API.
- **Mapové podklady** – Esri World Dark Gray (tmavý podklad + popisky), bez API klíče.
  Kdyby služba dlaždice přestala vydávat, aplikace se automaticky přepne na OpenStreetMap s tmavým filtrem.

Data se nestahují jako hotové obrázky, ale aplikace vzorkuje mřížku **9 × 7 bodů** nad aktuálním výřezem mapy (63 souřadnic v jednom requestu) a mezi body plynule interpoluje. Pro každý bod se zároveň načte **72 hodinových kroků (3 dny)** dopředu, takže posouvání časové osy ani přehrávání animace nepotřebuje žádné další požadavky – jen překresluje data z paměti.

Graf používá data z prostředního bodu mřížky (přesně střed výřezu), takže se nic dalšího nestahuje. Sněžení je hodinový úhrn v centimetrech (`snowfall`), srážky hodinový úhrn v milimetrech.

Open-Meteo počítá každou souřadnici jako samostatné volání, proto je mřížka menší – limit je 600 volání za minutu. Při překročení aplikace zobrazí hlášku a za chvíli to zkusí znovu.

Rozlišení dat je zhruba 1–11 km podle modelu, takže při velkém přiblížení už mapa nepřidává detail.

## Struktura

```
index.html           – kostra stránky a panely
style.css            – vzhled (tmavé UI, legenda, popup, mobil)
app.js               – mapa, načítání dat, interpolace, vyhledávání, PWA
manifest.webmanifest – metadata aplikace pro instalaci
sw.js                – service worker (offline cache)
icons/               – ikony aplikace (192, 512, maskable, Apple, favicon)
make-icons.ps1       – znovu vygeneruje ikony (PowerShell + System.Drawing)
serve.ps1            – volitelný lokální HTTP server (PowerShell)
```

## Přizpůsobení

### Jiná barva / rozsah vrstvy

V `app.js` najdi objekt `LAYERS`. Každá vrstva má:

```js
precipitation: {
  title: 'Srážky',
  unit: 'mm/h',
  field: 'precipitation',   // název pole z Open-Meteo
  color: '#38bdf8',         // barva čáry v grafu
  max: 10,                  // hodnota, na které končí barevná škála
  stops: [                  // [hodnota, [R,G,B], průhlednost]
    [0.0, [56, 189, 248], 0.0],
    [10.0, [239, 68, 68], 0.92],
  ],
  ticks: [0, 1, 2, 5, 10],
  tickLabels: ['0', '1', '2', '5', '10+'],
}
```

### Přidání další vrstvy (např. teplota)

1. Přidej záznam do `LAYERS` (např. `temperature` s `field: 'temperature_2m'`, `color: '#fb923c'`, `max: 40`).
2. Přidej tlačítko do `index.html`:
   ```html
   <button class="layer-btn" type="button" data-layer="temperature">Teplota</button>
   ```
3. V `refreshOverlay` přidej pole do požadavku:
   ```js
   hourly: 'precipitation,snowfall,cloud_cover,wind_speed_10m,wind_direction_10m,temperature_2m',
   ```
   do inicializace `values`:
   ```js
   temperature: new Float32Array(n * steps),
   ```
   a do cyklu přes body/hodiny:
   ```js
   const tmp = h.temperature_2m || [];
   ...
   values.temperature[idx] = num(tmp[t]);
   ```

Zbytek (legenda, přepínání, interpolace, časová osa i graf) se zařídí sám.

### Jiný výchozí výřez

V `app.js` uprav:

```js
.setView([49.85, 15.3], 8);
```

## Známá omezení

- Bez internetu se aplikace otevře (UI z cache) a ukáže poslední stažená data; mapa a nová data ale vyžadují připojení.
- Instalace na telefon vyžaduje HTTPS (viz výše) – přes `http://` v LAN se aplikace jen zobrazí.
- Open-Meteo je zdarma pro nekomerční použití; při velkém provozu se řiď jejich podmínkami.
- „Srážky“ ve vrstvě jsou hodinový úhrn (mm/h) z hodinové předpovědi; popup v bodě ukazuje aktuální hodnotu.
- „Sněžení“ je hodinový úhrn v cm/h. V teplejších oblastech bývá nula, takže vrstva může být celá průhledná.
- Graf i vrstvy ukazují střed aktuálního výřezu mapy – po posunu mapy se data i graf přepočítají.
- Předpověď má hodinové kroky – mezi hodinami se neinterpoluje v čase.
- Přesnost je daná modelem – nejde o radarová data v reálném čase.
