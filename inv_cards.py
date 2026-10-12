#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""투자 노트(investment-notes) 카드 데이터 입출력 — 2026-10-12
실제 데이터는 비공개 저장소 whysosary-dot/invest-private 의 research/companies.json 이다
(사이트 assets/app.js·admin.js 가 이 경로를 읽고 씀. investment-notes/data/companies.json 은 폐기).

사용법
  python3 inv_cards.py pull [OUT.json]          원격 최신본을 내려받아 저장(기본 /tmp/inv_<uid>/companies.json), 기업·카드 수 출력
  python3 inv_cards.py push NEW.json [--dry-run] 새 카드만 원격 최신본에 union 병합 후 커밋
     NEW.json 형식: {"last_updated":"YYYY-MM-DD","companies":[{id,name,ticker,sector,tags,created_at,cards:[...]}]}
     - 원격에 없는 기업 → 통째로 추가 / 있는 기업 → 원격에 없는 card id 만 뒤에 추가
     - 같은 기업에 title+date 가 같은 카드가 이미 있으면 중복으로 보고 건너뜀
     - 웹에서 만든 카드·기업 color·삭제 상태는 건드리지 않음(원격이 기준)
     - sha 충돌(409/422) 시 최신본을 다시 받아 재병합 후 재시도(최대 3회)
토큰: 같은 Claude 폴더의 stock-valuation/.github_token (값을 출력하지 않음)
"""
import sys, os, json, base64, time, urllib.request, urllib.error
OWNER, REPO, PATH, BRANCH = "whysosary-dot", "invest-private", "research/companies.json", "main"
HERE = os.path.dirname(os.path.abspath(__file__))
WORK = os.environ.get("INV_WORK") or f"/tmp/inv_{os.getuid()}"

def token():
    for p in [os.path.join(HERE, "..", "stock-valuation", ".github_token"), os.path.join(HERE, ".github_token")]:
        if os.path.exists(p):
            return open(p).read().strip()
    raise SystemExit("토큰 파일 없음 (stock-valuation/.github_token)")

def api(method, url, tok, body=None):
    req = urllib.request.Request(url, method=method, data=json.dumps(body).encode() if body else None,
        headers={"Authorization": f"token {tok}", "Accept": "application/vnd.github+json", "User-Agent": "inv-cards"})
    with urllib.request.urlopen(req, timeout=60) as r:
        return json.loads(r.read().decode())

def fetch(tok):
    meta = api("GET", f"https://api.github.com/repos/{OWNER}/{REPO}/contents/{PATH}?ref={BRANCH}&t={int(time.time())}", tok)
    if meta.get("content"):
        raw = base64.b64decode(meta["content"]).decode("utf-8")
    else:  # 1MB 초과 파일은 content 가 비어 옴 → blob API
        blob = api("GET", f"https://api.github.com/repos/{OWNER}/{REPO}/git/blobs/{meta['sha']}", tok)
        raw = base64.b64decode(blob["content"]).decode("utf-8")
    return json.loads(raw), meta["sha"]

def merge(remote, new):
    idx = {c["id"]: c for c in remote.get("companies", [])}
    add_co = add_card = skip = 0
    for nc in new.get("companies", []):
        rc = idx.get(nc["id"])
        if rc is None:
            remote.setdefault("companies", []).append(nc); idx[nc["id"]] = nc
            add_co += 1; add_card += len(nc.get("cards", [])); continue
        have_id = {k.get("id") for k in rc.get("cards", [])}
        have_td = {(k.get("title"), k.get("date")) for k in rc.get("cards", [])}
        for card in nc.get("cards", []):
            if card.get("id") in have_id or (card.get("title"), card.get("date")) in have_td:
                skip += 1; continue
            rc.setdefault("cards", []).append(card); add_card += 1
    if new.get("last_updated"):
        remote["last_updated"] = max(str(remote.get("last_updated", "")), new["last_updated"])
    return add_co, add_card, skip

def main():
    if len(sys.argv) < 2 or sys.argv[1] not in ("pull", "push"):
        print(__doc__); return 1
    tok = token(); os.makedirs(WORK, exist_ok=True)
    if sys.argv[1] == "pull":
        out = sys.argv[2] if len(sys.argv) > 2 and not sys.argv[2].startswith("-") else os.path.join(WORK, "companies.json")
        data, sha = fetch(tok)
        json.dump(data, open(out, "w"), ensure_ascii=False, indent=1)
        n = sum(len(c.get("cards", [])) for c in data.get("companies", []))
        mx = max([int(k["id"].split("-")[-1]) for c in data.get("companies", []) for k in c.get("cards", []) if str(k.get("id","")).startswith("card-") and k["id"].split("-")[-1].isdigit()] or [0])
        print(f"✓ 원격 최신본 저장: {out} — 기업 {len(data.get('companies', []))} · 카드 {n} · 마지막 card 번호 {mx} · last_updated {data.get('last_updated')}")
        return 0
    new = json.load(open(sys.argv[2])); dry = "--dry-run" in sys.argv
    for attempt in range(3):
        remote, sha = fetch(tok)
        add_co, add_card, skip = merge(remote, new)
        print(f"union 병합: 신규기업 {add_co} · 신규카드 {add_card} · 중복 건너뜀 {skip}")
        if dry or (add_co + add_card) == 0:
            print("(dry-run)" if dry else "추가할 카드 없음 — 커밋 생략"); return 0
        body = {"message": f"Auto: 스크린샷 카드 추가 ({new.get('last_updated','')}) — 원격 기준 union 병합",
                "branch": BRANCH, "sha": sha,
                "content": base64.b64encode(json.dumps(remote, ensure_ascii=False, indent=1).encode("utf-8")).decode()}
        try:
            r = api("PUT", f"https://api.github.com/repos/{OWNER}/{REPO}/contents/{PATH}", tok, body)
            print(f"✓ 커밋 {r['commit']['sha'][:7]} → https://whysosary-dot.github.io/investment-notes/"); return 0
        except urllib.error.HTTPError as e:
            if e.code in (409, 422) and attempt < 2:
                print(f"  · 충돌({e.code}) — 최신본 다시 받아 재시도"); time.sleep(2); continue
            raise SystemExit(f"GitHub PUT 실패: {e.code} {e.read()[:200]}")

if __name__ == "__main__":
    sys.exit(main())
