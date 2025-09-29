import express, { Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import rateLimit from 'express-rate-limit';
import winston from 'winston';
import redis from 'redis';

import eventRoutes from './routes/events.js';
import seatRoutes from './routes/seats.js';
import { initializeRedis } from './services/redisService.js';
import { errorHandler } from './middleware/errorHandler.js';
import { Logger, AppConfig } from './types/index.js';

// Configure logger
const logger: Logger = winston.createLogger({
    level: 'info',
    format: winston.format.combine(
        winston.format.timestamp(),
        winston.format.errors({ stack: true }),
        winston.format.json()
    ),
    defaultMeta: { service: 'reservation-service' },
    transports: [
        new winston.transports.Console({
            format: winston.format.simple()
        })
    ]
});

const app = express();
const PORT: number = parseInt(process.env['PORT'] || '3000', 10);

// Security middleware
app.use(helmet());
app.use(cors());

// Rate limiting
const limiter = rateLimit({
    windowMs: 15 * 60 * 1000, // 15 minutes
    max: 100, // limit each IP to 100 requests per windowMs
    message: 'Too many requests from this IP, please try again later.'
});
app.use(limiter);

// Body parsing middleware
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Health check endpoint
app.get('/health', (req: Request, res: Response) => {
    res.status(200).json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        service: 'zephyr-reservation-service'
    });
});

// API routes
app.use('/api/events', eventRoutes);
app.use('/api/seats', seatRoutes);

// Error handling middleware
app.use(errorHandler);

// 404 handler
app.use('*', (req: Request, res: Response) => {
    res.status(404).json({
        error: 'Not Found',
        message: `Route ${req.originalUrl} not found`
    });
});

// Initialize Redis and start server
async function startServer(): Promise<void> {
    try {
        await initializeRedis();
        logger.info('Redis connection established');

        app.listen(PORT, () => {
            logger.info(`Server running on port ${PORT}`);
            logger.info(`Health check available at http://localhost:${PORT}/health`);
        });
    } catch (error) {
        logger.error('Failed to start server:', error);
        process.exit(1);
    }
}

// Graceful shutdown
process.on('SIGTERM', () => {
    logger.info('SIGTERM received, shutting down gracefully');
    process.exit(0);
});

process.on('SIGINT', () => {
    logger.info('SIGINT received, shutting down gracefully');
    process.exit(0);
});

startServer();

export default app;