import ArtistDetailClient from './client';

export const dynamic = 'force-dynamic';

export default async function ArtistDetailServer({ params }) {
    const API = process.env.NEXT_PUBLIC_API_URL || 'http://127.0.0.1:8000';
    let initialData = null;

    try {
        const res = await fetch(`${API}/api/artist/${params.id}?platform=youtube`, { cache: 'no-store' });
        if (res.ok) initialData = await res.json();
    } catch (e) {
        console.error("Failed to fetch initial artist data:", e);
    }

    return <ArtistDetailClient initialData={initialData} />;
}
