/**
 * 六曜（先勝/友引/先負/仏滅/大安/赤口）の簡易判定。
 * 本来の六曜は旧暦（太陰太陽暦）の月+日の合計を6で割った余りから決まるため、
 * 正確な算出には朔（新月）のタイミングに基づく旧暦変換が必要。
 * 本アプリはネットワークを介した暦データ参照ができない実行環境のため、
 * 基準日からの経過日数を6日周期でローテーションさせる「近似値」として実装している。
 * 旧暦の月替わり（朔）のタイミングでこの近似は実際の六曜と数日程度ずれる場合がある。
 * 正確性が必須の用途では、外部の暦データ・APIに置き換えること。
 */
namespace RokuyoService {
  export const CYCLE: string[] = ["先勝", "友引", "先負", "仏滅", "大安", "赤口"];

  // 基準日: 2000-01-01（土）を「先勝」と仮定したローテーションの起点とする。
  const BASE_DATE = new Date(2000, 0, 1);

  function stripTime(date: Date): number {
    return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  }

  export function forDate(date: Date): string {
    const diffDays = Math.round((stripTime(date) - stripTime(BASE_DATE)) / 86400000);
    const idx = ((diffDays % CYCLE.length) + CYCLE.length) % CYCLE.length;
    return CYCLE[idx];
  }
}
