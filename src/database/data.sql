-- Required extensions for UUID generation
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-------------------------------------------------
-- 1. USERS & CLUBS
-------------------------------------------------
CREATE TABLE users (
    user_id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    full_name TEXT NOT NULL,
    email TEXT UNIQUE NOT NULL,
    google_id TEXT UNIQUE NOT NULL,
    virtual_balance NUMERIC(18,2) NOT NULL DEFAULT 10000.00 CHECK (virtual_balance >= 0),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE clubs (
    club_id SERIAL PRIMARY KEY,
    club_name TEXT UNIQUE NOT NULL,
    department TEXT NULL,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-------------------------------------------------
-- 2. EVENTS
-------------------------------------------------
CREATE TABLE events (
    event_id SERIAL PRIMARY KEY,
    event_name TEXT NOT NULL,
    venue TEXT NOT NULL,
    image_url TEXT,
    extra_details JSONB,
    event_time TIMESTAMPTZ NOT NULL,
    organizing_club_id INT REFERENCES clubs(club_id) ON DELETE CASCADE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for timeline queries and JSON searches
CREATE INDEX idx_events_time ON events(event_time);
CREATE INDEX idx_events_extra_details ON events USING GIN (extra_details);

-------------------------------------------------
-- 3. STOCKS & PRICES
-------------------------------------------------
CREATE TABLE stocks (
    stock_id SERIAL PRIMARY KEY,
    club_id INT UNIQUE REFERENCES clubs(club_id) ON DELETE CASCADE,
    symbol TEXT UNIQUE NOT NULL,
    current_price NUMERIC(18,4) NOT NULL DEFAULT 10.00,
    last_updated TIMESTAMPTZ DEFAULT NOW(),
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE stock_prices (
    price_id SERIAL PRIMARY KEY,
    stock_id INT REFERENCES stocks(stock_id) ON DELETE CASCADE,
    price NUMERIC(18,4) NOT NULL CHECK (price >= 0),
    recorded_at TIMESTAMPTZ DEFAULT NOW()
);

-- Index for historical price lookups
CREATE INDEX idx_stock_prices_recorded_at ON stock_prices (stock_id, recorded_at DESC);

-------------------------------------------------
-- 4. PORTFOLIO & TRANSACTIONS
-------------------------------------------------
CREATE TABLE user_portfolio (
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    stock_id INT REFERENCES stocks(stock_id) ON DELETE CASCADE,
    shares_owned NUMERIC(18,6) NOT NULL DEFAULT 0 CHECK (shares_owned >= 0),
    avg_buy_price NUMERIC(18,4) NOT NULL DEFAULT 0,
    PRIMARY KEY (user_id, stock_id)
);

CREATE INDEX idx_portfolio_user ON user_portfolio(user_id);

CREATE TYPE trade_type AS ENUM ('BUY', 'SELL');

CREATE TABLE trade_transactions (
    transaction_id SERIAL PRIMARY KEY,
    user_id UUID REFERENCES users(user_id) ON DELETE CASCADE,
    stock_id INT REFERENCES stocks(stock_id) ON DELETE CASCADE,
    trade trade_type NOT NULL,
    shares NUMERIC(18,6) NOT NULL CHECK (shares > 0),
    price_per_share NUMERIC(18,4) NOT NULL CHECK (price_per_share >= 0),
    total_value NUMERIC(18,4) GENERATED ALWAYS AS (shares * price_per_share) STORED,
    executed_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_trades_user_time ON trade_transactions(user_id, executed_at DESC);

-------------------------------------------------
-- 5. TRIGGERS (AUTOMATION)
-------------------------------------------------

-- Automatically sync stock current_price when price history is updated
CREATE OR REPLACE FUNCTION sync_stock_price()
RETURNS TRIGGER AS $$
BEGIN
    UPDATE stocks
    SET current_price = NEW.price,
        last_updated = NOW()
    WHERE stock_id = NEW.stock_id;
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_sync_stock_price
AFTER INSERT ON stock_prices
FOR EACH ROW
EXECUTE FUNCTION sync_stock_price();

-------------------------------------------------
-- 6. CORE LOGIC (STORED PROCEDURES)
-------------------------------------------------

-- Handles the entire lifecycle of a trade with row-level locking
CREATE OR REPLACE FUNCTION execute_trade(
    p_user UUID,
    p_stock INT,
    p_trade trade_type,
    p_shares NUMERIC
)
RETURNS VOID AS $$
DECLARE 
    m_price NUMERIC;
    m_total_cost NUMERIC;
BEGIN
    -- 1. Get current price and lock stock row to prevent price change during trade
    SELECT current_price INTO m_price FROM stocks WHERE stock_id = p_stock FOR SHARE;

    m_total_cost := p_shares * m_price;

    IF p_trade = 'BUY' THEN
        -- 2. Deduct balance with locking
        UPDATE users
        SET virtual_balance = virtual_balance - m_total_cost
        WHERE user_id = p_user AND virtual_balance >= m_total_cost;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient balance for this trade.';
        END IF;

        -- 3. Update Portfolio (Weighted Average Price calculation)
        INSERT INTO user_portfolio(user_id, stock_id, shares_owned, avg_buy_price)
        VALUES (p_user, p_stock, p_shares, m_price)
        ON CONFLICT (user_id, stock_id)
        DO UPDATE SET
            avg_buy_price = ((user_portfolio.shares_owned * user_portfolio.avg_buy_price) + 
                             (EXCLUDED.shares_owned * EXCLUDED.avg_buy_price)) 
                            / (user_portfolio.shares_owned + EXCLUDED.shares_owned),
            shares_owned = user_portfolio.shares_owned + EXCLUDED.shares_owned;

    ELSE -- SELL
        -- 2. Deduct shares with locking
        UPDATE user_portfolio
        SET shares_owned = shares_owned - p_shares
        WHERE user_id = p_user AND stock_id = p_stock AND shares_owned >= p_shares;

        IF NOT FOUND THEN
            RAISE EXCEPTION 'Insufficient shares to sell.';
        END IF;

        -- 3. Add to user balance
        UPDATE users
        SET virtual_balance = virtual_balance + m_total_cost
        WHERE user_id = p_user;

        -- 4. Cleanup empty holdings
        DELETE FROM user_portfolio WHERE user_id = p_user AND stock_id = p_stock AND shares_owned = 0;
    END IF;

    -- 4. Record transaction
    INSERT INTO trade_transactions (user_id, stock_id, trade, shares, price_per_share)
    VALUES (p_user, p_stock, p_trade, p_shares, m_price);
END;
$$ LANGUAGE plpgsql;

-------------------------------------------------
-- 7. ANALYTICS VIEWS
-------------------------------------------------
CREATE OR REPLACE VIEW user_net_worth AS
SELECT 
    u.user_id,
    u.full_name,
    u.virtual_balance AS cash,
    COALESCE(SUM(p.shares_owned * s.current_price), 0) AS portfolio_value,
    (u.virtual_balance + COALESCE(SUM(p.shares_owned * s.current_price), 0)) AS total_net_worth
FROM users u
LEFT JOIN user_portfolio p ON u.user_id = p.user_id
LEFT JOIN stocks s ON p.stock_id = s.stock_id
GROUP BY u.user_id, u.full_name, u.virtual_balance;