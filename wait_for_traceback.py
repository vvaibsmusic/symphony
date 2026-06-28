import requests, time, json
for _ in range(60):
    try:
        r = requests.get("https://vvaibsmusic-symphony.hf.space/api/stats", timeout=5)
        if r.status_code == 500:
            data = r.json()
            if "traceback" in data:
                print(data["traceback"])
                break
        print(f"Status: {r.status_code}, wait...")
    except Exception as e:
        print("Wait...", e)
    time.sleep(5)
