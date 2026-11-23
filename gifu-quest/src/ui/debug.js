import { PHYS, RUNTIME } from '../core/config.js';
// F1：遊びながら物理の数値を調整するデバッグ画面（設計書 5章）
let panel = null;
export function toggleDebugPanel() {
  if (panel) { panel.remove(); panel = null; return; }
  panel = document.createElement('div');
  panel.style.cssText = 'position:fixed;right:8px;top:8px;max-height:90vh;overflow:auto;background:rgba(0,0,0,.8);color:#fff;font:12px monospace;padding:8px;z-index:10;border-radius:6px';
  panel.innerHTML = '<b>PHYS（F1で閉じる）</b><br>';
  for (const k of Object.keys(PHYS)) {
    const row = document.createElement('label');
    row.style.cssText = 'display:flex;justify-content:space-between;gap:8px;margin:2px 0';
    row.textContent = k;
    const inp = document.createElement('input');
    inp.type = 'number'; inp.value = PHYS[k]; inp.step = 'any'; inp.style.width = '80px';
    inp.addEventListener('input', () => { const v = parseFloat(inp.value); if (!isNaN(v)) PHYS[k] = v; });
    inp.addEventListener('keydown', (e) => e.stopPropagation());
    row.appendChild(inp); panel.appendChild(row);
  }
  document.body.appendChild(panel);
}
window.addEventListener('keydown', (e) => { if (e.code === 'F1') { e.preventDefault(); toggleDebugPanel(); } });
