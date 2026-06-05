# Hudobná odporúčacia webová aplikácia

Bakalárska práca — webová aplikácia, ktorá používateľovi prihlásenému cez Spotify ponúka personalizované odporúčania skladieb. Tri rôzne odporúčacie algoritmy (implicitný, explicitný, hybridný) bežia paralelne a generujú tri zoznamy odporúčaní.

## Architektúra

- **Frontend** — React 19 + Vite + Tailwind 4 (`client/`, port 3000)
- **Backend** — Express 5 + TensorFlow.js (`server/`, port 3001)
- **Databáza** — MySQL 8 v Docker kontajneri (port 3306)
- **Externé API** — Spotify Web API + Spotify Web Playback SDK

---

## Predtým než začnete — požiadavky

| Nástroj | Verzia / poznámka | Odkaz na stiahnutie |
|---|---|---|
| **Node.js** | 20 LTS alebo vyššia | https://nodejs.org/ |
| **Docker Desktop** | najnovšia | https://www.docker.com/products/docker-desktop |
| **Git** | hocijaká | https://git-scm.com/ |
| **Google Chrome** alebo **Microsoft Edge** | najnovšia | https://www.google.com/chrome/ |
| **Spotify Premium účet** | bez Premium SDK neprehráva hudbu | https://www.spotify.com/premium/ |

> **Poznámka k prehliadaču:** Web Playback SDK od Spotify používa DRM cez Widevine. Firefox, Brave a ungoogled-chromium nefungujú spoľahlivo. Aplikácia tiež **nefunguje v Inkognito režime**.

> **Poznámka k Dockeru na Windowse:** Pri prvom spustení Docker Desktop vyžaduje aktiváciu WSL2 (Windows Subsystem for Linux 2) — povoľte to a v prípade potreby reštartujte počítač.

---

## Pre komisiu a oponenta bakalárskej práce

Ak túto aplikáciu spúšťate ako člen hodnotiacej komisie alebo oponent práce, môžete **preskočiť krok 2 (vytvorenie vlastnej Spotify aplikácie)** nižšie a použiť Spotify credentials priložené k práci ako skrytú prílohu (alebo zaslané autorom emailom).

Aby Vás však Spotify pustil do aplikácie, autor práce musí najskôr **pridať Váš Spotify email do User Management** vo svojom Spotify Developer Dashboarde (Spotify má každú novú aplikáciu v tzv. Development Mode, ktorý povoľuje prístup len 25 manuálne pridaným používateľom). Preto pred spustením aplikácie pošlite autorovi:

- email, ktorý používate na Spotify
- potvrdenie, že máte aktívny Spotify Premium účet

Autor vás pridá do User Management a potom môžete preskočiť rovno na **krok 3 (Konfigurácia `.env`)**, kde do `SPOTIFY_CLIENT_ID` a `SPOTIFY_CLIENT_SECRET` vložíte hodnoty z prílohy.

---

## Inštalácia — krok za krokom

### 1. Klonovanie repozitára

```bash
git clone https://github.com/xkoprdam/Bakalarska-praca
cd Bakalarska-praca
```

### 2. Vytvorenie vlastnej Spotify Developer aplikácie

> Tento krok môžete preskočiť, ak ste člen komisie alebo oponent a máte credentials z prílohy práce (viď sekcia *Pre komisiu a oponenta* vyššie).
>
> **Prečo si treba vytvoriť vlastnú a nestačí použiť cudzie credentials?**
>
> Spotify má od 2025 každú novú aplikáciu v **Development Mode** — môže ju používať maximálne **25 konkrétnych používateľov, ktorých vlastník musí ručne pridať do dashboardu** (cez ich Spotify email). Cudzie credentials by Vás Spotify odmietol, kým by ste neboli explicitne pridaný do zoznamu.
>
> Vytvorenie vlastnej aplikácie trvá ~3 minúty.

1. Choďte na **https://developer.spotify.com/dashboard** a prihláste sa svojím Spotify účtom.
2. Kliknite **Create app** a vyplňte:
   - **App name**: čokoľvek (napr. `RS Local`)
   - **App description**: čokoľvek
   - **Redirect URIs**: `http://127.0.0.1:3000` (kliknite **Add**, aby sa pridalo do zoznamu)
   - **Which API/SDKs**: zaškrtnite **Web API** a **Web Playback SDK**
   - Kliknite **Save**
3. V detaile aplikácie kliknite na záložku **User Management** a pridajte **svoj vlastný Spotify email** (rovnaký, aký používate na Spotify) — bez tohto kroku Vás Spotify v Dev Mode odmietne prihlásiť.
4. V záložke **Basic Information** si poznačte:
   - **Client ID** (zobrazený rovno)
   - **Client secret** (kliknite *"View client secret"*)

   Tieto dve hodnoty budú treba v ďalšom kroku.

### 3. Konfigurácia `.env`

V termináli (z koreňa projektu):

```bash
# macOS / Linux:
cp server/.env.example server/.env

# Windows PowerShell:
copy server\.env.example server\.env
```

Otvorte `server/.env` v textovom editore a vyplňte:

```env
# --- Databáza ---
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=rs
DB_USER=rs_user
DB_PASSWORD=zvolte_si_silne_heslo

# --- Spotify ---
SPOTIFY_CLIENT_ID=<vložte Client ID z Dashboardu (alebo z prílohy práce)>
SPOTIFY_CLIENT_SECRET=<vložte Client Secret z Dashboardu (alebo z prílohy práce)>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000
```

> `DB_PASSWORD` si zvoľte vlastné — Docker s ním vytvorí MySQL používateľa. Akékoľvek silné heslo.
>
> `SPOTIFY_REDIRECT_URI` **nemeňte** — musí sa zhodovať s tým, čo je zadané v Spotify Dashboarde.

### 4. Spustenie databázy

Uistite sa, že **Docker Desktop beží** (ikonka v system tray). Z koreňa projektu:

```bash
docker compose --env-file server/.env up -d
```

> **Prečo flag `--env-file`?** Docker Compose hľadá `.env` v rovnakej zložke ako `docker-compose.yml` (root), ale naše konfigurácie sú v `server/.env`. Týmto flagom ho tam nasmerujeme.

Pri **prvom** spustení Docker:
- stiahne `mysql:8.0` image (~500 MB, raz)
- vytvorí kontajner `rs-mysql`
- spustí inicializačné skripty z `db/init/`:
  - `01-schema.sql` — vytvorí 16 prázdnych tabuliek
  - `02-seed.sql` — naplní 7 tabuliek vzorovými dátami (playlisty, skladby, interpreti, žánre — celkovo ~1.9 MB seed dát z reálnych Spotify playlistov)

Po asi 30 sekundách overte, že beží:

```bash
docker compose ps
```

Mali by ste vidieť riadok s `rs-mysql` a stavom `Up (healthy)`.

### 5. Inštalácia JavaScript závislostí

```bash
cd server
npm ci
cd ../client
npm ci
cd ..
```

> `npm ci` (namiesto `npm install`) nainštaluje **presne** tie verzie, ktoré sú v `package-lock.json` — zaručuje rovnaké prostredie ako u autora.

### 6. Spustenie aplikácie

Potrebujete **dva terminály bežiace paralelne**.

**Terminál 1 — backend:**
```bash
cd server
npm run devStart
```
Mali by ste vidieť: `Server running on http://localhost:3001`

**Terminál 2 — frontend:**
```bash
cd client
npm run dev
```
Mali by ste vidieť: `➜  Local: http://127.0.0.1:3000/`

### 7. Otvorenie aplikácie

V **Chrome** alebo **Edge** otvorte:

```
http://127.0.0.1:3000
```

> **Nepoužívajte `localhost:3000`** — Spotify OAuth presmeruje na `127.0.0.1` a inak by login nefungoval. Tieto dva hostnamy sú technicky rozdielne adresy.

Kliknite **Login with Spotify**, schváľte prístup a po presmerovaní by ste mali vidieť hlavnú obrazovku. V sekcii **Recommendations** kliknite **Get Recommendations** — server vygeneruje tri zoznamy odporúčaní cez tri rôzne algoritmy.

---

## Zastavenie aplikácie

- **Frontend a backend**: `Ctrl+C` v príslušnom termináli
- **Databáza** (zachová dáta):
  ```bash
  docker compose --env-file server/.env stop
  ```
- **Databáza + úplné vymazanie dát** (znovu spustí init skripty pri ďalšom `up`):
  ```bash
  docker compose --env-file server/.env down
  rm -rf db/data            # macOS / Linux
  rmdir /s db\data          # Windows
  ```

---

## Časté problémy

| Príznak | Riešenie |
|---|---|
| `Cannot find module 'dotenv'` | `cd server && npm ci` |
| `ECONNREFUSED 127.0.0.1:3306` z backendu | Docker Desktop nebeží, alebo MySQL kontajner nie je spustený. Skontrolujte `docker compose ps`. |
| `redirect_uri: Insecure` pri Spotify login | Redirect URI v Spotify Dashboarde musí byť presne `http://127.0.0.1:3000` (nie `localhost`, nie HTTPS). |
| `invalid_client` po prihlásení | `SPOTIFY_CLIENT_ID` alebo `SPOTIFY_CLIENT_SECRET` v `.env` nesedia s tými v Spotify Dashboarde. Skontrolujte, že v `.env` nie sú medzery alebo úvodzovky okolo hodnôt. |
| `Failed to initialize player` v konzole prehliadača | Používate nepodporovaný prehliadač (Firefox / Brave / ungoogled-chromium). Prepnite na Chrome alebo Edge. |
| Hudba sa zastaví po ~10 sekundách | (a) účet nie je Premium, alebo (b) zastaralý Widevine CDM — pozrite `chrome://components` a aktualizujte. |
| Vite hodí `ERR_CONNECTION_REFUSED` na `127.0.0.1:3000` | Vite musí počúvať na `127.0.0.1`. Skontrolujte `client/vite.config.js`, kde má byť `server.host: '127.0.0.1'`. |

Detailnejšie poznámky k týmto a ďalším problémom sú v [diagramy/TROUBLESHOOTING.md](./diagramy/TROUBLESHOOTING.md).

---

## Štruktúra repozitára

```
.
├── client/                  React frontend (Vite)
│   ├── src/                 React komponenty
│   └── vite.config.js       Konfigurácia dev servera
├── server/                  Express backend
│   ├── recommender/         Tri odporúčacie algoritmy (implicit/explicit/hybrid)
│   ├── server.js            HTTP endpointy
│   ├── initPlaylists.js     Historický skript (netreba spúšťať — dáta sú v db/init/)
│   └── .env.example         Šablóna konfigurácie
├── db/init/                 SQL skripty automaticky importované pri prvom štarte MySQL
│   ├── 01-schema.sql        Vytvorenie tabuliek
│   └── 02-seed.sql          Vzorové dáta (~1.9 MB)
├── docker-compose.yml       Definícia MySQL kontajnera
├── diagramy/                UML diagramy + TROUBLESHOOTING.md
└── latex/                   Text bakalárskej práce
```

---

## Ďalšia dokumentácia

| Súbor | Obsah |
|---|---|
| [diagramy/TROUBLESHOOTING.md](./diagramy/TROUBLESHOOTING.md) | Detailný rozbor problémov, na ktoré sme narazili pri vývoji (Spotify OAuth zmeny 2025, Widevine DRM, Vite hosting, ...) |
| `latex/thesis.pdf` | Text bakalárskej práce |
