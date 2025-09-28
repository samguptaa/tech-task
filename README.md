# Fabacus Reservation Service

A high-performance TypeScript Node.js backend service for managing event seat reservations using Redis and Docker.

## Features

- **Event Management**: Create events with 10-1000 seats
- **Seat Holding**: Hold seats for a configurable duration (default: 60 seconds)
- **Seat Reservation**: Reserve held seats permanently
- **Available Seats**: List available seats (excluding held and reserved)
- **User Limits**: Limit number of seats a user can hold (bonus feature)
- **Hold Refresh**: Extend seat hold duration (bonus feature)
- **Redis Integration**: High-performance caching and data persistence
- **Docker Support**: Containerized deployment with Docker Compose

## Architecture

### System Design

The service uses a microservices architecture with the following components:

1. **Express.js API Server**: RESTful API endpoints
2. **Redis Database**: In-memory data store for high-performance seat management
3. **Docker Containers**: Containerized deployment for scalability

### Data Model

- **Events**: Unique events with configurable seat counts
- **Seats**: Individual seats with status (available/held/reserved)
- **Holds**: Temporary seat reservations with expiration
- **Reservations**: Permanent seat assignments

### Redis Data Structure

```
event:{eventId} -> Event metadata
event_seats:{eventId} -> Hash of all seats for an event
seat_hold:{eventId}:{seatNumber} -> Hold information with TTL
seat_reserved:{eventId}:{seatNumber} -> Reservation information
user_holds:{userId}:{eventId} -> Set of seats held by user
```

## API Endpoints

### Events

- `POST /api/events` - Create a new event
- `GET /api/events/:eventId` - Get event details
- `GET /api/events/:eventId/seats/available` - Get available seats
- `GET /api/events/:eventId/seats/:seatNumber` - Get seat status

### Seats

- `POST /api/seats/:eventId/:seatNumber/hold` - Hold a seat
- `POST /api/seats/:eventId/:seatNumber/reserve` - Reserve a held seat
- `POST /api/seats/:eventId/:seatNumber/refresh` - Refresh seat hold
- `GET /api/seats/:eventId/:seatNumber/status` - Get seat status
- `GET /api/seats/:eventId/user/:userId/holds` - Get user's holds

## Quick Start

### Prerequisites

- Docker and Docker Compose
- Node.js 18+ (for local development)
- TypeScript 5.2+ (for development)

### Using Docker Compose (Recommended)

1. **Clone and setup**:
   ```bash
   git clone <repository-url>
   cd fabacus
   ```

2. **Start services**:
   ```bash
   docker-compose up -d
   ```

3. **Verify deployment**:
   ```bash
   curl http://localhost:3000/health
   ```

### Local Development

1. **Install dependencies**:
   ```bash
   npm install
   ```

2. **Start Redis** (using Docker):
   ```bash
   docker run -d -p 6379:6379 redis:7-alpine
   ```

3. **Start application**:
   ```bash
   npm run dev
   ```

4. **Build for production**:
   ```bash
   npm run build
   npm start
   ```

### API Usage Examples

The project includes comprehensive usage examples in the `examples/` directory:

```bash
# Run the complete API usage examples
npx ts-node examples/api-usage.ts
```

This will demonstrate:
- Creating events
- Holding and reserving seats
- Concurrent booking scenarios
- Error handling
- User hold management

## API Usage Examples

### 1. Create an Event

```bash
curl -X POST http://localhost:3000/api/events \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Concert 2024",
    "description": "Annual music concert",
    "totalSeats": 100
  }'
```

### 2. Get Available Seats

```bash
curl http://localhost:3000/api/events/{eventId}/seats/available
```

### 3. Hold a Seat

```bash
curl -X POST http://localhost:3000/api/seats/{eventId}/1/hold \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "holdDuration": 60
  }'
```

### 4. Reserve a Seat

```bash
curl -X POST http://localhost:3000/api/seats/{eventId}/1/reserve \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123e4567-e89b-12d3-a456-426614174000"
  }'
```

### 5. Refresh Hold

```bash
curl -X POST http://localhost:3000/api/seats/{eventId}/1/refresh \
  -H "Content-Type: application/json" \
  -d '{
    "userId": "123e4567-e89b-12d3-a456-426614174000",
    "holdDuration": 120
  }'
```

## Configuration

### Environment Variables

- `NODE_ENV`: Environment (development/production)
- `PORT`: Server port (default: 3000)
- `REDIS_HOST`: Redis host (default: localhost)
- `REDIS_PORT`: Redis port (default: 6379)
- `MAX_HOLDS_PER_USER`: Maximum seats a user can hold (default: 5)

### Redis Configuration

The service uses Redis with the following optimizations:
- **Memory Management**: 256MB limit with LRU eviction
- **Persistence**: AOF (Append Only File) for durability
- **Connection Pooling**: Efficient connection management
- **TTL Support**: Automatic expiration for seat holds

## Performance Considerations

### Scalability
- **Horizontal Scaling**: Stateless design allows multiple instances
- **Redis Clustering**: Support for Redis Cluster for high availability
- **Load Balancing**: Compatible with load balancers

### Optimization
- **Connection Pooling**: Efficient Redis connection management
- **Data Structure**: Optimized Redis data structures for fast access
- **Caching**: In-memory caching for frequently accessed data
- **Rate Limiting**: Built-in rate limiting to prevent abuse

## Monitoring and Logging

### Health Checks
- Application health: `GET /health`
- Redis connectivity: Automatic monitoring
- Docker health checks: Container-level monitoring

### Logging
- **Structured Logging**: JSON format with timestamps
- **Error Tracking**: Comprehensive error logging
- **Performance Metrics**: Request/response logging

## Testing

### Run Tests
```bash
npm test
```

### Test Coverage
- Unit tests for business logic
- Integration tests for API endpoints
- Redis operation tests

## Deployment

### Production Deployment

1. **Environment Setup**:
   ```bash
   cp env.example .env
   # Edit .env with production values
   ```

2. **Docker Compose**:
   ```bash
   docker-compose up -d
   ```

3. **Health Check**:
   ```bash
   curl http://localhost:3000/health
   ```

### Scaling

- **Horizontal Scaling**: Deploy multiple app instances
- **Redis Clustering**: Use Redis Cluster for high availability
- **Load Balancing**: Use nginx or cloud load balancer

## Security Features

- **Input Validation**: Comprehensive request validation
- **Rate Limiting**: Protection against abuse
- **Security Headers**: Helmet.js for security headers
- **CORS Configuration**: Configurable CORS settings
- **Error Handling**: Secure error responses

## Troubleshooting

### Common Issues

1. **Redis Connection Failed**:
   - Check Redis service status
   - Verify connection parameters
   - Check network connectivity

2. **Seat Hold Expired**:
   - Check Redis TTL configuration
   - Verify system time synchronization
   - Check Redis memory usage

3. **High Memory Usage**:
   - Monitor Redis memory usage
   - Check for memory leaks
   - Optimize data structures

### Debug Mode

Enable debug logging:
```bash
LOG_LEVEL=debug npm start
```

## License

MIT License - see LICENSE file for details.