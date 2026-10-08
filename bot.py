import os, json, asyncio, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler
from telegram.constants import ParseMode

veri = {}          # {ders: {konu: [sorular]}}
kullanici_durumu = {}
zamanlayicilar = {}
bekleyen = {}      # yükleme oturumları
TOKEN = os.environ.get("TELEGRAM_TOKEN")
PORT = int(os.environ.get("PORT", 8080))
VARSAYILAN_SURE = 30

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b"OK")
    def log_message(self, *a): pass

def run_http():
    HTTPServer(("0.0.0.0", PORT), HealthHandler).serve_forever()

def harf(i):
    return ["A","B","C","D","E"][i] if i < 5 else str(i+1)

def dogru_index(s):
    if isinstance(s["dogru"], int): return s["dogru"]
    return s["secenekler"].index(s["dogru"])

# ==================== KOMUTLAR ====================
async def start(update, context):
    await update.message.reply_text(
        "👋 <b>KPSS BilgiMatik Bot</b>\n\n"
        "📚 Soru çözmek için /coz\n"
        "📖 Yardım için /yardim",
        parse_mode=ParseMode.HTML
    )

async def yardim(update, context):
    await update.message.reply_text(
        "📖 <b>Komutlar</b>\n\n"
        "/coz — Ders → Konu → Süre → Çöz\n"
        "/icerik — Yüklü ders ve konuları listele\n"
        "/skor — Aktif testteki skorun\n"
        "/iptal — Testi veya yüklemeyi iptal et\n\n"
        "📎 JSON dosyası göndererek soru yükleyebilirsin.",
        parse_mode=ParseMode.HTML
    )

async def icerik(update, context):
    if not veri:
        await update.message.reply_text("Henüz içerik yok.")
        return
    satirlar = ["📚 <b>Yüklü İçerik</b>\n"]
    for ders, konular in veri.items():
        toplam = sum(len(s) for s in konular.values())
        satirlar.append(f"\n📚 <b>{ders}</b> ({toplam} soru)")
        for konu, sorular in konular.items():
            satirlar.append(f"   ├ 📖 {konu} — {len(sorular)} soru")
    await update.message.reply_text("".join(satirlar), parse_mode=ParseMode.HTML)

async def skor(update, context):
    d = kullanici_durumu.get(update.message.from_user.id)
    if not d or "toplam" not in d:
        await update.message.reply_text("Aktif testin yok. /coz yaz.")
        return
    await update.message.reply_text(
        f"📊 <b>{d['ders']} → {d['konu']}</b>\n"
        f"Soru: {d['index']}/{d['toplam']}\n"
        f"✅ {d['dogru']}  ❌ {d['yanlis']}  ⏰ {d['bos']}",
        parse_mode=ParseMode.HTML
    )

async def iptal(update, context):
    uid = update.message.from_user.id
    t = zamanlayicilar.pop(uid, None)
    if t and not t.done(): t.cancel()
    if uid in kullanici_durumu:
        del kullanici_durumu[uid]
        await update.message.reply_text("🛑 Test iptal edildi.")
    elif uid in bekleyen:
        del bekleyen[uid]
        await update.message.reply_text("🛑 Yükleme iptal edildi.")
    else:
        await update.message.reply_text("Aktif işlem yok.")

# ==================== SORU ÇÖZME ====================
async def coz(update, context):
    uid = update.message.from_user.id
    if uid in bekleyen:
        await update.message.reply_text("⚠️ Önce devam eden yükleme işlemini tamamla veya /iptal yaz.")
        return
    if not veri:
        await update.message.reply_text("Henüz soru yüklenmemiş. JSON dosyası gönder.")
        return
    klavye = [[InlineKeyboardButton(f"📚 {ders}", callback_data=f"ders_{i}")]
              for i, ders in enumerate(veri.keys())]
    await update.message.reply_text(
        "🎯 <b>Test Başlat</b>\n\n📚 Ders seç:",
        reply_markup=InlineKeyboardMarkup(klavye),
        parse_mode=ParseMode.HTML
    )

async def ders_secildi(update, context):
    q = update.callback_query; await q.answer()
    i = int(q.data.replace("ders_", ""))
    ders = list(veri.keys())[i]
    konular = list(veri[ders].keys())
    toplam = sum(len(veri[ders][k]) for k in konular)
    klavye = [[InlineKeyboardButton(f"📖 {k} ({len(veri[ders][k])} soru)", callback_data=f"konu_{i}_{j}")]
              for j, k in enumerate(konular)]
    klavye.append([InlineKeyboardButton("⬅️ Geri", callback_data="geri_ders")])
    await q.edit_message_text(
        f"📚 <b>{ders}</b>\n<i>{toplam} soru, {len(konular)} konu</i>\n\n📖 Konu seç:",
        reply_markup=InlineKeyboardMarkup(klavye),
        parse_mode=ParseMode.HTML
    )

async def geri_ders(update, context):
    q = update.callback_query; await q.answer()
    klavye = [[InlineKeyboardButton(f"📚 {d}", callback_data=f"ders_{i}")]
              for i, d in enumerate(veri.keys())]
    await q.edit_message_text("🎯 <b>Test Başlat</b>\n\n📚 Ders seç:",
                              reply_markup=InlineKeyboardMarkup(klavye),
                              parse_mode=ParseMode.HTML)

async def konu_secildi(update, context):
    q = update.callback_query; await q.answer()
    _, di, ki = q.data.split("_")
    di, ki = int(di), int(ki)
    ders = list(veri.keys())[di]
    konu = list(veri[ders].keys())[ki]
    uid = q.from_user.id
    soru_sayisi = len(veri[ders][konu])

    kullanici_durumu[uid] = {"bekleme_ders": ders, "bekleme_konu": konu}

    klavye = [
        [InlineKeyboardButton("⚡ 15 sn", callback_data="sure_15"),
         InlineKeyboardButton("⏱️ 30 sn", callback_data="sure_30")],
        [InlineKeyboardButton("🕐 45 sn", callback_data="sure_45"),
         InlineKeyboardButton("🕐 60 sn", callback_data="sure_60")],
        [InlineKeyboardButton("♾️ Süresiz", callback_data="sure_0")],
        [InlineKeyboardButton("⬅️ Geri", callback_data=f"ders_{di}")],
    ]
    await q.edit_message_text(
        f"🎯 <b>Test Ayarları</b>\n\n"
        f"📚 {ders}\n"
        f"📖 <b>{konu}</b>\n"
        f"📝 {soru_sayisi} soru\n\n"
        f"⏱️ Soru başına süre?",
        reply_markup=InlineKeyboardMarkup(klavye),
        parse_mode=ParseMode.HTML
    )

async def sure_secildi(update, context):
    q = update.callback_query; await q.answer()
    uid = q.from_user.id
    sure = int(q.data.replace("sure_", ""))
    d = kullanici_durumu.get(uid)
    if not d or "bekleme_ders" not in d:
        await q.edit_message_text("Hata: /coz tekrar yaz."); return

    ders, konu = d["bekleme_ders"], d["bekleme_konu"]
    sorular = veri[ders][konu]
    if not sorular:
        await q.edit_message_text("Bu konuda soru yok."); return

    kullanici_durumu[uid] = {
        "ders": ders, "konu": konu, "index": 0,
        "dogru": 0, "yanlis": 0, "bos": 0,
        "toplam": len(sorular), "sure": sure
    }
    sure_txt = f"{sure} sn" if sure > 0 else "süresiz"
    await q.edit_message_text(
        f"🎬 <b>Başlıyor!</b>\n\n"
        f"📚 {ders}\n📖 {konu}\n"
        f"📝 {len(sorular)} soru • ⏱️ {sure_txt}",
        parse_mode=ParseMode.HTML
    )
    await asyncio.sleep(1)
    await soru_gonder(q.message.chat_id, uid, context)

# ==================== SORU GÖSTER ====================
async def soru_gonder(chat_id, uid, context):
    d = kullanici_durumu.get(uid)
    if not d: return
    sorular = veri[d["ders"]][d["konu"]]
    idx = d["index"]
    if idx >= len(sorular):
        await sonuc_goster(chat_id, uid, context); return

    s = sorular[idx]
    yuzde = int(idx / len(sorular) * 10)
    bar = "▰" * yuzde + "▱" * (10 - yuzde)
    oran = int(idx / len(sorular) * 100)
    sure = d.get("sure", VARSAYILAN_SURE)
    sure_txt = f"⏱️ Kalan süre: <b>{sure} sn</b>" if sure > 0 else "♾️ <b>Süresiz</b>"

    metin = (
        f"🎯 <b>KPSS BİLGİMATİK</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📖 <b>{d['konu'].upper()}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        f"📊 <b>Soru {idx+1} / {len(sorular)}</b>   <i>(%{oran})</i>\n"
        f"{bar}\n\n"
        f"✅ <b>{d['dogru']}</b>   ❌ <b>{d['yanlis']}</b>   ⏰ <b>{d['bos']}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        f"❓ <b>{s['soru']}</b>\n\n"
        f"{sure_txt}"
    )
    klavye = [[InlineKeyboardButton(f"{harf(i)})  {opt}", callback_data=f"cv_{i}")]
              for i, opt in enumerate(s["secenekler"])]
    await context.bot.send_message(chat_id, metin,
                                   reply_markup=InlineKeyboardMarkup(klavye),
                                   parse_mode=ParseMode.HTML)

    t = zamanlayicilar.pop(uid, None)
    if t and not t.done(): t.cancel()
    if sure > 0:
        zamanlayicilar[uid] = asyncio.create_task(sure_sayaci(chat_id, uid, context, idx, sure))

async def sure_sayaci(chat_id, uid, context, soru_idx, sure):
    try:
        await asyncio.sleep(sure)
    except asyncio.CancelledError:
        return
    d = kullanici_durumu.get(uid)
    if not d or d["index"] != soru_idx: return
    s = veri[d["ders"]][d["konu"]][soru_idx]
    di = dogru_index(s)
    d["bos"] += 1
    await context.bot.send_message(
        chat_id,
        f"⏰ <b>Süre doldu!</b>\n\n"
        f"✅ Doğru cevap: <b>{harf(di)}) {s['secenekler'][di]}</b>"
        + (f"\n\n📝 <i>{s['aciklama']}</i>" if s.get("aciklama") else ""),
        parse_mode=ParseMode.HTML
    )
    d["index"] += 1
    await asyncio.sleep(2)
    await soru_gonder(chat_id, uid, context)

async def cevap_verildi(update, context):
    q = update.callback_query; await q.answer()
    uid = q.from_user.id
    d = kullanici_durumu.get(uid)
    if not d or "toplam" not in d: return
    t = zamanlayicilar.pop(uid, None)
    if t and not t.done(): t.cancel()

    sec = int(q.data.replace("cv_", ""))
    s = veri[d["ders"]][d["konu"]][d["index"]]
    di = dogru_index(s)
    dogru_metin = s["secenekler"][di]

    if sec == di:
        d["dogru"] += 1
        baslik = f"✅ <b>Doğru!</b>\n<code>━━━━━━━━━━━━━━━━━━━━</code>"
    else:
        d["yanlis"] += 1
        baslik = (f"❌ <b>Yanlış.</b>\n"
                  f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
                  f"✅ Doğru cevap: <b>{harf(di)}) {dogru_metin}</b>")

    acik = f"\n\n📝 <i>{s['aciklama']}</i>" if s.get("aciklama") else ""
    await q.edit_message_text(baslik + acik, parse_mode=ParseMode.HTML)
    d["index"] += 1
    await asyncio.sleep(2)
    await soru_gonder(q.message.chat_id, uid, context)

async def sonuc_goster(chat_id, uid, context):
    d = kullanici_durumu.get(uid)
    if not d: return
    top = d["toplam"]
    basari = int(d["dogru"] / top * 100) if top else 0
    if basari >= 80: rozet = "🏆 Mükemmel!"
    elif basari >= 60: rozet = "👍 İyi!"
    elif basari >= 40: rozet = "📚 Biraz daha çalış"
    else: rozet = "💪 Pes etme!"
    await context.bot.send_message(
        chat_id,
        f"🏁 <b>TEST BİTTİ</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        f"📚 {d['ders']}\n"
        f"📖 <b>{d['konu']}</b>\n\n"
        f"📊 Toplam: <b>{top}</b>\n"
        f"✅ Doğru: <b>{d['dogru']}</b>\n"
        f"❌ Yanlış: <b>{d['yanlis']}</b>\n"
        f"⏰ Süre dolan: <b>{d['bos']}</b>\n\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"🎯 Başarı: <b>%{basari}</b>\n"
        f"{rozet}",
        parse_mode=ParseMode.HTML
    )
    del kullanici_durumu[uid]

# ==================== YÜKLEME AKIŞI ====================
async def dosya_al(update, context):
    doc = update.message.document
    if not doc.file_name.endswith(".json"):
        await update.message.reply_text("Lütfen JSON dosyası gönder.")
        return
    uid = update.message.from_user.id
    if uid in bekleyen:
        await update.message.reply_text("⚠️ Zaten devam eden bir yükleme var. /iptal yaz.")
        return

    file = await context.bot.get_file(doc.file_id)
    content = await file.download_as_bytearray()
    try:
        data = json.loads(content.decode("utf-8"))
        # Beklenen: {"ders": "...", "konu": "...", "sorular": [...]}
        # Ama içerikte ders/konu yoksa da kabul edelim, sadece sorular
        sorular = data.get("sorular", [])
        if not sorular:
            await update.message.reply_text("JSON'da 'sorular' bulunamadı.")
            return

        bekleyen[uid] = {"sorular": sorular, "adim": "ders_sec"}
        await ders_sec_ekrani(update.message.chat_id, uid, context, len(sorular))

    except Exception as e:
        await update.message.reply_text(f"Hata: {e}")

async def ders_sec_ekrani(chat_id, uid, context, soru_sayisi=0, msg_id=None):
    klavye = []
    for i, ders in enumerate(veri.keys()):
        toplam = sum(len(s) for s in veri[ders].values())
        klavye.append([InlineKeyboardButton(f"📚 {ders} ({toplam})", callback_data=f"yk_ders_{i}")])
    klavye.append([InlineKeyboardButton("➕ Yeni Ders Oluştur", callback_data="yk_ders_yeni")])
    klavye.append([InlineKeyboardButton("❌ İptal", callback_data="yk_iptal")])

    metin = (
        f"📦 <b>{soru_sayisi} soru</b> algılandı.\n\n"
        f"📚 Hangi derse ekleyelim?"
    )
    if msg_id:
        try:
            await context.bot.edit_message_text(metin, chat_id=chat_id, message_id=msg_id,
                                                reply_markup=InlineKeyboardMarkup(klavye),
                                                parse_mode=ParseMode.HTML)
            return
        except: pass
    await context.bot.send_message(chat_id, metin,
                                   reply_markup=InlineKeyboardMarkup(klavye),
                                   parse_mode=ParseMode.HTML)

async def konu_sec_ekrani(chat_id, uid, context, msg_id=None):
    b = bekleyen.get(uid)
    if not b: return
    ders = b["ders"]
    konular = list(veri.get(ders, {}).keys())
    klavye = []
    for i, konu in enumerate(konular):
        klavye.append([InlineKeyboardButton(f"📖 {konu} ({len(veri[ders][konu])})",
                                            callback_data=f"yk_konu_{i}")])
    klavye.append([InlineKeyboardButton("➕ Yeni Konu Oluştur", callback_data="yk_konu_yeni")])
    klavye.append([InlineKeyboardButton("⬅️ Geri (Ders Seç)", callback_data="yk_geri_ders")])
    klavye.append([InlineKeyboardButton("❌ İptal", callback_data="yk_iptal")])

    metin = (
        f"📚 Ders: <b>{ders}</b>\n\n"
        f"📖 Hangi konuya ekleyelim?"
    )
    if msg_id:
        try:
            await context.bot.edit_message_text(metin, chat_id=chat_id, message_id=msg_id,
                                                reply_markup=InlineKeyboardMarkup(klavye),
                                                parse_mode=ParseMode.HTML)
            return
        except: pass
    await context.bot.send_message(chat_id, metin,
                                   reply_markup=InlineKeyboardMarkup(klavye),
                                   parse_mode=ParseMode.HTML)

async def onay_ekrani(chat_id, uid, context, msg_id=None):
    b = bekleyen.get(uid)
    if not b: return
    ders, konu, yeni = b["ders"], b["konu"], len(b["sorular"])
    mevcut = len(veri.get(ders, {}).get(konu, []))
    toplam = mevcut + yeni

    metin = (
        f"📋 <b>ÖZET</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📚 Ders: <b>{ders}</b>\n"
        f"📖 Konu: <b>{konu}</b>\n"
        f"📝 Yeni soru: <b>{yeni}</b>\n"
    )
    if mevcut > 0:
        metin += f"📂 Mevcut: {mevcut} soru\n"
        metin += f"➕ <b>Toplam: {toplam} soru</b>\n"
    metin += f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n✅ Onaylıyor musun?"

    klavye = [[
        InlineKeyboardButton("✅ Yükle", callback_data="yk_onayla"),
        InlineKeyboardButton("❌ İptal", callback_data="yk_iptal")
    ]]
    if msg_id:
        try:
            await context.bot.edit_message_text(metin, chat_id=chat_id, message_id=msg_id,
                                                reply_markup=InlineKeyboardMarkup(klavye),
                                                parse_mode=ParseMode.HTML)
            return
        except: pass
    await context.bot.send_message(chat_id, metin,
                                   reply_markup=InlineKeyboardMarkup(klavye),
                                   parse_mode=ParseMode.HTML)

async def yukle_callback(update, context):
    q = update.callback_query; await q.answer()
    uid = q.from_user.id
    b = bekleyen.get(uid)
    data = q.data

    if data == "yk_iptal":
        bekleyen.pop(uid, None)
        await q.edit_message_text("❌ İptal edildi.")
        return

    if not b:
        await q.edit_message_text("Oturum kayboldu. Dosyayı tekrar gönder.")
        return

    # Ders seçimi
    if data == "yk_ders_yeni":
        b["adim"] = "yeni_ders_yaz"
        await q.edit_message_text(
            "✏️ <b>Yeni ders adını yaz:</b>\n\n<i>(Örnek: Tarih, Coğrafya, Vatandaşlık)</i>",
            parse_mode=ParseMode.HTML
        )
        return

    if data.startswith("yk_ders_"):
        i = int(data.replace("yk_ders_", ""))
        ders = list(veri.keys())[i]
        b["ders"] = ders
        b["adim"] = "konu_sec"
        await konu_sec_ekrani(q.message.chat_id, uid, context, q.message.message_id)
        return

    if data == "yk_geri_ders":
        b["adim"] = "ders_sec"
        await ders_sec_ekrani(q.message.chat_id, uid, context,
                              len(b["sorular"]), q.message.message_id)
        return

    # Konu seçimi
    if data == "yk_konu_yeni":
        b["adim"] = "yeni_konu_yaz"
        await q.edit_message_text(
            f"✏️ <b>Yeni konu adını yaz:</b>\n\n"
            f"📚 Ders: <b>{b['ders']}</b>\n"
            f"<i>(Örnek: İnkılap Tarihi, Kurtuluş Savaşı)</i>",
            parse_mode=ParseMode.HTML
        )
        return

    if data.startswith("yk_konu_"):
        i = int(data.replace("yk_konu_", ""))
        ders = b["ders"]
        konu = list(veri[ders].keys())[i]
        b["konu"] = konu
        await onay_ekrani(q.message.chat_id, uid, context, q.message.message_id)
        return

    # Onay
    if data == "yk_onayla":
        ders, konu, sorular = b["ders"], b["konu"], b["sorular"]
        veri.setdefault(ders, {}).setdefault(konu, []).extend(sorular)
        toplam_konu = len(veri[ders][konu])
        del bekleyen[uid]
        await q.edit_message_text(
            f"✅ <b>Başarıyla yüklendi!</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
            f"📚 {ders}\n"
            f"📖 {konu}\n"
            f"📝 Bu konuda toplam: <b>{toplam_konu}</b> soru\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
            f"🎯 Başlamak için /coz",
            parse_mode=ParseMode.HTML
        )
        return

# ==================== METİN (Yeni Ders/Konu) ====================
async def metin_al(update, context):
    uid = update.message.from_user.id
    b = bekleyen.get(uid)
    if not b: return
    adim = b.get("adim")
    text = update.message.text.strip()
    if not text or len(text) > 100:
        return

    if adim == "yeni_ders_yaz":
        b["ders"] = text
        b["adim"] = "konu_sec"
        await konu_sec_ekrani(update.message.chat_id, uid, context)
    elif adim == "yeni_konu_yaz":
        b["konu"] = text
        await onay_ekrani(update.message.chat_id, uid, context)

# ==================== MAIN ====================
def main():
    threading.Thread(target=run_http, daemon=True).start()
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("yardim", yardim))
    app.add_handler(CommandHandler("coz", coz))
    app.add_handler(CommandHandler("skor", skor))
    app.add_handler(CommandHandler("iptal", iptal))
    app.add_handler(CommandHandler("icerik", icerik))
    app.add_handler(CallbackQueryHandler(yukle_callback, pattern="^yk_"))
    app.add_handler(CallbackQueryHandler(sure_secildi, pattern="^sure_"))
    app.add_handler(CallbackQueryHandler(konu_secildi, pattern="^konu_"))
    app.add_handler(CallbackQueryHandler(ders_secildi, pattern="^ders_"))
    app.add_handler(CallbackQueryHandler(geri_ders, pattern="^geri_ders$"))
    app.add_handler(CallbackQueryHandler(cevap_verildi, pattern="^cv_"))
    app.add_handler(MessageHandler(filters.Document.ALL, dosya_al))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, metin_al))
    app.run_polling()

if __name__ == "__main__":
    main()