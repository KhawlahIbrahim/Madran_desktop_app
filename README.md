# MADRAN Control — SINMAR Leader Control Application

Desktop app (Electron + React) for the Chief/Team Leader. This is the **only**
application in the MADRAN system — firefighters never use a screen; they
interact through two physical buttons and a helmet display, which this app
does not render (see `SIN-PD-KH-01` and `MADRAN_MVP_Requirements_v2.md`).

## What's actually implemented here

- **Local-first storage (SQLite)** — mirrors the four local stores from your
  class diagram (`SIN-PD-KH-02`) and data flow diagram (`SIN-PD-KH-07`):
  Mission, Team/Device, Vitals & Location History, Alerts & Device Requests.
  This is the real source of truth, per your architecture doc — the app works
  fully with no internet connection at any point during a mission.
- **A mesh simulator** (`electron/mesh-simulator.js`) standing in for the real
  Location Node / UWB+BLE-Mesh+LoRa hardware, so you can run and demo the app
  today. It's isolated behind one small interface — swapping in real hardware
  later means replacing this one file, not touching the UI or database.
- **Opportunistic Firebase sync** (`electron/sync.js`) — implements "6.0 Sync
  to Cloud" from your data flow diagram. It runs on a timer, checks for an
  actual internet connection, and batches pending records up using the
  provisional collection structure from `SIN-PD-KH-09`. It never blocks the UI
  and mission data is never lost if it's offline.
- **Screens**: Login (Chief-only), Missions list, 3-step Create Mission,
  Live Monitoring (team vitals, simplified 2D map, SOS pop-up), Alerts feed
  (Alert vs DeviceRequest visually distinct, matching `SIN-PD-KH-02`), Team
  Roster, End Mission summary.

## What is NOT implemented (needs real hardware/decisions first)

- **Real mesh transport.** There's no UWB/BLE-Mesh/LoRa integration — that
  needs actual firmware and a Location Node to talk to. The simulator emits
  the same event shapes the real thing would, so the app-side code shouldn't
  need to change much once hardware exists.
- **Real indoor coordinates.** Every x/y/floor field is a placeholder, exactly
  as flagged in `SIN-PD-KH-09` — this is blocked on NE-14's MLP v1.0 sign-off.
  Don't treat the map or exit-path coordinates as final.
- **Firebase Auth account creation UI.** The app supports signing in with an
  existing Firebase Auth user. Creating new Leader accounts (Firebase Console,
  or a small admin script) is outside this app's scope for now.

## Running it

```bash
npm install
npm run dev:electron
```

This starts the Vite dev server and opens the Electron window pointed at it.
The app works immediately with **no Firebase setup** — it just runs fully
local/offline, which is honestly the correct default for this product.

To build a distributable:

```bash
npm run build:electron
```

## Setting up Firebase (optional, for cloud sync)

1. Go to console.firebase.google.com and create a project.
2. Enable **Authentication → Email/Password** (or another sign-in method — the
   app only has one role, so anything Firebase Auth supports works).
3. Enable **Firestore Database** (production mode).
4. In Firestore, paste the rules from `firestore.rules` at the project root —
   these restrict each Leader to their own missions only, per `SIN-PD-KH-09`.
5. In Project Settings → General → Your apps, add a **Web app** and copy the
   config object it gives you.
6. Copy `electron/firebase-config.example.json` to `electron/firebase-config.json`
   and paste your real values in. This file is gitignored — don't commit it.
7. Create at least one Leader user under Authentication → Users (or build a
   sign-up flow later if you want Leaders to self-register).
8. Restart the app. The sidebar's sync indicator will show "Synced with
   Firebase" once a mission has ended and pushed data up.

If you skip all of this, the app still works — missions just stay local to
this tablet, which matches the offline-first requirement in your MVP doc
anyway. Add Firebase whenever you're ready.

## Known open dependency

Per `SIN-PD-KH-09`, every location-bearing field (`buildingMap`,
`finalLocation`, alert `location`, `deviceRequest.response.exitPath`) is a
structural placeholder pending sign-off on NE-14's MADRAN Location Packet
(MLP) v1.0. That's the one thing blocking this from being schema-final.
