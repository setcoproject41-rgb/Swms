const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseKey = process.env.SUPABASE_ANON_KEY;
const token = process.env.TELEGRAM_BOT_TOKEN;

const supabase = createClient(supabaseUrl, supabaseKey);
const bot = new TelegramBot(token);

module.exports = async (req, res) => {
    try {
        if (req.method === 'POST') {
            const { message, callback_query } = req.body;

            if (callback_query) {
                const chatId = callback_query.message.chat.id;
                const data = callback_query.data;

                if (data === 'main_menu') return sendMainMenu(chatId);
                if (data === 'check_stock') return handleCheckStock(chatId);
                if (data === 'usage_info') return handleUsageInfo(chatId);

                // Jalur Masuk (In)
                if (data === 'how_to_in') return showCategories(chatId, 'in');
                if (data.startsWith('cat_in_')) return showMaterials(chatId, data.replace('cat_in_', ''), 'in');
                if (data.startsWith('mat_in_')) return promptTransaction(chatId, data.replace('mat_in_', ''), 'in');

                // Jalur Keluar (Out)
                if (data === 'how_to_out') return showCategories(chatId, 'out');
                if (data.startsWith('cat_out_')) return showMaterials(chatId, data.replace('cat_out_', ''), 'out');
                if (data.startsWith('mat_out_')) return promptTransaction(chatId, data.replace('mat_out_', ''), 'out');

                return res.status(200).send('OK');
            }

            if (message) {
                const chatId = message.chat.id;
                const text = message.text;

                if (text === '/start' || text === '/menu') return sendMainMenu(chatId);
                if (text === '/stok') return handleCheckStock(chatId, true);

                if (text?.startsWith('/in ')) return processTransaction(chatId, text, 'in');
                if (text?.startsWith('/out ')) return processTransaction(chatId, text, 'out');
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

async function sendMainMenu(chatId) {
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📊 Bursa Stok Real-time', callback_data: 'check_stock' }],
                [
                    { text: '📥 Barang Masuk', callback_data: 'how_to_in' },
                    { text: '📤 Barang Keluar', callback_data: 'how_to_out' }
                ],
                [
                    { text: 'ℹ️ Info Penggunaan', callback_data: 'usage_info' },
                    { text: '🌐 Dashboard', url: 'https://' + (process.env.VERCEL_URL || 'google.com') }
                ]
            ]
        },
        parse_mode: 'Markdown'
    };
    const welcome = "🏪 *WAREHOUSE MONITORING*\n━━━━━━━━━━━━━━━\nMonitor stok material dalam satu genggaman.\n\n👇 *Pilih menu di bawah:*";
    return bot.sendMessage(chatId, welcome, opts);
}

async function showCategories(chatId, type) {
    const { data: cats } = await supabase.from('materials').select('category').not('category', 'is', null);
    const uniqueCats = [...new Set(cats.map(c => c.category))];

    const buttons = uniqueCats.map(cat => [{ text: `📁 ${cat}`, callback_data: `cat_${type}_${cat}` }]);
    buttons.push([{ text: '⬅️ Kembali', callback_data: 'main_menu' }]);

    const text = type === 'in' ? "📥 *PILIH KATEGORI BARANG MASUK*" : "📤 *PILIH KATEGORI BARANG KELUAR*";
    return bot.sendMessage(chatId, text + "\n━━━━━━━━━━━━━━━\nPilih kategori material untuk melihat daftar ID:", {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function showMaterials(chatId, cat, type) {
    const { data: mats } = await supabase.from('materials').select('id, name').eq('category', cat);

    const buttons = mats.map(m => [{ text: `🏷 ${m.id}`, callback_data: `mat_${type}_${m.id}` }]);
    buttons.push([{ text: '⬅️ Ganti Kategori', callback_data: `how_to_${type}` }]);

    const text = `🛠 *DAFTAR MATERIAL: ${cat}*\n━━━━━━━━━━━━━━━\nKlik ID material di bawah ini:`;
    return bot.sendMessage(chatId, text, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function promptTransaction(chatId, id, type) {
    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
    let msg = type === 'in' ? "📥 *KONFIRMASI BARANG MASUK*\n" : "📤 *KONFIRMASI BARANG KELUAR*\n";
    msg += "━━━━━━━━━━━━━━━\n";
    msg += `Material: *${mat.name}*\n`;
    msg += `ID: \`${mat.id}\`\n`;
    msg += `Sisa Stok: \`${mat.stock} ${mat.unit}\`\n\n`;
    msg += "✍️ *Langkah Terakhir:*\n";
    msg += `Salin dan lengkapi perintah di bawah ini:\n\n`;
    msg += `\`/${type} ${mat.id} [JUMLAH] [NAMA]\`\n\n`;
    msg += "👇 _Contoh:_ \n";
    msg += `\`/${type} ${mat.id} 10 Budi\``;

    return bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Batal', callback_data: 'main_menu' }]] }
    });
}

async function handleCheckStock(chatId, simple = false) {
    const { data: mats } = await supabase.from('materials').select('*').order('id');
    if (simple) {
        let text = "📋 *DAFTAR STOK RINGKAS*\n\n";
        mats.filter(m => m.stock > 0).forEach(m => { text += `🏷 \`${m.id}\`: *${m.stock} ${m.unit}*\n`; });
        return bot.sendMessage(chatId, text, { parse_mode: 'Markdown' });
    }

    let response = "📊 *LAPORAN STOK MATERIAL*\n━━━━━━━━━━━━━━━\n\n";
    mats.filter(m => m.stock > 0).forEach(m => {
        response += `🔹 *${m.id}*\n└ 📦 Sisa: \`${m.stock} ${m.unit}\`\n\n`;
    });

    return bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
    });
}

async function handleUsageInfo(chatId) {
    let msg = "ℹ️ *INFORMASI PENGGUNAAN*\n━━━━━━━━━━━━━━━\n";
    msg += "🛰 *Status:* `Online` (Cloud Sync)\n";
    msg += "🤖 *Fungsi:* Monitoring & Input Cepat\n\n";
    msg += "💡 *Cara Input Tanpa Ketik ID:*\n";
    msg += "1. Klik tombol **Barang Masuk/Keluar**.\n";
    msg += "2. Pilih **Kategori** (misal: Pole/Kabel).\n";
    msg += "3. Pilih **ID Material** dari daftar tombol.\n";
    msg += "4. Salin perintah otomatis yang muncul dan isi jumlahnya.\n\n";
    msg += "🔧 *Perintah Manual:*\n";
    msg += "• `/menu` - Tampilkan tombol utama\n";
    msg += "• `/stok` - Cek sisa stok barang";

    return bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
    });
}

async function processTransaction(chatId, text, type) {
    const parts = text.split(' ');
    if (parts.length < 4) return bot.sendMessage(chatId, `❌ *Format salah!*\nContoh: \`/${type} ID 10 Nama\``, { parse_mode: 'Markdown' });

    const id = parts[1];
    const qty = parseFloat(parts[2]);
    const name = parts.slice(3).join(' ');

    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
    if (!mat) return bot.sendMessage(chatId, `❌ *ID \`${id}\` tidak ditemukan.*`, { parse_mode: 'Markdown' });
    if (type === 'out' && mat.stock < qty) return bot.sendMessage(chatId, `⚠️ *STOK TIDAK CUKUP!*\nSisa: \`${mat.stock} ${mat.unit}\``, { parse_mode: 'Markdown' });

    const newStock = type === 'in' ? (mat.stock || 0) + qty : mat.stock - qty;
    await supabase.from('materials').update({ stock: newStock }).eq('id', id);
    await supabase.from('transactions').insert([{ material_id: id, type, quantity: qty, person: name + " (Bot)" }]);

    let msg = `✅ *TRANSAKSI BERHASIL!*\n━━━━━━━━━━━━━━━\n`;
    msg += `📦 Item: \`${mat.name}\`\n`;
    msg += `${type === 'in' ? '📥 Masuk' : '📤 Keluar'}: \`${qty} ${mat.unit}\`\n`;
    msg += `📊 Stok Baru: *${newStock} ${mat.unit}*`;

    return bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '🔄 Menu Utama', callback_data: 'main_menu' }]] }
    });
}
