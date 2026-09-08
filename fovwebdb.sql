-- Drop existing tables
DROP TABLE IF EXISTS streams;
DROP TABLE IF EXISTS categories;

-- Table structure for categories
CREATE TABLE categories (
  id SERIAL PRIMARY KEY,
  name VARCHAR(100) NOT NULL UNIQUE,
  viewers INTEGER NOT NULL CHECK (viewers >= 0),
  image_url VARCHAR(255) NOT NULL
);

-- Insert data into categories
INSERT INTO categories (id, name, viewers, image_url) VALUES
(1, 'League of Legends', 125000, 'assets/category/leagues-of-legends.png'),
(2, 'Just Chatting', 98000, 'assets/category/just-chatting.png'),
(3, 'Valorant', 87000, 'assets/category/valorant.png'),
(4, 'Fortnite', 76000, 'assets/category/fortnite.png'),
(5, 'Minecraft', 65000, 'assets/category/minecraft.png'),
(6, 'Music', 0, 'assets/category/music.png');

-- Table structure for streams
CREATE TABLE streams (
  id SERIAL PRIMARY KEY,
  streamer VARCHAR(100) NOT NULL,
  title VARCHAR(255) NOT NULL,
  category_id INTEGER NOT NULL,
  viewers INTEGER NOT NULL CHECK (viewers >= 0),
  thumbnail_url VARCHAR(255) NOT NULL,
  avatar_url VARCHAR(255) NOT NULL,
  is_live BOOLEAN NOT NULL DEFAULT TRUE,
  CONSTRAINT fk_stream_category FOREIGN KEY (category_id) REFERENCES categories(id)
);

CREATE INDEX idx_streams_category_id ON streams(category_id);

-- Insert data into streams
INSERT INTO streams (id, streamer, title, category_id, viewers, thumbnail_url, avatar_url, is_live) VALUES
(1, 'Skyyart', 'Grand tournoi League of Legends ! 🏆', 1, 91200, 'assets/stream-thumbnail1.png', 'assets/profile-avatar.png', TRUE),
(2, 'Domingo', 'Just chatting avec la communauté 💬', 2, 8600, 'assets/stream-thumbnail2.png', 'assets/profile-avatar.png', TRUE),
(3, 'Squeezie', 'Tryhard Valorant avec les potes !', 3, 28100, 'assets/stream-thumbnail3.png', 'assets/profile-avatar.png', TRUE),
(4, 'Mushway', 'Minecraft à l''ancienne !', 5, 5000, 'assets/stream-thumbnail4.png', 'assets/profile-avatar.png', TRUE),
(5, 'Inoxtag', 'Z-Event !', 2, 120000, 'assets/stream-thumbnail5.png', 'assets/profile-avatar.png', FALSE),
(6, 'Lofi Girl', 'Chill beats to relax/study to', 6, 7200, 'assets/stream-thumbnail6.png', 'assets/profile-avatar.png', FALSE);

-- Sync auto-increment sequence counters
SELECT setval(pg_get_serial_sequence('categories', 'id'), COALESCE(MAX(id), 1)) FROM categories;
SELECT setval(pg_get_serial_sequence('streams', 'id'), COALESCE(MAX(id), 1)) FROM streams;