const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

// Inisialisasi di luar handler untuk mempercepat eksekusi (Cold Start)
const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

module.exports = async (req, res) => {
    // Segera beri respon ke Telegram agar tidak dianggap timeout/lambat
    // Vercel akan tetap menjalankan proses di bawahnya sampai selesai (max 10s)
    if (req.method === 'GET') {
        return res.status(200).send('Bot Monitoring is active and running.');
    }

    if (req.method !== 'POST') {
        return res.status(405).send('Method Not Allowed');
    }

    // Amankan respon POST
    res.status(200).send('OK');

    try {
        const { message, callback_query } = req.body;

        if (callback_query) {
            await handleCallback(callback_query);
        } else if (message) {
            await handleMessage(message);
        }
    } catch (err) {
        console.error("Bot Error:", err);
    }
};

async function handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'main_menu') return sendMainMenu(chatId);
    if (data === 'check_stock') return handleCheckStock(chatId);
    if (data === 'usage_info') return handleUsageInfo(chatId);

    // Jalur In/Out
    if (data === 'how_to_in') return showCategories(chatId, 'in');
    if (data.startsWith('cat_in_')) return showMaterials(chatId, data.replace('cat_in_', ''), 'in');
    if (data.startsWith('mat_in_')) return promptTransaction(chatId, data.replace('mat_in_', ''), 'in');

    if (data === 'how_to_out') return showCategories(chatId, 'out');
    if (data.startsWith('cat_out_')) return showMaterials(chatId, data.replace('cat_out_', ''), 'out');
    if (data.startsWith('mat_out_')) return promptTransaction(chatId, data.replace('mat_out_', ''), 'out');
}

async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = message.text;

    if (!text) return;

    if (text === '/start' || text === '/menu') return sendMainMenu(chatId);
    if (text === '/stok') return handleCheckStock(chatId, true);

    if (text.startsWith('/in ')) return processTransaction(chatId, text, 'in');
    if (text.startsWith('/out ')) return processTransaction(chatId, text, 'out');
}

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
    const welcome = "🏪 *WAREHOUSE MONITORING*\n━━━━━━━━━━━━━━━\n\n👇 *Pilih menu di bawah:*";
    return bot.sendMessage(chatId, welcome, opts);
}

async function showCategories(chatId, type) {
    const { data: cats } = await supabase.from('materials').select('category');
    const uniqueCats = [...new Set(cats.map(c => c.category || 'Uncategorized'))];

    const buttons = uniqueCats.map(cat => [{ text: `📁 ${cat}`, callback_data: `cat_${type}_${cat}` }]);
    buttons.push([{ text: '⬅️ Kembali', callback_data: 'main_menu' }]);

    const text = type === 'in' ? "📥 *KATEGORI BARANG MASUK*" : "📤 *KATEGORI BARANG KELUAR*";
    return bot.sendMessage(chatId, text + "\n━━━━━━━━━━━━━━━", {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function showMaterials(chatId, cat, type) {
    const { data: mats } = await supabase.from('materials').select('id').eq('category', cat).limit(20);

    const buttons = mats.map(m => [{ text: `🏷 ${m.id}`, callback_data: `mat_${type}_${m.id}` }]);
    buttons.push([{ text: '⬅️ Ganti Kategori', callback_data: `how_to_${type}` }]);

    return bot.sendMessage(chatId, `🛠 *DAFTAR ID: ${cat}*\n━━━━━━━━━━━━━━━`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function promptTransaction(chatId, id, type) {
    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
    let msg = `� *KONFIRMASI ${type.toUpperCase()}*\n`;
    msg += "━━━━━━━━━━━━━━━\n";
    msg += `ID: \`${mat.id}\`\n`;
    msg += `Sisa: \`${mat.stock} ${mat.unit}\`\n\n`;
    msg += "👇 *Klik perintah ini untuk salin:*\n";
    msg += `\`/${type} ${mat.id} [JUMLAH] [NAMA]\``;

    return bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Batal', callback_data: 'main_menu' }]] }
    });
}

async function handleCheckStock(chatId, simple = false) {
    const { data: mats } = await supabase.from('materials').select('*').order('id').limit(50);
    let response = simple ? "📋 *STOK RINGKAS*\n\n" : "📊 *LAPORAN STOK*\n━━━━━━━━━━━━━━━\n\n";

    mats.filter(m => m.stock > 0).forEach(m => {
        response += simple ? `🏷 \`${m.id}\`: *${m.stock}*\n` : `� *${m.id}*: \`${m.stock} ${m.unit}\`\n`;
    });

    return bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
    });
}

async function handleUsageInfo(chatId) {
    let msg = "ℹ️ *PANDUAN BOT*\n━━━━━━━━━━━━━━━\n";
    msg += "1. Klik tombol **Masuk/Keluar**\n";
    msg += "2. Pilih **Kategori** & **ID Barang**\n";
    msg += "3. Lengkapi pesan yang muncul\n\n";
    msg += "✅ *Contoh:* \`/in ID 10 Agus\`";

    return bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
    });
}

async function processTransaction(chatId, text, type) {
    const parts = text.split(' ');
    if (parts.length < 4) return bot.sendMessage(chatId, "⚠️ *Format salah!*\nGunakan: `/in [ID] [JML] [NAMA]`");

    const id = parts[1];
    const qty = parseFloat(parts[2]);
    const name = parts.slice(3).join(' ');

    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
    if (!mat) return bot.sendMessage(chatId, `❌ ID \`${id}\` tidak ditemukan.`);
    if (type === 'out' && mat.stock < qty) return bot.sendMessage(chatId, `⚠️ Stok tidak cukup! Sisa: ${mat.stock}`);

    const newStock = type === 'in' ? (mat.stock || 0) + qty : mat.stock - qty;

    await Promise.all([
        supabase.from('materials').update({ stock: newStock }).eq('id', id),
        supabase.from('transactions').insert([{ material_id: id, type, quantity: qty, person: name + " (TG)" }])
    ]);

    let msg = `✅ *BERHASIL ${type.toUpperCase()}!*\n`;
    msg += `� \`${mat.name}\`\n`;
    msg += `📊 Stok Baru: *${newStock} ${mat.unit}*`;

    return bot.sendMessage(chatId, msg, { parse_mode: 'Markdown' });
}
