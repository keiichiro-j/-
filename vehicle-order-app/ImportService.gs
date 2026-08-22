/**
 * ImportService.gs
 * 在庫リストへのCSV／貼り付けデータの一括インポート。
 *
 * Excelファイルは「CSV形式で保存」してからアップロードするか、対象範囲をコピーして
 * 画面の貼り付け欄にそのまま貼り付けてください（.xlsxバイナリの直接解析は非対応）。
 * 見出し行（1行目）には在庫リストの列名（モデル・コミッション等）を含めてください。
 * 列の並び順は自由で、在庫リストに存在しない列（見出しが一致しない列）は無視されます。
 * 既に在庫リストに存在するコミッションの行は「重複」として取り込まれません
 * （二重仕入れ防止）。
 */

// text: CSV、またはタブ区切りテキスト（Excel／Googleスプレッドシートからのコピー＆ペースト）。
// タブ文字を含む場合はタブ区切り、それ以外はCSVとして解釈する。
function parseImportText_(text) {
  text = String(text || '').replace(/\r\n/g, '\n').replace(/\r/g, '\n');
  if (!text.trim()) return [];
  if (text.indexOf('\t') !== -1) {
    return text.split('\n').map(function (line) { return line.split('\t'); });
  }
  return Utilities.parseCsv(text);
}

/**
 * 見出し行（VEHICLE_COLUMNSのlabelに一致する列だけ）から、
 * 列キー(key) → 入力データ内の列インデックス、の対応表を作る（純粋関数）。
 * 見出しが一致しない列（＝在庫リストに存在しない不要な情報）は無視される。
 */
function mapImportColumns_(header) {
  var colMap = {};
  VEHICLE_COLUMNS.forEach(function (col) {
    var idx = header.indexOf(col.label);
    if (idx !== -1) colMap[col.key] = idx;
  });
  return colMap;
}

/**
 * インポートデータ（1行目=見出し、2行目以降=データ）と、既存の在庫リストの
 * コミッション一覧から、実際に追加すべき車両・重複でスキップした行・
 * 不正な行（モデル／コミッションが空）を仕分ける（純粋関数・スプレッドシート非依存）。
 */
function buildImportPlan_(rows, existingCommissions) {
  if (!rows || rows.length < 2) {
    throw new Error('インポートするデータが見つかりません（見出し行とデータ行が必要です）');
  }
  var header = rows[0].map(function (h) { return String(h === undefined || h === null ? '' : h).trim(); });
  var colMap = mapImportColumns_(header);
  if (colMap.model === undefined || colMap.commission === undefined) {
    throw new Error('見出し行に「モデル」「コミッション」の列が見つかりません。見出し行が在庫リストと同じ列名になっているかご確認ください。');
  }

  var existingSet = {};
  (existingCommissions || []).forEach(function (c) { existingSet[String(c)] = true; });

  var toInsert = [];
  var duplicates = [];
  var invalids = [];
  var seenInBatch = {};

  for (var i = 1; i < rows.length; i++) {
    var raw = rows[i] || [];
    var isBlank = raw.every(function (c) { return String(c === undefined || c === null ? '' : c).trim() === ''; });
    if (isBlank) continue;

    var vehicle = {};
    Object.keys(colMap).forEach(function (key) {
      var cell = raw[colMap[key]];
      vehicle[key] = cell === undefined || cell === null ? '' : String(cell).trim();
    });

    var commission = vehicle.commission;
    var rowNumber = i + 1; // 1-indexed（見出し行を1行目とした行番号）
    if (!vehicle.model || !commission) {
      invalids.push({ row: rowNumber, reason: 'モデルまたはコミッションが空です' });
      continue;
    }
    if (existingSet[commission] || seenInBatch[commission]) {
      duplicates.push({ row: rowNumber, commission: commission });
      continue;
    }
    seenInBatch[commission] = true;
    vehicle.holdStatus = HOLD_STATUS.AVAILABLE;
    toInsert.push(vehicle);
  }

  return { toInsert: toInsert, duplicates: duplicates, invalids: invalids };
}

/**
 * 実際に在庫リストへ書き込むエントリポイント（スプレッドシート依存）。
 * 既存のコミッション一覧を読み取り、buildImportPlan_ に判定させたうえで、
 * 新規分だけを1回のsetValuesでまとめて追記する。
 */
function importInventoryFromText_(text) {
  var rows = parseImportText_(text);
  var sheet = getInventorySheet_();
  var existingCommissions = readAllRows_(sheet, INVENTORY_COLUMNS, 'commission')
    .map(function (v) { return v.commission; });
  var plan = buildImportPlan_(rows, existingCommissions);

  if (plan.toInsert.length) {
    var startRow = sheet.getLastRow() + 1;
    var values = plan.toInsert.map(function (v) { return objectToRow_(v, INVENTORY_COLUMNS); });
    // コミッション列は、書き込む前に「書式なしテキスト」を明示しておく。シート全体への
    // 書式設定（getOrCreateSheet_時）が及んでいない行（既存シートの拡張分など）に
    // 追記される場合でも、数字のみのコミッション（例: 0583911111）の先頭0が
    // 自動変換で消えないようにするため。
    sheet.getRange(startRow, inventoryColIndex1('commission'), values.length, 1).setNumberFormat('@');
    sheet.getRange(startRow, 1, values.length, INVENTORY_COLUMNS.length).setValues(values);
  }

  return {
    importedCount: plan.toInsert.length,
    duplicateCount: plan.duplicates.length,
    invalidCount: plan.invalids.length,
    duplicates: plan.duplicates,
    invalids: plan.invalids
  };
}
