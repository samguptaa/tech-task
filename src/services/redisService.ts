import redis, { RedisClientType } from 'redis';
import winston from 'winston';
import {
    Event,
    Seat,
    SeatHold,
    SeatReservation,
    AvailableSeat,
    SeatServiceInterface,
    RedisConfig,
    Logger,
    EventStatus,
    SeatStatus,
    UUID,
    SeatNumber,
    UserId,
    EventId
} from '../types/index.js';

const logger: Logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

let redisClient: RedisClientType;

/**
 * Initialize Redis connection
 * Uses connection pooling and proper error handling
 */
export async function initializeRedis(): Promise<RedisClientType> {
    try {
        const config = {
            socket: {
                host: process.env['REDIS_HOST'] || 'localhost',
                port: parseInt(process.env['REDIS_PORT'] || '6379', 10),
                reconnectStrategy: (retries: number) => {
                    if (retries > 10) {
                        logger.error('Redis max retry attempts reached');
                        return new Error('Max retries reached');
                    }
                    return Math.min(retries * 100, 3000);
                }
            }
        };

        redisClient = redis.createClient(config);

        redisClient.on('error', (err: Error) => {
            logger.error('Redis Client Error:', err);
        });

        redisClient.on('connect', () => {
            logger.info('Redis client connected');
        });

        await redisClient.connect();
        return redisClient;
    } catch (error) {
        logger.error('Failed to initialize Redis:', error);
        throw error;
    }
}

/**
 * Get Redis client instance
 */
export function getRedisClient(): RedisClientType {
    if (!redisClient) {
        throw new Error('Redis client not initialized');
    }
    return redisClient;
}

/**
 * Generate Redis keys for different data types
 */
export const RedisKeys = {
    event: (eventId: EventId): string => `event:${eventId}`,
    seat: (eventId: EventId, seatNumber: SeatNumber): string => `seat:${eventId}:${seatNumber}`,
    userHolds: (userId: UserId, eventId: EventId): string => `user_holds:${userId}:${eventId}`,
    eventSeats: (eventId: EventId): string => `event_seats:${eventId}`,
    seatHold: (eventId: EventId, seatNumber: SeatNumber): string => `seat_hold:${eventId}:${seatNumber}`,
    seatReserved: (eventId: EventId, seatNumber: SeatNumber): string => `seat_reserved:${eventId}:${seatNumber}`
};

/**
 * Redis operations for seat management
 */
export class SeatService implements SeatServiceInterface {
    /**
     * Create a new event with specified number of seats
     */
    async createEvent(
        eventId: EventId,
        totalSeats: number,
        eventName: string,
        description: string = ''
    ): Promise<Event> {
        const client = getRedisClient();

        // Validate seat count
        if (totalSeats < 10 || totalSeats > 1000) {
            throw new Error('Total seats must be between 10 and 1000');
        }

        // Check if event already exists
        const existingEvent = await client.get(RedisKeys.event(eventId));
        if (existingEvent) {
            throw new Error('Event already exists');
        }

        // Create event data
        const eventData: Event = {
            id: eventId,
            name: eventName,
            description,
            totalSeats,
            createdAt: new Date().toISOString(),
            status: 'active' as EventStatus
        };

        // Store event data
        await client.set(RedisKeys.event(eventId), JSON.stringify(eventData));

        // Initialize all seats as available
        const seatNumbers = Array.from({ length: totalSeats }, (_, i) => i + 1);
        const seatData: Record<string, string> = {};

        seatNumbers.forEach(seatNumber => {
            const seat: Seat = {
                eventId,
                seatNumber,
                status: 'available' as SeatStatus,
                userId: null,
                heldAt: null,
                reservedAt: null
            };
            seatData[seatNumber.toString()] = JSON.stringify(seat);
        });

        await client.hSet(RedisKeys.eventSeats(eventId), seatData);

        logger.info(`Event ${eventId} created with ${totalSeats} seats`);
        return eventData;
    }

    /**
     * Get event details
     */
    async getEvent(eventId: EventId): Promise<Event> {
        const client = getRedisClient();
        const eventData = await client.get(RedisKeys.event(eventId));

        if (!eventData) {
            throw new Error('Event not found');
        }

        return JSON.parse(eventData) as Event;
    }

    /**
     * Hold a seat for a user
     */
    async holdSeat(
        eventId: EventId,
        seatNumber: SeatNumber,
        userId: UserId,
        holdDuration: number = 60
    ): Promise<SeatHold> {
        const client = getRedisClient();

        // Check if event exists
        const event = await this.getEvent(eventId);
        if (!event) {
            throw new Error('Event not found');
        }

        // Validate seat number
        if (seatNumber < 1 || seatNumber > event.totalSeats) {
            throw new Error('Invalid seat number');
        }

        // Check current seat status
        const seatData = await client.hGet(RedisKeys.eventSeats(eventId), seatNumber.toString());
        if (!seatData) {
            throw new Error('Seat not found');
        }

        const seat: Seat = JSON.parse(seatData);

        // Check if seat is available
        if (seat.status !== 'available') {
            throw new Error('Seat is not available');
        }

        // Check user hold limits (bonus feature)
        const userHoldCount = await this.getUserHoldCount(eventId, userId);
        const maxHoldsPerUser = parseInt(process.env['MAX_HOLDS_PER_USER'] || '5', 10);

        if (userHoldCount >= maxHoldsPerUser) {
            throw new Error(`User can hold maximum ${maxHoldsPerUser} seats`);
        }

        // Update seat status to held
        const heldAt = new Date().toISOString();
        const updatedSeat: Seat = {
            ...seat,
            status: 'held' as SeatStatus,
            userId,
            heldAt
        };

        // Store updated seat data
        await client.hSet(RedisKeys.eventSeats(eventId), seatNumber.toString(), JSON.stringify(updatedSeat));

        // Store hold information with expiration
        const holdKey = RedisKeys.seatHold(eventId, seatNumber);
        const holdData: SeatHold = {
            eventId,
            seatNumber,
            userId,
            heldAt,
            expiresAt: new Date(Date.now() + holdDuration * 1000).toISOString()
        };

        await client.setEx(holdKey, holdDuration, JSON.stringify(holdData));

        // Track user holds
        await client.sAdd(RedisKeys.userHolds(userId, eventId), seatNumber.toString());

        logger.info(`Seat ${seatNumber} held for user ${userId} in event ${eventId}`);

        return holdData;
    }

    /**
     * Reserve a held seat
     */
    async reserveSeat(eventId: EventId, seatNumber: SeatNumber, userId: UserId): Promise<SeatReservation> {
        const client = getRedisClient();

        // Check if seat is held by the user
        const holdKey = RedisKeys.seatHold(eventId, seatNumber);
        const holdData = await client.get(holdKey);

        if (!holdData) {
            throw new Error('Seat is not held');
        }

        const hold: SeatHold = JSON.parse(holdData);
        if (hold.userId !== userId) {
            throw new Error('Seat is held by another user');
        }

        // Check if hold has expired
        if (new Date(hold.expiresAt) < new Date()) {
            // Clean up expired hold
            await this.releaseSeat(eventId, seatNumber);
            throw new Error('Seat hold has expired');
        }

        // Update seat status to reserved
        const seatData = await client.hGet(RedisKeys.eventSeats(eventId), seatNumber.toString());
        if (!seatData) {
            throw new Error('Seat not found');
        }

        const seat: Seat = JSON.parse(seatData);

        const reservedAt = new Date().toISOString();
        const updatedSeat: Seat = {
            ...seat,
            status: 'reserved' as SeatStatus,
            reservedAt
        };

        // Store updated seat data
        await client.hSet(RedisKeys.eventSeats(eventId), seatNumber.toString(), JSON.stringify(updatedSeat));

        // Remove hold and create reservation record
        await client.del(holdKey);
        const reservation: SeatReservation = {
            eventId,
            seatNumber,
            userId,
            reservedAt
        };

        await client.set(RedisKeys.seatReserved(eventId, seatNumber), JSON.stringify(reservation));

        // Remove from user holds
        await client.sRem(RedisKeys.userHolds(userId, eventId), seatNumber.toString());

        logger.info(`Seat ${seatNumber} reserved for user ${userId} in event ${eventId}`);

        return reservation;
    }

    /**
     * Release a held seat (when hold expires or is cancelled)
     */
    async releaseSeat(eventId: EventId, seatNumber: SeatNumber): Promise<void> {
        const client = getRedisClient();

        // Get current seat data
        const seatData = await client.hGet(RedisKeys.eventSeats(eventId), seatNumber.toString());
        if (!seatData) {
            throw new Error('Seat not found');
        }

        const seat: Seat = JSON.parse(seatData);

        // Only release if currently held
        if (seat.status === 'held') {
            const updatedSeat: Seat = {
                ...seat,
                status: 'available' as SeatStatus,
                userId: null,
                heldAt: null
            };

            // Update seat status
            await client.hSet(RedisKeys.eventSeats(eventId), seatNumber.toString(), JSON.stringify(updatedSeat));

            // Remove hold record
            await client.del(RedisKeys.seatHold(eventId, seatNumber));

            // Remove from user holds
            if (seat.userId) {
                await client.sRem(RedisKeys.userHolds(seat.userId, eventId), seatNumber.toString());
            }

            logger.info(`Seat ${seatNumber} released in event ${eventId}`);
        }
    }

    /**
     * Refresh a seat hold (extend hold duration)
     */
    async refreshSeatHold(
        eventId: EventId,
        seatNumber: SeatNumber,
        userId: UserId,
        holdDuration: number = 60
    ): Promise<SeatHold> {
        const client = getRedisClient();

        // Check if seat is held by the user
        const holdKey = RedisKeys.seatHold(eventId, seatNumber);
        const holdData = await client.get(holdKey);

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

        await client.setEx(holdKey, holdDuration, JSON.stringify(updatedHold));

        logger.info(`Seat ${seatNumber} hold refreshed for user ${userId} in event ${eventId}`);

        return updatedHold;
    }

    /**
     * Get available seats for an event
     */
    async getAvailableSeats(eventId: EventId): Promise<AvailableSeat[]> {
        const client = getRedisClient();

        // Check if event exists
        const event = await this.getEvent(eventId);
        if (!event) {
            throw new Error('Event not found');
        }

        // Get all seats for the event
        const allSeats = await client.hGetAll(RedisKeys.eventSeats(eventId));
        const availableSeats: AvailableSeat[] = [];

        for (const [seatNumber, seatData] of Object.entries(allSeats)) {
            const seat: Seat = JSON.parse(seatData);

            // Check if seat is available (not held and not reserved)
            if (seat.status === 'available') {
                availableSeats.push({
                    seatNumber: parseInt(seatNumber),
                    status: 'available'
                });
            } else if (seat.status === 'held') {
                // Check if hold has expired
                const holdKey = RedisKeys.seatHold(eventId, parseInt(seatNumber));
                const holdData = await client.get(holdKey);

                if (!holdData) {
                    // Hold expired, release the seat
                    await this.releaseSeat(eventId, parseInt(seatNumber));
                    availableSeats.push({
                        seatNumber: parseInt(seatNumber),
                        status: 'available'
                    });
                }
            }
        }

        return availableSeats.sort((a, b) => a.seatNumber - b.seatNumber);
    }

    /**
     * Get user hold count for an event (bonus feature)
     */
    async getUserHoldCount(eventId: EventId, userId: UserId): Promise<number> {
        const client = getRedisClient();
        const holdCount = await client.sCard(RedisKeys.userHolds(userId, eventId));
        return holdCount || 0;
    }

    /**
     * Get seat status for an event
     */
    async getSeatStatus(eventId: EventId, seatNumber: SeatNumber): Promise<Seat> {
        const client = getRedisClient();

        const seatData = await client.hGet(RedisKeys.eventSeats(eventId), seatNumber.toString());
        if (!seatData) {
            throw new Error('Seat not found');
        }

        const seat: Seat = JSON.parse(seatData);

        // Check if held seat has expired
        if (seat.status === 'held') {
            const holdKey = RedisKeys.seatHold(eventId, seatNumber);
            const holdData = await client.get(holdKey);

            if (!holdData) {
                // Hold expired, release the seat
                await this.releaseSeat(eventId, seatNumber);
                seat.status = 'available';
                seat.userId = null;
                seat.heldAt = null;
            }
        }

        return seat;
    }

    /**
     * Get all events
     */
    async getAllEvents(): Promise<Event[]> {
        const client = getRedisClient();
        const pattern = RedisKeys.event('*');
        const keys = await client.keys(pattern);

        const events: Event[] = [];
        for (const key of keys) {
            const eventData = await client.get(key);
            if (eventData) {
                events.push(JSON.parse(eventData));
            }
        }

        return events.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
    }
}

// Export a singleton instance
export const seatService = new SeatService();