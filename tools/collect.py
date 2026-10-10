#!/usr/bin/env python3
"""Собирает выдачу Reels по запросам из data/queries.json через HikerAPI.

Ключ лежит в .env (HIKER_KEY). Один запрос к API = одна страница, 12 роликов.
Запуск: python3 tools/collect.py [страниц на запрос, по умолчанию 3] [запрос ...]
"""
import json, pathlib, sys, time, urllib.parse, urllib.request

ROOT = pathlib.Path(__file__).resolve().parent.parent
API = "https://api.hikerapi.com"


def env_key():
    for line in (ROOT / ".env").read_text().splitlines():
        if line.startswith("HIKER_KEY="):
            return line.split("=", 1)[1].strip()
    sys.exit("В .env нет HIKER_KEY")


def get(path, key, **params):
    url = f"{API}{path}?{urllib.parse.urlencode({k: v for k, v in params.items() if v})}"
    req = urllib.request.Request(url, headers={"x-access-key": key, "accept": "application/json", "user-agent": "curl/8.7.1"})
    with urllib.request.urlopen(req, timeout=90) as r:
        return json.load(r)


def pick(m):
    cm = m.get("clips_metadata") or {}
    music = (cm.get("music_info") or {}).get("music_asset_info") or {}
    sound = cm.get("original_sound_info") or {}
    user = m.get("user") or {}
    images = (m.get("image_versions2") or {}).get("candidates") or []
    videos = m.get("video_versions") or []
    return {
        "code": m.get("code"),
        "plays": m.get("play_count") or m.get("ig_play_count"),
        "likes": m.get("like_count"),
        "comments": m.get("comment_count"),
        "shares": m.get("reshare_count"),
        "taken": m.get("taken_at"),
        "user": user.get("username"),
        "name": user.get("full_name"),
        "verified": bool(user.get("is_verified")),
        "dur": round(m["video_duration"]) if m.get("video_duration") else None,
        "caption": ((m.get("caption") or {}).get("text") or "")[:600],
        "audio": f"{music.get('display_artist')} — {music.get('title')}" if music.get("title") else sound.get("original_audio_title"),
        # ссылка на обложку живёт несколько дней, build.py скачивает её сразу
        "thumb_url": images[0]["url"] if images else None,
        # самая лёгкая версия файла: для просмотра внутри сайта её хватает
        "video_url": min(videos, key=lambda v: (v.get("width") or 0) * (v.get("height") or 0))["url"] if videos else None,
    }


def main():
    pages = int(sys.argv[1]) if len(sys.argv) > 1 else 3
    key = env_key()
    groups = json.loads((ROOT / "data" / "queries.json").read_text())["groups"]
    # запросы можно перечислить в аргументах, иначе берутся все: русские и зарубежные
    queries = sys.argv[2:] or [q for g in groups for q in g["foreign"] + g["queries"]]
    out_path = ROOT / "raw" / f"{time.strftime('%Y-%m-%d-%H%M')}-hiker.json"
    out = json.loads(out_path.read_text()) if out_path.exists() else {}
    spent = 0
    for q in queries:
        if q in out:
            continue
        items, max_id, token = [], None, None
        for _ in range(pages):
            try:
                d = get("/v2/fbsearch/reels", key, query=q, reels_max_id=max_id, rank_token=token)
            except Exception as e:
                print(q, "ошибка:", e)
                break
            spent += 1
            for mod in d.get("reels_serp_modules") or []:
                items += [pick(c["media"]) for c in mod.get("clips") or [] if c.get("media")]
            max_id, token = d.get("reels_max_id"), d.get("rank_token")
            time.sleep(1.2)
            if not d.get("has_more") or not max_id:
                break
        if not items:
            continue
        out[q] = items
        out_path.write_text(json.dumps(out, ensure_ascii=False))
        print(f"{q}: {len(items)}")
    print("запросов к API:", spent)
    try:
        print("остаток:", get("/sys/balance", key))
    except Exception as e:
        print("баланс не прочитался:", e)


if __name__ == "__main__":
    main()
