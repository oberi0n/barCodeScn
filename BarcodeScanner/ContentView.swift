import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var sessionController: CaptureSessionController

    var body: some View {
        NavigationStack {
            VStack(spacing: 16) {
                ScannerCard()
                SessionControls()
            }
            .padding(20)
            .navigationTitle("Barcode Scanner")
            .toolbarTitleDisplayMode(.inline)
            .background(Color(.systemGroupedBackground))
        }
        .task {
            await sessionController.requestCameraAccessIfNeeded()
        }
    }
}

private struct ScannerCard: View {
    @EnvironmentObject private var sessionController: CaptureSessionController

    var body: some View {
        VStack(alignment: .leading, spacing: 12) {
            ZStack {
                RoundedRectangle(cornerRadius: 16, style: .continuous)
                    .fill(Color(.secondarySystemBackground))
                    .shadow(color: .black.opacity(0.08), radius: 8, x: 0, y: 4)

                ScannerView(session: sessionController.session)
                    .clipShape(RoundedRectangle(cornerRadius: 16, style: .continuous))
                    .overlay(RoundedRectangle(cornerRadius: 16).strokeBorder(Color.accentColor, lineWidth: 1))
                    .overlay(alignment: .center) {
                        Viewfinder()
                            .foregroundStyle(Color.accentColor.opacity(0.6))
                    }
                    .opacity(sessionController.hasCameraAccess ? 1 : 0.4)
                    .overlay(alignment: .center) {
                        if !sessionController.hasCameraAccess {
                            PermissionLabel()
                        }
                    }
                    .frame(height: 260)
            }

            VStack(alignment: .leading, spacing: 4) {
                Text("Last code")
                    .font(.subheadline)
                    .foregroundStyle(.secondary)

                if let value = sessionController.lastScannedCode {
                    Text(value)
                        .font(.headline)
                        .textSelection(.enabled)
                        .transition(.opacity)
                } else {
                    Text("Nothing scanned yet")
                        .font(.headline)
                        .foregroundStyle(.secondary)
                }
            }
            .animation(.easeInOut, value: sessionController.lastScannedCode)
        }
    }
}

private struct SessionControls: View {
    @EnvironmentObject private var sessionController: CaptureSessionController

    var body: some View {
        VStack(spacing: 12) {
            Text(sessionController.statusMessage)
                .font(.footnote)
                .foregroundStyle(.secondary)
                .frame(maxWidth: .infinity, alignment: .leading)

            HStack(spacing: 12) {
                Button(sessionController.isRunning ? "Stop session" : "Start scanning") {
                    Task { await toggleSession() }
                }
                .buttonStyle(.borderedProminent)
                .disabled(!sessionController.hasCameraAccess)

                Button("Clear result") {
                    sessionController.clearResult()
                }
                .buttonStyle(.bordered)
                .disabled(sessionController.lastScannedCode == nil)
            }
        }
    }

    private func toggleSession() async {
        if sessionController.isRunning {
            sessionController.stopSession()
        } else {
            await sessionController.startSession()
        }
    }
}

private struct Viewfinder: View {
    var body: some View {
        GeometryReader { proxy in
            let lineWidth: CGFloat = 3
            let dash: CGFloat = 12
            let inset = min(proxy.size.width, proxy.size.height) * 0.18

            RoundedRectangle(cornerRadius: 22, style: .continuous)
                .strokeBorder(style: StrokeStyle(lineWidth: lineWidth, dash: [dash, dash]))
                .padding(inset)
        }
    }
}

private struct PermissionLabel: View {
    var body: some View {
        Label {
            VStack(alignment: .leading, spacing: 4) {
                Text("Camera access is needed to scan codes.")
                    .font(.subheadline)
                Text("Enable the camera in Settings and try again.")
                    .font(.footnote)
            }
            .multilineTextAlignment(.center)
        } icon: {
            Image(systemName: "camera.on.rectangle")
                .font(.title)
        }
        .padding()
    }
}

#Preview {
    ContentView()
        .environmentObject(CaptureSessionController(previewMode: true))
}
