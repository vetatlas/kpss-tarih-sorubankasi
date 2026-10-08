// bot.js — KPSS BilgiMatik Telegram Bot
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'vetatlas';
const GITHUB_REPO = 'kpss-tarih-sorubankasi';
const GITHUB_FILE = 'data/sorular.json';

const DATA_FILE = path.join(__dirname, 'data', 'sorular.json');
const userStates = {};

const DERSLER = ['Tarih', 'Coğrafya', 'Vatandaşlık', 'Türkçe', 'Matematik', 'Güncel'];
const SEVIYELER = ['Ortaöğretim', 'Önlisans', 'Lisans'];
const LETTERS = 'ABCDE';

const ADMIN_TELEGRAM_ID = String(process.env.ADMIN_TELEGRAM_ID || '').trim();
const ADMIN_PASSWORD = String(process.env.ADMIN_PASSWORD || '');
const ADMIN_SESSION_SECRET = String(process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || '').trim();
const ADMIN_SESSION_TTL = 8 * 60 * 60 * 1000;

function safeEqual(a, b) {
  const aa = Buffer.from(String(a));
  const bb = Buffer.from(String(b));
  return aa.length === bb.length && crypto.timingSafeEqual(aa, bb);
}

function adminTelegramOnly(chatId) {
  if (!ADMIN_TELEGRAM_ID) return false;
  return String(chatId) === ADMIN_TELEGRAM_ID;
}

function signSession(payload) {
  const raw = Buffer.from(JSON.stringify(payload)).toString('base64url');
  const sig = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(raw).digest('base64url');
  return raw + '.' + sig;
}

function verifySession(token) {
  try {
    if (!token || !ADMIN_SESSION_SECRET) return false;
    const [raw, sig] = String(token).split('.');
    if (!raw || !sig) return false;
    const expected = crypto.createHmac('sha256', ADMIN_SESSION_SECRET).update(raw).digest('base64url');
    if (!safeEqual(sig, expected)) return false;
    const payload = JSON.parse(Buffer.from(raw, 'base64url').toString('utf8'));
    return payload.exp > Date.now();
  } catch { return false; }
}

function parseCookies(req) {
  const out = {};
  String(req.headers.cookie || '').split(';').forEach(part => {
    const i = part.indexOf('=');
    if (i > 0) out[part.slice(0, i).trim()] = decodeURIComponent(part.slice(i + 1).trim());
  });
  return out;
}

function setCors(req, res) {
  const origin = req.headers.origin;
  const allowed = new Set([
    'https://vetatlas.github.io',
    'https://kpss-tarih-sorubankasi.onrender.com'
  ]);
  if (origin && allowed.has(origin)) res.setHeader('Access-Control-Allow-Origin', origin);
  res.setHeader('Vary', 'Origin');
  res.setHeader('Access-Control-Allow-Credentials', 'true');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  res.setHeader('Access-Control-Allow-Methods', 'GET,POST,PUT,OPTIONS');
}

function jsonRes(req, res, status, body) {
  setCors(req, res);
  res.writeHead(status, { 'Content-Type': 'application/json; charset=utf-8' });
  res.end(JSON.stringify(body));
}

function authorizedPanel(req) {
  return verifySession(parseCookies(req).kpss_admin_session);
}

function safeDataPath(p) {
  const value = String(p || '').replace(/^\/+/, '');
  if (!value.startsWith('data/') || value.includes('..') || value.includes('\\')) return null;
  return value;
}

async function readRequestBody(req) {
  return await new Promise((resolve, reject) => {
    let body = '';
    req.on('data', chunk => {
      body += chunk;
      if (body.length > 5 * 1024 * 1024) req.destroy(new Error('Payload too large'));
    });
    req.on('end', () => resolve(body));
    req.on('error', reject);
  });
}

async function handleAdminApi(req, res) {
  if (req.method === 'OPTIONS') {
    setCors(req, res);
    res.writeHead(204);
    return res.end();
  }

  const url = new URL(req.url, 'http://localhost');

if (!url.pathname.startsWith('/api/') && (req.method === 'GET' || req.method === 'HEAD')) {
    const requested = url.pathname === '/' ? 'index.html'
      : url.pathname === '/admin' ? 'panel-k7x9m.html'
      : url.pathname.replace(/^\/+/, '');
    if (requested.includes('..') || requested.includes('\\\\')) {
      return jsonRes(req, res, 400, { ok: false, error: 'Geçersiz yol.' });
    }
    const full = path.join(__dirname, requested);
    if (!fs.existsSync(full) || !fs.statSync(full).isFile()) {
      return jsonRes(req, res, 404, { ok: false, error: 'Sayfa bulunamadı.' });
    }
    const types = {
      '.html':'text/html; charset=utf-8', '.js':'application/javascript; charset=utf-8',
      '.css':'text/css; charset=utf-8', '.json':'application/json; charset=utf-8',
      '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.svg':'image/svg+xml',
      '.ico':'image/x-icon', '.webp':'image/webp', '.txt':'text/plain; charset=utf-8'
    };
    const ext = path.extname(full).toLowerCase();
    setCors(req, res);
    res.writeHead(200, { 'Content-Type': types[ext] || 'application/octet-stream', 'Cache-Control': 'no-cache' });
    if (req.method === 'HEAD') return res.end();
    return res.end(fs.readFileSync(full));
  }

  if (url.pathname === '/api/health' && req.method === 'GET') {
    return jsonRes(req, res, 200, { ok: true, service: 'KPSS BilgiMatik', adminConfigured: !!ADMIN_PASSWORD, telegramAdminConfigured: !!ADMIN_TELEGRAM_ID });
  }

  if (url.pathname === '/api/login' && req.method === 'POST') {
    if (!ADMIN_PASSWORD || !ADMIN_SESSION_SECRET) {
      return jsonRes(req, res, 503, { ok: false, error: 'Admin güvenliği Render Environment Variables ile yapılandırılmamış.' });
    }
    try {
      const body = JSON.parse(await readRequestBody(req) || '{}');
      if (!safeEqual(body.password || '', ADMIN_PASSWORD)) {
        return jsonRes(req, res, 401, { ok: false, error: 'Şifre yanlış.' });
      }
      const token = signSession({ iat: Date.now(), exp: Date.now() + ADMIN_SESSION_TTL });
      setCors(req, res);
      res.setHeader('Set-Cookie', `kpss_admin_session=${encodeURIComponent(token)}; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=${Math.floor(ADMIN_SESSION_TTL / 1000)}`);
      return jsonRes(req, res, 200, { ok: true });
    } catch {
      return jsonRes(req, res, 400, { ok: false, error: 'Geçersiz istek.' });
    }
  }

  if (url.pathname === '/api/logout' && req.method === 'POST') {
    setCors(req, res);
    res.setHeader('Set-Cookie', 'kpss_admin_session=; HttpOnly; Secure; SameSite=None; Path=/; Max-Age=0');
    return jsonRes(req, res, 200, { ok: true });
  }

  if (url.pathname === '/api/data' && (req.method === 'GET' || req.method === 'PUT')) {
    if (!authorizedPanel(req)) return jsonRes(req, res, 401, { ok: false, error: 'Yetkisiz erişim.' });
    let body = null;
    if (req.method === 'PUT') {
      body = JSON.parse(await readRequestBody(req) || '{}');
    }
    const p = safeDataPath(url.searchParams.get('path') || (body && body.path) || '');
    if (!p) return jsonRes(req, res, 400, { ok: false, error: 'Geçersiz dosya yolu.' });

    if (req.method === 'GET') {
      try {
        const full = path.join(__dirname, p);
        if (!fs.existsSync(full)) return jsonRes(req, res, 404, { ok: false, error: 'Dosya bulunamadı.' });
        return jsonRes(req, res, 200, { ok: true, path: p, data: JSON.parse(fs.readFileSync(full, 'utf8')) });
      } catch {
        return jsonRes(req, res, 500, { ok: false, error: 'Dosya okunamadı.' });
      }
    }

    try {
      if (!body || !body.content || typeof body.content !== 'object') return jsonRes(req, res, 400, { ok: false, error: 'Geçersiz içerik.' });
      const full = path.join(__dirname, p);
      fs.mkdirSync(path.dirname(full), { recursive: true });
      fs.writeFileSync(full, JSON.stringify(body.content, null, 2));
      const pushed = await autoPushToGithubForPath(p, body.content, body.message || 'Admin panel güncellemesi');
      if (!pushed) return jsonRes(req, res, 502, { ok: false, error: 'GitHub kaydı başarısız.' });
      return jsonRes(req, res, 200, { ok: true });
    } catch (e) {
      return jsonRes(req, res, 400, { ok: false, error: e.message || 'Kaydetme başarısız.' });
    }
  }

  return jsonRes(req, res, 404, { ok: false, error: 'Endpoint bulunamadı.' });
}


/* ═══════════ YARDIMCILAR ═══════════ */
function loadQuestions() {
  try {
    if (!fs.existsSync(DATA_FILE)) return { sorular: [] };
    return JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch (e) { return { sorular: [] }; }
}
function saveQuestions(data) {
  const dir = path.dirname(DATA_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2));
}

// 🎯 Kategorileri sorulardan türet + alfabetik sırala
function getKategoriler(ders) {
  const data = loadQuestions();
  const set = new Set();
  data.sorular.forEach(q => {
    if (q.ders === ders && q.kategori) set.add(q.kategori);
  });
  return Array.from(set).sort((a, b) => a.localeCompare(b, 'tr'));
}

// 🎯 Başlangıçta GitHub'dan soruları çek (kayıp önleme)
async function initFromGithub() {
  try {
    const res = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'KPSS-Bot' } }
    );
    if (res.ok) {
      const info = await res.json();
      const content = Buffer.from(info.content, 'base64').toString('utf8');
      const dir = path.dirname(DATA_FILE);
      if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
      fs.writeFileSync(DATA_FILE, content);
      const cnt = JSON.parse(content).sorular?.length || 0;
      console.log(`✅ GitHub'dan ${cnt} soru yüklendi`);
    } else {
      console.log('⚠️ GitHub dosyası bulunamadı, sıfırdan başlanıyor');
      saveQuestions({ sorular: [] });
    }
  } catch (e) {
    console.error('Init hata:', e.message);
    saveQuestions({ sorular: [] });
  }
}

async function tg(method, body) {
  try {
    const res = await fetch(`${TELEGRAM_API}/${method}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return await res.json();
  } catch (e) { console.error('API hata:', e.message); return null; }
}
async function send(chatId, text, extra = {}) {
  return tg('sendMessage', { chat_id: chatId, text, parse_mode: 'Markdown', ...extra });
}
async function getFileUrl(fileId) {
  const d = await tg('getFile', { file_id: fileId });
  if (!d || !d.ok) return null;
  return `https://api.telegram.org/file/bot${TELEGRAM_TOKEN}/${d.result.file_path}`;
}

function mainMenu() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '➕ Tek Soru Ekle', callback_data: 'new_question' }],
    [{ text: '📥 Toplu Soru (Metin)', callback_data: 'bulk' }],
    [{ text: '📊 Anketten Çevir', callback_data: 'anket_start' }],
    [{ text: '📸 Görsel Seri Modu', callback_data: 'seri_start' }],
    [{ text: '📋 Soruları Yönet', callback_data: 'manage' }],
    [{ text: '📊 İstatistik', callback_data: 'stats' },
     { text: '❓ Yardım', callback_data: 'help' }]
  ] } };
}

function backMenu() {
  return { reply_markup: { inline_keyboard: [
    [{ text: '📋 Listeye Dön', callback_data: 'manage' }],
    [{ text: '🏠 Ana Menü', callback_data: 'home' }]
  ] } };
}

/* ═══════════ GITHUB PUSH ═══════════ */
async function autoPushToGithubForPath(filePath, data, message) {
  try {
    const url = `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${filePath}`;
    const get = await fetch(url + '?ref=main', {
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'User-Agent': 'KPSS-Bot' }
    });
    let sha = null;
    if (get.ok) sha = (await get.json()).sha;
    const encoded = Buffer.from(JSON.stringify(data, null, 2), 'utf8').toString('base64');
    const body = { message, content: encoded, branch: 'main' };
    if (sha) body.sha = sha;
    const put = await fetch(url, {
      method: 'PUT',
      headers: { 'Authorization': 'token ' + GITHUB_TOKEN, 'User-Agent': 'KPSS-Bot', 'Content-Type': 'application/json' },
      body: JSON.stringify(body)
    });
    return put.ok;
  } catch (e) {
    console.error('Panel GitHub push hata:', e.message);
    return false;
  }
}

async function autoPushToGithub(data) {
  try {
    const content = JSON.stringify(data, null, 2);
    const encodedContent = Buffer.from(content).toString('base64');
    let sha = null;
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'KPSS-Bot' } }
    );
    if (getRes.ok) { const info = await getRes.json(); sha = info.sha; }
    const body = {
      message: `Bot: ${data.sorular.length} soru`,
      content: encodedContent,
      branch: 'main'
    };
    if (sha) body.sha = sha;
    const putRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      {
        method: 'PUT',
        headers: {
          'Authorization': `token ${GITHUB_TOKEN}`,
          'Content-Type': 'application/json',
          'User-Agent': 'KPSS-Bot'
        },
        body: JSON.stringify(body)
      }
    );
    if (!putRes.ok) { console.error('GitHub hata:', await putRes.text()); return false; }
    console.log(`✅ GitHub push (${data.sorular.length} soru)`);
    return true;
  } catch (e) { console.error('Push hata:', e.message); return false; }
}

/* ═══════════ HELP & STATS ═══════════ */
async function sendHelp(chatId) {
  send(chatId,
    `📖 *Komutlar*\n\n` +
    `*/soru* — Tek soru ekle\n` +
    `*/toplu* — Toplu soru ekle\n` +
    `*/anket* — Anketten çevir\n` +
    `*/seri* — Görsel seri modu\n` +
    `*/bitir* — Seriyi bitir\n` +
    `*/listele* — Soruları listele\n` +
    `*/istatistik* — Kaç soru var\n` +
    `*/iptal* — İptal et\n` +
    `*/yardim* — Bu menü`);
}

async function sendStats(chatId) {
  const data = loadQuestions();
  const byD = {};
  const withImg = data.sorular.filter(q => q.gorsel).length;
  data.sorular.forEach(q => { byD[q.ders] = (byD[q.ders] || 0) + 1; });
  let t = `📊 *Toplam ${data.sorular.length} soru*\n🖼 Görselli: ${withImg}\n\n`;
  Object.keys(byD).sort().forEach(d => { t += `• ${d}: ${byD[d]}\n`; });
  send(chatId, t, mainMenu());
}

/* ═══════════ KATEGORİ LİSTESİ ═══════════ */
function showKategoriler(chatId, ders, mode, page = 0) {
  const cats = getKategoriler(ders);
  const perPage = 8;
  const total = Math.ceil(cats.length / perPage);
  const start = page * perPage;
  const slice = cats.slice(start, start + perPage);

  const buttons = slice.map(c => [{ text: '📂 ' + c, callback_data: 'kat_' + c }]);

  if (total > 1) {
    const nav = [];
    if (page > 0) nav.push({ text: '⬅️', callback_data: `katpage_${page - 1}` });
    nav.push({ text: `${page + 1}/${total}`, callback_data: 'noop' });
    if (page < total - 1) nav.push({ text: '➡️', callback_data: `katpage_${page + 1}` });
    buttons.push(nav);
  }

  buttons.push([{ text: '➕ Yeni kategori yaz', callback_data: 'kat_yeni' }]);

  userStates[chatId] = {
    step: 'kategori', mode: mode || 'add', ders,
    katPage: page,
    seriSayisi: userStates[chatId]?.seriSayisi || 0
  };

  const msg = cats.length === 0
    ? `✅ Ders: *${ders}*\n\n📂 Henüz kategori yok.\nYeni kategori yaz:`
    : `✅ Ders: *${ders}*\n\n📂 Kategori seç (${cats.length} adet):`;

  return send(chatId, msg, { reply_markup: { inline_keyboard: buttons } });
}

/* ═══════════ TEK SORU EKLEME ═══════════ */
function startFlow(chatId) {
  userStates[chatId] = { step: 'ders', mode: 'add' };
  send(chatId, '📚 *Yeni Soru Ekleme*\n\nHangi ders?', {
    reply_markup: { inline_keyboard: DERSLER.map(d => [{ text: d, callback_data: 'ders_' + d }]) }
  });
}

async function finish(chatId, extraMsg = '') {
  const s = userStates[chatId];
  if (!s) return;
  const data = loadQuestions();
  const q = {
    id: 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ders: s.ders, kategori: s.kategori, seviye: s.seviye,
    soru: s.soru, secenekler: s.secenekler, dogru: s.dogru,
    aciklama: s.aciklama || '', gorsel: s.gorsel || null,
    eklenme: Date.now(), kaynak: 'telegram'
  };
  data.sorular.unshift(q);
  saveQuestions(data);
  delete userStates[chatId];
  const pushed = await autoPushToGithub(data);
  const pushMsg = pushed ? '✅ Siteye gönderildi' : '⚠️ GitHub hatası';
  send(chatId,
    `${extraMsg}🎉 *Soru kaydedildi!*\n\n` +
    `📚 ${q.ders}\n📂 ${q.kategori}\n🎓 ${q.seviye}\n` +
    `✔️ Doğru: ${LETTERS[q.dogru]}\n🖼 Görsel: ${q.gorsel ? '✅' : '—'}\n\n` +
    `${pushMsg}\n📊 Toplam *${data.sorular.length}* soru`,
    mainMenu());
}

/* ═══════════ TOPLU SORU ═══════════ */
function startBulk(chatId) {
  userStates[chatId] = { step: 'bulk_input', mode: 'bulk' };
  send(chatId,
    `📥 *Toplu Soru Ekleme*\n\n` +
    `Format:\n\n` +
    "```\n" +
    `Ders: Tarih\n` +
    `Kategori: İslamiyet Öncesi\n` +
    `Seviye: Lisans\n\n` +
    `1. Soru?\n` +
    `A) ...\n` +
    `B) ...\n` +
    `C) ...\n` +
    `D) ...\n` +
    `E) ...\n` +
    `Cevap: B\n` +
    `Açıklama: ...\n` +
    "```",
    { parse_mode: 'Markdown' });
}

function parseBulkQuestions(text) {
  const lines = text.split('\n').map(l => l.trim());
  let ders = '', kategori = '', seviye = 'Lisans';
  const sorular = [];
  let currentQ = null;
  let optionsStarted = false;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line) continue;

    const dersMatch = line.match(/^(?:ders|Ders|DERS)\s*:\s*(.+)$/i);
    const katMatch = line.match(/^(?:kategori|Kategori|KATEGORİ)\s*:\s*(.+)$/i);
    const sevMatch = line.match(/^(?:seviye|Seviye|SEVİYE)\s*:\s*(.+)$/i);

    if (dersMatch) { ders = dersMatch[1].trim(); continue; }
    if (katMatch) { kategori = katMatch[1].trim(); continue; }
    if (sevMatch) { seviye = sevMatch[1].trim(); continue; }

    const qStart = line.match(/^(?:\d+[\.\):]|Soru\s*\d+\s*[:\-])\s*(.+)$/i);
    if (qStart) {
      if (currentQ && currentQ.soru) sorular.push(currentQ);
      currentQ = { soru: qStart[1].trim(), secenekler: [], dogru: -1, aciklama: '' };
      optionsStarted = false;
      continue;
    }
    if (!currentQ) continue;

    const optMatch = line.match(/^([A-Ea-e])\s*[\)\.\-:]\s*(.+)$/);
    if (optMatch) {
      currentQ.secenekler[LETTERS.indexOf(optMatch[1].toUpperCase())] = optMatch[2].trim();
      optionsStarted = true;
      continue;
    }
    const cevMatch = line.match(/^(?:cevap|Cevap|CEVAP|doğru|Doğru)\s*[:\-]?\s*([A-Ea-e])\b/);
    if (cevMatch) {
      currentQ.dogru = LETTERS.indexOf(cevMatch[1].toUpperCase());
      continue;
    }
    const ackMatch = line.match(/^(?:açıklama|Açıklama|AÇIKLAMA)\s*[:\-]?\s*(.+)$/);
    if (ackMatch) { currentQ.aciklama = ackMatch[1].trim(); continue; }

    // 🎯 ÇOK SATIRLI SORU: Şıklar başlamadıysa bu satır soru metnine eklenir
    // (I., II., III. öncülleri ve soru devamı burada yakalanır)
    if (!optionsStarted) {
      currentQ.soru += '\n' + line;
      continue;
    }
  }
  if (currentQ && currentQ.soru) sorular.push(currentQ);

  const valid = sorular.filter(q =>
    q.soru && q.secenekler.filter(Boolean).length === 5 && q.dogru >= 0
  );
  return { ders, kategori, seviye, sorular: valid, toplam: sorular.length, gecerli: valid.length };
}

async function handleBulkInput(chatId, text) {
  const parsed = parseBulkQuestions(text);
  if (!parsed.sorular || parsed.sorular.length === 0) {
    return send(chatId, `⚠️ Hiç soru algılayamadım. Formatı kontrol et.`, mainMenu());
  }
  if (!parsed.ders) return send(chatId, `⚠️ "Ders:" satırı ekle.`);
  if (!parsed.kategori) return send(chatId, `⚠️ "Kategori:" satırı ekle.`);

  const data = loadQuestions();
  parsed.sorular.forEach(q => {
    data.sorular.unshift({
      id: 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      ders: parsed.ders, kategori: parsed.kategori, seviye: parsed.seviye,
      soru: q.soru, secenekler: q.secenekler, dogru: q.dogru,
      aciklama: q.aciklama || '', gorsel: null,
      eklenme: Date.now(), kaynak: 'telegram-bulk'
    });
  });
  saveQuestions(data);
  delete userStates[chatId];

  const pushed = await autoPushToGithub(data);
  const pushMsg = pushed ? '✅ Siteye gönderildi' : '⚠️ GitHub hatası';
  send(chatId,
    `🎉 *${parsed.gecerli} soru eklendi!*\n\n` +
    `📚 ${parsed.ders}\n📂 ${parsed.kategori}\n\n` +
    `${pushMsg}\n📊 Toplam *${data.sorular.length}* soru`,
    mainMenu());
}

/* ═══════════ ANKET ═══════════ */
function startAnket(chatId) {
  userStates[chatId] = { step: 'ders', mode: 'anket' };
  send(chatId, '📊 *Anket Modu*\n\nHangi ders?', {
    reply_markup: { inline_keyboard: DERSLER.map(d => [{ text: d, callback_data: 'ders_' + d }]) }
  });
}

async function handlePoll(msg) {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  const poll = msg.poll;
  if (!state || state.step !== 'anket_bekle' || !poll) return;
  if (poll.correct_option_id === undefined || poll.correct_option_id === null) {
    return send(chatId, `⚠️ Anket Quiz tipinde değil.`);
  }

  const data = loadQuestions();
  data.sorular.unshift({
    id: 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ders: state.ders, kategori: state.kategori, seviye: state.seviye,
    soru: poll.question, secenekler: poll.options.map(o => o.text), dogru: poll.correct_option_id,
    aciklama: '', gorsel: null,
    eklenme: Date.now(), kaynak: 'telegram-anket'
  });
  saveQuestions(data);
  delete userStates[chatId];

  const pushed = await autoPushToGithub(data);
  const pushMsg = pushed ? '✅ Siteye gönderildi' : '⚠️ GitHub hatası';
  send(chatId,
    `🎉 *Anket soruya çevrildi!*\n\n` +
    `📚 ${state.ders}\n📂 ${state.kategori}\n` +
    `✔️ Doğru: ${LETTERS[poll.correct_option_id]}\n\n` +
    `${pushMsg}\n📊 Toplam *${data.sorular.length}* soru`,
    mainMenu());
}

/* ═══════════ GÖRSEL SERİ ═══════════ */
function startSeri(chatId) {
  userStates[chatId] = { step: 'ders', mode: 'seri', seriSayisi: 0 };
  send(chatId, '📸 *Görsel Seri Modu*\n\nHangi ders?', {
    reply_markup: { inline_keyboard: DERSLER.map(d => [{ text: d, callback_data: 'ders_' + d }]) }
  });
}

/* ═══════════ SORU LİSTESİ ═══════════ */
function showQuestions(chatId, page = 0) {
  const data = loadQuestions();
  const sorular = data.sorular;
  if (sorular.length === 0) return send(chatId, '📭 Henüz soru yok.', mainMenu());
  const perPage = 8;
  const start = page * perPage;
  const end = Math.min(start + perPage, sorular.length);
  let text = `📋 *Sorular* (toplam ${sorular.length})\n\nSayfa ${page + 1}/${Math.ceil(sorular.length / perPage)}\n`;
  const buttons = [];
  for (let i = start; i < end; i++) {
    const q = sorular[i];
    const short = q.soru.length > 32 ? q.soru.slice(0, 32) + '…' : q.soru;
    buttons.push([{ text: `${i + 1}. [${q.ders}] ${short}`, callback_data: 'view_' + i }]);
  }
  const nav = [];
  if (page > 0) nav.push({ text: '⬅️', callback_data: 'page_' + (page - 1) });
  if (end < sorular.length) nav.push({ text: '➡️', callback_data: 'page_' + (page + 1) });
  if (nav.length) buttons.push(nav);
  buttons.push([{ text: '🏠 Ana Menü', callback_data: 'home' }]);
  return send(chatId, text, { reply_markup: { inline_keyboard: buttons } });
}

function viewQuestion(chatId, idx) {
  const data = loadQuestions();
  const q = data.sorular[idx];
  if (!q) return send(chatId, '❌ Soru bulunamadı.', mainMenu());
  let text = `*Soru #${idx + 1}*\n\n`;
  text += `📚 ${q.ders} • 📂 ${q.kategori} • 🎓 ${q.seviye || '-'}\n\n`;
  text += `*${q.soru}*\n\n`;
  q.secenekler.forEach((s, i) => {
    text += `${LETTERS[i]}) ${s}${i === q.dogru ? ' ✅' : ''}\n`;
  });
  if (q.aciklama) text += `\n💬 _${q.aciklama}_`;
  if (q.gorsel) text += `\n🖼 Görselli`;
  return send(chatId, text, {
    reply_markup: { inline_keyboard: [
      [{ text: '✏️ Düzenle', callback_data: 'edit_' + idx },
       { text: '🗑 Sil', callback_data: 'del_' + idx }],
      [{ text: '⬅️ Listeye Dön', callback_data: 'manage' }]
    ] }
  });
}

/* ═══════════ SİL ═══════════ */
function confirmDelete(chatId, idx) {
  const q = loadQuestions().sorular[idx];
  if (!q) return send(chatId, '❌ Bulunamadı.');
  const short = q.soru.length > 60 ? q.soru.slice(0, 60) + '...' : q.soru;
  return send(chatId, `🗑 *Bu soruyu silmek istediğine emin misin?*\n\n_"${short}"_`, {
    reply_markup: { inline_keyboard: [[
      { text: '✅ Evet, sil', callback_data: 'delok_' + idx },
      { text: '❌ Vazgeç', callback_data: 'view_' + idx }
    ]] }
  });
}

async function deleteQuestion(chatId, idx) {
  const data = loadQuestions();
  if (!data.sorular[idx]) return send(chatId, '❌ Bulunamadı.');
  const removed = data.sorular.splice(idx, 1)[0];
  saveQuestions(data);
  const pushed = await autoPushToGithub(data);
  const msg = pushed ? '✅ Siteye gönderildi' : '⚠️ GitHub hatası';
  send(chatId, `🗑 *Soru silindi!*\n\n${msg}\n📊 Kalan: *${data.sorular.length}*`, mainMenu());
}

/* ═══════════ DÜZENLE ═══════════ */
function editMenu(chatId, idx) {
  const q = loadQuestions().sorular[idx];
  if (!q) return send(chatId, '❌ Bulunamadı.');
  return send(chatId, `✏️ *Soru #${idx + 1} düzenle*`, {
    reply_markup: { inline_keyboard: [
      [{ text: '📝 Soru metni', callback_data: 'edq_' + idx }],
      [{ text: '🔤 Seçenekler', callback_data: 'edopt_' + idx }],
      [{ text: '✅ Doğru cevap', callback_data: 'eddgr_' + idx }],
      [{ text: '💬 Açıklama', callback_data: 'edack_' + idx }],
      [{ text: '🖼 Görsel', callback_data: 'edgrs_' + idx }],
      [{ text: '📚 Ders / Kategori', callback_data: 'edcat_' + idx }],
      [{ text: '⬅️ Vazgeç', callback_data: 'view_' + idx }]
    ] }
  });
}

async function saveEdit(chatId, idx, updates, label) {
  const data = loadQuestions();
  if (!data.sorular[idx]) return send(chatId, '❌ Bulunamadı.');
  Object.assign(data.sorular[idx], updates);
  saveQuestions(data);
  const pushed = await autoPushToGithub(data);
  const msg = pushed ? '✅ Siteye gönderildi' : '⚠️ GitHub hatası';
  delete userStates[chatId];
  send(chatId, `✅ *${label} güncellendi!*\n\n${msg}`, backMenu());
}

/* ═══════════ CALLBACK ═══════════ */
async function handleCallback(q) {
  const chatId = q.message.chat.id;
  const data = q.data;
  await tg('answerCallbackQuery', { callback_query_id: q.id });

  if (data === 'noop') return;
  if (data === 'new_question') return startFlow(chatId);
  if (data === 'bulk') return startBulk(chatId);
  if (data === 'anket_start') return startAnket(chatId);
  if (data === 'seri_start') return startSeri(chatId);
  if (data === 'help') return sendHelp(chatId);
  if (data === 'stats') return sendStats(chatId);
  if (data === 'home') { delete userStates[chatId]; return send(chatId, '🏠 Ana Menü', mainMenu()); }
  if (data === 'manage') { delete userStates[chatId]; return showQuestions(chatId, 0); }
  if (data.startsWith('page_')) return showQuestions(chatId, parseInt(data.replace('page_', ''), 10));
  if (data.startsWith('view_')) return viewQuestion(chatId, parseInt(data.replace('view_', ''), 10));
  if (data.startsWith('delok_')) return deleteQuestion(chatId, parseInt(data.replace('delok_', ''), 10));
  if (data.startsWith('del_')) return confirmDelete(chatId, parseInt(data.replace('del_', ''), 10));

  if (data.startsWith('katpage_')) {
    const s = userStates[chatId];
    if (!s || !s.ders) return;
    return showKategoriler(chatId, s.ders, s.mode, parseInt(data.replace('katpage_', ''), 10));
  }

  if (data === 'seri_bitir') {
    const s = userStates[chatId];
    const count = s ? (s.seriSayisi || 0) : 0;
    delete userStates[chatId];
    return send(chatId, `✅ *Seri bitti!* ${count} soru eklendi.`, mainMenu());
  }

  if (data.startsWith('seri_dgr_')) {
    const letter = data.split('_')[2];
    const s = userStates[chatId];
    if (!s || s.mode !== 'seri' || !s.bekleyenGorsel) return send(chatId, '⚠️ Seri bulunamadı.');
    const dogru = LETTERS.indexOf(letter);
    const d2 = loadQuestions();
    d2.sorular.unshift({
      id: 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
      ders: s.ders, kategori: s.kategori, seviye: s.seviye,
      soru: s.bekleyenSoruMetni || 'Görseldeki soruyu cevapla',
      secenekler: ['A', 'B', 'C', 'D', 'E'],
      dogru: dogru, aciklama: '',
      gorsel: s.bekleyenGorsel,
      eklenme: Date.now(), kaynak: 'telegram-seri'
    });
    saveQuestions(d2);
    s.seriSayisi = (s.seriSayisi || 0) + 1;
    s.bekleyenGorsel = null;
    s.bekleyenSoruMetni = null;
    s.step = 'seri_foto_bekle';
    const pushed = await autoPushToGithub(d2);
    const pushMsg = pushed ? '✅ Gönderildi' : '⚠️ GitHub hatası';
    return send(chatId,
      `✅ *Soru #${s.seriSayisi} kaydedildi!* (${letter})\n${pushMsg}\n\n` +
      `📸 *Sonraki fotoğrafı gönder.*\n_Bitirmek için /bitir_`,
      { reply_markup: { inline_keyboard: [[{ text: '🏁 Bitir', callback_data: 'seri_bitir' }]] } });
  }

  if (data.startsWith('edit_')) return editMenu(chatId, parseInt(data.replace('edit_', ''), 10));
  if (data.startsWith('edq_')) {
    const idx = parseInt(data.replace('edq_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'soru', idx, step: 'edit_input' };
    return send(chatId, `📝 *Yeni soru metnini yaz:*`);
  }
  if (data.startsWith('edopt_')) {
    const idx = parseInt(data.replace('edopt_', ''), 10);
    const qq = loadQuestions().sorular[idx];
    if (!qq) return send(chatId, '❌ Bulunamadı.');
    let t = `🔤 *Mevcut seçenekler:*\n\n`;
    qq.secenekler.forEach((s, i) => { t += `${LETTERS[i]}) ${s}\n`; });
    userStates[chatId] = { mode: 'edit', field: 'secenekler', idx, step: 'secenek', secenekler: [], secenekIdx: 0 };
    return send(chatId, t + `\n\n🔤 *A* seçeneğini yaz:`);
  }
  if (data.startsWith('eddgr_')) {
    const idx = parseInt(data.replace('eddgr_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'dogru', idx, step: 'edit_dogru' };
    return send(chatId, `✅ *Yeni doğru cevap:*`, {
      reply_markup: { inline_keyboard: [[
        { text: 'A', callback_data: 'edsetdgr_A_' + idx },
        { text: 'B', callback_data: 'edsetdgr_B_' + idx },
        { text: 'C', callback_data: 'edsetdgr_C_' + idx },
        { text: 'D', callback_data: 'edsetdgr_D_' + idx },
        { text: 'E', callback_data: 'edsetdgr_E_' + idx }
      ]] }
    });
  }
  if (data.startsWith('edsetdgr_')) {
    const parts = data.split('_');
    return saveEdit(chatId, parseInt(parts[2], 10), { dogru: LETTERS.indexOf(parts[1]) }, 'Doğru cevap');
  }
  if (data.startsWith('edack_')) {
    const idx = parseInt(data.replace('edack_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'aciklama', idx, step: 'edit_input' };
    return send(chatId, `💬 *Yeni açıklamayı yaz* (_yok_ = boş):`);
  }
  if (data.startsWith('edgrs_')) {
    const idx = parseInt(data.replace('edgrs_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'gorsel', idx, step: 'gorsel_bekle' };
    return send(chatId, `🖼 *Yeni görseli gönder* (_sil_ = kaldır):`);
  }
  if (data.startsWith('edcat_')) {
    const idx = parseInt(data.replace('edcat_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'kategori', idx, step: 'edit_input' };
    return send(chatId, `📚 *Yeni kategori adını yaz:*`);
  }

  if (data === 'kat_yeni') {
    userStates[chatId].step = 'kategori';
    return send(chatId, `📂 Yeni kategori adını yaz:`);
  }
  if (data.startsWith('ders_')) {
    const ders = data.replace('ders_', '');
    const prev = userStates[chatId] || {};
    userStates[chatId] = {
      step: 'kategori', mode: prev.mode || 'add', ders,
      seriSayisi: prev.seriSayisi || 0
    };
    return showKategoriler(chatId, ders, prev.mode || 'add', 0);
  }
  if (data.startsWith('kat_')) {
    const kat = data.replace('kat_', '');
    userStates[chatId].kategori = kat;
    userStates[chatId].step = 'seviye';
    return send(chatId, `✅ Kategori: *${kat}*\n\n🎓 Seviye seç:`, {
      reply_markup: { inline_keyboard: SEVIYELER.map(s => [{ text: s, callback_data: 'seviye_' + s }]) }
    });
  }
  if (data.startsWith('seviye_')) {
    const s = userStates[chatId];
    s.seviye = data.replace('seviye_', '');
    if (s.mode === 'seri') {
      s.step = 'seri_foto_bekle';
      return send(chatId,
        `✅ *${s.ders}* • *${s.kategori}* • *${s.seviye}*\n\n` +
        `📸 *Şimdi ilk fotoğrafı gönder.*\n_Bitirmek için: /bitir_`,
        { reply_markup: { inline_keyboard: [[{ text: '🏁 Bitir', callback_data: 'seri_bitir' }]] } });
    }
    if (s.mode === 'anket') {
      s.step = 'anket_bekle';
      return send(chatId,
        `✅ Seviye: *${s.seviye}*\n\n📊 *Quiz tipi anketi gönder.*`,
        { reply_markup: { inline_keyboard: [[{ text: '❌ İptal', callback_data: 'home' }]] } });
    }
    s.step = 'soru';
    return send(chatId, `✅ Seviye: *${s.seviye}*\n\n📝 Soru metnini yaz:`);
  }
  if (data.startsWith('dogru_')) {
    userStates[chatId].dogru = LETTERS.indexOf(data.replace('dogru_', ''));
    userStates[chatId].step = 'aciklama';
    return send(chatId, `✅ Doğru: *${data.replace('dogru_', '')}*\n\n💬 Açıklama (_yok_ = atla):`);
  }
  if (data === 'gorsel_evet') {
    userStates[chatId].prevStep = 'aciklama';
    userStates[chatId].step = 'gorsel_bekle';
    return send(chatId, `📸 *Görsel Bekleniyor*\n\nFotoğrafı gönder.`);
  }
  if (data === 'gorsel_hayir') return finish(chatId);
}

/* ═══════════ METİN ═══════════ */
async function handleText(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates[chatId];

  if (text.startsWith('/start')) {
    userStates[chatId] = { step: 'idle' };
    return send(chatId, `👋 *KPSS BilgiMatik Botu*\n\n/soru ile soru ekle!`, mainMenu());
  }
  if (text.startsWith('/soru')) return startFlow(chatId);
  if (text.startsWith('/toplu')) return startBulk(chatId);
  if (text.startsWith('/anket')) return startAnket(chatId);
  if (text.startsWith('/seri')) return startSeri(chatId);
  if (text.startsWith('/bitir')) {
    if (state && state.mode === 'seri') {
      const count = state.seriSayisi || 0;
      delete userStates[chatId];
      return send(chatId, `✅ *Seri bitti!* ${count} soru eklendi.`, mainMenu());
    }
    return send(chatId, '⚠️ Aktif seri yok.');
  }
  if (text.startsWith('/listele')) return showQuestions(chatId, 0);
  if (text.startsWith('/yardim')) return sendHelp(chatId);
  if (text.startsWith('/istatistik')) return sendStats(chatId);
  if (text.startsWith('/iptal')) { delete userStates[chatId]; return send(chatId, '❌ İptal.', mainMenu()); }
  if (text.startsWith('/gorsel')) {
    if (!state || state.step === 'idle') return send(chatId, '⚠️ Önce /soru yaz.');
    state.prevStep = state.step;
    state.step = 'gorsel_bekle';
    return send(chatId, `📸 Görsel modu.`);
  }

  if (!state) return;
  if (state.step === 'bulk_input') return handleBulkInput(chatId, text);

  if (state.mode === 'edit' && state.step === 'edit_input') {
    const value = text;
    if (state.field === 'aciklama' && value.toLowerCase() === 'yok') {
      return saveEdit(chatId, state.idx, { aciklama: '' }, 'Açıklama');
    }
    return saveEdit(chatId, state.idx, { [state.field]: value },
      state.field === 'soru' ? 'Soru metni' :
      state.field === 'aciklama' ? 'Açıklama' :
      state.field === 'kategori' ? 'Kategori' : 'Alan');
  }
  if (state.mode === 'edit' && state.field === 'secenekler' && state.step === 'secenek') {
    state.secenekler.push(text);
    state.secenekIdx++;
    if (state.secenekIdx < 5) {
      return send(chatId, `✅ *${LETTERS[state.secenekIdx - 1]}* → sonraki:`);
    }
    return saveEdit(chatId, state.idx, { secenekler: state.secenekler }, 'Seçenekler');
  }
  if (state.mode === 'edit' && state.field === 'gorsel' && state.step === 'gorsel_bekle') {
    if (text.toLowerCase() === 'sil') return saveEdit(chatId, state.idx, { gorsel: null }, 'Görsel kaldırıldı');
    return send(chatId, `⚠️ Fotoğraf gönder veya _sil_ yaz.`);
  }

  switch (state.step) {
    case 'kategori':
      state.kategori = text;
      state.step = 'seviye';
      return send(chatId, `✅ Kategori: *${text}*\n\n🎓 Seviye seç:`, {
        reply_markup: { inline_keyboard: SEVIYELER.map(s => [{ text: s, callback_data: 'seviye_' + s }]) }
      });
    case 'soru':
      state.soru = text;
      state.step = 'secenek';
      state.secenekler = [];
      state.secenekIdx = 0;
      return send(chatId, `✅ Soru kaydedildi.\n\n🔤 *A* seçeneğini yaz (_"atla" = görselli_):`);
    case 'secenek':
      if (text.toLowerCase() === 'atla' || text.toLowerCase() === 'skip') {
        while (state.secenekler.length < 5) state.secenekler.push(LETTERS[state.secenekler.length]);
        state.step = 'dogru';
        return send(chatId, `✅ *Şıklar A B C D E*\n\n✔️ *Doğru cevap?*`, {
          reply_markup: { inline_keyboard: [[
            { text: 'A', callback_data: 'dogru_A' }, { text: 'B', callback_data: 'dogru_B' },
            { text: 'C', callback_data: 'dogru_C' }, { text: 'D', callback_data: 'dogru_D' },
            { text: 'E', callback_data: 'dogru_E' }
          ]] }
        });
      }
      state.secenekler.push(text);
      state.secenekIdx++;
      if (state.secenekIdx < 5) {
        return send(chatId, `✅ *${LETTERS[state.secenekIdx - 1]}* → *${LETTERS[state.secenekIdx]}* yaz:`);
      }
      state.step = 'dogru';
      return send(chatId, `✅ Tüm şıklar alındı.\n\n✔️ *Doğru cevap?*`, {
        reply_markup: { inline_keyboard: [[
          { text: 'A', callback_data: 'dogru_A' }, { text: 'B', callback_data: 'dogru_B' },
          { text: 'C', callback_data: 'dogru_C' }, { text: 'D', callback_data: 'dogru_D' },
          { text: 'E', callback_data: 'dogru_E' }
        ]] }
      });
    case 'aciklama':
      state.aciklama = text.toLowerCase() === 'yok' ? '' : text;
      return send(chatId, `📸 *Görsel eklemek ister misin?*`, {
        reply_markup: { inline_keyboard: [[
          { text: '📷 Evet', callback_data: 'gorsel_evet' },
          { text: '⏭ Hayır', callback_data: 'gorsel_hayir' }
        ]] }
      });
    case 'gorsel_bekle':
      return send(chatId, `⚠️ Lütfen *fotoğraf* gönder.`);
    case 'seri_foto_bekle':
      return send(chatId, `⚠️ Lütfen *fotoğraf* gönder. (_/bitir_ ile bitir)`);
    case 'anket_bekle':
      return send(chatId, `⚠️ Anket gönder.`);
  }
}

/* ═══════════ FOTO ═══════════ */
async function handlePhoto(msg) {
  const chatId = msg.chat.id;
  const state = userStates[chatId];

  if (state && state.step === 'seri_foto_bekle') {
    const photo = msg.photo[msg.photo.length - 1];
    const url = await getFileUrl(photo.file_id);
    if (!url) return send(chatId, '❌ Görsel alınamadı.');
    state.bekleyenGorsel = url;
    state.bekleyenSoruMetni = msg.caption || null;
    return send(chatId, `📸 *Fotoğraf alındı.*\n\n✔️ *Doğru cevap?*`, {
      reply_markup: { inline_keyboard: [
        [{ text: 'A', callback_data: 'seri_dgr_A' }, { text: 'B', callback_data: 'seri_dgr_B' },
         { text: 'C', callback_data: 'seri_dgr_C' }, { text: 'D', callback_data: 'seri_dgr_D' },
         { text: 'E', callback_data: 'seri_dgr_E' }],
        [{ text: '🏁 Bitir', callback_data: 'seri_bitir' }]
      ] } });
  }

  if (!state || state.step !== 'gorsel_bekle') return;
  const photo = msg.photo[msg.photo.length - 1];
  const url = await getFileUrl(photo.file_id);
  if (!url) return send(chatId, '❌ Görsel alınamadı.');

  if (state.mode === 'edit' && state.field === 'gorsel') {
    return saveEdit(chatId, state.idx, { gorsel: url }, 'Görsel');
  }

  state.gorsel = url;
  const back = state.prevStep || 'aciklama';
  state.prevStep = null;
  if (back === 'aciklama') {
    await send(chatId, '✅ Görsel kaydedildi.');
    return finish(chatId);
  }
  state.step = back;
  send(chatId, `✅ Görsel kaydedildi.`);
}

/* ═══════════ ROUTER ═══════════ */
async function handleUpdate(update) {
  if (update.message && update.message.chat && !adminTelegramOnly(update.message.chat.id)) {
    return;
  }
  if (update.callback_query && update.callback_query.message && !adminTelegramOnly(update.callback_query.message.chat.id)) {
    return;
  }
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message && update.message.poll) return handlePoll(update.message);
  if (update.message && update.message.text) return handleText(update.message);
  if (update.message && update.message.photo) return handlePhoto(update.message);
}

/* ═══════════ POLLING ═══════════ */
let offset = 0;
async function poll() {
  console.log('🤖 Bot çalışıyor...');
  while (true) {
    try {
      const res = await tg('getUpdates', { offset, timeout: 30 });
      if (res && res.ok && res.result.length) {
        for (const u of res.result) {
          offset = u.update_id + 1;
          handleUpdate(u).catch(e => console.error('Handler:', e.message));
        }
      }
    } catch (e) {
      console.error('Poll:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

if (!TELEGRAM_TOKEN) { console.log('❌ TELEGRAM_TOKEN yok'); process.exit(1); }
if (!GITHUB_TOKEN) { console.log('❌ GITHUB_TOKEN yok'); process.exit(1); }

initFromGithub().then(() => {
  poll();
});

const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  handleAdminApi(req, res).catch(e => {
    console.error('Admin API:', e.message);
    if (!res.headersSent) jsonRes(req, res, 500, { ok: false, error: 'Sunucu hatası.' });
  });
}).listen(PORT, () => {
  console.log(`🌐 HTTP ${PORT} portunda`);
  console.log(`🔐 Admin panel API: ${ADMIN_PASSWORD ? 'hazır' : 'ADMIN_PASSWORD eksik'}`);
  console.log(`🤖 Telegram admin: ${ADMIN_TELEGRAM_ID ? 'kilitli' : 'ADMIN_TELEGRAM_ID eksik'}`);
});
