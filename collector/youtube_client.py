"""YouTube Data API v3 + ytmusicapi client for fetching artist songs and view counts."""

import os
import json
import logging
import datetime
import time
from traceback import format_exc
from typing import Optional, List, Dict, Any, Union, cast
from dotenv import load_dotenv

import googleapiclient.discovery  # type: ignore

load_dotenv()

# Try YouTube Data API v3 first
try:
    from googleapiclient.discovery import build as build_yt_service
    HAS_YT_DATA_API = True
except ImportError:
    HAS_YT_DATA_API = False

# Try ytmusicapi
try:
    from ytmusicapi import YTMusic  # type: ignore
    HAS_YTMUSIC = True
except ImportError:
    HAS_YTMUSIC = False


class YouTubeClient:
    """Fetches song data from YouTube using Data API v3 and/or ytmusicapi."""

    def __init__(self):
        self.api_key = os.getenv("YOUTUBE_API_KEY")
        self.youtube: Optional[googleapiclient.discovery.Resource] = None
        self.ytmusic: Optional[YTMusic] = None

        if HAS_YT_DATA_API and self.api_key and self.api_key != "your_youtube_api_key_here":
            self.youtube = build_yt_service("youtube", "v3", developerKey=self.api_key)
            print("[YouTube] Data API v3 initialized")
        else:
            print("[YouTube] Data API v3 not available (no API key or missing library)")

        if HAS_YTMUSIC:
            self.ytmusic = YTMusic()
            print("[YouTube] ytmusicapi initialized (unauthenticated)")
        else:
            print("[YouTube] ytmusicapi not installed")

    def resolve_channel_by_handle(self, handle: str) -> Optional[Dict[str, Any]]:
        """Resolve a YouTube @handle to channel info using Data API v3 or fallback to scraping.

        Args:
            handle: YouTube handle without '@' prefix (e.g. 'agsyworld')

        Returns:
            dict with channel_id, name, thumbnail, subscriber_count, description
            or None if not found.
        """
        handle = handle.lstrip("@")
        
        # 1. Try Official API first
        if self.youtube:
            try:
                yt_api = cast(Any, self.youtube)
                response = yt_api.channels().list(
                    forHandle=handle,
                    part="snippet,statistics",
                    maxResults=1,
                ).execute()

                items = response.get("items", [])
                if items:
                    ch = items[0]
                    snippet = ch.get("snippet", {})
                    stats = ch.get("statistics", {})
                    thumbnails = snippet.get("thumbnails", {})
                    thumb = (
                        thumbnails.get("high", {}).get("url")
                        or thumbnails.get("medium", {}).get("url")
                        or thumbnails.get("default", {}).get("url")
                    )

                    return {
                        "channel_id": ch.get("id"),
                        "name": snippet.get("title", ""),
                        "thumbnail": thumb,
                        "subscriber_count": int(stats.get("subscriberCount", 0)),
                        "description": snippet.get("description", ""),
                    }
            except Exception as e:
                print(f"[YouTube] API error resolving handle @{handle}: {e}")

        # 2. Fallback to Web Scraping (No API Key Required)
        print(f"[YouTube] Falling back to web scrape for @{handle}...")
        try:
            import requests
            import re
            
            headers = {
                "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36"
            }
            url = f"https://www.youtube.com/@{handle}"
            html = requests.get(url, headers=headers, timeout=10).text

            # Extract Channel ID
            channel_id_match = re.search(r'itemprop="channelId" content="(UC[A-Za-z0-9_-]+)"', html)
            if not channel_id_match:
                channel_id_match = re.search(r'canonical" href="https://www.youtube.com/channel/(UC[A-Za-z0-9_-]+)"', html)
            if not channel_id_match:
                channel_id_match = re.search(r'"externalId":"(UC[A-Za-z0-9_-]+)"', html)
                
            # Extract Name
            name_match = re.search(r'"title":"([^"]+)","avatar"', html)
            if not name_match:
                name_match = re.search(r'<title>(.*?) - YouTube</title>', html)
                
            # Extract Thumbnail
            thumb_match = re.search(r'avatar":{"thumbnails":\[.*?{"url":"([^"]+)"', html)

            channel_id = channel_id_match.group(1) if channel_id_match else None
            name = name_match.group(1) if name_match else handle
            thumb = thumb_match.group(1) if thumb_match else ""

            if channel_id:
                return {
                    "channel_id": channel_id,
                    "name": name,
                    "thumbnail": thumb,
                    "subscriber_count": 0,
                    "description": "",
                }
        except Exception as e:
            print(f"[YouTube] Scrape fallback error for @{handle}: {e}")

        return None

    def get_artist_songs_ytmusic(self, channel_id: str, artist_name: str, fast_mode: bool = False) -> List[Dict[str, Any]]:
        """Get artist's songs via ytmusicapi. Returns list of song dicts.
        If fast_mode=True, skips recursive album fetching for speed."""
        if not self.ytmusic:
            return []

        try:
            # Search for the artist on YT Music
            ytm = cast(Any, self.ytmusic)
            search_results = ytm.search(artist_name, filter="artists", limit=5)
            if not search_results:
                print(f"  [ytmusic] No results for '{artist_name}'")
                return []

            # Find the best match
            artist_browse_id = None
            for result in search_results:
                if result.get("browseId"):
                    artist_browse_id = result["browseId"]
                    break

            if not artist_browse_id:
                print(f"  [ytmusic] No browseId for '{artist_name}'")
                return []

            # Get artist details
            artist_data = ytm.get_artist(artist_browse_id)

            songs = []

            # Get songs from the artist page
            if "songs" in artist_data and "results" in artist_data["songs"]:
                for track in artist_data["songs"]["results"]:
                    song = {
                        "title": track.get("title", "Unknown"),
                        "video_id": track.get("videoId"),
                        "album": track.get("album", {}).get("name") if track.get("album") else None,
                        "views": self._parse_view_count(track.get("views", "")),
                        "thumbnail": self._get_best_thumbnail(track.get("thumbnails", [])),
                    }
                    if song["video_id"]:
                        songs.append(song)

            # Also try to get albums/singles for release dates (skip in fast_mode)
            if not fast_mode and "albums" in dict(artist_data) and "results" in dict(artist_data).get("albums", {}):
                for album in artist_data["albums"]["results"][:10]:
                    album_id = str(album.get("browseId", ""))
                    if album_id and self.ytmusic is not None:
                        try:
                            ytm: Any = self.ytmusic
                            album_data = ytm.get_album(album_id)
                            release_date = album_data.get("year")
                            for track in album_data.get("tracks", []):
                                # Check if we already have this song
                                vid = track.get("videoId")
                                if vid and not any(s["video_id"] == vid for s in songs):
                                    songs.append({
                                        "title": track.get("title", "Unknown"),
                                        "video_id": vid,
                                        "album": album_data.get("title"),
                                        "views": self._parse_view_count(track.get("views", "")),
                                        "thumbnail": self._get_best_thumbnail(track.get("thumbnails", [])),
                                        "release_year": release_date,
                                    })
                            time.sleep(0.3)  # Rate limit
                        except Exception as e:
                            print(f"  [ytmusic] Error fetching album {album_id}: {e}")

            # Try singles too
            if "singles" in dict(artist_data) and "results" in dict(artist_data).get("singles", {}):
                for single in artist_data["singles"]["results"][:10]:
                    single_id = str(single.get("browseId", ""))
                    if single_id and self.ytmusic is not None:
                        try:
                            ytm: Any = self.ytmusic
                            single_data = ytm.get_album(single_id)
                            release_date = single_data.get("year")
                            for track in single_data.get("tracks", []):
                                vid = track.get("videoId")
                                if vid and not any(s["video_id"] == vid for s in songs):
                                    songs.append({
                                        "title": track.get("title", "Unknown"),
                                        "video_id": vid,
                                        "album": single_data.get("title"),
                                        "views": self._parse_view_count(track.get("views", "")),
                                        "thumbnail": self._get_best_thumbnail(track.get("thumbnails", [])),
                                        "release_year": release_date,
                                    })
                            time.sleep(0.3)
                        except Exception as e:
                            print(f"  [ytmusic] Error fetching single {single_id}: {e}")

            print(f"  [ytmusic] Found {len(songs)} songs for '{artist_name}'")
            return songs

        except Exception as e:
            print(f"  [ytmusic] Error for '{artist_name}': {e}")
            return []

    def get_video_stats(self, video_ids: List[str]) -> Dict[str, Dict[str, Union[int, str]]]:
        """Get view/like/comment counts for a list of video IDs using YouTube Data API v3.
        Returns dict of {video_id: {views, likes, comments, published_at}}"""
        if not self.youtube:
            return {}

        stats: Dict[str, Dict[str, Union[int, str]]] = {}
        # Process in batches of 50 (API limit)
        for i in range(0, len(video_ids), 50):
            # Pyre gets confused with slicing lists sometimes, so cast explicitly
            chunk_end = min(i + 50, len(video_ids))
            batch: List[str] = [video_ids[j] for j in range(i, chunk_end)]
            try:
                yt_api = cast(Any, self.youtube)
                response = yt_api.videos().list(
                    part="statistics,snippet",
                    id=",".join(batch)
                ).execute()

                for item in response.get("items", []):
                    vid = item["id"]
                    statistics = item.get("statistics", {})
                    snippet = item.get("snippet", {})
                    stats[vid] = {
                        "views": int(statistics.get("viewCount", 0)),
                        "likes": int(statistics.get("likeCount", 0)),
                        "comments": int(statistics.get("commentCount", 0)),
                        "published_at": snippet.get("publishedAt", ""),
                        "title": snippet.get("title", ""),
                        "channel_title": snippet.get("channelTitle", ""),
                        "thumbnail": snippet.get("thumbnails", {}).get("high", {}).get("url", ""),
                    }

                time.sleep(0.1)  # Small delay between batches
            except Exception as e:
                print(f"  [yt-data-api] Error fetching stats for batch: {e}")

        return stats

    def search_videos_by_query(self, query: str, max_results: int = 5) -> List[Dict[str, Any]]:
        """Search YouTube for a specific string (e.g., 'Artist Title')"""
        if self.youtube is None:
            return []

        try:
            yt_api = cast(Any, self.youtube)
            response = yt_api.search().list(
                q=query,
                part="id,snippet",
                type="video",
                maxResults=max_results,
            ).execute()

            videos = []
            for item in response.get("items", []):
                videos.append({
                    "video_id": item["id"]["videoId"],
                    "title": item["snippet"]["title"],
                    "published_at": item["snippet"]["publishedAt"],
                    "channel_title": item["snippet"]["channelTitle"],
                    "thumbnail": item["snippet"]["thumbnails"].get("high", {}).get("url", ""),
                })
            return videos
        except Exception as e:
            print(f"  [yt-data-api] Error searching videos for '{query}': {e}")
            return []

    def get_channel_videos(self, channel_id: str, max_results: int = 50) -> list:
        """Get recent videos from a YouTube channel using Data API v3."""
        if not self.youtube:
            return []

        try:
            # Search for videos by the channel
            yt_api = cast(Any, self.youtube)
            response = yt_api.search().list(
                part="id,snippet",
                channelId=channel_id,
                type="video",
                order="date",
                maxResults=min(max_results, 50),
                videoCategoryId="10"  # Music category
            ).execute()

            videos = []
            for item in response.get("items", []):
                videos.append({
                    "video_id": item["id"]["videoId"],
                    "title": item["snippet"]["title"],
                    "published_at": item["snippet"]["publishedAt"],
                    "thumbnail": item["snippet"]["thumbnails"].get("high", {}).get("url", ""),
                })

            return videos
        except Exception as e:
            print(f"  [yt-data-api] Error fetching channel videos: {e}")
            return []

    def _parse_view_count(self, view_str: str) -> Optional[int]:
        """Parse view count strings like '1.5M views' or '500K views'."""
        if not view_str:
            return None
        view_str = view_str.lower().replace(",", "").replace(" views", "").replace(" plays", "").strip()
        try:
            if "b" in view_str:
                return int(float(view_str.replace("b", "")) * 1_000_000_000)
            elif "m" in view_str:
                return int(float(view_str.replace("m", "")) * 1_000_000)
            elif "k" in view_str:
                return int(float(view_str.replace("k", "")) * 1_000)
            else:
                return int(float(view_str))
        except (ValueError, TypeError):
            return None

    def _get_best_thumbnail(self, thumbnails: list) -> str:
        """Get the highest resolution thumbnail URL."""
        if not thumbnails:
            return ""
        return thumbnails[-1].get("url", "")
