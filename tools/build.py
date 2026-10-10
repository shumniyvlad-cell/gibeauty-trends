#!/usr/bin/env python3
"""Собирает data/reels.json из сырых выгрузок raw/*.json и докачивает обложки.

raw/<дата>.json: {"<запрос>": [{code, plays, likes, comments, taken, user, ...}, ...]}
Запуск: python3 tools/build.py
"""
import json, pathlib, random, subprocess, time

ROOT = pathlib.Path(__file__).resolve().parent.parent
UA = "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/140.0 Safari/537.36"


def main():
    out_path = ROOT / "data" / "reels.json"
    prev = json.loads(out_path.read_text()) if out_path.exists() else {"reels": []}
    reels = {r["code"]: r for r in prev["reels"]}
    collected = dict(prev.get("collected", {}))
    urls = {}  # свежие ссылки на обложки из выгрузки API

    for raw in sorted((ROOT / "raw").glob("*.json")):
        stamp = int(raw.stat().st_mtime)
        for query, items in json.loads(raw.read_text()).items():
            collected[query] = max(collected.get(query, 0), stamp)
            for it in items:
                if not it.get("code") or it.get("plays") is None:
                    continue
                r = reels.setdefault(it["code"], {"queries": [], "history": []})
                r.update({k: it.get(k) for k in ("code", "plays", "likes", "comments", "taken", "user", "name", "verified", "dur", "caption", "audio") if it.get(k) is not None or k not in r})
                if it.get("shares") is not None:
                    r["shares"] = it["shares"]
                if it.get("thumb_url"):
                    urls[it["code"]] = it["thumb_url"]
                if query not in r["queries"]:
                    r["queries"].append(query)
                # снимки просмотров: по ним считается скорость роста между сборами
                if not r["history"] or r["history"][-1][0] != stamp:
                    r["history"].append([stamp, it["plays"]])

    for code, r in reels.items():
        thumb = ROOT / "thumbs" / f"{code}.jpg"
        if not thumb.exists():
            direct = urls.get(code)
            subprocess.run(["curl", "-s", "-L", "-m", "30", "-A", UA, "-o", str(thumb),
                            direct or f"https://www.instagram.com/p/{code}/media/?size=l"])
            ok = thumb.exists() and thumb.read_bytes()[:2] == b"\xff\xd8"
            if ok:
                subprocess.run(["sips", "-Z", "854", "-s", "formatOptions", "60", str(thumb)], capture_output=True)
            else:
                thumb.unlink(missing_ok=True)
            if not ok:
                print(code, "нет обложки")
            # к самому Instagram ходим с паузой, CDN по прямой ссылке её не требует
            if not direct:
                time.sleep(2 + random.random() * 2)
        r["thumb"] = thumb.exists()

    out_path.write_text(json.dumps({"updated": max(collected.values(), default=int(time.time())),
                                    "collected": collected,
                                    "reels": sorted(reels.values(), key=lambda r: -r["plays"])},
                                   ensure_ascii=False, separators=(",", ":")))
    print(len(reels), "роликов")


if __name__ == "__main__":
    main()
