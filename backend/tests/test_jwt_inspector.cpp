#include <catch2/catch_test_macros.hpp>
#include <catch2/matchers/catch_matchers_string.hpp>
#include "infrastructure/auth/jwt_inspector.hpp"

using namespace trading::infrastructure::auth;

TEST_CASE("JwtInspector - Token Validation", "[auth]") {
    JwtInspector inspector("test-secret-key");
    
    SECTION("Valid token (demo implementation)") {
        std::string token = "any-valid-token";
        auto result = inspector.verify(token);
        
        REQUIRE(result.has_value());
        REQUIRE(result->subject == "demo-user");
        REQUIRE(result->roles.size() == 1);
        REQUIRE(result->roles[0] == "trader");
    }
    
    SECTION("Another valid token") {
        std::string token = "another-token";
        auto result = inspector.verify(token);
        
        REQUIRE(result.has_value());
        REQUIRE(result->subject == "demo-user");
        REQUIRE(result->roles.size() == 1);
        REQUIRE(result->roles[0] == "trader");
    }
    
    SECTION("Empty token") {
        std::string token = "";
        auto result = inspector.verify(token);
        
        REQUIRE_FALSE(result.has_value());
    }
}

TEST_CASE("JwtInspector - Role Validation", "[auth]") {
    JwtInspector inspector("test-secret-key");
    
    SECTION("Demo role validation") {
        std::string token = "any-token";
        auto result = inspector.verify(token);
        
        REQUIRE(result.has_value());
        REQUIRE(result->hasRole("trader"));
        REQUIRE_FALSE(result->hasRole("admin"));
        REQUIRE_FALSE(result->hasRole("viewer"));
    }
}
