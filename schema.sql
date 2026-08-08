-- Cloudflare D1 schema (applied via the D1 HTTP API)

CREATE TABLE IF NOT EXISTS links (
    id TEXT PRIMARY KEY,
    slug TEXT UNIQUE NOT NULL,
    businessName TEXT NOT NULL,
    gmbReviewLink TEXT NOT NULL,
    logoUrl TEXT,
    backgroundImageUrl TEXT,
    createdAt TEXT
);

CREATE TABLE IF NOT EXISTS feedback (
    id TEXT PRIMARY KEY,
    linkId TEXT NOT NULL,
    name TEXT,
    email TEXT,
    comment TEXT,
    rating INTEGER,
    createdAt TEXT
);

CREATE TABLE IF NOT EXISTS users (
    id TEXT PRIMARY KEY,
    username TEXT UNIQUE NOT NULL,
    password TEXT NOT NULL,
    created_at INTEGER
);

-- Google Business Profile integration

CREATE TABLE IF NOT EXISTS google_tokens (
    id TEXT PRIMARY KEY,          -- 'primary' (single connected account)
    email TEXT,
    refresh_token TEXT NOT NULL,
    access_token TEXT,
    expires_at INTEGER,           -- epoch ms
    created_at TEXT
);

CREATE TABLE IF NOT EXISTS auto_reply_settings (
    location_name TEXT PRIMARY KEY,  -- accounts/{aid}/locations/{lid}
    location_title TEXT,
    enabled INTEGER DEFAULT 0,
    templates TEXT,                  -- JSON: { "1".."5": "reply template" }
    updated_at TEXT
);

CREATE TABLE IF NOT EXISTS replied_reviews (
    review_name TEXT PRIMARY KEY,    -- accounts/{aid}/locations/{lid}/reviews/{rid}
    location_name TEXT,
    star_rating TEXT,
    reply_comment TEXT,
    replied_at TEXT
);
