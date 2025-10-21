#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "infrastructure/cache/idempotency_cache.hpp"
#include "domain/types.hpp"

using namespace trading::infrastructure::cache;
using namespace trading::domain;

TEST_CASE("IdempotencyCache - Basic Operations", "[cache]") {
    IdempotencyCache cache;
    
    SECTION("Store and retrieve result") {
        std::string key = "test-key-123";
        OrderResult result;
        result.status = OrderStatus::ACK;
        result.orderId = "order-456";
        result.echoKey = key;
        result.reason = "Order placed successfully";
        
        // Store result
        cache.put(key, result);
        
        // Retrieve result
        auto retrieved = cache.get(key);
        REQUIRE(retrieved.has_value());
        REQUIRE(retrieved->status == OrderStatus::ACK);
        REQUIRE(retrieved->orderId == "order-456");
        REQUIRE(retrieved->echoKey == key);
        REQUIRE(retrieved->reason == "Order placed successfully");
    }
    
    SECTION("Non-existent key returns empty") {
        std::string key = "non-existent-key";
        auto result = cache.get(key);
        REQUIRE_FALSE(result.has_value());
    }
    
    SECTION("Store multiple results") {
        std::string key1 = "key-1";
        std::string key2 = "key-2";
        
        OrderResult result1;
        result1.status = OrderStatus::ACK;
        result1.orderId = "order-1";
        result1.echoKey = key1;
        
        OrderResult result2;
        result2.status = OrderStatus::FILLED;
        result2.orderId = "order-2";
        result2.echoKey = key2;
        
        cache.put(key1, result1);
        cache.put(key2, result2);
        
        auto retrieved1 = cache.get(key1);
        auto retrieved2 = cache.get(key2);
        
        REQUIRE(retrieved1.has_value());
        REQUIRE(retrieved1->orderId == "order-1");
        REQUIRE(retrieved1->status == OrderStatus::ACK);
        
        REQUIRE(retrieved2.has_value());
        REQUIRE(retrieved2->orderId == "order-2");
        REQUIRE(retrieved2->status == OrderStatus::FILLED);
    }
    
    SECTION("Overwrite existing result") {
        std::string key = "overwrite-key";
        
        OrderResult result1;
        result1.status = OrderStatus::ACK;
        result1.orderId = "order-1";
        result1.echoKey = key;
        
        OrderResult result2;
        result2.status = OrderStatus::FILLED;
        result2.orderId = "order-2";
        result2.echoKey = key;
        
        cache.put(key, result1);
        cache.put(key, result2);
        
        auto retrieved = cache.get(key);
        REQUIRE(retrieved.has_value());
        REQUIRE(retrieved->orderId == "order-2");
        REQUIRE(retrieved->status == OrderStatus::FILLED);
    }
}

TEST_CASE("IdempotencyCache - TTL Behavior", "[cache]") {
    IdempotencyCache cache;
    
    SECTION("Cache entry with TTL") {
        std::string key = "ttl-key";
        OrderResult result;
        result.status = OrderStatus::ACK;
        result.orderId = "order-ttl";
        result.echoKey = key;
        
        cache.put(key, result);
        
        // Should be available immediately
        auto retrieved = cache.get(key);
        REQUIRE(retrieved.has_value());
        REQUIRE(retrieved->orderId == "order-ttl");
    }
}
