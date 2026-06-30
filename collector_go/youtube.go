package main

import (
	"encoding/json"
	"fmt"
	"net/http"
	"os"
	"strconv"
	"strings"
	"sync"
)

type YouTubeStats struct {
	Views    int
	Likes    int
	Comments int
}

type YouTubeClient struct {
	apiKeys []string
	keyIdx  int
	mu      sync.Mutex
}

func NewYouTubeClient() *YouTubeClient {
	var keys []string
	for _, envVar := range []string{"YOUTUBE_API_KEY", "YOUTUBE_API_KEY_2", "YOUTUBE_API_KEY_3", "YOUTUBE_API_KEY_4"} {
		if val := os.Getenv(envVar); val != "" {
			keys = append(keys, val)
		}
	}
	if len(keys) == 0 {
		panic("No YOUTUBE_API_KEY set in environment")
	}
	return &YouTubeClient{
		apiKeys: keys,
		keyIdx:  0,
	}
}

func (c *YouTubeClient) RotateKey() bool {
	c.mu.Lock()
	defer c.mu.Unlock()
	if len(c.apiKeys) <= 1 {
		return false
	}
	c.keyIdx = (c.keyIdx + 1) % len(c.apiKeys)
	fmt.Printf("↻ Rotating to API key #%d\n", c.keyIdx+1)
	return true
}

func (c *YouTubeClient) GetKey() string {
	c.mu.Lock()
	defer c.mu.Unlock()
	return c.apiKeys[c.keyIdx]
}

func (c *YouTubeClient) GetVideoStats(videoIDs []string) (map[string]YouTubeStats, error) {
	results := make(map[string]YouTubeStats)
	if len(videoIDs) == 0 {
		return results, nil
	}

	for i := 0; i < len(videoIDs); i += 50 {
		end := i + 50
		if end > len(videoIDs) {
			end = len(videoIDs)
		}
		batch := videoIDs[i:end]

		url := fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=statistics&id=%s&key=%s", strings.Join(batch, ","), c.GetKey())
		
		resp, err := http.Get(url)
		if err != nil {
			return nil, err
		}
		
		if resp.StatusCode == 403 {
			// Quota exceeded likely
			resp.Body.Close()
			if c.RotateKey() {
				// Retry once
				url = fmt.Sprintf("https://www.googleapis.com/youtube/v3/videos?part=statistics&id=%s&key=%s", strings.Join(batch, ","), c.GetKey())
				resp, err = http.Get(url)
				if err != nil {
					return nil, err
				}
			} else {
				return nil, fmt.Errorf("quota exceeded and no more keys to rotate")
			}
		}

		var data struct {
			Items []struct {
				ID         string `json:"id"`
				Statistics struct {
					ViewCount    string `json:"viewCount"`
					LikeCount    string `json:"likeCount"`
					CommentCount string `json:"commentCount"`
				} `json:"statistics"`
			} `json:"items"`
		}

		err = json.NewDecoder(resp.Body).Decode(&data)
		resp.Body.Close()
		if err != nil {
			return nil, err
		}

		for _, item := range data.Items {
			views, _ := strconv.Atoi(item.Statistics.ViewCount)
			likes, _ := strconv.Atoi(item.Statistics.LikeCount)
			comments, _ := strconv.Atoi(item.Statistics.CommentCount)
			results[item.ID] = YouTubeStats{
				Views:    views,
				Likes:    likes,
				Comments: comments,
			}
		}
	}

	return results, nil
}
