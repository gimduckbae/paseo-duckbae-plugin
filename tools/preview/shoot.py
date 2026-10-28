import sys
from playwright.sync_api import sync_playwright

SHOTS = [
    ("desktop", 1440, 900),
    ("desktop-relogin", 1440, 900),
    ("desktop-light", 1440, 900),
    ("popover", 1440, 900),
    ("popover-light", 1440, 900),
    ("modal", 1440, 900),
    ("modal-codex", 1440, 900),
    ("modal-light", 1440, 900),
    ("modal-api-light", 1440, 900),
    ("modal-grok-light", 1440, 900),
    ("mobile", 390, 844),
    ("mobile-edit", 390, 844),
    ("desktop-edit", 1440, 900),
    ("agent", 760, 300),
    ("session", 1100, 640),
    ("accounts-popover", 342, 400),
    ("accounts-popover-light", 342, 400),
    ("session-light", 1100, 640),
    ("q-deploy", 1280, 600),
    ("q-memo", 1280, 600),
    ("q-manager", 1280, 600),
    ("q-marketing", 1280, 600),
    ("q-images", 1280, 600),
    ("q-deploy-light", 1280, 600),
    ("qt", 760, 600),
    ("qc", 680, 600),
    ("qc-light", 680, 600),
    ("qcm", 390, 844),
    ("qm-deploy", 390, 844),
    ("qm-manager", 390, 844),
    ("qm-marketing-light", 390, 844),
    ("qa", 760, 600),
    ("qa-light", 760, 600),
    ("qa-m", 390, 844),
    ("update", 760, 600),
    ("update-light", 760, 600),
    ("update-m", 390, 844),
    ("desktop-upd-available", 1440, 900),
    ("desktop-upd-current", 1440, 900),
    ("desktop-upd-local", 1440, 900),
    ("desktop-upd-applying", 1440, 900),
    ("desktop-upd-error", 1440, 900),
    ("mobile-upd-available", 390, 844),
    ("compact", 760, 600),
    ("compact-light", 760, 600),
    ("compact-m", 390, 844),
    ("limit", 760, 300),
    ("limit-light", 760, 300),
    ("limit-pick", 760, 300),
    ("limit-pick-light", 760, 300),
    ("limit-done", 760, 300),
    ("limit-done-light", 760, 300),
    ("handoff", 1100, 760),
    ("handoff-light", 1100, 760),
]
# 캡처 전에 누를 글자
CLICKS = {"desktop-relogin": ["다시 로그인"], "desktop-edit": ["직접 입력"], "mobile-edit": ["직접 입력"], "qc": ["한 세대 보관", "'시험용' 사유", "글자 겹침"], "qcm": ["한 세대 보관"], "limit-pick": ["예"], "q-manager": ["20번", "'아직 못 해요' 문구", "비용 화면 모델 이름표"], "q-memo": ["회원별 서버 저장"], "qm-manager": ["20번", "직접 입력"], "q-marketing": ["다 보이기", "관리자만"], "qm-marketing-light": ["다 보이기"]}
only = set(sys.argv[1:])
with sync_playwright() as p:
    browser = p.chromium.launch()
    for name, width, height in SHOTS:
        if only and name not in only:
            continue
        page = browser.new_page(viewport={"width": width, "height": height}, device_scale_factor=1)
        errors = []
        page.on("console", lambda m: errors.append(m.text) if m.type == "error" else None)
        page.on("pageerror", lambda e: errors.append(str(e)))
        query, view = ("?light", name[: -len("-light")]) if name.endswith("-light") else ("", name)
        page.goto(f"http://127.0.0.1:8765/index.html{query}#{view}")
        page.wait_for_timeout(800)
        for text in CLICKS.get(view, []):
            page.get_by_text(text, exact=True).first.click()
            page.wait_for_timeout(150)
        full = view not in ("popover", "desktop-relogin", "modal", "modal-codex", "modal-api", "modal-grok")
        page.screenshot(path=f"shots/{name}.png", full_page=full)
        print(name, "errors:", errors[:3])
        page.close()
    browser.close()
