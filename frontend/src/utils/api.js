// Tiny stale-while-revalidate fetch layer.
// Cached responses render instantly from sessionStorage while a background
// fetch refreshes them, so navigating between pages never shows a spinner
// after the first visit.

const API = process.env.NEXT_PUBLIC_API_URL || "";
const PREFIX = "swr:";
const mem = new Map();

export function getCached(path) {
  if (mem.has(path)) return mem.get(path);
  try {
    const raw = sessionStorage.getItem(PREFIX + path);
    if (raw) {
      const val = JSON.parse(raw);
      mem.set(path, val);
      return val;
    }
  } catch {}
  return null;
}

export async function fetchJSON(path) {
  const res = await fetch(API + path);
  if (!res.ok) throw new Error(`HTTP ${res.status} for ${path}`);
  const data = await res.json();
  mem.set(path, data);
  try {
    sessionStorage.setItem(PREFIX + path, JSON.stringify(data));
  } catch {}
  return data;
}

// Calls apply() immediately with cached data (if any), then again with fresh
// data once the network responds. Resolves as soon as data has been applied.
export function swr(path, apply) {
  const cached = getCached(path);
  if (cached !== null) {
    apply(cached, true);
    fetchJSON(path)
      .then((fresh) => apply(fresh, false))
      .catch(() => {});
    return Promise.resolve(cached);
  }
  return fetchJSON(path).then((fresh) => {
    apply(fresh, false);
    return fresh;
  });
}

// Drop everything after a mutation (watch toggle, add/delete artist, refresh).
export function clearApiCache() {
  mem.clear();
  try {
    const keys = [];
    for (let i = 0; i < sessionStorage.length; i++) {
      const k = sessionStorage.key(i);
      if (k && k.startsWith(PREFIX)) keys.push(k);
    }
    keys.forEach((k) => sessionStorage.removeItem(k));
  } catch {}
}
