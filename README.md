# Barcode Scanner (Web PWA)

This repository hosts a two-tab progressive web app (PWA) that scans barcodes/QR codes, sends payloads to a secured webhook with optional headers, and keeps a same-day history.

## Features
- ZXing-powered camera scanning with permission handling.
- Daily history scoped to the current day (older entries are auto-pruned).
- Configurable webhook (URL, verb, custom headers) stored locally; secure headers stay on-device except when calling your webhook.
- Installable PWA with offline shell via service worker.

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

### Notes
- Scan history and webhook settings stay on-device in `localStorage`.
- For GET webhooks, only headers are sent to avoid leaking data in query strings.
- Ensure the browser is granted camera permissions when scanning.
