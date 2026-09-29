#!/usr/bin/env python3
"""
XSS FE 렌더 검증 — Playwright.

절차:
1) FE (5173) 로그인
2) /admin/departments 이동
3) 각 XSS payload 로 dept 생성 (API 직접)
4) FE 페이지 새로고침 → 렌더 결과에서 alert / script 실행 감지
5) cleanup

판정:
- alert 발동 → 🚨 XSS 실제 발생 (FE escape 실패)
- 렌더 결과에 텍스트로 escape 되어 표시 → ✅ React 정상 escape
"""

import json
import time
import urllib.request
import urllib.parse
from pathlib import Path
from playwright.sync_api import sync_playwright

API_BASE = "http://localhost:3001/api"
FE_BASE = "http://localhost:5173"
EMAIL = "admin@club.com"
PASSWORD = "Password1!"

PAYLOADS = [
    ("script_tag",   "<script>alert('XSS1')</script>"),
    ("img_onerror",  "<img src=x onerror=alert('XSS2')>"),
    ("svg_onload",   "<svg onload=alert('XSS3')>"),
    ("iframe_srcdoc", "<iframe srcdoc=\"<script>alert('XSS4')</script>\"></iframe>"),
]

OUT = Path(__file__).resolve().parent / "results-2026-09-29" / "xss-fe-probe.json"


def api_login():
    data = json.dumps({"email": EMAIL, "password": PASSWORD}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/auth/login",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        cookie = r.headers.get("Set-Cookie", "")
    # extract access-token
    for part in cookie.split(";"):
        part = part.strip()
        if part.startswith("access-token="):
            return part.split("=", 1)[1].split(";")[0]
    raise RuntimeError("no access-token")


def api_create_dept(token: str, name: str) -> int:
    data = json.dumps({"name": name}).encode()
    req = urllib.request.Request(
        f"{API_BASE}/departments",
        data=data,
        headers={"Content-Type": "application/json", "Cookie": f"access-token={token}"},
        method="POST",
    )
    with urllib.request.urlopen(req) as r:
        return json.loads(r.read())["id"]


def api_delete_dept(token: str, dept_id: int) -> None:
    req = urllib.request.Request(
        f"{API_BASE}/departments/{dept_id}",
        headers={"Cookie": f"access-token={token}"},
        method="DELETE",
    )
    try:
        urllib.request.urlopen(req)
    except Exception:
        pass


def main():
    token = api_login()
    print(f"[XSS-FE] Logged in")

    # 페이로드별 부서 생성 (API 직접)
    created = []
    for name, payload in PAYLOADS:
        stamp = f"XSS_FE_{int(time.time())}_{name}__{payload}"
        try:
            dept_id = api_create_dept(token, stamp)
            created.append({"name": name, "payload": payload, "stamp": stamp, "id": dept_id})
            print(f"  Created dept {dept_id}: {name}")
        except Exception as e:
            print(f"  Failed to create {name}: {e}")

    results = []
    try:
        with sync_playwright() as p:
            browser = p.chromium.launch(headless=True)
            ctx = browser.new_context()
            page = ctx.new_page()

            # dialog(alert) 이벤트 감지
            alerts_fired = []
            page.on("dialog", lambda d: (alerts_fired.append(d.message), d.dismiss()))

            # FE 로그인
            page.goto(f"{FE_BASE}/login")
            page.fill('input[type=email]', EMAIL)
            page.fill('input[type=password]', PASSWORD)
            page.click('button[type=submit]')
            page.wait_for_load_state("networkidle")

            # 부서 목록 페이지
            page.goto(f"{FE_BASE}/admin/departments")
            page.wait_for_load_state("networkidle")
            time.sleep(2)  # 렌더 안정화

            body_html = page.content()

            for c in created:
                # 페이로드가 페이지에 나타나는지 (텍스트로) vs alert 발동 여부
                escaped_in_html = c["payload"] in body_html and "&lt;" in body_html
                literal_in_html = c["payload"] in body_html
                results.append({
                    "payload_name": c["name"],
                    "payload_value": c["payload"],
                    "dept_id": c["id"],
                    "found_in_html": literal_in_html,
                    "escaped": escaped_in_html or (c["payload"] not in body_html),
                })

            results_final = {
                "alerts_fired_count": len(alerts_fired),
                "alerts_messages": alerts_fired,
                "per_payload": results,
                "fe_url": f"{FE_BASE}/admin/departments",
            }

            browser.close()
    finally:
        # cleanup
        for c in created:
            api_delete_dept(token, c["id"])

    print("\n=== FE XSS Render Test ===")
    print(f"Alerts fired: {results_final['alerts_fired_count']}")
    if results_final["alerts_fired_count"] == 0:
        print("✅ React 가 모든 payload 를 안전하게 escape (alert 미발동)")
    else:
        print(f"🚨 XSS 실제 발동: {results_final['alerts_messages']}")

    for r in results_final["per_payload"]:
        state = "✅ escaped" if r["escaped"] else ("🚨 raw" if r["found_in_html"] else "❔ not-in-page")
        print(f"  {r['payload_name']:<18} → {state}")

    OUT.parent.mkdir(parents=True, exist_ok=True)
    OUT.write_text(json.dumps(results_final, indent=2, ensure_ascii=False))
    print(f"\nSaved: {OUT}")


if __name__ == "__main__":
    main()
