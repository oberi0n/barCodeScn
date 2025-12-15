# Barcode Scanner (iOS)

A minimal SwiftUI barcode/QR scanner that uses `AVFoundation` for live capture and `AVCaptureMetadataOutput` to read common symbologies. The project is kept lightweight so you can drop it into a new Xcode project or playground and start scanning quickly.

## Project layout
- `BarcodeScanner/BarcodeScannerApp.swift`: App entry point that injects a shared capture session controller.
- `BarcodeScanner/ContentView.swift`: SwiftUI view hierarchy with the camera preview, status messaging, and controls to start/stop scanning.
- `BarcodeScanner/CaptureSessionController.swift`: Manages permissions, configures `AVCaptureSession`, and receives metadata delegate callbacks.
- `BarcodeScanner/ScannerView.swift`: `UIViewRepresentable` wrapper that renders the session via `AVCaptureVideoPreviewLayer`.
- `BarcodeScanner/Info.plist`: Includes a camera usage description so the permission prompt is meaningful.
- `BarcodeScanner/Assets.xcassets`: Placeholder asset catalog with an empty app icon set.

## How to run
1. Open Xcode 15 or later and create a new **App** project named `BarcodeScanner` using SwiftUI and Swift.
2. Replace the auto-generated SwiftUI files with the ones in the `BarcodeScanner/` directory. Keep the `Info.plist` camera usage description.
3. Add the `Assets.xcassets` and `Preview Content` folders to the Xcode project if you want the full structure.
4. Build and run on a physical iOS device (the simulator cannot access a real camera). Grant camera permission when prompted and tap **Start scanning**.

## Notes
- Supported codes include QR, EAN-8/13, PDF417, Code 128/39, Aztec, and Data Matrix.
- The scanning session runs only when you tap **Start scanning**; use **Stop session** to pause camera input and **Clear result** to reset the last scanned value.
