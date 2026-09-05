#!/usr/bin/env python3
"""Rebuild docs/source-code.html for LINE sharing (copy buttons, no GitHub login)."""
from html import escape
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / "docs" / "source-code.html"

FILES = [
    ("appsscript.json", "GAS プロジェクト設定"),
    ("Code.gs", "Webアプリ入口（doGet）"),
    ("Constants.gs", "列定義・定数"),
    ("Api.gs", "クライアントから呼ぶ API"),
    ("SheetService.gs", "スプレッドシート読み書き"),
    ("SearchService.gs", "検索・グループ化"),
    ("HoldService.gs", "Hold 登録・解除"),
    ("OrderService.gs", "受注確定"),
    ("PurchaseOrderService.gs", "発注リスト"),
    ("PaidOptionService.gs", "有償OPマスタ"),
    ("SettingsService.gs", "設定・担当者マスタ"),
    ("NotificationService.gs", "メール・Chat 通知"),
    ("CalendarService.gs", "カレンダー連携"),
    ("AuditLogService.gs", "変更履歴"),
    ("IntegrityService.gs", "在庫データの整合性"),
    ("Triggers.gs", "時間主導トリガー"),
    ("PwaService.gs", "PWA / マニフェスト"),
    ("SetupService.gs", "初期セットアップ・メニュー"),
    ("html/Index.html", "画面 HTML"),
    ("html/JavaScript.html", "画面 JavaScript"),
    ("html/Stylesheet.html", "画面 CSS"),
    ("tests/run.js", "単体テスト"),
    ("docs/wireframes.html", "ワイヤーフレーム"),
    ("package.json", "npm 設定"),
    ("README.md", "説明書"),
]


def line_count(text: str) -> int:
    if not text:
        return 0
    n = text.count("\n")
    if not text.endswith("\n"):
        n += 1
    return n


def main() -> None:
    entries = []
    for rel, desc in FILES:
        path = ROOT / rel
        text = path.read_text(encoding="utf-8")
        entries.append((rel, desc, text, line_count(text)))

    nav_items = []
    sections = []
    for i, (rel, desc, text, lines) in enumerate(entries, start=1):
        nav_items.append(
            f'<li><a href="#f{i}">{escape(rel)}</a> '
            f'<span class="desc">{escape(desc)}</span> '
            f'<span class="lines">{lines}行</span></li>'
        )
        sections.append(
            f'<section id="f{i}"><div class="head">'
            f"<h2>{escape(rel)} <small>{escape(desc)} ・ {lines}行</small></h2>"
            f'<button type="button" class="copyBtn" data-target="code-{i}">このコードをコピー</button>'
            f'</div><p class="filelinks"><a href="#top">先頭へ</a></p>'
            f'<pre><code id="code-{i}">{escape(text)}</code></pre></section>'
        )

    html = f"""<!DOCTYPE html>
<html lang="ja">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>販売可能リスト ソースコード一覧</title>
<style>
  :root {{ color-scheme: light dark; }}
  body {{ font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
         margin: 0; padding: 16px; line-height: 1.45; }}
  h1 {{ font-size: 1.25rem; margin: 0 0 8px; }}
  h2 {{ font-size: 1.05rem; margin: 0; word-break: break-all; }}
  h2 small {{ font-weight: 400; color: #666; }}
  .note {{ font-size: 14px; color: #444; margin: 0 0 16px; }}
  ol {{ padding-left: 1.3em; }}
  li {{ margin: 6px 0; }}
  .desc {{ color: #555; font-size: 13px; }}
  .lines {{ color: #888; font-size: 12px; }}
  a {{ color: #0b57d0; }}
  .filelinks {{ font-size: 13px; margin: 0 0 8px; }}
  .head {{ display: flex; flex-wrap: wrap; align-items: center; gap: 10px;
          justify-content: space-between; margin: 28px 0 8px; }}
  .copyBtn {{
    flex: 0 0 auto;
    padding: 8px 14px;
    font-size: 14px;
    font-weight: 600;
    border: 0;
    border-radius: 8px;
    background: #0b57d0;
    color: #fff;
    cursor: pointer;
  }}
  .copyBtn:active {{ transform: scale(.98); }}
  .copyBtn.is-ok {{ background: #0d7a3f; }}
  .copyBtn.is-ng {{ background: #b3261e; }}
  pre {{ overflow: auto; padding: 12px; border: 1px solid #ccc; border-radius: 8px;
        background: #f6f8fa; font-size: 12px; line-height: 1.4; -webkit-overflow-scrolling: touch; }}
  code {{ font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace; }}
  @media (prefers-color-scheme: dark) {{
    .note, h2 small, .desc {{ color: #bbb; }}
    pre {{ background: #111; border-color: #333; }}
    a {{ color: #8ab4f8; }}
    .copyBtn {{ background: #8ab4f8; color: #062e6f; }}
    .copyBtn.is-ok {{ background: #6ec89b; color: #062e6f; }}
  }}
</style>
</head>
<body>
<header id="top">
  <h1>販売可能リスト ソースコード一覧</h1>
  <p class="note">このアプリ（Google Apps Script）で使っているコードです。GitHubのログインは不要です。各ファイルの「このコードをコピー」から全文をコピーできます。今回のデモカー／他店受注リストを反映するときは、Constants.gs・OrderService.gs・SheetService.gs・Api.gs・SetupService.gs・NotificationService.gs・html/Index.html・html/JavaScript.html を貼り、スクリプトを保存したうえでウェブアプリを再デプロイしてください。スプレッドシートに「デモカー受注リスト」「他店受注リスト」タブが無ければ、メニューの初期セットアップを一度実行してください。</p>
</header>
<nav>
  <ol>
    {''.join(nav_items)}
  </ol>
</nav>
{''.join(sections)}
<script>
(function () {{
  function copyText(text) {{
    if (navigator.clipboard && navigator.clipboard.writeText) {{
      return navigator.clipboard.writeText(text);
    }}
    return new Promise(function (resolve, reject) {{
      var ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.left = '-9999px';
      document.body.appendChild(ta);
      ta.select();
      try {{
        if (document.execCommand('copy')) resolve();
        else reject(new Error('copy failed'));
      }} catch (e) {{ reject(e); }}
      document.body.removeChild(ta);
    }});
  }}
  document.addEventListener('click', function (e) {{
    var btn = e.target.closest('.copyBtn');
    if (!btn) return;
    var el = document.getElementById(btn.getAttribute('data-target'));
    if (!el) return;
    var orig = 'このコードをコピー';
    copyText(el.textContent).then(function () {{
      btn.textContent = 'コピーしました';
      btn.classList.add('is-ok');
      btn.classList.remove('is-ng');
      setTimeout(function () {{
        btn.textContent = orig;
        btn.classList.remove('is-ok');
      }}, 1600);
    }}).catch(function () {{
      btn.textContent = 'コピー失敗';
      btn.classList.add('is-ng');
      setTimeout(function () {{
        btn.textContent = orig;
        btn.classList.remove('is-ng');
      }}, 1600);
    }});
  }});
}})();
</script>
</body>
</html>
"""
    OUT.write_text(html, encoding="utf-8")
    print(f"wrote {OUT} ({OUT.stat().st_size} bytes, {len(entries)} files)")


if __name__ == "__main__":
    main()
