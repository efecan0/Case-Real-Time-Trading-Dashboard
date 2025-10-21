#!/bin/bash

echo "🚀 Setting up ClickHouse for Bull Trading..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

if ! command -v docker-compose &> /dev/null; then
    echo "❌ Docker Compose is not installed. Please install Docker Compose first."
    exit 1
fi

echo "✅ Docker and Docker Compose found"

# Start ClickHouse server
echo "🐳 Starting ClickHouse server..."
docker-compose up -d clickhouse

# Wait for ClickHouse to be ready
echo "⏳ Waiting for ClickHouse to be ready..."
sleep 10

# Test connection
echo "🧪 Testing ClickHouse connection..."
max_attempts=30
attempt=1

while [ $attempt -le $max_attempts ]; do
    if curl -s http://localhost:8123/health > /dev/null 2>&1; then
        echo "✅ ClickHouse is ready!"
        break
    else
        echo "⏳ Attempt $attempt/$max_attempts - waiting for ClickHouse..."
        sleep 2
        attempt=$((attempt + 1))
    fi
done

if [ $attempt -gt $max_attempts ]; then
    echo "❌ ClickHouse failed to start properly"
    exit 1
fi

# Create database and tables
echo "📊 Setting up database and tables..."

# Create trading_db database
curl -s 'http://localhost:8123/' --data-binary 'CREATE DATABASE IF NOT EXISTS trading_db' || echo "Database might already exist"

# Create tables
curl -s 'http://localhost:8123/' --data-binary 'CREATE TABLE IF NOT EXISTS trading_db.ticks (
    symbol String,
    ts DateTime64(6),
    bid Float64,
    ask Float64,
    last Float64,
    volume UInt64
) ENGINE = MergeTree()
ORDER BY (symbol, ts)
PARTITION BY toYYYYMMDD(ts)
TTL ts + INTERVAL 30 DAY'

curl -s 'http://localhost:8123/' --data-binary 'CREATE TABLE IF NOT EXISTS trading_db.candles_1m (
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
TTL open_time + INTERVAL 180 DAY'

echo "✅ ClickHouse setup completed!"
echo ""
echo "📋 Connection details:"
echo "  Host: localhost"
echo "  Port: 9000 (native) / 8123 (HTTP)"
echo "  Database: trading_db"
echo "  User: default"
echo "  Password: (empty)"
echo ""
echo "🔧 Environment variables for your application:"
echo "  export CLICKHOUSE_HOST=localhost"
echo "  export CLICKHOUSE_PORT=9000"
echo "  export CLICKHOUSE_HTTP_PORT=8123"
echo "  export CLICKHOUSE_DATABASE=trading_db"
echo "  export CLICKHOUSE_USER=default"
echo "  export CLICKHOUSE_PASSWORD="
echo ""
echo "🧪 Test connection:"
echo "  curl 'http://localhost:8123/' --data-binary 'SELECT 1'"
