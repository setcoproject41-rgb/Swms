// Data Management
class WarehouseSystem {
    constructor() {
        // Cek parameter di URL untuk auto-sync
        const urlParams = new URLSearchParams(window.location.search);
        const autoUrl = urlParams.get('url');
        const autoKey = urlParams.get('key');

        if (autoUrl && autoKey) {
            this.config = { url: autoUrl, key: autoKey };
            localStorage.setItem('wh_config', JSON.stringify(this.config));
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            this.config = JSON.parse(localStorage.getItem('wh_config')) || { url: '', key: '' };
        }

        this.client = null;
        this.isOnline = false;
        this.inventory = [];
        this.transactions = [];
        this.botLogs = [];

        this.initSupabase();
    }

    async initSupabase() {
        if (this.config.url && this.config.key) {
            try {
                this.client = supabase.createClient(this.config.url, this.config.key);
                this.isOnline = true;
                console.log('Connected to Cloud');
            } catch (e) {
                console.error('Connection failed', e);
                this.isOnline = false;
            }
        }
        await this.loadData();
    }

    async loadData() {
        try {
            if (this.isOnline) {
                // Ambil semua data dari Cloud
                const [resMat, resTrans, resLogs] = await Promise.all([
                    this.client.from('materials').select('*').order('id'),
                    this.client.from('transactions').select('*').order('created_at', { ascending: false }).limit(50),
                    this.client.from('bot_logs').select('*').order('created_at', { ascending: false }).limit(50)
                ]);

                this.inventory = resMat.data || [];
                this.transactions = resTrans.data || [];
                this.botLogs = resLogs.data || [];
            } else {
                // Mode Lokal
                this.inventory = JSON.parse(localStorage.getItem('wh_inventory')) || [];
                this.transactions = JSON.parse(localStorage.getItem('wh_transactions')) || [];
                this.botLogs = [];
            }
        } catch (err) {
            console.error('Error loading data:', err);
        }
        renderData();
    }

    async saveConfig(url, key) {
        this.config = { url, key };
        localStorage.setItem('wh_config', JSON.stringify(this.config));
        await this.initSupabase();
    }
}

const system = new WarehouseSystem();

// UI Navigation
const views = {
    dashboard: document.getElementById('view-dashboard'),
    inventory: document.getElementById('view-inventory'),
    transactions: document.getElementById('view-transactions'),
    botlogs: document.getElementById('view-botlogs')
};

function switchView(viewName) {
    // Sembunyikan semua view
    Object.keys(views).forEach(v => {
        if (views[v]) views[v].style.display = 'none';
        const nav = document.querySelector(`.nav-item[data-view="${v}"] .nav-link`);
        if (nav) nav.classList.remove('active');
    });

    // Tampilkan view yang dipilih
    if (views[viewName]) {
        views[viewName].style.display = 'block';
    }

    const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"] .nav-link`);
    if (activeNav) activeNav.classList.add('active');

    // Paksa render ulang data pada view spesifik
    if (viewName === 'botlogs') renderBotLogs();
    if (viewName === 'transactions') renderTransactions();
}

// Event Listeners Navigasi
document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const v = item.dataset.view;
        if (v) switchView(v);
    });
});

// Render Utama
function renderData() {
    // Update Stats (Hanya jika elemen ada)
    const elStats = {
        items: document.getElementById('stat-total-items'),
        stock: document.getElementById('stat-total-stock'),
        low: document.getElementById('stat-low-stock')
    };

    if (elStats.items) elStats.items.textContent = system.inventory.length;
    if (elStats.stock) elStats.stock.textContent = system.inventory.reduce((acc, cur) => acc + (parseFloat(cur.stock) || 0), 0).toLocaleString();
    if (elStats.low) elStats.low.textContent = system.inventory.filter(m => m.stock <= 0).length;

    renderInventory();
    renderActivity();
    renderFastMoving();
    renderBotLogs();
    renderTransactions();

    if (window.lucide) lucide.createIcons();
}

function renderInventory() {
    const table = document.getElementById('inventory-table-body');
    if (!table) return;

    const search = document.getElementById('inventory-search')?.value.toLowerCase() || '';
    const filtered = system.inventory.filter(m =>
        m.id.toLowerCase().includes(search) || m.name.toLowerCase().includes(search)
    );

    table.innerHTML = filtered.map(m => `
        <tr>
            <td style="font-weight:600; color:var(--primary)">${m.id}</td>
            <td>${m.name}</td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569">${m.category}</span></td>
            <td style="font-weight:700; color:${m.stock <= 0 ? '#ef4444' : 'inherit'}">${m.stock}</td>
            <td style="color:var(--text-muted)">${m.unit}</td>
            <td>
                <button class="btn" style="padding:5px; color:#ef4444" onclick="deleteItem('${m.id}')">
                    <i data-lucide="trash-2" style="width:16px"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderBotLogs() {
    const table = document.getElementById('botlogs-table-body');
    if (!table) return;

    if (system.botLogs.length === 0) {
        table.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:2rem; color:var(--text-muted)">No bot activity yet</td></tr>';
        return;
    }

    table.innerHTML = system.botLogs.map(log => `
        <tr>
            <td style="font-size:0.85rem; color:var(--text-muted)">${new Date(log.created_at).toLocaleString()}</td>
            <td><div style="font-weight:600">${log.full_name || '-'}</div><div style="font-size:0.75rem; color:var(--text-muted)">@${log.username || 'n/a'}</div></td>
            <td style="font-family:monospace; font-size:0.8rem">${log.telegram_id}</td>
            <td><span class="badge" style="background:#f1f5f9; color:#1e293b">${log.action}</span></td>
        </tr>
    `).join('');
}

function renderTransactions() {
    const table = document.getElementById('transactions-table-body');
    if (!table) return;

    const filter = document.getElementById('transaction-type-filter')?.value || 'all';
    const filtered = filter === 'all' ? system.transactions : system.transactions.filter(t => t.type === filter);

    table.innerHTML = filtered.map(t => {
        const mat = system.inventory.find(m => m.id === t.material_id);
        const name = mat ? mat.name : (t.material_name || '-');
        return `
            <tr>
                <td style="font-size:0.85rem; color:var(--text-muted)">${new Date(t.created_at).toLocaleString()}</td>
                <td><span class="badge ${t.type === 'in' ? 'badge-in' : 'badge-out'}">${t.type.toUpperCase()}</span></td>
                <td style="font-weight:600">${t.material_id}</td>
                <td style="font-size:0.9rem">${name}</td>
                <td style="font-weight:600">${t.quantity}</td>
                <td>${t.person}</td>
            </tr>
        `;
    }).join('');
}

function renderActivity() {
    const list = document.getElementById('recent-activity-list');
    if (!list) return;

    list.innerHTML = system.transactions.slice(0, 5).map(tr => {
        const mat = system.inventory.find(m => m.id === tr.material_id);
        const isOut = tr.type === 'out';
        return `
            <div style="display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--border); align-items: center;">
                <div style="width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${isOut ? '#fee2e2' : '#dcfce7'}; color: ${isOut ? '#ef4444' : '#22c55e'}">
                    <i data-lucide="${isOut ? 'arrow-up-right' : 'arrow-down-left'}" style="width:14px"></i>
                </div>
                <div style="flex-grow: 1">
                    <div style="font-weight: 600; font-size: 0.85rem">${tr.person} <span style="font-weight: 400; color: var(--text-muted)">${isOut ? 'recorded out' : 'recorded in'}</span></div>
                    <div style="font-size: 0.7rem; color: var(--text-muted)">${mat ? mat.name : tr.material_id} (${tr.quantity} units)</div>
                </div>
            </div>
        `;
    }).join('');
}

function renderFastMoving() {
    const list = document.getElementById('fast-moving-list');
    if (!list) return;

    const counts = {};
    system.transactions.forEach(tr => counts[tr.material_id] = (counts[tr.material_id] || 0) + 1);
    const sorted = Object.entries(counts).sort((a, b) => b[1] - a[1]).slice(0, 3);

    list.innerHTML = sorted.map(([id, count]) => {
        const mat = system.inventory.find(m => m.id === id);
        if (!mat) return '';
        return `
            <div style="padding: 0.6rem; border-radius: 10px; background: #f8fafc; margin-bottom: 0.5rem; display: flex; justify-content: space-between; align-items: center;">
                <div style="font-weight: 600; font-size: 0.8rem">${id}</div>
                <div class="badge badge-in" style="font-size:0.65rem">${count}x trans</div>
            </div>
        `;
    }).join('');
}

// Modal Handlers
const modalBackdrop = document.getElementById('modal-backdrop');
const modalAdd = document.getElementById('modal-add-item');
const modalTrans = document.getElementById('modal-transaction');
const modalSettings = document.getElementById('modal-settings');

function showModal(modal) {
    modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function hideModals() {
    modalBackdrop.classList.add('hidden');
    [modalAdd, modalTrans, modalSettings].forEach(m => m.classList.add('hidden'));
}

document.getElementById('btn-settings-nav')?.addEventListener('click', () => {
    document.getElementById('sb-url').value = system.config.url;
    document.getElementById('sb-key').value = system.config.key;
    showModal(modalSettings);
});

document.getElementById('cancel-add-item')?.addEventListener('click', hideModals);
document.getElementById('cancel-transaction')?.addEventListener('click', hideModals);
modalBackdrop?.addEventListener('click', hideModals);

// Form Handlers
document.getElementById('form-add-item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const mat = {
        id: document.getElementById('new-id').value,
        name: document.getElementById('new-name').value,
        category: document.getElementById('new-category').value,
        stock: 0,
        unit: document.getElementById('new-unit').value
    };
    await system.addMaterial(mat);
    e.target.reset();
    hideModals();
});

document.getElementById('form-transaction')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('transaction-type').value;
    const materialId = document.getElementById('trans-material-id').value;
    const qty = document.getElementById('trans-quantity').value;
    const person = document.getElementById('trans-person').value;

    if (await system.recordTransaction(type, materialId, qty, person)) {
        e.target.reset();
        hideModals();
    }
});

document.getElementById('form-settings')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    await system.saveConfig(document.getElementById('sb-url').value, document.getElementById('sb-key').value);
    hideModals();
    alert('Connected to Cloud.');
});

document.getElementById('btn-disconnect')?.addEventListener('click', async () => {
    await system.saveConfig('', '');
    hideModals();
    alert('Switched to Local Mode.');
});

// Helpers
function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    return date.toLocaleDateString();
}

window.deleteItem = async (id) => {
    if (confirm('Hapus material ini?')) {
        await system.deleteMaterial(id);
    }
};

// Start
window.addEventListener('load', () => {
    if (window.lucide) lucide.createIcons();
});
