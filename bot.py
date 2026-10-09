import os, json, asyncio, threading, random, hashlib
from http.server import HTTPServer, BaseHTTPRequestHandler
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup, InputPollOption
from telegram.ext import (Application, CommandHandler, MessageHandler, filters,
                          ContextTypes, CallbackQueryHandler, PollAnswerHandler)
from telegram.constants import ParseMode

BOT_ADI = "KPSS Soru Bankası"
TOKEN = os.environ.get("TELEGRAM_TOKEN")
PORT = int(os.environ.get("PORT", 8080))
VARSAYILAN_SURE = 30

ADMIN_IDS = [7132774477]  # ⚠️ KENDİ ID'NI YAZ

veri = {}
kullanici_durumu = {}
zamanlayicilar = {}
bekleyen = {}
son_poll = {}
soru_istatistik = {}

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

def is_admin(uid):
    return uid in ADMIN_IDS

def icerik_ozeti():
    return (len(veri),
            sum(len(k) for k in veri.values()),
            sum(len(s) for kl in veri.values() for s in kl.values()))

def soru_key(s):
    return hashlib.md5(s["soru"].encode("utf-8")).hexdigest()[:16]

def soru_istatistik_satiri(s):
    key = soru_key(s)
    ist = soru_istatistik.get(key, {"dogru": 0, "yanlis": 0})
    toplam = ist["dogru"] + ist["yanlis"]
    if toplam < 3:
        return ""
    yuzde = int(ist["dogru"] / toplam * 100)
    return f"\n📊 <i>Kullanıcıların %{yuzde}'i doğru cevapladı ({toplam} kişi)</i>"

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

def testi_durdur(uid):
    t = zamanlayicilar.pop(uid, None)
    if t and not t.done():
        try: t.cancel()
        except: pass
    son_poll.pop(uid, None)

def ana_menu_klavye(uid=None):
    satirlar = [
        [InlineKeyboardButton("🎯 Test Çöz", callback_data="menu_test")],
        [InlineKeyboardButton("📚 İçerik", callback_data="menu_icerik"),
         InlineKeyboardButton("📊 Skorum", callback_data="menu_skor")],
    ]
    if uid and is_admin(uid):
        satirlar.append([InlineKeyboardButton("🔧 Yönetim", callback_data="menu_admin")])
    satirlar.append([InlineKeyboardButton("❓ Yardım", callback_data="menu_yardim")])
    return InlineKeyboardMarkup(satirlar)

def ana_menu_metin(uid=None):
    d, k, s = icerik_ozeti()
    satir = (
        f"╔══════════════════════════╗\n"
        f"║   🎓 <b>{BOT_ADI.upper()}</b>\n"
        f"╚══════════════════════════╝\n\n"
    )
    if uid and is_admin(uid):
        satir += (
            f"👑 <b>Admin Panelindesin</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
            f"📚 Ders: <b>{d}</b>   📖 Konu: <b>{k}</b>   📝 Soru: <b>{s}</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        )
    else:
        satir += "📚 <b>Hazır olduğunda test çözmeye başla!</b>\n\n"
    satir += "👇 Bir işlem seç:"
    return satir

async def menu(update, context):
    uid = update.message.from_user.id
    await update.message.reply_text(ana_menu_metin(uid),
                                    reply_markup=ana_menu_klavye(uid),
                                    parse_mode=ParseMode.HTML)

async def start(update, context):
    await menu(update, context)

async def menu_callback(update, context):
    q = update.callback_query; await q.answer()
    data = q.data
    uid = q.from_user.id

    if data == "menu_ana":
        testi_durdur(uid)
        kullanici_durumu.pop(uid, None)
        await q.edit_message_text(ana_menu_metin(uid),
                                  reply_markup=ana_menu_klavye(uid),
                                  parse_mode=ParseMode.HTML)
        return

    if data == "menu_test":
        if uid in kullanici_durumu and "toplam" in kullanici_durumu[uid]:
            d = kullanici_durumu[uid]
            await q.edit_message_text(
                f"⚠️ <b>Devam eden bir testin var!</b>\n\n"
                f"📚 {d['ders']}\n📖 {d['konu']}\n"
                f"📝 Soru {d['index']}/{d['toplam']}",
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
                "📭 <b>Henüz içerik yok.</b>",
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

    if data == "menu_devam":
        d = kullanici_durumu.get(uid)
        if not d or "toplam" not in d:
            await q.edit_message_text("Aktif test yok.")
            return
        await q.edit_message_text("▶️ <b>Devam ediliyor...</b>", parse_mode=ParseMode.HTML)
        await asyncio.sleep(1)
        await soru_gonder(q.message.chat_id, uid, context)
        return

    if data == "menu_icerik":
        if not veri:
            await q.edit_message_text(
                "📭 <b>Henüz içerik yok.</b>",
                reply_markup=InlineKeyboardMarkup([
                    [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
                ]),
                parse_mode=ParseMode.HTML
            )
            return
        klavye = []
        for i, ders in enumerate(veri.keys()):
            klavye.append([InlineKeyboardButton(f"📚 {ders}", callback_data=f"ic_ders_{i}")])
        klavye.append([InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")])
        await q.edit_message_text(
            "📚 <b>Dersler</b>\n\nBir ders seç:",
            reply_markup=InlineKeyboardMarkup(klavye),
            parse_mode=ParseMode.HTML
        )
        return

    if data.startswith("ic_ders_"):
        i = int(data.replace("ic_ders_", ""))
        ders = list(veri.keys())[i]
        konular = list(veri[ders].keys())
        klavye = []
        for j, konu in enumerate(konular):
            klavye.append([InlineKeyboardButton(f"📖 {konu}", callback_data=f"ic_konu_{i}_{j}")])
        klavye.append([InlineKeyboardButton("⬅️ Dersler", callback_data="menu_icerik")])
        await q.edit_message_text(
            f"📚 <b>{ders}</b>\n\n📖 Bir konu seç:",
            reply_markup=InlineKeyboardMarkup(klavye),
            parse_mode=ParseMode.HTML
        )
        return

    if data.startswith("ic_konu_"):
        _, di, ki = data.split("_")
        di, ki = int(di), int(ki)
        ders = list(veri.keys())[di]
        konu = list(veri[ders].keys())[ki]
        soru_sayisi = len(veri[ders][konu])
        if is_admin(uid):
            bilgi = f"📝 Toplam <b>{soru_sayisi}</b> soru"
        else:
            bilgi = "📝 Soruları çözmeye hazır mısın?"
        await q.edit_message_text(
            f"📚 <b>{ders}</b>\n"
            f"📖 <b>{konu}</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
            f"{bilgi}",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🎯 Teste Başla", callback_data=f"konu_{di}_{ki}")],
                [InlineKeyboardButton("⬅️ Geri", callback_data=f"ic_ders_{di}")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    if data == "menu_skor":
        d = kullanici_durumu.get(uid)
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

    if data == "menu_iptal":
        d = kullanici_durumu.get(uid)
        if not d or "toplam" not in d:
            await q.edit_message_text("Aktif testin yok.")
            return
        testi_durdur(uid)
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

    if data == "menu_iptal_onay":
        testi_durdur(uid)
        kullanici_durumu.pop(uid, None)
        await q.edit_message_text(
            "🛑 <b>Test bitirildi.</b>",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🏠 Ana Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    if data == "menu_iptal_vazgec":
        d = kullanici_durumu.get(uid)
        if not d or "toplam" not in d:
            await q.edit_message_text("Aktif test yok.")
            return
        await q.edit_message_text("▶️ <b>Devam ediliyor...</b>", parse_mode=ParseMode.HTML)
        await asyncio.sleep(1)
        await soru_gonder(q.message.chat_id, uid, context)
        return

    if data == "menu_admin":
        if not is_admin(uid):
            await q.edit_message_text("🚫 Yetkiniz yok.")
            return
        d, k, s = icerik_ozeti()
        await q.edit_message_text(
            f"🔧 <b>YÖNETİM PANELİ</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
            f"📚 Ders: <b>{d}</b>\n"
            f"📖 Konu: <b>{k}</b>\n"
            f"📝 Soru: <b>{s}</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
            f"📤 Soru yüklemek için bana JSON dosyası gönder.",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("📋 İçerik Detayı", callback_data="admin_icerik")],
                [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    if data == "admin_icerik":
        if not is_admin(uid): return
        if not veri:
            await q.edit_message_text("📭 Henüz içerik yok.")
            return
        satirlar = ["📚 <b>DETAYLI İÇERİK</b>\n<code>━━━━━━━━━━━━━━━━━━━━</code>\n"]
        for ders, konular in veri.items():
            toplam = sum(len(s) for s in konular.values())
            satirlar.append(f"\n📚 <b>{ders}</b>  <i>({toplam} soru)</i>")
            for konu, sorular in konular.items():
                satirlar.append(f"   📖 {konu} — {len(sorular)} soru")
        await q.edit_message_text(
            "".join(satirlar),
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⬅️ Yönetim", callback_data="menu_admin")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

    if data == "menu_yardim":
        await q.edit_message_text(
            f"❓ <b>YARDIM — {BOT_ADI}</b>\n"
            f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
            f"🎯 <b>Test Çöz</b>\nDers → Konu → Süre → Adet → Soru çöz\n\n"
            f"📚 <b>İçerik</b>\nDers ve konuları görüntüle\n\n"
            f"📊 <b>Skorum</b>\nAktif testteki anlık skorun\n\n"
            f"<b>Komutlar</b>\n"
            f"/start — Ana menü\n"
            f"/coz — Test başlat\n"
            f"/skor — Anlık skorun\n"
            f"/iptal — Testi bitir",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return

  async def coz(update, context):
    uid = update.message.from_user.id
    if uid in bekleyen:
        await update.message.reply_text("⚠️ Önce yükleme tamamlansın.")
        return
    if uid in kullanici_durumu and "toplam" in kullanici_durumu[uid]:
        await update.message.reply_text(
            f"⚠️ <b>Devam eden bir testin var!</b>",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("▶️ Devam Et", callback_data="menu_devam")],
                [InlineKeyboardButton("🛑 Testi Bitir", callback_data="menu_iptal")]
            ]),
            parse_mode=ParseMode.HTML
        )
        return
    if not veri:
        await update.message.reply_text("📭 Henüz içerik yok.")
        return
    klavye = [[InlineKeyboardButton(f"📚 {ders}", callback_data=f"ders_{i}")]
              for i, ders in enumerate(veri.keys())]
    klavye.append([InlineKeyboardButton("⬅️ Menü", callback_data="menu_ana")])
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
    klavye = []
    for j, k in enumerate(konular):
        etiket = f"📖 {k}"
        if is_admin(q.from_user.id):
            etiket += f" ({len(veri[ders][k])})"
        klavye.append([InlineKeyboardButton(etiket, callback_data=f"konu_{i}_{j}")])
    klavye.append([InlineKeyboardButton("⬅️ Geri", callback_data="menu_test")])
    await q.edit_message_text(
        f"📚 <b>{ders}</b>\n\n📖 Konu seç:",
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

def adet_klavye(toplam):
    satirlar = []
    secenekler = [n for n in [5, 10, 20, 30, 50, 100] if n < toplam]
    for i in range(0, len(secenekler), 2):
        satir = [InlineKeyboardButton(f"📝 {secenekler[i]} soru", callback_data=f"adet_{secenekler[i]}")]
        if i + 1 < len(secenekler):
            satir.append(InlineKeyboardButton(f"📝 {secenekler[i+1]} soru", callback_data=f"adet_{secenekler[i+1]}"))
        satirlar.append(satir)
    satirlar.append([InlineKeyboardButton(f"📝 Tümü ({toplam} soru)", callback_data="adet_tum")])
    satirlar.append([InlineKeyboardButton("❌ İptal", callback_data="menu_ana")])
    return InlineKeyboardMarkup(satirlar)

async def sure_secildi(update, context):
    q = update.callback_query; await q.answer()
    uid = q.from_user.id
    sure = int(q.data.replace("sure_", ""))
    d = kullanici_durumu.get(uid)
    if not d or "bekleme_ders" not in d:
        await q.edit_message_text("Hata: /coz tekrar yaz."); return
    d["bekleme_sure"] = sure
    ders, konu = d["bekleme_ders"], d["bekleme_konu"]
    toplam = len(veri[ders][konu])
    sure_txt = f"{sure} sn" if sure > 0 else "süresiz"
    await q.edit_message_text(
        f"🎯 <b>Test Ayarları</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📚 {ders}\n"
        f"📖 <b>{konu}</b>\n"
        f"⏱️ {sure_txt}\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        f"📝 Kaç soru çözmek istersin?",
        reply_markup=adet_klavye(toplam),
        parse_mode=ParseMode.HTML
    )

async def adet_secildi(update, context):
    q = update.callback_query; await q.answer()
    uid = q.from_user.id
    adet_str = q.data.replace("adet_", "")
    d = kullanici_durumu.get(uid)
    if not d or "bekleme_sure" not in d:
        await q.edit_message_text("Hata: /coz tekrar yaz."); return

    ders, konu, sure = d["bekleme_ders"], d["bekleme_konu"], d["bekleme_sure"]
    orijinal = veri[ders][konu]
    if not orijinal:
        await q.edit_message_text("Bu konuda soru yok."); return

    if adet_str == "tum":
        adet = len(orijinal)
    else:
        adet = min(int(adet_str), len(orijinal))

    karistirilmis = []
    for s in orijinal:
        s_kopya = dict(s)
        secenekler = list(s["secenekler"])
        dogru_metin = secenekler[dogru_index(s)]
        random.shuffle(secenekler)
        s_kopya["secenekler"] = secenekler
        s_kopya["dogru"] = secenekler.index(dogru_metin)
        karistirilmis.append(s_kopya)
    random.shuffle(karistirilmis)
    secilen = karistirilmis[:adet]

    kullanici_durumu[uid] = {
        "ders": ders, "konu": konu, "index": 0,
        "dogru": 0, "yanlis": 0, "bos": 0,
        "toplam": len(secilen), "sure": sure,
        "sorular": secilen
    }
    sure_txt = f"{sure} sn" if sure > 0 else "süresiz"
    await q.edit_message_text(
        f"🎬 <b>Başlıyor!</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📚 {ders}\n📖 {konu}\n"
        f"📝 {len(secilen)} soru • ⏱️ {sure_txt}\n\n"
        f"<i>🔀 Sorular ve şıklar karıştırıldı</i>",
        parse_mode=ParseMode.HTML
    )
    await asyncio.sleep(1)
    await soru_gonder(q.message.chat_id, uid, context)

async def soru_gonder(chat_id, uid, context):
    d = kullanici_durumu.get(uid)
    if not d: return
    sorular = d["sorular"]
    idx = d["index"]
    if idx >= len(sorular):
        await sonuc_goster(chat_id, uid, context); return

    s = sorular[idx]
    di = dogru_index(s)

    yuzde = int(idx / len(sorular) * 10)
    bar = "▰" * yuzde + "▱" * (10 - yuzde)
    oran = int(idx / len(sorular) * 100)

    ist_satir = soru_istatistik_satiri(s)

    bilgi = (
        f"🎓 <b>{BOT_ADI.upper()}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
        f"📖 <b>{d['konu'].upper()}</b>\n"
        f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n"
        f"📊 <b>Soru {idx+1} / {len(sorular)}</b>   <i>(%{oran})</i>\n"
        f"{bar}\n\n"
        f"✅ <b>{d['dogru']}</b>   ❌ <b>{d['yanlis']}</b>   ⏰ <b>{d['bos']}</b>"
        f"{ist_satir}"
    )

    secenekler = []
    for opt in s["secenekler"]:
        if len(opt) > 100:
            opt = opt[:97] + "..."
        secenekler.append(InputPollOption(text=opt))

    soru_text = s["soru"]
    if len(soru_text) > 300:
        soru_text = soru_text[:297] + "..."

    aciklama = s.get("aciklama", "")
    if aciklama and len(aciklama) > 200:
        aciklama = aciklama[:197] + "..."

    sure = d.get("sure", VARSAYILAN_SURE)
    poll_sure = max(5, min(sure, 600)) if sure > 0 else None

    try:
        await context.bot.send_message(
            chat_id, bilgi,
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🛑 Testi Bitir", callback_data="menu_iptal")]
            ]),
            parse_mode=ParseMode.HTML
        )
        poll_msg = await context.bot.send_poll(
            chat_id=chat_id,
            question=soru_text,
            options=secenekler,
            type="quiz",
            correct_option_id=di,
            is_anonymous=False,
            explanation=aciklama if aciklama else None,
            open_period=poll_sure,
        )
        son_poll[uid] = poll_msg.poll.id

        t = zamanlayicilar.pop(uid, None)
        if t and not t.done():
            try: t.cancel()
            except: pass
        if sure > 0:
            zamanlayicilar[uid] = asyncio.create_task(
                poll_sure_sayaci(chat_id, uid, context, idx, sure)
            )
    except Exception as e:
        await context.bot.send_message(
            chat_id,
            f"⚠️ Anket gönderilemedi: <i>{e}</i>",
            parse_mode=ParseMode.HTML
        )

async def poll_sure_sayaci(chat_id, uid, context, soru_idx, sure):
    try:
        await asyncio.sleep(sure + 1)
    except asyncio.CancelledError:
        return
    d = kullanici_durumu.get(uid)
    if not d or "toplam" not in d: return
    if d["index"] != soru_idx: return
    son_poll.pop(uid, None)
    d["bos"] += 1
    d["index"] += 1
    await asyncio.sleep(1)
    await soru_gonder(chat_id, uid, context)

async def poll_cevap(update, context):
    pa = update.poll_answer
    uid = pa.user.id
    d = kullanici_durumu.get(uid)
    if not d or "toplam" not in d: return

    beklenen = son_poll.get(uid)
    if pa.poll_id != beklenen:
        return
    son_poll.pop(uid, None)

    secilen = pa.option_ids[0] if pa.option_ids else -1
    try:
        s = d["sorular"][d["index"]]
    except (KeyError, IndexError):
        return
    di = dogru_index(s)

    t = zamanlayicilar.pop(uid, None)
    if t and not t.done():
        try: t.cancel()
        except: pass

    key = soru_key(s)
    if key not in soru_istatistik:
        soru_istatistik[key] = {"dogru": 0, "yanlis": 0}
    if secilen == di:
        d["dogru"] += 1
        soru_istatistik[key]["dogru"] += 1
    else:
        d["yanlis"] += 1
        soru_istatistik[key]["yanlis"] += 1

    d["index"] += 1
    await asyncio.sleep(2)
    await soru_gonder(pa.user.id, uid, context)

async def sonuc_goster(chat_id, uid, context):
    testi_durdur(uid)
    d = kullanici_durumu.get(uid)
    if not d: return
    top = d["toplam"]
    basari = int(d["dogru"] / top * 100) if top else 0
    if basari >= 80: rozet = "🏆 Mükemmel!"
    elif basari >= 60: rozet = "👍 İyi!"
    elif basari >= 40: rozet = "📚 Biraz daha çalış"
    else: rozet = "💪 Pes etme!"
    ders = d["ders"]
    try: ders_idx = list(veri.keys()).index(ders)
    except ValueError: ders_idx = 0
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
        parse_mode=ParseMode.HTML)
    kullanici_durumu.pop(uid, None)

async def dosya_al(update, context):
    uid = update.message.from_user.id
    if not is_admin(uid):
        await update.message.reply_text(
            "🚫 <b>Yetkiniz yok.</b>\n\nSoru yükleme sadece adminlere özeldir.",
            parse_mode=ParseMode.HTML)
        return
    doc = update.message.document
    if not doc.file_name.endswith(".json"):
        await update.message.reply_text("Lütfen JSON dosyası gönder.")
        return
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
    metin = (f"📦 <b>{soru_sayisi} soru</b> algılandı.\n"
             f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n📚 Hangi derse ekleyelim?")
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
    metin = (f"📚 Ders: <b>{ders}</b>\n"
             f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n📖 Hangi konuya ekleyelim?")
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
    metin = (f"📋 <b>ÖZET</b>\n<code>━━━━━━━━━━━━━━━━━━━━</code>\n"
             f"📚 Ders: <b>{ders}</b>\n"
             f"📖 Konu: <b>{konu}</b>\n"
             f"📝 Yeni soru: <b>{yeni}</b>\n")
    if mevcut > 0:
        metin += f"📂 Mevcut: {mevcut} soru\n➕ <b>Toplam: {toplam} soru</b>\n"
    metin += f"<code>━━━━━━━━━━━━━━━━━━━━</code>\n\n✅ Onaylıyor musun?"
    klavye = [[InlineKeyboardButton("✅ Yükle", callback_data="yk_onayla"),
               InlineKeyboardButton("❌ İptal", callback_data="yk_iptal")]]
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
    if not is_admin(uid):
        await q.edit_message_text("🚫 Yetkiniz yok.")
        return
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
            "✏️ <b>Yeni ders adını yaz:</b>\n\n<i>Örnek: Tarih, Coğrafya</i>",
            parse_mode=ParseMode.HTML)
        return
    if data.startswith("yk_ders_"):
        i = int(data.replace("yk_ders_", ""))
        b["ders"] = list(veri.keys())[i]
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
            f"✏️ <b>Yeni konu adını yaz:</b>\n\n📚 Ders: <b>{b['ders']}</b>",
            parse_mode=ParseMode.HTML)
        return
    if data.startswith("yk_konu_"):
        i = int(data.replace("yk_konu_", ""))
        b["konu"] = list(veri[b["ders"]].keys())[i]
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
            f"📚 {ders}\n📖 {konu}\n📝 Toplam: <b>{toplam_konu}</b> soru",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("🏠 Ana Menü", callback_data="menu_ana")]
            ]),
            parse_mode=ParseMode.HTML)
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
    if uid in kullanici_durumu and "toplam" in kullanici_durumu[uid]:
        d = kullanici_durumu[uid]
        testi_durdur(uid)
        await update.message.reply_text(
            "🛑 <b>Testi bitirmek istediğine emin misin?</b>\n\n"
            f"✅ {d['dogru']}  ❌ {d['yanlis']}  ⏰ {d['bos']}",
            reply_markup=InlineKeyboardMarkup([
                [InlineKeyboardButton("✅ Evet, bitir", callback_data="menu_iptal_onay")],
                [InlineKeyboardButton("❌ Hayır, devam", callback_data="menu_iptal_vazgec")]
            ]),
            parse_mode=ParseMode.HTML)
        return
    if uid in bekleyen:
        del bekleyen[uid]
        await update.message.reply_text("🛑 Yükleme iptal edildi.")
        return
    await update.message.reply_text("Aktif işlem yok.")

def main():
    threading.Thread(target=run_http, daemon=True).start()
    app = Application.builder().token(TOKEN).build()

    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("menu", menu))
    app.add_handler(CommandHandler("coz", coz))
    app.add_handler(CommandHandler("yardim", menu))
    app.add_handler(CommandHandler("skor", skor_komut))
    app.add_handler(CommandHandler("iptal", iptal_komut))

    app.add_handler(CallbackQueryHandler(menu_callback, pattern="^menu_"))
    app.add_handler(CallbackQueryHandler(yukle_callback, pattern="^yk_"))
    app.add_handler(CallbackQueryHandler(sure_secildi, pattern="^sure_"))
    app.add_handler(CallbackQueryHandler(adet_secildi, pattern="^adet_"))
    app.add_handler(CallbackQueryHandler(konu_secildi, pattern="^konu_"))
    app.add_handler(CallbackQueryHandler(ders_secildi, pattern="^ders_"))
    app.add_handler(PollAnswerHandler(poll_cevap))
    app.add_handler(MessageHandler(filters.Document.ALL, dosya_al))
    app.add_handler(MessageHandler(filters.TEXT & ~filters.COMMAND, metin_al))

    app.run_polling()

if __name__ == "__main__":
    main()
