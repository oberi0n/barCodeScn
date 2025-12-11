import Foundation

struct WebhookHeader: Identifiable, Hashable, Codable {
    var id = UUID()
    var key: String
    var value: String
}

enum HTTPVerb: String, CaseIterable, Codable, Identifiable {
    case get = "GET"
    case post = "POST"
    case put = "PUT"
    case patch = "PATCH"
    case delete = "DELETE"

    var id: String { rawValue }
}

struct WebhookConfig: Codable {
    var url: String = ""
    var verb: HTTPVerb = .post
    var headers: [WebhookHeader] = []

    var urlRequest: URLRequest? {
        guard let url = URL(string: url) else { return nil }
        var request = URLRequest(url: url)
        request.httpMethod = verb.rawValue
        headers.forEach { request.setValue($0.value, forHTTPHeaderField: $0.key) }
        return request
    }
}

final class WebhookConfigStore: ObservableObject {
    @Published var config: WebhookConfig {
        didSet { persist() }
    }

    private let storageKey = "webhook.config"

    init() {
        if let data = UserDefaults.standard.data(forKey: storageKey),
           let decoded = try? JSONDecoder().decode(WebhookConfig.self, from: data) {
            config = decoded
        } else {
            config = WebhookConfig()
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(config) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}
