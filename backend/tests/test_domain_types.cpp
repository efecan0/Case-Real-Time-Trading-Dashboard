#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "domain/types.hpp"

using namespace trading::domain;

TEST_CASE("Domain Types - Order Creation", "[domain]") {
    SECTION("Create valid order") {
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::LIMIT;
        order.side = Side::BUY;
        order.qty = 100.0;
        order.price = 50.0;
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        REQUIRE(order.orderId == "order-123");
        REQUIRE(order.idempotencyKey == "key-123");
        REQUIRE(order.type == OrderType::LIMIT);
        REQUIRE(order.side == Side::BUY);
        REQUIRE(order.qty == 100.0);
        REQUIRE(order.price == 50.0);
        REQUIRE(order.status == OrderStatus::NEW);
        REQUIRE(order.createdAt == 1234567890);
    }
    
    SECTION("Create market order") {
        Order order;
        order.orderId = "market-order-456";
        order.idempotencyKey = "key-456";
        order.type = OrderType::MARKET;
        order.side = Side::SELL;
        order.qty = 50.0;
        order.price = 0.0; // Market orders have no price
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        REQUIRE(order.type == OrderType::MARKET);
        REQUIRE(order.side == Side::SELL);
        REQUIRE(order.price == 0.0);
    }
}

TEST_CASE("Domain Types - OrderResult Creation", "[domain]") {
    SECTION("Create successful order result") {
        OrderResult result;
        result.status = OrderStatus::ACK;
        result.orderId = "order-123";
        result.echoKey = "key-123";
        result.reason = "Order placed successfully";
        
        REQUIRE(result.status == OrderStatus::ACK);
        REQUIRE(result.orderId == "order-123");
        REQUIRE(result.echoKey == "key-123");
        REQUIRE(result.reason == "Order placed successfully");
    }
    
    SECTION("Create rejected order result") {
        OrderResult result;
        result.status = OrderStatus::REJECTED;
        result.orderId = "order-456";
        result.echoKey = "key-456";
        result.reason = "Insufficient balance";
        
        REQUIRE(result.status == OrderStatus::REJECTED);
        REQUIRE(result.reason == "Insufficient balance");
    }
}

TEST_CASE("Domain Types - Account Creation", "[domain]") {
    SECTION("Create valid account") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 10000.0;
        
        REQUIRE(account.accountId == "acc-123");
        REQUIRE(account.ownerUserId == "user-123");
        REQUIRE(account.baseCurrency == "USD");
        REQUIRE(account.balance == 10000.0);
    }
}

TEST_CASE("Domain Types - Position Creation", "[domain]") {
    SECTION("Create valid position") {
        Position position;
        position.symbol = "BTCUSD";
        position.qty = 100.0;
        position.avgPrice = 50000.0;
        
        REQUIRE(position.symbol == "BTCUSD");
        REQUIRE(position.qty == 100.0);
        REQUIRE(position.avgPrice == 50000.0);
    }
    
    SECTION("Create short position") {
        Position position;
        position.symbol = "ETHUSD";
        position.qty = -50.0; // Negative quantity for short position
        position.avgPrice = 3000.0;
        
        REQUIRE(position.symbol == "ETHUSD");
        REQUIRE(position.qty == -50.0);
        REQUIRE(position.avgPrice == 3000.0);
    }
}

TEST_CASE("Domain Types - Tick Creation", "[domain]") {
    SECTION("Create valid tick") {
        Tick tick;
        tick.ts = 1234567890;
        tick.bid = 49950.0;
        tick.ask = 50050.0;
        tick.last = 50000.0;
        tick.volume = 1000;
        
        REQUIRE(tick.ts == 1234567890);
        REQUIRE(tick.bid == 49950.0);
        REQUIRE(tick.ask == 50050.0);
        REQUIRE(tick.last == 50000.0);
        REQUIRE(tick.volume == 1000);
    }
}

TEST_CASE("Domain Types - TickDelta Creation", "[domain]") {
    SECTION("Create valid tick delta") {
        TickDelta delta;
        delta.ts = 1234567890;
        delta.last = 50000.0;
        delta.bid = 49950.0;
        delta.ask = 50050.0;
        delta.seq = 12345;
        
        REQUIRE(delta.ts == 1234567890);
        REQUIRE(delta.last == 50000.0);
        REQUIRE(delta.bid == 49950.0);
        REQUIRE(delta.ask == 50050.0);
        REQUIRE(delta.seq == 12345);
    }
}

TEST_CASE("Domain Types - Candle Creation", "[domain]") {
    SECTION("Create valid candle") {
        Candle candle;
        candle.openTime = 1234567890;
        candle.open = 50000.0;
        candle.high = 51000.0;
        candle.low = 49000.0;
        candle.close = 50500.0;
        candle.volume = 1000;
        candle.interval = Interval::M1;
        
        REQUIRE(candle.openTime == 1234567890);
        REQUIRE(candle.open == 50000.0);
        REQUIRE(candle.high == 51000.0);
        REQUIRE(candle.low == 49000.0);
        REQUIRE(candle.close == 50500.0);
        REQUIRE(candle.volume == 1000);
        REQUIRE(candle.interval == Interval::M1);
    }
}

TEST_CASE("Domain Types - HistoryQuery Creation", "[domain]") {
    SECTION("Create valid history query") {
        HistoryQuery query;
        query.fromTs = 1234567890;
        query.toTs = 1234567890 + 3600; // 1 hour later
        query.interval = Interval::M1;
        query.limit = 100;
        
        REQUIRE(query.fromTs == 1234567890);
        REQUIRE(query.toTs == 1234567890 + 3600);
        REQUIRE(query.interval == Interval::M1);
        REQUIRE(query.limit == 100);
    }
}

TEST_CASE("Domain Types - RiskPolicy Creation", "[domain]") {
    SECTION("Create valid risk policy") {
        RiskPolicy policy;
        policy.maxPositionQty = 1000.0;
        policy.maxOrderNotional = 100000.0;
        policy.allowShort = true;
        
        REQUIRE(policy.maxPositionQty == 1000.0);
        REQUIRE(policy.maxOrderNotional == 100000.0);
        REQUIRE(policy.allowShort == true);
    }
    
    SECTION("Create conservative risk policy") {
        RiskPolicy policy;
        policy.maxPositionQty = 100.0;
        policy.maxOrderNotional = 10000.0;
        policy.allowShort = false;
        
        REQUIRE(policy.maxPositionQty == 100.0);
        REQUIRE(policy.maxOrderNotional == 10000.0);
        REQUIRE(policy.allowShort == false);
    }
}
