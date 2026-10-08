import os
import json
import asyncio
import threading
from http.server import HTTPServer, BaseHTTPRequestHandler
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler

soru_bankasi = {}       # {kategori: [sorular]}
kategoriler = []        # kategori sırası
kullanici_durumu = {}   # {user_id: {...}}
TOKEN = os.environ.get("TELEGRAM_TOKEN")
PORT = int(os.environ.get("PORT", 8080))

class HealthHandler(BaseHTTPRequestHandler):
    def do_GET(self):
        self.send_response(200)
        self.end_headers()
        self.wfile.write(b"Bot calisiyor")
    def log_message(self, *args):
        pass

def run_http():
    HTTPServer(("0.0.0.0", PORT), HealthHandler).serve_forever()

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Merhaba! Soru çözmek için /coz yaz.")

async def coz(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not kategoriler:
        await update.message.reply_text("Henüz soru yüklenmemiş. JSON dosyası gönder.")
        return
    klavye = [[InlineKeyboardButton(k, callback_data=f"kat_{i}")] for i, k in enumerate(kategoriler)]
    await update.message.reply_text("Kategori seç:", reply_markup=InlineKeyboardMarkup(klavye))

async def kategori_secildi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    idx = int(query.data.replace("kat_", ""))
    kategori = kategoriler[idx]
    user_id = query.from_user.id
    sorular = soru_bankasi.get(kategori, [])
    if not sorular:
        await query.edit_message_text("Bu kategoride soru yok.")
        return
    kullanici_durumu[user_id] = {"kategori": kategori, "index": 0}
    await query.edit_message_text(f"📚 {kategori} — {len(sorular)} soru")
    await soru_gonder(query.message.chat_id, user_id, context)

async def soru_gonder(chat_id, user_id, context):
    durum = kullanici_durumu.get(user_id)
    if not durum: return
    sorular = soru_bankasi.get(durum["kategori"])
    idx = durum["index"]
    if idx >= len(sorular):
        await context.bot.send_message(chat_id, "🎉 Tebrikler! Bu kategorideki tüm soruları bitirdin.")
        del kullanici_durumu[user_id]
        return
    soru = sorular[idx]
    klavye = [[InlineKeyboardButton(s, callback_data=f"cevap_{i}")] for i, s in enumerate(soru["secenekler"])]
    await context.bot.send_message(chat_id, f"Soru {idx+1}/{len(sorular)}:\n\n{soru['soru']}", reply_markup=InlineKeyboardMarkup(klavye))

async def cevap_verildi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id
    durum = kullanici_durumu.get(user_id)
    if not durum: return
    secilen_idx = int(query.data.replace("cevap_", ""))
    sorular = soru_bankasi.get(durum["kategori"])
    soru = sorular[durum["index"]]

    # dogru alanı hem index (int) hem metin olabilir
    if isinstance(soru["dogru"], int):
        dogru_idx = soru["dogru"]
    else:
        dogru_idx = soru["secenekler"].index(soru["dogru"])
    dogru_metin = soru["secenekler"][dogru_idx]

    if secilen_idx == dogru_idx:
        mesaj = "✅ Doğru!"
    else:
        mesaj = f"❌ Yanlış.\nDoğru cevap: {dogru_metin}"

    if soru.get("aciklama"):
        mesaj += f"\n\n📝 {soru['aciklama']}"

    await query.edit_message_text(mesaj)
    durum["index"] += 1
    await asyncio.sleep(2)
    await soru_gonder(query.message.chat_id, user_id, context)

async def dosya_al(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc.file_name.endswith('.json'):
        await update.message.reply_text("Lütfen JSON dosyası gönder.")
        return
    file = await context.bot.get_file(doc.file_id)
    content = await file.download_as_bytearray()
    try:
        data = json.loads(content.decode('utf-8'))
        sayi = 0
        # Format 1: dersler (senin format)
        if "dersler" in data:
            for ders in data["dersler"]:
                baslik = ders.get("baslik") or ders.get("id", "Genel")
                ikon = ders.get("ikon", "")
                kat_adi = f"{ikon} {baslik}".strip() if ikon else baslik
                soru_bankasi[kat_adi] = []
                for s in ders.get("sorular", []):
                    soru_bankasi[kat_adi].append(s)
                    sayi += 1
                if kat_adi not in kategoriler:
                    kategoriler.append(kat_adi)
        # Format 2: sorular (basit format)
        elif "sorular" in data:
            for s in data["sorular"]:
                kat = s.get("kategori", "Genel")
                soru_bankasi.setdefault(kat, []).append(s)
                if kat not in kategoriler:
                    kategoriler.append(kat)
                sayi += 1
        else:
            await update.message.reply_text("Tanınmayan JSON formatı.")
            return
        await update.message.reply_text(f"✅ Yüklendi!\n{len(kategoriler)} kategori, {sayi} soru.")
    except Exception as e:
        await update.message.reply_text(f"Hata: {e}")

def main():
    threading.Thread(target=run_http, daemon=True).start()
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("coz", coz))
    app.add_handler(CallbackQueryHandler(kategori_secildi, pattern="^kat_"))
    app.add_handler(CallbackQueryHandler(cevap_verildi, pattern="^cevap_"))
    app.add_handler(MessageHandler(filters.Document.ALL, dosya_al))
    app.run_polling()

if __name__ == "__main__":
    main()
