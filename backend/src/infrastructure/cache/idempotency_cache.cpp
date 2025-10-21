#include "idempotency_cache.hpp"
#include <algorithm>

namespace trading::infrastructure::cache {

std::optional<trading::domain::OrderResult> IdempotencyCache::get(const std::string& key) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto it = cache_.find(key);
    if (it == cache_.end()) {
        return std::nullopt;
    }
    
    // Check if expired
    if (it->second.isExpired()) {
        cache_.erase(it);
        return std::nullopt;
    }
    
    return it->second.result;
}

void IdempotencyCache::put(const std::string& key, const trading::domain::OrderResult& result, int32_t ttlMs) {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto expiresAt = std::chrono::steady_clock::now() + std::chrono::milliseconds(ttlMs);
    cache_[key] = CacheEntry(result, expiresAt);
}

void IdempotencyCache::cleanup() {
    std::lock_guard<std::mutex> lock(mutex_);
    
    auto now = std::chrono::steady_clock::now();
    auto it = cache_.begin();
    
    while (it != cache_.end()) {
        if (it->second.isExpired()) {
            it = cache_.erase(it);
        } else {
            ++it;
        }
    }
}

size_t IdempotencyCache::size() const {
    std::lock_guard<std::mutex> lock(mutex_);
    return cache_.size();
}

size_t IdempotencyCache::expiredCount() const {
    std::lock_guard<std::mutex> lock(mutex_);
    
    size_t count = 0;
    for (const auto& pair : cache_) {
        if (pair.second.isExpired()) {
            count++;
        }
    }
    return count;
}

} // namespace trading::infrastructure::cache
