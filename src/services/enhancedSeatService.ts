import { Pool, PoolClient } from 'pg';
import { RedisClientType } from 'redis';
import { EventEmitter } from 'events';
import {
    Event,
    Seat,
    SeatHold,
    SeatReservation,
    AvailableSeat,
    SeatServiceInterface,
    UUID,
    SeatNumber,
    UserId,
    EventId
} from '../types/index.js';

interface MessageQueue {
    publish(queue: string, message: any): Promise<void>;
    subscribe(queue: string, handler: (message: any) => Promise<void>): Promise<void>;
}

interface WebSocketService {
    broadcast(eventId: string, message: any): void;
    sendToUser(userId: string, message: any): void;
}

/**
 * Enhanced Seat Service with PostgreSQL + Redis + Message Queues
 * Provides high-scale, reliable seat reservation operations
 */
export class EnhancedSeatService implements SeatServiceInterface {
    private eventEmitter = new EventEmitter();

    constructor(
        private pgPool: Pool,
        private redisClient: RedisClientType,
        private messageQueue: MessageQueue,
        private wsService: WebSocketService
    ) {
        this.setupEventHandlers();
    }

    /**
     * Setup event handlers for real-time updates
     */
    private setupEventHandlers(): void {
        this.eventEmitter.on('seatUpdated', (data) => {
            // Broadcast to WebSocket clients
            this.wsService.broadcast(data.eventId, {
                type: 'SEAT_UPDATE',
                seatNumber: data.seatNumber,
                status: data.status,
                userId: data.userId,
                timestamp: new Date().toISOString()
            });

            // Update Redis cache
            this.updateSeatCache(data.eventId, data.seatNumber, data);
        });

        this.eventEmitter.on('holdExpired', (data) => {
            this.releaseSeat(data.eventId, data.seatNumber);
        });
    }

    /**
     * Update Redis cache for fast access
     */
    private async updateSeatCache(eventId: EventId, seatNumber: SeatNumber, seatData: any): Promise<void> {
        const cacheKey = `seat:${eventId}:${seatNumber}`;
        await this.redisClient.setEx(cacheKey, 300, JSON.stringify(seatData)); // 5 min TTL
    }

    /**
     * Create a new event with PostgreSQL persistence
     */
    async createEvent(
        eventId: EventId,
        totalSeats: number,
        eventName: string,
        description: string = ''
    ): Promise<Event> {
        const client = await this.pgPool.connect();

        try {
            await client.query('BEGIN');

            // Validate seat count
            if (totalSeats < 10 || totalSeats > 1000) {
                throw new Error('Total seats must be between 10 and 1000');
            }

            // Check if event already exists
            const existingEvent = await client.query(
                'SELECT id FROM events WHERE id = $1',
                [eventId]
            );

            if (existingEvent.rows.length > 0) {
                throw new Error('Event already exists');
            }

            // Create event
            const eventResult = await client.query(
                `INSERT INTO events (id, name, description, total_seats, status, created_at)
         VALUES ($1, $2, $3, $4, 'active', NOW())
         RETURNING *`,
                [eventId, eventName, description, totalSeats]
            );

            const event = eventResult.rows[0];

            // Create all seats
            const seatValues = Array.from({ length: totalSeats }, (_, i) =>
                `('${eventId}', ${i + 1}, 'available')`
            ).join(',');

            await client.query(
                `INSERT INTO seats (event_id, seat_number, status) VALUES ${seatValues}`
            );

            // Cache event data in Redis
            await this.redisClient.setEx(
                `event:${eventId}`,
                3600, // 1 hour TTL
                JSON.stringify(event)
            );

            await client.query('COMMIT');

            return {
                id: event.id,
                name: event.name,
                description: event.description,
                totalSeats: event.total_seats,
                createdAt: event.created_at,
                status: event.status
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Get event details with Redis caching
     */
    async getEvent(eventId: EventId): Promise<Event> {
        // Try Redis cache first
        const cached = await this.redisClient.get(`event:${eventId}`);
        if (cached) {
            return JSON.parse(cached);
        }

        // Fallback to PostgreSQL
        const client = await this.pgPool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM events WHERE id = $1',
                [eventId]
            );

            if (result.rows.length === 0) {
                throw new Error('Event not found');
            }

            const event = result.rows[0];
            const eventData = {
                id: event.id,
                name: event.name,
                description: event.description,
                totalSeats: event.total_seats,
                createdAt: event.created_at,
                status: event.status
            };

            // Cache for future requests
            await this.redisClient.setEx(
                `event:${eventId}`,
                3600,
                JSON.stringify(eventData)
            );

            return eventData;
        } finally {
            client.release();
        }
    }

    /**
     * Hold a seat with distributed locking and real-time updates
     */
    async holdSeat(
        eventId: EventId,
        seatNumber: SeatNumber,
        userId: UserId,
        holdDuration: number = 60
    ): Promise<SeatHold> {
        const lockKey = `lock:seat:${eventId}:${seatNumber}`;
        const lockValue = `${userId}:${Date.now()}`;

        // Acquire distributed lock
        const lockAcquired = await this.redisClient.set(
            lockKey,
            lockValue,
            { EX: 10, NX: true } // 10 second lock, only if not exists
        );

        if (!lockAcquired) {
            throw new Error('Seat is currently being processed by another user');
        }

        const client = await this.pgPool.connect();

        try {
            await client.query('BEGIN');

            // Check seat availability with row-level locking
            const seatResult = await client.query(
                `SELECT * FROM seats 
         WHERE event_id = $1 AND seat_number = $2 
         FOR UPDATE`,
                [eventId, seatNumber]
            );

            if (seatResult.rows.length === 0) {
                throw new Error('Seat not found');
            }

            const seat = seatResult.rows[0];
            if (seat.status !== 'available') {
                throw new Error('Seat is not available');
            }

            // Check user hold limits
            const userHoldCount = await this.getUserHoldCount(eventId, userId);
            const maxHoldsPerUser = parseInt(process.env['MAX_HOLDS_PER_USER'] || '5', 10);

            if (userHoldCount >= maxHoldsPerUser) {
                throw new Error(`User can hold maximum ${maxHoldsPerUser} seats`);
            }

            // Update seat status
            const heldAt = new Date();
            await client.query(
                `UPDATE seats 
         SET status = 'held', user_id = $1, held_at = $2 
         WHERE event_id = $3 AND seat_number = $4`,
                [userId, heldAt, eventId, seatNumber]
            );

            // Create hold record in Redis with TTL
            const holdData: SeatHold = {
                eventId,
                seatNumber,
                userId,
                heldAt: heldAt.toISOString(),
                expiresAt: new Date(Date.now() + holdDuration * 1000).toISOString()
            };

            await this.redisClient.setEx(
                `hold:${eventId}:${seatNumber}`,
                holdDuration,
                JSON.stringify(holdData)
            );

            // Track user holds
            await this.redisClient.sAdd(`user_holds:${userId}:${eventId}`, seatNumber.toString());

            // Schedule hold expiration
            setTimeout(() => {
                this.eventEmitter.emit('holdExpired', { eventId, seatNumber });
            }, holdDuration * 1000);

            // Emit real-time update
            this.eventEmitter.emit('seatUpdated', {
                eventId,
                seatNumber,
                status: 'held',
                userId,
                heldAt: heldAt.toISOString()
            });

            // Queue notification
            await this.messageQueue.publish('notifications', {
                type: 'SEAT_HELD',
                userId,
                eventId,
                seatNumber,
                expiresAt: holdData.expiresAt
            });

            await client.query('COMMIT');

            return holdData;
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
            // Release distributed lock
            await this.redisClient.del(lockKey);
        }
    }

    /**
     * Reserve a held seat with transaction safety
     */
    async reserveSeat(eventId: EventId, seatNumber: SeatNumber, userId: UserId): Promise<SeatReservation> {
        const client = await this.pgPool.connect();

        try {
            await client.query('BEGIN');

            // Check if seat is held by the user
            const holdData = await this.redisClient.get(`hold:${eventId}:${seatNumber}`);
            if (!holdData) {
                throw new Error('Seat is not held');
            }

            const hold: SeatHold = JSON.parse(holdData);
            if (hold.userId !== userId) {
                throw new Error('Seat is held by another user');
            }

            // Check if hold has expired
            if (new Date(hold.expiresAt) < new Date()) {
                await this.releaseSeat(eventId, seatNumber);
                throw new Error('Seat hold has expired');
            }

            // Update seat status to reserved
            const reservedAt = new Date();
            await client.query(
                `UPDATE seats 
         SET status = 'reserved', reserved_at = $1 
         WHERE event_id = $2 AND seat_number = $3`,
                [reservedAt, eventId, seatNumber]
            );

            // Create reservation record
            const reservationResult = await client.query(
                `INSERT INTO reservations (event_id, seat_number, user_id, reserved_at)
         VALUES ($1, $2, $3, $4)
         RETURNING *`,
                [eventId, seatNumber, userId, reservedAt]
            );

            // Remove hold record
            await this.redisClient.del(`hold:${eventId}:${seatNumber}`);

            // Remove from user holds
            await this.redisClient.sRem(`user_holds:${userId}:${eventId}`, seatNumber.toString());

            // Emit real-time update
            this.eventEmitter.emit('seatUpdated', {
                eventId,
                seatNumber,
                status: 'reserved',
                userId,
                reservedAt: reservedAt.toISOString()
            });

            // Queue notification
            await this.messageQueue.publish('notifications', {
                type: 'SEAT_RESERVED',
                userId,
                eventId,
                seatNumber,
                reservedAt: reservedAt.toISOString()
            });

            await client.query('COMMIT');

            return {
                eventId,
                seatNumber,
                userId,
                reservedAt: reservedAt.toISOString()
            };
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Release a held seat (cleanup expired holds)
     */
    async releaseSeat(eventId: EventId, seatNumber: SeatNumber): Promise<void> {
        const client = await this.pgPool.connect();

        try {
            await client.query('BEGIN');

            // Get current seat data
            const seatResult = await client.query(
                'SELECT * FROM seats WHERE event_id = $1 AND seat_number = $2',
                [eventId, seatNumber]
            );

            if (seatResult.rows.length === 0) {
                throw new Error('Seat not found');
            }

            const seat = seatResult.rows[0];

            // Only release if currently held
            if (seat.status === 'held') {
                await client.query(
                    `UPDATE seats 
           SET status = 'available', user_id = NULL, held_at = NULL 
           WHERE event_id = $1 AND seat_number = $2`,
                    [eventId, seatNumber]
                );

                // Remove hold record
                await this.redisClient.del(`hold:${eventId}:${seatNumber}`);

                // Remove from user holds
                if (seat.user_id) {
                    await this.redisClient.sRem(`user_holds:${seat.user_id}:${eventId}`, seatNumber.toString());
                }

                // Emit real-time update
                this.eventEmitter.emit('seatUpdated', {
                    eventId,
                    seatNumber,
                    status: 'available',
                    userId: null
                });
            }

            await client.query('COMMIT');
        } catch (error) {
            await client.query('ROLLBACK');
            throw error;
        } finally {
            client.release();
        }
    }

    /**
     * Refresh a seat hold (extend duration)
     */
    async refreshSeatHold(
        eventId: EventId,
        seatNumber: SeatNumber,
        userId: UserId,
        holdDuration: number = 60
    ): Promise<SeatHold> {
        // Check if seat is held by the user
        const holdData = await this.redisClient.get(`hold:${eventId}:${seatNumber}`);
        if (!holdData) {
            throw new Error('Seat is not held');
        }

        const hold: SeatHold = JSON.parse(holdData);
        if (hold.userId !== userId) {
            throw new Error('Seat is held by another user');
        }

        // Check if hold has expired
        if (new Date(hold.expiresAt) < new Date()) {
            await this.releaseSeat(eventId, seatNumber);
            throw new Error('Seat hold has expired');
        }

        // Extend hold duration
        const newExpiresAt = new Date(Date.now() + holdDuration * 1000).toISOString();
        const updatedHold: SeatHold = {
            ...hold,
            expiresAt: newExpiresAt
        };

        await this.redisClient.setEx(
            `hold:${eventId}:${seatNumber}`,
            holdDuration,
            JSON.stringify(updatedHold)
        );

        // Reschedule expiration
        setTimeout(() => {
            this.eventEmitter.emit('holdExpired', { eventId, seatNumber });
        }, holdDuration * 1000);

        return updatedHold;
    }

    /**
     * Get available seats with Redis caching
     */
    async getAvailableSeats(eventId: EventId): Promise<AvailableSeat[]> {
        // Try Redis cache first
        const cacheKey = `available_seats:${eventId}`;
        const cached = await this.redisClient.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        // Query PostgreSQL
        const client = await this.pgPool.connect();
        try {
            const result = await client.query(
                `SELECT seat_number FROM seats 
         WHERE event_id = $1 AND status = 'available'
         ORDER BY seat_number`,
                [eventId]
            );

            const availableSeats: AvailableSeat[] = result.rows.map((row: any) => ({
                seatNumber: row.seat_number,
                status: 'available'
            }));

            // Cache for 30 seconds
            await this.redisClient.setEx(
                cacheKey,
                30,
                JSON.stringify(availableSeats)
            );

            return availableSeats;
        } finally {
            client.release();
        }
    }

    /**
     * Get user hold count
     */
    async getUserHoldCount(eventId: EventId, userId: UserId): Promise<number> {
        const count = await this.redisClient.sCard(`user_holds:${userId}:${eventId}`);
        return count || 0;
    }

    /**
     * Get seat status with Redis caching
     */
    async getSeatStatus(eventId: EventId, seatNumber: SeatNumber): Promise<Seat> {
        // Try Redis cache first
        const cacheKey = `seat:${eventId}:${seatNumber}`;
        const cached = await this.redisClient.get(cacheKey);

        if (cached) {
            return JSON.parse(cached);
        }

        // Query PostgreSQL
        const client = await this.pgPool.connect();
        try {
            const result = await client.query(
                'SELECT * FROM seats WHERE event_id = $1 AND seat_number = $2',
                [eventId, seatNumber]
            );

            if (result.rows.length === 0) {
                throw new Error('Seat not found');
            }

            const seat = result.rows[0];
            const seatData: Seat = {
                eventId: seat.event_id,
                seatNumber: seat.seat_number,
                status: seat.status,
                userId: seat.user_id,
                heldAt: seat.held_at,
                reservedAt: seat.reserved_at
            };

            // Cache for 5 minutes
            await this.redisClient.setEx(
                cacheKey,
                300,
                JSON.stringify(seatData)
            );

            return seatData;
        } finally {
            client.release();
        }
    }
}