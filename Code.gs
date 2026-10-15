/**
 * 新米販売管理 — GAS バックエンド
 * スプレッドシート「新米販売管理」にバインドして使う（拡張機能 > Apps Script）。
 * 通信は GET + JSONP（callback パラメータ）で CORS を回避。
 */
const SPREADSHEET_ID = ''; // 空欄 = このスクリプトがバインドされたスプレッドシートを使う
const TZ = 'Asia/Tokyo';

const HEAD = {
  '設定':     ['キー', '値', '説明'],
  '価格マスタ': ['規格', '内容量kg', '税別', '税込', '社割税込', '予約価格'],
  '店舗マスタ': ['店舗ID', '店舗名', '区分', '有効'],
  '予約':     ['予約ID', '受付日', '受付店舗', 'お名前', '連絡先', '5kg袋数', '2kg袋数', '金額',
               '受取予定日', '受取状況', '受取日', '備考', '登録日時', '受付ID'],
  '店舗実績': ['日付', '店舗', '規格', '区分', '数量', '入力者', '備考', '受付ID', '登録日時'],
  '精米記録': ['精米日', '曜日', '時期', '持込日', '5kg袋数', '2kg袋数', '精米量kg', '90kg判定',
               '支払額', '状態', '備考', '玄米袋数', '米袋5kg', '無地袋5kg', '米袋2kg', '無地袋2kg'],
  'タスク':   ['ID', '区分', 'タスク', '期限', '担当', '状態', '備考'],
};

const DEFAULTS = {
  '設定': [
    ['税率', 0.08, '食品の軽減税率'],
    ['予約割引率', 0.05, '予約で5%引き'],
    ['精米最低量kg', 90, '精米は90kg以上から'],
    ['精米曜日', '火,木', '毎週'],
    ['持込時間', '9:00〜17:00', '精米日の前日に袋を持参'],
    ['支払方法', '現金', '精米代'],
    ['販売期間日数', 30, '約1ヶ月で入れ替え'],
    ['販売開始日', '2026-10-23', '目安'],
    ['玄米袋kg', 30, '玄米1袋の重さ'],
    ['歩留まり', 0.9, '玄米→精米の目安（90%）'],
    ['名称', '精　　米', '表示シール'],
    ['原料区分', '単一原料米', '表示シール'],
    ['産地', '福岡県', '表示シール'],
    ['品種', '元気つくし', '表示シール'],
    ['産年', '令和8年', '表示シール'],
    ['産地割合', '100%', '表示シール（空欄で非表示）'],
    ['品種割合', '100%', '表示シール（空欄で非表示）'],
    ['産年割合', '100%', '表示シール（空欄で非表示）'],
    ['確認文言1', 'JA農産物検査証明による確認米', '表示シール（検査米の場合。空欄で非表示）'],
    ['確認割合1', '10割100%', '表示シール'],
    ['確認文言2', '苗の購入・栽培作業記録による確認米', '表示シール（未検査米で産地等を表示する根拠。空欄で非表示）'],
    ['確認割合2', '10割100%', '表示シール'],
    ['販売者電話', '092-324-8050', '表示シールの電話番号'],
    ['JAN5kg', '2186410000000', '5kgのJANコード（13桁。12桁ならチェック数字を自動計算）'],
    ['JAN2kg', '2186410100000', '2kgのJANコード'],
    ['Geminiモデル', '', '出荷表の読み取りに使うモデル（空欄＝gemini-flash-lite-latest）'],
    ['JAN方式', '価格入り', '固定＝番号どおり／価格入り＝先頭8桁＋税込価格4桁＋チェック数字'],
    ['シール単価', 1.3, '18面シール1面あたりの用紙代（円）'],
    ['会社名', '株式会社 農・みのり', '依頼書・表示シール'],
    ['郵便番号', '〒819-1152', '依頼書'],
    ['住所', '福岡県糸島市飯原1675番地1', '依頼書・表示シール'],
    ['TEL', '092-323-8700', '依頼書'],
    ['FAX', '092-322-7661', '依頼書'],
    ['登録番号', 'T3290001095842', '依頼書'],
    ['依頼先', '産栄株式会社　米のます屋　様', '依頼書'],
    ['依頼書注記', '※　余りは、無地袋 ２Kg　に入れて下さい。　宜しくお願いします。', '依頼書'],
  ],
  '価格マスタ': [
    ['5kg', 5, 3300, 3570, 3000, 3385],
    ['2kg', 2, 1500, 1620, 1400, 1540],
  ],
  '店舗マスタ': [
    ['S01', '即売会本店', '本店', true],
    ['S02', 'ねぎぼうず', '分配先', true],
    ['S03', '市役所売店', '分配先', true],
    ['S04', 'イオンマリナ', '分配先', true],
    ['S05', 'イオン笹丘', '分配先', true],
    ['S06', '唐泊漁協ストア', '分配先', true],
  ],
  'タスク': [
    ['T01', '打合せ', '新米販売 打合せ', '2026-10-14', '', '完了', ''],
    ['T02', '確認', '部長へ確認（価格・数量・分配先・予約割引）', '2026-10-15', '', '未着手', ''],
    ['T03', '予約', '現在の予約表・記録方法の確認', '2026-10-16', '', '未着手', ''],
    ['T04', '数量', '店舗別の配布数量・販売数量を決定', '2026-10-16', '', '未着手', ''],
    ['T05', '表示', '裏表示ラベル作成', '2026-10-19', '', '未着手', ''],
    ['T06', '販促', 'ポップ作成（販売用）', '2026-10-19', '', '未着手', ''],
    ['T07', '販促', 'ポップ作成（予約用）', '2026-10-19', '', '未着手', ''],
    ['T08', '登録', '商品登録（各店舗）', '2026-10-20', '', '未着手', ''],
    ['T09', '予約', '予約受付開始', '2026-10-20', '', '未着手', ''],
    ['T10', '精米', '精米依頼書へ数量入力', '2026-10-20', '', '未着手', ''],
    ['T11', '精米', '精米代（現金）・袋の準備', '2026-10-20', '', '未着手', ''],
    ['T12', '精米', '袋を持参して持ち込み', '2026-10-21', '', '未着手', ''],
    ['T13', '精米', '精米', '2026-10-22', '', '未着手', ''],
    ['T14', '配布', '各店舗へ配布・販売開始', '2026-10-23', '', '未着手', ''],
    ['T15', '管理', '店舗別の動き確認', '2026-10-30', '', '未着手', ''],
    ['T16', '管理', '入れ替え用の精米依頼', '2026-11-19', '', '未着手', ''],
    ['T17', '管理', '新しい物と入れ替え', '2026-11-23', '', '未着手', ''],
  ],
};

/* ---------------- エントリポイント ---------------- */

function doGet(e) {
  const p = (e && e.parameter) || {};
  const cb = p.callback;
  let out;
  try {
    const a = p.action || 'ping';
    if (a === 'ping') out = { ok: true, now: nowStr_() };
    else if (a === 'getAll') out = getAll_();
    else if (a === 'addReservation') out = locked_(() => addReservation_(JSON.parse(p.data)));
    else if (a === 'updateReservation') out = locked_(() => updateReservation_(p));
    else if (a === 'addShopLogs') out = locked_(() => addShopLogs_(JSON.parse(p.items)));
    else if (a === 'deleteShopLog') out = locked_(() => deleteShopLog_(p.clientId));
    else if (a === 'saveMilling') out = locked_(() => saveMilling_(p));
    else if (a === 'saveTask') out = locked_(() => saveTask_(p));
    else if (a === 'savePrice') out = locked_(() => savePrice_(p));
    else if (a === 'saveStore') out = locked_(() => saveStore_(p));
    else if (a === 'saveSettings') out = locked_(() => saveSettings_(JSON.parse(p.items)));
    else if (a === 'geminiPing') out = geminiPing_();
    else if (a === 'geminiList') out = geminiList_();
    else out = { ok: false, error: '不明なaction: ' + a };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return reply_(out, cb);
}

/**
 * POST（本文は JSON 文字列。Content-Type: text/plain で送るのでプリフライトなし）
 * 画像のように GET の URL に乗らない大きなデータ用
 */
function doPost(e) {
  let out;
  try {
    const body = JSON.parse((e && e.postData && e.postData.contents) || '{}');
    if (body.action === 'readShipSheet') out = readShipSheet_(body);
    else out = { ok: false, error: '不明なaction: ' + body.action };
  } catch (err) {
    out = { ok: false, error: String(err && err.message || err) };
  }
  return reply_(out);
}

function reply_(out, cb) {
  const json = JSON.stringify(out);
  if (cb) {
    return ContentService.createTextOutput(cb + '(' + json + ')')
      .setMimeType(ContentService.MimeType.JAVASCRIPT);
  }
  return ContentService.createTextOutput(json).setMimeType(ContentService.MimeType.JSON);
}

function locked_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try { return fn(); } finally { lock.releaseLock(); }
}

/** 初回に一度だけ実行：シート作成・タイムゾーン設定 */
function setup() {
  const ss = ss_();
  ss.setSpreadsheetTimeZone(TZ);
  Object.keys(HEAD).forEach(sheet_);
  ensureSettings_();
  ensureStores_();
  const ml = sheet_('精米記録');
  rows_(ml).forEach(r => millingFormulas_(ml, r._row));
  return 'OK';
}

/* ---------------- シート共通 ---------------- */

function ss_() {
  return SPREADSHEET_ID ? SpreadsheetApp.openById(SPREADSHEET_ID) : SpreadsheetApp.getActiveSpreadsheet();
}

/** シートを取得。なければ作成、見出しが足りなければ右端に追加（既存データは触らない） */
function sheet_(name) {
  const ss = ss_();
  let sh = ss.getSheetByName(name);
  const head = HEAD[name];
  if (!sh) {
    sh = ss.insertSheet(name);
    sh.getRange(1, 1, 1, head.length).setValues([head]).setFontWeight('bold');
    sh.setFrozenRows(1);
    if (DEFAULTS[name]) {
      const d = name === '設定' ? DEFAULTS[name].map(r => [r[0], txt_(r[1]), r[2]]) : DEFAULTS[name];
      sh.getRange(2, 1, d.length, d[0].length).setValues(d);
    }
    if (name === '精米記録') seedMilling_(sh);
    return sh;
  }
  const lastCol = Math.max(sh.getLastColumn(), 1);
  const cur = sh.getRange(1, 1, 1, lastCol).getValues()[0].map(String);
  const missing = head.filter(h => cur.indexOf(h) < 0);
  if (missing.length) sh.getRange(1, lastCol + 1, 1, missing.length).setValues([missing]).setFontWeight('bold');
  return sh;
}

/** 見出し名 → 列番号(1始まり) */
function cols_(sh) {
  const h = sh.getRange(1, 1, 1, sh.getLastColumn()).getValues()[0];
  const m = {};
  h.forEach((v, i) => { if (v !== '') m[String(v)] = i + 1; });
  return m;
}

/** 全行をオブジェクトで返す（_row = シート上の行番号） */
function rows_(sh) {
  const v = sh.getDataRange().getValues();
  if (v.length < 2) return [];
  const h = v[0].map(String);
  const out = [];
  for (let r = 1; r < v.length; r++) {
    const o = { _row: r + 1 };
    let empty = true;
    h.forEach((k, i) => { if (k) { o[k] = v[r][i]; if (v[r][i] !== '') empty = false; } });
    if (!empty) out.push(o);
  }
  return out;
}

/** 1行を見出し名指定で書き込む */
function writeRow_(sh, row, obj) {
  const c = cols_(sh);
  Object.keys(obj).forEach(k => { if (c[k]) sh.getRange(row, c[k]).setValue(obj[k]); });
}

/** 見出し順の配列に変換（追記用） */
function toArr_(sh, obj) {
  const c = cols_(sh);
  const n = sh.getLastColumn();
  const a = new Array(n).fill('');
  Object.keys(obj).forEach(k => { if (c[k]) a[c[k] - 1] = obj[k]; });
  return a;
}

function appendRows_(sh, arrs) {
  if (!arrs.length) return;
  const start = lastDataRow_(sh) + 1;
  sh.getRange(start, 1, arrs.length, arrs[0].length).setValues(arrs);
}

/** 1列目に値がある最終行（書式だけの行を無視） */
function lastDataRow_(sh) {
  const n = sh.getLastRow();
  if (n < 2) return 1;
  const v = sh.getRange(1, 1, n, 1).getValues();
  for (let i = v.length - 1; i >= 0; i--) if (v[i][0] !== '') return i + 1;
  return 1;
}

/* ---------------- 日付 ---------------- */

function nowStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd HH:mm:ss'); }
function todayStr_() { return Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd'); }

/** セルの日付（Date でも文字列でも）を yyyy-MM-dd に */
function d_(v) {
  if (v === '' || v === null || v === undefined) return '';
  if (v instanceof Date) return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd');
  const s = String(v).trim().replace(/\//g, '-');
  const m = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  return m ? m[1] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[3]).slice(-2) : s;
}
function dt_(v) {
  if (v instanceof Date) return Utilities.formatDate(v, ss_().getSpreadsheetTimeZone(), 'yyyy-MM-dd HH:mm:ss');
  return String(v || '');
}
function n_(v) { const x = Number(v); return isFinite(x) ? x : 0; }

/* ---------------- 読み込み ---------------- */

/** 文字の設定値はそのまま文字で保存（「100%」が数値に、JANの先頭0が消える等を防ぐ） */
function txt_(v) {
  return (typeof v === 'string' && v !== '' && v.charAt(0) !== "'") ? "'" + v : v;
}

function settings_() {
  const s = {};
  DEFAULTS['設定'].forEach(d => s[d[0]] = d[1]); // 未登録のキーは初期値
  rows_(sheet_('設定')).forEach(r => {
    const k = String(r['キー']); let v = r['値'];
    if (v instanceof Date) v = d_(v);
    else if (/割合$/.test(k) && typeof v === 'number') v = Math.round(v * 100) + '%'; // 数値になった「100%」を戻す
    else if (/^JAN/.test(k) && typeof v === 'number') v = String(v);
    s[k] = v;
  });
  return s;
}

/** 設定シートに無いキーを末尾に追加（既存の値は変えない） */
function ensureSettings_() {
  const sh = sheet_('設定');
  const have = {};
  rows_(sh).forEach(r => have[String(r['キー'])] = true);
  const add = DEFAULTS['設定'].filter(d => !have[d[0]]).map(d => toArr_(sh, { 'キー': d[0], '値': txt_(d[1]), '説明': d[2] }));
  appendRows_(sh, add);
}

/** 初期の店舗のうち、店舗マスタに無いものを追加（名前で照合。既存は変えない） */
function ensureStores_() {
  const sh = sheet_('店舗マスタ');
  const rows = rows_(sh);
  const have = {}; let max = 0;
  rows.forEach(r => {
    have[String(r['店舗名'])] = true;
    const m = String(r['店舗ID']).match(/^S(\d+)$/); if (m) max = Math.max(max, Number(m[1]));
  });
  const add = DEFAULTS['店舗マスタ'].filter(d => !have[d[1]])
    .map(d => toArr_(sh, { '店舗ID': 'S' + ('0' + (++max)).slice(-2), '店舗名': d[1], '区分': d[2], '有効': d[3] }));
  appendRows_(sh, add);
}

function saveSettings_(items) {
  const sh = sheet_('設定');
  ensureSettings_();
  const rows = rows_(sh);
  items.forEach(([k, v]) => {
    const r = rows.find(x => String(x['キー']) === String(k));
    if (r) writeRow_(sh, r._row, { '値': txt_(v) });
    else appendRows_(sh, [toArr_(sh, { 'キー': k, '値': txt_(v) })]);
  });
  return { ok: true };
}

function prices_() {
  return rows_(sheet_('価格マスタ')).map(r => ({
    size: String(r['規格']), kg: n_(r['内容量kg']), ex: n_(r['税別']), inc: n_(r['税込']),
    staff: n_(r['社割税込']), rsv: n_(r['予約価格']),
  })).filter(p => p.kg > 0); // 注記行などを除外
}

function getAll_() {
  const settings = settings_();
  const prices = prices_();
  const kg = {}; prices.forEach(p => kg[p.size] = p.kg);

  const stores = rows_(sheet_('店舗マスタ')).map(r => ({
    id: String(r['店舗ID']), name: String(r['店舗名']), type: String(r['区分']),
    active: r['有効'] === true || String(r['有効']).toUpperCase() === 'TRUE',
  }));

  const reservations = rows_(sheet_('予約')).map(r => ({
    id: String(r['予約ID']), date: d_(r['受付日']), store: String(r['受付店舗']),
    name: String(r['お名前']), tel: String(r['連絡先']), b5: n_(r['5kg袋数']), b2: n_(r['2kg袋数']),
    amount: n_(r['金額']), pickup: d_(r['受取予定日']), status: String(r['受取状況'] || '未'),
    pickedAt: d_(r['受取日']), note: String(r['備考']), createdAt: dt_(r['登録日時']),
  }));

  const logs = rows_(sheet_('店舗実績')).map(r => ({
    date: d_(r['日付']), store: String(r['店舗']), size: String(r['規格']), kind: String(r['区分']),
    qty: n_(r['数量']), by: String(r['入力者']), note: String(r['備考']), clientId: String(r['受付ID']),
  }));

  const milling = rows_(sheet_('精米記録')).map(r => {
    const detail = ['米袋5kg', '無地袋5kg', '米袋2kg', '無地袋2kg'].some(k => r[k] !== '' && r[k] !== undefined);
    const b5k = detail ? n_(r['米袋5kg']) : n_(r['5kg袋数']);
    const b5m = detail ? n_(r['無地袋5kg']) : 0;
    const b2k = detail ? n_(r['米袋2kg']) : n_(r['2kg袋数']);
    const b2m = detail ? n_(r['無地袋2kg']) : 0;
    const b5 = b5k + b5m, b2 = b2k + b2m;
    return {
      date: d_(r['精米日']), gen: n_(r['玄米袋数']), b5k, b5m, b2k, b2m, b5, b2,
      kg: b5 * (kg['5kg'] || 5) + b2 * (kg['2kg'] || 2),
      pay: n_(r['支払額']), status: String(r['状態'] || '予定'), note: String(r['備考']),
    };
  }).filter(m => m.date).sort((a, b) => a.date < b.date ? -1 : 1);

  const tasks = rows_(sheet_('タスク')).map(r => ({
    id: String(r['ID']), kind: String(r['区分']), title: String(r['タスク']), due: d_(r['期限']),
    owner: String(r['担当']), status: String(r['状態'] || '未着手'), note: String(r['備考']),
  }));

  return { ok: true, now: nowStr_(), settings, prices, stores, reservations, logs, milling, tasks };
}

/* ---------------- 予約 ---------------- */

function addReservation_(d) {
  const sh = sheet_('予約');
  const rows = rows_(sh);
  if (d.clientId) {
    const ex = rows.find(r => String(r['受付ID']) === String(d.clientId));
    if (ex) return { ok: true, id: String(ex['予約ID']), duplicate: true };
  }
  const b5 = Math.max(0, Math.floor(n_(d.b5))), b2 = Math.max(0, Math.floor(n_(d.b2)));
  if (!String(d.name || '').trim()) throw new Error('お名前を入力してください');
  if (b5 + b2 === 0) throw new Error('袋数を入力してください');

  const pr = {}; prices_().forEach(p => pr[p.size] = p);
  const amount = b5 * (pr['5kg'] ? pr['5kg'].rsv : 0) + b2 * (pr['2kg'] ? pr['2kg'].rsv : 0);

  let max = 0;
  rows.forEach(r => { const m = String(r['予約ID']).match(/^Y(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
  const id = 'Y' + ('000' + (max + 1)).slice(-4);

  appendRows_(sh, [toArr_(sh, {
    '予約ID': id, '受付日': todayStr_(), '受付店舗': d.store || '', 'お名前': String(d.name).trim(),
    '連絡先': d.tel ? "'" + d.tel : '', '5kg袋数': b5, '2kg袋数': b2, '金額': amount,
    '受取予定日': d.pickup || '', '受取状況': '未', '備考': d.note || '',
    '登録日時': nowStr_(), '受付ID': d.clientId || '',
  })]);
  return { ok: true, id: id, amount: amount };
}

function updateReservation_(p) {
  const sh = sheet_('予約');
  const r = rows_(sh).find(x => String(x['予約ID']) === String(p.id));
  if (!r) throw new Error('予約が見つかりません: ' + p.id);
  const st = p.status;
  if (['未', '済', 'キャンセル'].indexOf(st) < 0) throw new Error('状態が不正です');
  writeRow_(sh, r._row, { '受取状況': st, '受取日': st === '済' ? todayStr_() : '' });
  return { ok: true };
}

/* ---------------- 店舗実績 ---------------- */

function addShopLogs_(items) {
  const sh = sheet_('店舗実績');
  const seen = {};
  rows_(sh).forEach(r => { if (r['受付ID']) seen[String(r['受付ID'])] = true; });
  const arrs = [], done = [];
  items.forEach(it => {
    done.push(it.clientId);
    if (it.clientId && seen[it.clientId]) return;
    if (['配布', '販売', '返品'].indexOf(it.kind) < 0) return;
    arrs.push(toArr_(sh, {
      '日付': it.date || todayStr_(), '店舗': it.store, '規格': it.size, '区分': it.kind,
      '数量': Math.floor(n_(it.qty)), '入力者': it.by || '', '備考': it.note || '',
      '受付ID': it.clientId || '', '登録日時': nowStr_(),
    }));
    if (it.clientId) seen[it.clientId] = true;
  });
  appendRows_(sh, arrs);
  return { ok: true, added: arrs.length, done: done };
}

function deleteShopLog_(clientId) {
  const sh = sheet_('店舗実績');
  const r = rows_(sh).find(x => String(x['受付ID']) === String(clientId));
  if (!r) throw new Error('記録が見つかりません');
  sh.deleteRow(r._row);
  return { ok: true };
}

/* ---------------- 精米記録 ---------------- */

function saveMilling_(p) {
  const sh = sheet_('精米記録');
  const date = d_(p.date);
  if (!date) throw new Error('精米日が不正です');
  let r = rows_(sh).find(x => d_(x['精米日']) === date);
  let row;
  if (r) row = r._row;
  else {
    row = lastDataRow_(sh) + 1;
    sh.getRange(row, 1).setValue(date);
    millingFormulas_(sh, row);
  }
  const o = {};
  const cnt = v => Math.max(0, Math.floor(n_(v)));
  [['gen', '玄米袋数'], ['b5k', '米袋5kg'], ['b5m', '無地袋5kg'], ['b2k', '米袋2kg'], ['b2m', '無地袋2kg']]
    .forEach(([k, h]) => { if (p[k] !== undefined) o[h] = cnt(p[k]); });
  if (p.pay !== undefined) o['支払額'] = p.pay === '' ? '' : n_(p.pay);
  if (p.status !== undefined) o['状態'] = p.status;
  if (p.note !== undefined) o['備考'] = p.note;
  writeRow_(sh, row, o);
  // 5kg/2kg の合計列（シートの数式用）を内訳から更新
  const c = cols_(sh);
  const v = sh.getRange(row, 1, 1, sh.getLastColumn()).getValues()[0];
  const g = h => n_(v[c[h] - 1]);
  if (['米袋5kg', '無地袋5kg', '米袋2kg', '無地袋2kg'].some(h => v[c[h] - 1] !== '')) {
    writeRow_(sh, row, { '5kg袋数': g('米袋5kg') + g('無地袋5kg'), '2kg袋数': g('米袋2kg') + g('無地袋2kg') });
  }
  return { ok: true };
}

function millingFormulas_(sh, r) {
  const c = cols_(sh);
  const L = k => columnLetter_(c[k]);
  const A = L('精米日') + r;
  const set = (k, f) => { if (c[k]) sh.getRange(r, c[k]).setFormula(f); };
  set('曜日', '=CHOOSE(WEEKDAY(' + A + '),"日","月","火","水","木","金","土")');
  set('時期', '=IF(DAY(' + A + ')<=10,"上旬",IF(DAY(' + A + ')<=20,"中旬","下旬"))');
  set('持込日', '=' + A + '-1');
  set('精米量kg', '=' + L('5kg袋数') + r + '*価格マスタ!$B$2+' + L('2kg袋数') + r + '*価格マスタ!$B$3');
  // 玄米袋数があれば玄米の重さで、なければ袋詰め量で 90kg を判定
  const base = 'IF(N(' + L('玄米袋数') + r + ')>0,' + L('玄米袋数') + r + '*30,' + L('精米量kg') + r + ')';
  set('90kg判定', '=IF(' + base + '=0,"",IF(' + base + '>=設定!$B$4,"OK","不足"))');
}

function seedMilling_(sh) {
  const d = new Date(2026, 9, 22);
  const end = new Date(2026, 10, 26);
  let r = 2;
  while (d <= end) {
    const w = d.getDay();
    if (w === 2 || w === 4) {
      sh.getRange(r, 1).setValue(Utilities.formatDate(d, TZ, 'yyyy-MM-dd'));
      millingFormulas_(sh, r);
      writeRow_(sh, r, { '状態': '予定' });
      r++;
    }
    d.setDate(d.getDate() + 1);
  }
}

function columnLetter_(n) {
  let s = '';
  while (n > 0) { const m = (n - 1) % 26; s = String.fromCharCode(65 + m) + s; n = Math.floor((n - 1) / 26); }
  return s;
}

/* ---------------- タスク ---------------- */

function saveTask_(p) {
  const sh = sheet_('タスク');
  const rows = rows_(sh);
  if (p.id) {
    const r = rows.find(x => String(x['ID']) === String(p.id));
    if (!r) throw new Error('タスクが見つかりません');
    const o = {};
    ['status:状態', 'owner:担当', 'title:タスク', 'kind:区分', 'due:期限', 'note:備考'].forEach(s => {
      const [k, h] = s.split(':'); if (p[k] !== undefined) o[h] = p[k];
    });
    writeRow_(sh, r._row, o);
    return { ok: true, id: p.id };
  }
  if (!String(p.title || '').trim()) throw new Error('タスク名を入力してください');
  let max = 0;
  rows.forEach(r => { const m = String(r['ID']).match(/^T(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
  const id = 'T' + ('0' + (max + 1)).slice(-2);
  appendRows_(sh, [toArr_(sh, {
    'ID': id, '区分': p.kind || '', 'タスク': p.title, '期限': p.due || '', '担当': p.owner || '',
    '状態': '未着手', '備考': p.note || '',
  })]);
  return { ok: true, id: id };
}

/* ---------------- マスタ編集 ---------------- */

function savePrice_(p) {
  const sh = sheet_('価格マスタ');
  const r = rows_(sh).find(x => String(x['規格']) === String(p.size));
  if (!r) throw new Error('規格が見つかりません');
  const o = {};
  ['ex:税別', 'inc:税込', 'staff:社割税込', 'rsv:予約価格'].forEach(s => {
    const [k, h] = s.split(':'); if (p[k] !== undefined && p[k] !== '') o[h] = n_(p[k]);
  });
  writeRow_(sh, r._row, o);
  return { ok: true };
}

function saveStore_(p) {
  const sh = sheet_('店舗マスタ');
  const rows = rows_(sh);
  const active = String(p.active) !== 'false';
  if (p.id) {
    const r = rows.find(x => String(x['店舗ID']) === String(p.id));
    if (!r) throw new Error('店舗が見つかりません');
    writeRow_(sh, r._row, { '店舗名': p.name, '区分': p.type || '', '有効': active });
    return { ok: true, id: p.id };
  }
  if (!String(p.name || '').trim()) throw new Error('店舗名を入力してください');
  let max = 0;
  rows.forEach(r => { const m = String(r['店舗ID']).match(/^S(\d+)$/); if (m) max = Math.max(max, Number(m[1])); });
  const id = 'S' + ('0' + (max + 1)).slice(-2);
  appendRows_(sh, [toArr_(sh, { '店舗ID': id, '店舗名': p.name, '区分': p.type || '分配先', '有効': active })]);
  return { ok: true, id: id };
}

/* ---------------- 出荷表の写真を読む（Gemini） ---------------- */
/**
 * スクリプトプロパティ：GEMINI_API_KEY（必須）、GEMINI_MODEL（任意・既定 gemini-flash-lite-latest。混雑・失敗時は gemini-flash-latest へ）
 * 写真は Drive の「新米_出荷表」フォルダに保存し、URL を返す
 */
function readShipSheet_(b) {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です');
  // 混雑時の予備（同じモデルで2回やり直してもだめなら別のモデルへ）
  const models = geminiModels4_();
  const mime = b.mime || 'image/jpeg';
  const prompt = [
    'これは「ファームパーク伊都国 伊都国即売会」の手書きの出荷表の写真です。読み取って JSON だけを返してください。',
    '・右上に「◯月◯日◯曜日（◯回目）」がある。月・日・曜日・回目を数字/文字で読む。',
    '・表の左は「出荷品等」（品名。例：米5kg、米2kg）と「希望価格」（円）。',
    '・右側は出荷先の列が左から順に8列：Ⓐ志摩直、Ⓑ笹丘直、①マリナ、②笹丘、③ねぎぼうず、④唐泊、⑤本店、⑥（手書きの店名。例：売店）。',
    '  列名は用紙に書かれているとおりに読む（⑥は手書きの文字）。',
    '・各マスは上段が「円」、下段が「個」。下段の個数（手書きの数字）を読む。空欄は 0。',
    '・品名が空の行は含めない。',
    '形式：{"month":数,"day":数,"weekday":"火","round":数,"columns":[8個の列名],',
    ' "items":[{"name":"米5kg","price":3570,"counts":[8個の数]}]}',
    '今日は ' + Utilities.formatDate(new Date(), TZ, 'yyyy-MM-dd') + ' です。'
  ].join('\n');
  const r = geminiCall_(key, models, [{ text: prompt }, { inline_data: { mime_type: mime, data: b.image } }], true);
  const code = r.code, txt = r.txt, used = r.model;
  if ([429, 500, 503, 504].indexOf(code) >= 0) throw new Error('Geminiが混み合っているか、応答に時間がかかっています。少し時間をおいて「もう一度読み取る」を押してください（' + code + '・試行 ' + r.tries + '）');
  if (code !== 200) throw new Error('Gemini エラー (' + code + ')：' + txt.slice(0, 200));
  const j = JSON.parse(txt);
  const part = j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts;
  const raw = part ? part.filter(x => !x.thought).map(x => x.text || '').join('') : '';
  let sheet;
  try { sheet = JSON.parse(raw.replace(/^```json\s*|```$/g, '')); }
  catch (e) { throw new Error('読み取り結果を解釈できませんでした：' + raw.slice(0, 120)); }

  // 写真を Drive に保存（記録用）
  let url = '';
  try {
    const it = DriveApp.getFoldersByName('新米_出荷表');
    const folder = it.hasNext() ? it.next() : DriveApp.createFolder('新米_出荷表');
    const name = '出荷表_' + Utilities.formatDate(new Date(), TZ, 'yyyyMMdd_HHmmss') + (mime === 'image/png' ? '.png' : '.jpg');
    url = folder.createFile(Utilities.newBlob(Utilities.base64Decode(b.image), mime, name)).getUrl();
  } catch (e) { /* 保存できなくても読み取り結果は返す */ }
  return { ok: true, sheet: sheet, photoUrl: url, model: used, ms: r.ms, tries: r.tries };
}

/**
 * Gemini 呼び出し（混雑時はやり直し・予備モデルへ）。
 * 表の読み取りに長い推論はいらないので thinking を最小にする（非対応のモデルなら自動で外す）
 */
function geminiCall_(key, models, parts, json) {
  const t0 = Date.now();
  let code = 0, txt = '', used = models[0], tries = [], thinking = true;
  for (let i = 0; i < models.length; i++) {
    used = models[i];
    const gc = { temperature: 0 };
    if (json) gc.responseMimeType = 'application/json';
    if (thinking) gc.thinkingConfig = { thinkingBudget: 0 };
    const t = Date.now();
    let res;
    try {
      res = UrlFetchApp.fetch(
        'https://generativelanguage.googleapis.com/v1beta/models/' + used + ':generateContent?key=' + encodeURIComponent(key),
        { method: 'post', contentType: 'application/json', muteHttpExceptions: true,
          payload: JSON.stringify({ contents: [{ parts: parts }], generationConfig: gc }) });
      code = res.getResponseCode(); txt = res.getContentText();
    } catch (e) { code = 504; txt = String(e); }
    tries.push(used + ':' + code + ':' + Math.round((Date.now() - t) / 1000) + 's');
    if (code === 200) break;
    if (code === 400 && thinking) { thinking = false; i--; continue; }   // thinking 設定に非対応 → 外して同じモデルでやり直す
    if (code === 400 || code === 404) {                                  // モデル名が使えない等 → 次のモデルへ
      const next = models.slice(i + 1).find(m => m !== used);
      if (!next) break;
      i = models.indexOf(next, i + 1) - 1; thinking = true; continue;
    }
    if ([429, 500, 503, 504].indexOf(code) < 0) break;   // 混雑・一時的なエラーだけやり直す
    if (Date.now() - t0 > 200000) break;                   // GAS の時間制限に余裕を残す
    if (i < models.length - 1) Utilities.sleep(2000 * (i + 1));
  }
  return { code: code, txt: txt, model: used, ms: Date.now() - t0, tries: tries.join(' / ') };
}

/** 使うモデル：設定シート「Geminiモデル」＞スクリプトプロパティ GEMINI_MODEL＞既定 */
function geminiModels4_() {
  let m = '';
  try { m = String(settings_()['Geminiモデル'] || '').trim(); } catch (e) {}
  m = m || PropertiesService.getScriptProperties().getProperty('GEMINI_MODEL') || 'gemini-flash-lite-latest';
  const alt = m === 'gemini-flash-latest' ? 'gemini-flash-lite-latest' : 'gemini-flash-latest';
  return [m, m, alt];
}

/** キーで使える Gemini モデルの一覧（generateContent 対応のもの） */
function geminiList_() {
  const key = PropertiesService.getScriptProperties().getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です');
  const res = UrlFetchApp.fetch('https://generativelanguage.googleapis.com/v1beta/models?pageSize=200&key=' + encodeURIComponent(key), { muteHttpExceptions: true });
  if (res.getResponseCode() !== 200) throw new Error('一覧を取得できませんでした (' + res.getResponseCode() + ')');
  const list = (JSON.parse(res.getContentText()).models || [])
    .filter(m => (m.supportedGenerationMethods || []).indexOf('generateContent') >= 0 && /gemini/i.test(m.name) && /flash/i.test(m.name) && !/image|tts|audio|live|embedding/i.test(m.name))
    .map(m => ({ id: String(m.name).replace(/^models\//, ''), name: m.displayName || '' }));
  return { ok: true, models: list, current: geminiModels4_()[0] };
}

/** ⚙設定の「Gemini接続テスト」用：短い文だけ送って応答時間とモデルを確認 */
function geminiPing_() {
  const props = PropertiesService.getScriptProperties();
  const key = props.getProperty('GEMINI_API_KEY');
  if (!key) throw new Error('スクリプトプロパティ GEMINI_API_KEY が未設定です');
  const ms = geminiModels4_();
  const r = geminiCall_(key, [ms[0], ms[2]], [{ text: '「OK」とだけ返してください。' }], false);
  if (r.code !== 200) throw new Error('Gemini エラー (' + r.code + ')：' + r.txt.slice(0, 160) + '　試行：' + r.tries);
  return { ok: true, model: r.model, ms: r.ms, tries: r.tries };
}
