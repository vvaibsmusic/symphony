import YouTubeDashboardClient from './client';

export const dynamic = 'force-dynamic';

export default async function YouTubeDashboardServer() {
    // Determine the API URL (defaults to localhost port 8000 since Next.js runs alongside FastAPI in Docker)
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    
    let initialDashboard = null;
    let initialArtists = null;

    try {
        // Fetch dashboard and initial artists server-side in parallel
        const [dashboardRes, artistsRes] = await Promise.all([
            fetch(`${API}/api/dashboard`, { cache: 'no-store' }),
            fetch(`${API}/api/artists?page=1&limit=50&sort_by=views&sort_dir=desc`, { cache: 'no-store' })
        ]);

        if (dashboardRes.ok) initialDashboard = await dashboardRes.json();
        if (artistsRes.ok) initialArtists = await artistsRes.json();
    } catch (e) {
        console.error("Failed to fetch initial data during SSR:", e);
    }

    return (
        <YouTubeDashboardClient 
            initialDashboard={initialDashboard} 
            initialArtists={initialArtists} 
        />
    );
}
