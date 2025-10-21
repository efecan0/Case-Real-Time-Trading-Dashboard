#pragma once

#include "types.hpp"
#include <vector>
#include <memory>
#include <optional>

namespace trading::domain {

// Repository Interfaces
class IHistoryRepository {
public:
    virtual ~IHistoryRepository() = default;
    virtual std::vector<Candle> fetch(const Symbol& symbol, const HistoryQuery& query) = 0;
    virtual std::vector<Candle> latest(const std::vector<Symbol>& symbols, int32_t limit) = 0;
};

// Service Interfaces
class IMarketDataFeed {
public:
    virtual ~IMarketDataFeed() = default;
    virtual void subscribe(const std::vector<Symbol>& symbols) = 0;
    virtual void unsubscribe(const std::vector<Symbol>& symbols) = 0;
    virtual void publishTick(const Symbol& symbol, const Tick& tick) = 0;
    virtual void publishTickDelta(const Symbol& symbol, const TickDelta& delta) = 0;
};

class IOrderService {
public:
    virtual ~IOrderService() = default;
    virtual OrderResult place(const Account& account, const Symbol& symbol, const Order& order) = 0;
    virtual OrderResult cancel(const Account& account, const std::string& orderId) = 0;
};

class IRiskValidator {
public:
    virtual ~IRiskValidator() = default;
    virtual bool validate(const Account& account, const std::vector<Position>& positions, const Order& order) = 0;
    virtual std::string getValidationError() const = 0;
};

class IAlertingService {
public:
    virtual ~IAlertingService() = default;
    virtual std::vector<AlertEvent> evaluate(const Metrics& metrics) = 0;
    virtual void registerRule(const AlertRule& rule) = 0;
    virtual void disableRule(const std::string& ruleId) = 0;
};

class IIdempotencyCache {
public:
    virtual ~IIdempotencyCache() = default;
    virtual std::optional<OrderResult> get(const std::string& key) = 0;
    virtual void put(const std::string& key, const OrderResult& result, int32_t ttlMs = 300000) = 0; // 5 min default
};

class IMetricsCollector {
public:
    virtual ~IMetricsCollector() = default;
    virtual Metrics collect() = 0;
    virtual void recordLatency(double latencyMs) = 0;
    virtual void recordError() = 0;
    virtual void recordConnection() = 0;
    virtual void recordDisconnection() = 0;
};

// Authentication
struct Principal {
    std::string subject;
    std::vector<std::string> roles;
    
    Principal() = default;
    Principal(std::string sub, std::vector<std::string> r)
        : subject(std::move(sub)), roles(std::move(r)) {}
    
    bool hasRole(const std::string& role) const {
        return std::find(roles.begin(), roles.end(), role) != roles.end();
    }
};

class IAuthInspector {
public:
    virtual ~IAuthInspector() = default;
    virtual std::optional<Principal> verify(const std::string& token) = 0;
};

} // namespace trading::domain
