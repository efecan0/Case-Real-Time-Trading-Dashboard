#include "src/interfaces/advanced_trading_server.hpp"
#include "src/infrastructure/cache/idempotency_cache.hpp"
#include "src/application/risk_validator.hpp"
#include <iostream>
#include <signal.h>
#include <memory>

using namespace trading::interfaces;
// using namespace trading::infrastructure::auth; // Removed - auth directory deleted
using namespace trading::infrastructure::cache;
using namespace trading::application;

// Global server instance for signal handling
std::unique_ptr<AdvancedTradingServer> g_server;

void signalHandler(int signal) {
    std::cout << "\nReceived signal " << signal << ". Shutting down gracefully..." << std::endl;
    if (g_server) {
        g_server->stop();
    }
    exit(0);
}

int main(int argc, char* argv[]) {
    // Set up signal handlers
    signal(SIGINT, signalHandler);
    signal(SIGTERM, signalHandler);
    
    // Parse command line arguments
    std::string host = "0.0.0.0";
    int port = 8082;  // Different port from simple server
    std::string jwtSecret = "advanced-bull-trading-secret-key-2025";
    
    if (argc > 1) {
        try {
            port = std::stoi(argv[1]);
        } catch (const std::exception& e) {
            std::cerr << "Invalid port number: " << argv[1] << std::endl;
            return 1;
        }
    }
    
    if (argc > 2) {
        host = argv[2];
    }
    
    std::cout << "=== Advanced Bull Trading Server ===" << std::endl;
    std::cout << "Host: " << host << std::endl;
    std::cout << "Port: " << port << std::endl;
    std::cout << "Features:" << std::endl;
    std::cout << "  ✓ QoS (AtLeastOnce) for reliable order delivery" << std::endl;
    std::cout << "  ✓ Room management for market data subscriptions" << std::endl;
    std::cout << "  ✓ Middleware for authentication & rate limiting" << std::endl;
    std::cout << "  ✓ Session state management with FrameworkAPI" << std::endl;
    std::cout << "  ✓ Real-time market data broadcasting" << std::endl;
    std::cout << "  ✓ Idempotency cache for duplicate prevention" << std::endl;
    std::cout << "  ✓ Risk validation for order safety" << std::endl;
    std::cout << "=====================================" << std::endl;
    
    try {
        // Create and configure the advanced trading server
        g_server = std::make_unique<AdvancedTradingServer>(host, port, jwtSecret);
        
        // Set up dependencies with custom implementations
        // setAuthInspector removed - using inline JWT verification instead
        g_server->setIdempotencyCache(std::make_unique<IdempotencyCache>());
        g_server->setRiskValidator(std::make_unique<RiskValidator>());
        
        // Initialize the server
        if (!g_server->initialize()) {
            std::cerr << "Failed to initialize advanced trading server" << std::endl;
            return 1;
        }
        
        std::cout << "Advanced trading server initialized successfully!" << std::endl;
        std::cout << "Server is starting..." << std::endl;
        
        // Start the server (this will block)
        g_server->start();
        
    } catch (const std::exception& e) {
        std::cerr << "Error: " << e.what() << std::endl;
        return 1;
    }
    
    return 0;
}
