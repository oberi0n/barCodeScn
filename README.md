# Barcode Scanner (Web PWA)

This repository hosts a two-tab progressive web app (PWA) that scans barcodes/QR codes, routes payloads to one of two secured webhooks, and keeps a same-day history. The UI follows the clean, light aesthetic of labo.lu. Current version: **0.3.5**.

## Features
- ZXing-powered camera scanning with permission handling.
- Daily history scoped to the current day (older entries are auto-pruned).
- Two independently configurable webhooks (URL, verb and custom headers). A comma-separated list of ZXing formats is routed to webhook 1; every other format is routed to webhook 2. Built-in test actions verify both endpoints.
- Mobile-first responsive layout tuned for phones, plus installable PWA with offline shell via service worker.

## Changelog

### 0.3.5
- Added an on-device debug panel for the complete scan, geolocation, and webhook workflow.
- Added independent API and network tests with detailed results.
- Made location acquisition and webhook delivery states explicit and observable.

### 0.3.4
- Fixed scan webhook payloads to include the barcode and real geolocation coordinates required by the backend.
- Added visible and console diagnostics for webhook attempts, responses, and failures.
- Refreshed the service-worker cache so updated bundles reach installed PWAs.

### 0.3.3
- Added geolocation metadata to successful barcode scans.
- Added graceful handling for unavailable or denied location access.

### 0.3.2
- Improved barcode detection reliability on iOS/WebKit.
- Added explicit visual feedback after barcode detection.
- Added webhook delivery status feedback.
- Added optional scan confirmation sound/haptic feedback.

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
docker compose up -d --build
```

The `barscan` service remains directly available on `http://localhost:8080` (or
`http://192.168.1.186:8080` on the LAN). The container exposes `/healthz` for
orchestrator health checks.

## Local HTTPS / iPhone camera access

The development Compose stack places an nginx reverse proxy in front of the
`barscan` service. nginx accepts TLS on the Windows host's port 443, then forwards
HTTP to `barscan:8080` over the internal Compose network. Generated certificates
stay exclusively in the ignored local `certs/` directory.

```text
iPhone
   |
   | HTTPS :443
   v
Nginx Docker (https-proxy)
   |
   | HTTP, internal Docker network
   v
Barscan (barscan:8080)
```

### Windows setup

1. Install [mkcert](https://github.com/FiloSottile/mkcert) if necessary and make
   sure `mkcert.exe` is in `PATH`. For example, use `winget install
   FiloSottile.mkcert` or `choco install mkcert`.
2. Create and trust the local development CA on the PC:
   ```powershell
   mkcert -install
   ```
3. From the repository root, generate the local certificate. The script creates
   `certs/barscan.pem` and `certs/barscan-key.pem` for `192.168.1.186`,
   `localhost`, and `127.0.0.1`, verifies that the LAN IP is present in the
   certificate Subject Alternative Names, and prints the result of `mkcert
   -CAROOT`:
   ```powershell
   .\scripts\setup-local-https.ps1
   ```
4. Start or recreate both containers:
   ```powershell
   docker compose up -d --build
   ```
5. Open `https://192.168.1.186` on the iPhone. The existing HTTP URL
   `http://192.168.1.186:8080` remains available for development, although camera
   APIs require a secure context when accessed from another device.

If Docker reports that port 443 is already allocated, find and stop the service
using it, or expose the proxy on port 8443 instead:

```powershell
$env:HTTPS_PORT=8443
docker compose up -d --build
```

Then use `https://192.168.1.186:8443`. The setup script also warns when it can
detect a process already listening on port 443.

### Trust the mkcert CA on iPhone

1. Run `mkcert -CAROOT` on the PC and retrieve **only** `rootCA.pem` from the
   displayed directory. Transfer that public CA certificate to the iPhone. Never
   transfer, install, or share `rootCA-key.pem`.
2. Open `rootCA.pem` on the iPhone and install the downloaded profile. If needed,
   find it under **Settings → General → VPN & Device Management**.
3. Go to **Settings → General → About → Certificate Trust Settings** and activate
   **Enable Full Trust for Root Certificates** for the CA created by mkcert.
4. Fully close and relaunch Chrome, browse to `https://192.168.1.186`, and accept
   **Camera** access when Chrome/iOS requests it.

Do not commit anything from `certs/`, `rootCA.pem`, `rootCA-key.pem`, or any private
key. Do not disable TLS validation: iOS must explicitly trust the mkcert root CA.

### Local backend through the HTTPS proxy

When the Barscan backend runs separately on the Windows host at
`http://192.168.1.186:8000`, an HTTPS page must not call that HTTP URL directly:
the browser would block it as mixed content. The existing `https-proxy` therefore
provides same-origin routes and reaches the host through Docker Desktop's
`host.docker.internal` hostname:

```text
iPhone / Android
        |
        | HTTPS
        v
https://192.168.1.186
        |
        v
nginx https-proxy
        |
        | /api/scan
        v
http://host.docker.internal:8000/scan
        |
        v
Barscan Backend
```

Start the backend from its own repository/Compose stack and ensure that it is
published on the Windows host's port `8000`. This repository does not start or
modify that backend. The proxy exposes these exact mappings:

| Browser URL | Backend target |
| --- | --- |
| `/api/scan` | `http://host.docker.internal:8000/scan` |
| `/api/healthz` | `http://host.docker.internal:8000/healthz` |

In the PWA webhook settings, prefer the same-origin relative URL `/api/scan`.
The current settings field and `fetch` implementation accept relative URLs. The
absolute URL `https://192.168.1.186/api/scan` is also valid. Do not configure the
PWA with `http://192.168.1.186:8000/scan`, because that reintroduces mixed content.

The proxy preserves standard nginx access/error logs and forwards upstream
failures as-is. If the backend is stopped or unreachable, the API route returns
HTTP `502`; it is never replaced with a synthetic success response.

After both stacks are running, validate the backend through TLS from PowerShell:

```powershell
Invoke-RestMethod `
    -Uri "https://192.168.1.186/api/healthz" `
    -Method Get

$body = @{
    barcode = "TEST123"
    latitude = 49.123456
    longitude = 6.123456
    accuracy = 10
} | ConvertTo-Json

Invoke-RestMethod `
    -Uri "https://192.168.1.186/api/scan" `
    -Method Post `
    -ContentType "application/json" `
    -Body $body
```

The health response should be `{ "status": "ok" }`. After the POST test, verify
that the backend has appended a line to its own `data/scans.log`.

### Notes
- Scan history and both webhook settings stay on-device in `localStorage`.
- For GET webhooks, only headers are sent to avoid leaking data in query strings.
- Add a pause (in milliseconds) between scans from **Settings** via the slider to prevent duplicate webhook bursts.
- The scanning view locks to the viewport while active and auto-scrolls into place when starting the camera so controls and history stay visible on phones without page scrolling.
- Ensure the browser is granted camera permissions when scanning.
- Camera access requires a secure context (HTTPS or `localhost`). Opening the app over plain HTTP will block the camera in mobile
  browsers; use `npm run dev -- --host` for LAN testing or deploy behind HTTPS.
