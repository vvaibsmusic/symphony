CREATE TABLE IF NOT EXISTS artists (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  spotify_id TEXT,
  youtube_channel_id TEXT,
  genre TEXT,
  region TEXT DEFAULT 'India',
  image_url TEXT,
  is_watched BOOLEAN DEFAULT 0,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS songs (
  id TEXT PRIMARY KEY,
  artist_id TEXT REFERENCES artists(id),
  title TEXT NOT NULL,
  platform TEXT NOT NULL,
  platform_id TEXT NOT NULL,
  album_name TEXT,
  release_date TEXT,
  thumbnail_url TEXT,
  sentiment_score REAL,
  sentiment_summary TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  UNIQUE(platform, platform_id)
);

CREATE TABLE IF NOT EXISTS play_snapshots (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id TEXT REFERENCES songs(id),
  collected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  play_count INTEGER,
  like_count INTEGER DEFAULT 0,
  dislike_count INTEGER DEFAULT 0,
  comment_count INTEGER DEFAULT 0,
  ytmusic_play_count INTEGER,
  platform TEXT NOT NULL,
  cycle_id TEXT
);

CREATE TABLE IF NOT EXISTS viral_alerts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id TEXT REFERENCES songs(id),
  detected_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  previous_count INTEGER,
  current_count INTEGER,
  growth_factor REAL,
  platform TEXT NOT NULL,
  status TEXT DEFAULT 'new'
);

CREATE TABLE IF NOT EXISTS viral_predictions (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  song_id TEXT REFERENCES songs(id),
  prediction_date DATETIME DEFAULT CURRENT_TIMESTAMP,
  is_viral_candidate BOOLEAN,
  confidence_score REAL,
  reasoning TEXT
);

CREATE INDEX IF NOT EXISTS idx_songs_artist ON songs(artist_id);
CREATE INDEX IF NOT EXISTS idx_songs_platform ON songs(platform);
CREATE INDEX IF NOT EXISTS idx_snapshots_song ON play_snapshots(song_id, collected_at);
CREATE INDEX IF NOT EXISTS idx_alerts_status ON viral_alerts(status);
CREATE INDEX IF NOT EXISTS idx_songs_release ON songs(release_date);

CREATE TABLE IF NOT EXISTS api_quota_log (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  api_name TEXT NOT NULL DEFAULT 'youtube_data_v3',
  operation TEXT NOT NULL,
  units_used INTEGER NOT NULL,
  details TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP
);
