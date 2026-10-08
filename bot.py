import os
import json
import asyncio
from telegram import Update, InlineKeyboardButton, InlineKeyboardMarkup
from telegram.ext import Application, CommandHandler, MessageHandler, filters, ContextTypes, CallbackQueryHandler

soru_bankasi = {}
kullanici_durumu = {}
TOKEN = os.environ.get("TELEGRAM_TOKEN")

async def start(update: Update, context: ContextTypes.DEFAULT_TYPE):
    await update.message.reply_text("Merhaba! Soru çözmek için /coz yaz.")

async def coz(update: Update, context: ContextTypes.DEFAULT_TYPE):
    if not soru_bankasi:
        await update.message.reply_text("Henüz soru yüklenmemiş.")
        return
    klavye = [[InlineKeyboardButton(k, callback_data=f"kat_{k}")] for k in soru_bankasi.keys()]
    await update.message.reply_text("Kategori seç:", reply_markup=InlineKeyboardMarkup(klavye))

async def kategori_secildi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    kategori = query.data.replace("kat_", "")
    user_id = query.from_user.id
    sorular = soru_bankasi.get(kategori, [])
    if not sorular:
        await query.edit_message_text("Bu kategoride soru yok.")
        return
    kullanici_durumu[user_id] = {"kategori": kategori, "index": 0}
    await soru_gonder(query.message.chat_id, user_id, context)

async def soru_gonder(chat_id, user_id, context):
    durum = kullanici_durumu.get(user_id)
    if not durum: return
    sorular = soru_bankasi.get(durum["kategori"])
    idx = durum["index"]
    if idx >= len(sorular):
        await context.bot.send_message(chat_id, "Tebrikler! Kategori bitti.")
        del kullanici_durumu[user_id]
        return
    soru = sorular[idx]
    klavye = [[InlineKeyboardButton(s, callback_data=f"cevap_{s}")] for s in soru["secenekler"]]
    await context.bot.send_message(chat_id, f"Soru {idx+1}: {soru['soru']}", reply_markup=InlineKeyboardMarkup(klavye))

async def cevap_verildi(update: Update, context: ContextTypes.DEFAULT_TYPE):
    query = update.callback_query
    await query.answer()
    user_id = query.from_user.id
    durum = kullanici_durumu.get(user_id)
    if not durum: return
    secilen = query.data.replace("cevap_", "")
    sorular = soru_bankasi.get(durum["kategori"])
    soru = sorular[durum["index"]]
    dogru = soru["dogru"]
    if secilen == dogru:
        await query.edit_message_text("✅ Doğru!")
    else:
        await query.edit_message_text(f"❌ Yanlış. Doğru: {dogru}")
    durum["index"] += 1
    await asyncio.sleep(1)
    await soru_gonder(query.message.chat_id, user_id, context)

async def dosya_al(update: Update, context: ContextTypes.DEFAULT_TYPE):
    doc = update.message.document
    if not doc.file_name.endswith('.json'):
        await update.message.reply_text("JSON dosyası gönder.")
        return
    file = await context.bot.get_file(doc.file_id)
    content = await file.download_as_bytearray()
    try:
        data = json.loads(content.decode('utf-8'))
        for s in data.get("sorular", []):
            kat = s.get("kategori", "Genel")
            soru_bankasi.setdefault(kat, []).append(s)
        await update.message.reply_text(f"Yüklendi! {len(soru_bankasi)} kategori var.")
    except Exception as e:
        await update.message.reply_text(f"Hata: {e}")

def main():
    app = Application.builder().token(TOKEN).build()
    app.add_handler(CommandHandler("start", start))
    app.add_handler(CommandHandler("coz", coz))
    app.add_handler(CallbackQueryHandler(kategori_secildi, pattern="^kat_"))
    app.add_handler(CallbackQueryHandler(cevap_verildi, pattern="^cevap_"))
    app.add_handler(MessageHandler(filters.Document.ALL, dosya_al))
    app.run_polling()

if __name__ == "__main__":
    main()
