#include "clickhouse_repository.hpp"
#include <iostream>
#include <sstream>
#include <chrono>
#include <iomanip>
#include <cstdlib>
#include <cstring>
#include <ctime>
#include <random>
#include <map>
#include <nlohmann/json.hpp>
#include <atomic>
#include <thread>
#include <algorithm>
#include <mutex>
#include <optional>
#include <cpr/cpr.h>

// Using HTTP API for ClickHouse - no native client needed

namespace trading::infrastructure::database {

ClickHouseHistoryRepository::ClickHouseHistoryRepository(const std::string& host, int port, const std::string& database)
    : host_("localhost"), // HARDCODED
      port_(8123), // HARDCODED: HTTP port for ClickHouse
      database_("trading_db"), // HARDCODED
      user_("default"), // HARDCODED
      password_(""), // HARDCODED
      connected_(false) {

    std::cout << "[ClickHouse] Initializing repository - host: " << host_
              << ", port: " << port_ << ", database: " << database_
              << ", user: " << user_ << std::endl;

    try {
        // Use HTTP mode for stability (native client has connection issues)
        std::cout << "[ClickHouse] Using HTTP mode for ClickHouse connection" << std::endl;
        connected_ = connect();

        if (connected_) {
            std::cout << "[ClickHouse] Successfully connected to ClickHouse server via HTTP" << std::endl;
        } else {
            std::cout << "[ClickHouse] Connection test failed, will retry later" << std::endl;
            connected_ = false;
        }
    } catch (const std::exception& e) {
        std::cerr << "[ClickHouse] Exception during initialization: " << e.what() << std::endl;
        connected_ = false;
    }

    startWriterThread();
}

ClickHouseHistoryRepository::~ClickHouseHistoryRepository() {
    stopWriterThread();
}

bool ClickHouseHistoryRepository::connect() {
    std::lock_guard<std::mutex> lock(client_mutex_);
    try {
        // Use HTTP API for connection testing (more reliable)
        std::cout << "[ClickHouse] Attempting HTTP connection to " << host_ << ":" << port_ << std::endl;
        auto response = cpr::Get(cpr::Url{"http://" + host_ + ":" + std::to_string(port_)});
        if (response.status_code == 200) {
            std::cout << "[ClickHouse] HTTP connection successful (status: " << response.status_code << ")" << std::endl;
            return true;
        } else {
            std::cerr << "[ClickHouse] HTTP connection failed (status: " << response.status_code << "): " << response.text << std::endl;
            return false;
        }
    } catch (const std::exception& e) {
        std::cerr << "[ClickHouse] Connection failed: " << e.what() << std::endl;
        return false;
    }
}

void ClickHouseHistoryRepository::disconnect() {
    std::lock_guard<std::mutex> lock(client_mutex_);
    // HTTP mode doesn't need explicit disconnect
    std::cout << "[ClickHouse] HTTP connection doesn't need explicit disconnect." << std::endl;
    connected_ = false;
}

bool ClickHouseHistoryRepository::reconnect() {
    std::cout << "[ClickHouse] Attempting to reconnect..." << std::endl;

    // Disconnect first if connected
    if (connected_) {
        disconnect();
    }

    // Try to reconnect
    connected_ = connect();

    if (connected_) {
        std::cout << "[ClickHouse] Successfully reconnected" << std::endl;
    } else {
        std::cout << "[ClickHouse] Reconnection failed" << std::endl;
    }

    return connected_;
}

bool ClickHouseHistoryRepository::initializeDatabase() {
    std::lock_guard<std::mutex> lock(client_mutex_);
    if (!connected_) {
        return false;
    }

    try {
        std::cout << "[ClickHouse] Initializing database schema..." << std::endl;
        bool tablesCreated = createTables();

        // Generate mock data for testing/demo purposes
        if (tablesCreated) {
            std::cout << "[ClickHouse] Generating mock data for demo..." << std::endl;
            bool mockDataGenerated = generateMockData();
            std::cout << "[ClickHouse] Mock data generation result: " << (mockDataGenerated ? "SUCCESS" : "FAILED") << std::endl;
        } else {
            std::cout << "[ClickHouse] Tables not created, skipping mock data generation" << std::endl;
        }

        return tablesCreated;
    } catch (const std::exception& e) {
        logError("Database initialization", e);
        return false;
    }
}

bool ClickHouseHistoryRepository::createTables() {
    std::lock_guard<std::mutex> lock(client_mutex_);
    try {
        // Use HTTP API for ClickHouse table creation
        // Create database if it doesn't exist
        std::string createDbSql = "CREATE DATABASE IF NOT EXISTS " + database_;
        auto response = cpr::Post(cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                                  cpr::Body{createDbSql});
        if (response.status_code == 200) {
            std::cout << "[ClickHouse] Database created/checked successfully" << std::endl;
        } else {
            std::cerr << "[ClickHouse] Failed to create/check database: " << response.text << std::endl;
            return false;
        }

        // Create candles_1m table
        std::string createCandlesTable = R"(
            CREATE TABLE IF NOT EXISTS )" + database_ + R"(.candles_1m (
                symbol String,
                open_time DateTime,
                open Float64,
                high Float64,
                low Float64,
                close Float64,
                volume UInt64
            ) ENGINE = MergeTree()
            ORDER BY (symbol, open_time)
            PARTITION BY toYYYYMMDD(open_time)
            TTL open_time + INTERVAL 180 DAY
        )";

        auto response3 = cpr::Post(cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                                   cpr::Body{createCandlesTable});
        if (response3.status_code == 200) {
            std::cout << "[ClickHouse] Candles table created/checked successfully" << std::endl;
        } else {
            std::cerr << "[ClickHouse] Failed to create candles table: " << response3.text << std::endl;
            return false;
        }

        // Create ticks table
        std::string createTicksTable = R"(
            CREATE TABLE IF NOT EXISTS )" + database_ + R"(.ticks (
                symbol String,
                ts DateTime64(6),
                bid Float64,
                ask Float64,
                last Float64,
                volume UInt64
            ) ENGINE = MergeTree()
            ORDER BY (symbol, ts)
            PARTITION BY toYYYYMMDD(ts)
            TTL ts + INTERVAL 30 DAY
        )";

        auto response4 = cpr::Post(cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                                   cpr::Body{createTicksTable});
        if (response4.status_code == 200) {
            std::cout << "[ClickHouse] Ticks table created/checked successfully" << std::endl;
        } else {
            std::cerr << "[ClickHouse] Failed to create ticks table: " << response4.text << std::endl;
            return false;
        }

        // Create orders_log table
        std::string createOrdersLogTable = R"(
            CREATE TABLE IF NOT EXISTS )" + database_ + R"(.orders_log (
                idemp_key String,
                ts DateTime,
                status String,
                order_id String,
                result String
            ) ENGINE = MergeTree()
            ORDER BY (idemp_key, ts)
            PARTITION BY toYYYYMMDD(ts)
        )";

        auto response5 = cpr::Post(cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                                   cpr::Body{createOrdersLogTable});
        if (response5.status_code == 200) {
            std::cout << "[ClickHouse] Orders log table created/checked successfully" << std::endl;
        } else {
            std::cerr << "[ClickHouse] Failed to create orders log table: " << response5.text << std::endl;
            return false;
        }

        std::cout << "[ClickHouse] Database tables created successfully" << std::endl;
        return true;

    } catch (const std::exception& e) {
        logError("Table creation", e);
        return false;
    }
}

std::vector<trading::domain::Candle> ClickHouseHistoryRepository::fetch(
    const trading::domain::Symbol& symbol,
    const trading::domain::HistoryQuery& query) {

    std::lock_guard<std::mutex> lock(client_mutex_);
    if (!connected_) {
        std::cout << "[ClickHouse] Not connected, returning empty result" << std::endl;
        return {};
    }

    try {
        // HTTP mode - Real ClickHouse query via HTTP API
        // Convert Unix timestamp to ClickHouse DateTime format
        std::time_t fromTime = query.fromTs;
        std::time_t toTime = query.toTs;
        
        char fromBuffer[32], toBuffer[32];
        
        // Create local copies since gmtime modifies a static buffer
        struct tm fromTm, toTm;
        fromTm = *std::gmtime(&fromTime);
        toTm = *std::gmtime(&toTime);
        
        std::strftime(fromBuffer, sizeof(fromBuffer), "%Y-%m-%d %H:%M:%S", &fromTm);
        std::strftime(toBuffer, sizeof(toBuffer), "%Y-%m-%d %H:%M:%S", &toTm);

        std::stringstream sql;
        sql << "SELECT open_time, open, high, low, close, volume FROM " << database_ << ".candles_1m "
            << "WHERE symbol = '" << symbol.code << "' "
            << "AND open_time >= '" << fromBuffer << "' "
            << "AND open_time <= '" << toBuffer << "' "
            << "ORDER BY open_time DESC "
            << "LIMIT " << query.limit 
            << " FORMAT JSON";

        std::cout << "[ClickHouse] Executing HTTP query: " << sql.str() << std::endl;

        std::vector<trading::domain::Candle> candles;
        
        try {
            auto response = cpr::Post(
                cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                cpr::Body{sql.str()}
            );
            
            if (response.status_code == 200) {
                std::cout << "[ClickHouse] HTTP query successful, parsing JSON..." << std::endl;
                
                // Parse JSON response from ClickHouse
                auto jsonResponse = nlohmann::json::parse(response.text);
                auto data = jsonResponse["data"];
                
                for (const auto& row : data) {
                    // ClickHouse returns timestamps as strings, convert to int64_t
                    int64_t openTime;
                    try {
                        if (row["open_time"].is_string()) {
                            openTime = std::stoll(row["open_time"].get<std::string>());
                        } else {
                            openTime = row["open_time"].get<int64_t>();
                        }
                    } catch (...) {
                        openTime = 0;
                    }
                    
                    double open = row["open"].is_string() ? std::stod(row["open"].get<std::string>()) : row["open"].get<double>();
                    double high = row["high"].is_string() ? std::stod(row["high"].get<std::string>()) : row["high"].get<double>();
                    double low = row["low"].is_string() ? std::stod(row["low"].get<std::string>()) : row["low"].get<double>();
                    double close = row["close"].is_string() ? std::stod(row["close"].get<std::string>()) : row["close"].get<double>();
                    uint64_t volume = row["volume"].is_string() ? std::stoull(row["volume"].get<std::string>()) : row["volume"].get<uint64_t>();
                    
                    candles.emplace_back(
                        openTime,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        query.interval
                    );
                }
                
                std::cout << "[ClickHouse] Parsed " << candles.size() << " candles from HTTP response" << std::endl;
            } else {
                std::cerr << "[ClickHouse] HTTP query failed (status " << response.status_code << "): " << response.text << std::endl;
            }
        } catch (const std::exception& e) {
            std::cerr << "[ClickHouse] HTTP query exception: " << e.what() << std::endl;
        }

        return candles;

    } catch (const std::exception& e) {
        logError("History fetch", e);
        return {};
    }
}

std::vector<trading::domain::Candle> ClickHouseHistoryRepository::latest(
    const std::vector<trading::domain::Symbol>& symbols,
    int32_t limit) {

    std::lock_guard<std::mutex> lock(client_mutex_);
    if (!connected_ || symbols.empty()) {
        return {};
    }

    try {
        // HTTP mode - Real ClickHouse query via HTTP API
        std::stringstream symbolList;
        for (size_t i = 0; i < symbols.size(); ++i) {
            if (i > 0) symbolList << ",";
            symbolList << "'" << symbols[i].code << "'";
        }

        std::stringstream sql;
        sql << "SELECT symbol, open_time, open, high, low, close, volume FROM " << database_ << ".candles_1m "
            << "WHERE symbol IN (" << symbolList.str() << ") "
            << "ORDER BY open_time DESC "
            << "LIMIT " << limit
            << " FORMAT JSON";

        std::cout << "[ClickHouse] Executing HTTP latest query: " << sql.str() << std::endl;

        std::vector<trading::domain::Candle> candles;
        
        try {
            auto response = cpr::Post(
                cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                cpr::Body{sql.str()}
            );
            
            if (response.status_code == 200) {
                std::cout << "[ClickHouse] HTTP query successful, parsing JSON..." << std::endl;
                
                // Parse JSON response from ClickHouse
                auto jsonResponse = nlohmann::json::parse(response.text);
                auto data = jsonResponse["data"];
                
                for (const auto& row : data) {
                    std::string symbol = row["symbol"].get<std::string>();
                    // ClickHouse returns timestamps as strings, convert to int64_t
                    int64_t openTime;
                    try {
                        if (row["open_time"].is_string()) {
                            openTime = std::stoll(row["open_time"].get<std::string>());
                        } else {
                            openTime = row["open_time"].get<int64_t>();
                        }
                    } catch (...) {
                        openTime = 0;
                    }
                    
                    double open = row["open"].is_string() ? std::stod(row["open"].get<std::string>()) : row["open"].get<double>();
                    double high = row["high"].is_string() ? std::stod(row["high"].get<std::string>()) : row["high"].get<double>();
                    double low = row["low"].is_string() ? std::stod(row["low"].get<std::string>()) : row["low"].get<double>();
                    double close = row["close"].is_string() ? std::stod(row["close"].get<std::string>()) : row["close"].get<double>();
                    uint64_t volume = row["volume"].is_string() ? std::stoull(row["volume"].get<std::string>()) : row["volume"].get<uint64_t>();
                    
                    candles.emplace_back(
                        openTime,
                        open,
                        high,
                        low,
                        close,
                        volume,
                        trading::domain::Interval::M1
                    );
                }
                
                std::cout << "[ClickHouse] Parsed " << candles.size() << " latest candles from HTTP response" << std::endl;
            } else {
                std::cerr << "[ClickHouse] HTTP latest query failed (status " << response.status_code << "): " << response.text << std::endl;
            }
        } catch (const std::exception& e) {
            std::cerr << "[ClickHouse] HTTP latest query exception: " << e.what() << std::endl;
        }

        return candles;

    } catch (const std::exception& e) {
        logError("Latest fetch", e);
        return {};
    }
}

// parseCandlesFromBlock method removed - using HTTP API instead of native client

trading::domain::Interval ClickHouseHistoryRepository::stringToInterval(const std::string& interval) const {
    if (interval == "S1") return trading::domain::Interval::S1;
    if (interval == "S5") return trading::domain::Interval::S5;
    if (interval == "S15") return trading::domain::Interval::S15;
    if (interval == "M1") return trading::domain::Interval::M1;
    if (interval == "M5") return trading::domain::Interval::M5;
    if (interval == "M15") return trading::domain::Interval::M15;
    if (interval == "H1") return trading::domain::Interval::H1;
    if (interval == "D1") return trading::domain::Interval::D1;
    return trading::domain::Interval::M1; // Default
}

std::string ClickHouseHistoryRepository::intervalToString(trading::domain::Interval interval) const {
    switch (interval) {
        case trading::domain::Interval::S1: return "S1";
        case trading::domain::Interval::S5: return "S5";
        case trading::domain::Interval::S15: return "S15";
        case trading::domain::Interval::M1: return "M1";
        case trading::domain::Interval::M5: return "M5";
        case trading::domain::Interval::M15: return "M15";
        case trading::domain::Interval::H1: return "H1";
        case trading::domain::Interval::D1: return "D1";
        default: return "M1";
    }
}

void ClickHouseHistoryRepository::logError(const std::string& operation, const std::exception& e) const {
    std::cerr << "[ClickHouse] Error in " << operation << ": " << e.what() << std::endl;
}

std::string ClickHouseHistoryRepository::getEnvVar(const std::string& name, const std::string& defaultValue) {
    const char* envValue = std::getenv(name.c_str());
    if (envValue == nullptr) {
        return defaultValue;
    }
    return std::string(envValue);
}

int ClickHouseHistoryRepository::getEnvVarInt(const std::string& name, int defaultValue) {
    const char* envValue = std::getenv(name.c_str());
    if (envValue == nullptr) {
        return defaultValue;
    }
    
    try {
        return std::stoi(envValue);
    } catch (const std::exception&) {
        std::cerr << "[ClickHouse] Invalid integer value for " << name << ": " << envValue << ", using default: " << defaultValue << std::endl;
        return defaultValue;
    }
}

std::unique_ptr<ClickHouseHistoryRepository> ClickHouseHistoryRepository::createFromEnvironment() {
    std::cout << "[ClickHouse] Creating repository from environment variables" << std::endl;

    std::string host = getEnvVar("CLICKHOUSE_HOST", "localhost");
    std::string database = getEnvVar("CLICKHOUSE_DATABASE", "trading_db");
    std::string user = getEnvVar("CLICKHOUSE_USER", "default");
    std::string password = getEnvVar("CLICKHOUSE_PASSWORD", "");

    constexpr int kDefaultHttpPort = 8123;
    constexpr int kDefaultNativePort = 9000;

    auto parsePortEnv = [](const char* value, const char* name) -> std::optional<int> {
        if (!value) {
            return std::nullopt;
        }
        try {
            return std::stoi(value);
        } catch (const std::exception&) {
            std::cerr << "[ClickHouse] Invalid integer value for " << name << ": " << value << std::endl;
            return std::nullopt;
        }
    };

    const char* nativePortEnv = std::getenv("CLICKHOUSE_PORT");
    const char* httpPortEnv = std::getenv("CLICKHOUSE_HTTP_PORT");

    int nativePort = parsePortEnv(nativePortEnv, "CLICKHOUSE_PORT").value_or(kDefaultNativePort);
    int httpPort = parsePortEnv(httpPortEnv, "CLICKHOUSE_HTTP_PORT").value_or(kDefaultHttpPort);

    bool httpPortExplicit = httpPortEnv != nullptr;

    if (!httpPortExplicit) {
        if (nativePort == kDefaultHttpPort) {
            httpPort = kDefaultHttpPort;
        } else if (nativePort != kDefaultNativePort) {
            std::cout << "[ClickHouse] CLICKHOUSE_PORT is set to " << nativePort 
                      << " but HTTP client requires port " << kDefaultHttpPort 
                      << ". Set CLICKHOUSE_HTTP_PORT to override the HTTP port if needed." << std::endl;
            httpPort = kDefaultHttpPort;
        }
    }

    std::cout << "[ClickHouse] Environment config - host: " << host
              << ", http_port: " << httpPort
              << ", native_port: " << nativePort
              << ", database: " << database
              << ", user: " << user << std::endl;

    return std::make_unique<ClickHouseHistoryRepository>(host, httpPort, database);
}

bool ClickHouseHistoryRepository::generateMockData() {
    std::lock_guard<std::mutex> lock(client_mutex_);
    if (!connected_) {
        std::cout << "[MockData] Not connected to ClickHouse, skipping mock data generation" << std::endl;
        return false;
    }

    try {
        std::cout << "[MockData] Starting mock data generation check..." << std::endl;

        // Random number generator
        std::random_device rd;
        std::mt19937 gen(rd());
        std::uniform_real_distribution<double> priceDist(0.0, 1.0);
        std::uniform_int_distribution<int> volumeDist(1000000, 6000000);
        std::uniform_int_distribution<int> tickVolumeDist(100, 1100);
        std::uniform_int_distribution<int> symbolDist(0, 7);

        // Symbols we want to generate data for
        std::vector<std::string> symbols = {
            "BTC-USD", "ETH-USD", "ADA-USD", "SOL-USD", "DOGE-USD",
            "AVAX-USD", "MATIC-USD", "LINK-USD"
        };

        // Base prices for each symbol
        std::map<std::string, double> basePrices = {
            {"BTC-USD", 45000.0},
            {"ETH-USD", 2500.0},
            {"ADA-USD", 0.45},
            {"SOL-USD", 95.0},
            {"DOGE-USD", 0.08},
            {"AVAX-USD", 25.0},
            {"MATIC-USD", 0.85},
            {"LINK-USD", 12.5}
        };

        auto now = std::chrono::system_clock::now();
        auto startTime = now - std::chrono::hours(24 * 7); // 7 days ago

        // Using HTTP mode for mock data generation
        std::cout << "[MockData] Using HTTP mode for mock data generation" << std::endl;

        // Check if data already exists
        auto checkResponse = cpr::Post(
            cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
            cpr::Body{"SELECT COUNT(*) as count FROM " + database_ + ".ticks LIMIT 1"}
        );
        
        if (checkResponse.status_code == 200 && checkResponse.text.find("\"count\":\"0\"") == std::string::npos) {
            std::cout << "[MockData] Data already exists, skipping generation" << std::endl;
            return true;
        }

        // Generate mock ticks data for each symbol
        std::cout << "[MockData] Generating mock ticks data..." << std::endl;
        for (const auto& symbol : symbols) {
            double basePrice = basePrices[symbol];
            auto currentTime = startTime;
            
            // Generate 1000 ticks per day for 7 days = 7000 ticks per symbol
            for (int day = 0; day < 7; day++) {
                for (int tick = 0; tick < 1000; tick++) {
                    // Random price movement (-2% to +2%)
                    double priceChange = (priceDist(gen) - 0.5) * 0.04; // -2% to +2%
                    basePrice *= (1.0 + priceChange);
                    
                    // Ensure price doesn't go negative
                    if (basePrice <= 0.01) basePrice = basePrices[symbol] * 0.5;
                    
                    double bid = basePrice * 0.999;
                    double ask = basePrice * 1.001;
                    double last = basePrice;
                    int volume = tickVolumeDist(gen);
                    
                    // Insert tick data
                    std::stringstream insertSql;
                    insertSql << "INSERT INTO " << database_ << ".ticks VALUES ('" 
                              << symbol << "', '" 
                              << std::chrono::duration_cast<std::chrono::seconds>(currentTime.time_since_epoch()).count()
                              << "', " << bid << ", " << ask << ", " << last << ", " << volume << ")";
                    
                    auto insertResponse = cpr::Post(
                        cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                        cpr::Body{insertSql.str()}
                    );
                    
                    if (insertResponse.status_code != 200) {
                        std::cout << "[MockData] Failed to insert tick for " << symbol << std::endl;
                    }
                    
                    // Advance time by random interval (30-300 seconds)
                    currentTime += std::chrono::seconds(30 + (tick % 270));
                }
            }
        }
        
        // Generate mock orders_log data
        std::cout << "[MockData] Generating mock orders_log data..." << std::endl;
        std::vector<std::string> orderStatuses = {"FILLED", "PENDING", "CANCELLED"};
        
        for (int i = 0; i < 50; i++) { // 50 sample orders
            std::string orderId = "ORD_" + std::to_string(std::chrono::duration_cast<std::chrono::milliseconds>(now.time_since_epoch()).count() + i);
            std::string idempKey = "idemp_" + std::to_string(i);
            std::string status = orderStatuses[i % 3];
            
            int symbolIndex = i % symbols.size();
            std::string symbol = symbols[symbolIndex];
            double price = basePrices[symbol] * (1.0 + (priceDist(gen) - 0.5) * 0.1);
            
            nlohmann::json result = {
                {"symbol", symbol},
                {"side", i % 2 ? "SELL" : "BUY"},
                {"price", price},
                {"quantity", 1.0 + (i % 10)},
                {"type", "LIMIT"}
            };
            
            std::stringstream insertSql;
            insertSql << "INSERT INTO " << database_ << ".orders_log VALUES ('"
                      << idempKey << "', '"
                      << std::chrono::duration_cast<std::chrono::seconds>(now.time_since_epoch()).count() - (i * 3600)
                      << "', '" << status << "', '" << orderId << "', '" << result.dump() << "')";
            
            auto insertResponse = cpr::Post(
                cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                cpr::Body{insertSql.str()}
            );
            
            if (insertResponse.status_code == 200) {
                std::cout << "[MockData] Inserted order " << orderId << " for " << symbol << std::endl;
            }
        }

        std::cout << "[MockData] Mock data generation completed successfully!" << std::endl;
        return true;

    } catch (const std::exception& e) {
        logError("Mock data generation", e);
        return false;
    }
}

bool ClickHouseHistoryRepository::logOrder(const std::string& idempKey, const std::string& status, const std::string& orderId, const std::string& resultJson) {
    std::cout << "[OrderLog] Queuing order for background logging. Key: " << idempKey << std::endl;
    try {
        {
            std::lock_guard<std::mutex> lock(queue_mutex_);
            log_queue_.push({idempKey, status, orderId, resultJson});
        }
        queue_cond_.notify_one();
        return true;
    } catch (const std::exception& e) {
        std::cerr << "[OrderLog] Failed to queue order log: " << e.what() << std::endl;
        return false;
    }
}

void ClickHouseHistoryRepository::startWriterThread() {
    stop_writer_ = false;
    writer_thread_ = std::thread(&ClickHouseHistoryRepository::writerLoop, this);
    std::cout << "[ClickHouse] Writer thread started." << std::endl;
}

void ClickHouseHistoryRepository::stopWriterThread() {
    std::cout << "[ClickHouse] Stopping writer thread..." << std::endl;
    stop_writer_ = true;
    queue_cond_.notify_one();
    if (writer_thread_.joinable()) {
        writer_thread_.join();
        std::cout << "[ClickHouse] Writer thread stopped." << std::endl;
    }
}

void ClickHouseHistoryRepository::writerLoop() {
    std::cout << "[DBWriter] Writer thread started." << std::endl;

    while (!stop_writer_) {
        OrderLogData data;
        {
            std::unique_lock<std::mutex> lock(queue_mutex_);
            queue_cond_.wait(lock, [this] { return !log_queue_.empty() || stop_writer_; });

            if (stop_writer_ && log_queue_.empty()) {
                return;
            }

            data = log_queue_.front();
            log_queue_.pop();
        }

        try {
            auto now = std::chrono::system_clock::now();
            auto timestamp = std::chrono::system_clock::to_time_t(now);

            // Use HTTP API for background logging
            if (connected_) {
                std::string insertSql = "INSERT INTO " + database_ + ".orders_log VALUES ('" + 
                    data.idempKey + "', " + std::to_string(timestamp) + ", '" + 
                    data.status + "', '" + data.orderId + "', '" + data.resultJson + "')";

                std::cout << "[DBWriter] Attempting HTTP insert for: " << data.idempKey << std::endl;

                try {
                    auto response = cpr::Post(
                        cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
                        cpr::Body{insertSql}
                    );

                    if (response.status_code == 200) {
                        std::cout << "[DBWriter] ✅ Successfully inserted: " << data.idempKey << std::endl;
                    } else {
                        std::cerr << "[DBWriter] ❌ HTTP " << response.status_code << " for " 
                                  << data.idempKey << ": " << response.text << std::endl;
                    }
                } catch (const std::exception& http_e) {
                    std::cerr << "[DBWriter] ❌ HTTP exception for " << data.idempKey 
                              << ": " << http_e.what() << std::endl;
                }
            } else {
                std::cout << "[DBWriter] ⚠️  Not connected, skipping: " << data.idempKey << std::endl;
            }

        } catch (const std::exception& e) {
            std::cerr << "[DBWriter] Failed to write order log " << data.idempKey << " to ClickHouse: " << e.what() << std::endl;
        }
    }

    std::cout << "[DBWriter] Writer thread exiting." << std::endl;
}

std::vector<nlohmann::json> ClickHouseHistoryRepository::getOrderHistory(const std::string& fromTime, const std::string& toTime, int32_t limit) {
    std::lock_guard<std::mutex> lock(client_mutex_);
    std::vector<nlohmann::json> orderHistory;
    
    if (!connected_) {
        std::cout << "[OrderHistory] Not connected, returning empty result" << std::endl;
        return orderHistory;
    }

    try {
        std::stringstream sql;
        
        // Get latest status for each order (important for canceled orders)
        sql << "SELECT "
            << "  ol1.order_id, "
            << "  ol1.idemp_key, "
            << "  ol1.ts, "
            << "  ol1.status, "
            << "  ol1.result "
            << "FROM " << database_ << ".orders_log ol1 "
            << "INNER JOIN ( "
            << "  SELECT order_id, MAX(ts) as max_ts "
            << "  FROM " << database_ << ".orders_log ";
        
        if (!fromTime.empty() && !toTime.empty()) {
            sql << "  WHERE ts >= '" << fromTime << "' AND ts <= '" << toTime << "' ";
        } else if (!fromTime.empty()) {
            sql << "  WHERE ts >= '" << fromTime << "' ";
        } else if (!toTime.empty()) {
            sql << "  WHERE ts <= '" << toTime << "' ";
        }
        
        sql << "  GROUP BY order_id "
            << ") ol2 ON ol1.order_id = ol2.order_id AND ol1.ts = ol2.max_ts "
            << "ORDER BY ol1.ts DESC LIMIT " << limit << " FORMAT JSON";

        std::cout << "[OrderHistory] Executing HTTP query: " << sql.str() << std::endl;

        auto response = cpr::Post(
            cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
            cpr::Body{sql.str()}
        );

        if (response.status_code == 200) {
            std::cout << "[OrderHistory] HTTP query successful, parsing JSON..." << std::endl;
            
            // Parse JSON response from ClickHouse
            auto jsonResponse = nlohmann::json::parse(response.text);
            auto data = jsonResponse["data"];
            
            for (const auto& row : data) {
                nlohmann::json orderRecord;
                orderRecord["idemp_key"] = row.value("idemp_key", "");
                orderRecord["timestamp"] = row.value("ts", "");
                orderRecord["status"] = row.value("status", "");
                orderRecord["order_id"] = row.value("order_id", "");
                
                // Parse result JSON if available
                try {
                    auto resultJson = nlohmann::json::parse(row.value("result", "{}"));
                    orderRecord["result"] = resultJson;
                    
                    // Extract order details for display (especially important for cancelled orders)
                    if (resultJson.is_object()) {
                        orderRecord["symbol"] = resultJson.value("symbol", "");
                        orderRecord["side"] = resultJson.value("side", "");
                        orderRecord["price"] = resultJson.value("price", 0.0);
                        orderRecord["quantity"] = resultJson.value("quantity", 0.0);
                        orderRecord["type"] = resultJson.value("type", "");
                    }
                } catch (...) {
                    orderRecord["result"] = nlohmann::json::object();
                    orderRecord["symbol"] = "";
                    orderRecord["side"] = "";
                    orderRecord["price"] = 0.0;
                    orderRecord["quantity"] = 0.0;
                    orderRecord["type"] = "";
                }
                
                orderHistory.push_back(orderRecord);
            }
            
            std::cout << "[OrderHistory] Parsed " << orderHistory.size() << " order records from HTTP response" << std::endl;
        } else {
            std::cerr << "[OrderHistory] HTTP query failed (status " << response.status_code << "): " << response.text << std::endl;
        }

    } catch (const std::exception& e) {
        logError("Order history fetch", e);
    }

    return orderHistory;
}

std::optional<nlohmann::json> ClickHouseHistoryRepository::getOrderDetails(const std::string& orderId) {
    std::lock_guard<std::mutex> lock(client_mutex_);
    
    if (!connected_) {
        std::cout << "[OrderDetails] Not connected, returning empty result" << std::endl;
        return std::nullopt;
    }

    try {
        std::stringstream sql;
        sql << "SELECT idemp_key, ts, status, order_id, result FROM " << database_ << ".orders_log "
            << "WHERE order_id = '" << orderId << "' "
            << "ORDER BY ts DESC LIMIT 1 FORMAT JSON";

        std::cout << "[OrderDetails] Executing HTTP query: " << sql.str() << std::endl;

        auto response = cpr::Post(
            cpr::Url{"http://" + host_ + ":" + std::to_string(port_)},
            cpr::Body{sql.str()}
        );

        if (response.status_code == 200) {
            auto jsonResponse = nlohmann::json::parse(response.text);
            auto data = jsonResponse["data"];
            
            if (!data.empty()) {
                auto row = data[0];
                nlohmann::json orderDetails;
                orderDetails["idemp_key"] = row.value("idemp_key", "");
                orderDetails["timestamp"] = row.value("ts", "");
                orderDetails["status"] = row.value("status", "");
                orderDetails["order_id"] = row.value("order_id", "");
                
                // Parse result JSON if available
                try {
                    auto resultJson = nlohmann::json::parse(row.value("result", "{}"));
                    orderDetails["result"] = resultJson;
                } catch (...) {
                    orderDetails["result"] = nlohmann::json::object();
                }
                
                std::cout << "[OrderDetails] Found order details for: " << orderId << std::endl;
                return orderDetails;
            }
        } else {
            std::cerr << "[OrderDetails] HTTP query failed (status " << response.status_code << "): " << response.text << std::endl;
        }

    } catch (const std::exception& e) {
        logError("Order details fetch", e);
    }

    return std::nullopt;
}

} // namespace trading::infrastructure::database
