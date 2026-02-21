// Data Management
class WarehouseSystem {
    constructor() {
        this.config = JSON.parse(localStorage.getItem('wh_config')) || { url: '', key: '' };
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
        if (this.isOnline) {
            const { data: mats } = await this.client.from('materials').select('*').order('id');
            const { data: trans } = await this.client.from('transactions').select('*').order('created_at', { ascending: false }).limit(50);
            this.inventory = mats || [];
            this.transactions = trans || [];
        } else {
            this.inventory = JSON.parse(localStorage.getItem('wh_inventory')) || [];
            this.transactions = JSON.parse(localStorage.getItem('wh_transactions')) || [];
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
            { id: 'FAT-PB-8C-SOLID', name: 'FAT Pole 8 Core', category: 'FAT', stock: 0, unit: 'pcs' },
            { id: 'NP-7.0-140-2S', name: 'New Pole 7 Meter', category: 'Pole', stock: 0, unit: 'pcs' }
            // ... data lainnya bisa diinput manual via dashboard
        ];

        for (const item of defaultItems) {
            if (!this.inventory.find(m => m.id === item.id)) {
                await this.addMaterial(item);
            }
        }
        alert('Data dasar berhasil diimpor!');
    }

    async recordTransaction(type, materialId, quantity, person) {
        const material = this.inventory.find(m => m.id === materialId);
        if (!material) return false;

        const qty = parseFloat(quantity);
        if (type === 'out' && material.stock < qty) {
            alert('Insufficient stock!');
            return false;
        }

        const newStock = type === 'in' ? material.stock + qty : material.stock - qty;

        if (this.isOnline) {
            // Update stock in materials table
            await this.client.from('materials').update({ stock: newStock }).eq('id', materialId);
            // Record transaction
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
                date: new Date().toISOString(),
                type,
                materialId,
                materialName: material.name,
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

    getStats() {
        return {
            totalItems: this.inventory.length,
            totalStock: this.inventory.reduce((acc, curr) => acc + (parseFloat(curr.stock) || 0), 0),
            lowStock: this.inventory.filter(m => m.stock < 10).length
        };
    }
}

const system = new WarehouseSystem();

// UI Elements
const views = {
    dashboard: document.getElementById('dashboard-view'),
    inventory: document.getElementById('inventory-view'),
    transactions: document.getElementById('transactions-view')
};

const navItems = document.querySelectorAll('.nav-item');
const viewTitle = document.getElementById('view-title');

// Modals
const modalBackdrop = document.getElementById('modal-backdrop');
const modalAdd = document.getElementById('modal-add-item');
const modalTrans = document.getElementById('modal-transaction');
const modalSettings = document.getElementById('modal-settings');

// Navigation
navItems.forEach(item => {
    item.addEventListener('click', () => {
        const viewName = item.dataset.view;
        if (viewName) switchView(viewName);
    });
});

function switchView(viewName) {
    Object.keys(views).forEach(v => views[v].classList.add('hidden'));
    views[viewName].classList.remove('hidden');
    navItems.forEach(nav => nav.classList.remove('active'));
    const activeNav = document.querySelector(`[data-view="${viewName}"]`);
    if (activeNav) activeNav.classList.add('active');
    viewTitle.textContent = viewName.charAt(0).toUpperCase() + viewName.slice(1);
}

// Rendering
function renderData() {
    updateStats();
    renderInventory();
    renderTransactions();
    renderActivity();
    renderMaterialSelect();
}

function updateStats() {
    const stats = system.getStats();
    document.getElementById('stat-total-items').textContent = stats.totalItems;
    document.getElementById('stat-total-stock').textContent = stats.totalStock;
    document.getElementById('stat-low-stock').textContent = stats.lowStock;
}

function renderInventory() {
    const tableBody = document.getElementById('inventory-table-body');
    const search = document.getElementById('inventory-search').value.toLowerCase();

    const filtered = system.inventory.filter(m =>
        m.name.toLowerCase().includes(search) || m.id.toLowerCase().includes(search)
    );

    tableBody.innerHTML = filtered.map(m => `
        <tr>
            <td><strong>${m.id}</strong></td>
            <td>${m.name}</td>
            <td><span class="status-badge" style="background: #f1f5f9; color: #475569;">${m.category}</span></td>
            <td><span class="${m.stock < 10 ? 'trend negative' : ''}">${m.stock}</span></td>
            <td>${m.unit}</td>
            <td>
                <button class="btn btn-sm btn-danger" onclick="deleteItem('${m.id}')">
                    <i data-lucide="trash-2" style="width: 14px;"></i>
                </button>
            </td>
        </tr>
    `).join('');
    lucide.createIcons();
}

function renderTransactions() {
    const tableBody = document.getElementById('transactions-table-body');
    const filterSelect = document.getElementById('transaction-type-filter');
    if (!filterSelect) return;

    const filter = filterSelect.value;
    const filtered = filter === 'all'
        ? system.transactions
        : system.transactions.filter(t => t.type === filter);

    tableBody.innerHTML = filtered.map(t => {
        // Handle Supabase field names if they differ
        const mName = t.material_name || t.materialName || (system.inventory.find(m => m.id === t.material_id)?.name);
        const mId = t.material_id || t.materialId;
        const date = t.created_at || t.date;

        return `
            <tr>
                <td>${new Date(date).toLocaleString()}</td>
                <td><span class="status-badge badge-${t.type}">${t.type.toUpperCase()}</span></td>
                <td>${mId}</td>
                <td>${mName}</td>
                <td>${t.quantity}</td>
                <td>${t.person}</td>
            </tr>
        `;
    }).join('');
}

function renderActivity() {
    const list = document.getElementById('recent-activity-list');
    const recent = system.transactions.slice(0, 5);

    if (recent.length === 0) {
        list.innerHTML = '<p style="padding: 2rem; text-align: center; color: var(--text-muted);">Belum ada aktivitas.</p>';
        return;
    }

    list.innerHTML = recent.map(t => {
        const mName = t.material_name || t.materialName || (system.inventory.find(m => m.id === t.material_id)?.name);
        const mId = t.material_id || t.materialId;
        const date = t.created_at || t.date;

        return `
        <div class="activity-item">
            <div class="activity-icon ${t.type === 'in' ? 'badge-in' : 'badge-out'}">
                <i data-lucide="${t.type === 'in' ? 'arrow-down-left' : 'arrow-up-right'}" style="width: 16px;"></i>
            </div>
            <div class="activity-info">
                <div class="activity-title">${t.person} mencatat material ${t.type === 'in' ? 'masuk' : 'keluar'}</div>
                <div class="activity-details">${t.quantity} unit ${mName} (${mId})</div>
            </div>
            <div class="activity-time">${formatTimeAgo(new Date(date))}</div>
        </div>
    `}).join('');
    lucide.createIcons();
}

function renderMaterialSelect() {
    const select = document.getElementById('trans-material-id');
    select.innerHTML = '<option value="" disabled selected>Pilih Material</option>' +
        system.inventory.map(m => `<option value="${m.id}">${m.id} - ${m.name} (${m.stock} ${m.unit} sisa)</option>`).join('');
}

function formatTimeAgo(date) {
    const seconds = Math.floor((new Date() - date) / 1000);
    if (seconds < 60) return 'Baru saja';
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) return `${minutes}m lalu`;
    const hours = Math.floor(minutes / 60);
    if (hours < 24) return `${hours}j lalu`;
    return date.toLocaleDateString();
}

// Modal Handlers
function showModal(modal) {
    modalBackdrop.classList.remove('hidden');
    modal.classList.remove('hidden');
}

function hideModals() {
    modalBackdrop.classList.add('hidden');
    const modals = [modalAdd, modalTrans, modalSettings];
    modals.forEach(m => m.classList.add('hidden'));
}

document.getElementById('btn-add-item').addEventListener('click', () => showModal(modalAdd));
document.getElementById('btn-import-csv').addEventListener('click', () => system.importFromCSV());
document.getElementById('btn-settings').addEventListener('click', () => {
    document.getElementById('sb-url').value = system.config.url;
    document.getElementById('sb-key').value = system.config.key;
    showModal(modalSettings);
});

document.getElementById('btn-material-in').addEventListener('click', () => {
    document.getElementById('transaction-modal-title').textContent = 'Catat Material Masuk';
    document.getElementById('transaction-type').value = 'in';
    document.getElementById('btn-submit-transaction').textContent = 'Terima Barang';
    showModal(modalTrans);
});
document.getElementById('btn-material-out').addEventListener('click', () => {
    document.getElementById('transaction-modal-title').textContent = 'Catat Material Keluar';
    document.getElementById('transaction-type').value = 'out';
    document.getElementById('btn-submit-transaction').textContent = 'Keluarkan Barang';
    showModal(modalTrans);
});

[modalBackdrop, document.getElementById('close-add-item'), document.getElementById('close-transaction'), document.getElementById('close-settings'), document.getElementById('cancel-add-item'), document.getElementById('cancel-transaction')].forEach(el => {
    el?.addEventListener('click', hideModals);
});

// Form Submissions
document.getElementById('form-add-item').addEventListener('submit', async (e) => {
    e.preventDefault();
    const material = {
        id: document.getElementById('new-id').value,
        name: document.getElementById('new-name').value,
        category: document.getElementById('new-category').value || 'Uncategorized',
        stock: 0,
        unit: document.getElementById('new-unit').value
    };

    await system.addMaterial(material);
    e.target.reset();
    hideModals();
});

document.getElementById('form-transaction').addEventListener('submit', async (e) => {
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

document.getElementById('form-settings').addEventListener('submit', async (e) => {
    e.preventDefault();
    const url = document.getElementById('sb-url').value;
    const key = document.getElementById('sb-key').value;
    await system.saveConfig(url, key);
    hideModals();
    alert('Konfigurasi disimpan. Sistem mencoba terhubung...');
});

document.getElementById('btn-disconnect').addEventListener('click', async () => {
    await system.saveConfig('', '');
    hideModals();
    alert('Kembali ke mode lokal.');
});

// Search and Filter Events
document.getElementById('inventory-search').addEventListener('input', renderInventory);
document.getElementById('transaction-type-filter').addEventListener('change', renderTransactions);

// Global Actions
window.deleteItem = async (id) => {
    if (confirm('Hapus material ini?')) {
        await system.deleteMaterial(id);
    }
};

// Initial Render
lucide.createIcons();
system.loadData();
