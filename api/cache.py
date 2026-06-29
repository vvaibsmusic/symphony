"""Simple TTL cache for expensive API responses."""
import time
import threading
from functools import wraps

_cache = {}
_lock = threading.Lock()

def ttl_cache(ttl_seconds=60):
    """Decorator that caches function results for ttl_seconds."""
    def decorator(func):
        @wraps(func)
        def wrapper(*args, **kwargs):
            key = (func.__name__, args, tuple(sorted(kwargs.items())))
            now = time.time()
            with _lock:
                if key in _cache:
                    result, expires = _cache[key]
                    if now < expires:
                        return result
            result = func(*args, **kwargs)
            with _lock:
                _cache[key] = (result, now + ttl_seconds)
            return result
        return wrapper
    return decorator

def invalidate_cache():
    """Clear the entire cache (call after data mutations)."""
    global _cache
    with _lock:
        _cache = {}
