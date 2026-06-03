# Hudobná odporúčacia webová aplikácia

Bakalárska práca — hudobný odporúčací systém integrovaný so Spotify.

## Architektúra

- **Frontend** — React 19 + Vite + Tailwind 4 (`client/`)
- **Backend** — Express 5 + TensorFlow.js (`server/`)
- **Databáza** — MySQL 8 (Docker)
- **Externé API** — Spotify Web API + Web Playback SDK

## Rýchly štart

```bash
git clone <URL>
cd Bakalarska-praca
cp server/.env.example server/.env       # potom .env vyplň
docker compose up -d                     # databáza
(cd server && npm ci && npm run devStart) &
(cd client && npm ci && npm run dev)
```

Otvor v Chrome: **http://127.0.0.1:3000**

Podrobný návod (vrátane Spotify Developer Dashboard setupu) je v [SETUP.md](./SETUP.md).

## Dokumentácia

| Súbor | Obsah |
|---|---|
| [SETUP.md](./SETUP.md) | Kompletný inštalačný manuál pre Windows/Mac/Linux |
| [diagramy/TROUBLESHOOTING.md](./diagramy/TROUBLESHOOTING.md) | Časté problémy a riešenia |
| `latex/` | Text bakalárskej práce |

## Požiadavky

- Node.js 20+
- Docker Desktop
- Chrome alebo Edge (Web Playback SDK potrebuje Widevine DRM)
- **Spotify Premium účet** — bez Premium SDK nehrá hudbu
- **Vlastná Spotify Developer aplikácia** ([vytvorenie v 3 minútach](https://developer.spotify.com/dashboard)) — kvôli Spotify Dev Mode obmedzeniu nemôžu používatelia zdieľať jedny credentials, každý si musí vytvoriť svoju. Postup je v [SETUP.md](./SETUP.md#3-vytvorenie-vlastnej-spotify-aplikácie).

## Štruktúra repozitára

```
.
├── client/              React frontend (Vite)
├── server/              Express backend
│   ├── recommender/     Odporúčacie algoritmy
│   ├── server.js        Hlavný entry point
│   └── .env.example     Šablóna konfigurácie
├── db/init/             SQL skripty pre prvotnú inicializáciu MySQL
├── docker-compose.yml   Definícia MySQL kontajnera
├── SETUP.md             Inštalačný manuál
└── TROUBLESHOOTING.md   Riešenie problémov
```
