// bot.js — KPSS BilgiMatik Telegram Bot
// GitHub API ile otomatik push + görsel destekli
const fs = require('fs');
const path = require('path');

// ⚠️ BURAYA KENDİ BOT TOKENİNİ YAZ
const TELEGRAM_TOKEN = '8996849772:AAGT8m9pcPybVgdLtcacYr09JzYX30GxgkQ';
const TELEGRAM_API = `https://api.telegram.org/bot${TELEGRAM_TOKEN}`;

// ⚠️ BURAYA KENDİ GITHUB TOKENİNİ YAZ
const GITHUB_TOKEN = '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';
const GITHUB_OWNER = 'vetatlas';
const GITHUB_REPO = 'kpss-tarih-sorubankasi';
const GITHUB_FILE = 'data/sorular.json';

const DATA_FILE = path.join(__dirname, 'data', 'sorular.json');
const userStates = {};

const DERSLER = ['Tarih', 'Coğrafya', 'Vatandaşlık', 'Türkçe', 'Matematik', 'Güncel'];
const SEVIYELER = ['Ortaöğretim', 'Önlisans', 'Lisans'];
const LETTERS = 'ABCDE';

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

function stepName(state) {
  switch (state.step) {
    case 'ders': return 'ders seçimi';
    case 'kategori': return 'kategori girişi';
    case 'seviye': return 'seviye seçimi';
    case 'soru': return 'soru metni';
    case 'secenek': return `şık ${LETTERS[state.secenekIdx]}`;
    case 'dogru': return 'doğru cevap seçimi';
    case 'aciklama': return 'açıklama';
    default: return 'bilinmeyen';
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
    [{ text: '📊 İstatistik', callback_data: 'stats' }, { text: '❓ Yardım', callback_data: 'help' }]
  ] } };
}

/* ═══════════ OTOMATİK GITHUB PUSH (API) ═══════════ */
async function autoPushToGithub(data) {
  try {
    const content = JSON.stringify(data, null, 2);
    const encodedContent = Buffer.from(content).toString('base64');

    // Önce mevcut dosyanın sha'sını al (güncelleme için gerekli)
    let sha = null;
    const getRes = await fetch(
      `https://api.github.com/repos/${GITHUB_OWNER}/${GITHUB_REPO}/contents/${GITHUB_FILE}`,
      { headers: { 'Authorization': `token ${GITHUB_TOKEN}`, 'User-Agent': 'Koyeb-Bot' } }
    );
    if (getRes.ok) {
      const fileInfo = await getRes.json();
      sha = fileInfo.sha;
    }

    // Dosyayı oluştur veya güncelle
    const body = {
      message: `Bot: ${data.sorular.length}. soru eklendi`,
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
          'User-Agent': 'Koyeb-Bot'
        },
        body: JSON.stringify(body)
      }
    );

    if (!putRes.ok) {
      const err = await putRes.text();
      console.error('GitHub API hatası:', err);
      return false;
    }
    console.log(`✅ GitHub'a push edildi (${data.sorular.length} soru)`);
    return true;
  } catch (e) {
    console.error('Push hatası:', e.message);
    return false;
  }
}

/* ═══════════ SORU AKIŞI ═══════════ */
function startFlow(chatId) {
  userStates[chatId] = { step: 'ders' };
  send(chatId, '📚 *Yeni Soru Ekleme*\n\nHangi ders?', {
    reply_markup: { inline_keyboard: DERSLER.map(d => [{ text: d, callback_data: 'ders_' + d }]) }
  });
}

async function finish(chatId) {
  const s = userStates[chatId];
  if (!s) return;

  const data = loadQuestions();
  const q = {
    id: 'tg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
    ders: s.ders,
    kategori: s.kategori,
    seviye: s.seviye,
    soru: s.soru,
    secenekler: s.secenekler,
    dogru: s.dogru,
    aciklama: s.aciklama || '',
    gorsel: s.gorsel || null,
    eklenme: Date.now(),
    kaynak: 'telegram'
  };

  data.sorular.unshift(q);
  saveQuestions(data);
  delete userStates[chatId];

  // 🚀 Otomatik GitHub API push
  const pushed = await autoPushToGithub(data);
  const pushMsg = pushed ? '✅ Siteye gönderildi' : '⚠️ Otomatik gönderilemedi (GitHub tokenini kontrol et)';

  send(chatId,
    `🎉 *Soru kaydedildi!*\n\n` +
    `📚 Ders: ${q.ders}\n` +
    `📂 Kategori: ${q.kategori}\n` +
    `🎓 Seviye: ${q.seviye}\n` +
    `✔️ Doğru: ${LETTERS[q.dogru]}\n` +
    `🖼 Görsel: ${q.gorsel ? '✅' : '—'}\n\n` +
    `${pushMsg}\n` +
    `📊 Toplam *${data.sorular.length}* soru`,
    mainMenu());
}

async function sendHelp(chatId) {
  send(chatId,
    `📖 *Komutlar*\n\n` +
    `*/soru* — Yeni soru ekle\n` +
    `*/gorsel* — Bulunduğun adıma görsel ekle\n` +
    `*/iptal* — İptal et\n` +
    `*/istatistik* — Kaç soru var\n` +
    `*/yardim* — Bu menü\n\n` +
    `💡 Her soru sonunda otomatik olarak siteye gönderilir.`);
}

async function sendStats(chatId) {
  const data = loadQuestions();
  const byD = {};
  const withImg = data.sorular.filter(q => q.gorsel).length;
  data.sorular.forEach(q => { byD[q.ders] = (byD[q.ders] || 0) + 1; });
  let t = `📊 *Toplam ${data.sorular.length} soru*\n🖼 Görselli: ${withImg}\n\n`;
  Object.keys(byD).forEach(d => { t += `• ${d}: ${byD[d]}\n`; });
  send(chatId, t);
}

/* ═══════════ UPDATE HANDLER ═══════════ */
async function handleUpdate(update) {
  if (update.callback_query) {
    const q = update.callback_query;
    const chatId = q.message.chat.id;
    const data = q.data;
    await tg('answerCallbackQuery', { callback_query_id: q.id });

    if (data === 'new_question') return startFlow(chatId);
    if (data === 'help') return sendHelp(chatId);
    if (data === 'stats') return sendStats(chatId);

    if (data.startsWith('ders_')) {
      userStates[chatId].ders = data.replace('ders_', '');
      userStates[chatId].step = 'kategori';
      return send(chatId, `✅ Ders: *${userStates[chatId].ders}*\n\n📂 Kategori yaz:`);
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

  if (update.message && update.message.text) {
    const msg = update.message;
    const chatId = msg.chat.id;
    const text = msg.text;
    const state = userStates[chatId];

    if (text.startsWith('/start')) {
      userStates[chatId] = { step: 'idle' };
      return send(chatId, `👋 *KPSS BilgiMatik Botu*\n\n/soru ile soru ekle!`, mainMenu());
    }
    if (text.startsWith('/soru')) return startFlow(chatId);
    if (text.startsWith('/yardim')) return sendHelp(chatId);
    if (text.startsWith('/istatistik')) return sendStats(chatId);
    if (text.startsWith('/iptal')) {
      delete userStates[chatId];
      return send(chatId, '❌ İptal edildi.', mainMenu());
    }

    if (text.startsWith('/gorsel')) {
      if (!state || state.step === 'idle') return send(chatId, '⚠️ Önce /soru yaz.');
      if (state.step === 'gorsel_bekle') return send(chatId, '📸 Zaten görsel modundayım. Fotoğrafı gönder.');
      state.prevStep = state.step;
      state.step = 'gorsel_bekle';
      return send(chatId, `📸 Görsel modu açıldı.\nKaldığın adım: *${stepName({step: state.prevStep, secenekIdx: state.secenekIdx})}*\n\nFotoğrafı gönder.`);
    }

    if (!state) return;

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
        return send(chatId, `✅ Soru kaydedildi.\n\n🔤 *A* seçeneğini yaz (_/gorsel_ = görsel ekle):`);

      case 'secenek':
        state.secenekler.push(text);
        state.secenekIdx++;
        if (state.secenekIdx < 5) {
          const L = LETTERS[state.secenekIdx];
          return send(chatId, `✅ *${LETTERS[state.secenekIdx - 1]}* kaydedildi.\n\n🔤 *${L}* yaz:`);
        } else {
          state.step = 'dogru';
          return send(chatId, `✅ Tüm şıklar alındı.\n\n✔️ *Doğru cevap?*`, {
            reply_markup: { inline_keyboard: [[
              { text: 'A', callback_data: 'dogru_A' }, { text: 'B', callback_data: 'dogru_B' },
              { text: 'C', callback_data: 'dogru_C' }, { text: 'D', callback_data: 'dogru_D' },
              { text: 'E', callback_data: 'dogru_E' }
            ]] }
          });
        }

      case 'aciklama':
        state.aciklama = text.toLowerCase() === 'yok' ? '' : text;
        return send(chatId, `📸 *Bu soruya görsel eklemek ister misin?*`, {
          reply_markup: { inline_keyboard: [[
            { text: '📷 Evet', callback_data: 'gorsel_evet' },
            { text: '⏭ Hayır, kaydet', callback_data: 'gorsel_hayir' }
          ]] }
        });

      case 'gorsel_bekle':
        return send(chatId, `⚠️ Lütfen *fotoğraf* gönder (metin değil).`);
    }
  }

  if (update.message && update.message.photo) {
    const chatId = update.message.chat.id;
    const state = userStates[chatId];
    if (!state || state.step !== 'gorsel_bekle') return;

    const photo = update.message.photo[update.message.photo.length - 1];
    const url = await getFileUrl(photo.file_id);
    if (!url) return send(chatId, '❌ Görsel alınamadı, tekrar dene.');

    state.gorsel = url;
    const back = state.prevStep || 'aciklama';
    state.prevStep = null;

    if (back === 'aciklama') {
      await send(chatId, '✅ Görsel kaydedildi.');
      return finish(chatId);
    }

    state.step = back;
    send(chatId, `✅ Görsel kaydedildi. Kaldığın yerden devam et (${stepName(state)}):`);
  }
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
          handleUpdate(u).catch(e => console.error('Handler hata:', e.message));
        }
      }
    } catch (e) {
      console.error('Poll hata:', e.message);
      await new Promise(r => setTimeout(r, 3000));
    }
  }
}

if (!TELEGRAM_TOKEN || TELEGRAM_TOKEN === 'BURAYA_TELEGRAM_TOKEN') {
  console.log('❌ Telegram tokenini yaz!');
  process.exit(1);
}
if (!GITHUB_TOKEN || GITHUB_TOKEN === 'BURAYA_GITHUB_TOKEN') {
  console.log('❌ GitHub tokenini yaz!');
  process.exit(1);
}

poll();
