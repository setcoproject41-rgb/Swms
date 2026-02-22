// Data Management
class WarehouseSystem {
    constructor() {
        // Cek parameter di URL untuk auto-config
        const urlParams = new URLSearchParams(window.location.search);
        const autoUrl = urlParams.get('url');
        const autoKey = urlParams.get('key');

        if (autoUrl && autoKey) {
            this.config = { url: autoUrl, key: autoKey };
            localStorage.setItem('wh_config', JSON.stringify(this.config));
            // Bersihkan URL agar kunci tidak terlihat jelas di address bar
            window.history.replaceState({}, document.title, window.location.pathname);
        } else {
            this.config = JSON.parse(localStorage.getItem('wh_config')) || { url: '', key: '' };
        }

        this.client = null;
        this.isOnline = false;
        this.inventory = [];
        this.transactions = [];

        this.initSupabase();
    }

    async initSupabase() {
        if (this.config.url && this.config.key) {
            try {
                this.client = supabase.createClient(this.config.url, this.config.key);
                this.isOnline = true;
                console.log('Connected to Supabase');
            } catch (e) {
                console.error('Supabase connection failed', e);
                this.isOnline = false;
            }
        } else {
            this.isOnline = false;
        }
        await this.loadData();
    }

    async loadData() {
        try {
            if (this.isOnline) {
                const { data: mats } = await this.client.from('materials').select('*').order('id');
                const { data: trans } = await this.client.from('transactions').select('*').order('created_at', { ascending: false }).limit(50);
                this.inventory = mats || [];
                this.transactions = trans || [];
            } else {
                this.inventory = JSON.parse(localStorage.getItem('wh_inventory')) || [];
                this.transactions = JSON.parse(localStorage.getItem('wh_transactions')) || [];
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

    async addMaterial(material) {
        if (this.isOnline) {
            await this.client.from('materials').insert([material]);
        } else {
            this.inventory.push(material);
            localStorage.setItem('wh_inventory', JSON.stringify(this.inventory));
        }
        await this.loadData();
    }

    async importFromCSV() {
        const defaultItems = [
            { id: 'AC-ADSS-SM-12C', name: 'Aerial Cable Fiber Optik 12 Core', category: 'Cable', stock: 0, unit: 'meter' },
            { id: 'AC-ADSS-SM-24C', name: 'Aerial Cable Fiber Optik 24 Core', category: 'Cable', stock: 0, unit: 'meter' },
            { id: 'JC-OF-SM-24C', name: 'Joint Closure 24 Core', category: 'Closure', stock: 0, unit: 'pcs' },
            { id: 'FAT-PB-8C-SOLID', name: 'FAT Pole 8 Core', category: 'FAT/OTB', stock: 0, unit: 'pcs' },
            { id: 'NP-7.0-140-2S', name: 'New Pole 7 Meter', category: 'Pole', stock: 0, unit: 'pcs' }
        ];

        for (const item of defaultItems) {
            if (!this.inventory.find(m => m.id === item.id)) {
                await this.addMaterial(item);
            }
        }
        alert('Data dasar berhasil diimpor!');
        await this.loadData();
    }

    async recordTransaction(type, materialId, quantity, person) {
        const material = this.inventory.find(m => m.id === materialId);
        if (!material) return false;

        const qty = parseFloat(quantity);
        if (type === 'out' && material.stock < qty) {
            alert('Insufficient stock!');
            return false;
        }

        const newStock = type === 'in' ? (parseFloat(material.stock) || 0) + qty : material.stock - qty;

        if (this.isOnline) {
            await this.client.from('materials').update({ stock: newStock }).eq('id', materialId);
            await this.client.from('transactions').insert([{
                material_id: materialId,
                type,
                quantity: qty,
                person
            }]);
        } else {
            material.stock = newStock;
            const transaction = {
                id: Date.now(),
                created_at: new Date().toISOString(),
                type,
                material_id: materialId,
                quantity: qty,
                person
            };
            this.transactions.unshift(transaction);
            localStorage.setItem('wh_inventory', JSON.stringify(this.inventory));
            localStorage.setItem('wh_transactions', JSON.stringify(this.transactions));
        }

        await this.loadData();
        return true;
    }

    async deleteMaterial(id) {
        if (this.isOnline) {
            await this.client.from('materials').delete().eq('id', id);
        } else {
            this.inventory = this.inventory.filter(m => m.id !== id);
            localStorage.setItem('wh_inventory', JSON.stringify(this.inventory));
        }
        await this.loadData();
    }
}

const system = new WarehouseSystem();

// UI Elements & State
const views = {
    dashboard: document.getElementById('view-dashboard'),
    inventory: document.getElementById('view-inventory'),
    transactions: document.getElementById('view-transactions')
};

const modalBackdrop = document.getElementById('modal-backdrop');
const modalAdd = document.getElementById('modal-add-item');
const modalTrans = document.getElementById('modal-transaction');
const modalSettings = document.getElementById('modal-settings');

// Navigation
function switchView(viewName) {
    Object.keys(views).forEach(v => {
        if (views[v]) views[v].style.display = 'none';
        const nav = document.querySelector(`.nav-item[data-view="${v}"] .nav-link`);
        if (nav) nav.classList.remove('active');
    });

    if (views[viewName]) {
        if (viewName === 'dashboard') views[viewName].style.display = 'block';
        else views[viewName].style.display = 'block';
    }

    const activeNav = document.querySelector(`.nav-item[data-view="${viewName}"] .nav-link`);
    if (activeNav) activeNav.classList.add('active');

    if (viewName === 'transactions') renderTransactions();
    if (viewName === 'dashboard') renderData();
}

document.querySelectorAll('.nav-item').forEach(item => {
    item.addEventListener('click', (e) => {
        e.preventDefault();
        const view = item.dataset.view;
        if (view) switchView(view);
    });
});

document.getElementById('btn-view-all-activity')?.addEventListener('click', () => switchView('transactions'));

// Modal Helpers
function showModal(modal) {
    modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    modalBackdrop.style.display = 'flex';
}

function hideModals() {
    modalBackdrop.classList.add('hidden');
    [modalAdd, modalTrans, modalSettings].forEach(m => {
        m.classList.add('hidden');
        m.style.display = 'none';
    });
    modalBackdrop.style.display = 'none';
}

modalBackdrop.addEventListener('click', hideModals);
document.getElementById('cancel-add-item')?.addEventListener('click', hideModals);
document.getElementById('cancel-transaction')?.addEventListener('click', hideModals);
document.getElementById('btn-settings-nav')?.addEventListener('click', () => {
    document.getElementById('sb-url').value = system.config.url;
    document.getElementById('sb-key').value = system.config.key;
    showModal(modalSettings);
});

// UI Actions
document.getElementById('btn-material-in')?.addEventListener('click', () => {
    document.getElementById('transaction-modal-title').textContent = 'Material Masuk';
    document.getElementById('transaction-type').value = 'in';
    document.getElementById('btn-submit-transaction').textContent = 'Terima Barang';
    renderMaterialSelect();
    showModal(modalTrans);
});

document.getElementById('btn-material-out')?.addEventListener('click', () => {
    document.getElementById('transaction-modal-title').textContent = 'Material Keluar';
    document.getElementById('transaction-type').value = 'out';
    document.getElementById('btn-submit-transaction').textContent = 'Keluarkan Barang';
    renderMaterialSelect();
    showModal(modalTrans);
});

document.getElementById('btn-add-item')?.addEventListener('click', () => showModal(modalAdd));
document.getElementById('btn-import-csv')?.addEventListener('click', () => system.importFromCSV());

// Rendering Logic
function renderData() {
    // Stats
    document.getElementById('stat-total-items').textContent = system.inventory.length;
    document.getElementById('stat-total-stock').textContent = system.inventory.reduce((acc, cur) => acc + (parseFloat(cur.stock) || 0), 0).toLocaleString();
    document.getElementById('stat-low-stock').textContent = system.inventory.filter(m => m.stock <= 0).length;

    renderActivity();
    renderInventory();
    renderFastMoving();

    if (window.lucide) lucide.createIcons();
}

function renderInventory() {
    const tableBody = document.getElementById('inventory-table-body');
    if (!tableBody) return;

    const search = document.getElementById('inventory-search')?.value.toLowerCase() || '';
    const filtered = system.inventory.filter(m =>
        m.name.toLowerCase().includes(search) || m.id.toLowerCase().includes(search)
    );

    tableBody.innerHTML = filtered.map(m => `
        <tr>
            <td style="font-weight:600; color:var(--primary)">${m.id}</td>
            <td>${m.name}</td>
            <td><span class="badge" style="background:#f1f5f9; color:#475569">${m.category}</span></td>
            <td style="font-weight:700; color:${m.stock <= 0 ? '#ef4444' : 'inherit'}">${m.stock}</td>
            <td style="color:var(--text-muted)">${m.unit}</td>
            <td>
                <button class="btn" style="padding:5px; color:#ef4444" onclick="deleteItem('${m.id}')">
                    <i data-lucide="trash-2"></i>
                </button>
            </td>
        </tr>
    `).join('');
}

function renderTransactions() {
    const tableBody = document.getElementById('transactions-table-body');
    if (!tableBody) return;

    const filter = document.getElementById('transaction-type-filter')?.value || 'all';
    const filtered = filter === 'all' ? system.transactions : system.transactions.filter(t => t.type === filter);

    tableBody.innerHTML = filtered.map(t => {
        const mat = system.inventory.find(m => m.id === t.material_id);
        const name = mat ? mat.name : (t.material_name || t.materialName || '-');
        return `
            <tr>
                <td style="font-size:0.85rem; color:var(--text-muted)">${new Date(t.created_at).toLocaleString()}</td>
                <td><span class="badge ${t.type === 'in' ? 'badge-in' : 'badge-out'}">${t.type.toUpperCase()}</span></td>
                <td style="font-weight:600">${t.material_id}</td>
                <td>${name}</td>
                <td style="font-weight:600">${t.quantity}</td>
                <td>${t.person}</td>
            </tr>
        `;
    }).join('');
    if (window.lucide) lucide.createIcons();
}

function renderActivity() {
    const list = document.getElementById('recent-activity-list');
    if (!list) return;

    if (system.transactions.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No recent transactions found</div>';
        return;
    }

    list.innerHTML = system.transactions.slice(0, 5).map(tr => {
        const mat = system.inventory.find(m => m.id === tr.material_id);
        const isOut = tr.type === 'out';
        return `
            <div style="display: flex; gap: 1rem; padding: 1rem; border-bottom: 1px solid var(--border); align-items: center;">
                <div style="width: 40px; height: 40px; border-radius: 50%; display: flex; align-items: center; justify-content: center; background: ${isOut ? '#fee2e2' : '#dcfce7'}; color: ${isOut ? '#ef4444' : '#22c55e'}">
                    <i data-lucide="${isOut ? 'arrow-up-right' : 'arrow-down-left'}"></i>
                </div>
                <div style="flex-grow: 1">
                    <div style="font-weight: 600; font-size: 0.9rem">${tr.person} <span style="font-weight: 400; color: var(--text-muted)">${isOut ? 'recorded out' : 'recorded in'}</span></div>
                    <div style="font-size: 0.75rem; color: var(--text-muted)">${mat ? mat.name : tr.material_id} (${tr.quantity} units)</div>
                </div>
                <div style="font-size: 0.75rem; color: var(--text-muted)">${formatTimeAgo(new Date(tr.created_at))}</div>
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

    if (sorted.length === 0) {
        list.innerHTML = '<div style="text-align: center; color: var(--text-muted); padding: 2rem;">No data yet</div>';
        return;
    }

    list.innerHTML = sorted.map(([id, count]) => {
        const mat = system.inventory.find(m => m.id === id);
        if (!mat) return '';
        return `
            <div style="padding: 0.75rem; border-radius: 12px; background: #f8fafc; margin-bottom: 0.75rem; display: flex; justify-content: space-between; align-items: center;">
                <div>
                    <div style="font-weight: 600; font-size: 0.85rem">${mat.id}</div>
                    <div style="font-size: 0.75rem; color: var(--text-muted)">${mat.name}</div>
                </div>
                <div class="badge badge-in">${count}x trans</div>
            </div>
        `;
    }).join('');
}

function renderMaterialSelect() {
    const select = document.getElementById('trans-material-id');
    if (!select) return;
    select.innerHTML = '<option value="" disabled selected>Pilih Material</option>' +
        system.inventory.map(m => `<option value="${m.id}">${m.id} - ${m.name} (${m.stock} sisa)</option>`).join('');
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Just now';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m ago`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}h ago`;
    return date.toLocaleDateString();
}

// Global Actions
window.deleteItem = async (id) => {
    if (confirm('Hapus material ini?')) {
        await system.deleteMaterial(id);
    }
};

// Form Handlers
document.getElementById('form-add-item')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const material = {
        id: document.getElementById('new-id').value,
        name: document.getElementById('new-name').value,
        category: document.getElementById('new-category').value,
        stock: 0,
        unit: document.getElementById('new-unit').value
    };
    await system.addMaterial(material);
    e.target.reset();
    hideModals();
});

document.getElementById('form-transaction')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const type = document.getElementById('transaction-type').value;
    const materialId = document.getElementById('trans-material-id').value;
    const quantity = document.getElementById('trans-quantity').value;
    const person = document.getElementById('trans-person').value;

    if (await system.recordTransaction(type, materialId, quantity, person)) {
        e.target.reset();
        hideModals();
    }
});

document.getElementById('form-settings')?.addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('sb-url').value;
    const key = document.getElementById('sb-key').value;
    await system.saveConfig(url, key);
    hideModals();
    alert('Connected to Cloud.');
});

document.getElementById('btn-disconnect')?.addEventListener('click', async () => {
    await system.saveConfig('', '');
    hideModals();
    alert('Switched to Local Mode.');
});

document.getElementById('inventory-search')?.addEventListener('input', renderInventory);
document.getElementById('transaction-type-filter')?.addEventListener('change', renderTransactions);

// Initial Load
window.addEventListener('load', () => {
    if (window.lucide) lucide.createIcons();
});
