let appState = null;
let presetsData = null;

let minhashParams = { b: 16, r: 4, k_shingle: 2, threshold: 0.6 };

document.addEventListener('DOMContentLoaded', () => {
    loadAll();
});

async function loadAll() {
    try {
        const [stateRes, presetsRes] = await Promise.all([
            fetch('/api/state').then(r => r.json()),
            fetch('/api/presets').then(r => r.json())
        ]);
        appState = stateRes;
        presetsData = presetsRes;

        minhashParams = stateRes.minhash.params;

        renderPresets();
        updateDocCountBadge();

        const queryInput = document.getElementById('query-text');
        if (queryInput && !queryInput.value.trim() && appState && appState.minhash && appState.minhash.sample_text) {
            queryInput.value = appState.minhash.sample_text;
        }
    } catch (e) {
        console.error(e);
    }
}

function updateDocCountBadge() {
    const badge = document.getElementById('badge-dataset-info');
    const btnCount = document.getElementById('btn-doc-count');
    if (appState && appState.minhash) {
        const count = appState.minhash.doc_count;
        if (badge) badge.textContent = `${count} документов`;
        if (btnCount) btnCount.textContent = `${count}`;
    }
}

function renderPresets() {
    const container = document.getElementById('presets-container');
    if (!container) return;
    container.innerHTML = '';
    const list = presetsData && presetsData.minhash ? presetsData.minhash : [];

    list.forEach((p, idx) => {
        const btn = document.createElement('button');
        btn.className = 'btn-preset' + (idx === 0 ? ' active' : '');
        btn.textContent = p.title;
        btn.onclick = () => selectPreset(p, btn);
        container.appendChild(btn);
    });

    if (list.length > 0) {
        selectPreset(list[0], container.children[0]);
    }
}

function selectPreset(preset, btnElem) {
    document.querySelectorAll('.btn-preset').forEach(b => b.classList.remove('active'));
    if (btnElem) btnElem.classList.add('active');

    document.getElementById('query-text').value = preset.text;
    document.getElementById('thresh-mh').value = preset.threshold;
    document.getElementById('val-thresh-mh').textContent = preset.threshold.toFixed(2);
    minhashParams.threshold = preset.threshold;
}

function onThreshChange(mode, val) {
    const num = parseFloat(val);
    document.getElementById('val-thresh-mh').textContent = num.toFixed(2);
    minhashParams.threshold = num;
}

async function onBandsChange(val) {
    const b = parseInt(val);
    const r = Math.max(2, Math.floor(64 / b));
    minhashParams.b = b;
    minhashParams.r = r;
    document.getElementById('val-br-mh').textContent = `b=${b}, r=${r}`;

    await fetch('/api/minhash/rebuild', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ b, r, k_shingle: minhashParams.k_shingle })
    });
}

async function runSearch() {
    const payload = {
        query_text: document.getElementById('query-text').value,
        threshold: parseFloat(document.getElementById('thresh-mh').value)
    };

    try {
        const res = await fetch('/api/minhash/query', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        }).then(r => r.json());

        renderResults(res);
    } catch (e) {
        console.error(e);
    }
}

let currentView = 'both';

function switchResultsView(view) {
    currentView = view;
    document.getElementById('view-both').classList.toggle('active', view === 'both');
    document.getElementById('view-lsh').classList.toggle('active', view === 'lsh');
    document.getElementById('view-exact').classList.toggle('active', view === 'exact');

    const colLsh = document.getElementById('col-lsh');
    const colExact = document.getElementById('col-exact');

    if (view === 'both') {
        colLsh.classList.remove('hidden', 'full-width');
        colExact.classList.remove('hidden', 'full-width');
    } else if (view === 'lsh') {
        colLsh.classList.remove('hidden');
        colLsh.classList.add('full-width');
        colExact.classList.add('hidden');
    } else {
        colExact.classList.remove('hidden');
        colExact.classList.add('full-width');
        colLsh.classList.add('hidden');
    }
}

function renderResults(data) {
    const m = data.metrics;
    document.getElementById('metrics-card').classList.remove('hidden');

    document.getElementById('metric-time-lsh').textContent = `${m.time_lsh_ms} мс`;
    document.getElementById('metric-time-exact').textContent = `${m.time_exact_ms} мс`;
    const speedupEl = document.getElementById('metric-speedup');
    if (speedupEl) speedupEl.textContent = `${m.speedup}x`;
    document.getElementById('metric-recall').textContent = `${(m.recall * 100).toFixed(0)}%`;
    document.getElementById('metric-precision').textContent = `${(m.precision * 100).toFixed(0)}%`;

    const lshList = document.getElementById('lsh-results-list');
    const exactList = document.getElementById('exact-results-list');
    lshList.innerHTML = '';
    exactList.innerHTML = '';

    function sortByTitle(items) {
        return items.slice().sort((a, b) => {
            const titleA = (a.metadata && a.metadata.title) ? a.metadata.title : (a.title || a.id || '');
            const titleB = (b.metadata && b.metadata.title) ? b.metadata.title : (b.title || b.id || '');
            return titleA.localeCompare(titleB, 'ru', { numeric: true, sensitivity: 'base' });
        });
    }

    const lshItems = sortByTitle(data.lsh_results || []);
    const exactItems = sortByTitle(data.exact_results || []);

    document.getElementById('lsh-badge-info').textContent = `${lshItems.length} найдено`;
    document.getElementById('exact-badge-info').textContent = `${exactItems.length} найдено`;

    function createCard(item) {
        const card = document.createElement('div');
        card.className = 'candidate-card';
        const score = (item.score * 100).toFixed(1);
        const title = (item.metadata && item.metadata.title) ? item.metadata.title : `Документ: ${item.id}`;
        const desc = (item.metadata && item.metadata.text) ? item.metadata.text.substring(0, 95) + '...' : '';

        card.innerHTML = `
            <div class="candidate-text">
                <span class="candidate-title">${title}</span>
                <span class="candidate-desc">${desc}</span>
            </div>
            <span class="candidate-badge">${score}%</span>
        `;
        return card;
    }

    if (lshItems.length === 0) {
        lshList.innerHTML = '<p class="empty-message">В корзинах LSH совпадений не найдено.</p>';
    } else {
        lshItems.forEach(item => lshList.appendChild(createCard(item)));
    }

    if (exactItems.length === 0) {
        exactList.innerHTML = '<p class="empty-message">При полном переборе совпадений не найдено.</p>';
    } else {
        exactItems.forEach(item => exactList.appendChild(createCard(item)));
    }
}

async function regenerateDataset() {
    const count = 1000;
    const res = await fetch('/api/generate_dataset', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ count })
    }).then(r => r.json());

    if (res.status === 'ok') {
        await loadAll();
        runSearch();
    }
}

let dbSearchTimer = null;
let currentTopicFilter = 'all';

async function openDatabaseModal() {
    const modal = document.getElementById('db-modal');
    modal.classList.remove('hidden');
    document.getElementById('db-search-input').value = '';
    loadDatabaseDocs('');
}

function closeDatabaseModal() {
    document.getElementById('db-modal').classList.add('hidden');
}

async function loadDatabaseDocs(searchQuery) {
    const list = document.getElementById('modal-docs-list');
    list.innerHTML = '<p class="empty-message">Загрузка базы данных...</p>';

    try {
        const res = await fetch(`/api/documents?search=${encodeURIComponent(searchQuery)}`).then(r => r.json());
        list.innerHTML = '';

        const items = res.items || [];
        items.sort((a, b) => (a.title || '').localeCompare(b.title || '', 'ru', { numeric: true, sensitivity: 'base' }));
        document.getElementById('modal-subtitle').textContent = `Показано: ${items.length} из ${res.total} документов`;

        if (items.length === 0) {
            list.innerHTML = '<p class="empty-message">Документов не найдено.</p>';
            return;
        }

        items.forEach(item => {
            modalDocsCache[item.id] = item.text;
            const row = document.createElement('div');
            row.className = 'modal-doc-card';

            const snippet = item.text ? (item.text.substring(0, 160) + '...') : '';

            row.innerHTML = `
                <div class="candidate-text">
                    <span class="candidate-title">${item.title}</span>
                    <span class="candidate-desc">${snippet}</span>
                </div>
                <button class="btn-select-doc" onclick="selectDocForSearch('${item.id}')">
                    Выбрать
                </button>
            `;
            list.appendChild(row);
        });
    } catch (e) {
        list.innerHTML = '<p class="empty-message">Ошибка загрузки базы данных.</p>';
    }
}

let modalDocsCache = {};

function filterDatabaseDocs(val) {
    clearTimeout(dbSearchTimer);
    dbSearchTimer = setTimeout(() => {
        loadDatabaseDocs(val);
    }, 200);
}

function selectDocForSearch(docId) {
    if (modalDocsCache[docId]) {
        document.getElementById('query-text').value = modalDocsCache[docId];
        closeDatabaseModal();
        runSearch();
        return;
    }

    fetch(`/api/documents?search=${encodeURIComponent(docId)}`).then(r => r.json()).then(res => {
        if (res.items && res.items.length > 0) {
            document.getElementById('query-text').value = res.items[0].text;
            closeDatabaseModal();
            runSearch();
        }
    });
}
