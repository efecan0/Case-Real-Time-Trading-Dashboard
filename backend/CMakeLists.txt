cmake_minimum_required(VERSION 3.16)

project(bull-trading VERSION 1.0.0 LANGUAGES CXX)

set(CMAKE_CXX_STANDARD 20)
set(CMAKE_CXX_STANDARD_REQUIRED ON)

# Find packages via vcpkg (automatically handled by vcpkg.json and CMakePresets.json)
find_package(cpr CONFIG REQUIRED)
find_package(nlohmann_json CONFIG REQUIRED)
find_package(jwt-cpp CONFIG REQUIRED)
find_package(msgpack-cxx CONFIG REQUIRED)
find_package(Catch2 CONFIG REQUIRED)

# Try to find ClickHouse client library via vcpkg
find_package(clickhouse-cpp CONFIG QUIET)

if(clickhouse-cpp_FOUND)
    message(STATUS "ClickHouse client library found via vcpkg - enabling ClickHouse integration")
    add_compile_definitions(CLICKHOUSE_AVAILABLE)
    set(CLICKHOUSE_LIBRARIES clickhouse-cpp::clickhouse-cpp)
else()
    # Try to find the library manually from vcpkg
    find_library(CLICKHOUSE_LIBRARY
        NAMES clickhouse-cpp
        PATHS ${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-linux/lib
        NO_DEFAULT_PATH
    )

    if(CLICKHOUSE_LIBRARY)
        message(STATUS "ClickHouse library found manually: ${CLICKHOUSE_LIBRARY}")
        add_compile_definitions(CLICKHOUSE_AVAILABLE)
        set(CLICKHOUSE_LIBRARIES ${CLICKHOUSE_LIBRARY})
    else()
        message(STATUS "ClickHouse client library not found - using HTTP mode")
    endif()
endif()

# Add BinaryRPC framework as submodule
add_subdirectory(third_party/binaryrpc-framework)

# Bull Trading Server
add_executable(bull-trading
    advanced-trading.cpp
    src/domain/types.hpp
    src/domain/interfaces.hpp
    src/infrastructure/cache/idempotency_cache.hpp
    src/infrastructure/cache/idempotency_cache.cpp
    src/application/risk_validator.hpp
    src/application/risk_validator.cpp
    src/interfaces/advanced_trading_server.hpp
    src/interfaces/advanced_trading_server.cpp
)

# Add ClickHouse files
target_sources(bull-trading PRIVATE
    src/infrastructure/database/clickhouse_repository.hpp
    src/infrastructure/database/clickhouse_repository.cpp
)
    
    target_include_directories(bull-trading PRIVATE
        ${CMAKE_CURRENT_SOURCE_DIR}
        ${CMAKE_SOURCE_DIR}/include
        ${CMAKE_SOURCE_DIR}/src
        ${CMAKE_SOURCE_DIR}/third_party/binaryrpc-framework/include
    )
    
    if(MSVC)
        target_compile_options(bull-trading PRIVATE 
            $<$<CONFIG:Debug>:/MDd /D_ITERATOR_DEBUG_LEVEL=2>
            $<$<CONFIG:Release>:/MD /D_ITERATOR_DEBUG_LEVEL=0>
        )
    endif()
    
    target_link_libraries(bull-trading PRIVATE 
        binaryrpc_core 
        cpr::cpr
        nlohmann_json::nlohmann_json
        jwt-cpp::jwt-cpp
        msgpack-cxx
        OpenSSL::SSL
        OpenSSL::Crypto
    )
    
    # Link ClickHouse library if found
    if(CLICKHOUSE_LIBRARIES)
        # Find ClickHouse dependencies
        find_library(LZ4_LIBRARY
            NAMES lz4
            PATHS ${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-linux/lib
            NO_DEFAULT_PATH
        )
        find_library(ZSTD_LIBRARY
            NAMES zstd
            PATHS ${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-linux/lib
            NO_DEFAULT_PATH
        )
        find_library(CITYHASH_LIBRARY
            NAMES cityhash
            PATHS ${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-linux/lib
            NO_DEFAULT_PATH
        )

        # Link ClickHouse and its dependencies
        target_link_libraries(bull-trading PRIVATE ${CLICKHOUSE_LIBRARIES})
        if(LZ4_LIBRARY)
            target_link_libraries(bull-trading PRIVATE ${LZ4_LIBRARY})
        endif()
        if(ZSTD_LIBRARY)
            target_link_libraries(bull-trading PRIVATE ${ZSTD_LIBRARY})
        endif()
        if(CITYHASH_LIBRARY)
            target_link_libraries(bull-trading PRIVATE ${CITYHASH_LIBRARY})
        endif()

        message(STATUS "ClickHouse library and dependencies linked successfully")

        # Also need to link include directories
        target_include_directories(bull-trading PRIVATE
            ${CMAKE_CURRENT_SOURCE_DIR}/vcpkg_installed/x64-linux/include
        )
    endif()
    
    # Compiler-specific options
    target_compile_features(bull-trading PRIVATE cxx_std_20)
    
    # Add compile definitions
    target_compile_definitions(bull-trading PRIVATE
        $<$<CONFIG:Debug>:DEBUG>
        $<$<CONFIG:Release>:NDEBUG>
    )



# Enable testing
enable_testing()

# Add test executable
add_executable(bull-trading-tests
    tests/test_idempotency_cache.cpp
    tests/test_risk_validator.cpp
    tests/test_domain_types.cpp
    src/domain/types.hpp
    src/domain/interfaces.hpp
    src/infrastructure/cache/idempotency_cache.hpp
    src/infrastructure/cache/idempotency_cache.cpp
    src/application/risk_validator.hpp
    src/application/risk_validator.cpp
)

# Include directories for tests
target_include_directories(bull-trading-tests PRIVATE
    src
    third_party/binaryrpc-framework/include
)

# Link test libraries
target_link_libraries(bull-trading-tests
    Catch2::Catch2WithMain
    nlohmann_json::nlohmann_json
    jwt-cpp::jwt-cpp
    msgpack-cxx
    OpenSSL::SSL
    OpenSSL::Crypto
)

# Add test to CTest
add_test(NAME BullTradingTests COMMAND bull-trading-tests)

message(STATUS "Successfully configured examples. Executable 'bull-trading' can be built.")
message(STATUS "Test executable 'bull-trading-tests' can be built.")
