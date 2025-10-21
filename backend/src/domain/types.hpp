#pragma once

#include <string>
#include <vector>
#include <chrono>
#include <cstdint>

namespace trading::domain {

// Enums
enum class Side {
    BUY,
    SELL
};

enum class OrderType {
    MARKET,
    LIMIT
};

enum class OrderStatus {
    NEW,
    ACK,
    PARTIALLY_FILLED,
    FILLED,
    REJECTED,
    CANCELED
};

enum class Interval {
    S1, S5, S15,
    M1, M5, M15,
    H1, D1
};

// Value Objects
struct Symbol {
    std::string code;
    
    Symbol() = default;
    explicit Symbol(std::string c) : code(std::move(c)) {}
    
    bool operator==(const Symbol& other) const { return code == other.code; }
    bool operator<(const Symbol& other) const { return code < other.code; }
};

struct Tick {
    int64_t ts;
    double bid;
    double ask;
    double last;
    uint64_t volume;
    
    Tick() = default;
    Tick(int64_t timestamp, double b, double a, double l, uint64_t vol)
        : ts(timestamp), bid(b), ask(a), last(l), volume(vol) {}
};

struct TickDelta {
    int64_t ts;
    double last;
    double bid;
    double ask;
    int32_t seq;
    
    TickDelta() = default;
    TickDelta(int64_t timestamp, double l, double b, double a, int32_t sequence)
        : ts(timestamp), last(l), bid(b), ask(a), seq(sequence) {}
};

struct Candle {
    int64_t openTime;
    double open;
    double high;
    double low;
    double close;
    uint64_t volume;
    Interval interval;
    
    Candle() = default;
    Candle(int64_t open_time, double o, double h, double l, double c, uint64_t vol, Interval i)
        : openTime(open_time), open(o), high(h), low(l), close(c), volume(vol), interval(i) {}
};

struct HistoryQuery {
    int64_t fromTs;
    int64_t toTs;
    Interval interval;
    int32_t limit;
    
    HistoryQuery() = default;
    HistoryQuery(int64_t from, int64_t to, Interval i, int32_t l = 1000)
        : fromTs(from), toTs(to), interval(i), limit(l) {}
};

// Entities
struct User {
    std::string userId;
    std::string email;
    std::string role; // "trader", "viewer"
    
    User() = default;
    User(std::string id, std::string e, std::string r)
        : userId(std::move(id)), email(std::move(e)), role(std::move(r)) {}
};

struct Account {
    std::string accountId;
    std::string ownerUserId;
    std::string baseCurrency;
    double balance;
    
    Account() = default;
    Account(std::string id, std::string owner, std::string currency, double bal)
        : accountId(std::move(id)), ownerUserId(std::move(owner)), 
          baseCurrency(std::move(currency)), balance(bal) {}
};

struct Position {
    std::string symbol;
    double qty;
    double avgPrice;
    
    Position() = default;
    Position(std::string sym, double quantity, double avg)
        : symbol(std::move(sym)), qty(quantity), avgPrice(avg) {}
};

struct Order {
    std::string orderId;
    std::string idempotencyKey;
    OrderType type;
    Side side;
    double qty;
    double price;
    OrderStatus status;
    int64_t createdAt;
    
    Order() = default;
    Order(std::string id, std::string key, OrderType t, Side s, double q, double p)
        : orderId(std::move(id)), idempotencyKey(std::move(key)), type(t), side(s), 
          qty(q), price(p), status(OrderStatus::NEW), createdAt(std::chrono::duration_cast<std::chrono::milliseconds>(
              std::chrono::system_clock::now().time_since_epoch()).count()) {}
};

struct OrderResult {
    OrderStatus status;
    std::string orderId;
    std::string echoKey;
    std::string reason;
    
    OrderResult() = default;
    OrderResult(OrderStatus s, std::string id, std::string key, std::string r = "")
        : status(s), orderId(std::move(id)), echoKey(std::move(key)), reason(std::move(r)) {}
};

struct RiskPolicy {
    double maxPositionQty;
    double maxOrderNotional;
    bool allowShort;
    
    RiskPolicy() = default;
    RiskPolicy(double maxPos, double maxOrder, bool allow_short)
        : maxPositionQty(maxPos), maxOrderNotional(maxOrder), allowShort(allow_short) {}
};

// Metrics and Alerting
struct Metrics {
    int64_t ts;
    double latencyMs;
    double throughput;
    double errorRate;
    int32_t connCount;
    
    Metrics() = default;
    Metrics(int64_t timestamp, double latency, double tput, double error, int32_t conn)
        : ts(timestamp), latencyMs(latency), throughput(tput), errorRate(error), connCount(conn) {}
};

struct AlertRule {
    std::string ruleId;
    std::string metricKey;
    std::string operator_;
    double threshold;
    bool enabled;
    
    AlertRule() = default;
    AlertRule(std::string id, std::string key, std::string op, double thresh, bool en)
        : ruleId(std::move(id)), metricKey(std::move(key)), operator_(std::move(op)), 
          threshold(thresh), enabled(en) {}
};

struct AlertEvent {
    std::string eventId;
    std::string ruleId;
    int64_t ts;
    double value;
    std::string message;
    
    AlertEvent() = default;
    AlertEvent(std::string id, std::string rule, int64_t timestamp, double val, std::string msg)
        : eventId(std::move(id)), ruleId(std::move(rule)), ts(timestamp), value(val), message(std::move(msg)) {}
};

struct Subscription {
    std::string channel;
    int64_t createdAt;
    
    Subscription() = default;
    Subscription(std::string ch, int64_t created)
        : channel(std::move(ch)), createdAt(created) {}
};

} // namespace trading::domain
