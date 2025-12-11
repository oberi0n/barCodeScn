import SwiftUI

struct SettingsView: View {
    @EnvironmentObject private var configStore: WebhookConfigStore
    @State private var newHeaderKey = ""
    @State private var newHeaderValue = ""

    var body: some View {
        Form {
            Section(header: Text("Webhook")) {
                TextField("https://example.com/hook", text: $configStore.config.url)
                    .keyboardType(.URL)
                    .autocorrectionDisabled(true)
                    .textInputAutocapitalization(.never)

                Picker("Verb", selection: $configStore.config.verb) {
                    ForEach(HTTPVerb.allCases) { verb in
                        Text(verb.rawValue).tag(verb)
                    }
                }
            }

            Section(header: Text("Headers"), footer: Text("You can set secret tokens or API keys here.")) {
                ForEach($configStore.config.headers) { $header in
                    HStack {
                        TextField("Key", text: $header.key)
                        TextField("Value", text: $header.value)
                    }
                }
                .onDelete { indices in
                    configStore.config.headers.remove(atOffsets: indices)
                }

                HStack {
                    TextField("Key", text: $newHeaderKey)
                    TextField("Value", text: $newHeaderValue)
                    Button(action: addHeader) {
                        Image(systemName: "plus.circle.fill")
                    }
                    .disabled(newHeaderKey.isEmpty || newHeaderValue.isEmpty)
                }
            }

            Section {
                Button(role: .destructive) {
                    configStore.config = WebhookConfig()
                } label: {
                    Label("Reset", systemImage: "arrow.counterclockwise")
                }
            }
        }
        .navigationTitle("Settings")
    }

    private func addHeader() {
        let header = WebhookHeader(key: newHeaderKey, value: newHeaderValue)
        configStore.config.headers.append(header)
        newHeaderKey = ""
        newHeaderValue = ""
    }
}

struct SettingsView_Previews: PreviewProvider {
    static var previews: some View {
        NavigationView {
            SettingsView()
                .environmentObject(WebhookConfigStore())
        }
    }
}
