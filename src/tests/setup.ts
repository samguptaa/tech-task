// Test setup file
import * as redisService from '../services/redisService.js';

// Mock console methods to reduce test output noise
global.console = {
    ...console,
    log: jest.fn(),
    debug: jest.fn(),
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn()
};

// Setup test environment
beforeAll(async () => {
    // Mock Redis initialization for tests
    jest.spyOn(redisService, 'initializeRedis')
        .mockResolvedValue({} as any);
});

afterAll(async () => {
    // Cleanup after all tests
    jest.restoreAllMocks();
});