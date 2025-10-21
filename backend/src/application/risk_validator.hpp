#pragma once

#include "../domain/interfaces.hpp"
#include <memory>
#include <string>

namespace trading::application {

class RiskValidator : public trading::domain::IRiskValidator {
private:
    std::string lastError_;
    
public:
    RiskValidator() = default;
    ~RiskValidator() = default;
    
    bool validate(const trading::domain::Account& account, 
                  const std::vector<trading::domain::Position>& positions, 
                  const trading::domain::Order& order) override;
    
    std::string getValidationError() const override { return lastError_; }
    
private:
    bool validatePositionLimits(const trading::domain::Account& account, 
                               const std::vector<trading::domain::Position>& positions, 
                               const trading::domain::Order& order);
    
    bool validateOrderNotional(const trading::domain::Order& order);
    
    bool validateShortSelling(const trading::domain::Order& order, 
                             const std::vector<trading::domain::Position>& positions);
    
    bool validateBalance(const trading::domain::Account& account, 
                        const trading::domain::Order& order);
    
    double calculateOrderNotional(const trading::domain::Order& order);
    
    double getCurrentPosition(const std::string& symbol, 
                             const std::vector<trading::domain::Position>& positions);
};

} // namespace trading::application
