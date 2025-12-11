# Barcode Scanner with Webhook (iOS)

A two-screen SwiftUI iOS app that scans barcodes, shows the current day's history, and pushes each scan to a configurable webhook with custom headers.

## Features
- One-tap barcode/QR scan via AVFoundation.
- Daily scan history list with timestamps.
- Webhook configuration (URL, HTTP verb, custom headers) saved locally.
- Secure header handling for secrets such as API keys or tokens.

## Structure
- `Sources/BarcodeScnApp/BarcodeScnApp.swift` – App entry point.
- `Models/` – Scan history and webhook configuration models.
- `Services/` – Webhook client for sending scan payloads.
- `Views/` – SwiftUI screens for scanning/history and settings.

## Running
Open the folder in Xcode 15+ as a SwiftUI iOS app and run on device or simulator with camera access enabled.
