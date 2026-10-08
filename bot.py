import os, json, asyncio, threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler
from telegram.constants import ParseMode

# ==================== AYARLAR ====================
BOT_ADI = "KPSS Soru Bankası"
TOKEN = os.environ.get("TELEGRAM_TOKEN")
PORT = int(os.environ.get("PORT", 8080))
VARSAYILAN_SURE = 30

# ==================== VERİ ====================
veri = {}              # {ders: {konu: [sorular]}}
kullanici_durumu = {}  # {user_id: test durumu}
zamanlayicilar = {}    # {user_id: asyncio task}
bekleyen = {}          # {user_id: yükleme oturumu}

# ==================== HTTP (Render için) ====================
class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200); self.end_headers()
        self.wfile.write(b"OK")
    def log_message(self, *a): pass

def run_http():
    HTTPServer(("0.0.0.0", PORT), HealthHandler).serve_forever()

# ==================== YARDIMCI ====================
def harf(i):
    return ["A","B","C","D","E"][i] if i < 5 else str(i+1)

def dogru_index(s):
    if isinstance(s["dogru"], int): return s["dogru"]
    return s["secenekler"].index(s["dogru"])

def icerik_ozeti():
    ders_sayisi = len(veri)
    konu_sayisi = sum(len(k) for k in veri.values())
    soru_sayisi = sum(len(s) for kl in veri.values() for s in kl.values())
    return ders_sayisi, konu_sayisi, soru_sayisi

def soru_metni(d, s, idx, sure=None, kalan=None):
    sorular = veri[d["ders"]][d["konu"]]
    yuzde = int(idx / len(sorular) * 10)
    bar = "▰" * yuzde + "▱" * (10 - yuzde)
    oran = int(idx / len(sorular) * 100)
    if sure is None:
        sure = d.get("sure", VARSAYILAN_SURE)
    if sure > 0:
        goster = kalan if kalan is not None else sure
        if goster <= 5:
            sure_txt = f"🔴 <b>Kalan: {goster} sn</b>"
        else:
            sure_txt = f"⏱️ Kalan süre: <b>{goster} sn</b>"
    else:
        sure_txt = "♾️ <b>Süresiz</b>"

    return (
        f"🎓 <b>{BOT_ADI.upper()}</b>\n"
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

def secenek_klavyesi(s):
    return InlineKeyboardMarkup([
        [InlineKeyboardButton(f"{harf(i)})  {opt}", callback_data=f"cv_{i}")]
        for i, opt in enumerate(s["secenekler"])
    ])

def skor_metni(d):
    return (
        f"📊 <b>AKTİF SKOR</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📚 {d['ders']}\n"
        f"📖 {d['konu']}\n\n"
        f"Soru: <b>{d['index']}/{d['toplam']}</b>\n"
        f"✅ Doğru: <b>{d['dogru']}</b>\n"
        f"❌ Yanlış: <b>{d['yanlis']}</b>\n"
        f"⏰ Süre dolan: <b>{d['bos']}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>"
    )

def skor_klavye():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🛑 Testi Bitir", callback_data="menu_iptal")],
        [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
    ])

# ==================== MENÜ ====================
def ana_menu_klavye():
    return InlineKeyboardMarkup([
        [InlineKeyboardButton("🎯 Test Çöz", callback_data="menu_test")],
        [InlineKeyboardButton("📚 İçerik", callback_data="menu_icerik"),
         InlineKeyboardButton("📊 Skorum", callback_data="menu_skor")],
        [InlineKeyboardButton("📤 Soru Yükle", callback_data="menu_yukle"),
         InlineKeyboardButton("❓ Yardım", callback_data="menu_yardim")],
    ])

def ana_menu_metin():
    d, k, s = icerik_ozeti()
    return (
        f"╔══════════════════════════╗\n"
        f"║   🎓 <b>{BOT_ADI.upper()}</b>\n"
        f"╚══════════════════════════╝\n\n"
        f"📊 <b>İçerik Özeti</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📚 Ders: <b>{d}</b>\n"
        f"📖 Konu: <b>{k}</b>\n"
        f"📝 Soru: <b>{s}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        f"👇 Bir işlem seç:"
    )

async def menu(update, context):
    await update.message.reply_text(ana_menu_metin(),
                                    reply_markup=ana_menu_klavye(),
                                    parse_mode=ParseMode.HTML)

async def start(update, context):
    await menu(update, context)

# ==================== MENÜ CALLBACK ====================
async def menu_callback(update, context):
    q = update.callback_query; await q.answer()
    data = q.data

    # --- Ana menü ---
    if data == "menu_ana":
        await q.edit_message_text(ana_menu_metin(),
                                  reply_markup=ana_menu_klavye(),
                                  parse_mode=ParseMode.HTML)
        return

    # --- Test Çöz ---
    if data == "menu_test":
        uid = q.from_user.id
        # Aktif test varsa uyar
        if uid in kullanici_durumu and "toplam" in kullanici_durumu[uid]:
            d = kullanici_durumu[uid]
            await q.edit_message_text(
                f"⚠️ <b>Devam eden bir testin var!</b>\n\n"
                f"📚 {d['ders']}\n"
                f"📖 {d['konu']}\n"
                f"📝 Soru {d['index']}/{d['toplam']}\n\n"
                f"Önce onu bitir veya aşağıdan bitir.",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("▶️ Devam Et", callback_data="menu_devam")],
                    [InlineKeyboardButton("🛑 Testi Bitir", callback_data="menu_iptal")],
                    [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
                ]),
                parse_mode=ParseMode.HTML
            )
            return
        if not veri:
            await q.edit_message_text(
                "📭 <b>Henüz soru yüklenmemiş.</b>\n\n"
                "📤 Soru Yükle butonuyla başla veya bana JSON dosyası gönder.",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
                ]),
                parse_mode=ParseMode.HTML
            )
            return
        klavye = [[InlineKeyboardButton(f"📚 {ders}", callback_data=f"ders_{i}")]
                  for i, ders in enumerate(veri.keys())]
        klavye.append([InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")])
        await q.edit_message_text(
            "🎯 <b>Test Başlat</b>\n\n📚 Ders seç:",
            reply_markup=InlineKeyboardMarkup(klavye),
            parse_mode=ParseMode.HTML
        )
        return

    # --- Devam Et ---
    if data == "menu_devam":
        uid = q.from_user.id
        d = kullanici_durumu.get(uid)
        if not d or "toplam" not in d:
            await q.edit_message_text("Aktif test yok.")
            return
        try:
            s = veri[d["ders"]][d["konu"]][d["index"]]
        except (KeyError, IndexError):
            await q.edit_message_text("Test durumu bozuk. /coz ile yeniden başla.")
            return
        sure = d.get("sure", VARSAYILAN_SURE)
        metin = soru_metni(d, s, d["index"], sure)
        msg = await q.edit_message_text(metin,
                                        reply_markup=secenek_klavyesi(s),
                                        parse_mode=ParseMode.HTML)
        d["msg_id"] = q.message.message_id
        # Zamanlayıcıyı yeniden başlat
        t = zamanlayicilar.pop(uid, None)
        if t and not t.done(): t.cancel()
        if sure > 0:
            zamanlayicilar[uid] = asyncio.create_task(
                sure_sayaci(q.message.chat_id, uid, context, d["index"], sure)
            )
        return

    # --- İçerik ---
    if data == "menu_icerik":
        if not veri:
            await q.edit_message_text(
                "📭 Henüz içerik yok.",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
                ])
            )
            return
        satirlar = ["📚 <b>YÜKLÜ İÇERİK</b>\n<code>━━━━━━━━━━━━━━━━━━━━</code>\n"]
        for ders, konular in veri.items():
            toplam = sum(len(s) for s in konular.values())
            satirlar.append(f"\n📚 <b>{ders}</b>  <i>({toplam} soru)</i>")
            for konu, sorular in konular.items():
                satirlar.append(f"   📖 {konu} — {len(sorular)} soru")
        await q.edit_message_text(
            "".join(satirlar),
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    # --- Skorum ---
    if data == "menu_skor":
        d = kullanici_durumu.get(q.from_user.id)
        if not d or "toplam" not in d:
            await q.edit_message_text(
                "📊 <b>Aktif testin yok.</b>\n\n🎯 Test Çöz ile başla.",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
                ]),
                parse_mode=ParseMode.HTML
            )
            return
        await q.edit_message_text(skor_metni(d),
                                  reply_markup=skor_klavye(),
                                  parse_mode=ParseMode.HTML)
        return

    # --- Testi bitir: onay iste ---
    if data == "menu_iptal":
        uid = q.from_user.id
        d = kullanici_durumu.get(uid)
        if not d or "toplam" not in d:
            await q.edit_message_text("Aktif testin yok.")
            return
        await q.edit_message_text(
            "🛑 <b>Testi bitirmek istediğine emin misin?</b>\n\n"
            f"Şu an: Soru <b>{d['index']}/{d['toplam']}</b>\n"
            f"✅ {d['dogru']}  ❌ {d['yanlis']}  ⏰ {d['bos']}\n\n"
            "<i>Testten çıkarsan skorun kaydedilmeyecek.</i>",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("✅ Evet, bitir", callback_data="menu_iptal_onay")],
                [InlineKeyboardButton("❌ Hayır, devam", callback_data="menu_iptal_vazgec")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    # --- İptal onaylandı ---
    if data == "menu_iptal_onay":
        uid = q.from_user.id
        t = zamanlayicilar.pop(uid, None)
        if t and not t.done(): t.cancel()
        kullanici_durumu.pop(uid, None)
        await q.edit_message_text(
            "🛑 <b>Test bitirildi.</b>\n\nAna menüye dönmek için butona bas.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🏠 Ana Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    # --- İptalden vazgeç: soruya geri dön ---
    if data == "menu_iptal_vazgec":
        uid = q.from_user.id
        d = kullanici_durumu.get(uid)
        if not d or "toplam" not in d:
            await q.edit_message_text("Aktif test yok.")
            return
        try:
            s = veri[d["ders"]][d["konu"]][d["index"]]
        except (KeyError, IndexError):
            await q.edit_message_text("Test durumu bozuk. /coz ile yeniden başla.")
            return
        sure = d.get("sure", VARSAYILAN_SURE)
        metin = soru_metni(d, s, d["index"], sure)
        await q.edit_message_text(metin,
                                  reply_markup=secenek_klavyesi(s),
                                  parse_mode=ParseMode.HTML)
        d["msg_id"] = q.message.message_id
        t = zamanlayicilar.pop(uid, None)
        if t and not t.done(): t.cancel()
        if sure > 0:
            zamanlayicilar[uid] = asyncio.create_task(
                sure_sayaci(q.message.chat_id, uid, context, d["index"], sure)
            )
        return

    # --- Soru Yükle ---
    if data == "menu_yukle":
        await q.edit_message_text(
            "📤 <b>NASIL YÜKLENİR?</b>\n"
            "<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
            "1️⃣ Bana bir <b>.json</b> dosyası gönder\n"
            "2️⃣ İçeriği gösteririm\n"
            "3️⃣ Ders ve konu seçersin\n"
            "4️⃣ ✅ Onayla → yüklenir\n\n"
            "<b>JSON formatı:</b>\n"
            "<code>{\n"
            '  "sorular": [\n'
            '    {\n'
            '      "soru": "...",\n'
            '      "secenekler": ["A", "B", "C", "D"],\n'
            '      "dogru": 0,\n'
            '      "aciklama": "..."\n'
            '    }\n'
            "  ]\n"
            "}</code>",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    # --- Yardım ---
    if data == "menu_yardim":
        await q.edit_message_text(
            f"❓ <b>YARDIM — {BOT_ADI}</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
            f"🎯 <b>Test Çöz</b>\nDers → Konu → Süre → Soru çöz\n\n"
            f"📚 <b>İçerik</b>\nYüklü ders ve konuları listeler\n\n"
            f"📊 <b>Skorum</b>\nAktif testteki anlık skorun\n\n"
            f"📤 <b>Soru Yükle</b>\nJSON dosyası göndererek soru ekle\n\n"
            f"<b>Komutlar</b>\n"
            f"/start — Ana menü\n"
            f"/menu — Ana menü\n"
            f"/coz — Test başlat\n"
            f"/icerik — İçerik listesi\n"
            f"/skor — Anlık skorun\n"
            f"/iptal — Testi bitir (onaylı)",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

# ==================== KOMUT: /coz ====================
async def coz(update, context):
    uid = update.message.from_user.id
    if uid in bekleyen:
        await update.message.reply_text("⚠️ Önce yükleme işlemini tamamla veya /iptal yaz.")
        return
    if uid in kullanici_durumu and "toplam" in kullanici_durumu[uid]:
        d = kullanici_durumu[uid]
        await update.message.reply_text(
            f"⚠️ <b>Devam eden bir testin var!</b>\n\n"
            f"📚 {d['ders']}\n"
            f"📖 {d['konu']}\n"
            f"📝 Soru {d['index']}/{d['toplam']}\n\n"
            f"Önce onu bitir veya aşağıdan devam et.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("▶️ Devam Et", callback_data="menu_devam")],
                [InlineKeyboardButton("🛑 Testi Bitir", callback_data="menu_iptal")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return
    if not veri:
        await update.message.reply_text(
            "📭 Henüz soru yüklenmemiş.\n\n📎 Bir JSON dosyası gönder.",
            parse_mode=ParseMode.HTML
        )
        return
    klavye = [[InlineKeyboardButton(f"📚 {ders}", callback_data=f"ders_{i}")]
              for i, ders in enumerate(veri.keys())]
    klavye.append([InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")])
    await update.message.reply_text(
        "🎯 <b>Test Başlat</b>\n\n📚 Ders seç:",
        reply_markup=InlineKeyboardMarkup(klavye),
        parse_mode=ParseMode.HTML
    )

# ==================== DERS / KONU / SÜRE ====================
async def ders_secildi(update, context):
    q = update.callback_query; await q.answer()
    i = int(q.data.replace("ders_", ""))
    ders = list(veri.keys())[i]
    konular = list(veri[ders].keys())
    toplam = sum(len(veri[ders][k]) for k in konular)
    klavye = [[InlineKeyboardButton(f"📖 {k} ({len(veri[ders][k])})", callback_data=f"konu_{i}_{j}")]
              for j, k in enumerate(konular)]
    klavye.append([InlineKeyboardButton("⬅️ Geri", callback_data="menu_test")])
    await q.edit_message_text(
        f"📚 <b>{ders}</b>\n<i>{toplam} soru • {len(konular)} konu</i>\n\n📖 Konu seç:",
        reply_markup=InlineKeyboardMarkup(klavye),
        parse_mode=ParseMode.HTML
    )

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
        f"🎯 <b>Test Ayarları</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📚 {ders}\n"
        f"📖 <b>{konu}</b>\n"
        f"📝 {soru_sayisi} soru\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
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
        f"🎬 <b>Başlıyor!</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📚 {ders}\n📖 {konu}\n"
        f"📝 {len(sorular)} soru • ⏱️ {sure_txt}",
        parse_mode=ParseMode.HTML
    )
    await asyncio.sleep(1)
    await soru_gonder(q.message.chat_id, uid, context)

# ==================== SORU GÖNDER ====================
async def soru_gonder(chat_id, uid, context):
    d = kullanici_durumu.get(uid)
    if not d: return
    sorular = veri[d["ders"]][d["konu"]]
    idx = d["index"]
    if idx >= len(sorular):
        await sonuc_goster(chat_id, uid, context); return

    s = sorular[idx]
    sure = d.get("sure", VARSAYILAN_SURE)
    metin = soru_metni(d, s, idx, sure)
    msg = await context.bot.send_message(
        chat_id, metin,
        reply_markup=secenek_klavyesi(s),
        parse_mode=ParseMode.HTML
    )
    d["msg_id"] = msg.message_id

    t = zamanlayicilar.pop(uid, None)
    if t and not t.done(): t.cancel()
    if sure > 0:
        zamanlayicilar[uid] = asyncio.create_task(
            sure_sayaci(chat_id, uid, context, idx, sure)
        )

async def sure_sayaci(chat_id, uid, context, soru_idx, sure):
    """Her saniye mesajı günceller — kronometre gibi akar"""
    kalan = sure
    for _ in range(sure):
        await asyncio.sleep(1)
        kalan -= 1
        d = kullanici_durumu.get(uid)
        if not d or d["index"] != soru_idx:
            return
        try:
            s = veri[d["ders"]][d["konu"]][soru_idx]
            metin = soru_metni(d, s, soru_idx, sure, kalan)
            await context.bot.edit_message_text(
                metin, chat_id=chat_id, message_id=d["msg_id"],
                reply_markup=secenek_klavyesi(s),
                parse_mode=ParseMode.HTML
            )
        except Exception:
            pass

    # ---- Süre bitti ----
    d = kullanici_durumu.get(uid)
    if not d or d["index"] != soru_idx: return
    s = veri[d["ders"]][d["konu"]][soru_idx]
    di = dogru_index(s)
    d["bos"] += 1
    try:
        await context.bot.edit_message_text(
            f"⏰ <b>Süre doldu!</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
            f"✅ Doğru: <b>{harf(di)}) {s['secenekler'][di]}</b>"
            + (f"\n\n📝 <i>{s['aciklama']}</i>" if s.get("aciklama") else ""),
            chat_id=chat_id, message_id=d["msg_id"],
            parse_mode=ParseMode.HTML
        )
    except: pass
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
        baslik = "✅ <b>Doğru!</b>\n<code>━━━━━━━━━━━━━━━━━━━━</code>"
    else:
        d["yanlis"] += 1
        baslik = (f"❌ <b>Yanlış.</b>\n"
                  f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
                  f"✅ Doğru: <b>{harf(di)}) {dogru_metin}</b>")

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

    ders = d["ders"]
    try:
        ders_idx = list(veri.keys()).index(ders)
    except ValueError:
        ders_idx = 0

    await context.bot.send_message(
        chat_id,
        f"🏁 <b>TEST BİTTİ</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        f"📚 {d['ders']}\n📖 <b>{d['konu']}</b>\n\n"
        f"📊 Toplam: <b>{top}</b>\n"
        f"✅ Doğru: <b>{d['dogru']}</b>\n"
        f"❌ Yanlış: <b>{d['yanlis']}</b>\n"
        f"⏰ Süre dolan: <b>{d['bos']}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"🎯 Başarı: <b>%{basari}</b>\n{rozet}",
        reply_markup=InlineKeyboardMarkup([
            [InlineKeyboardButton("🔄 Tekrar Çöz", callback_data=f"ders_{ders_idx}")],
            [InlineKeyboardButton("🏠 Ana Menü", callback_data="menu_ana")]
        ]),
        parse_mode=ParseMode.HTML
    )
    del kullanici_durumu[uid]

# ==================== JSON YÜKLEME ====================
async def dosya_al(update, context):
    doc = update.message.document
    if not doc.file_name.endswith(".json"):
        await update.message.reply_text("Lütfen JSON dosyası gönder.")
        return
    uid = update.message.from_user.id
    if uid in bekleyen:
        await update.message.reply_text("⚠️ Zaten devam eden yükleme var. /iptal yaz.")
        return

    file = await context.bot.get_file(doc.file_id)
    content = await file.download_as_bytearray()
    try:
        data = json.loads(content.decode("utf-8"))

        if "sorular" in data and isinstance(data["sorular"], list):
            sorular = data["sorular"]
        elif "dersler" in data:
            sorular = []
            for d in data["dersler"]:
                sorular.extend(d.get("sorular", []))
        else:
            await update.message.reply_text("JSON'da 'sorular' bulunamadı.")
            return

        if not sorular:
            await update.message.reply_text("JSON'da hiç soru yok.")
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
        f"📦 <b>{soru_sayisi} soru</b> algılandı.\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
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
    klavye.append([InlineKeyboardButton("⬅️ Geri (Ders)", callback_data="yk_geri_ders")])
    klavye.append([InlineKeyboardButton("❌ İptal", callback_data="yk_iptal")])

    metin = (
        f"📚 Ders: <b>{ders}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
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
        metin += f"📂 Mevcut: {mevcut} soru\n➕ <b>Toplam: {toplam} soru</b>\n"
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

    if data == "yk_ders_yeni":
        b["adim"] = "yeni_ders_yaz"
        await q.edit_message_text(
            "✏️ <b>Yeni ders adını yaz:</b>\n\n"
            "<i>Örnek: Tarih, Coğrafya, Vatandaşlık</i>",
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

    if data == "yk_konu_yeni":
        b["adim"] = "yeni_konu_yaz"
        await q.edit_message_text(
            f"✏️ <b>Yeni konu adını yaz:</b>\n\n"
            f"📚 Ders: <b>{b['ders']}</b>\n"
            f"<i>Örnek: İnkılap Tarihi, Kurtuluş Savaşı</i>",
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
            f"📝 Toplam: <b>{toplam_konu}</b> soru\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🎯 Test Çöz", callback_data="menu_test")],
                [InlineKeyboardButton("🏠 Ana Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

async def metin_al(update, context):
    uid = update.message.from_user.id
    b = bekleyen.get(uid)
    if not b: return
    adim = b.get("adim")
    text = update.message.text.strip()
    if not text or len(text) > 100: return

    if adim == "yeni_ders_yaz":
        b["ders"] = text
        b["adim"] = "konu_sec"
        await konu_sec_ekrani(update.message.chat_id, uid, context)
    elif adim == "yeni_konu_yaz":
        b["konu"] = text
        await onay_ekrani(update.message.chat_id, uid, context)

# ==================== KOMUTLAR ====================
async def icerik_komut(update, context):
    if not veri:
        await update.message.reply_text("📭 Henüz içerik yok.")
        return
    satirlar = ["📚 <b>YÜKLÜ İÇERİK</b>\n<code>━━━━━━━━━━━━━━━━━━━━</code>\n"]
    for ders, konular in veri.items():
        toplam = sum(len(s) for s in konular.values())
        satirlar.append(f"\n📚 <b>{ders}</b>  <i>({toplam} soru)</i>")
        for konu, sorular in konular.items():
            satirlar.append(f"   📖 {konu} — {len(sorular)} soru")
    await update.message.reply_text("".join(satirlar), parse_mode=ParseMode.HTML)

async def skor_komut(update, context):
    d = kullanici_durumu.get(update.message.from_user.id)
    if not d or "toplam" not in d:
        await update.message.reply_text("📊 Aktif testin yok. /coz yaz.")
        return
    await update.message.reply_text(skor_metni(d),
                                    reply_markup=skor_klavye(),
                                    parse_mode=ParseMode.HTML)

async def iptal_komut(update, context):
    uid = update.message.from_user.id
    # Aktif test varsa onay iste
    if uid in kullanici_durumu and "toplam" in kullanici_durumu[uid]:
        d = kullanici_durumu[uid]
        await update.message.reply_text(
            "🛑 <b>Testi bitirmek istediğine emin misin?</b>\n\n"
            f"Şu an: Soru <b>{d['index']}/{d['toplam']}</b>\n"
            f"✅ {d['dogru']}  ❌ {d['yanlis']}  ⏰ {d['bos']}\n\n"
            "<i>Testten çıkarsan skorun kaydedilmeyecek.</i>",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("✅ Evet, bitir", callback_data="menu_iptal_onay")],
                [InlineKeyboardButton("❌ Hayır, devam", callback_data="menu_iptal_vazgec")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return
    # Yükleme varsa direkt iptal
    if uid in bekleyen:
        del bekleyen[uid]
        await update.message.reply_text("🛑 Yükleme iptal edildi.")
        return
    await update.message.reply_text("Aktif işlem yok.")

# ==================== MAIN ====================
def main():
    threading.Thread(target=run_http, daemon=True).start()
    app = Application.builder().token(TOKEN).build()

    # Komutlar
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("menu", menu))
    app.add_handler(CommandHandler("coz", coz))
    app.add_handler(CommandHandler("yardim", menu))
    app.add_handler(CommandHandler("icerik", icerik_komut))
    app.add_handler(CommandHandler("skor", skor_komut))
    app.add_handler(CommandHandler("iptal", iptal_komut))

    # Callback'ler (sıra önemli - daha spesifik önce)
    app.add_handler(CallbackQueryHandler(menu_callback, pattern="^menu_"))
    app.add_handler(CallbackQueryHandler(yukle_callback, pattern="^yk_"))
    app.add_handler(CallbackQueryHandler(sure_secildi, pattern="^sure_"))
    app.add_handler(CallbackQueryHandler(konu_secildi, pattern="^konu_"))
    app.add_handler(CallbackQueryHandler(ders_secildi, pattern="^ders_"))
    app.add_handler(CallbackQueryHandler(cevap_verildi, pattern="^cv_"))

    # Mesajlar
    app.add_handler(MessageHandler(filters.Document.ALL, dosya_al))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, metin_al))

    app.run_polling()

if __name__ == "__main__":
    main()
