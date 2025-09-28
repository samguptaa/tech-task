import { Request, Response, NextFunction } from 'express';
import winston from 'winston';
import { Logger, ApiError } from '../types/index.js';

// Configure logger for error handling
const logger: Logger = winston.createLogger({
    level: 'error',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    transports: [new winston.transports.Console()]
});

/**
 * Global error handling middleware
 * Handles different types of errors and returns appropriate responses
 */
export function errorHandler(err: Error, req: Request, res: Response, next: NextFunction): void {
    // Log the error
    logger.error('Error occurred:', {
        error: err.message,
        stack: err.stack,
        url: req.url,
        method: req.method,
        body: req.body,
        params: req.params,
        query: req.query
    });

    // Default error response
    let statusCode = 500;
    let message = 'Internal server error';
    let details: string | undefined = undefined;

    // Handle different error types
    if (err.name === 'ValidationError') {
        statusCode = 400;
        message = 'Validation error';
    } else if (err.name === 'CastError') {
        statusCode = 400;
        message = 'Invalid data format';
    } else if (err.message.includes('not found')) {
        statusCode = 404;
        message = err.message;
    } else if (err.message.includes('already exists')) {
        statusCode = 409;
        message = err.message;
    } else if (err.message.includes('not available') ||
        err.message.includes('held by another user') ||
        err.message.includes('has expired')) {
        statusCode = 409;
        message = err.message;
    } else if (err.message.includes('Invalid') ||
        err.message.includes('must be between')) {
        statusCode = 400;
        message = err.message;
    } else if (err.message.includes('maximum')) {
        statusCode = 429;
        message = err.message;
    }

    // Don't expose internal errors in production
    if (process.env['NODE_ENV'] === 'production' && statusCode === 500) {
        message = 'Internal server error';
        details = undefined;
    }

    // Send error response
    const errorResponse: ApiError = {
        success: false,
        error: message,
        ...(details !== undefined ? { details } : {})
    };

    // Add stack trace in development
    if (process.env['NODE_ENV'] === 'development') {
        (errorResponse as any).stack = err.stack;
    }

    res.status(statusCode).json(errorResponse);
}

/**
 * Handle uncaught exceptions
 */
process.on('uncaughtException', (err: Error) => {
    logger.error('Uncaught Exception:', err);
    process.exit(1);
});

/**
 * Handle unhandled promise rejections
 */
process.on('unhandledRejection', (reason: any, promise: Promise<any>) => {
    logger.error('Unhandled Rejection at: ' + promise + ' reason: ' + reason);
    process.exit(1);
});