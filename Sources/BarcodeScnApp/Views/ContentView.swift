import SwiftUI

struct ContentView: View {
    @EnvironmentObject private var historyStore: ScanHistoryStore
    @EnvironmentObject private var webhookConfigStore: WebhookConfigStore
    @State private var isPresentingScanner = false
    @State private var alertMessage: String?
    private let webhookClient = WebhookClient()

    var body: some View {
        TabView {
            historyTab
                .tabItem { Label("Scan", systemImage: "barcode.viewfinder") }

            SettingsView()
                .tabItem { Label("Settings", systemImage: "gear") }
        }
        .alert(item: $alertMessage) { message in
            Alert(title: Text("Webhook"), message: Text(message), dismissButton: .default(Text("OK")))
        }
        .sheet(isPresented: $isPresentingScanner) {
            ScannerView { value in
                handleScan(value)
            } onDismiss: {
                isPresentingScanner = false
            }
        }
    }

    private var historyTab: some View {
        NavigationView {
            VStack(spacing: 16) {
                Button {
                    isPresentingScanner = true
                } label: {
                    Label("Start Scan", systemImage: "camera.viewfinder")
                        .frame(maxWidth: .infinity)
                        .padding()
                        .background(Color.accentColor)
                        .foregroundColor(.white)
                        .cornerRadius(12)
                }
                .padding(.horizontal)

                List(historyStore.todayRecords()) { record in
                    VStack(alignment: .leading, spacing: 6) {
                        Text(record.payload)
                            .font(.headline)
                        Text(record.date.formatted(date: .omitted, time: .shortened))
                            .font(.caption)
                            .foregroundColor(.secondary)
                    }
                }
                .listStyle(.insetGrouped)
            }
            .navigationTitle("Today")
        }
    }

    private func handleScan(_ value: String) {
        historyStore.add(payload: value)
        Task {
            do {
                guard !webhookConfigStore.config.url.isEmpty else { return }
                let record = ScanRecord(payload: value, date: Date())
                try await webhookClient.send(record: record, config: webhookConfigStore.config)
                alertMessage = "Webhook sent successfully."
            } catch {
                alertMessage = error.localizedDescription
            }
        }
    }
}

private extension String: Identifiable {
    public var id: String { self }
}

struct ContentView_Previews: PreviewProvider {
    static var previews: some View {
        ContentView()
            .environmentObject(ScanHistoryStore())
            .environmentObject(WebhookConfigStore())
    }
}
