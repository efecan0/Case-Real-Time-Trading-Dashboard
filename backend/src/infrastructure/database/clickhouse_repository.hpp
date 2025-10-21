#pragma once

#include "../../domain/interfaces.hpp"
#include <memory>
#include <string>
#include <vector>
#include <mutex>
#include <queue>
#include <thread>
#include <atomic>
#include <condition_variable>
#include <optional>
#include <nlohmann/json.hpp>

// Using HTTP API for ClickHouse - no native client needed

namespace trading::infrastructure::database {

// Data to be passed to the writer thread
struct OrderLogData {
    std::string idempKey;
    std::string status;
    std::string orderId;
    std::string resultJson;
};

class ClickHouseHistoryRepository : public trading::domain::IHistoryRepository {
private:
    // Using HTTP API - no native client needed
    mutable std::mutex client_mutex_; // For synchronization
    
    // For background writer thread
    std::queue<OrderLogData> log_queue_;
    std::mutex queue_mutex_;
    std::condition_variable queue_cond_;
    std::thread writer_thread_;
    std::atomic<bool> stop_writer_;

    std::string host_;
    int port_;
    std::string database_;
    std::string user_;
    std::string password_;
    bool connected_;

    // Helper methods
    trading::domain::Interval stringToInterval(const std::string& interval) const;
    std::string intervalToString(trading::domain::Interval interval) const;

    // parseCandlesFromBlock method removed - using HTTP API instead of native client
    
    // Writer thread methods
    void startWriterThread();
    void stopWriterThread();
    void writerLoop();

    // Configuration helpers
    static std::string getEnvVar(const std::string& name, const std::string& defaultValue);
    static int getEnvVarInt(const std::string& name, int defaultValue);

public:
    // Constructor with environment variable support
    ClickHouseHistoryRepository(const std::string& host = "", 
                               int port = 0, 
                               const std::string& database = "");
    
    // Static factory method for environment-based configuration
    static std::unique_ptr<ClickHouseHistoryRepository> createFromEnvironment();
    
    ~ClickHouseHistoryRepository() override;

    // IHistoryRepository interface implementation
    std::vector<trading::domain::Candle> fetch(const trading::domain::Symbol& symbol, const trading::domain::HistoryQuery& query) override;
    std::vector<trading::domain::Candle> latest(const std::vector<trading::domain::Symbol>& symbols, int32_t limit) override;

    // Connection management
    bool connect();
    void disconnect();
    bool isConnected() const { return connected_; }
    bool reconnect();

    // Database schema management
    bool createTables();
    bool initializeDatabase();
    
    // Mock data generation for testing/demo
    bool generateMockData();
    
    // Order logging
    bool logOrder(const std::string& idempKey, const std::string& status, const std::string& orderId, const std::string& resultJson);
    
    // Order history
    std::vector<nlohmann::json> getOrderHistory(const std::string& fromTime = "", const std::string& toTime = "", int32_t limit = 100);
    
    // Get specific order details for cancellation
    std::optional<nlohmann::json> getOrderDetails(const std::string& orderId);

private:
    void logError(const std::string& operation, const std::exception& e) const;
};

} // namespace trading::infrastructure::database
