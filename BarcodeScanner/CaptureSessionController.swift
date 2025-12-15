import AVFoundation
import SwiftUI

final class CaptureSessionController: NSObject, ObservableObject {
    @Published var lastScannedCode: String?
    @Published var permissionStatus: AVAuthorizationStatus
    @Published var isRunning = false

    let session: AVCaptureSession
    private let metadataQueue = DispatchQueue(label: "scan.metadata.queue")

    var hasCameraAccess: Bool {
        permissionStatus == .authorized
    }

    var statusMessage: String {
        switch permissionStatus {
        case .notDetermined:
            return "Requesting camera access…"
        case .restricted, .denied:
            return "Camera access is required to scan codes."
        case .authorized:
            return isRunning ? "Point the camera at a barcode or QR code." : "Tap start to begin scanning."
        @unknown default:
            return "Unknown permission state."
        }
    }

    init(previewMode: Bool = false) {
        self.permissionStatus = AVCaptureDevice.authorizationStatus(for: .video)
        self.session = AVCaptureSession()
        super.init()

        configureSession(previewMode: previewMode)
    }

    func requestCameraAccessIfNeeded() async {
        guard permissionStatus == .notDetermined else { return }
        let granted = await AVCaptureDevice.requestAccess(for: .video)

        await MainActor.run {
            self.permissionStatus = granted ? .authorized : .denied
        }
    }

    @MainActor
    func startSession() async {
        guard hasCameraAccess else { return }
        guard !isRunning else { return }

        session.startRunning()
        isRunning = true
    }

    @MainActor
    func stopSession() {
        guard isRunning else { return }

        session.stopRunning()
        isRunning = false
    }

    func clearResult() {
        lastScannedCode = nil
    }
}

private extension CaptureSessionController {
    func configureSession(previewMode: Bool) {
        session.beginConfiguration()

        defer {
            session.commitConfiguration()
        }

        guard let videoDevice = AVCaptureDevice.default(.builtInWideAngleCamera, for: .video, position: .back) else {
            return
        }

        guard
            let videoInput = try? AVCaptureDeviceInput(device: videoDevice),
            session.canAddInput(videoInput)
        else {
            return
        }

        session.addInput(videoInput)

        let metadataOutput = AVCaptureMetadataOutput()

        guard session.canAddOutput(metadataOutput) else { return }

        session.addOutput(metadataOutput)

        metadataOutput.setMetadataObjectsDelegate(self, queue: metadataQueue)
        metadataOutput.metadataObjectTypes = [
            .qr,
            .ean8,
            .ean13,
            .pdf417,
            .code128,
            .code39,
            .aztec,
            .dataMatrix
        ]

        if previewMode {
            return
        }

        if let connection = metadataOutput.connection(with: .metadata) {
            connection.preferredVideoStabilizationMode = .standard
        }
    }
}

extension CaptureSessionController: AVCaptureMetadataOutputObjectsDelegate {
    func metadataOutput(
        _ output: AVCaptureMetadataOutput,
        didOutput metadataObjects: [AVMetadataObject],
        from connection: AVCaptureConnection
    ) {
        guard let first = metadataObjects.first as? AVMetadataMachineReadableCodeObject else { return }
        guard let stringValue = first.stringValue else { return }

        DispatchQueue.main.async { [weak self] in
            self?.lastScannedCode = stringValue
            self?.isRunning = self?.session.isRunning ?? false
        }
    }
}
