#pragma once

#include <map>
#include <string>
#include <vector>
#include <iostream>
#include <msgpack.hpp>
#include <nlohmann/json.hpp>

// MsgPack operator definitions
namespace msgpack {
    MSGPACK_API_VERSION_NAMESPACE(v1) {
        template <typename Stream>
        inline packer<Stream>& operator<<(packer<Stream>& o, const std::string& v) {
            o.pack_str(v.size());
            o.pack_str_body(v.data(), v.size());
            return o;
        }

        template <typename Stream>
        inline packer<Stream>& operator<<(packer<Stream>& o, const char* v) {
            o.pack_str(strlen(v));
            o.pack_str_body(v, strlen(v));
            return o;
        }

        // Special definitions for fixed-length character arrays
        template <typename Stream, size_t N>
        inline packer<Stream>& operator<<(packer<Stream>& o, const char (&v)[N]) {
            o.pack_str(N-1);  // N-1 because last character is null terminator
            o.pack_str_body(v, N-1);
            return o;
        }

        // Special definitions for object class
        template <size_t N>
        inline void operator<<(object& o, const char (&v)[N]) {
            o.type = type::STR;
            o.via.str.size = N-1;
            o.via.str.ptr = v;
        }
    }

    MSGPACK_API_VERSION_NAMESPACE(v2) {
        template <typename Stream>
        inline packer<Stream>& operator<<(packer<Stream>& o, const std::string& v) {
            o.pack_str(v.size());
            o.pack_str_body(v.data(), v.size());
            return o;
        }

        template <typename Stream>
        inline packer<Stream>& operator<<(packer<Stream>& o, const char* v) {
            o.pack_str(strlen(v));
            o.pack_str_body(v, strlen(v));
            return o;
        }

        // Special definitions for fixed-length character arrays
        template <typename Stream, size_t N>
        inline packer<Stream>& operator<<(packer<Stream>& o, const char (&v)[N]) {
            o.pack_str(N-1);  // N-1 because last character is null terminator
            o.pack_str_body(v, N-1);
            return o;
        }

        // Special definitions for object class
        template <size_t N>
        inline void operator<<(object& o, const char (&v)[N]) {
            o.type = type::STR;
            o.via.str.size = N-1;
            o.via.str.ptr = v;
        }
    }
}

// Helper function to recursively convert MsgPack object to JSON
inline nlohmann::json convertMsgPackToJson(const msgpack::object& obj) {
    switch (obj.type) {
        case msgpack::type::STR: {
            std::string str;
            obj.convert(str);
            return str;
        }
        case msgpack::type::POSITIVE_INTEGER:
        case msgpack::type::NEGATIVE_INTEGER: {
            int64_t num;
            obj.convert(num);
            return num;
        }
        case msgpack::type::FLOAT: {
            double num;
            obj.convert(num);
            return num;
        }
        case msgpack::type::BOOLEAN: {
            bool b;
            obj.convert(b);
            return b;
        }
        case msgpack::type::ARRAY: {
            nlohmann::json::array_t arr;
            for (size_t i = 0; i < obj.via.array.size; i++) {
                arr.push_back(convertMsgPackToJson(obj.via.array.ptr[i]));
            }
            return arr;
        }
        case msgpack::type::MAP: {
            nlohmann::json::object_t map;
            for (size_t i = 0; i < obj.via.map.size; i++) {
                const auto& pair = obj.via.map.ptr[i];
                std::string key;
                pair.key.convert(key);
                map[key] = convertMsgPackToJson(pair.val);
            }
            return map;
        }
        default:
            return nlohmann::json::object();
    }
 }

// Helper function to parse MsgPack payload as map
inline nlohmann::json parseMsgPackPayload(const std::vector<uint8_t>& req) {
    try {
        // First parse msgpack
        msgpack::object_handle oh = msgpack::unpack(
            reinterpret_cast<const char*>(req.data()),
            req.size()
        );
        
        // Get object
        msgpack::object obj = oh.get();
        
        // Recursively convert object to JSON
        return convertMsgPackToJson(obj);
    }
    catch (const std::exception& ex) {
        return nlohmann::json::object();
    }
}
