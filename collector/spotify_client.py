"""Spotify Web API client with token caching and retry handling."""

import base64
import os
import time
from typing import Any, Dict, List, Optional

import requests
from dotenv import load_dotenv

load_dotenv(os.path.join(os.path.dirname(__file__), "..", ".env"))


class SpotifyClient:
    """Minimal Spotify Web API client (Client Credentials flow)."""

    AUTH_URL = "https://accounts.spotify.com/api/token"
    API_BASE = "https://api.spotify.com/v1"

    def __init__(
        self,
        client_id: Optional[str] = None,
        client_secret: Optional[str] = None,
        timeout: int = 20,
    ):
        self.client_id = client_id or os.getenv("SPOTIFY_CLIENT_ID")
        self.client_secret = client_secret or os.getenv("SPOTIFY_CLIENT_SECRET")
        self.timeout = timeout
        self._access_token: Optional[str] = None
        self._token_expires_at = 0.0

        if (
            not self.client_id
            or not self.client_secret
            or "your_spotify_client_id_here" in self.client_id
            or "your_spotify_client_secret_here" in self.client_secret
        ):
            raise RuntimeError(
                "Spotify credentials are missing. Set SPOTIFY_CLIENT_ID and SPOTIFY_CLIENT_SECRET in .env."
            )

    def _refresh_access_token(self) -> str:
        encoded = base64.b64encode(
            f"{self.client_id}:{self.client_secret}".encode("utf-8")
        ).decode("utf-8")
        headers = {
            "Authorization": f"Basic {encoded}",
            "Content-Type": "application/x-www-form-urlencoded",
        }

        response = requests.post(
            self.AUTH_URL,
            headers=headers,
            data={"grant_type": "client_credentials"},
            timeout=self.timeout,
        )
        if response.status_code != 200:
            raise RuntimeError(
                f"Spotify auth failed ({response.status_code}): {response.text}"
            )

        payload = response.json()
        token = payload.get("access_token")
        expires_in = int(payload.get("expires_in", 3600))
        if not token:
            raise RuntimeError("Spotify auth failed: missing access token")

        self._access_token = token
        self._token_expires_at = time.time() + max(expires_in - 30, 30)
        return token

    def _get_access_token(self) -> str:
        if self._access_token and time.time() < self._token_expires_at:
            return self._access_token
        return self._refresh_access_token()

    def _request(
        self,
        method: str,
        path: str,
        params: Optional[Dict[str, Any]] = None,
        retries: int = 5,
    ) -> Dict[str, Any]:
        url = path if path.startswith("http") else f"{self.API_BASE}{path}"
        backoff = 0.5

        for attempt in range(retries):
            token = self._get_access_token()
            headers = {"Authorization": f"Bearer {token}"}
            response = requests.request(
                method,
                url,
                params=params,
                headers=headers,
                timeout=self.timeout,
            )

            if response.status_code == 401 and attempt < retries - 1:
                self._access_token = None
                time.sleep(backoff)
                backoff = min(backoff * 2, 8)
                continue

            if response.status_code == 429 and attempt < retries - 1:
                retry_after = response.headers.get("Retry-After")
                sleep_for = float(retry_after) if retry_after else backoff
                sleep_for = min(sleep_for, 10)  # Cap at 10s to avoid long hangs
                time.sleep(max(sleep_for, 0.5))
                backoff = min(backoff * 2, 8)
                continue

            if response.status_code >= 500 and attempt < retries - 1:
                time.sleep(backoff)
                backoff = min(backoff * 2, 8)
                continue

            if response.status_code >= 400:
                raise RuntimeError(
                    f"Spotify API error ({response.status_code}): {response.text}"
                )

            if not response.text:
                return {}
            return response.json()

        raise RuntimeError("Spotify API request failed after retries")

    @staticmethod
    def _dedupe_by_id(items: List[Dict[str, Any]]) -> List[Dict[str, Any]]:
        seen = set()
        deduped = []
        for item in items:
            item_id = item.get("id")
            if not item_id or item_id in seen:
                continue
            seen.add(item_id)
            deduped.append(item)
        return deduped

    def search_artist(self, name: str, limit: int = 5) -> List[Dict[str, Any]]:
        payload = self._request(
            "GET",
            "/search",
            params={
                "q": name,
                "type": "artist",
                "limit": max(1, min(limit, 50)),
            },
        )
        return payload.get("artists", {}).get("items", [])

    def get_artist(self, artist_id: str) -> Dict[str, Any]:
        return self._request("GET", f"/artists/{artist_id}")

    def get_artist_top_tracks(self, artist_id: str, market: str = "IN") -> List[Dict[str, Any]]:
        payload = self._request(
            "GET",
            f"/artists/{artist_id}/top-tracks",
            params={"market": market},
        )
        return payload.get("tracks", [])

    def get_artist_albums(
        self,
        artist_id: str,
        include_groups: str = "album,single",
        limit: int = 20,
        market: Optional[str] = None,
    ) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        offset = 0
        # Some Spotify apps currently enforce a lower cap for this endpoint.
        limit = max(1, min(limit, 100))

        while len(results) < limit:
            page_limit = min(50, limit - len(results))
            params: Dict[str, Any] = {
                "include_groups": include_groups,
                "limit": page_limit,
                "offset": offset,
            }
            if market:
                params["market"] = market

            payload = self._request("GET", f"/artists/{artist_id}/albums", params=params)
            items = payload.get("items", [])
            if not items:
                break

            results.extend(items)
            if not payload.get("next"):
                break
            offset += len(items)

        return self._dedupe_by_id(results)

    def get_album_tracks(self, album_id: str, limit: int = 50) -> List[Dict[str, Any]]:
        results: List[Dict[str, Any]] = []
        offset = 0
        limit = max(1, min(limit, 200))

        while len(results) < limit:
            page_limit = min(50, limit - len(results))
            payload = self._request(
                "GET",
                f"/albums/{album_id}/tracks",
                params={"limit": page_limit, "offset": offset},
            )
            items = payload.get("items", [])
            if not items:
                break

            results.extend(items)
            if not payload.get("next"):
                break
            offset += len(items)

        return self._dedupe_by_id(results)

    def get_tracks(self, track_ids: List[str]) -> List[Dict[str, Any]]:
        if not track_ids:
            return []

        unique_ids = []
        seen = set()
        for track_id in track_ids:
            if track_id and track_id not in seen:
                seen.add(track_id)
                unique_ids.append(track_id)

        results: List[Dict[str, Any]] = []
        for i in range(0, len(unique_ids), 50):
            batch = unique_ids[i : i + 50]
            payload = self._request("GET", "/tracks", params={"ids": ",".join(batch)})
            tracks = payload.get("tracks", [])
            for track in tracks:
                if track:
                    results.append(track)
        return self._dedupe_by_id(results)
