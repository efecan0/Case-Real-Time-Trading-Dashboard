# Trading Dashboard Frontend

## Running with Docker

### Method 1: Single Command
```bash
./run.sh
```

### Method 2: Docker Compose
```bash
docker-compose up --build
```

### Method 3: Direct Docker
```bash
docker build -t trading-dashboard .
docker run -p 3000:3000 trading-dashboard
```

The application will be available at [http://localhost:3000](http://localhost:3000).
