#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include <iostream>
#include "application/risk_validator.hpp"
#include "domain/types.hpp"

using namespace trading::application;
using namespace trading::domain;

TEST_CASE("RiskValidator - Basic Validation", "[risk]") {
    RiskValidator validator;
    
    SECTION("Valid order passes validation") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 10000.0;
        
        std::vector<Position> positions;
        
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::LIMIT;
        order.side = Side::BUY;
        order.qty = 100.0;
        order.price = 50.0;
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        bool isValid = validator.validate(account, positions, order);
        REQUIRE(isValid);
    }
    
    SECTION("Order exceeds balance") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 1000.0; // Low balance
        
        std::vector<Position> positions;
        
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::LIMIT;
        order.side = Side::BUY;
        order.qty = 100.0;
        order.price = 50.0; // Total: 5000.0, exceeds balance
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        bool isValid = validator.validate(account, positions, order);
        REQUIRE_FALSE(isValid);
    }
    
    SECTION("Market order validation") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 10000.0;
        
        std::vector<Position> positions;
        
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::MARKET;
        order.side = Side::BUY;
        order.qty = 100.0;
        order.price = 0.0; // Market order has no price
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        bool isValid = validator.validate(account, positions, order);
        REQUIRE(isValid);
    }
    
    SECTION("Sell order with insufficient position") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 10000.0;
        
        std::vector<Position> positions;
        Position position;
        position.symbol = "BTCUSD";
        position.qty = 50.0; // Only 50 shares
        position.avgPrice = 50000.0;
        positions.push_back(position);
        
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::LIMIT;
        order.side = Side::SELL;
        order.qty = 100.0; // Trying to sell 100 shares
        order.price = 50000.0;
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        bool isValid = validator.validate(account, positions, order);
        REQUIRE_FALSE(isValid);
    }
    
    SECTION("Sell order with sufficient position") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 10000.0;
        
        std::vector<Position> positions;
        Position position;
        position.symbol = "order-123"; // Match orderId for demo
        position.qty = 150.0; // Sufficient shares
        position.avgPrice = 50000.0;
        positions.push_back(position);
        
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::LIMIT;
        order.side = Side::SELL;
        order.qty = 1.0; // Selling 1 share
        order.price = 50000.0; // Total: $50,000 (within limit)
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        bool isValid = validator.validate(account, positions, order);
        if (!isValid) {
            std::cout << "Validation failed: " << validator.getValidationError() << std::endl;
        }
        REQUIRE(isValid);
    }
}

TEST_CASE("RiskValidator - Risk Policy Validation", "[risk]") {
    RiskValidator validator;
    
    SECTION("Order within risk limits") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 100000.0;
        
        std::vector<Position> positions;
        
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::LIMIT;
        order.side = Side::BUY;
        order.qty = 100.0;
        order.price = 100.0; // Total: 10000.0, within limits
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        bool isValid = validator.validate(account, positions, order);
        REQUIRE(isValid);
    }
    
    SECTION("Order exceeds maximum order size") {
        Account account;
        account.accountId = "acc-123";
        account.ownerUserId = "user-123";
        account.baseCurrency = "USD";
        account.balance = 1000000.0; // High balance
        
        std::vector<Position> positions;
        
        Order order;
        order.orderId = "order-123";
        order.idempotencyKey = "key-123";
        order.type = OrderType::LIMIT;
        order.side = Side::BUY;
        order.qty = 10000.0; // Very large quantity
        order.price = 100.0; // Total: 1000000.0, exceeds max order size
        order.status = OrderStatus::NEW;
        order.createdAt = 1234567890;
        
        bool isValid = validator.validate(account, positions, order);
        REQUIRE_FALSE(isValid);
    }
}
