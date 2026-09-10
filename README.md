# Barcode Scanner (Web PWA)

This repository hosts a two-tab progressive web app (PWA) that scans barcodes/QR codes, routes payloads to one of two secured webhooks, and keeps a same-day history. The UI follows the clean, light aesthetic of labo.lu. Current version: **0.3.1**.

## Features
- ZXing-powered camera scanning with permission handling.
- Daily history scoped to the current day (older entries are auto-pruned).
- Two independently configurable webhooks (URL, verb and custom headers). A comma-separated list of ZXing formats is routed to webhook 1; every other format is routed to webhook 2. Built-in test actions verify both endpoints.
- Mobile-first responsive layout tuned for phones, plus installable PWA with offline shell via service worker.

## Project structure
- `src/App.tsx` – two-tab UI for scanning/history and settings.
- `src/components/Scanner.tsx` – camera viewfinder and ZXing reader controls.
- `src/lib/webhook.ts` – webhook delivery with headers and method selection.
- `src/hooks/usePersistentState.ts` – localStorage-backed state helper for config/history.
- `public/` – manifest and service worker for PWA installation.

### Running the PWA locally
```bash
npm install
npm run dev
```
The dev server prints a URL you can open on mobile (or via `npm run dev -- --host` for LAN access).

### Building the PWA for production
```bash
npm run build
npm run preview
```

### Running with Docker
```bash
docker build -t barcode-scanner .
docker run --rm -p 8080:8080 barcode-scanner
```

Open `http://localhost:8080`. Camera access outside localhost requires putting the
container behind an HTTPS reverse proxy. The container exposes `/healthz` for
orchestrator health checks.

### Notes
- Scan history and both webhook settings stay on-device in `localStorage`.
- For GET webhooks, only headers are sent to avoid leaking data in query strings.
- Add a pause (in milliseconds) between scans from **Settings** via the slider to prevent duplicate webhook bursts.
- The scanning view locks to the viewport while active and auto-scrolls into place when starting the camera so controls and history stay visible on phones without page scrolling.
- Ensure the browser is granted camera permissions when scanning.
- Camera access requires a secure context (HTTPS or `localhost`). Opening the app over plain HTTP will block the camera in mobile
  browsers; use `npm run dev -- --host` for LAN testing or deploy behind HTTPS.
