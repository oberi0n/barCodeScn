import SwiftUI

@main
struct BarcodeScannerApp: App {
    @StateObject private var sessionController = CaptureSessionController()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(sessionController)
        }
    }
}
