#!/bin/bash

echo "🚀 Starting Real-Time Trading Dashboard with Docker..."

# Check if Docker is installed
if ! command -v docker &> /dev/null; then
    echo "❌ Docker is not installed. Please install Docker first."
    exit 1
fi

# Check if Docker Compose is available
if ! command -v docker-compose &> /dev/null && ! docker compose version &> /dev/null; then
    echo "❌ Docker Compose is not available. Please install Docker Compose."
    exit 1
fi

# Stop and remove existing containers
echo "🧹 Stopping existing containers..."
docker-compose down 2>/dev/null || docker compose down 2>/dev/null || true

# Build and start the application
echo "🔨 Building and starting the application..."
if command -v docker-compose &> /dev/null; then
    docker-compose up --build
else
    docker compose up --build
fi
