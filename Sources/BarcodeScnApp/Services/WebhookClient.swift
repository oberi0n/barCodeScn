import Foundation

enum WebhookError: Error, LocalizedError {
    case missingURL
    case network(Error)
    case invalidResponse

    var errorDescription: String? {
        switch self {
        case .missingURL:
            return "Webhook URL is missing."
        case .network(let error):
            return error.localizedDescription
        case .invalidResponse:
            return "The webhook responded with an error status."
        }
    }
}

final class WebhookClient {
    func send(record: ScanRecord, config: WebhookConfig) async throws {
        guard var request = config.urlRequest else { throw WebhookError.missingURL }
        let payload: [String: Any] = [
            "payload": record.payload,
            "timestamp": ISO8601DateFormatter().string(from: record.date)
        ]
        request.httpBody = try JSONSerialization.data(withJSONObject: payload)
        if request.value(forHTTPHeaderField: "Content-Type") == nil {
            request.setValue("application/json", forHTTPHeaderField: "Content-Type")
        }

        let (_, response): (Data, URLResponse)
        do {
            ( _, response) = try await URLSession.shared.data(for: request)
        } catch {
            throw WebhookError.network(error)
        }

        guard let http = response as? HTTPURLResponse, 200..<300 ~= http.statusCode else {
            throw WebhookError.invalidResponse
        }
    }
}
