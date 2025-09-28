import { Request, Response, NextFunction } from 'express';
import Joi from 'joi';
import { ValidationErrorDetail, ApiError } from '../types/index.js';

/**
 * Validation middleware for request validation using Joi
 * @param schema - Joi validation schema
 * @returns Express middleware function
 */
export function validateRequest<T>(schema: Joi.ObjectSchema<T>) {
    return (req: Request, res: Response, next: NextFunction): void => {
        const { error, value } = schema.validate(req.body, {
            abortEarly: false, // Return all validation errors
            stripUnknown: true, // Remove unknown fields
            convert: true // Convert types when possible
        });

        if (error) {
            const errorDetails: ValidationErrorDetail[] = error.details.map(detail => ({
                field: detail.path.join('.'),
                message: detail.message,
                value: detail.context?.value
            }));

            const apiError: ApiError = {
                success: false,
                error: 'Validation failed',
                details: errorDetails
            };

            res.status(400).json(apiError);
            return;
        }

        // Replace req.body with validated and sanitized data
        req.body = value;
        next();
    };
}

/**
 * Validate UUID format
 * @param uuid - UUID string to validate
 * @returns True if valid UUID format
 */
export function isValidUUID(uuid: string): boolean {
    const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
    return uuidRegex.test(uuid);
}

/**
 * Validate seat number
 * @param seatNumber - Seat number to validate
 * @param maxSeats - Maximum number of seats
 * @returns True if valid seat number
 */
export function isValidSeatNumber(seatNumber: number, maxSeats: number): boolean {
    return Number.isInteger(seatNumber) && seatNumber >= 1 && seatNumber <= maxSeats;
}