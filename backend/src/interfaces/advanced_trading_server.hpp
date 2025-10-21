#pragma once

#include "../domain/interfaces.hpp"
#include <binaryrpc/core/app.hpp>
#include <binaryrpc/core/session/session.hpp>
#include <binaryrpc/transports/websocket/websocket_transport.hpp>
#include <binaryrpc/plugins/room_plugin.hpp>
#include <binaryrpc/core/framework_api.hpp>
#include <binaryrpc/core/util/qos.hpp>
#include <binaryrpc/core/strategies/linear_backoff.hpp>
#include <nlohmann/json.hpp>
#include <memory>
#include <string>
#include <vector>
#include <thread>
#include <atomic>
#include <mutex>
#include <unordered_map>

namespace trading::interfaces {

class AdvancedTradingServer {
private:
    binaryrpc::App* app_;
    std::unique_ptr<binaryrpc::RoomPlugin> roomPlugin_;
    
    // Dependencies
    // authInspector_ removed - using inline JWT verification instead
    std::unique_ptr<trading::domain::IIdempotencyCache> idempotencyCache_;
    std::unique_ptr<trading::domain::IRiskValidator> riskValidator_;
    std::unique_ptr<trading::domain::IMarketDataFeed> marketDataFeed_;
    std::unique_ptr<trading::domain::IHistoryRepository> historyRepository_;
    std::unique_ptr<trading::domain::IMetricsCollector> metricsCollector_;
    std::unique_ptr<trading::domain::IAlertingService> alertingService_;
    
    // Configuration
    std::string host_;
    int port_;
    std::string jwtSecret_;
    
    // Market data simulation
    std::thread marketDataThread_;
    std::atomic<bool> running_;
    
    // Metrics tracking
    std::atomic<int> totalOrdersPlaced_;
    std::atomic<int> totalOrdersCancelled_;
    std::atomic<int> totalErrors_;
    std::atomic<int> activeConnections_;
    std::chrono::steady_clock::time_point startTime_;
    
    // Alert rules storage
    std::unordered_map<std::string, trading::domain::AlertRule> alertRules_;
    std::mutex alertRulesMutex_;
    
    
public:
    AdvancedTradingServer(const std::string& host = "0.0.0.0", 
                         int port = 8080, 
                         const std::string& jwtSecret = "your-secret-key");
    
    ~AdvancedTradingServer();
    
    // Initialize and start the server
    bool initialize();
    void start();
    void stop();
    
    // Dependency injection
    // setAuthInspector removed - using inline JWT verification instead
    void setIdempotencyCache(std::unique_ptr<trading::domain::IIdempotencyCache> cache);
    void setRiskValidator(std::unique_ptr<trading::domain::IRiskValidator> validator);
    void setMarketDataFeed(std::unique_ptr<trading::domain::IMarketDataFeed> feed);
    void setHistoryRepository(std::unique_ptr<trading::domain::IHistoryRepository> repository);
    void setMetricsCollector(std::unique_ptr<trading::domain::IMetricsCollector> collector);
    void setAlertingService(std::unique_ptr<trading::domain::IAlertingService> service);
    
private:
    // BinaryRPC handlers with QoS
    void setupHandlers(binaryrpc::FrameworkAPI& api);
    void setupMiddleware(binaryrpc::FrameworkAPI& api);
    void setupQoS();
    void setupConnectionEventHandlers();
    
    // Authentication & Session Management
    void handleHello(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleLogout(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    
    // Order Management with QoS1 (AtLeastOnce)
    void handleOrdersPlace(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleOrdersCancel(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleOrdersStatus(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleOrdersHistory(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    
    // Market Data with Room Management
    void handleMarketDataSubscribe(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleMarketDataUnsubscribe(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleMarketDataList(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    
    // Historical Data
    void handleHistoryQuery(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleHistoryLatest(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    
    // System Management
    void handleMetricsGet(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleAlertsSubscribe(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleAlertsList(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleAlertsRegister(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    void handleAlertsDisable(const std::vector<uint8_t>& data, binaryrpc::RpcContext& context, binaryrpc::FrameworkAPI& api);
    
    // Market Data Simulation
    void startMarketDataSimulation();
    void stopMarketDataSimulation();
    void simulateMarketData();
    void broadcastMarketData(const std::string& symbol, const nlohmann::json& data);
    void broadcastAlerts(const nlohmann::json& alertData);
    void checkAndBroadcastAlerts();
    
    // Alert rule management
    void registerAlertRule(const trading::domain::AlertRule& rule);
    void disableAlertRule(const std::string& ruleId);
    std::vector<trading::domain::AlertEvent> evaluateAlertRules(const trading::domain::Metrics& metrics);
    
    // Utility methods
    bool validateSession(binaryrpc::RpcContext& context, const std::string& requiredRole = "");
    trading::domain::Account getAccountForSession(binaryrpc::RpcContext& context);
    std::vector<trading::domain::Position> getPositionsForAccount(const trading::domain::Account& account);
    
    // Rate limiting with session state
    bool checkRateLimit(binaryrpc::Session& session, const std::string& operation);
    void updateRateLimit(binaryrpc::Session& session, const std::string& operation);
    
    // Error handling
    nlohmann::json createErrorResponse(const std::string& code, const std::string& message);
    nlohmann::json createSuccessResponse(const nlohmann::json& data = nlohmann::json::object());
    
    
    // Session state management
    std::optional<std::string> getSessionData(binaryrpc::RpcContext& context, const std::string& key);
    
    // Market data rooms
    std::string getMarketDataRoom(const std::string& symbol);
    std::string getAlertsRoom();
};

} // namespace trading::interfaces
