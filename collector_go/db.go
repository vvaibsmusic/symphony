package main

import (
	"database/sql"

	_ "github.com/mattn/go-sqlite3"
)

type Artist struct {
	ID               string
	Name             string
	SpotifyID        *string
	YoutubeChannelID *string
	Genre            *string
	ImageURL         *string
	IsWatched        bool
}

type Song struct {
	ID           string
	ArtistID     string
	Title        string
	Platform     string
	PlatformID   string
	AlbumName    *string
	ReleaseDate  *string
	ThumbnailURL *string
}

func getDBConnection() (*sql.DB, error) {
	return sql.Open("sqlite3", "../db/music_dashboard.db")
}

func UpsertArtist(db *sql.DB, artist Artist) error {
	query := `
		INSERT INTO artists (id, name, spotify_id, youtube_channel_id, genre, image_url, is_watched)
		VALUES (?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(id) DO UPDATE SET
			name=excluded.name,
			spotify_id=excluded.spotify_id,
			youtube_channel_id=excluded.youtube_channel_id,
			genre=excluded.genre,
			image_url=excluded.image_url
	`
	_, err := db.Exec(query,
		artist.ID,
		artist.Name,
		artist.SpotifyID,
		artist.YoutubeChannelID,
		artist.Genre,
		artist.ImageURL,
		artist.IsWatched,
	)
	return err
}

func UpsertSong(db *sql.DB, song Song) error {
	query := `
		INSERT INTO songs (id, artist_id, title, platform, platform_id, album_name, release_date, thumbnail_url)
		VALUES (?, ?, ?, ?, ?, ?, ?, ?)
		ON CONFLICT(platform, platform_id) DO UPDATE SET
			title=excluded.title,
			album_name=excluded.album_name,
			release_date=excluded.release_date,
			thumbnail_url=excluded.thumbnail_url
	`
	_, err := db.Exec(query,
		song.ID,
		song.ArtistID,
		song.Title,
		song.Platform,
		song.PlatformID,
		song.AlbumName,
		song.ReleaseDate,
		song.ThumbnailURL,
	)
	return err
}

type Snapshot struct {
	SongID           string
	PlayCount        int
	LikeCount        int
	CommentCount     int
	YTMusicPlayCount int
	Platform         string
	CycleID          string
}

func InsertSnapshot(db *sql.DB, s Snapshot) error {
	query := `
		INSERT INTO play_snapshots (song_id, play_count, like_count, comment_count, ytmusic_play_count, platform, cycle_id)
		VALUES (?, ?, ?, ?, ?, ?, ?)
	`
	_, err := db.Exec(query,
		s.SongID,
		s.PlayCount,
		s.LikeCount,
		s.CommentCount,
		s.YTMusicPlayCount,
		s.Platform,
		s.CycleID,
	)
	return err
}

func LogAPIQuota(db *sql.DB, apiName, operation string, units int, details string) error {
	query := `
		INSERT INTO api_quota_log (api_name, operation, units_used, details)
		VALUES (?, ?, ?, ?)
	`
	_, err := db.Exec(query, apiName, operation, units, details)
	return err
}

func GetYouTubeSongs(db *sql.DB) ([]Song, error) {
	query := `SELECT id, platform_id FROM songs WHERE platform = 'youtube' OR platform = 'ytmusic'`
	rows, err := db.Query(query)
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	var songs []Song
	for rows.Next() {
		var s Song
		if err := rows.Scan(&s.ID, &s.PlatformID); err != nil {
			return nil, err
		}
		songs = append(songs, s)
	}
	return songs, nil
}


