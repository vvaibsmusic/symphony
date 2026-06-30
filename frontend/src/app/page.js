import HomeClient from './client';

export const dynamic = 'force-dynamic';

export default async function HomeServer() {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    let initialStats = null;

    try {
        const statsRes = await fetch(`${API}/api/stats`, { cache: 'no-store' });
        if (statsRes.ok) initialStats = await statsRes.json();
    } catch (e) {
        console.error("Failed to fetch initial stats:", e);
    }

    return <HomeClient initialStats={initialStats} />;
}
