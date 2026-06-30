const http = require('http');

const server = http.createServer((req, res) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'application/json');

  if (req.url === '/api/dashboard') {
    res.end(JSON.stringify({
      stats: { yt_songs: 100, active_watchers: 5, total_artists: 10, last_collection: { last_run: '2026-06-30T10:00:00Z' } },
      viral: [{ title: 'Viral Song', artist_name: 'Artist', previous_count: 100, current_count: 500, growth_factor: 5, artist_id: 1 }],
      releases: [{ title: 'New Song', artist_name: 'Artist', release_date: '2026-06-29T10:00:00Z', artist_id: 1 }],
      quota: { used: 500, limit: 10000 }
    }));
  } else if (req.url.startsWith('/api/artists')) {
    res.end(JSON.stringify({
      artists: [{ id: 1, name: 'Test Artist', genre: 'Pop', region: 'US', total_yt_songs: 5, total_yt_views: 1000, latest_release_date: '2026-06-29T10:00:00Z' }],
      pages: 1,
      total: 1
    }));
  } else {
    res.statusCode = 404;
    res.end('Not found');
  }
});

server.listen(8000, () => console.log('Mock API running on 8000'));
