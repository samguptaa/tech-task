import request from 'supertest';
import app from '../app.js';
import { SeatService } from '../services/redisService.js';
import { MockSeatService } from '../types/index.js';

// Mock Redis for testing
jest.mock('../services/redisService.js', () => ({
    initializeRedis: jest.fn().mockResolvedValue(true),
    SeatService: {
        createEvent: jest.fn(),
        getEvent: jest.fn(),
        holdSeat: jest.fn(),
        reserveSeat: jest.fn(),
        refreshSeatHold: jest.fn(),
        getAvailableSeats: jest.fn(),
        getSeatStatus: jest.fn(),
        getUserHoldCount: jest.fn()
    }
}));

describe('Fabacus Reservation Service', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    describe('Health Check', () => {
        test('GET /health should return healthy status', async () => {
            const response = await request(app)
                .get('/health')
                .expect(200);

            expect(response.body).toHaveProperty('status', 'healthy');
            expect(response.body).toHaveProperty('service', 'fabacus-reservation-service');
            expect(response.body).toHaveProperty('timestamp');
        });
    });

    describe('Event Management', () => {
        test('POST /api/events should create a new event', async () => {
            const eventData = {
                name: 'Test Concert',
                description: 'Test event',
                totalSeats: 100
            };

            const mockEvent = {
                id: 'test-event-id',
                name: 'Test Concert',
                description: 'Test event',
                totalSeats: 100,
                createdAt: '2024-01-15T10:30:00.000Z',
                status: 'active'
            };

            (SeatService.createEvent as jest.MockedFunction<typeof SeatService.createEvent>).mockResolvedValue(mockEvent);

            const response = await request(app)
                .post('/api/events')
                .send(eventData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockEvent);
            expect(SeatService.createEvent).toHaveBeenCalledWith(
                expect.any(String), // eventId (UUID)
                100,
                'Test Concert',
                'Test event'
            );
        });

        test('POST /api/events should validate seat count', async () => {
            const eventData = {
                name: 'Test Concert',
                totalSeats: 5 // Invalid: less than 10
            };

            const response = await request(app)
                .post('/api/events')
                .send(eventData)
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Validation failed');
        });

        test('GET /api/events/:eventId should return event details', async () => {
            const mockEvent = {
                id: 'test-event-id',
                name: 'Test Concert',
                totalSeats: 100
            };

            (SeatService.getEvent as jest.MockedFunction<typeof SeatService.getEvent>).mockResolvedValue(mockEvent);

            const response = await request(app)
                .get('/api/events/test-event-id')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockEvent);
        });

        test('GET /api/events/:eventId should handle invalid event ID', async () => {
            const response = await request(app)
                .get('/api/events/invalid-id')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Invalid event ID format');
        });
    });

    describe('Seat Management', () => {
        test('POST /api/seats/:eventId/:seatNumber/hold should hold a seat', async () => {
            const holdData = {
                userId: '123e4567-e89b-12d3-a456-426614174000',
                holdDuration: 60
            };

            const mockHold = {
                eventId: 'test-event-id',
                seatNumber: 1,
                userId: '123e4567-e89b-12d3-a456-426614174000',
                heldAt: '2024-01-15T10:30:00.000Z',
                expiresAt: '2024-01-15T10:31:00.000Z'
            };

            (SeatService.holdSeat as jest.MockedFunction<typeof SeatService.holdSeat>).mockResolvedValue(mockHold);

            const response = await request(app)
                .post('/api/seats/test-event-id/1/hold')
                .send(holdData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockHold);
        });

        test('POST /api/seats/:eventId/:seatNumber/reserve should reserve a held seat', async () => {
            const reserveData = {
                userId: '123e4567-e89b-12d3-a456-426614174000'
            };

            const mockReservation = {
                eventId: 'test-event-id',
                seatNumber: 1,
                userId: '123e4567-e89b-12d3-a456-426614174000',
                reservedAt: '2024-01-15T10:30:00.000Z'
            };

            (SeatService.reserveSeat as jest.MockedFunction<typeof SeatService.reserveSeat>).mockResolvedValue(mockReservation);

            const response = await request(app)
                .post('/api/seats/test-event-id/1/reserve')
                .send(reserveData)
                .expect(201);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockReservation);
        });

        test('POST /api/seats/:eventId/:seatNumber/refresh should refresh a hold', async () => {
            const refreshData = {
                userId: '123e4567-e89b-12d3-a456-426614174000',
                holdDuration: 120
            };

            const mockRefresh = {
                eventId: 'test-event-id',
                seatNumber: 1,
                userId: '123e4567-e89b-12d3-a456-426614174000',
                heldAt: '2024-01-15T10:30:00.000Z',
                expiresAt: '2024-01-15T10:32:00.000Z'
            };

            (SeatService.refreshSeatHold as jest.MockedFunction<typeof SeatService.refreshSeatHold>).mockResolvedValue(mockRefresh);

            const response = await request(app)
                .post('/api/seats/test-event-id/1/refresh')
                .send(refreshData)
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockRefresh);
        });

        test('GET /api/events/:eventId/seats/available should return available seats', async () => {
            const mockAvailableSeats = [
                { seatNumber: 1, status: 'available' },
                { seatNumber: 3, status: 'available' }
            ];

            (SeatService.getAvailableSeats as jest.MockedFunction<typeof SeatService.getAvailableSeats>).mockResolvedValue(mockAvailableSeats);

            const response = await request(app)
                .get('/api/events/test-event-id/seats/available')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.availableSeats).toEqual(mockAvailableSeats);
            expect(response.body.data.totalAvailable).toBe(2);
        });

        test('GET /api/seats/:eventId/:seatNumber/status should return seat status', async () => {
            const mockSeatStatus = {
                eventId: 'test-event-id',
                seatNumber: 1,
                status: 'available',
                userId: null,
                heldAt: null,
                reservedAt: null
            };

            (SeatService.getSeatStatus as jest.MockedFunction<typeof SeatService.getSeatStatus>).mockResolvedValue(mockSeatStatus);

            const response = await request(app)
                .get('/api/seats/test-event-id/1/status')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data).toEqual(mockSeatStatus);
        });

        test('GET /api/seats/:eventId/user/:userId/holds should return user holds', async () => {
            (SeatService.getUserHoldCount as jest.MockedFunction<typeof SeatService.getUserHoldCount>).mockResolvedValue(2);

            const response = await request(app)
                .get('/api/seats/test-event-id/user/123e4567-e89b-12d3-a456-426614174000/holds')
                .expect(200);

            expect(response.body.success).toBe(true);
            expect(response.body.data.currentHolds).toBe(2);
            expect(response.body.data.maxHolds).toBe(5);
        });
    });

    describe('Error Handling', () => {
        test('Should handle 404 for non-existent routes', async () => {
            const response = await request(app)
                .get('/api/non-existent-route')
                .expect(404);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Not Found');
        });

        test('Should handle validation errors', async () => {
            const response = await request(app)
                .post('/api/events')
                .send({}) // Empty body
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Validation failed');
        });

        test('Should handle business logic errors', async () => {
            (SeatService.holdSeat as jest.MockedFunction<typeof SeatService.holdSeat>).mockRejectedValue(new Error('Seat is not available'));

            const response = await request(app)
                .post('/api/seats/test-event-id/1/hold')
                .send({
                    userId: '123e4567-e89b-12d3-a456-426614174000'
                })
                .expect(409);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Seat is not available');
        });
    });

    describe('Input Validation', () => {
        test('Should validate UUID format for event IDs', async () => {
            const response = await request(app)
                .get('/api/events/invalid-uuid')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Invalid event ID format');
        });

        test('Should validate seat numbers', async () => {
            const response = await request(app)
                .get('/api/seats/test-event-id/invalid-seat/status')
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Invalid seat number');
        });

        test('Should validate user IDs', async () => {
            const response = await request(app)
                .post('/api/seats/test-event-id/1/hold')
                .send({
                    userId: 'invalid-uuid'
                })
                .expect(400);

            expect(response.body.success).toBe(false);
            expect(response.body.error).toBe('Validation failed');
        });
    });
});