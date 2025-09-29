-- Enhanced PostgreSQL Schema for zephyr Reservation Service
-- Provides ACID compliance, complex queries, and audit trail

-- Enable UUID extension
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- Events table
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(200) NOT NULL,
    description TEXT,
    total_seats INTEGER NOT NULL CHECK (total_seats BETWEEN 10 AND 1000),
    status VARCHAR(20) DEFAULT 'active' CHECK (status IN ('active', 'inactive', 'cancelled')),
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Seats table with comprehensive tracking
CREATE TABLE seats (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    seat_number INTEGER NOT NULL,
    status VARCHAR(20) DEFAULT 'available' CHECK (status IN ('available', 'held', 'reserved')),
    user_id UUID,
    held_at TIMESTAMP WITH TIME ZONE,
    reserved_at TIMESTAMP WITH TIME ZONE,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, seat_number)
);

-- Reservations table for permanent records
CREATE TABLE reservations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    seat_number INTEGER NOT NULL,
    user_id UUID NOT NULL,
    reserved_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    UNIQUE(event_id, seat_number)
);

-- Event sourcing table for audit trail
CREATE TABLE seat_events (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    seat_number INTEGER NOT NULL,
    user_id UUID,
    event_type VARCHAR(50) NOT NULL, -- 'HOLD_CREATED', 'HOLD_EXPIRED', 'RESERVATION_CREATED', etc.
    event_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- User sessions for tracking active users
CREATE TABLE user_sessions (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id UUID NOT NULL,
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    session_data JSONB,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    expires_at TIMESTAMP WITH TIME ZONE NOT NULL
);

-- Analytics table for reporting
CREATE TABLE seat_analytics (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    event_id UUID NOT NULL REFERENCES events(id) ON DELETE CASCADE,
    metric_name VARCHAR(100) NOT NULL,
    metric_value NUMERIC NOT NULL,
    recorded_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_events_status ON events(status);
CREATE INDEX idx_events_created_at ON events(created_at);
CREATE INDEX idx_seats_event_id ON seats(event_id);
CREATE INDEX idx_seats_status ON seats(status);
CREATE INDEX idx_seats_user_id ON seats(user_id);
CREATE INDEX idx_seats_event_status ON seats(event_id, status);
CREATE INDEX idx_reservations_event_id ON reservations(event_id);
CREATE INDEX idx_reservations_user_id ON reservations(user_id);
CREATE INDEX idx_seat_events_event_id ON seat_events(event_id);
CREATE INDEX idx_seat_events_created_at ON seat_events(created_at);
CREATE INDEX idx_user_sessions_user_id ON user_sessions(user_id);
CREATE INDEX idx_user_sessions_expires_at ON user_sessions(expires_at);

-- Triggers for updated_at timestamps
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ language 'plpgsql';

CREATE TRIGGER update_events_updated_at BEFORE UPDATE ON events
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

CREATE TRIGGER update_seats_updated_at BEFORE UPDATE ON seats
    FOR EACH ROW EXECUTE FUNCTION update_updated_at_column();

-- Function to clean up expired holds
CREATE OR REPLACE FUNCTION cleanup_expired_holds()
RETURNS INTEGER AS $$
DECLARE
    affected_rows INTEGER;
BEGIN
    UPDATE seats 
    SET status = 'available', user_id = NULL, held_at = NULL
    WHERE status = 'held' 
    AND held_at < NOW() - INTERVAL '1 hour';
    
    GET DIAGNOSTICS affected_rows = ROW_COUNT;
    RETURN affected_rows;
END;
$$ LANGUAGE plpgsql;

-- Function to get seat statistics
CREATE OR REPLACE FUNCTION get_seat_statistics(p_event_id UUID)
RETURNS TABLE(
    total_seats INTEGER,
    available_seats INTEGER,
    held_seats INTEGER,
    reserved_seats INTEGER,
    utilization_rate NUMERIC
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        COUNT(*)::INTEGER as total_seats,
        COUNT(CASE WHEN status = 'available' THEN 1 END)::INTEGER as available_seats,
        COUNT(CASE WHEN status = 'held' THEN 1 END)::INTEGER as held_seats,
        COUNT(CASE WHEN status = 'reserved' THEN 1 END)::INTEGER as reserved_seats,
        ROUND(
            (COUNT(CASE WHEN status = 'reserved' THEN 1 END)::NUMERIC / COUNT(*)::NUMERIC) * 100, 
            2
        ) as utilization_rate
    FROM seats 
    WHERE event_id = p_event_id;
END;
$$ LANGUAGE plpgsql;

-- Function to record seat events for audit trail
CREATE OR REPLACE FUNCTION record_seat_event(
    p_event_id UUID,
    p_seat_number INTEGER,
    p_user_id UUID,
    p_event_type VARCHAR(50),
    p_event_data JSONB DEFAULT NULL
)
RETURNS UUID AS $$
DECLARE
    event_id UUID;
BEGIN
    INSERT INTO seat_events (event_id, seat_number, user_id, event_type, event_data)
    VALUES (p_event_id, p_seat_number, p_user_id, p_event_type, p_event_data)
    RETURNING id INTO event_id;
    
    RETURN event_id;
END;
$$ LANGUAGE plpgsql;

-- Views for common queries
CREATE VIEW event_summary AS
SELECT 
    e.id,
    e.name,
    e.description,
    e.total_seats,
    e.status,
    e.created_at,
    s.available_seats,
    s.held_seats,
    s.reserved_seats,
    s.utilization_rate
FROM events e
LEFT JOIN LATERAL get_seat_statistics(e.id) s ON true;

CREATE VIEW user_reservations AS
SELECT 
    r.id,
    r.event_id,
    e.name as event_name,
    r.seat_number,
    r.user_id,
    r.reserved_at
FROM reservations r
JOIN events e ON r.event_id = e.id;

-- Sample data for testing
INSERT INTO events (id, name, description, total_seats) VALUES 
('550e8400-e29b-41d4-a716-446655440000', 'Summer Music Festival 2024', 'Annual outdoor music festival', 100),
('550e8400-e29b-41d4-a716-446655440001', 'Tech Conference 2024', 'Technology and innovation conference', 200);

-- Grant permissions (adjust as needed for your setup)
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO zephyr_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO zephyr_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO zephyr_user;