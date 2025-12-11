# Barcode Scanner (iOS + Web PWA)

This repository hosts both the original two-screen SwiftUI mobile app and a matching progressive web app (PWA). Each version scans barcodes/QR codes, sends payloads to a secured webhook with optional headers, and keeps a same-day history.

## iOS app (SwiftUI)
- **Location:** `Sources/BarcodeScnApp/`
- **Screens:**
  - **Scan:** Start the camera scanner, send to webhook, and see today\'s history with delivery status.
  - **Settings:** Configure webhook URL/verb/headers and persist values locally.
- **Build & run:** Open the package in Xcode (15+) and run on an iPhone target with camera access.

## Web PWA
- **Location:** `src/`, `public/`, and root build files.
- **Features:**
  - ZXing-powered camera scanning with permission handling.
  - Daily history scoped to the current day (older entries are auto-pruned).
  - Configurable webhook (URL, verb, custom headers) stored locally; secure headers stay on-device except when calling your webhook.
  - Installable PWA with offline shell via service worker.
- **Project structure:**
  - `src/App.tsx` – two-tab UI for scanning/history and settings.
  - `src/components/Scanner.tsx` – camera viewfinder and ZXing reader controls.
  - `src/lib/webhook.ts` – webhook delivery with headers and method selection.
  - `src/hooks/usePersistentState.ts` – localStorage-backed state helper for config/history.
  - `public/` – manifest, service worker, and icons for PWA installation.

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
