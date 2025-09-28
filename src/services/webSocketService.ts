import { WebSocket, WebSocketServer } from 'ws';
import { Server } from 'http';
import { EventEmitter } from 'events';
import { RedisClientType } from 'redis';

interface WebSocketConnection {
    ws: WebSocket;
    userId?: string;
    eventId?: string;
    subscriptions: Set<string>;
}

interface WebSocketMessage {
    type: string;
    data: any;
    timestamp: string;
}

/**
 * WebSocket Service for Real-time Updates
 * Provides real-time seat updates, notifications, and live status
 */
export class WebSocketService extends EventEmitter {
    private wss: WebSocketServer;
    private connections = new Map<string, WebSocketConnection>();
    private eventSubscriptions = new Map<string, Set<string>>(); // eventId -> connectionIds
    private userSubscriptions = new Map<string, Set<string>>(); // userId -> connectionIds

    constructor(server: Server, private redisClient: RedisClientType) {
        super();

        this.wss = new WebSocketServer({ server });
        this.setupWebSocketServer();
        this.setupRedisSubscriptions();
    }

    /**
     * Setup WebSocket server with connection handling
     */
    private setupWebSocketServer(): void {
        this.wss.on('connection', (ws: WebSocket, request) => {
            const connectionId = this.generateConnectionId();
            const connection: WebSocketConnection = {
                ws,
                subscriptions: new Set()
            };

            this.connections.set(connectionId, connection);

            // Handle incoming messages
            ws.on('message', (data) => {
                try {
                    const message = JSON.parse(data.toString());
                    this.handleMessage(connectionId, message);
                } catch (error) {
                    console.error('Error parsing WebSocket message:', error);
                    this.sendError(connectionId, 'Invalid message format');
                }
            });

            // Handle connection close
            ws.on('close', () => {
                this.handleDisconnection(connectionId);
            });

            // Handle errors
            ws.on('error', (error) => {
                console.error('WebSocket error:', error);
                this.handleDisconnection(connectionId);
            });

            // Send welcome message
            this.sendMessage(connectionId, {
                type: 'CONNECTION_ESTABLISHED',
                data: { connectionId },
                timestamp: new Date().toISOString()
            });

            console.log(`WebSocket connection established: ${connectionId}`);
        });
    }

    /**
     * Setup Redis subscriptions for real-time updates
     */
    private setupRedisSubscriptions(): void {
        // Subscribe to seat updates
        this.redisClient.subscribe('seat_updates:*', (message, channel) => {
            const eventId = channel.split(':')[1];
            this.broadcastToEvent(eventId!, JSON.parse(message));
        });

        // Subscribe to user notifications
        this.redisClient.subscribe('user_notifications:*', (message, channel) => {
            const userId = channel.split(':')[1];
            this.sendToUser(userId!, JSON.parse(message));
        });

        // Subscribe to admin updates
        this.redisClient.subscribe('admin_updates', (message) => {
            this.broadcastToAdmins(JSON.parse(message));
        });
    }

    /**
     * Handle incoming WebSocket messages
     */
    private handleMessage(connectionId: string, message: any): void {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        switch (message.type) {
            case 'SUBSCRIBE_EVENT':
                this.subscribeToEvent(connectionId, message.eventId);
                break;

            case 'SUBSCRIBE_USER':
                this.subscribeToUser(connectionId, message.userId);
                break;

            case 'UNSUBSCRIBE_EVENT':
                this.unsubscribeFromEvent(connectionId, message.eventId);
                break;

            case 'UNSUBSCRIBE_USER':
                this.unsubscribeFromUser(connectionId, message.userId);
                break;

            case 'PING':
                this.sendMessage(connectionId, {
                    type: 'PONG',
                    data: {},
                    timestamp: new Date().toISOString()
                });
                break;

            default:
                this.sendError(connectionId, `Unknown message type: ${message.type}`);
        }
    }

    /**
     * Subscribe connection to event updates
     */
    private subscribeToEvent(connectionId: string, eventId: string): void {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        connection.eventId = eventId;
        connection.subscriptions.add(`event:${eventId}`);

        // Add to event subscriptions
        if (!this.eventSubscriptions.has(eventId)) {
            this.eventSubscriptions.set(eventId, new Set());
        }
        this.eventSubscriptions.get(eventId)!.add(connectionId);

        this.sendMessage(connectionId, {
            type: 'SUBSCRIPTION_ADDED',
            data: { subscription: `event:${eventId}` },
            timestamp: new Date().toISOString()
        });

        console.log(`Connection ${connectionId} subscribed to event ${eventId}`);
    }

    /**
     * Subscribe connection to user updates
     */
    private subscribeToUser(connectionId: string, userId: string): void {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        connection.userId = userId;
        connection.subscriptions.add(`user:${userId}`);

        // Add to user subscriptions
        if (!this.userSubscriptions.has(userId)) {
            this.userSubscriptions.set(userId, new Set());
        }
        this.userSubscriptions.get(userId)!.add(connectionId);

        this.sendMessage(connectionId, {
            type: 'SUBSCRIPTION_ADDED',
            data: { subscription: `user:${userId}` },
            timestamp: new Date().toISOString()
        });

        console.log(`Connection ${connectionId} subscribed to user ${userId}`);
    }

    /**
     * Unsubscribe from event updates
     */
    private unsubscribeFromEvent(connectionId: string, eventId: string): void {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        connection.subscriptions.delete(`event:${eventId}`);
        this.eventSubscriptions.get(eventId)?.delete(connectionId);

        this.sendMessage(connectionId, {
            type: 'SUBSCRIPTION_REMOVED',
            data: { subscription: `event:${eventId}` },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Unsubscribe from user updates
     */
    private unsubscribeFromUser(connectionId: string, userId: string): void {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        connection.subscriptions.delete(`user:${userId}`);
        this.userSubscriptions.get(userId)?.delete(connectionId);

        this.sendMessage(connectionId, {
            type: 'SUBSCRIPTION_REMOVED',
            data: { subscription: `user:${userId}` },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Handle connection disconnection
     */
    private handleDisconnection(connectionId: string): void {
        const connection = this.connections.get(connectionId);
        if (!connection) return;

        // Remove from all subscriptions
        for (const subscription of connection.subscriptions) {
            if (subscription.startsWith('event:')) {
                const eventId = subscription.split(':')[1];
                this.eventSubscriptions.get(eventId!)?.delete(connectionId);
            } else if (subscription.startsWith('user:')) {
                const userId = subscription.split(':')[1];
                this.userSubscriptions.get(userId!)?.delete(connectionId);
            }
        }

        this.connections.delete(connectionId);
        console.log(`WebSocket connection closed: ${connectionId}`);
    }

    /**
     * Broadcast message to all connections subscribed to an event
     */
    broadcastToEvent(eventId: string, message: WebSocketMessage): void {
        const connections = this.eventSubscriptions.get(eventId);
        if (!connections) return;

        for (const connectionId of connections) {
            this.sendMessage(connectionId, message);
        }
    }

    /**
     * Send message to specific user
     */
    sendToUser(userId: string, message: WebSocketMessage): void {
        const connections = this.userSubscriptions.get(userId);
        if (!connections) return;

        for (const connectionId of connections) {
            this.sendMessage(connectionId, message);
        }
    }

    /**
     * Broadcast to all admin connections
     */
    broadcastToAdmins(message: WebSocketMessage): void {
        for (const [connectionId, connection] of this.connections) {
            if (connection.subscriptions.has('admin')) {
                this.sendMessage(connectionId, message);
            }
        }
    }

    /**
     * Send message to specific connection
     */
    private sendMessage(connectionId: string, message: WebSocketMessage): void {
        const connection = this.connections.get(connectionId);
        if (!connection || connection.ws.readyState !== WebSocket.OPEN) return;

        try {
            connection.ws.send(JSON.stringify(message));
        } catch (error) {
            console.error(`Error sending message to connection ${connectionId}:`, error);
            this.handleDisconnection(connectionId);
        }
    }

    /**
     * Send error message to connection
     */
    private sendError(connectionId: string, error: string): void {
        this.sendMessage(connectionId, {
            type: 'ERROR',
            data: { error },
            timestamp: new Date().toISOString()
        });
    }

    /**
     * Generate unique connection ID
     */
    private generateConnectionId(): string {
        return `conn_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    }

    /**
     * Get connection statistics
     */
    getStats(): any {
        return {
            totalConnections: this.connections.size,
            eventSubscriptions: this.eventSubscriptions.size,
            userSubscriptions: this.userSubscriptions.size,
            activeConnections: Array.from(this.connections.values()).filter(
                conn => conn.ws.readyState === WebSocket.OPEN
            ).length
        };
    }

    /**
     * Close all connections
     */
    close(): void {
        for (const [connectionId, connection] of this.connections) {
            connection.ws.close();
        }
        this.connections.clear();
        this.eventSubscriptions.clear();
        this.userSubscriptions.clear();
    }
}