/**
 * Core type definitions for the Fabacus Reservation Service
 */

import { Request, Response, NextFunction } from 'express';

// Base entity types
export interface BaseEntity {
    id: string;
    createdAt: string;
    updatedAt?: string;
}

// Event related types
export interface Event extends BaseEntity {
    name: string;
    description: string;
    totalSeats: number;
    status: EventStatus;
}

export type EventStatus = 'active' | 'inactive' | 'cancelled';

export interface CreateEventRequest {
    name: string;
    description?: string;
    totalSeats: number;
}

export interface CreateEventResponse {
    success: boolean;
    message: string;
    data: Event;
}

export interface GetEventResponse {
    success: boolean;
    data: Event;
}

// Seat related types
export interface Seat {
    eventId: string;
    seatNumber: number;
    status: SeatStatus;
    userId: string | null;
    heldAt: string | null;
    reservedAt: string | null;
}

export type SeatStatus = 'available' | 'held' | 'reserved';

export interface SeatHold {
    eventId: string;
    seatNumber: number;
    userId: string;
    heldAt: string;
    expiresAt: string;
}

export interface SeatReservation {
    eventId: string;
    seatNumber: number;
    userId: string;
    reservedAt: string;
}

// API Request/Response types
export interface HoldSeatRequest {
    userId: string;
    holdDuration?: number;
}

export interface HoldSeatResponse {
    success: boolean;
    message: string;
    data: SeatHold;
}

export interface ReserveSeatRequest {
    userId: string;
}

export interface ReserveSeatResponse {
    success: boolean;
    message: string;
    data: SeatReservation;
}

export interface RefreshHoldRequest {
    userId: string;
    holdDuration?: number;
}

export interface RefreshHoldResponse {
    success: boolean;
    message: string;
    data: SeatHold;
}

export interface AvailableSeatsResponse {
    success: boolean;
    data: {
        eventId: string;
        availableSeats: AvailableSeat[];
        totalAvailable: number;
    };
}

export interface AvailableSeat {
    seatNumber: number;
    status: 'available';
}

export interface SeatStatusResponse {
    success: boolean;
    data: Seat;
}

export interface UserHoldsResponse {
    success: boolean;
    data: {
        eventId: string;
        userId: string;
        currentHolds: number;
        maxHolds: number;
    };
}

// Error types
export interface ApiError {
    success: false;
    error: string;
    details?: ValidationErrorDetail[] | string;
    stack?: string;
}

export interface ValidationErrorDetail {
    field: string;
    message: string;
    value?: any;
}

export interface ApiResponse<T = any> {
    success: boolean;
    data?: T;
    error?: string;
    details?: ValidationErrorDetail[] | string;
}

// Health check types
export interface HealthCheckResponse {
    status: 'healthy' | 'unhealthy';
    timestamp: string;
    service: string;
}

// Redis related types
export interface RedisConfig {
    host: string;
    port: number;
    retry_strategy?: (options: any) => number | Error | undefined;
}

export interface RedisKeys {
    event: (eventId: string) => string;
    seat: (eventId: string, seatNumber: number) => string;
    userHolds: (userId: string, eventId: string) => string;
    eventSeats: (eventId: string) => string;
    seatHold: (eventId: string, seatNumber: number) => string;
    seatReserved: (eventId: string, seatNumber: number) => string;
}

// Service method types
export interface SeatServiceInterface {
    createEvent(eventId: string, totalSeats: number, eventName: string, description?: string): Promise<Event>;
    getEvent(eventId: string): Promise<Event>;
    holdSeat(eventId: string, seatNumber: number, userId: string, holdDuration?: number): Promise<SeatHold>;
    reserveSeat(eventId: string, seatNumber: number, userId: string): Promise<SeatReservation>;
    refreshSeatHold(eventId: string, seatNumber: number, userId: string, holdDuration?: number): Promise<SeatHold>;
    getAvailableSeats(eventId: string): Promise<AvailableSeat[]>;
    getSeatStatus(eventId: string, seatNumber: number): Promise<Seat>;
    getUserHoldCount(eventId: string, userId: string): Promise<number>;
    releaseSeat(eventId: string, seatNumber: number): Promise<void>;
}

// Environment configuration types
export interface AppConfig {
    NODE_ENV: 'development' | 'production' | 'test';
    PORT: number;
    REDIS_HOST: string;
    REDIS_PORT: number;
    MAX_HOLDS_PER_USER: number;
    DEFAULT_HOLD_DURATION: number;
    LOG_LEVEL: 'error' | 'warn' | 'info' | 'debug';
}

// Validation schema types
export interface ValidationSchema {
    validate(value: any): { error?: any; value: any };
}

// Middleware types
export interface RequestWithBody<T = any> extends Request {
    body: T;
}

export interface ValidationMiddleware {
    (req: RequestWithBody, res: Response, next: NextFunction): void;
}

// Logger types
export interface Logger {
    error(message: string, meta?: any): void;
    warn(message: string, meta?: any): void;
    info(message: string, meta?: any): void;
    debug(message: string, meta?: any): void;
}

// Test types
export interface TestContext {
    eventId?: string;
    userId?: string;
    seatNumbers?: number[];
}

export interface MockSeatService {
    createEvent: jest.MockedFunction<SeatServiceInterface['createEvent']>;
    getEvent: jest.MockedFunction<SeatServiceInterface['getEvent']>;
    holdSeat: jest.MockedFunction<SeatServiceInterface['holdSeat']>;
    reserveSeat: jest.MockedFunction<SeatServiceInterface['reserveSeat']>;
    refreshSeatHold: jest.MockedFunction<SeatServiceInterface['refreshSeatHold']>;
    getAvailableSeats: jest.MockedFunction<SeatServiceInterface['getAvailableSeats']>;
    getSeatStatus: jest.MockedFunction<SeatServiceInterface['getSeatStatus']>;
    getUserHoldCount: jest.MockedFunction<SeatServiceInterface['getUserHoldCount']>;
}

// Utility types
export type UUID = string;
export type Timestamp = string;
export type SeatNumber = number;
export type UserId = string;
export type EventId = string;

// Constants
export const SEAT_STATUS = {
    AVAILABLE: 'available' as const,
    HELD: 'held' as const,
    RESERVED: 'reserved' as const
} as const;

export const EVENT_STATUS = {
    ACTIVE: 'active' as const,
    INACTIVE: 'inactive' as const,
    CANCELLED: 'cancelled' as const
} as const;

export const HTTP_STATUS = {
    OK: 200,
    CREATED: 201,
    BAD_REQUEST: 400,
    NOT_FOUND: 404,
    CONFLICT: 409,
    TOO_MANY_REQUESTS: 429,
    INTERNAL_SERVER_ERROR: 500
} as const;

// Type guards
export function isUUID(value: string): value is UUID {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(value);
}

export function isValidSeatNumber(seatNumber: number, maxSeats: number): boolean {
    return Number.isInteger(seatNumber) && seatNumber >= 1 && seatNumber <= maxSeats;
}

export function isApiError(response: any): response is ApiError {
    return response && typeof response === 'object' && response.success === false;
}