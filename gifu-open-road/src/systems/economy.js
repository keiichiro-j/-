// お金（現金・口座・盗品）と店。three.jsに依存しない
export function newMoney(cash = 0, bank = 0) { return { cash, bank, stolen: 0 }; }
// 現金→足りなければ口座（カード払い）
export function pay(m, amount) {
  if (m.cash + m.bank < amount) return false;
  const c = Math.min(m.cash, amount); m.cash -= c; m.bank -= amount - c; return true;
}
export function earn(m, amount) { m.cash += amount; }
export function deposit(m, amount) { const a = Math.min(m.cash, amount); m.cash -= a; m.bank += a; return a; }
export function withdraw(m, amount) { const a = Math.min(m.bank, amount); m.bank -= a; m.cash += a; return a; }
// 逮捕：現金と武器を失う ／ ダウン：現金を失い治療費
export function onBusted(m) { const lost = m.cash; m.cash = 0; return lost; }
export function onWasted(m, fee) { const lost = m.cash; m.cash = 0; m.bank = Math.max(0, m.bank - fee); return lost; }
export const yen = (n) => '¥' + Math.round(n).toLocaleString('ja-JP');
