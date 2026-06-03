# Inštalačný manuál (Windows)

Lokálna inštalácia hudobnej odporúčacej webovej aplikácie. Aplikácia má tri časti:
- **Frontend** (React + Vite) — `http://127.0.0.1:3000`
- **Backend** (Express) — `http://127.0.0.1:3001`
- **MySQL databáza** — beží v Docker kontajneri na porte `3306`

---

## 1. Prerekvizity

Nainštaluj v tomto poradí:

| Nástroj | Verzia | Odkaz |
|---|---|---|
| **Node.js** | 20 LTS alebo vyššia | https://nodejs.org/ |
| **Git** | hocijaká nová | https://git-scm.com/download/win |
| **Docker Desktop** | lastest | https://www.docker.com/products/docker-desktop |
| **Google Chrome** | lastest | https://www.google.com/chrome/ |

> **Pozn.:** Docker Desktop pri prvom spustení od teba bude pýtať aktiváciu **WSL2** (Windows Subsystem for Linux 2). Súhlas, je to nutné. Reštartuj počítač keď to vyžaduje.

> **Pozn.:** Web Playback SDK od Spotify funguje len v prehliadačoch s **Widevine DRM** — preto Chrome. Edge tiež funguje. Firefox a Brave **nie**. Aplikácia nefunguje v Inkognito režime.

Tiež budeš potrebovať:
- **Spotify Premium účet** — Web Playback SDK nepodporuje Free účty.
- **Spotify Developer účet** (zdarma) — na vytvorenie OAuth aplikácie.

---

## 2. Klonovanie repa

Otvor PowerShell a spusti:

```powershell
cd C:\Users\<tvoje_meno>\Documents
git clone <URL_REPA>
cd Bakalarska-praca
```

---

## 3. Vytvorenie vlastnej Spotify aplikácie

Aby si mohol komunikovať so Spotify API, musíš si **vytvoriť vlastnú Spotify Developer aplikáciu**. Z nej získaš dva údaje:

- **`SPOTIFY_CLIENT_ID`** — verejný identifikátor aplikácie (môže byť v zdrojovom kóde)
- **`SPOTIFY_CLIENT_SECRET`** — tajný kľúč, niečo ako heslo aplikácie (nikdy nepublikovať)

> **Prečo si musíš vytvoriť vlastnú a nemôžeš použiť cudzie credentials?**
>
> Spotify má od 2025 každú novú aplikáciu v **Development Mode** — môže ju použiť maximálne **25 konkrétnych používateľov**, ktorých vlastník aplikácie musí ručne pridať do zoznamu (cez ich Spotify email). Takže keby si použil credentials od niekoho iného, Spotify by ťa odmietol prihlásiť, kým by ťa autor explicitne nepridal.
>
> Riešenie je jednoduché — vytvoríš si vlastnú aplikáciu (trvá to ~3 minúty) a budeš jej jediným používateľom (sám seba pridáš).

### Krok za krokom

1. Choď na **https://developer.spotify.com/dashboard** a prihlás sa svojím Spotify účtom (Premium nie je potrebný na tento krok, len na samotné prehrávanie hudby v appke).
2. Klikni **Create app**.
3. Vyplň:
   - **App name**: hocijaké (napr. `RS Local`)
   - **App description**: hocijaké (napr. `Bakalarska praca - lokalna instalacia`)
   - **Redirect URIs**: `http://127.0.0.1:3000` (klikni "Add" aby sa pridalo do zoznamu)
   - **Which API/SDKs**: zaškrtni **Web API** a **Web Playback SDK**
4. Klikni **Save**.
5. **Pridaj sám seba ako test používateľa** (aby si mohol appku používať v Dev Mode):
   - V detaile aplikácie klikni **User Management**
   - Klikni **Add new user**
   - Zadaj svoje meno a **rovnaký email**, ktorý máš na Spotify účte
   - Klikni **Add**
6. Na karte **Basic Information** nájdi:
   - **Client ID** — zobrazený rovno
   - **Client secret** — klikni **"View client secret"**

   Tieto dve hodnoty budeš potrebovať v ďalšom kroku.

### Alternatíva pre komisiu bakalárskej práce

Ak túto aplikáciu skúšaš ako člen hodnotiacej komisie, môžeš preskočiť vytváranie vlastnej Spotify aplikácie a použiť credentials priložené k tlačenej verzii práce (v prílohe).

V tom prípade však autor práce musí najskôr **pridať tvoj Spotify email do User Management** v dashboarde svojej aplikácie — bez toho ťa Spotify odmietne prihlásiť (kvôli Development Mode obmedzeniu). Email pre pridanie pošli autorovi vopred.

---

## 4. Konfigurácia `.env`

Skopíruj šablónu:

```powershell
copy server\.env.example server\.env
```

Otvor `server\.env` v textovom editore a vyplň:

```env
DB_HOST=127.0.0.1
DB_PORT=3306
DB_NAME=rs
DB_USER=rs_user
DB_PASSWORD=ZmenMaNaSilneHeslo123

SPOTIFY_CLIENT_ID=<vlož Client ID zo Spotify Dashboard>
SPOTIFY_CLIENT_SECRET=<vlož Client Secret zo Spotify Dashboard>
SPOTIFY_REDIRECT_URI=http://127.0.0.1:3000
```

> **Dôležité:** `DB_PASSWORD` si zvol vlastné — Docker s ním vytvorí MySQL používateľa.

---

## 5. Spustenie databázy

Uisti sa, že **Docker Desktop beží** (ikonka v system tray). Potom z koreňa projektu:

```powershell
docker compose --env-file server\.env up -d
```

> **Prečo flag `--env-file`?** Docker Compose hľadá premenné prostredia v `.env` v rovnakej zložke ako `docker-compose.yml`, ale naše konfigurácie sú v `server\.env`. Týmto flagom ich tam nasmerujeme.

Pri prvom spustení Docker:
- stiahne MySQL 8.0 image (~500 MB),
- vytvorí kontajner `rs-mysql`,
- spustí inicializačné SQL skripty z `db/init/` (vytvoria prázdnu schému).

Over že beží:
```powershell
docker compose ps
```

Mal by si vidieť `rs-mysql` s `STATUS: Up (healthy)`.

> **Reset DB**: ak chceš začať odznova, zastav kontajner `docker compose down`, vymaž zložku `db\data\` a spusti znova.

---

## 6. Inštalácia závislostí

V dvoch oddelených krokoch:

```powershell
cd server
npm ci
cd ..\client
npm ci
cd ..
```

> **`npm ci` vs `npm install`**: `npm ci` nainštaluje presne tie verzie, ktoré sú v `package-lock.json`. To zaručuje že máš identické prostredie ako autor projektu. `npm install` by mohol aktualizovať verzie a niečo rozbiť.

---

## 7. Naplnenie databázy hudbou (seeding)

Databáza je po kroku 5 prázdna — má iba schému (tabuľky), ale žiadne skladby, interpretov ani žánre. Aplikácia by bez nich nemala na čom robiť odporúčania.

Spusti seedovací skript:

```powershell
cd server
node initPlaylists.js
```

Skript:
- prejde cca **30 preddefinovaných Spotify playlistov** (top hity, žánrové výbery — pop, rock, rap, jazz, indie, classical, ...),
- pre každú skladbu si stiahne metadáta zo Spotify API a uloží ju do `tracks`, `artists`, `genres`, `track_artist`, `artist_genre`, `playlists` a `playlist_tracks` tabuliek.

> **Trvanie:** 5-15 minút podľa rýchlosti pripojenia. V konzole vidíš postup — playlist po playliste.

Po dobehnutí over že sú dáta v DB:
```powershell
docker exec rs-mysql mysql -u <DB_USER> -p<DB_PASSWORD> rs -e "SELECT COUNT(*) FROM tracks; SELECT COUNT(*) FROM artists;"
```
Mali by si vidieť stovky až tisíce v oboch.

> **Krok stačí spustiť raz.** Pri ďalšom štarte aplikácie sa preskakuje — dáta zostanú v `db\data\` aj po reštarte počítača.

---

## 8. Spustenie aplikácie

Potrebuješ **dva PowerShell terminály** (oba bežia paralelne).

**Terminál 1 — backend:**
```powershell
cd server
npm run devStart
```
Mal by si vidieť: `Server running on http://localhost:3001`

**Terminál 2 — frontend:**
```powershell
cd client
npm run dev
```
Mal by si vidieť: `Local: http://127.0.0.1:3000/`

---

## 9. Otvorenie aplikácie

V Chrome otvor:
```
http://127.0.0.1:3000
```

> **Nepoužívaj `localhost:3000`** — Spotify OAuth presmeruje na `127.0.0.1`, takže ak otvoríš `localhost`, prihlásenie nebude fungovať.

Klikni **Login with Spotify**, schváľ prístup a po presmerovaní by si mal vidieť hlavnú obrazovku aplikácie.

---

## Zastavenie aplikácie

- **Frontend a backend**: `Ctrl+C` v príslušnom termináli.
- **Databáza**: `docker compose stop` (kontajner zostane, dáta sa zachovajú).
- **Úplné zmazanie databázy**: `docker compose down` + vymazať `db\data\`.

---

## Časté problémy

| Problém | Riešenie |
|---|---|
| `Cannot find module 'dotenv'` | `cd server && npm install` |
| `ECONNREFUSED 127.0.0.1:3306` (z backendu) | Docker Desktop nebeží, alebo kontajner nie je spustený. `docker compose up -d` |
| `redirect_uri: Insecure` pri Spotify login | Redirect URI v Spotify Dashboard musí byť presne `http://127.0.0.1:3000` (nie `localhost`) |
| `Failed to initialize player` v konzole | Používaš Firefox/Brave/ungoogled-chromium. Prepni na **Chrome** alebo **Edge**. |
| Hudba sa zastaví po ~10 sekundách | Účet nie je Premium, alebo zastaralý Widevine. Skontroluj `chrome://components` → Widevine. |
| Frontend hodí `ERR_CONNECTION_REFUSED` pri `http://127.0.0.1:3000` | Vite počúva len na `localhost`. Skontroluj `client/vite.config.js` — musí mať `server.host: '127.0.0.1'`. |

Detailnejšie poznámky k týmto problémom sú v `diagramy/TROUBLESHOOTING.md`.
