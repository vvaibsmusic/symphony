package main

import (
	"crypto/rand"
	"encoding/hex"
	"fmt"
	"log"
	"sync"

	"github.com/joho/godotenv"
)

func generateCycleID() string {
	b := make([]byte, 8)
	rand.Read(b)
	return hex.EncodeToString(b)
}

func main() {
	// Load .env from parent directory
	_ = godotenv.Load("../.env")

	db, err := getDBConnection()
	if err != nil {
		log.Fatalf("Failed to connect to DB: %v", err)
	}
	defer db.Close()

	ytClient := NewYouTubeClient()

	songs, err := GetYouTubeSongs(db)
	if err != nil {
		log.Fatalf("Failed to get songs: %v", err)
	}

	fmt.Printf("Fetched %d YouTube songs to enrich.\n", len(songs))
	if len(songs) == 0 {
		return
	}

	cycleID := generateCycleID()
	var wg sync.WaitGroup

	// We'll chunk the songs into slices of 50 for the API
	chunkSize := 50
	
	// Create a buffered channel to limit concurrency to 10 parallel goroutines
	sem := make(chan struct{}, 10)

	var mu sync.Mutex
	totalProcessed := 0

	for i := 0; i < len(songs); i += chunkSize {
		end := i + chunkSize
		if end > len(songs) {
			end = len(songs)
		}
		batch := songs[i:end]

		wg.Add(1)
		go func(batch []Song) {
			defer wg.Done()
			sem <- struct{}{}        // acquire
			defer func() { <-sem }() // release

			var videoIDs []string
			songMap := make(map[string]string) // platform_id -> song_id
			for _, s := range batch {
				videoIDs = append(videoIDs, s.PlatformID)
				songMap[s.PlatformID] = s.ID
			}

			stats, err := ytClient.GetVideoStats(videoIDs)
			if err != nil {
				log.Printf("Error fetching stats for batch: %v", err)
				return
			}
			
			// Insert snapshots concurrently inside the batch
			for vid, s := range stats {
				songID := songMap[vid]
				snap := Snapshot{
					SongID:       songID,
					PlayCount:    s.Views,
					LikeCount:    s.Likes,
					CommentCount: s.Comments,
					Platform:     "youtube",
					CycleID:      cycleID,
				}
				if err := InsertSnapshot(db, snap); err != nil {
					log.Printf("Failed to insert snapshot for %s: %v", songID, err)
				}
			}

			mu.Lock()
			totalProcessed += len(stats)
			fmt.Printf("Processed %d/%d songs...\n", totalProcessed, len(songs))
			mu.Unlock()

		}(batch)
	}

	wg.Wait()
	
	// Log API usage (roughly 1 unit per batch)
	unitsUsed := len(songs) / 50
	if len(songs)%50 != 0 {
		unitsUsed++
	}
	LogAPIQuota(db, "youtube_data_v3", "videos.list (Go)", unitsUsed, fmt.Sprintf("Enriched %d songs", len(songs)))

	fmt.Println("✅ YouTube Enrichment Complete!")
}
