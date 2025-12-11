import SwiftUI

@main
struct BarcodeScnApp: App {
    @StateObject private var historyStore = ScanHistoryStore()
    @StateObject private var webhookConfigStore = WebhookConfigStore()

    var body: some Scene {
        WindowGroup {
            ContentView()
                .environmentObject(historyStore)
                .environmentObject(webhookConfigStore)
        }
    }
}
