import express, { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { seatService } from '../services/redisService.js';
import { validateRequest } from '../middleware/validation.js';
import {
    HoldSeatRequest,
    HoldSeatResponse,
    ReserveSeatRequest,
    ReserveSeatResponse,
    RefreshHoldRequest,
    RefreshHoldResponse,
    SeatStatusResponse,
    UserHoldsResponse,
    ApiError
} from '../types/index.js';

const router = express.Router();

// Validation schemas
const holdSeatSchema = Joi.object<HoldSeatRequest>({
    userId: Joi.string().uuid().required(),
    holdDuration: Joi.number().integer().min(30).max(300).optional().default(60)
});

const reserveSeatSchema = Joi.object<ReserveSeatRequest>({
    userId: Joi.string().uuid().required()
});

const refreshHoldSchema = Joi.object<RefreshHoldRequest>({
    userId: Joi.string().uuid().required(),
    holdDuration: Joi.number().integer().min(30).max(300).optional().default(60)
});

/**
 * @route POST /api/seats/:eventId/:seatNumber/hold
 * @desc Hold a specific seat for a user
 * @access Public
 */
router.post('/:eventId/:seatNumber/hold', validateRequest(holdSeatSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId, seatNumber } = req.params;
        const { userId, holdDuration } = req.body as HoldSeatRequest;
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

        const holdResult = await seatService.holdSeat(eventId, seatNum, userId, holdDuration);

        const response: HoldSeatResponse = {
            success: true,
            message: 'Seat held successfully',
            data: holdResult
        };

        return res.status(201).json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route POST /api/seats/:eventId/:seatNumber/reserve
 * @desc Reserve a held seat
 * @access Public
 */
router.post('/:eventId/:seatNumber/reserve', validateRequest(reserveSeatSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId, seatNumber } = req.params;
        const { userId } = req.body as ReserveSeatRequest;
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

        const reservationResult = await seatService.reserveSeat(eventId, seatNum, userId);

        const response: ReserveSeatResponse = {
            success: true,
            message: 'Seat reserved successfully',
            data: reservationResult
        };

        return res.status(201).json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route POST /api/seats/:eventId/:seatNumber/refresh
 * @desc Refresh/extend a seat hold
 * @access Public
 */
router.post('/:eventId/:seatNumber/refresh', validateRequest(refreshHoldSchema), async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId, seatNumber } = req.params;
        const { userId, holdDuration } = req.body as RefreshHoldRequest;
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

        const refreshResult = await seatService.refreshSeatHold(eventId, seatNum, userId, holdDuration);

        const response: RefreshHoldResponse = {
            success: true,
            message: 'Seat hold refreshed successfully',
            data: refreshResult
        };

        return res.json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route GET /api/seats/:eventId/:seatNumber/status
 * @desc Get detailed seat status
 * @access Public
 */
router.get('/:eventId/:seatNumber/status', async (req: Request, res: Response, next: NextFunction) => {
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
 * @route DELETE /api/seats/:eventId/:seatNumber/release
 * @desc Release a held seat (bonus feature)
 * @access Public
 */
router.delete('/:eventId/:seatNumber/release', async (req: Request, res: Response, next: NextFunction) => {
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

        await seatService.releaseSeat(eventId, seatNum);

        const response = {
            success: true,
            message: 'Seat released successfully',
            data: {
                eventId,
                seatNumber: seatNum,
                status: 'available'
            }
        };

        return res.json(response);
    } catch (error) {
        return next(error);
    }
});

/**
 * @route GET /api/seats/:eventId/user/:userId/holds
 * @desc Get user's current holds for an event (bonus feature)
 * @access Public
 */
router.get('/:eventId/user/:userId/holds', async (req: Request, res: Response, next: NextFunction) => {
    try {
        const { eventId, userId } = req.params;

        // Validate eventId format
        if (!eventId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(eventId)) {
            const error: ApiError = {
                success: false,
                error: 'Invalid event ID format'
            };
            return res.status(400).json(error);
        }

        // Validate userId format
        if (!userId || !/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(userId)) {
            const error: ApiError = {
                success: false,
                error: 'Invalid user ID format'
            };
            return res.status(400).json(error);
        }

        const holdCount = await seatService.getUserHoldCount(eventId, userId);

        const response: UserHoldsResponse = {
            success: true,
            data: {
                eventId: eventId!,
                userId: userId!,
                currentHolds: holdCount,
                maxHolds: parseInt(process.env['MAX_HOLDS_PER_USER'] || '5', 10)
            }
        };

        return res.json(response);
    } catch (error) {
        return next(error);
    }
});

export default router;