#pragma once

#include "../../domain/interfaces.hpp"
#include <unordered_map>
#include <mutex>
#include <chrono>
#include <memory>

namespace trading::infrastructure::cache {

class IdempotencyCache : public trading::domain::IIdempotencyCache {
private:
    struct CacheEntry {
        trading::domain::OrderResult result;
        std::chrono::steady_clock::time_point expiresAt;
        
        CacheEntry() = default;
        CacheEntry(const trading::domain::OrderResult& res, std::chrono::steady_clock::time_point exp)
            : result(res), expiresAt(exp) {}
        
        bool isExpired() const {
            return std::chrono::steady_clock::now() > expiresAt;
        }
    };
    
    std::unordered_map<std::string, CacheEntry> cache_;
    mutable std::mutex mutex_;
    
public:
    IdempotencyCache() = default;
    ~IdempotencyCache() = default;
    
    std::optional<trading::domain::OrderResult> get(const std::string& key) override;
    void put(const std::string& key, const trading::domain::OrderResult& result, int32_t ttlMs = 300000) override;
    
    // Cleanup expired entries
    void cleanup();
    
    // Get cache statistics
    size_t size() const;
    size_t expiredCount() const;
};

} // namespace trading::infrastructure::cache
