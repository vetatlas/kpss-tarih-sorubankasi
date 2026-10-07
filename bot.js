// bot.js — KPSS BilgiMatik Telegram Bot
// Soru ekleme + silme + düzenleme + GitHub API push + görsel
const fs = require('fs');
const path = require('path');

const TELEGRAM_TOKEN = process.env.TELEGRAM_TOKEN;
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;
const GITHUB_TOKEN = process.env.GITHUB_TOKEN;
const GITHUB_OWNER = 'vetatlas';
const GITHUB_REPO = 'kpss-tarih-sorubankasi';
const GITHUB_FILE = 'data/sorular.json';

const DATA_FILE = path.join(__dirname, 'data', 'sorular.json');
const CACHE_FILE = path.join(__dirname, 'data', 'bot-cache.json');
const userStates = {};

const DERSLER = ['Tarih', 'Coğrafya', 'Vatandaşlık', 'Türkçe', 'Matematik', 'Güncel'];
const SEVIYELER = ['Ortaöğretim', 'Önlisans', 'Lisans'];
const LETTERS = 'ABCDE';

/* ═══════════ YARDIMCILAR ═══════════ */
function loadCache() {
  try {
    if (!fs.existsSync(CACHE_FILE)) return { kategoriler: {} };
    return JSON.parse(fs.readFileSync(CACHE_FILE, 'utf8'));
  } catch (e) { return { kategoriler: {} }; }
}
function saveCache(c) {
  const dir = path.dirname(CACHE_FILE);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(CACHE_FILE, JSON.stringify(c, null, 2));
}
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
function stepName(state) {
  switch (state.step) {
    case 'kategori': return 'kategori';
    case 'soru': return 'soru metni';
    case 'secenek': return `şık ${LETTERS[state.secenekIdx]}`;
    case 'aciklama': return 'açıklama';
    default: return 'adım';
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
    [{ text: '➕ Yeni Soru Ekle', callback_data: 'new_question' }],
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

/* ═══════════ KOMUTLAR ═══════════ */
async function sendHelp(chatId) {
  send(chatId,
    `📖 *Komutlar*\n\n` +
    `*/soru* — Yeni soru ekle\n` +
    `*/listele* — Soruları listele\n` +
    `*/gorsel* — Görsel ekle\n` +
    `*/iptal* — İptal et\n` +
    `*/istatistik* — Kaç soru var\n` +
    `*/yardim* — Bu menü`);
}

async function sendStats(chatId) {
  const data = loadQuestions();
  const byD = {};
  const withImg = data.sorular.filter(q => q.gorsel).length;
  data.sorular.forEach(q => { byD[q.ders] = (byD[q.ders] || 0) + 1; });
  let t = `📊 *Toplam ${data.sorular.length} soru*\n🖼 Görselli: ${withImg}\n\n`;
  Object.keys(byD).forEach(d => { t += `• ${d}: ${byD[d]}\n`; });
  send(chatId, t, mainMenu());
}

/* ═══════════ SORU EKLEME ═══════════ */
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
  if (q.gorsel) text += `\n🖼 Görselli soru`;
  return send(chatId, text, {
    reply_markup: { inline_keyboard: [
      [
        { text: '✏️ Düzenle', callback_data: 'edit_' + idx },
        { text: '🗑 Sil', callback_data: 'del_' + idx }
      ],
      [{ text: '⬅️ Listeye Dön', callback_data: 'manage' }]
    ] }
  });
}

/* ═══════════ SİLME ═══════════ */
function confirmDelete(chatId, idx) {
  const data = loadQuestions();
  const q = data.sorular[idx];
  if (!q) return send(chatId, '❌ Bulunamadı.');
  const short = q.soru.length > 60 ? q.soru.slice(0, 60) + '...' : q.soru;
  return send(chatId, `🗑 *Bu soruyu silmek istediğine emin misin?*\n\n_"${short}"_`, {
    reply_markup: { inline_keyboard: [
      [
        { text: '✅ Evet, sil', callback_data: 'delok_' + idx },
        { text: '❌ Vazgeç', callback_data: 'view_' + idx }
      ]
    ] }
  });
}

async function deleteQuestion(chatId, idx) {
  const data = loadQuestions();
  if (!data.sorular[idx]) return send(chatId, '❌ Bulunamadı.');
  const removed = data.sorular.splice(idx, 1)[0];
  saveQuestions(data);
  const pushed = await autoPushToGithub(data);
  const msg = pushed ? '✅ Siteye gönderildi' : '⚠️ GitHub hatası';
  send(chatId,
    `🗑 *Soru silindi!*\n\n_"${removed.soru.slice(0, 60)}${removed.soru.length > 60 ? '...' : ''}"_\n\n` +
    `${msg}\n📊 Kalan: *${data.sorular.length}* soru`,
    mainMenu());
}

/* ═══════════ DÜZENLEME ═══════════ */
function editMenu(chatId, idx) {
  const data = loadQuestions();
  const q = data.sorular[idx];
  if (!q) return send(chatId, '❌ Bulunamadı.');
  return send(chatId, `✏️ *Soru #${idx + 1} düzenle*\n\nNeyi değiştirmek istersin?`, {
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

/* ═══════════ CALLBACK HANDLER ═══════════ */
async function handleCallback(q) {
  const chatId = q.message.chat.id;
  const data = q.data;
  await tg('answerCallbackQuery', { callback_query_id: q.id });

  // Basit komutlar
  if (data === 'new_question') return startFlow(chatId);
  if (data === 'help') return sendHelp(chatId);
  if (data === 'stats') return sendStats(chatId);
  if (data === 'home') { delete userStates[chatId]; return send(chatId, '🏠 Ana Menü', mainMenu()); }
  if (data === 'manage') { delete userStates[chatId]; return showQuestions(chatId, 0); }
  if (data.startsWith('page_')) return showQuestions(chatId, parseInt(data.replace('page_', ''), 10));
  if (data.startsWith('view_')) return viewQuestion(chatId, parseInt(data.replace('view_', ''), 10));
  if (data.startsWith('delok_')) return deleteQuestion(chatId, parseInt(data.replace('delok_', ''), 10));
  if (data.startsWith('del_')) return confirmDelete(chatId, parseInt(data.replace('del_', ''), 10));

  // Düzenleme
  if (data.startsWith('edit_')) return editMenu(chatId, parseInt(data.replace('edit_', ''), 10));
  if (data.startsWith('edq_')) {
    const idx = parseInt(data.replace('edq_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'soru', idx, step: 'edit_input' };
    return send(chatId, `📝 *Yeni soru metnini yaz:*`);
  }
  if (data.startsWith('edopt_')) {
    const idx = parseInt(data.replace('edopt_', ''), 10);
    const d = loadQuestions();
    const q = d.sorular[idx];
    if (!q) return send(chatId, '❌ Bulunamadı.');
    let t = `🔤 *Mevcut seçenekler:*\n\n`;
    q.secenekler.forEach((s, i) => { t += `${LETTERS[i]}) ${s}\n`; });
    t += `\n5 seçeneği sırayla yaz (her birini ayrı mesaj olarak).`;
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
    const letter = parts[1];
    const idx = parseInt(parts[2], 10);
    return saveEdit(chatId, idx, { dogru: LETTERS.indexOf(letter) }, 'Doğru cevap');
  }
  if (data.startsWith('edack_')) {
    const idx = parseInt(data.replace('edack_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'aciklama', idx, step: 'edit_input' };
    return send(chatId, `💬 *Yeni açıklamayı yaz* (_yok_ = boş bırak):`);
  }
  if (data.startsWith('edgrs_')) {
    const idx = parseInt(data.replace('edgrs_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'gorsel', idx, step: 'gorsel_bekle' };
    return send(chatId, `🖼 *Yeni görseli gönder* (_sil_ yaz = görseli kaldır):`);
  }
  if (data.startsWith('edcat_')) {
    const idx = parseInt(data.replace('edcat_', ''), 10);
    userStates[chatId] = { mode: 'edit', field: 'kategori', idx, step: 'edit_input' };
    return send(chatId, `📚 *Yeni kategori adını yaz:*`);
  }

  // Yeni soru ekleme akışı
  if (data === 'kat_yeni') {
    userStates[chatId].step = 'kategori';
    return send(chatId, `📂 Yeni kategori adını yaz:`);
  }
  if (data.startsWith('ders_')) {
    const ders = data.replace('ders_', '');
    userStates[chatId] = { step: 'kategori', mode: 'add', ders };
    const cache = loadCache();
    const cats = (cache.kategoriler && cache.kategoriler[ders]) || [];
    const buttons = cats.slice(0, 6).map(c => [{ text: '📂 ' + c, callback_data: 'kat_' + c }]);
    buttons.push([{ text: '➕ Yeni kategori yaz', callback_data: 'kat_yeni' }]);
    return send(chatId, `✅ Ders: *${ders}*\n\n📂 Kategori seç veya yeni yaz:`, {
      reply_markup: { inline_keyboard: buttons }
    });
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
    userStates[chatId].seviye = data.replace('seviye_', '');
    userStates[chatId].step = 'soru';
    return send(chatId, `✅ Seviye: *${userStates[chatId].seviye}*\n\n📝 Soru metnini yaz:`);
  }
  if (data.startsWith('dogru_')) {
    userStates[chatId].dogru = LETTERS.indexOf(data.replace('dogru_', ''));
    userStates[chatId].step = 'aciklama';
    return send(chatId, `✅ Doğru: *${data.replace('dogru_', '')}*\n\n💬 Açıklama yaz (_yok_ = atla):`);
  }
  if (data === 'gorsel_evet') {
    userStates[chatId].prevStep = 'aciklama';
    userStates[chatId].step = 'gorsel_bekle';
    return send(chatId, `📸 *Görsel Bekleniyor*\n\nŞimdi fotoğrafı gönder.`);
  }
  if (data === 'gorsel_hayir') return finish(chatId);
}

/* ═══════════ METİN HANDLER ═══════════ */
async function handleText(msg) {
  const chatId = msg.chat.id;
  const text = msg.text;
  const state = userStates[chatId];

  // Komutlar
  if (text.startsWith('/start')) {
    userStates[chatId] = { step: 'idle' };
    return send(chatId, `👋 *KPSS BilgiMatik Botu*\n\n/soru ile soru ekle!`, mainMenu());
  }
  if (text.startsWith('/soru')) return startFlow(chatId);
  if (text.startsWith('/listele')) return showQuestions(chatId, 0);
  if (text.startsWith('/yardim')) return sendHelp(chatId);
  if (text.startsWith('/istatistik')) return sendStats(chatId);
  if (text.startsWith('/iptal')) { delete userStates[chatId]; return send(chatId, '❌ İptal.', mainMenu()); }
  if (text.startsWith('/gorsel')) {
    if (!state || state.step === 'idle') return send(chatId, '⚠️ Önce /soru yaz.');
    state.prevStep = state.step;
    state.step = 'gorsel_bekle';
    return send(chatId, `📸 Görsel modu. Kaldığın: *${stepName(state)}*`);
  }

  if (!state) return;

  // Düzenleme input
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

  // Düzenleme şıklar
  if (state.mode === 'edit' && state.field === 'secenekler' && state.step === 'secenek') {
    state.secenekler.push(text);
    state.secenekIdx++;
    if (state.secenekIdx < 5) {
      const L = LETTERS[state.secenekIdx];
      return send(chatId, `✅ *${LETTERS[state.secenekIdx - 1]}* kaydedildi.\n\n🔤 *${L}* yaz:`);
    }
    return saveEdit(chatId, state.idx, { secenekler: state.secenekler }, 'Seçenekler');
  }

  // Görsel sil (düzenleme modunda)
  if (state.mode === 'edit' && state.field === 'gorsel' && state.step === 'gorsel_bekle') {
    if (text.toLowerCase() === 'sil') {
      return saveEdit(chatId, state.idx, { gorsel: null }, 'Görsel kaldırıldı');
    }
    return send(chatId, `⚠️ Fotoğraf gönder veya _sil_ yaz.`);
  }

  // Yeni soru ekleme
  switch (state.step) {
    case 'kategori':
      state.kategori = text;
      state.step = 'seviye';
      const cache = loadCache();
      if (!cache.kategoriler[state.ders]) cache.kategoriler[state.ders] = [];
      if (!cache.kategoriler[state.ders].includes(text)) {
        cache.kategoriler[state.ders].push(text);
        saveCache(cache);
      }
      return send(chatId, `✅ Kategori: *${text}*\n\n🎓 Seviye seç:`, {
        reply_markup: { inline_keyboard: SEVIYELER.map(s => [{ text: s, callback_data: 'seviye_' + s }]) }
      });
    case 'soru':
      state.soru = text;
      state.step = 'secenek';
      state.secenekler = [];
      state.secenekIdx = 0;
      return send(chatId, `✅ Soru kaydedildi.\n\n🔤 *A* seçeneğini yaz (_/gorsel_ = görsel):`);
    case 'secenek':
      if (text.toLowerCase() === 'atla' || text.toLowerCase() === 'skip') {
        while (state.secenekler.length < 5) {
          state.secenekler.push(LETTERS[state.secenekler.length]);
        }
        state.step = 'dogru';
        return send(chatId, `✅ *Şıklar otomatik (A B C D E)*\n_Görseldeki şıklar kullanılacak._\n\n✔️ *Doğru cevap?*`, {
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
        const L = LETTERS[state.secenekIdx];
        return send(chatId, `✅ *${LETTERS[state.secenekIdx - 1]}* kaydedildi.\n\n🔤 *${L}* yaz (_görselli soru için "atla" yaz_):`);
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
      return send(chatId, `📸 *Bu soruya görsel eklemek ister misin?*`, {
        reply_markup: { inline_keyboard: [[
          { text: '📷 Evet', callback_data: 'gorsel_evet' },
          { text: '⏭ Hayır', callback_data: 'gorsel_hayir' }
        ]] }
      });
    case 'gorsel_bekle':
      return send(chatId, `⚠️ Lütfen *fotoğraf* gönder.`);
  }
}

/* ═══════════ FOTOĞRAF HANDLER ═══════════ */
async function handlePhoto(msg) {
  const chatId = msg.chat.id;
  const state = userStates[chatId];
  if (!state || state.step !== 'gorsel_bekle') return;
  const photo = msg.photo[msg.photo.length - 1];
  const url = await getFileUrl(photo.file_id);
  if (!url) return send(chatId, '❌ Görsel alınamadı.');

  // Düzenleme modunda görsel
  if (state.mode === 'edit' && state.field === 'gorsel') {
    return saveEdit(chatId, state.idx, { gorsel: url }, 'Görsel');
  }

  // Yeni soru ekleme
  state.gorsel = url;
  const back = state.prevStep || 'aciklama';
  state.prevStep = null;
  if (back === 'aciklama') {
    await send(chatId, '✅ Görsel kaydedildi.');
    return finish(chatId);
  }
  state.step = back;
  send(chatId, `✅ Görsel kaydedildi. Kaldığın: *${stepName(state)}*`);
}

/* ═══════════ UPDATE ROUTER ═══════════ */
async function handleUpdate(update) {
  if (update.callback_query) return handleCallback(update.callback_query);
  if (update.message && update.message.text) return handleText(update.message);
  if (update.message && update.message.photo) return handlePhoto(update.message);
}

/* ═══════════ LONG POLLING ═══════════ */
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

poll();

// ─── HTTP server (Render sağlık kontrolü) ───
const http = require('http');
const PORT = process.env.PORT || 3000;
http.createServer((req, res) => {
  res.writeHead(200, { 'Content-Type': 'text/plain' });
  res.end('KPSS BilgiMatik Bot aktif');
}).listen(PORT, () => {
  console.log(`🌐 HTTP ${PORT} portunda`);
});
