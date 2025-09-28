import express, { Request, Response, NextFunction } from 'express';
import { v4 as uuidv4 } from 'uuid';
import Joi from 'joi';
import { seatService } from '../services/redisService.js';
import { validateRequest } from '../middleware/validation.js';
import {
    CreateEventRequest,
    CreateEventResponse,
    GetEventResponse,
    AvailableSeatsResponse,
    SeatStatusResponse,
    ApiError
} from '../types/index.js';

const router = express.Router();

// Validation schemas
const createEventSchema = Joi.object<CreateEventRequest>({
    name: Joi.string().min(1).max(200).required(),
    description: Joi.string().max(500).optional().allow(''),
    totalSeats: Joi.number().integer().min(10).max(1000).required()
});

/**
 * @route POST /api/events
 * @desc Create a new event with specified number of seats
 * @access Public
 */
router.post('/', validateRequest(createEventSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { name, description, totalSeats } = req.body as CreateEventRequest;
        const eventId = uuidv4();

        const event = await seatService.createEvent(eventId, totalSeats, name, description);

        const response: CreateEventResponse = {
            success: true,
            message: 'Event created successfully',
            data: event
        };

        return res.status(201).json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route GET /api/events/:eventId
 * @desc Get event details
 * @access Public
 */
router.get('/:eventId', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId } = req.params;

        // Validate eventId format (basic UUID validation)
        if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
            const error: ApiError = {
                success: false,
                error: 'Invalid event ID format'
            };
            return res.status(400).json(error);
        }

        const event = await seatService.getEvent(eventId);

        const response: GetEventResponse = {
            success: true,
            data: event
        };

        return res.json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route GET /api/events/:eventId/seats/available
 * @desc Get available seats for an event
 * @access Public
 */
router.get('/:eventId/seats/available', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId } = req.params;

        // Validate eventId format
        if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
            const error: ApiError = {
                success: false,
                error: 'Invalid event ID format'
            };
            return res.status(400).json(error);
        }

        const availableSeats = await seatService.getAvailableSeats(eventId);

        const response: AvailableSeatsResponse = {
            success: true,
            data: {
                eventId,
                availableSeats,
                totalAvailable: availableSeats.length
            }
        };

        return res.json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route GET /api/events/:eventId/seats/:seatNumber
 * @desc Get specific seat status
 * @access Public
 */
router.get('/:eventId/seats/:seatNumber', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId, seatNumber } = req.params;
        const seatNum = parseInt(seatNumber || '0', 10);

        // Validate eventId format
        if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
            const error: ApiError = {
                success: false,
                error: 'Invalid event ID format'
            };
            return res.status(400).json(error);
        }

        // Validate seat number
        if (isNaN(seatNum) || seatNum < 1) {
            const error: ApiError = {
                success: false,
                error: 'Invalid seat number'
            };
            return res.status(400).json(error);
        }

        const seatStatus = await seatService.getSeatStatus(eventId, seatNum);

        const response: SeatStatusResponse = {
            success: true,
            data: seatStatus
        };

        return res.json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route GET /api/events
 * @desc Get all events
 * @access Public
 */
router.get('/', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const events = await seatService.getAllEvents();

        const response = {
            success: true,
            data: events,
            total: events.length
        };

        return res.json(response);
    } catch (error) {
        return next(error);
    }
});

export default router;