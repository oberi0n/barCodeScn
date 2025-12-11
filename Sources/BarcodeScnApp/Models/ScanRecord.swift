import Foundation

struct ScanRecord: Identifiable, Codable, Hashable {
    var id = UUID()
    var payload: String
    var date: Date
}

final class ScanHistoryStore: ObservableObject {
    @Published private(set) var records: [ScanRecord] = [] {
        didSet { persist() }
    }

    private let storageKey = "scan.history"

    init() {
        load()
    }

    func add(payload: String) {
        let record = ScanRecord(payload: payload, date: Date())
        records.insert(record, at: 0)
    }

    func todayRecords() -> [ScanRecord] {
        let calendar = Calendar.current
        return records.filter { calendar.isDateInToday($0.date) }
    }

    private func load() {
        guard let data = UserDefaults.standard.data(forKey: storageKey) else { return }
        if let decoded = try? JSONDecoder().decode([ScanRecord].self, from: data) {
            records = decoded
        }
    }

    private func persist() {
        if let data = try? JSONEncoder().encode(records) {
            UserDefaults.standard.set(data, forKey: storageKey)
        }
    }
}
