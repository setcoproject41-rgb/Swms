const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// Konfigurasi dari Environment Variables Vercel
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const token = process.env.TELEGRAM_BOT_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new TelegramBot(token);

module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            const { message, callback_query } = req.body;

            // Handle Tombol Klik (Inline Keyboard Callback)
            if (callback_query) {
                const chatId = callback_query.message.chat.id;
                const data = callback_query.data;

                if (data === 'check_stock') {
                    const { data: mats, error } = await supabase.from('materials').select('*').order('id');
                    if (error) return bot.sendMessage(chatId, "❌ *Gagal mengambil data stok.*", { parse_mode: 'Markdown' });

                    let response = "📊 *LAPORAN STOK MATERIAL*\n";
                    response += "━━━━━━━━━━━━━━━\n\n";

                    let hasStock = false;
                    mats.forEach(m => {
                        if (m.stock > 0) {
                            hasStock = true;
                            response += `🔹 *${m.id}*\n└ 📦 Sisa: \`${m.stock} ${m.unit}\`\n\n`;
                        }
                    });

                    if (!hasStock) response += "_Belum ada stok material tersedia._";

                    response += "━━━━━━━━━━━━━━━\n";
                    response += "🕒 _Update otomatis dari sistem_";

                    const opts = {
                        parse_mode: 'Markdown',
                        reply_markup: {
                            inline_keyboard: [[{ text: '⬅️ Kembali ke Menu Utama', callback_data: 'main_menu' }]]
                        }
                    };
                    return bot.sendMessage(chatId, response, opts);
                }

                if (data === 'main_menu') {
                    return sendMainMenu(chatId);
                }

                if (data === 'how_to_in') {
                    let msg = "📥 *PANDUAN MATERIAL MASUK*\n";
                    msg += "━━━━━━━━━━━━━━━\n\n";
                    msg += "Gunakan format perintah berikut:\n";
                    msg += "`/in [ID_MATERIAL] [JUMLAH] [NAMA]`\n\n";
                    msg += "💡 *Contoh:*\n";
                    msg += "`/in CBL-001 100 Agus` \n\n";
                    msg += "✨ _Sistem akan otomatis menambah stok dan mencatat pengirim._";

                    return bot.sendMessage(chatId, msg, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
                    });
                }

                if (data === 'how_to_out') {
                    let msg = "📤 *PANDUAN MATERIAL KELUAR*\n";
                    msg += "━━━━━━━━━━━━━━━\n\n";
                    msg += "Gunakan format perintah berikut:\n";
                    msg += "`/out [ID_MATERIAL] [JUMLAH] [PENERIMA]`\n\n";
                    msg += "💡 *Contoh:*\n";
                    msg += "`/out CBL-002 50 Budi` \n\n";
                    msg += "⚠️ _Bot akan menolak jika sisa stok tidak mencukupi._";

                    return bot.sendMessage(chatId, msg, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
                    });
                }

                if (data === 'usage_info') {
                    let msg = "ℹ️ *INFORMASI PENGGUNAAN*\n";
                    msg += "━━━━━━━━━━━━━━━\n\n";
                    msg += "🛰 *Status Sistem:* `Online` (Cloud)\n";
                    msg += "📱 *Akses Desktop/HP:* Via Dashboard URL\n";
                    msg += "🤖 *Fungsi Bot:* Monitoring & Quick Input\n\n";
                    msg += "🛠 *Tips Cepat:*\n";
                    msg += "• Klik bursa stok untuk pantau sisa item.\n";
                    msg += "• Gunakan `/menu` untuk memanggil navigasi.\n";
                    msg += "• Gunakan `/stok` untuk list singkat.";

                    return bot.sendMessage(chatId, msg, {
                        parse_mode: 'Markdown',
                        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
                    });
                }

                return res.status(200).send('OK');
            }

            // Handle Pesan Teks
            if (message) {
                const chatId = message.chat.id;
                const text = message.text;

                if (text === '/start' || text === '/menu') {
                    return sendMainMenu(chatId);
                }

                // Perintah Manual /stok (List Singkat)
                if (text === '/stok') {
                    const { data: mats } = await supabase.from('materials').select('*').order('id');
                    let response = "📋 *DAFTAR STOK RINGKAS*\n\n";
                    mats.forEach(m => {
                        if (m.stock > 0) response += `🏷 \`${m.id}\`: *${m.stock} ${m.unit}*\n`;
                    });
                    return bot.sendMessage(chatId, response, { parse_mode: 'Markdown' });
                }

                // Perintah /in ID Jumlah Nama
                if (text?.startsWith('/in ')) {
                    const parts = text.split(' ');
                    if (parts.length < 4) return bot.sendMessage(chatId, "❌ *Format salah!*\nContoh: `/in CBL-001 100 Agus`", { parse_mode: 'Markdown' });

                    const id = parts[1];
                    const qty = parseFloat(parts[2]);
                    const name = parts.slice(3).join(' ');

                    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
                    if (!mat) return bot.sendMessage(chatId, `❌ *ID Material \`${id}\` tidak ditemukan.*`, { parse_mode: 'Markdown' });

                    const newStock = (mat.stock || 0) + qty;
                    await supabase.from('materials').update({ stock: newStock }).eq('id', id);
                    await supabase.from('transactions').insert([{ material_id: id, type: 'in', quantity: qty, person: name + " (Telegram)" }]);

                    let msg = `✅ *INPUT BERHASIL!*\n`;
                    msg += `━━━━━━━━━━━━━━━\n`;
                    msg += `📦 Material: \`${mat.name}\`\n`;
                    msg += `📥 Masuk: \`${qty} ${mat.unit}\`\n`;
                    msg += `📈 Stok Baru: *${newStock} ${mat.unit}*\n`;
                    return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
                }

                // Perintah /out ID Jumlah Nama
                if (text?.startsWith('/out ')) {
                    const parts = text.split(' ');
                    if (parts.length < 4) return bot.sendMessage(chatId, "❌ *Format salah!*\nContoh: `/out CBL-002 50 Budi`", { parse_mode: 'Markdown' });

                    const id = parts[1];
                    const qty = parseFloat(parts[2]);
                    const name = parts.slice(3).join(' ');

                    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
                    if (!mat) return bot.sendMessage(chatId, `❌ *ID Material \`${id}\` tidak ditemukan.*`, { parse_mode: 'Markdown' });
                    if (mat.stock < qty) return bot.sendMessage(chatId, `⚠️ *STOK TIDAK CUKUP!*\nSisa stok: \`${mat.stock} ${mat.unit}\``, { parse_mode: 'Markdown' });

                    const newStock = mat.stock - qty;
                    await supabase.from('materials').update({ stock: newStock }).eq('id', id);
                    await supabase.from('transactions').insert([{ material_id: id, type: 'out', quantity: qty, person: name + " (Telegram)" }]);

                    let msg = `🚀 *OUTPUT BERHASIL!*\n`;
                    msg += `━━━━━━━━━━━━━━━\n`;
                    msg += `📦 Material: \`${mat.name}\`\n`;
                    msg += `📤 Keluar: \`${qty} ${mat.unit}\`\n`;
                    msg += `📉 Sisa Stok: *${newStock} ${mat.unit}*\n`;
                    return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
                }
            }

            res.status(200).send('OK');
        } else {
            res.status(200).send('Bot is running');
        }
    } catch (err) {
        console.error(err);
        res.status(500).send('Error');
    }
};

function sendMainMenu(chatId) {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📊 Bursa Stok Real-time', callback_data: 'check_stock' }],
                [
                    { text: '📥 Barang Masuk', callback_data: 'how_to_in' },
                    { text: '📤 Barang Keluar', callback_data: 'how_to_out' }
                ],
                [
                    { text: 'ℹ️ Informasi Penggunaan', callback_data: 'usage_info' },
                    { text: '🌐 Dashboard Utama', url: 'https://' + (process.env.VERCEL_URL || 'google.com') }
                ]
            ]
        },
        parse_mode: 'Markdown'
    };

    let welcome = "🏪 *WAREHOUSE MONITORING SYSTEM*\n";
    welcome += "━━━━━━━━━━━━━━━\n";
    welcome += "Selamat datang! Saya adalah asisten gudang digital Anda. Monitor dan kelola stok material dalam satu genggaman.\n\n";
    welcome += "👇 *Pilih menu interaktif di bawah:*";

    return bot.sendMessage(chatId, welcome, opts);
}
