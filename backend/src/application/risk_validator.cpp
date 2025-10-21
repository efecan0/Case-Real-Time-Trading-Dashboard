#include "risk_validator.hpp"
#include <algorithm>
#include <cmath>
#include <string>

namespace trading::application {

bool RiskValidator::validate(const trading::domain::Account& account, 
                            const std::vector<trading::domain::Position>& positions, 
                            const trading::domain::Order& order) {
    lastError_.clear();
    
    // Validate order notional
    if (!validateOrderNotional(order)) {
        return false;
    }
    
    // Validate balance for buy orders
    if (order.side == trading::domain::Side::BUY && !validateBalance(account, order)) {
        return false;
    }
    
    // Validate short selling
    if (order.side == trading::domain::Side::SELL && !validateShortSelling(order, positions)) {
        return false;
    }
    
    // Validate position limits
    if (!validatePositionLimits(account, positions, order)) {
        return false;
    }
    
    return true;
}

bool RiskValidator::validatePositionLimits(const trading::domain::Account& account, 
                                          const std::vector<trading::domain::Position>& positions, 
                                          const trading::domain::Order& order) {
    // Get current position for this symbol (using orderId as symbol for demo)
    double currentPosition = getCurrentPosition(order.orderId, positions);
    
    // Calculate new position after order
    double newPosition = currentPosition;
    if (order.side == trading::domain::Side::BUY) {
        newPosition += order.qty;
    } else {
        newPosition -= order.qty;
    }
    
    // Check position limits (assuming max 1000 units per symbol for demo)
    const double MAX_POSITION_QTY = 1000.0;
    if (std::abs(newPosition) > MAX_POSITION_QTY) {
        lastError_ = "Position limit exceeded. Max position: " + std::to_string(MAX_POSITION_QTY);
        return false;
    }
    
    return true;
}

bool RiskValidator::validateOrderNotional(const trading::domain::Order& order) {
    double notional = calculateOrderNotional(order);
    
    // Check order notional limit (assuming max $100,000 per order for demo)
    const double MAX_ORDER_NOTIONAL = 100000.0;
    if (notional > MAX_ORDER_NOTIONAL) {
        lastError_ = "Order notional limit exceeded. Max notional: $" + std::to_string(MAX_ORDER_NOTIONAL);
        return false;
    }
    
    return true;
}

bool RiskValidator::validateShortSelling(const trading::domain::Order& order, 
                                        const std::vector<trading::domain::Position>& positions) {
    // For demo purposes, allow short selling
    // In real implementation, check if account allows short selling
    return true;
}

bool RiskValidator::validateBalance(const trading::domain::Account& account, 
                                   const trading::domain::Order& order) {
    double requiredAmount = calculateOrderNotional(order);
    
    if (account.balance < requiredAmount) {
        lastError_ = "Insufficient balance. Required: $" + std::to_string(requiredAmount) + 
                    ", Available: $" + std::to_string(account.balance);
        return false;
    }
    
    return true;
}

double RiskValidator::calculateOrderNotional(const trading::domain::Order& order) {
    if (order.type == trading::domain::OrderType::MARKET) {
        // For market orders, use a reasonable estimate (e.g., last price * 1.1 for safety)
        return order.qty * order.price * 1.1; // 10% buffer for market orders
    } else {
        return order.qty * order.price;
    }
}

double RiskValidator::getCurrentPosition(const std::string& symbol, 
                                        const std::vector<trading::domain::Position>& positions) {
    auto it = std::find_if(positions.begin(), positions.end(),
        [&symbol](const trading::domain::Position& pos) {
            return pos.symbol == symbol;
        });
    
    if (it != positions.end()) {
        return it->qty;
    }
    
    return 0.0;
}

} // namespace trading::application
