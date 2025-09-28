import { RedisClientType } from 'redis';
import { EventEmitter } from 'events';

/**
 * Message Queue Service using Redis Streams
 * Provides reliable message delivery and processing
 */
export class MessageQueueService {
    private eventEmitter = new EventEmitter();

    constructor(private redisClient: RedisClientType) {
        this.setupConsumers();
    }

    /**
     * Setup message consumers for different queues
     */
    private async setupConsumers(): Promise<void> {
        // Seat operations queue
        this.consumeQueue('seat_operations', this.handleSeatOperation.bind(this));

        // Notifications queue
        this.consumeQueue('notifications', this.handleNotification.bind(this));

        // Analytics queue
        this.consumeQueue('analytics', this.handleAnalytics.bind(this));
    }

    /**
     * Publish a message to a queue
     */
    async publish(queue: string, message: any): Promise<void> {
        const messageId = await this.redisClient.xAdd(
            queue,
            '*',
            {
                data: JSON.stringify(message),
                timestamp: Date.now().toString(),
                type: message.type || 'unknown'
            }
        );

        console.log(`Published message ${messageId} to queue ${queue}`);
    }

    /**
     * Subscribe to a queue and process messages
     */
    private async consumeQueue(queue: string, handler: (message: any) => Promise<void>): Promise<void> {
        const consumerGroup = `${queue}_group`;
        const consumerName = `consumer_${Date.now()}`;

        try {
            // Create consumer group if it doesn't exist
            await this.redisClient.xGroupCreate(queue, consumerGroup, '0', { MKSTREAM: true });
        } catch (error) {
            // Group might already exist, ignore error
        }

        // Start consuming messages
        this.processMessages(queue, consumerGroup, consumerName, handler);
    }

    /**
     * Process messages from a queue
     */
    private async processMessages(
        queue: string,
        consumerGroup: string,
        consumerName: string,
        handler: (message: any) => Promise<void>
    ): Promise<void> {
        while (true) {
            try {
                const messages = await this.redisClient.xReadGroup(
                    consumerGroup,
                    consumerName,
                    { key: queue, id: '>' },
                    { COUNT: 1, BLOCK: 1000 }
                );

                if (messages && messages.length > 0) {
                    for (const stream of messages) {
                        for (const message of stream.messages) {
                            try {
                                const messageData = JSON.parse(message.message['data'] || '{}');
                                await handler(messageData);

                                // Acknowledge message processing
                                await this.redisClient.xAck(queue, consumerGroup, message.id);
                            } catch (error) {
                                console.error(`Error processing message ${message.id}:`, error);

                                // Move to dead letter queue after max retries
                                await this.handleFailedMessage(queue, message.id, error);
                            }
                        }
                    }
                }
            } catch (error) {
                console.error(`Error in message processing for queue ${queue}:`, error);
                await new Promise(resolve => setTimeout(resolve, 5000)); // Wait 5 seconds before retry
            }
        }
    }

    /**
     * Handle failed messages (dead letter queue)
     */
    private async handleFailedMessage(queue: string, messageId: string, error: any): Promise<void> {
        const deadLetterQueue = `${queue}_dlq`;

        await this.redisClient.xAdd(deadLetterQueue, '*', {
            originalQueue: queue,
            originalMessageId: messageId,
            error: error.message,
            timestamp: Date.now().toString()
        });

        console.log(`Moved failed message ${messageId} to dead letter queue ${deadLetterQueue}`);
    }

    /**
     * Handle seat operation messages
     */
    private async handleSeatOperation(message: any): Promise<void> {
        console.log('Processing seat operation:', message);

        switch (message.type) {
            case 'HOLD_SEAT':
                await this.processHoldSeat(message);
                break;
            case 'RESERVE_SEAT':
                await this.processReserveSeat(message);
                break;
            case 'RELEASE_SEAT':
                await this.processReleaseSeat(message);
                break;
            default:
                console.log('Unknown seat operation type:', message.type);
        }
    }

    /**
     * Handle notification messages
     */
    private async handleNotification(message: any): Promise<void> {
        console.log('Processing notification:', message);

        // Emit notification event for WebSocket service
        this.eventEmitter.emit('notification', message);
    }

    /**
     * Handle analytics messages
     */
    private async handleAnalytics(message: any): Promise<void> {
        console.log('Processing analytics:', message);

        // Store analytics data in database
        // This would typically write to a time-series database
    }

    /**
     * Process hold seat operation
     */
    private async processHoldSeat(message: any): Promise<void> {
        // Implementation for hold seat processing
        console.log('Processing hold seat:', message);
    }

    /**
     * Process reserve seat operation
     */
    private async processReserveSeat(message: any): Promise<void> {
        // Implementation for reserve seat processing
        console.log('Processing reserve seat:', message);
    }

    /**
     * Process release seat operation
     */
    private async processReleaseSeat(message: any): Promise<void> {
        // Implementation for release seat processing
        console.log('Processing release seat:', message);
    }

    /**
     * Get queue statistics
     */
    async getQueueStats(queue: string): Promise<any> {
        const info = await this.redisClient.xInfoStream(queue);
        return {
            length: info.length,
            firstEntry: info.firstEntry,
            lastEntry: info.lastEntry,
            groups: info.groups
        };
    }

    /**
     * Get consumer group info
     */
    async getConsumerGroupInfo(queue: string, groupName: string): Promise<any> {
        const info = await this.redisClient.xInfoGroups(queue);
        return info.find(group => group.name === groupName);
    }
}