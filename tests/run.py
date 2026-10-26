"""개발용 테스트 실행기: 저장소를 로컬 서버로 띄우고 헤드리스 Chrome으로 tests/browser.html을 실행한다.
사용: python tests/run.py [model,backup,...]
필요: Python 3.10+ 와 playwright (pip install playwright), 설치된 Chrome. 앱 자체는 이것들을 쓰지 않는다."""
import functools
import http.server
import socketserver
import sys
import threading
from pathlib import Path

from playwright.sync_api import sync_playwright

ROOT = Path(__file__).resolve().parent.parent


class Handler(http.server.SimpleHTTPRequestHandler):
    # Windows 레지스트리에 따라 .js가 text/plain으로 나가면 모듈 로드가 실패하므로 고정한다
    extensions_map = {**http.server.SimpleHTTPRequestHandler.extensions_map,
                      ".js": "text/javascript", ".webmanifest": "application/manifest+json"}

    def log_message(self, *args):
        pass


def main() -> int:
    handler = functools.partial(Handler, directory=str(ROOT))
    with socketserver.TCPServer(("127.0.0.1", 0), handler) as server:
        port = server.server_address[1]
        threading.Thread(target=server.serve_forever, daemon=True).start()
        query = f"?only={sys.argv[1]}" if len(sys.argv) > 1 else ""
        with sync_playwright() as pw:
            browser = pw.chromium.launch(channel="chrome", headless=True)
            page = browser.new_page()
            errors = []
            page.on("pageerror", lambda e: errors.append(str(e)))
            page.goto(f"http://127.0.0.1:{port}/tests/browser.html{query}")
            page.wait_for_function("window.__results !== undefined", timeout=120000)
            results = page.evaluate("window.__results")
            browser.close()
        server.shutdown()
    for f in results["failures"]:
        print(f"FAIL {f['name']}\n  {f['error'].splitlines()[0]}")
    for e in errors:
        print(f"PAGE ERROR {e}")
    print(f"{results['passed']} passed, {results['failed']} failed")
    return 1 if results["failed"] or errors else 0


if __name__ == "__main__":
    sys.exit(main())
