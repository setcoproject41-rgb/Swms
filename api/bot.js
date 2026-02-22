const { createClient } = require('@supabase/supabase-js');
const TelegramBot = require('node-telegram-bot-api');

const supabase = createClient(process.env.SUPABASE_URL, process.env.SUPABASE_ANON_KEY);
const bot = new TelegramBot(process.env.TELEGRAM_BOT_TOKEN, { polling: false });

module.exports = async (req, res) => {
    if (req.method === 'GET') return res.status(200).send('OK');

    try {
        const { message, callback_query } = req.body;

        if (callback_query) {
            await logAction(callback_query.from, `Callback: ${callback_query.data}`);
            await handleCallback(callback_query);
        } else if (message) {
            await logAction(message.from, `Message: ${message.text || 'Non-text'}`);
            await handleMessage(message);
        }

        return res.status(200).json({ status: 'success' });
    } catch (err) {
        console.error("Bot Error Detail:", err.message);
        return res.status(200).json({ status: 'error', message: err.message });
    }
};

async function logAction(user, action) {
    try {
        await supabase.from('bot_logs').insert([{
            telegram_id: user.id,
            username: user.username,
            full_name: `${user.first_name || ''} ${user.last_name || ''}`.trim(),
            action: action
        }]);
    } catch (e) {
        console.error("Failed to log action:", e.message);
    }
}

async function handleCallback(query) {
    const chatId = query.message.chat.id;
    const data = query.data;

    if (data === 'main_menu') return await sendMainMenu(chatId);
    if (data === 'check_stock') return await handleCheckStock(chatId);
    if (data === 'usage_info') return await handleUsageInfo(chatId);

    if (data === 'how_to_in') return await showCategories(chatId, 'in');
    if (data.startsWith('cat_in_')) return await showMaterials(chatId, data.replace('cat_in_', ''), 'in');
    if (data.startsWith('mat_in_')) return await promptTransaction(chatId, data.replace('mat_in_', ''), 'in');

    if (data === 'how_to_out') return await showCategories(chatId, 'out');
    if (data.startsWith('cat_out_')) return await showMaterials(chatId, data.replace('cat_out_', ''), 'out');
    if (data.startsWith('mat_out_')) return await promptTransaction(chatId, data.replace('mat_out_', ''), 'out');
}

async function handleMessage(message) {
    const chatId = message.chat.id;
    const text = message.text;
    if (!text) return;

    if (text === '/start' || text === '/menu') return await sendMainMenu(chatId);
    if (text === '/stok') return await handleCheckStock(chatId, true);
    if (text.startsWith('/in ')) return await processTransaction(chatId, text, 'in');
    if (text.startsWith('/out ')) return await processTransaction(chatId, text, 'out');
}

async function sendMainMenu(chatId) {
    const dashboardUrl = `https://${process.env.VERCEL_URL}?url=${encodeURIComponent(process.env.SUPABASE_URL)}&key=${encodeURIComponent(process.env.SUPABASE_ANON_KEY)}`;
    const opts = {
        reply_markup: {
            inline_keyboard: [
                [{ text: '📊 Bursa Stok Real-time', callback_data: 'check_stock' }],
                [{ text: '📥 Barang Masuk', callback_data: 'how_to_in' }, { text: '📤 Barang Keluar', callback_data: 'how_to_out' }],
                [{ text: 'ℹ️ Info Penggunaan', callback_data: 'usage_info' }, { text: '🌐 Buka Dashboard (Auto-Sync)', url: dashboardUrl }]
            ]
        },
        parse_mode: 'Markdown'
    };
    return await bot.sendMessage(chatId, "🏪 *S.W.M.S MONITORING SYSTEM*\n━━━━━━━━━━━━━━━\nMonitor stok material dalam satu genggaman.\n\n👇 *Pilih menu di bawah:*", opts);
}

async function showCategories(chatId, type) {
    const { data: mats } = await supabase.from('materials').select('category');
    const categories = [...new Set(mats.map(m => m.category || 'Lainnya'))];
    const buttons = categories.map(cat => [{ text: `📁 ${cat}`, callback_data: `cat_${type}_${cat}` }]);
    buttons.push([{ text: '⬅️ Kembali', callback_data: 'main_menu' }]);

    return await bot.sendMessage(chatId, `📂 *PILIH KATEGORI ${type === 'in' ? 'MASUK' : 'KELUAR'}*\n━━━━━━━━━━━━━━━`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function showMaterials(chatId, cat, type) {
    const { data: mats } = await supabase.from('materials').select('id, name').eq('category', cat).limit(25);
    const buttons = mats.map(m => [{ text: `🏷 ${m.id}`, callback_data: `mat_${type}_${m.id}` }]);
    buttons.push([{ text: '⬅️ Ganti Kategori', callback_data: `how_to_${type}` }]);

    return await bot.sendMessage(chatId, `🛠 *DAFTAR ITEM: ${cat}*\n━━━━━━━━━━━━━━━\nKlik ID material:`, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: buttons }
    });
}

async function promptTransaction(chatId, id, type) {
    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
    let msg = `📍 *KONFIRMASI ${type.toUpperCase()}*\n`;
    msg += "━━━━━━━━━━━━━━━\n";
    msg += `Item: *${mat.name}*\n`;
    msg += `ID: \`${mat.id}\`\n`;
    msg += `Stok: \`${mat.stock} ${mat.unit}\`\n\n`;
    msg += "👇 *Klik (Copy) perintah ini:*\n";
    msg += `\`/${type} ${mat.id} [JML] [NAMA]\``;

    return await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Batal', callback_data: 'main_menu' }]] } });
}

async function handleCheckStock(chatId, simple = false) {
    const { data: mats } = await supabase.from('materials').select('*').order('id').limit(50);
    let title = simple ? "📋 *STOK RINGKAS*" : "📊 *LAPORAN STOK MATERIAL*";
    let response = `${title}\n━━━━━━━━━━━━━━━\n\n`;

    mats.filter(m => m.stock > 0).forEach(m => {
        response += `🔹 *${m.id}*\n└ 📦 Sisa: \`${m.stock} ${m.unit}\`\n\n`;
    });

    return await bot.sendMessage(chatId, response, {
        parse_mode: 'Markdown',
        reply_markup: { inline_keyboard: [[{ text: '⬅️ Kembali', callback_data: 'main_menu' }]] }
    });
}

async function handleUsageInfo(chatId) {
    let msg = "ℹ️ *PANDUAN MONITORING*\n━━━━━━━━━━━━━━━\n";
    msg += "1. Klik **Barang Masuk/Keluar**\n";
    msg += "2. Pilih **Kategori** > **ID Barang**\n";
    msg += "3. Lengkapi pesan otomatis yang muncul\n\n";
    msg += "✅ *Tips:* Klik teks perintah untuk menyalin otomatis.";
    return await bot.sendMessage(chatId, msg, { parse_mode: 'Markdown', reply_markup: { inline_keyboard: [[{ text: '⬅️ Menu Utama', callback_data: 'main_menu' }]] } });
}

async function processTransaction(chatId, text, type) {
    const parts = text.split(' ');
    if (parts.length < 4) return await bot.sendMessage(chatId, "⚠️ *Format salah!*\nGunakan: `/in [ID] [JUMLAH] [NAMA]`");

    const id = parts[1];
    const qty = parseFloat(parts[2]);
    const name = parts.slice(3).join(' ');

    const { data: mat } = await supabase.from('materials').select('*').eq('id', id).single();
    if (!mat) return await bot.sendMessage(chatId, "❌ *ID Material tidak ditemukan.*");
    if (type === 'out' && mat.stock < qty) return await bot.sendMessage(chatId, `⚠️ *Stok Kurang!* Sisa: ${mat.stock}`);

    const newStock = type === 'in' ? (mat.stock || 0) + qty : mat.stock - qty;

    await Promise.all([
        supabase.from('materials').update({ stock: newStock }).eq('id', id),
        supabase.from('transactions').insert([{ material_id: id, type, quantity: qty, person: name + " (Telegram)" }])
    ]);

    let msg = `✅ *SUKSES ${type.toUpperCase()}!*\n━━━━━━━━━━━━━━━\n`;
    msg += `📦 \`${mat.name}\`\n`;
    msg += `� Stok Baru: *${newStock} ${mat.unit}*`;

    return await bot.sendMessage(chatId, msg, {
        parse_mode: 'Markdown',
        reply_markup: {
            inline_keyboard: [[{ text: '🔄 Kembali ke Menu Utama', callback_data: 'main_menu' }]]
        }
    });
}
