/**
 * SHIKSHA BUDDY — Main Application Controller
 * Editorial Lusion-inspired UX: dark, cinematic, editorial with premium motion.
 * Integrates:
 * - Clean Claude/ChatGPT study dashboard layout
 * - Floating glass pill dock navigation (Chat, Mind Map, Book, Quiz, Stats)
 * - Empty chat state with random greeting letter-by-letter reveal & 4 floating suggestion chips
 * - Mascot "Bud" state integration (thinking, happy, celebrating)
 * - Friendly note retrieval error replacement ("Hmm, I can't find that in your notes yet...")
 * - Quiz arena: 4 difficulty chips, - 10 + stepper, top progress bar, marigold+ice confetti burst & count-up score
 * - Book reader: max-width 70ch, sticky chapter navigation, Markdown rendering
 * - Stats: 3 glass cards only (accuracy ring, score trend, focus areas)
 * - Zero backend changes: all API routes intact. Zero technical jargon in the UI.
 */

const API = '';  // Same origin

// ─── Global State ────────────────────────────────────────────────────────────
let currentSessionId = null;
Object.defineProperty(window, 'currentSessionId', {
    get() { return currentSessionId; },
    set(v) { currentSessionId = v; },
    configurable: true
});
let currentQuiz = null;       // { quiz_id, questions }
let userAnswers = [];
let bookPollInterval = null;
let activeChapterIndex = -1;
let hasLoadedFirstChapter = false;
let quizQuestionCount = 10;
let selectedDifficulty = 'Conceptual';

// ─── Theme Management (Dark Slate / Light Theme) ──────────────────────────────
function getPreferredTheme() {
    const stored = localStorage.getItem('buddy_theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return 'dark'; // Default readable slate dark theme
}

function updateThemeToggleBtn(theme) {
    const btn = document.getElementById('theme-toggle-btn');
    if (!btn) return;
    if (theme === 'dark') {
        btn.innerHTML = '☀️ Light Mode';
        btn.setAttribute('title', 'Switch to Light Mode');
        btn.setAttribute('aria-label', 'Switch to Light Mode');
    } else {
        btn.innerHTML = '🌙 Dark Mode';
        btn.setAttribute('title', 'Switch to Dark Mode');
        btn.setAttribute('aria-label', 'Switch to Dark Mode');
    }
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const appEl = document.getElementById('app');
    if (appEl) appEl.setAttribute('data-theme', theme);
    const overlayRoot = document.getElementById('overlay-root');
    if (overlayRoot) overlayRoot.setAttribute('data-theme', theme);
    localStorage.setItem('buddy_theme', theme);
    updateThemeToggleBtn(theme);

    // Refresh concept graph if active
    if (window.redrawConceptGraph) {
        window.redrawConceptGraph();
    }

    // Refresh charts if stats view is active
    if (window.loadAnalytics && document.getElementById('stats-view') && !document.getElementById('stats-view').classList.contains('hidden')) {
        window.loadAnalytics();
    }
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || getPreferredTheme();
    const next = current === 'dark' ? 'light' : 'dark';
    applyTheme(next);
}
window.toggleTheme = toggleTheme;
window.applyTheme = applyTheme;

function initTheme() {
    const theme = getPreferredTheme();
    applyTheme(theme);
}
initTheme();

// ─── Toast Notifications ─────────────────────────────────────────────────────
function showToast(message, type = 'info') {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.textContent = message;
    container.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        toast.style.transform = 'translateY(8px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}
window.showToast = showToast;

function showToastWithAction(message, actionLabel, actionCallback, durationMs = 6000) {
    const container = document.getElementById('toast-container');
    if (!container) return null;
    const toast = document.createElement('div');
    toast.className = 'toast info toast-with-undo';
    toast.style.cssText = 'display:flex;align-items:center;justify-content:space-between;gap:14px;background:#23081F;border:1px solid rgba(234,170,0,0.3);';

    const msgSpan = document.createElement('span');
    msgSpan.textContent = message;
    toast.appendChild(msgSpan);

    const btn = document.createElement('button');
    btn.textContent = actionLabel;
    btn.style.cssText = 'background:var(--marigold);color:#12060F;border:none;border-radius:6px;font-weight:700;padding:4px 10px;font-size:0.78rem;cursor:pointer;flex-shrink:0;';

    let isDismissed = false;
    btn.onclick = (e) => {
        e.stopPropagation();
        if (isDismissed) return;
        isDismissed = true;
        toast.remove();
        actionCallback();
    };
    toast.appendChild(btn);

    container.appendChild(toast);

    const timer = setTimeout(() => {
        if (!isDismissed) {
            isDismissed = true;
            toast.style.opacity = '0';
            toast.style.transform = 'translateY(8px)';
            setTimeout(() => toast.remove(), 300);
        }
    }, durationMs);

    return {
        dismiss: () => {
            clearTimeout(timer);
            if (!isDismissed) {
                isDismissed = true;
                toast.remove();
            }
        }
    };
}
window.showToastWithAction = showToastWithAction;

// ─── 2-Stage View Transition (Landing <-> App Studio) ────────────────────────
function enterApp(workspaceIndex = 0) {
    if (window.PageTransitions && window.PageTransitions.navigate) {
        window.PageTransitions.navigate('app', workspaceIndex);
        return;
    }
    const landing = document.getElementById('landing-view');
    const app = document.getElementById('app-view') || document.getElementById('app');
    if (landing && app) {
        landing.style.display = 'none';
        app.style.display = 'flex';
        document.body.classList.add('in-app-mode', 'is-app');
        if (window.destroyLenis) window.destroyLenis();
        if (window.HeroShader) window.HeroShader.pause();
        if (window.HeroParticles) window.HeroParticles.pause();
        switchWorkspace(workspaceIndex);
    }
}
window.enterApp = enterApp;

function exitToLanding() {
    if (window.PageTransitions && window.PageTransitions.navigate) {
        window.PageTransitions.navigate('landing');
        return;
    }
    const landing = document.getElementById('landing-view');
    const app = document.getElementById('app-view') || document.getElementById('app');
    if (landing && app) {
        app.style.display = 'none';
        landing.style.display = 'block';
        document.body.classList.remove('in-app-mode', 'is-app');
        if (window.initLenis) window.initLenis();
        if (window.HeroShader) window.HeroShader.resume();
        if (window.HeroParticles) window.HeroParticles.resume();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
}
window.exitToLanding = exitToLanding;

// ─── Slim Sidebar Collapse / Expand ──────────────────────────────────────────
function toggleSidebar() {
    const sidebar = document.getElementById('app-sidebar');
    const expandBtn = document.getElementById('btn-sidebar-expand');
    if (sidebar) {
        sidebar.classList.toggle('collapsed');
        if (expandBtn) {
            expandBtn.style.display = sidebar.classList.contains('collapsed') ? 'flex' : 'none';
        }
    }
}
window.toggleSidebar = toggleSidebar;
window.toggleVaultDrawer = toggleSidebar; // backward compatibility

// ─── Workspace Switching via Floating Glass Dock ─────────────────────────────
function switchWorkspace(index) {
    index = parseInt(index);
    document.querySelectorAll('.workspace-panel').forEach(p => p.classList.remove('active'));
    document.querySelectorAll('.dock-item').forEach(d => d.classList.remove('active'));

    const panel = document.getElementById(`ws-${index}`);
    if (panel) panel.classList.add('active');

    const dockItem = document.querySelector(`.dock-item[data-ws="${index}"]`);
    if (dockItem) dockItem.classList.add('active');

    const wsHashes = ['#app/chat', '#app/ask', '#app/map', '#app/book', '#app/summary', '#app/quiz', '#app/stats'];
    if (document.body.classList.contains('in-app-mode') && wsHashes[index]) {
        history.replaceState(null, '', wsHashes[index]);
    }

    // Sync segmented switch (From my notes = 0, Ask anything = 1)
    document.querySelectorAll('.mode-tab[data-mode="notes"]').forEach(btn => {
        if (index === 0) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        }
    });
    document.querySelectorAll('.mode-tab[data-mode="ask"]').forEach(btn => {
        if (index === 1) {
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
        } else {
            btn.classList.remove('active');
            btn.setAttribute('aria-selected', 'false');
        }
    });

    // Load workspace data when active
    if (currentSessionId) {
        if (index === 1) loadAskHistory();
        if (index === 2) loadConceptMap();
        if (index === 3) pollBookStatus();
        if (index === 4) {
            const dot = document.getElementById('summary-dock-dot');
            if (dot) dot.style.display = 'none';
            if (typeof pendingBackgroundSummary !== 'undefined' && pendingBackgroundSummary && pendingBackgroundSummary.tag && pendingBackgroundSummary.tag.session_id === currentSessionId) {
                const pending = pendingBackgroundSummary;
                pendingBackgroundSummary = null;
                viewSummaryResult(pending.tag, pending.result);
            } else if (window.initSummaryStudio) {
                window.initSummaryStudio();
            }
        }
        if (index === 6) loadAnalytics();
    }
}
window.switchWorkspace = switchWorkspace;

function switchChatMode(mode) {
    if (mode === 'notes') {
        switchWorkspace(0);
    } else if (mode === 'ask') {
        switchWorkspace(1);
    }
}
window.switchChatMode = switchChatMode;

// ─── Smart Auto-Scroll ───────────────────────────────────────────────────────
function scrollToBottomIfNear(container, force = false) {
    if (!container) return;
    const distanceToBottom = container.scrollHeight - container.scrollTop - container.clientHeight;
    if (force || distanceToBottom <= 120) {
        container.scrollTop = container.scrollHeight;
    }
}

// ─── File Manager & Counter (Phase 4.5 & C3/C9) ───────────────────────────────────
let currentSessionFiles = [];
let sessionBlurbs = {};
let blurbLoadingState = {};
let blurbTimeouts = {};

function cleanFileName(rawName) {
    if (!rawName) return 'Document';
    return rawName.replace(/^[0-9a-f]{16,}_/i, '').replace(/^[0-9a-f]{8,32}[_-]/i, '');
}
window.cleanFileName = cleanFileName;

function formatBytes(bytes) {
    if (!bytes || bytes === 0) return '0 KB';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(1)) + ' ' + sizes[i];
}

async function loadSessionBlurbs() {
    if (!currentSessionId) return;
    try {
        const res = await fetch(`${API}/api/summary/blurbs?session_id=${currentSessionId}`);
        if (!res.ok) return;
        const blurbs = await res.json();
        sessionBlurbs = blurbs || {};
        document.querySelectorAll('.file-blurb-container').forEach(el => {
            const fid = el.dataset.fileId;
            if (fid && sessionBlurbs[fid]) {
                blurbLoadingState[fid] = false;
                if (blurbTimeouts[fid]) clearTimeout(blurbTimeouts[fid]);
                el.innerHTML = `<div class="desk-file-blurb file-blurb-text">${escapeHtml(sessionBlurbs[fid])}</div>`;
            } else if (fid && !blurbLoadingState[fid]) {
                el.innerHTML = '';
            }
        });
    } catch (e) {
        console.error('Failed to load blurbs:', e);
    }
}
window.loadSessionBlurbs = loadSessionBlurbs;

async function loadSessionFiles(sessionId) {
    if (!sessionId) return;
    try {
        const res = await fetch(`${API}/api/files?session_id=${sessionId}`);
        if (!res.ok) return;
        const files = await res.json();
        currentSessionFiles = files || [];
        currentSessionFiles.forEach(f => {
            if (!sessionBlurbs[f.id]) {
                blurbLoadingState[f.id] = true;
                if (blurbTimeouts[f.id]) clearTimeout(blurbTimeouts[f.id]);
                blurbTimeouts[f.id] = setTimeout(() => {
                    blurbLoadingState[f.id] = false;
                    document.querySelectorAll(`.file-blurb-container[data-file-id="${f.id}"]`).forEach(el => {
                        if (!sessionBlurbs[f.id]) el.innerHTML = '';
                    });
                }, 20000);
            }
        });
        updateFileUI(files);
        loadSessionBlurbs();
    } catch (e) {
        console.error('Failed to load session files:', e);
    }
}
window.loadSessionFiles = loadSessionFiles;

function updateFileUI(files) {
    const count = files ? files.length : 0;
    let totalBytes = 0;
    if (files) {
        files.forEach(f => { totalBytes += (f.size || 0); });
    }

    // Update Sidebar pill
    const sidebarText = document.getElementById('sidebar-file-count-text');
    const sidebarPill = document.getElementById('sidebar-file-pill');
    if (sidebarText && sidebarPill) {
        sidebarText.textContent = count === 0 ? 'No files yet' : `${count} file${count > 1 ? 's' : ''}`;
        if (count > 0) {
            sidebarPill.classList.add('has-files');
        } else {
            sidebarPill.classList.remove('has-files');
        }
        sidebarPill.classList.remove('pill-pop');
        void sidebarPill.offsetWidth;
        sidebarPill.classList.add('pill-pop');
    }

    // Update Input bar pill
    const inputPillText = document.getElementById('input-file-pill-count');
    const inputPillBtn = document.getElementById('btn-chat-attach');
    if (inputPillText && inputPillBtn) {
        inputPillText.textContent = count === 0 ? 'No files yet' : `${count} file${count > 1 ? 's' : ''}`;
        if (count > 0) {
            inputPillBtn.classList.add('has-files');
        } else {
            inputPillBtn.classList.remove('has-files');
        }
        inputPillBtn.classList.remove('pill-pop');
        void inputPillBtn.offsetWidth;
        inputPillBtn.classList.add('pill-pop');
    }

    // Update Removable chips bar above input
    const chipsBar = document.getElementById('input-file-chips-bar');
    if (chipsBar) {
        if (count === 0) {
            chipsBar.innerHTML = '';
        } else {
            chipsBar.innerHTML = files.map(f => {
                const displayName = cleanFileName(f.name);
                return `
                <div class="input-file-chip" title="${escapeHtml(displayName)} (${formatBytes(f.size)})">
                    <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><path d="m21.44 11.05-9.19 9.19a6 6 0 0 1-8.49-8.49l8.57-8.57A4 4 0 1 1 18 8.84l-8.59 8.57a2 2 0 0 1-2.83-2.83l7.88-7.87"/></svg>
                    <span>${escapeHtml(displayName.length > 22 ? displayName.slice(0, 20) + '…' : displayName)}</span>
                    <button class="input-file-chip-remove" onclick="deleteFile(${f.id})" title="Remove file" aria-label="Remove ${escapeHtml(displayName)}">×</button>
                </div>
            `;}).join('');
        }
    }

    // Update Drawer
    const drawerSummary = document.getElementById('drawer-files-summary');
    if (drawerSummary) {
        drawerSummary.textContent = `${count} file${count === 1 ? '' : 's'} · ${formatBytes(totalBytes)}`;
    }
    const drawerList = document.getElementById('drawer-files-list');
    if (drawerList) {
        if (count === 0) {
            drawerList.innerHTML = `<div style="padding:40px 20px;text-align:center;color:var(--text-muted);font-size:0.88rem;">No files uploaded in this session yet.<br>Click "Add more files" or drop files here.</div>`;
        } else {
            drawerList.innerHTML = files.map(f => {
                const displayName = cleanFileName(f.name);
                const blurb = sessionBlurbs[f.id];
                return `
                <div class="drawer-file-item">
                    <div class="drawer-file-left">
                        <div class="drawer-file-icon">
                            <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        </div>
                        <div class="drawer-file-info">
                            <div class="drawer-file-name" title="${escapeHtml(displayName)}">${escapeHtml(displayName)}</div>
                            <div class="file-blurb-container" data-file-id="${f.id}">
                                ${blurb ? `<div class="file-blurb-text">${escapeHtml(blurb)}</div>` : `<div class="file-blurb-placeholder"></div>`}
                            </div>
                            <div class="drawer-file-meta">
                                <span>${formatBytes(f.size)}</span>
                                <span>•</span>
                                <span class="drawer-status-ready">Ready ✓</span>
                            </div>
                        </div>
                    </div>
                    <button class="btn-file-delete" onclick="deleteFile(${f.id})" title="Delete file" aria-label="Delete ${escapeHtml(displayName)}">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                    </button>
                </div>
            `;}).join('');
        }
    }
}

function toggleFileManager(open) {
    const overlay = document.getElementById('file-manager-overlay');
    const drawer = document.getElementById('file-manager-drawer');
    if (!overlay || !drawer) return;
    if (open) {
        overlay.classList.add('open');
        drawer.classList.add('open');
    } else {
        overlay.classList.remove('open');
        drawer.classList.remove('open');
    }
}
window.toggleFileManager = toggleFileManager;

async function deleteFile(id) {
    try {
        const res = await fetch(`${API}/api/files/${id}`, { method: 'DELETE' });
        const data = await res.json();
        if (res.ok) {
            showToast('File removed', 'info');
            if (currentSessionId) {
                await loadSessionFiles(currentSessionId);
                const chatContainer = document.getElementById('chat-messages-container');
                if (chatContainer && chatContainer.querySelector('.empty-chat-hero')) {
                    renderWelcomeMessage(chatContainer, false);
                }
            }
            loadSessions();
        } else {
            showToast(`Failed: ${data.detail || 'Error'}`, 'error');
        }
    } catch (e) {
        showToast('Error removing file', 'error');
    }
}
window.deleteFile = deleteFile;

async function uploadFiles(files) {
    if (!currentSessionId) {
        showToast('Please create or select a study session first', 'error');
        return;
    }
    if (!files || files.length === 0) return;

    if (window.setBudState) window.setBudState('thinking');
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        showToast(`Uploading ${file.name}...`, 'info');
        const formData = new FormData();
        formData.append('file', file);
        formData.append('session_id', currentSessionId);
        try {
            const res = await fetch(`${API}/api/upload`, { method: 'POST', body: formData });
            const data = await res.json();
            if (res.ok) {
                showToast(data.message || `Uploaded ${file.name}`, 'success');
            } else {
                showToast(`Upload failed: ${data.detail || 'Error'}`, 'error');
            }
        } catch (e) {
            showToast(`Upload error: ${e.message}`, 'error');
        }
    }
    if (window.setBudState) window.setBudState('happy');
    await loadSessionFiles(currentSessionId);
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer && chatContainer.querySelector('.empty-chat-hero')) {
        renderWelcomeMessage(chatContainer, false);
    }
    loadSessions();
}
window.uploadFiles = uploadFiles;

function initUpload() {
    const fileInput = document.getElementById('global-file-input');
    if (!fileInput) return;
    fileInput.addEventListener('change', (e) => {
        if (e.target.files && e.target.files.length) {
            uploadFiles(e.target.files);
            e.target.value = '';
        }
    });
}

function triggerFileUpload() {
    const fileInput = document.getElementById('global-file-input');
    if (fileInput) fileInput.click();
}
window.triggerFileUpload = triggerFileUpload;

function initDragAndDrop() {
    const overlay = document.getElementById('drag-drop-overlay');
    if (!overlay) return;

    window.addEventListener('dragenter', (e) => {
        if (document.body.classList.contains('in-app-mode')) {
            overlay.classList.add('drag-active');
        }
    });

    overlay.addEventListener('dragover', (e) => {
        e.preventDefault();
    });

    overlay.addEventListener('dragleave', (e) => {
        if (e.target === overlay) {
            overlay.classList.remove('drag-active');
        }
    });

    overlay.addEventListener('drop', (e) => {
        e.preventDefault();
        overlay.classList.remove('drag-active');
        if (e.dataTransfer && e.dataTransfer.files) {
            uploadFiles(e.dataTransfer.files);
        }
    });
}

// ─── Sessions State & Management ─────────────────────────────────────────────
let currentSessionsList = [];
let isBulkSelectMode = false;
let selectedSessionIds = new Set();
let activeDeleteSessionId = null;
let pendingPurgeTimers = new Map(); // id -> { timeout, toastObj }
let searchDebounceTimer = null;
let currentSearchQuery = '';
let focusedSearchIndex = -1;

async function loadSessions() {
    try {
        const res = await fetch(`${API}/api/sessions`);
        const sessions = await res.json();
        currentSessionsList = sessions || [];
        if (!currentSearchQuery) {
            renderSessionList(currentSessionsList);
        }
        const currentStillExists = currentSessionsList.some(s => s.id === currentSessionId);
        if (currentSessionsList.length > 0 && (!currentSessionId || !currentStillExists)) {
            selectSession(currentSessionsList[0].id);
        } else if (currentSessionsList.length === 0) {
            createDefaultSession();
        }
    } catch (e) {
        console.error('Failed to load sessions:', e);
    }
}

async function createDefaultSession() {
    try {
        const res = await fetch(`${API}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: 'My Study Notes' })
        });
        const session = await res.json();
        currentSessionId = session.id;
        loadSessions();
    } catch (e) {}
}

function renderSessionList(sessions, isSearch = false, query = '') {
    const list = document.getElementById('session-list');
    if (!list) return;

    if (isSearch) {
        if (!sessions || sessions.length === 0) {
            list.innerHTML = `<div class="search-empty-state">No chats match “${escapeHtml(query)}”</div>`;
            return;
        }

        // Group results by Today / Yesterday / Previous 7 days / Older
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime();
        const startOfYesterday = startOfToday - 86400000;
        const startOf7Days = startOfToday - 86400000 * 7;

        const groups = {
            today: [],
            yesterday: [],
            last7: [],
            older: []
        };

        sessions.forEach(s => {
            const time = s.updated_at ? new Date(s.updated_at).getTime() : startOfToday;
            if (time >= startOfToday) {
                groups.today.push(s);
            } else if (time >= startOfYesterday) {
                groups.yesterday.push(s);
            } else if (time >= startOf7Days) {
                groups.last7.push(s);
            } else {
                groups.older.push(s);
            }
        });

        function highlightMatch(text, q) {
            if (!q || !text) return escapeHtml(text || '');
            const safeQ = q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            const regex = new RegExp(`(${safeQ})`, 'gi');
            return escapeHtml(text).replace(regex, '<mark class="search-highlight">$1</mark>');
        }

        let html = '';
        let itemIndex = 0;

        function renderGroup(title, items) {
            if (!items.length) return '';
            let groupHtml = `<div class="search-group-header">${title}</div>`;
            items.forEach(s => {
                const isSelected = itemIndex === focusedSearchIndex;
                groupHtml += `
                    <div class="session-item search-result-item ${isSelected ? 'active' : ''}" 
                         data-id="${s.id}"
                         data-search-idx="${itemIndex}"
                         onclick="selectSession(${s.id}); clearChatSearch();">
                        <div style="flex:1;min-width:0;">
                            <div class="session-title-text" style="font-weight:600;color:var(--ice);">${highlightMatch(s.title || 'Untitled Session', query)}</div>
                            ${s.snippet ? `<div class="search-snippet">${highlightMatch(s.snippet, query)}</div>` : ''}
                        </div>
                    </div>
                `;
                itemIndex++;
            });
            return groupHtml;
        }

        html += renderGroup('Today', groups.today);
        html += renderGroup('Yesterday', groups.yesterday);
        html += renderGroup('Previous 7 days', groups.last7);
        html += renderGroup('Older', groups.older);

        list.innerHTML = html;
        return;
    }

    // Normal session list rendering
    list.innerHTML = sessions.map(s => {
        const isActive = s.id === currentSessionId;
        const isChecked = selectedSessionIds.has(s.id);
        const count = isActive && currentSessionFiles.length > 0 ? currentSessionFiles.length : (s.doc_count || 0);
        const fileCountText = count > 0 ? `${count} file${count > 1 ? 's' : ''}` : '';

        return `
            <div class="session-row-wrapper" id="session-wrapper-${s.id}">
                <div class="session-row-inner">
                    <div class="session-item ${isActive ? 'active' : ''}" 
                         data-id="${s.id}"
                         tabindex="0"
                         onkeydown="handleSessionKeydown(${s.id}, event)"
                         onclick="selectSession(${s.id})">
                        ${isBulkSelectMode ? `
                            <input type="checkbox" class="session-select-checkbox" 
                                   style="margin-right:8px;accent-color:var(--marigold);"
                                   ${isChecked ? 'checked' : ''} 
                                   onclick="toggleSessionSelect(${s.id}, this, event)" />
                        ` : ''}
                        <span class="session-title-text" 
                              id="session-title-${s.id}"
                              title="Double click to rename"
                              ondblclick="startRenameSession(${s.id}, event)"
                              style="overflow:hidden;text-overflow:ellipsis;white-space:nowrap;flex:1;margin-right:6px;">
                            ${escapeHtml(s.title || 'Untitled Session')}
                        </span>
                        <div class="session-item-actions">
                            <button class="btn-session-action action-rename" onclick="startRenameSession(${s.id}, event)" title="Rename chat" aria-label="Rename">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M17 3a2.85 2.83 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5Z"/><path d="m15 5 4 4"/></svg>
                            </button>
                            <button class="btn-session-action action-trash" onclick="openDeletePopover(${s.id}, event)" title="Delete chat" aria-label="Delete">
                                <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8"><path d="M3 6h18"/><path d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6"/><path d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2"/><line x1="10" y1="11" x2="10" y2="17"/><line x1="14" y1="11" x2="14" y2="17"/></svg>
                            </button>
                        </div>
                        ${fileCountText ? `<span class="session-files-badge ${isActive ? 'active-badge' : ''}">${fileCountText}</span>` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

async function selectSession(id) {
    id = parseInt(id);
    currentSessionId = id;
    try {
        const res = await fetch(`${API}/api/sessions/${id}`);
        if (!res.ok) {
            console.warn(`Session ${id} not found, reloading sessions...`);
            currentSessionId = null;
            loadSessions();
            return;
        }
        const session = await res.json();

        // Update header title
        const titleEl = document.getElementById('session-header-title');
        if (titleEl && session.title) {
            titleEl.textContent = session.title;
        }

        // Update sidebar active state
        document.querySelectorAll('.session-item').forEach(el => el.classList.remove('active'));
        const activeItem = document.querySelector(`.session-item[data-id="${id}"]`);
        if (activeItem) activeItem.classList.add('active');

        // Load session files first
        await loadSessionFiles(id);

        // Load chat history for Study Chat
        renderChatHistory(session.messages || []);

        // Load ask history for Ask board
        loadAskHistory();

        // Reset book state for new session
        hasLoadedFirstChapter = false;
        activeChapterIndex = -1;
        pollBookStatus();

        // Load blurbs and notebook items for session
        loadSessionBlurbs();
        if (window.loadNotebookItems) window.loadNotebookItems();
        if (window.initSummaryStudio) window.initSummaryStudio();

        // If on Analytics, Summary, or Map, reload
        const activeDock = document.querySelector('.dock-item.active');
        if (activeDock) {
            const ws = parseInt(activeDock.dataset.ws);
            if (ws === 6) loadAnalytics();
            if (ws === 4 && window.initSummaryStudio) window.initSummaryStudio();
            if (ws === 2) loadConceptMap();
        }

        if (!currentSearchQuery) {
            renderSessionList(currentSessionsList);
        }
    } catch (e) {
        console.error('Failed to load session:', e);
    }
}
window.selectSession = selectSession;

async function createSession() {
    const title = prompt('Name your study session:', 'New Topic');
    if (!title || !title.trim()) return;
    try {
        const res = await fetch(`${API}/api/sessions`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: title.trim() })
        });
        const session = await res.json();
        currentSessionId = session.id;
        showToast(`Created "${title.trim()}"`, 'success');
        await loadSessions();
        selectSession(session.id);
    } catch (e) {
        showToast('Failed to create session', 'error');
    }
}
window.createSession = createSession;

// ─── Rename & Auto-Titling ───────────────────────────────────────────────────
async function renameSession(id, newTitle) {
    if (!newTitle || !newTitle.trim()) return;
    try {
        const res = await fetch(`${API}/api/sessions/${id}`, {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ title: newTitle.trim() })
        });
        if (res.ok) {
            const updated = await res.json();
            const session = currentSessionsList.find(s => s.id === id);
            if (session) session.title = updated.title;
            if (currentSessionId === id) {
                const headerTitle = document.getElementById('session-header-title');
                if (headerTitle) headerTitle.textContent = updated.title;
            }
            renderSessionList(currentSessionsList);
            showToast('Chat renamed', 'info');
        }
    } catch (e) {
        showToast('Could not rename chat', 'error');
    }
}
window.renameSession = renameSession;

function startRenameSession(id, e) {
    if (e) e.stopPropagation();
    const session = currentSessionsList.find(s => s.id === id);
    const oldTitle = session ? session.title : 'New Topic';
    const newTitle = prompt('Rename chat:', oldTitle);
    if (newTitle && newTitle.trim() && newTitle.trim() !== oldTitle) {
        renameSession(id, newTitle);
    }
}
window.startRenameSession = startRenameSession;

function autoTitleSessionFromMessage(userMessage) {
    if (!currentSessionId) return;
    const session = currentSessionsList.find(s => s.id === currentSessionId);
    if (!session) return;
    const title = (session.title || '').trim().toLowerCase();
    const isDefault = !title || title === 'untitled session' || title === 'my study notes' || title === 'new topic' || title.startsWith('new study session') || title.startsWith('new session') || title.startsWith('untitled');
    if (isDefault) {
        const words = userMessage.trim().replace(/[?!.,;:"'#*]/g, '').split(/\s+/).filter(Boolean).slice(0, 6);
        if (words.length > 0) {
            const newTitle = words.map(w => w.charAt(0).toUpperCase() + w.slice(1).toLowerCase()).join(' ');
            renameSession(currentSessionId, newTitle);
        }
    }
}

// ─── Delete & Undo Popover Handler ───────────────────────────────────────────
function openDeletePopover(id, e) {
    if (e) e.stopPropagation();
    activeDeleteSessionId = id;
    const popover = document.getElementById('chat-delete-popover');
    if (!popover) return;

    if (e && e.currentTarget) {
        const rect = e.currentTarget.getBoundingClientRect();
        popover.style.top = `${Math.min(window.innerHeight - 150, Math.max(10, rect.bottom + 6))}px`;
        popover.style.left = `${Math.min(window.innerWidth - 300, Math.max(10, rect.left - 180))}px`;
    } else {
        popover.style.top = '120px';
        popover.style.left = '20px';
    }
    popover.style.display = 'block';
}
window.openDeletePopover = openDeletePopover;

function closeDeletePopover() {
    activeDeleteSessionId = null;
    const popover = document.getElementById('chat-delete-popover');
    if (popover) popover.style.display = 'none';
}
window.closeDeletePopover = closeDeletePopover;

function handleSessionKeydown(id, e) {
    if (e.key === 'Delete' || e.key === 'Backspace') {
        openDeletePopover(id, e);
    }
}
window.handleSessionKeydown = handleSessionKeydown;

async function confirmDeleteCurrentRow() {
    const id = activeDeleteSessionId;
    closeDeletePopover();
    if (!id) return;

    // 1. Animate row collapse immediately
    const wrapper = document.getElementById(`session-wrapper-${id}`);
    if (wrapper) wrapper.classList.add('is-collapsing');

    // 2. Perform soft-delete on backend
    try {
        const res = await fetch(`${API}/api/sessions/${id}?soft=true`, { method: 'DELETE' });
        const data = await res.json();

        // Update active chat if needed
        const wasActive = currentSessionId === id;
        currentSessionsList = currentSessionsList.filter(s => s.id !== id);

        if (wasActive) {
            if (currentSessionsList.length > 0) {
                selectSession(currentSessionsList[0].id);
            } else {
                createDefaultSession();
            }
        }

        // Update file count badges
        const pillText = document.getElementById('sidebar-file-count-text');
        if (pillText && data.total_files !== undefined) {
            pillText.textContent = data.total_files > 0 ? `${data.total_files} notes file${data.total_files > 1 ? 's' : ''}` : 'No files yet';
        }

        // 3. Show 6-second undo toast
        let isRestored = false;
        const toastHandle = showToastWithAction('Chat deleted', 'Undo', async () => {
            isRestored = true;
            // Restore chat
            try {
                const restRes = await fetch(`${API}/api/sessions/${id}/restore`, { method: 'POST' });
                if (restRes.ok) {
                    showToast('Chat restored', 'success');
                    await loadSessions();
                    selectSession(id);
                }
            } catch (err) {
                showToast('Failed to restore chat', 'error');
            }
        }, 6000);

        // 4. If 6s timer expires without undo, execute permanent purge
        const purgeTimer = setTimeout(async () => {
            pendingPurgeTimers.delete(id);
            if (!isRestored) {
                try {
                    await fetch(`${API}/api/sessions/${id}`, { method: 'DELETE' });
                } catch (err) {}
            }
        }, 6200);

        pendingPurgeTimers.set(id, { timer: purgeTimer, toast: toastHandle });
    } catch (e) {
        showToast('Failed to delete chat', 'error');
        if (wrapper) wrapper.classList.remove('is-collapsing');
    }
}
window.confirmDeleteCurrentRow = confirmDeleteCurrentRow;

// ─── Bulk Select & Operations ────────────────────────────────────────────────
function toggleBulkSelectMode() {
    isBulkSelectMode = !isBulkSelectMode;
    selectedSessionIds.clear();

    const selectBtn = document.getElementById('btn-sidebar-select');
    const bulkBar = document.getElementById('sidebar-bulk-bar');
    if (selectBtn) selectBtn.classList.toggle('active', isBulkSelectMode);
    if (bulkBar) bulkBar.style.display = isBulkSelectMode ? 'flex' : 'none';

    updateBulkBarState();
    renderSessionList(currentSessionsList);
}
window.toggleBulkSelectMode = toggleBulkSelectMode;

function toggleSessionSelect(id, checkbox, e) {
    if (e) e.stopPropagation();
    if (checkbox.checked) {
        selectedSessionIds.add(id);
    } else {
        selectedSessionIds.delete(id);
    }
    updateBulkBarState();
}
window.toggleSessionSelect = toggleSessionSelect;

function toggleSelectAllChats(checkbox) {
    if (checkbox.checked) {
        currentSessionsList.forEach(s => selectedSessionIds.add(s.id));
    } else {
        selectedSessionIds.clear();
    }
    updateBulkBarState();
    renderSessionList(currentSessionsList);
}
window.toggleSelectAllChats = toggleSelectAllChats;

function updateBulkBarState() {
    const countEl = document.getElementById('bulk-selected-count');
    const deleteBtn = document.getElementById('btn-bulk-delete-btn');
    const count = selectedSessionIds.size;
    if (countEl) countEl.textContent = `${count} selected`;
    if (deleteBtn) {
        deleteBtn.textContent = `Delete selected (${count})`;
        deleteBtn.disabled = count === 0;
    }
}

function toggleBulkMenu(e) {
    if (e) e.stopPropagation();
    const menu = document.getElementById('bulk-dropdown-menu');
    if (menu) {
        menu.style.display = menu.style.display === 'none' ? 'block' : 'none';
    }
}
window.toggleBulkMenu = toggleBulkMenu;

document.addEventListener('click', () => {
    const menu = document.getElementById('bulk-dropdown-menu');
    if (menu) menu.style.display = 'none';
});

async function deleteSelectedChats() {
    if (selectedSessionIds.size === 0) return;
    const count = selectedSessionIds.size;
    if (!confirm(`Delete ${count} selected chat${count > 1 ? 's' : ''}? Their messages and files will be removed.`)) return;

    const idsToDelete = Array.from(selectedSessionIds);
    // Animate collapse on all selected rows
    idsToDelete.forEach(id => {
        const wrapper = document.getElementById(`session-wrapper-${id}`);
        if (wrapper) wrapper.classList.add('is-collapsing');
    });

    try {
        const res = await fetch(`${API}/api/sessions/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_ids: idsToDelete })
        });
        const data = await res.json();
        showToast(`Deleted ${data.deleted_count || count} chats`, 'info');
        toggleBulkSelectMode();
        await loadSessions();
        if (currentSessionsList.length > 0) {
            selectSession(currentSessionsList[0].id);
        } else {
            createDefaultSession();
        }
    } catch (e) {
        showToast('Failed to delete selected chats', 'error');
    }
}
window.deleteSelectedChats = deleteSelectedChats;

async function confirmDeleteAllChats() {
    const confirmation = prompt('This will permanently delete all your study sessions and uploaded files.\n\nType DELETE to confirm:');
    if (confirmation !== 'DELETE') {
        showToast('Deletion canceled', 'info');
        return;
    }

    try {
        const res = await fetch(`${API}/api/sessions/bulk-delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ all: true })
        });
        showToast('All chats deleted', 'info');
        toggleBulkSelectMode();
        currentSessionsList = [];
        createDefaultSession();
    } catch (e) {
        showToast('Failed to delete all chats', 'error');
    }
}
window.confirmDeleteAllChats = confirmDeleteAllChats;

// ─── Chat Search Implementation ─────────────────────────────────────────────
function initChatSearch() {
    const searchInput = document.getElementById('sidebar-chat-search');
    const clearBtn = document.getElementById('sidebar-search-clear');
    if (!searchInput) return;

    searchInput.addEventListener('input', (e) => {
        const q = e.target.value.trim();
        currentSearchQuery = q;
        if (clearBtn) clearBtn.style.display = q ? 'block' : 'none';
        focusedSearchIndex = -1;

        clearTimeout(searchDebounceTimer);
        searchDebounceTimer = setTimeout(async () => {
            if (!q) {
                renderSessionList(currentSessionsList);
                return;
            }
            try {
                const res = await fetch(`${API}/api/sessions/search?q=${encodeURIComponent(q)}`);
                const results = await res.json();
                renderSessionList(results, true, q);
            } catch (err) {
                console.error('Search error:', err);
            }
        }, 150); // 150ms debounce as specified
    });

    searchInput.addEventListener('keydown', (e) => {
        const resultItems = Array.from(document.querySelectorAll('.search-result-item'));
        if (e.key === 'ArrowDown') {
            e.preventDefault();
            if (resultItems.length > 0) {
                focusedSearchIndex = (focusedSearchIndex + 1) % resultItems.length;
                resultItems.forEach((el, idx) => el.classList.toggle('active', idx === focusedSearchIndex));
            }
        } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            if (resultItems.length > 0) {
                focusedSearchIndex = (focusedSearchIndex - 1 + resultItems.length) % resultItems.length;
                resultItems.forEach((el, idx) => el.classList.toggle('active', idx === focusedSearchIndex));
            }
        } else if (e.key === 'Enter') {
            e.preventDefault();
            const target = focusedSearchIndex >= 0 ? resultItems[focusedSearchIndex] : resultItems[0];
            if (target) {
                const id = parseInt(target.dataset.id);
                selectSession(id);
                clearChatSearch();
            }
        } else if (e.key === 'Escape') {
            clearChatSearch();
            searchInput.blur();
        }
    });

    // Global shortcut: Ctrl+K or Cmd+K focuses search
    window.addEventListener('keydown', (e) => {
        if ((e.ctrlKey || e.metaKey) && (e.key === 'k' || e.key === 'K')) {
            e.preventDefault();
            searchInput.focus();
            searchInput.select();
        }
    });
}

function clearChatSearch() {
    const searchInput = document.getElementById('sidebar-chat-search');
    const clearBtn = document.getElementById('sidebar-search-clear');
    currentSearchQuery = '';
    focusedSearchIndex = -1;
    if (searchInput) searchInput.value = '';
    if (clearBtn) clearBtn.style.display = 'none';
    renderSessionList(currentSessionsList);
}
window.clearChatSearch = clearChatSearch;
window.createSession = createSession;

// ─── Phase 4.2: Dynamic Centered Welcome Message ─────────────────────────────
const GREETINGS = [
    "Hello, friend 👋",
    "Ready to learn something new? ✨",
    "Hey buddy, what are we studying today? 📖",
    "Let's make exam day easy 🚀"
];

function renderWelcomeMessage(container, isAsk = false) {
    if (!container) return;
    container.innerHTML = '';

    const hero = document.createElement('div');
    hero.className = 'empty-chat-hero';
    hero.id = isAsk ? 'ask-empty-state' : 'chat-empty-state';

    const chosen = GREETINGS[Math.floor(Math.random() * GREETINGS.length)];
    const greetingEl = document.createElement('h2');
    greetingEl.className = 'empty-greeting-text';
    greetingEl.textContent = '';
    hero.appendChild(greetingEl);

    if (isAsk) {
        // Subtitle Line
        const subEl = document.createElement('div');
        subEl.className = 'welcome-sub-wrap';
        subEl.style.cssText = 'margin-bottom: 28px; text-align: center;';
        subEl.innerHTML = `<p style="font-size:0.95rem;color:var(--text-secondary);max-width:520px;margin:0 auto;line-height:1.5;">A friendly, accurate study tutor. Ask any question clearly, step by step with simple examples.</p>`;
        hero.appendChild(subEl);

        // 4 Action Chips for Ask
        const chipsGrid = document.createElement('div');
        chipsGrid.className = 'suggestion-chips-grid';
        const chips = [
            { icon: '👶', title: "Explain like I'm 10", prompt: "Explain this to me like I am 10 years old: " },
            { icon: '📅', title: "Give me a study plan", prompt: "Create a 7-day study plan with milestones for: " },
            { icon: '🧩', title: "Solve a problem step by step", prompt: "Help me solve this problem step by step: " },
            { icon: '⚡', title: "Quiz me on any topic", prompt: "Give me 3 practice questions to test my understanding of: " }
        ];

        chips.forEach(c => {
            const btn = document.createElement('button');
            btn.className = 'suggestion-chip';
            btn.innerHTML = `<span class="chip-icon">${c.icon}</span><span>${c.title}</span>`;
            btn.onclick = () => {
                const input = document.getElementById('ask-input');
                if (input) {
                    input.value = c.prompt;
                    if (c.prompt.endsWith('?') || c.prompt.endsWith('.')) {
                        sendAskChat();
                    } else {
                        input.focus();
                        input.setSelectionRange(input.value.length, input.value.length);
                    }
                }
            };
            chipsGrid.appendChild(btn);
        });

        hero.appendChild(chipsGrid);
    } else {
        // C2 Study Desk Bento Grid
        const deskGrid = document.createElement('div');
        deskGrid.className = 'desk';
        hero.appendChild(deskGrid);
        renderStudyDesk(deskGrid);
    }

    container.appendChild(hero);

    // Letter-by-letter reveal (emoji-aware with surrogate preservation)
    const chars = Array.from(chosen);
    let i = 0;
    const emojiRegex = /(\p{Extended_Pictographic}|\p{Emoji_Presentation})/u;
    const interval = setInterval(() => {
        if (i < chars.length) {
            const char = chars[i];
            if (emojiRegex.test(char)) {
                greetingEl.innerHTML += `<span class="emoji">${escapeHtml(char)}</span>`;
            } else {
                greetingEl.appendChild(document.createTextNode(char));
            }
            i++;
        }
        if (i >= chars.length) clearInterval(interval);
    }, 32);
}

async function renderStudyDesk(deskGrid) {
    if (!deskGrid) return;

    const files = currentSessionFiles || [];
    const currentSession = currentSessionsList.find(s => s.id === currentSessionId);

    // Weak topics from stats
    let weakTopics = [];
    if (currentSessionId) {
        try {
            const res = await fetch(`${API}/api/analytics/${currentSessionId}`);
            if (res.ok) {
                const data = await res.json();
                const mastery = data.topic_mastery || {};
                const sorted = Object.entries(mastery).sort((a, b) => a[1] - b[1]);
                weakTopics = sorted.slice(0, 3);
            }
        } catch (e) {}
    }

    // Row 1: "Continue where you left off" + "Focus on these"
    const hasValidTitle = currentSession && currentSession.title && !['untitled session', 'new topic', 'my study notes'].includes(currentSession.title.trim().toLowerCase());
    const hasMessages = currentSession && currentSession.messages && currentSession.messages.length > 0;
    const hasResumeData = hasValidTitle || hasMessages;
    const hasFocusData = weakTopics.length > 0;

    let continueCardHtml = '';
    let focusCardHtml = '';

    if (hasResumeData) {
        let lastMessageSnippet = 'Jump back in with your notes and ask follow-up questions.';
        if (hasMessages) {
            const lastMsg = currentSession.messages[currentSession.messages.length - 1];
            if (lastMsg && lastMsg.content) {
                lastMessageSnippet = lastMsg.content.trim().split('\n')[0].substring(0, 80);
            }
        }

        const spanCol = hasFocusData ? 'span 7' : 'span 12';
        continueCardHtml = `
            <div class="desk-card desk-resume" style="grid-column: ${spanCol};">
                <div class="desk-card-header">
                    <span class="desk-card-kicker">CONTINUE WHERE YOU LEFT OFF</span>
                    <h3 class="desk-resume-title">${escapeHtml(currentSession.title || 'Your Session')}</h3>
                </div>
                <p class="desk-resume-subtitle">${escapeHtml(lastMessageSnippet)}</p>
                <div class="desk-card-actions">
                    <button class="btn-desk-resume-secondary" onclick="document.getElementById('chat-input')?.focus()">
                        <span>Resume</span>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><polyline points="9 18 15 12 9 6"/></svg>
                    </button>
                </div>
            </div>
        `;
    }

    if (hasFocusData) {
        const topicRows = weakTopics.map(([topic, pct]) => {
            const color = pct < 40 ? 'var(--rose)' : (pct < 70 ? '#C8921A' : 'var(--ice)');
            return `
                <div class="desk-focus-item">
                    <div class="desk-focus-meta">
                        <span class="desk-focus-topic">${escapeHtml(topic)}</span>
                        <span class="desk-focus-pct" style="color:${color}">${Math.round(pct)}%</span>
                    </div>
                    <div class="desk-mini-bar-track">
                        <div class="desk-mini-bar-fill" style="width:${Math.max(8, pct)}%; background:${color};"></div>
                    </div>
                </div>
            `;
        }).join('');

        const spanCol = hasResumeData ? 'span 5' : 'span 12';
        focusCardHtml = `
            <div class="desk-card desk-focus" style="grid-column: ${spanCol};">
                <div class="desk-card-header">
                    <span class="desk-card-kicker">FOCUS ON THESE</span>
                    <h3 class="desk-focus-title">Priority Review</h3>
                </div>
                <div class="desk-focus-list">
                    ${topicRows}
                </div>
            </div>
        `;
    }

    // Row 2: Four quick-action tiles (span 3 each in CSS, 2 in <=900px, 1 in <=700px)
    const quickActionsHtml = `
        <div class="desk-actions">
            <div class="tile" onclick="switchWorkspace(1)" role="button" tabindex="0">
                <div class="tile__icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z"/></svg>
                </div>
                <div class="tile__title">Ask</div>
                <div class="tile__hint">Plain-language tutor</div>
            </div>
            <div class="tile" onclick="switchWorkspace(3)" role="button" tabindex="0">
                <div class="tile__icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z"/><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z"/></svg>
                </div>
                <div class="tile__title">Book</div>
                <div class="tile__hint">AI Study Guide</div>
            </div>
            <div class="tile" onclick="switchWorkspace(5)" role="button" tabindex="0">
                <div class="tile__icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="12" cy="12" r="10"/><path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
                </div>
                <div class="tile__title">Quiz</div>
                <div class="tile__hint">Active recall check</div>
            </div>
            <div class="tile" onclick="switchWorkspace(2)" role="button" tabindex="0">
                <div class="tile__icon">
                    <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><circle cx="18" cy="5" r="3"/><circle cx="6" cy="12" r="3"/><circle cx="18" cy="19" r="3"/><line x1="8.59" y1="13.51" x2="15.42" y2="17.49"/><line x1="15.41" y1="6.51" x2="8.59" y2="10.49"/></svg>
                </div>
                <div class="tile__title">Map</div>
                <div class="tile__hint">Visual concept graph</div>
            </div>
        </div>
    `;

    // Row 3: "Your files" strip (the latest 3 files with blurbs, span 12)
    let filesStripHtml = '';
    if (files.length > 0) {
        const top3 = files.slice(-3).reverse();
        const fileChips = top3.map(f => {
            const cleanName = cleanFileName(f.name);
            const blurb = sessionBlurbs[f.id];
            const blurbContent = blurb 
                ? `<div class="desk-file-blurb file-blurb-text">${escapeHtml(blurb)}</div>`
                : (blurbLoadingState[f.id] ? `<div class="blurb-placeholder"><div class="blurb-placeholder-line"></div><div class="blurb-placeholder-line"></div></div>` : '');

            return `
                <div class="desk-file-row">
                    <div class="desk-file-icon-box">
                        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                    </div>
                    <div class="desk-file-meta">
                        <div class="desk-file-name" title="${escapeHtml(cleanName)}">${escapeHtml(cleanName)}</div>
                        <div class="file-blurb-container" data-file-id="${f.id}">
                            ${blurbContent}
                        </div>
                    </div>
                    <span class="desk-file-ready-tag">Ready</span>
                </div>
            `;
        }).join('');

        filesStripHtml = `
            <div class="desk-card desk-files">
                <div class="desk-files-header">
                    <span class="desk-card-kicker">YOUR FILES</span>
                    <button class="btn-desk-files-ghost" onclick="toggleFileManager(true)">View all (${files.length})</button>
                </div>
                <div class="desk-files-rows">
                    ${fileChips}
                </div>
            </div>
        `;
    }

    deskGrid.innerHTML = `
        ${continueCardHtml}
        ${focusCardHtml}
        ${quickActionsHtml}
        ${filesStripHtml}
    `;
}

// ─── Chat Message Rendering ──────────────────────────────────────────────────
function renderChatHistory(messages) {
    const container = document.getElementById('chat-messages-container');
    if (!container) return;

    if (!messages || messages.length === 0) {
        renderWelcomeMessage(container, false);
        return;
    }

    container.innerHTML = messages.map(m => renderMessage(m)).join('');
    scrollToBottomIfNear(container, true);
}

function renderMessage(msg) {
    let rawContent = msg.content || '';

    // Replace ungrounded/error text with friendly copy
    if (rawContent.includes('Information Not Available') || rawContent.includes('not found in your notes') || rawContent.includes('could not find relevant')) {
        rawContent = `Hmm, I can't find that in your notes yet. Upload something about it and we'll learn it together 📚\n\n<button class="btn-cta-secondary" style="margin-top:12px;padding:8px 18px;font-size:0.85rem;" onclick="triggerFileUpload()">Upload notes</button>`;
    }

    let sourcesHtml = '';
    if (msg.role === 'assistant' && msg.sources_json) {
        try {
            const sources = JSON.parse(msg.sources_json);
            if (sources && sources.length) {
                sourcesHtml = `<div class="sources-bar" style="margin-top:10px;display:flex;gap:6px;flex-wrap:wrap;">${sources.map(s =>
                    `<span class="source-badge" style="font-family:'JetBrains Mono',monospace;font-size:0.7rem;padding:3px 8px;border-radius:6px;background:var(--surface-elevated);border:1px solid var(--border-color);color:var(--text-secondary);">📄 ${escapeHtml(s.source || 'Document')}</span>`
                ).join('')}</div>`;
            }
        } catch (e) {}
    }

    const isUser = msg.role === 'user';

    return `
        <div class="chat-message-row ${isUser ? 'user' : 'assistant'}">
            <div class="msg-content-bubble">
                ${formatMarkdown(rawContent)}
                ${sourcesHtml}
            </div>
            ${!isUser ? `
                <div class="chat-actions-hover">
                    <button class="btn-chat-action" onclick="copyMessageText(this)" title="Copy text" aria-label="Copy text">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        <span>Copy</span>
                    </button>
                    <button class="btn-chat-action" onclick="likeMessage(this)" title="Helpful" aria-label="Mark helpful">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3"/><path d="M7 14h2"/></svg>
                        <span>Helpful</span>
                    </button>
                    <button class="btn-chat-action" onclick="regenerateLastMessage(this)" title="Regenerate" aria-label="Regenerate response">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                        <span>Regenerate</span>
                    </button>
                    <button class="btn-chat-action" onclick="pinMessageToNotebook(this)" title="Pin to Notebook" aria-label="Pin to Notebook">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                        <span>Pin</span>
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

function copyMessageText(btn) {
    const row = btn.closest('.chat-message-row');
    if (row) {
        const text = row.querySelector('.msg-content-bubble').innerText;
        navigator.clipboard.writeText(text);
        showToast('Copied to clipboard', 'info');
    }
}
window.copyMessageText = copyMessageText;

function likeMessage(btn) {
    btn.style.color = 'var(--marigold)';
    btn.style.borderColor = 'var(--marigold)';
    showToast('Feedback noted ✨', 'info');
}
window.likeMessage = likeMessage;

function regenerateLastMessage(btn) {
    const isAsk = btn.closest('#ask-messages-container') !== null;
    retryLastMessage(isAsk ? 'ask' : 'chat');
}
window.regenerateLastMessage = regenerateLastMessage;

async function pinMessageToNotebook(btn) {
    if (!currentSessionId) {
        showToast('Select a session first', 'error');
        return;
    }
    const row = btn.closest('.chat-message-row');
    if (!row) return;
    const bubble = row.querySelector('.msg-content-bubble');
    if (!bubble) return;
    const text = bubble.innerText.trim();
    if (!text) return;

    const lines = text.split('\n').map(l => l.trim()).filter(Boolean);
    const title = (lines[0] || 'Note').replace(/^[#*\-•\s]+/, '').substring(0, 60);

    try {
        const res = await fetch(`${API}/api/notebook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                title: title,
                content: text,
                source: 'Chat message'
            })
        });
        if (res.ok) {
            btn.style.color = 'var(--marigold)';
            btn.style.borderColor = 'rgba(234, 170, 0, 0.4)';
            showToast('Pinned', 'success');
            if (window.loadNotebookItems) window.loadNotebookItems();
        } else {
            showToast('Failed to pin note', 'error');
        }
    } catch (e) {
        showToast('Error pinning note', 'error');
    }
}
window.pinMessageToNotebook = pinMessageToNotebook;

// ─── Phase 4.1: Ask Anything Board ───────────────────────────────────────────
async function loadAskHistory() {
    if (!currentSessionId) return;
    try {
        const res = await fetch(`${API}/api/ask/history?session_id=${currentSessionId}`);
        if (!res.ok) return;
        const messages = await res.json();
        renderAskHistory(messages || []);
    } catch (e) {
        console.error('Failed to load ask history:', e);
    }
}
window.loadAskHistory = loadAskHistory;

function renderAskHistory(messages) {
    const container = document.getElementById('ask-messages-container');
    if (!container) return;

    if (!messages || messages.length === 0) {
        renderWelcomeMessage(container, true);
        return;
    }

    container.innerHTML = messages.map(m => renderAskMessage(m)).join('');
    scrollToBottomIfNear(container, true);
}

function renderAskMessage(msg) {
    const isUser = msg.role === 'user';
    return `
        <div class="chat-message-row ${isUser ? 'user' : 'assistant'}">
            ${!isUser ? `<div class="ask-sparkle-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg> General Tutor</div>` : ''}
            <div class="msg-content-bubble">
                ${formatMarkdown(msg.content || '')}
            </div>
            ${!isUser ? `
                <div class="chat-actions-hover">
                    <button class="btn-chat-action" onclick="copyMessageText(this)" title="Copy text" aria-label="Copy text">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                        <span>Copy</span>
                    </button>
                    <button class="btn-chat-action" onclick="likeMessage(this)" title="Helpful" aria-label="Mark helpful">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3"/><path d="M7 14h2"/></svg>
                        <span>Helpful</span>
                    </button>
                    <button class="btn-chat-action" onclick="regenerateLastMessage(this)" title="Regenerate" aria-label="Regenerate response">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16"/><path d="M8 16H3v5"/></svg>
                        <span>Regenerate</span>
                    </button>
                    <button class="btn-chat-action" onclick="pinMessageToNotebook(this)" title="Pin to Notebook" aria-label="Pin to Notebook">
                        <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                        <span>Pin</span>
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

// ─── Phase 4.3: Live Thinking Indicator & Streaming Handler ───────────────────
let currentActiveThinking = null;
let lastSentQuery = { mode: 'chat', text: '' };

function stopCurrentThinking() {
    if (currentActiveThinking) {
        if (currentActiveThinking.eventSource) {
            currentActiveThinking.eventSource.close();
        }
        if (currentActiveThinking.timerInterval) {
            clearInterval(currentActiveThinking.timerInterval);
        }
        const stopBtn = document.getElementById('btn-thinking-stop');
        if (stopBtn) stopBtn.style.display = 'none';

        const label = document.getElementById('thinking-elapsed-label');
        if (label) label.textContent = 'Thinking stopped';

        const inputBtn = document.getElementById(currentActiveThinking.isAsk ? 'btn-ask-send' : 'btn-chat-send');
        if (inputBtn) inputBtn.disabled = false;

        if (window.setBudState) window.setBudState('idle');
        showToast('Response stopped', 'info');
        currentActiveThinking = null;
    }
}
window.stopCurrentThinking = stopCurrentThinking;

function retryLastMessage(mode) {
    if (!lastSentQuery.text) return;
    if (mode === 'ask') {
        const input = document.getElementById('ask-input');
        if (input) input.value = lastSentQuery.text;
        sendAskChat();
    } else {
        const input = document.getElementById('chat-input');
        if (input) input.value = lastSentQuery.text;
        sendChat();
    }
}
window.retryLastMessage = retryLastMessage;

function toggleThinkingDetails(btn) {
    const bubble = btn.closest('.thinking-bubble');
    if (!bubble) return;
    const list = bubble.querySelector('.thinking-steps-list');
    if (!list) return;
    const isHidden = list.style.display === 'none';
    list.style.display = isHidden ? 'flex' : 'none';
    btn.querySelector('span').textContent = isHidden ? 'Hide how I answered ▴' : 'Show how I answered ▾';
}
window.toggleThinkingDetails = toggleThinkingDetails;

// Helper to render thinking step rows
function buildThinkingStepsHtml(isAsk) {
    if (isAsk) {
        return `
            <div class="thinking-step-row active" id="step-row-understanding">
                <span class="step-status-icon"><div class="step-spinner"></div></span>
                <span class="step-label">Understanding your question</span>
            </div>
            <div class="thinking-step-row" id="step-row-thinking">
                <span class="step-status-icon"><div class="step-pending-dot"></div></span>
                <span class="step-label">Thinking it through</span>
            </div>
            <div class="thinking-step-row" id="step-row-writing">
                <span class="step-status-icon"><div class="step-pending-dot"></div></span>
                <span class="step-label">Writing the answer</span>
            </div>
        `;
    }
    return `
        <div class="thinking-step-row active" id="step-row-understanding">
            <span class="step-status-icon"><div class="step-spinner"></div></span>
            <span class="step-label">Understanding your question</span>
        </div>
        <div class="thinking-step-row" id="step-row-searching">
            <span class="step-status-icon"><div class="step-pending-dot"></div></span>
            <span class="step-label">Searching your notes</span>
        </div>
        <div class="thinking-step-row" id="step-row-synthesizing">
            <span class="step-status-icon"><div class="step-pending-dot"></div></span>
            <span class="step-label">Putting the answer together</span>
        </div>
        <div class="thinking-step-row" id="step-row-checking">
            <span class="step-status-icon"><div class="step-pending-dot"></div></span>
            <span class="step-label">Double-checking</span>
        </div>
    `;
}

function setStepDone(rowId, customLabel, scope = document) {
    const row = scope.querySelector ? (scope.querySelector('#' + rowId) || document.getElementById(rowId)) : document.getElementById(rowId);
    if (!row) return;
    row.className = 'thinking-step-row done';
    const icon = row.querySelector('.step-status-icon');
    if (icon) icon.innerHTML = `<span class="step-check-mark">✓</span>`;
    if (customLabel) {
        const lbl = row.querySelector('.step-label');
        if (lbl) lbl.textContent = customLabel;
    }
}

function setStepActive(rowId, customLabel, scope = document) {
    const row = scope.querySelector ? (scope.querySelector('#' + rowId) || document.getElementById(rowId)) : document.getElementById(rowId);
    if (!row) return;
    row.className = 'thinking-step-row active';
    const icon = row.querySelector('.step-status-icon');
    if (icon) icon.innerHTML = `<div class="step-spinner"></div>`;
    if (customLabel) {
        const lbl = row.querySelector('.step-label');
        if (lbl) lbl.textContent = customLabel;
    }
}

// ─── Study Chat Send ─────────────────────────────────────────────────────────
async function handleChatRoutedSummary(message, container, sendBtn) {
    const matchWords = message.match(/(\d{2,4})\s*-?\s*words?/i);
    const targetWords = matchWords ? parseInt(matchWords[1]) : 500;

    let style = 'paragraph';
    if (/bullets?|points?/i.test(message)) style = 'bullets';
    else if (/exam|questions?|headings?/i.test(message)) style = 'exam_notes';

    if (window.setBudState) window.setBudState('thinking');

    const assistantRow = document.createElement('div');
    assistantRow.className = 'chat-message-row assistant';
    assistantRow.innerHTML = `
        <div class="thinking-bubble" id="live-thinking-bubble">
            <div class="thinking-header">
                <div class="thinking-orb-wrap">
                    <div class="mascot-orb-mini">
                        <div class="pulsing-dots">
                            <span class="pulse-dot"></span>
                            <span class="pulse-dot"></span>
                            <span class="pulse-dot"></span>
                        </div>
                    </div>
                    <span class="thinking-elapsed" id="thinking-elapsed-label">Summarizing… 0s</span>
                </div>
                <button class="btn-thinking-stop" id="btn-thinking-stop">Stop</button>
            </div>
            <div class="thinking-steps-list" id="thinking-steps-list">
                <div class="thinking-step-row active" id="sum-step-reading">
                    <span class="step-status-icon"><div class="step-spinner"></div></span>
                    <span class="step-label">Reading notes</span>
                </div>
                <div class="thinking-step-row" id="sum-step-combining">
                    <span class="step-status-icon"><div class="step-pending-dot"></div></span>
                    <span class="step-label">Combining notes</span>
                </div>
                <div class="thinking-step-row" id="sum-step-writing">
                    <span class="step-status-icon"><div class="step-pending-dot"></div></span>
                    <span class="step-label">Writing</span>
                </div>
            </div>
            <button class="thinking-collapse-toggle" id="thinking-collapse-toggle" style="display:none;" onclick="toggleThinkingDetails(this)">
                <span>Show how I answered ▾</span>
            </button>
        </div>
        <div class="msg-content-bubble token-fade-in" id="streaming-content-bubble" style="display:none;"></div>
        <div class="chat-actions-hover" style="display:none;">
            <button class="btn-chat-action" onclick="copyMessageText(this)" title="Copy text" aria-label="Copy text">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span>Copy</span>
            </button>
            <button class="btn-chat-action" onclick="likeMessage(this)" title="Helpful" aria-label="Mark helpful">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3"/><path d="M7 14h2"/></svg>
                <span>Helpful</span>
            </button>
            <button class="btn-chat-action" onclick="pinMessageToNotebook(this)" title="Pin to Notebook" aria-label="Pin to Notebook">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                <span>Pin</span>
            </button>
        </div>
    `;
    container.appendChild(assistantRow);
    scrollToBottomIfNear(container, true);

    let elapsedSec = 0;
    const timerInterval = setInterval(() => {
        elapsedSec++;
        const label = assistantRow.querySelector('#thinking-elapsed-label');
        if (label) label.textContent = `Summarizing… ${elapsedSec}s`;
    }, 1000);

    const contentBubble = assistantRow.querySelector('#streaming-content-bubble');
    const stepsList = assistantRow.querySelector('#thinking-steps-list');
    const collapseToggle = assistantRow.querySelector('#thinking-collapse-toggle');
    const stopBtn = assistantRow.querySelector('#btn-thinking-stop');
    const actionsRow = assistantRow.querySelector('.chat-actions-hover');

    let currentEventSource = null;
    let summaryJobId = null;

    stopBtn.onclick = () => {
        clearInterval(timerInterval);
        if (currentEventSource) currentEventSource.close();
        if (summaryJobId) {
            fetch(`${API}/api/summary/${summaryJobId}/cancel`, { method: 'POST' }).catch(() => {});
        }
        stopBtn.style.display = 'none';
        if (sendBtn) sendBtn.disabled = false;
        if (window.setBudState) window.setBudState('idle');
        const label = assistantRow.querySelector('#thinking-elapsed-label');
        if (label) label.textContent = 'Summarizing stopped';
    };

    try {
        const res = await fetch(`${API}/api/summary/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                file_ids: 'all',
                words: targetWords,
                style: style
            })
        });
        const data = await res.json();

        if (data.status === 'COMPLETED' || data.content) {
            clearInterval(timerInterval);
            if (sendBtn) sendBtn.disabled = false;
            if (stopBtn) stopBtn.style.display = 'none';
            if (window.setBudState) window.setBudState('happy');

            setStepDone('sum-step-reading', null, assistantRow);
            setStepDone('sum-step-combining', null, assistantRow);
            setStepDone('sum-step-writing', null, assistantRow);

            if (stepsList) stepsList.style.display = 'none';
            if (collapseToggle) collapseToggle.style.display = 'flex';

            const summaryText = data.content || '';
            const finalCount = data.word_count || summaryText.trim().split(/\s+/).length;

            contentBubble.style.display = 'block';
            contentBubble.innerHTML = formatMarkdown(summaryText) + `
                <div class="summary-chat-nav" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                    <span class="source-badge" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;padding:4px 10px;border-radius:6px;background:rgba(234,170,0,0.12);border:1px solid rgba(234,170,0,0.3);color:var(--marigold);">Target ${targetWords} · Got ${finalCount} words</span>
                    <button class="btn-cta-secondary" style="padding:6px 14px;font-size:0.82rem;" onclick="switchWorkspace(4)">Open in Summary</button>
                </div>
            `;
            if (actionsRow) actionsRow.style.display = 'flex';
            scrollToBottomIfNear(container);
            return;
        }

        summaryJobId = data.job_id;
        currentEventSource = new EventSource(`${API}/api/summary/${data.job_id}/events`);

        currentEventSource.onmessage = (e) => {
            try {
                const ev = JSON.parse(e.data);
                if (ev.phase === 'reading') {
                    const done = ev.done || 0;
                    const total = ev.total || 1;
                    setStepActive('sum-step-reading', `Reading part ${done} of ${total}`, assistantRow);
                } else if (ev.phase === 'combining') {
                    setStepDone('sum-step-reading', null, assistantRow);
                    setStepActive('sum-step-combining', 'Combining notes', assistantRow);
                } else if (ev.phase === 'writing') {
                    setStepDone('sum-step-combining', null, assistantRow);
                    setStepActive('sum-step-writing', 'Writing', assistantRow);
                }

                if (ev.done) {
                    clearInterval(timerInterval);
                    currentEventSource.close();
                    if (sendBtn) sendBtn.disabled = false;
                    if (stopBtn) stopBtn.style.display = 'none';
                    if (window.setBudState) window.setBudState('happy');

                    setStepDone('sum-step-reading', null, assistantRow);
                    setStepDone('sum-step-combining', null, assistantRow);
                    setStepDone('sum-step-writing', null, assistantRow);

                    if (stepsList) stepsList.style.display = 'none';
                    if (collapseToggle) collapseToggle.style.display = 'flex';

                    const summaryText = ev.text || '';
                    const finalCount = ev.word_count || summaryText.trim().split(/\s+/).length;

                    contentBubble.style.display = 'block';
                    contentBubble.innerHTML = formatMarkdown(summaryText) + `
                        <div class="summary-chat-nav" style="margin-top:14px;padding-top:12px;border-top:1px solid var(--line);display:flex;align-items:center;justify-content:space-between;flex-wrap:wrap;gap:10px;">
                            <span class="source-badge" style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;padding:4px 10px;border-radius:6px;background:rgba(234,170,0,0.12);border:1px solid rgba(234,170,0,0.3);color:var(--marigold);">Target ${targetWords} · Got ${finalCount} words</span>
                            <button class="btn-cta-secondary" style="padding:6px 14px;font-size:0.82rem;" onclick="switchWorkspace(4)">Open in Summary</button>
                        </div>
                    `;
                    if (actionsRow) actionsRow.style.display = 'flex';
                    scrollToBottomIfNear(container);
                }
            } catch (err) {}
        };

        currentEventSource.onerror = () => {
            clearInterval(timerInterval);
            if (currentEventSource) currentEventSource.close();
            if (sendBtn) sendBtn.disabled = false;
            if (stopBtn) stopBtn.style.display = 'none';
            if (window.setBudState) window.setBudState('idle');
            showToast('Summary error occurred', 'error');
        };
    } catch (err) {
        clearInterval(timerInterval);
        if (sendBtn) sendBtn.disabled = false;
        if (stopBtn) stopBtn.style.display = 'none';
        if (window.setBudState) window.setBudState('idle');
        showToast('Failed to start summary', 'error');
    }
}

async function sendChat(customMessage = null, mode = "concise") {
    const input = document.getElementById('chat-input');
    const btn = document.getElementById('btn-chat-send');
    const rawMsg = customMessage !== null ? customMessage : (input ? input.value : '');
    if (!rawMsg || !rawMsg.trim() || !currentSessionId) return;

    const message = rawMsg.trim();
    if (input && customMessage === null) input.value = '';
    if (btn) btn.disabled = true;
    lastSentQuery = { mode: 'chat', text: message };
    autoTitleSessionFromMessage(message);

    const container = document.getElementById('chat-messages-container');
    const emptyHero = container.querySelector('.empty-chat-hero');
    if (emptyHero) emptyHero.remove();

    // Add user message
    container.insertAdjacentHTML('beforeend', renderMessage({ role: 'user', content: message }));
    scrollToBottomIfNear(container, true);

    if (window.setBudState) window.setBudState('thinking');

    // Create assistant message row with live thinking indicator
    const assistantRow = document.createElement('div');
    assistantRow.className = 'chat-message-row assistant';
    assistantRow.innerHTML = `
        <div class="thinking-bubble" id="live-thinking-bubble">
            <div class="thinking-header">
                <div class="thinking-orb-wrap">
                    <div class="mascot-orb-mini">
                        <div class="pulsing-dots">
                            <span class="pulse-dot"></span>
                            <span class="pulse-dot"></span>
                            <span class="pulse-dot"></span>
                        </div>
                    </div>
                    <span class="thinking-elapsed" id="thinking-elapsed-label">Thinking… 0s</span>
                </div>
                <button class="btn-thinking-stop" id="btn-thinking-stop" onclick="stopCurrentThinking()">Stop</button>
            </div>
            <div class="thinking-steps-list" id="thinking-steps-list">
                ${buildThinkingStepsHtml(false)}
            </div>
            <button class="thinking-collapse-toggle" id="thinking-collapse-toggle" style="display:none;" onclick="toggleThinkingDetails(this)">
                <span>Show how I answered ▾</span>
            </button>
        </div>
        <div class="msg-content-bubble token-fade-in" id="streaming-content-bubble" style="display:none;"></div>
        <div class="chat-actions-hover" style="display:none;">
            <button class="btn-chat-action" onclick="copyMessageText(this)" title="Copy text" aria-label="Copy text">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span>Copy</span>
            </button>
            <button class="btn-chat-action" onclick="likeMessage(this)" title="Helpful" aria-label="Mark helpful">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3"/><path d="M7 14h2"/></svg>
                <span>Helpful</span>
            </button>
            <button class="btn-chat-action" onclick="pinMessageToNotebook(this)" title="Pin to Notebook" aria-label="Pin to Notebook">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m19 21-7-4-7 4V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2v16z"/></svg>
                <span>Pin</span>
            </button>
        </div>
    `;
    container.appendChild(assistantRow);
    scrollToBottomIfNear(container, true);

    // Elapsed timer
    let elapsedSec = 0;
    const timerInterval = setInterval(() => {
        elapsedSec++;
        const label = assistantRow.querySelector('#thinking-elapsed-label');
        if (label) label.textContent = `Thinking… ${elapsedSec}s`;
    }, 1000);

    const url = `${API}/api/chat/stream?session_id=${currentSessionId}&message=${encodeURIComponent(message)}&mode=${encodeURIComponent(mode)}`;
    const eventSource = new EventSource(url);
    currentActiveThinking = { eventSource, timerInterval, isAsk: false, message };

    let fullAnswer = '';
    const contentBubble = assistantRow.querySelector('#streaming-content-bubble');
    const stepsList = assistantRow.querySelector('#thinking-steps-list');
    const collapseToggle = assistantRow.querySelector('#thinking-collapse-toggle');
    const stopBtn = assistantRow.querySelector('#btn-thinking-stop');
    const actionsRow = assistantRow.querySelector('.chat-actions-hover');

    eventSource.addEventListener('status', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.step === 'searching') {
                setStepDone('step-row-understanding', null, assistantRow);
                setStepActive('step-row-searching', null, assistantRow);
            } else if (data.step === 'found') {
                const count = data.count || 0;
                const files = data.files || 0;
                const label = `Found ${count} relevant part${count === 1 ? '' : 's'} in ${files} file${files === 1 ? '' : 's'}`;
                setStepDone('step-row-searching', label, assistantRow);
                setStepActive('step-row-synthesizing', null, assistantRow);
            } else if (data.step === 'synthesizing') {
                setStepDone('step-row-searching', null, assistantRow);
                setStepActive('step-row-synthesizing', null, assistantRow);
            } else if (data.step === 'checking') {
                setStepDone('step-row-synthesizing', null, assistantRow);
                setStepActive('step-row-checking', null, assistantRow);
            }
        } catch (err) {}
    });

    eventSource.addEventListener('answer_start', () => {
        setStepDone('step-row-synthesizing', null, assistantRow);
        setStepDone('step-row-checking', null, assistantRow);
        if (contentBubble) contentBubble.style.display = 'block';
    });

    eventSource.addEventListener('token', (e) => {
        if (contentBubble) {
            contentBubble.style.display = 'block';
            fullAnswer += e.data;
            contentBubble.innerHTML = formatMarkdown(fullAnswer);
            scrollToBottomIfNear(container);
        }
    });

    eventSource.addEventListener('complete', (e) => {
        clearInterval(timerInterval);
        eventSource.close();
        currentActiveThinking = null;
        if (btn) btn.disabled = false;
        if (window.setBudState) window.setBudState('happy');

        // Mark all steps done
        setStepDone('step-row-understanding', null, assistantRow);
        setStepDone('step-row-searching', null, assistantRow);
        setStepDone('step-row-synthesizing', null, assistantRow);
        setStepDone('step-row-checking', null, assistantRow);

        if (stopBtn) stopBtn.style.display = 'none';

        // Collapse steps into accordion
        if (stepsList) stepsList.style.display = 'none';
        if (collapseToggle) collapseToggle.style.display = 'flex';

        // Check if ungrounded or nothing found
        const isNotFound = fullAnswer.includes("can't find that in your notes") ||
                           fullAnswer.includes('Information Not Available') ||
                           fullAnswer.includes('not found in your notes') ||
                           fullAnswer.includes('could not find relevant') ||
                           fullAnswer.includes('No relevant documents found');

        if (isNotFound) {
            contentBubble.innerHTML = `
                <div class="empty-answer-box" style="line-height:1.6;font-size:0.92rem;color:var(--ice);">
                    Hmm, I can't find that in your notes yet. Upload something about it, or switch to Ask anything for a general answer.
                    <div style="display:flex;gap:10px;margin-top:14px;flex-wrap:wrap;">
                        <button class="btn-cta-secondary" style="padding:6px 16px;font-size:0.84rem;" onclick="triggerFileUpload()">Upload notes</button>
                        <button class="btn-cta-marigold" style="padding:6px 16px;font-size:0.84rem;" onclick="switchChatMode('ask')">Ask anything</button>
                    </div>
                </div>
            `;
        } else {
            try {
                const data = JSON.parse(e.data);
                if (data.sources && data.sources.length) {
                    // Deduplicate source chips
                    const sourceMap = new Map();
                    data.sources.forEach(s => {
                        const rawName = s.source || 'Document';
                        const cleanName = cleanFileName(rawName);
                        let pageNum = s.page_start ? (s.page_end && s.page_end !== s.page_start ? `${s.page_start}-${s.page_end}` : `${s.page_start}`) : (s.page ? s.page : (s.chunk_index !== undefined ? (s.chunk_index + 1) : 1));
                        if (!sourceMap.has(cleanName)) {
                            sourceMap.set(cleanName, new Set());
                        }
                        sourceMap.get(cleanName).add(pageNum);
                    });

                    let sourcesHtml = '<div class="sources-bar" style="margin-top:12px;display:flex;gap:8px;flex-wrap:wrap;">';
                    sourceMap.forEach((pagesSet, fileName) => {
                        const sortedPages = Array.from(pagesSet).sort((a, b) => a - b);
                        const pageLabel = sortedPages.length === 1 ? `p.${sortedPages[0]}` : `p.${sortedPages.join(', ')}`;
                        sourcesHtml += `<span class="source-badge" style="font-family:'JetBrains Mono',monospace;font-size:0.72rem;padding:4px 10px;border-radius:6px;background:var(--surface-elevated);border:1px solid var(--border-color);color:var(--text-secondary);display:inline-flex;align-items:center;gap:6px;">📄 ${escapeHtml(fileName)} · ${pageLabel}</span>`;
                    });
                    sourcesHtml += '</div>';
                    contentBubble.innerHTML += sourcesHtml;
                }
            } catch (ex) {}

            // In concise mode, append "🔍 Explain in Detail" button at bottom of AI bubble
            if (mode === 'concise' && contentBubble) {
                const explainWrap = document.createElement('div');
                explainWrap.className = 'explain-detail-wrap';
                explainWrap.style.marginTop = '14px';
                explainWrap.style.paddingTop = '10px';
                explainWrap.style.borderTop = '1px solid var(--line)';

                const explainBtn = document.createElement('button');
                explainBtn.className = 'btn-explain-detail';
                explainBtn.innerHTML = '🔍 Explain in Detail';
                explainBtn.onclick = () => {
                    explainBtn.disabled = true;
                    explainWrap.remove();
                    sendChat(`Please explain this topic in full detail: ${message}`, 'explain');
                };

                explainWrap.appendChild(explainBtn);
                contentBubble.appendChild(explainWrap);
            }
        }

        if (actionsRow) actionsRow.style.display = 'flex';
        scrollToBottomIfNear(container);
    });

    eventSource.onerror = () => {
        clearInterval(timerInterval);
        eventSource.close();
        currentActiveThinking = null;
        if (btn) btn.disabled = false;
        if (stopBtn) stopBtn.style.display = 'none';
        if (window.setBudState) window.setBudState('idle');

        if (!fullAnswer) {
            assistantRow.insertAdjacentHTML('beforeend', `
                <div class="thinking-error-box">
                    <span>Hmm, something went wrong. Try again?</span>
                    <button class="btn-thinking-retry" onclick="retryLastMessage('chat')">Retry</button>
                </div>
            `);
        }
    };
}
window.sendChat = sendChat;
window.sendChatMessage = sendChat;

// ─── Ask Anything Send (Phase 4.1) ───────────────────────────────────────────
async function sendAskChat() {
    const input = document.getElementById('ask-input');
    const btn = document.getElementById('btn-ask-send');
    if (!input || !input.value.trim() || !currentSessionId) return;

    const message = input.value.trim();
    input.value = '';
    if (btn) btn.disabled = true;
    lastSentQuery = { mode: 'ask', text: message };
    autoTitleSessionFromMessage(message);

    const container = document.getElementById('ask-messages-container');
    const emptyHero = container.querySelector('.empty-chat-hero');
    if (emptyHero) emptyHero.remove();

    // Check if question asks about notes or files in general chat
    const fileTerms = ['my note', 'my notes', 'my file', 'the lecture', 'uploaded', 'the slides', 'the pdf', 'my chapter', 'my course'];
    const mentionsFile = fileTerms.some(t => message.toLowerCase().includes(t));

    // Add user message
    const userRow = document.createElement('div');
    userRow.className = 'chat-message-row user';
    userRow.innerHTML = `
        <div class="msg-content-bubble">
            ${formatMarkdown(message)}
        </div>
        ${mentionsFile ? `
            <div style="margin-top:6px;text-align:right;">
                <button class="soft-switch-chip" onclick="switchChatMode('notes')">Want an answer from your notes? Switch to From my notes →</button>
            </div>
        ` : ''}
    `;
    container.appendChild(userRow);
    scrollToBottomIfNear(container, true);

    if (window.setBudState) window.setBudState('thinking');

    // Create assistant message row with live thinking indicator
    const assistantRow = document.createElement('div');
    assistantRow.className = 'chat-message-row assistant';
    assistantRow.innerHTML = `
        <div class="ask-sparkle-badge"><svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="m12 3-1.912 5.813a2 2 0 0 1-1.275 1.275L3 12l5.813 1.912a2 2 0 0 1 1.275 1.275L12 21l1.912-5.813a2 2 0 0 1 1.275-1.275L21 12l-5.813-1.912a2 2 0 0 1-1.275-1.275L12 3Z"/></svg> General Tutor</div>
        <div class="thinking-bubble" id="live-thinking-bubble">
            <div class="thinking-header">
                <div class="thinking-orb-wrap">
                    <div class="mascot-orb-mini">
                        <div class="pulsing-dots">
                            <span class="pulse-dot"></span>
                            <span class="pulse-dot"></span>
                            <span class="pulse-dot"></span>
                        </div>
                    </div>
                    <span class="thinking-elapsed" id="thinking-elapsed-label">Thinking… 0s</span>
                </div>
                <button class="btn-thinking-stop" id="btn-thinking-stop" onclick="stopCurrentThinking()">Stop</button>
            </div>
            <div class="thinking-steps-list" id="thinking-steps-list">
                ${buildThinkingStepsHtml(true)}
            </div>
            <button class="thinking-collapse-toggle" id="thinking-collapse-toggle" style="display:none;" onclick="toggleThinkingDetails(this)">
                <span>Show how I answered ▾</span>
            </button>
        </div>
        <div class="msg-content-bubble token-fade-in" id="streaming-content-bubble" style="display:none;"></div>
        <div class="chat-actions-hover" style="display:none;">
            <button class="btn-chat-action" onclick="copyMessageText(this)" title="Copy text" aria-label="Copy text">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><rect width="14" height="14" x="8" y="8" rx="2" ry="2"/><path d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2"/></svg>
                <span>Copy</span>
            </button>
            <button class="btn-chat-action" onclick="likeMessage(this)" title="Helpful" aria-label="Mark helpful">
                <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M7 10v12"/><path d="M15 5.88 14 10h5.83a2 2 0 0 1 1.92 2.56l-2.33 8A2 2 0 0 1 17.5 22H4a2 2 0 0 1-2-2v-8a2 2 0 0 1 2-2h3"/><path d="M7 14h2"/></svg>
                <span>Helpful</span>
            </button>
        </div>
    `;
    container.appendChild(assistantRow);
    scrollToBottomIfNear(container, true);

    // Elapsed timer
    let elapsedSec = 0;
    const timerInterval = setInterval(() => {
        elapsedSec++;
        const label = assistantRow.querySelector('#thinking-elapsed-label');
        if (label) label.textContent = `Thinking… ${elapsedSec}s`;
    }, 1000);

    const url = `${API}/api/ask?session_id=${currentSessionId}&message=${encodeURIComponent(message)}`;
    const eventSource = new EventSource(url);
    currentActiveThinking = { eventSource, timerInterval, isAsk: true, message };

    let fullAnswer = '';
    const contentBubble = assistantRow.querySelector('#streaming-content-bubble');
    const stepsList = assistantRow.querySelector('#thinking-steps-list');
    const collapseToggle = assistantRow.querySelector('#thinking-collapse-toggle');
    const stopBtn = assistantRow.querySelector('#btn-thinking-stop');
    const actionsRow = assistantRow.querySelector('.chat-actions-hover');

    eventSource.addEventListener('status', (e) => {
        try {
            const data = JSON.parse(e.data);
            if (data.step === 'thinking') {
                setStepDone('step-row-understanding', null, assistantRow);
                setStepActive('step-row-thinking', null, assistantRow);
            } else if (data.step === 'writing') {
                setStepDone('step-row-thinking', null, assistantRow);
                setStepActive('step-row-writing', null, assistantRow);
            }
        } catch (err) {}
    });

    eventSource.addEventListener('answer_start', () => {
        setStepDone('step-row-thinking', null, assistantRow);
        setStepDone('step-row-writing', null, assistantRow);
        if (contentBubble) contentBubble.style.display = 'block';
    });

    eventSource.addEventListener('token', (e) => {
        if (contentBubble) {
            contentBubble.style.display = 'block';
            fullAnswer += e.data;
            contentBubble.innerHTML = formatMarkdown(fullAnswer);
            scrollToBottomIfNear(container);
        }
    });

    eventSource.addEventListener('done', (e) => {
        clearInterval(timerInterval);
        eventSource.close();
        currentActiveThinking = null;
        if (btn) btn.disabled = false;
        if (window.setBudState) window.setBudState('happy');

        // Mark all steps done
        setStepDone('step-row-understanding', null, assistantRow);
        setStepDone('step-row-thinking', null, assistantRow);
        setStepDone('step-row-writing', null, assistantRow);

        if (stopBtn) stopBtn.style.display = 'none';

        // Collapse steps into accordion
        if (stepsList) stepsList.style.display = 'none';
        if (collapseToggle) collapseToggle.style.display = 'flex';

        if (actionsRow) actionsRow.style.display = 'flex';
        scrollToBottomIfNear(container);
    });

    eventSource.onerror = () => {
        clearInterval(timerInterval);
        eventSource.close();
        currentActiveThinking = null;
        if (btn) btn.disabled = false;
        if (stopBtn) stopBtn.style.display = 'none';
        if (window.setBudState) window.setBudState('idle');

        if (!fullAnswer) {
            assistantRow.insertAdjacentHTML('beforeend', `
                <div class="thinking-error-box">
                    <span>Hmm, something went wrong. Try again?</span>
                    <button class="btn-thinking-retry" onclick="retryLastMessage('ask')">Retry</button>
                </div>
            `);
        }
    };
}
window.sendAskChat = sendAskChat;

// ─── Concept Map (C4) ─────────────────────────────────────────────────────────
async function loadConceptMap() {
    if (!currentSessionId) return;
    try {
        const [mapRes, analyticsRes] = await Promise.allSettled([
            fetch(`${API}/api/concept-map/${currentSessionId}`),
            fetch(`${API}/api/analytics/${currentSessionId}`)
        ]);

        let mastery = {};
        if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
            const aData = await analyticsRes.value.json();
            mastery = aData.topic_mastery || {};
            if (window.setConceptMapMastery) window.setConceptMapMastery(mastery);
        }

        if (mapRes.status === 'fulfilled' && mapRes.value.ok) {
            const data = await mapRes.value.json();
            if (data.nodes && data.nodes.length > 0) {
                if (window.initConceptGraph) window.initConceptGraph(data.nodes, data.edges || [], mastery);
                renderCheatSheet(data.cheat_sheet || '');
            }
        }
    } catch (e) {
        console.error('Failed to load concept map:', e);
    }
}

async function generateConceptMap() {
    if (!currentSessionId) { showToast('Select a session first', 'error'); return; }
    const btn = document.getElementById('btn-gen-map');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
    if (window.setBudState) window.setBudState('thinking');

    try {
        const [genRes, analyticsRes] = await Promise.allSettled([
            fetch(`${API}/api/concept-map/generate`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ session_id: currentSessionId })
            }),
            fetch(`${API}/api/analytics/${currentSessionId}`)
        ]);

        let mastery = {};
        if (analyticsRes.status === 'fulfilled' && analyticsRes.value.ok) {
            const aData = await analyticsRes.value.json();
            mastery = aData.topic_mastery || {};
            if (window.setConceptMapMastery) window.setConceptMapMastery(mastery);
        }

        if (genRes.status === 'fulfilled' && genRes.value.ok) {
            const data = await genRes.value.json();
            if (window.initConceptGraph) window.initConceptGraph(data.nodes || [], data.edges || [], mastery);
            renderCheatSheet(data.cheat_sheet || '');
            showToast('Concept map generated!', 'success');
            if (window.setBudState) window.setBudState('happy');
        } else {
            showToast('Failed to generate map', 'error');
            if (window.setBudState) window.setBudState('idle');
        }
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
        if (window.setBudState) window.setBudState('idle');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '🗺️ Generate Concept Map'; }
    }
}
window.generateConceptMap = generateConceptMap;

function renderCheatSheet(markdown) {
    const panel = document.getElementById('cheat-sheet-panel');
    if (!panel) return;
    if (!markdown) {
        panel.innerHTML = '<div style="padding:24px;text-align:center;color:var(--text-muted);font-size:0.85rem;">Generate a concept map to view key takeaways</div>';
        return;
    }
    panel.innerHTML = formatMarkdown(markdown);
}

function quizFromNode() {
    const btn = document.getElementById('btn-quiz-node');
    const topic = btn ? btn.dataset.topic : '';
    if (topic) {
        switchWorkspace(5); // 5 is Quiz Arena
        quizQuestionCount = 5;
        const valEl = document.getElementById('stepper-count-val');
        if (valEl) valEl.textContent = '5';
        generateQuiz(topic);
    }
}
window.quizFromNode = quizFromNode;

function askAboutNode() {
    const btn = document.getElementById('btn-ask-node');
    const topic = btn ? btn.dataset.topic : '';
    if (topic) {
        switchWorkspace(0); // 0 is Chat
        const input = document.getElementById('chat-input');
        if (input) {
            input.value = `Explain the concept of ${topic} and how it relates to my notes.`;
            input.focus();
        }
    }
}
window.askAboutNode = askAboutNode;

// ─── Book Studio ─────────────────────────────────────────────────────────────
async function generateBook() {
    if (!currentSessionId) { showToast('Select a session first', 'error'); return; }
    const btn = document.getElementById('btn-gen-book');
    if (btn) { btn.disabled = true; btn.textContent = 'Writing...'; }
    if (window.setBudState) window.setBudState('thinking');

    try {
        const res = await fetch(`${API}/api/book/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ session_id: currentSessionId })
        });
        const data = await res.json();
        showToast(data.message || 'Book synthesis started!', 'success');
        startBookPolling();
    } catch (e) {
        showToast(`Error: ${e.message}`, 'error');
        if (window.setBudState) window.setBudState('idle');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = '📖 Synthesize Book'; }
    }
}
window.generateBook = generateBook;

function startBookPolling() {
    if (bookPollInterval) clearInterval(bookPollInterval);
    bookPollInterval = setInterval(pollBookStatus, 4000);
    pollBookStatus();
}

async function pollBookStatus() {
    if (!currentSessionId) return;
    try {
        const res = await fetch(`${API}/api/book/status/${currentSessionId}`);
        const data = await res.json();
        renderBookUI(data);

        if (data.status === 'COMPLETED' || data.status === 'IDLE') {
            if (bookPollInterval) { clearInterval(bookPollInterval); bookPollInterval = null; }
            if (data.status === 'COMPLETED' && window.setBudState) window.setBudState('celebrating');
        }
    } catch (e) {}
}

function renderBookUI(data) {
    const nav = document.getElementById('book-chapters-nav');
    const content = document.getElementById('book-content');
    if (!nav || !content) return;

    const chapters = data.chapters || [];
    if (chapters.length === 0 && data.status === 'IDLE') {
        hasLoadedFirstChapter = false;
        activeChapterIndex = -1;
        content.innerHTML = `
            <div style="padding:60px 0;text-align:center;color:var(--text-muted);">
                <div style="font-size:2rem;margin-bottom:12px;">📖</div>
                <h3 style="font-family:'Clash Display',sans-serif;color:var(--heading-color);font-size:1.4rem;margin-bottom:8px;">Your study book is waiting</h3>
                <p style="font-size:0.92rem;max-width:440px;margin:0 auto 20px;color:var(--text-secondary);">Upload your materials and click "Synthesize Book" to turn them into structured, publication-grade chapters.</p>
                <button class="btn-cta-marigold" onclick="generateBook()" style="padding:10px 24px;font-size:0.9rem;">Synthesize Book</button>
            </div>
        `;
        return;
    }

    // Generate Sticky Chapter Navigation
    const totalChapters = Math.max(data.total_chapters || 0, chapters.length);
    let navHtml = '';
    for (let i = 0; i < totalChapters; i++) {
        const ch = chapters[i];
        const status = ch ? 'completed' : (i === chapters.length && data.status === 'GENERATING' ? 'generating' : 'queued');
        const label = ch ? ch.title : `Chapter ${i + 1}`;
        navHtml += `<button class="chapter-nav-item ${status} ${i === activeChapterIndex ? 'active' : ''}" onclick="showChapter(${i})">${
            status === 'completed' ? '✓' : status === 'generating' ? '⏳' : '○'
        } ${escapeHtml(label)}</button>`;
    }
    nav.innerHTML = navHtml;

    // Load first chapter initially, without overriding active selection
    if (chapters.length > 0 && !hasLoadedFirstChapter) {
        showChapter(0);
        hasLoadedFirstChapter = true;
    } else if (data.status === 'GENERATING' && chapters.length === 0) {
        content.innerHTML = `<div style="padding:60px 0;text-align:center;"><div style="font-size:2rem;margin-bottom:12px;">⏳</div><h3 style="font-family:'Clash Display',sans-serif;color:var(--heading-color);">Synthesizing Chapter 1...</h3><p style="color:var(--text-secondary);font-size:0.92rem;">You can explore quizzes or chat while this is authored.</p></div>`;
    }
}

function showChapter(index) {
    activeChapterIndex = index;
    fetch(`${API}/api/book/status/${currentSessionId}`).then(r => r.json()).then(data => {
        const chapters = data.chapters || [];
        const ch = chapters[index];
        const content = document.getElementById('book-content');
        if (!content) return;

        if (ch) {
            content.innerHTML = `<h1>${escapeHtml(ch.title)}</h1>${formatMarkdown(ch.content || '')}`;
        } else {
            content.innerHTML = `<div style="padding:40px 0;text-align:center;color:var(--text-muted);"><h3 style="color:var(--heading-color);">Chapter ${index + 1}</h3><p style="color:var(--text-secondary);">This chapter is currently in queue...</p></div>`;
        }

        document.querySelectorAll('.chapter-nav-item').forEach((el, i) => {
            el.classList.toggle('active', i === index);
        });
    });
}
window.showChapter = showChapter;

function downloadBook() {
    fetch(`${API}/api/book/status/${currentSessionId}`).then(r => r.json()).then(data => {
        const chapters = data.chapters || [];
        if (chapters.length === 0) { showToast('No book content yet', 'error'); return; }

        let htmlContent = `
        <!DOCTYPE html>
        <html><head><title>${escapeHtml(data.title || 'Study Book')}</title>
        <style>
            body { font-family: 'Georgia', serif; line-height: 1.8; color: #12060F; padding: 50px; max-width: 760px; margin: 0 auto; background: #FFF; }
            h1.cover { font-size: 2.8em; text-align: center; margin-top: 25vh; page-break-after: always; font-family: sans-serif; font-weight: 700; }
            h1 { color: #12060F; border-bottom: 2px solid #EAAA00; padding-bottom: 8px; page-break-before: always; margin-top: 40px; font-family: sans-serif; }
            h2 { color: #3A0F34; margin-top: 28px; font-family: sans-serif; }
            p { margin-bottom: 20px; font-size: 1.05em; }
            code { background: #F4F4F6; padding: 2px 6px; border-radius: 4px; font-family: monospace; }
        </style></head><body>`;

        htmlContent += `<h1 class="cover">${escapeHtml(data.title || 'Study Book')}<br><span style="font-size:0.4em;font-weight:400;color:#666;">Crafted with Shiksha Buddy</span></h1>`;

        chapters.forEach(ch => {
            htmlContent += `<h1>${escapeHtml(ch.title)}</h1>`;
            htmlContent += formatMarkdown(ch.content || '');
        });

        htmlContent += `</body></html>`;

        const printWindow = window.open('', '_blank');
        printWindow.document.write(htmlContent);
        printWindow.document.close();
        printWindow.focus();
        setTimeout(() => { printWindow.print(); }, 500);
        showToast('PDF export opened!', 'success');
    });
}
window.downloadBook = downloadBook;

// ─── C7: Focus Mode Controller ──────────────────────────────────────────────
let focusState = {
    mode: 'idle', // 'idle' | 'running' | 'paused' | 'done'
    presetMin: 25,
    totalSec: 25 * 60,
    remainingSec: 25 * 60,
    endAt: null
};
let focusTimerInterval = null;

function saveFocusState() {
    try {
        localStorage.setItem('shiksha_focus_timer', JSON.stringify(focusState));
    } catch (e) {}
}

function restoreFocusState() {
    try {
        const raw = localStorage.getItem('shiksha_focus_timer');
        if (raw) {
            const saved = JSON.parse(raw);
            if (saved && typeof saved === 'object') {
                focusState.presetMin = saved.presetMin || 25;
                focusState.totalSec = saved.totalSec || (focusState.presetMin * 60);
                document.querySelectorAll('.focus-preset-btn').forEach(b => {
                    b.classList.toggle('active', parseInt(b.dataset.min) === focusState.presetMin);
                });

                if (saved.mode === 'running' && saved.endAt) {
                    const remaining = Math.max(0, Math.round((saved.endAt - Date.now()) / 1000));
                    if (remaining > 0) {
                        focusState.mode = 'running';
                        focusState.remainingSec = remaining;
                        focusState.endAt = saved.endAt;
                        startFocusInterval();
                    } else {
                        focusState.mode = 'idle';
                        focusState.remainingSec = focusState.totalSec;
                        focusState.endAt = null;
                    }
                } else if (saved.mode === 'paused') {
                    focusState.mode = 'paused';
                    focusState.remainingSec = saved.remainingSec || focusState.totalSec;
                    focusState.endAt = null;
                } else {
                    focusState.mode = 'idle';
                    focusState.remainingSec = focusState.totalSec;
                    focusState.endAt = null;
                }
            }
        }
    } catch (e) {}
    updateFocusUI();
}

function toggleFocusPopover(force) {
    const popover = document.getElementById('focus-popover');
    const pill = document.getElementById('btn-focus-pill');
    if (!popover) return;

    const willOpen = typeof force === 'boolean' ? force : !popover.classList.contains('is-open');
    if (willOpen) {
        if (pill) {
            const rect = pill.getBoundingClientRect();
            popover.style.top = `${rect.bottom + 8}px`;
            popover.style.right = `${Math.max(12, window.innerWidth - rect.right)}px`;
            popover.style.left = 'auto';
        }
        popover.classList.add('is-open', 'open');
        popover.setAttribute('aria-hidden', 'false');
    } else {
        popover.classList.remove('is-open', 'open');
        popover.setAttribute('aria-hidden', 'true');
    }
}
window.toggleFocusPopover = toggleFocusPopover;

function setFocusPreset(min) {
    min = parseInt(min) || 25;
    if (focusState.mode === 'running') {
        pauseFocusTimer();
    }
    focusState.presetMin = min;
    focusState.totalSec = min * 60;
    focusState.remainingSec = focusState.totalSec;
    focusState.mode = 'idle';
    focusState.endAt = null;

    document.querySelectorAll('.focus-preset-btn').forEach(b => {
        b.classList.toggle('active', parseInt(b.dataset.min) === min);
    });

    saveFocusState();
    updateFocusUI();
}
window.setFocusPreset = setFocusPreset;

function toggleFocusTimer() {
    if (focusState.mode === 'running') {
        pauseFocusTimer();
    } else {
        startFocusTimer();
    }
}
window.toggleFocusTimer = toggleFocusTimer;

function startFocusTimer() {
    focusState.mode = 'running';
    focusState.endAt = Date.now() + focusState.remainingSec * 1000;
    startFocusInterval();
    saveFocusState();
    updateFocusUI();
}

function pauseFocusTimer() {
    focusState.mode = 'paused';
    if (focusTimerInterval) clearInterval(focusTimerInterval);
    focusTimerInterval = null;
    focusState.remainingSec = Math.max(0, Math.round((focusState.endAt - Date.now()) / 1000));
    focusState.endAt = null;
    saveFocusState();
    updateFocusUI();
}

function resetFocusTimer() {
    if (focusTimerInterval) clearInterval(focusTimerInterval);
    focusTimerInterval = null;
    focusState.mode = 'idle';
    focusState.remainingSec = focusState.totalSec;
    focusState.endAt = null;
    saveFocusState();
    updateFocusUI();
}
window.resetFocusTimer = resetFocusTimer;

function startFocusInterval() {
    if (focusTimerInterval) clearInterval(focusTimerInterval);
    focusTimerInterval = setInterval(() => {
        const now = Date.now();
        focusState.remainingSec = Math.max(0, Math.round((focusState.endAt - now) / 1000));
        updateFocusUI();

        if (focusState.remainingSec <= 0) {
            clearInterval(focusTimerInterval);
            focusTimerInterval = null;
            focusState.mode = 'idle';
            focusState.remainingSec = focusState.totalSec;
            focusState.endAt = null;
            saveFocusState();
            updateFocusUI();
            showToast('Nice work. Take a 5 minute break.', 'info');
        }
    }, 250);
}

function updateFocusUI() {
    const isRunning = focusState.mode === 'running';
    const timeDisplay = document.getElementById('focus-time-display');
    const pillTimeText = document.getElementById('focus-time-text');
    const ringProgress = document.getElementById('focus-ring-progress');
    const pill = document.getElementById('btn-focus-pill');
    const btnToggle = document.getElementById('btn-focus-toggle');
    const appEl = document.getElementById('app');

    const m = Math.floor(focusState.remainingSec / 60).toString().padStart(2, '0');
    const s = (focusState.remainingSec % 60).toString().padStart(2, '0');
    const formatted = `${m}:${s}`;

    if (timeDisplay) timeDisplay.textContent = formatted;
    if (pillTimeText) pillTimeText.textContent = formatted;

    if (ringProgress) {
        const circumference = 56.548;
        const progress = focusState.totalSec > 0 ? (focusState.remainingSec / focusState.totalSec) : 0;
        ringProgress.style.strokeDasharray = `${circumference}`;
        ringProgress.style.strokeDashoffset = `${circumference * (1 - progress)}`;
    }

    if (pill) {
        pill.classList.toggle('running', isRunning);
        pill.classList.toggle('active', isRunning);
    }

    if (btnToggle) {
        if (focusState.mode === 'running') {
            btnToggle.textContent = 'Pause';
        } else if (focusState.mode === 'paused') {
            btnToggle.textContent = 'Resume';
        } else {
            btnToggle.textContent = 'Start';
        }
    }

    if (appEl) {
        appEl.classList.toggle('focus-active', isRunning);
    }
}

// ─── C1: Summary Studio Controller ──────────────────────────────────────────
let currentSummaryJobId = null;
let currentSummaryEventSource = null;
let summaryPollingTimer = null;
let lastSummaryResult = null;
const summarySessionResults = {}; // Scoped by sessionId
const summaryCacheByKey = {}; // Key = sessionId|filesKey|words|style
let activeSummaryTag = null; // { session_id, words, style, files, job_id, timestamp }
let pendingBackgroundSummary = null; // { tag, result }

const summaryState = {
    words: 500,
    style: 'paragraph',
    files: 'all'
};

let summaryControlsBound = false;

function getSummaryFilesKey(fileIds) {
    if (fileIds === 'all') return 'all';
    if (Array.isArray(fileIds)) return fileIds.slice().sort().join(',');
    return String(fileIds);
}

function makeSummaryCacheKey(sessionId, files, words, style) {
    return `${sessionId}|${getSummaryFilesKey(files)}|${words}|${style}`;
}

function getSelectedSummaryFiles() {
    const fileAllCb = document.getElementById('summary-all-files-checkbox');
    if (!fileAllCb || fileAllCb.checked) return 'all';
    const checked = Array.from(document.querySelectorAll('.summary-file-cb:checked')).map(cb => parseInt(cb.value));
    return checked.length > 0 ? checked : 'all';
}

function updateSummaryScrollFade(bodyEl) {
    if (!bodyEl) bodyEl = document.getElementById('summary-prose-content');
    if (!bodyEl) return;
    const paper = document.getElementById('summary-reading-card');
    if (!paper) return;
    const atEnd = (bodyEl.scrollHeight - bodyEl.scrollTop - bodyEl.clientHeight) <= 12;
    if (atEnd) {
        paper.classList.add('sum-scrolled-end');
    } else {
        paper.classList.remove('sum-scrolled-end');
    }
}

function positionSummaryIndicator(controlId, indicatorId, activeBtn) {
    const control = document.getElementById(controlId);
    const indicator = document.getElementById(indicatorId);
    if (!control || !indicator || !activeBtn) return;
    const rect = activeBtn.getBoundingClientRect();
    const parentRect = control.getBoundingClientRect();
    const left = rect.left - parentRect.left;
    indicator.style.width = `${rect.width}px`;
    indicator.style.transform = `translateX(${left}px)`;
}

function updateSummaryIndicators() {
    const lengthControl = document.getElementById('summary-length-control');
    const styleControl = document.getElementById('summary-style-control');
    if (lengthControl) {
        let activeBtn = lengthControl.querySelector(`.summary-segment-btn[data-val="${summaryState.words}"]`);
        if (!activeBtn && summaryState.words !== 100 && summaryState.words !== 250 && summaryState.words !== 500 && summaryState.words !== 1000) {
            activeBtn = document.getElementById('summary-btn-custom');
        }
        if (activeBtn) positionSummaryIndicator('summary-length-control', 'length-indicator', activeBtn);
    }
    if (styleControl) {
        const activeBtn = styleControl.querySelector(`.summary-segment-btn[data-style="${summaryState.style}"]`);
        if (activeBtn) positionSummaryIndicator('summary-style-control', 'style-indicator', activeBtn);
    }
}

function initSummaryStudio() {
    const filesList = document.getElementById('summary-files-list');
    const fileAllCb = document.getElementById('summary-all-files-checkbox');
    const btnStart = document.getElementById('btn-start-summary');
    const btnStartText = document.getElementById('btn-start-summary-text');
    const hasFiles = currentSessionFiles && currentSessionFiles.length > 0;

    if (filesList) {
        if (!hasFiles) {
            filesList.innerHTML = `<div style="padding:20px;text-align:center;color:var(--text-muted);font-size:0.85rem;">No files uploaded in this session yet.<br>Upload files to create a summary.</div>`;
        } else {
            filesList.innerHTML = currentSessionFiles.map(f => {
                const cleanName = cleanFileName(f.name);
                return `
                    <label class="summary-file-cb-row" title="${escapeHtml(cleanName)}">
                        <input type="checkbox" class="summary-file-cb" value="${f.id}" checked>
                        <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z"/><polyline points="14 2 14 8 20 8"/></svg>
                        <span class="summary-file-cb-name">${escapeHtml(cleanName)}</span>
                    </label>
                `;
            }).join('');
        }
    }

    if (fileAllCb) {
        fileAllCb.checked = true;
        fileAllCb.onchange = () => {
            document.querySelectorAll('.summary-file-cb').forEach(cb => {
                cb.checked = fileAllCb.checked;
            });
            summaryState.files = fileAllCb.checked ? 'all' : [];
            checkAndShowCachedSummary();
        };
    }

    // Attach checkbox changes to check cache
    if (filesList) {
        filesList.querySelectorAll('.summary-file-cb').forEach(cb => {
            cb.onchange = () => {
                checkAndShowCachedSummary();
            };
        });
    }

    // Disable Summarize button if no files
    if (btnStart) {
        if (!hasFiles) {
            btnStart.disabled = true;
            btnStart.title = 'Upload a file to summarize.';
            if (btnStartText) btnStartText.textContent = 'Upload a file to summarize.';
        } else {
            btnStart.disabled = false;
            btnStart.title = 'Summarize chosen files';
            if (btnStartText) btnStartText.textContent = 'Summarize';
        }
    }

    // Bind controls once and restore active state
    setupSummarySegmentedControls();

    // Setup scroll fade listener
    const proseContent = document.getElementById('summary-prose-content');
    if (proseContent && !proseContent._fadeBound) {
        proseContent.addEventListener('scroll', () => updateSummaryScrollFade(proseContent), { passive: true });
        proseContent._fadeBound = true;
    }

    // Check if current session has cached UI result
    if (currentSessionId && summarySessionResults[currentSessionId]) {
        renderSummary(summarySessionResults[currentSessionId]);
    } else {
        clearSummaryResultUI();
    }
}
window.initSummaryStudio = initSummaryStudio;

function checkAndShowCachedSummary() {
    if (!currentSessionId) return false;
    const fileIds = getSelectedSummaryFiles();
    const key = makeSummaryCacheKey(currentSessionId, fileIds, summaryState.words, summaryState.style);
    if (summaryCacheByKey[key]) {
        renderSummary(summaryCacheByKey[key]);
        return true;
    }
    return false;
}

function setupSummarySegmentedControls() {
    const lengthControl = document.getElementById('summary-length-control');
    const styleControl = document.getElementById('summary-style-control');
    const customWrap = document.getElementById('summary-custom-length-wrap');
    const customInput = document.getElementById('summary-custom-length-input');
    const customBtn = document.getElementById('summary-btn-custom');

    // Restore active state in UI from summaryState
    if (lengthControl) {
        const isStandard = [100, 250, 500, 1000].includes(summaryState.words);
        lengthControl.querySelectorAll('.summary-segment-btn').forEach(btn => {
            const val = btn.dataset.val;
            const isMatch = isStandard ? parseInt(val) === summaryState.words : val === 'custom';
            btn.classList.toggle('active', isMatch);
            btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
            btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
            btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
            btn.setAttribute('tabindex', isMatch ? '0' : '-1');
        });
        if (!isStandard) {
            if (customWrap) customWrap.style.display = 'flex';
            if (customBtn) customBtn.textContent = `Custom · ${summaryState.words}`;
            if (customInput) customInput.value = summaryState.words;
        } else {
            if (customWrap) customWrap.style.display = 'none';
            if (customBtn) customBtn.textContent = 'Custom';
        }
    }

    if (styleControl) {
        styleControl.querySelectorAll('.summary-segment-btn').forEach(btn => {
            const isMatch = btn.dataset.style === summaryState.style;
            btn.classList.toggle('active', isMatch);
            btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
            btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
            btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
            btn.setAttribute('tabindex', isMatch ? '0' : '-1');
        });
    }

    setTimeout(updateSummaryIndicators, 20);

    if (summaryControlsBound) return;
    summaryControlsBound = true;

    // Event delegation on Length control
    if (lengthControl) {
        lengthControl.addEventListener('click', (e) => {
            const btn = e.target.closest('.summary-segment-btn');
            if (!btn) return;
            const val = btn.dataset.val;

            lengthControl.querySelectorAll('.summary-segment-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
                b.setAttribute('aria-pressed', 'false');
                b.setAttribute('aria-checked', 'false');
                b.setAttribute('tabindex', '-1');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            btn.setAttribute('aria-pressed', 'true');
            btn.setAttribute('aria-checked', 'true');
            btn.setAttribute('tabindex', '0');

            if (val === 'custom') {
                if (customWrap) customWrap.style.display = 'flex';
                let cVal = customInput ? parseInt(customInput.value) : 750;
                if (isNaN(cVal) || cVal < 50 || cVal > 3000) cVal = 750;
                summaryState.words = cVal;
                btn.textContent = `Custom · ${cVal}`;
                if (customInput) {
                    customInput.value = cVal;
                    customInput.focus();
                }
            } else {
                if (customWrap) customWrap.style.display = 'none';
                if (customBtn) customBtn.textContent = 'Custom';
                summaryState.words = parseInt(val) || 500;
            }
            positionSummaryIndicator('summary-length-control', 'length-indicator', btn);

            // Switching back to an already generated length shows its cached result immediately
            checkAndShowCachedSummary();
        });

        // Arrow keys keyboard navigation
        lengthControl.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const buttons = Array.from(lengthControl.querySelectorAll('.summary-segment-btn'));
                const currentIndex = buttons.findIndex(b => b.classList.contains('active'));
                const nextIndex = e.key === 'ArrowRight' 
                    ? (currentIndex + 1) % buttons.length 
                    : (currentIndex - 1 + buttons.length) % buttons.length;
                buttons[nextIndex].click();
                buttons[nextIndex].focus();
            }
        });
    }

    // Custom input listener (min 50, max 3000, step 50, Enter applies)
    if (customInput) {
        const applyCustomVal = () => {
            let val = parseInt(customInput.value);
            if (isNaN(val)) val = 500;
            val = Math.max(50, Math.min(3000, Math.round(val / 50) * 50));
            customInput.value = val;
            summaryState.words = val;
            if (customBtn) {
                customBtn.textContent = `Custom · ${val}`;
                positionSummaryIndicator('summary-length-control', 'length-indicator', customBtn);
            }
            checkAndShowCachedSummary();
        };

        customInput.addEventListener('change', applyCustomVal);
        customInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                applyCustomVal();
                customInput.blur();
            }
        });
    }

    // Event delegation on Style control
    if (styleControl) {
        styleControl.addEventListener('click', (e) => {
            const btn = e.target.closest('.summary-segment-btn');
            if (!btn) return;
            styleControl.querySelectorAll('.summary-segment-btn').forEach(b => {
                b.classList.remove('active');
                b.setAttribute('aria-selected', 'false');
                b.setAttribute('aria-pressed', 'false');
                b.setAttribute('aria-checked', 'false');
                b.setAttribute('tabindex', '-1');
            });
            btn.classList.add('active');
            btn.setAttribute('aria-selected', 'true');
            btn.setAttribute('aria-pressed', 'true');
            btn.setAttribute('aria-checked', 'true');
            btn.setAttribute('tabindex', '0');
            summaryState.style = btn.dataset.style || 'paragraph';
            positionSummaryIndicator('summary-style-control', 'style-indicator', btn);

            checkAndShowCachedSummary();
        });

        // Arrow keys keyboard navigation
        styleControl.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                e.preventDefault();
                const buttons = Array.from(styleControl.querySelectorAll('.summary-segment-btn'));
                const currentIndex = buttons.findIndex(b => b.classList.contains('active'));
                const nextIndex = e.key === 'ArrowRight' 
                    ? (currentIndex + 1) % buttons.length 
                    : (currentIndex - 1 + buttons.length) % buttons.length;
                buttons[nextIndex].click();
                buttons[nextIndex].focus();
            }
        });
    }

    window.addEventListener('resize', updateSummaryIndicators);
}

function clearSummaryResultUI() {
    lastSummaryResult = null;
    const progressWrap = document.getElementById('summary-running-state');
    const emptyView = document.getElementById('summary-idle-state');
    const contentView = document.getElementById('summary-result-state');
    const errorView = document.getElementById('summary-error-state');
    if (progressWrap) progressWrap.style.display = 'none';
    if (contentView) contentView.style.display = 'none';
    if (errorView) errorView.style.display = 'none';
    if (emptyView) emptyView.style.display = 'block';
}

function showSummaryError(msg = "Couldn't finish this summary. Try again.") {
    if (summaryPollingTimer) {
        clearInterval(summaryPollingTimer);
        summaryPollingTimer = null;
    }
    if (currentSummaryEventSource) {
        currentSummaryEventSource.close();
        currentSummaryEventSource = null;
    }
    const progressWrap = document.getElementById('summary-running-state');
    const emptyView = document.getElementById('summary-idle-state');
    const contentView = document.getElementById('summary-result-state');
    const errorView = document.getElementById('summary-error-state');
    const errorDesc = document.getElementById('summary-error-desc');
    const btnStart = document.getElementById('btn-start-summary');

    if (progressWrap) progressWrap.style.display = 'none';
    if (emptyView) emptyView.style.display = 'none';
    if (contentView) contentView.style.display = 'none';
    if (errorView) errorView.style.display = 'flex';
    if (errorDesc) errorDesc.textContent = msg;
    if (btnStart) btnStart.disabled = false;
    if (window.setBudState) window.setBudState('idle');
}

function viewSummaryResult(tag, resObj) {
    switchWorkspace(4);

    if (tag && tag.words) {
        summaryState.words = tag.words;
        const lengthControl = document.getElementById('summary-length-control');
        const customWrap = document.getElementById('summary-custom-length-wrap');
        const customBtn = document.getElementById('summary-btn-custom');
        const customInput = document.getElementById('summary-custom-length-input');
        if (lengthControl) {
            const isStandard = [100, 250, 500, 1000].includes(tag.words);
            lengthControl.querySelectorAll('.summary-segment-btn').forEach(btn => {
                const val = btn.dataset.val;
                const isMatch = isStandard ? parseInt(val) === tag.words : val === 'custom';
                btn.classList.toggle('active', isMatch);
                btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
                btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
                btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
                btn.setAttribute('tabindex', isMatch ? '0' : '-1');
            });
            if (!isStandard) {
                if (customWrap) customWrap.style.display = 'flex';
                if (customBtn) customBtn.textContent = `Custom · ${tag.words}`;
                if (customInput) customInput.value = tag.words;
            } else {
                if (customWrap) customWrap.style.display = 'none';
                if (customBtn) customBtn.textContent = 'Custom';
            }
        }
    }

    if (tag && tag.style) {
        summaryState.style = tag.style;
        const styleControl = document.getElementById('summary-style-control');
        if (styleControl) {
            styleControl.querySelectorAll('.summary-segment-btn').forEach(btn => {
                const isMatch = btn.dataset.style === tag.style;
                btn.classList.toggle('active', isMatch);
                btn.setAttribute('aria-selected', isMatch ? 'true' : 'false');
                btn.setAttribute('aria-pressed', isMatch ? 'true' : 'false');
                btn.setAttribute('aria-checked', isMatch ? 'true' : 'false');
                btn.setAttribute('tabindex', isMatch ? '0' : '-1');
            });
        }
    }

    updateSummaryIndicators();
    renderSummary(resObj);
}

function handleJobFinished(jobTag, resObj) {
    if (summaryPollingTimer) {
        clearInterval(summaryPollingTimer);
        summaryPollingTimer = null;
    }
    if (currentSummaryEventSource) {
        currentSummaryEventSource.close();
        currentSummaryEventSource = null;
    }

    const key = makeSummaryCacheKey(jobTag.session_id, jobTag.files, jobTag.words, jobTag.style);
    summaryCacheByKey[key] = resObj;

    // Never render a result from a different session
    if (jobTag.session_id !== currentSessionId) {
        return;
    }

    // Never let a late job overwrite a newer job's result
    if (activeSummaryTag && activeSummaryTag.timestamp > jobTag.timestamp) {
        showToastWithAction(`Your ${jobTag.words}-word summary is ready`, 'View', () => {
            viewSummaryResult(jobTag, resObj);
        });
        const activeDock = document.querySelector('.dock-item.active');
        if (!activeDock || parseInt(activeDock.dataset.ws) !== 4) {
            const dot = document.getElementById('summary-dock-dot');
            if (dot) dot.style.display = 'block';
        }
        return;
    }

    const isCurrentSettings = (summaryState.words === jobTag.words && summaryState.style === jobTag.style);
    const activeDock = document.querySelector('.dock-item.active');
    const isOnSummaryView = activeDock && parseInt(activeDock.dataset.ws) === 4;

    if (isCurrentSettings && isOnSummaryView) {
        renderSummary(resObj);
        showToast('Summary ready! ✨', 'success');
    } else {
        // User switched length, style, or workspace
        pendingBackgroundSummary = { tag: jobTag, result: resObj };
        summarySessionResults[currentSessionId] = resObj;

        // Show dock dot
        const dot = document.getElementById('summary-dock-dot');
        if (dot) dot.style.display = 'block';

        showToastWithAction(`Your ${jobTag.words}-word summary is ready`, 'View', () => {
            viewSummaryResult(jobTag, resObj);
        });
    }
}
window.viewSummaryResult = viewSummaryResult;
window.handleJobFinished = handleJobFinished;
window.showSummaryError = showSummaryError;
window.summaryCacheByKey = summaryCacheByKey;

async function startSummaryJob() {
    if (!currentSessionId) {
        showToast('Please select or create a study session first', 'error');
        return;
    }

    if (!currentSessionFiles || currentSessionFiles.length === 0) {
        showToast('Upload a file to summarize.', 'error');
        return;
    }

    const fileIds = getSelectedSummaryFiles();
    if (fileIds !== 'all' && (!fileIds || fileIds.length === 0)) {
        showToast('Select at least one file to summarize', 'error');
        return;
    }

    // Check memory cache first
    const cacheKey = makeSummaryCacheKey(currentSessionId, fileIds, summaryState.words, summaryState.style);
    if (summaryCacheByKey[cacheKey]) {
        renderSummary(summaryCacheByKey[cacheKey]);
        return;
    }

    const jobTimestamp = Date.now();
    const jobTag = {
        session_id: currentSessionId,
        words: summaryState.words,
        style: summaryState.style,
        files: fileIds,
        job_id: null,
        timestamp: jobTimestamp
    };
    activeSummaryTag = jobTag;

    const progressWrap = document.getElementById('summary-running-state');
    const emptyView = document.getElementById('summary-idle-state');
    const contentView = document.getElementById('summary-result-state');
    const errorView = document.getElementById('summary-error-state');
    const progressBar = document.getElementById('summary-progress-fill');
    const progressStep = document.getElementById('summary-step-text');
    const btnStart = document.getElementById('btn-start-summary');

    if (emptyView) emptyView.style.display = 'none';
    if (contentView) contentView.style.display = 'none';
    if (errorView) errorView.style.display = 'none';
    if (progressWrap) progressWrap.style.display = 'block';
    if (progressBar) progressBar.style.transform = 'scaleX(0.05)';
    if (progressStep) progressStep.textContent = 'Starting summary...';
    if (btnStart) btnStart.disabled = true;

    if (window.setBudState) window.setBudState('thinking');

    try {
        const res = await fetch(`${API}/api/summary/start`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                file_ids: fileIds,
                words: summaryState.words,
                style: summaryState.style
            })
        });
        const data = await res.json();

        // Cached instant response
        if (data.cached || data.status === 'COMPLETED' || data.text || data.content) {
            const summaryText = data.text || data.content || '';
            const resObj = {
                text: summaryText,
                words_target: jobTag.words,
                cached: true
            };
            handleJobFinished(jobTag, resObj);
            return;
        }

        // Background worker job
        jobTag.job_id = data.job_id;
        currentSummaryJobId = data.job_id;

        if (currentSummaryEventSource) currentSummaryEventSource.close();
        if (summaryPollingTimer) clearInterval(summaryPollingTimer);

        let jobCompleted = false;

        const onDone = (resObj) => {
            if (jobCompleted) return;
            jobCompleted = true;
            if (currentSummaryEventSource) {
                currentSummaryEventSource.close();
                currentSummaryEventSource = null;
            }
            if (summaryPollingTimer) {
                clearInterval(summaryPollingTimer);
                summaryPollingTimer = null;
            }
            handleJobFinished(jobTag, resObj);
        };

        currentSummaryEventSource = new EventSource(`${API}/api/summary/${data.job_id}/events`);

        currentSummaryEventSource.onmessage = (e) => {
            try {
                const ev = JSON.parse(e.data);
                if (ev.phase === 'reading') {
                    const done = ev.done || 0;
                    const total = ev.total || 1;
                    const pct = Math.max(0.08, Math.min(0.5, (done / Math.max(1, total)) * 0.5));
                    if (progressBar) progressBar.style.transform = `scaleX(${pct})`;
                    if (progressStep) progressStep.textContent = `Reading part ${done} of ${total}`;
                } else if (ev.phase === 'combining') {
                    if (progressBar) progressBar.style.transform = 'scaleX(0.68)';
                    if (progressStep) progressStep.textContent = 'Combining notes...';
                } else if (ev.phase === 'writing') {
                    if (progressBar) progressBar.style.transform = 'scaleX(0.88)';
                    if (progressStep) progressStep.textContent = 'Writing summary...';
                }

                if (ev.done && ev.text) {
                    if (progressBar) progressBar.style.transform = 'scaleX(1)';
                    onDone({
                        text: ev.text,
                        words_target: jobTag.words,
                        cached: false
                    });
                } else if (ev.error) {
                    if (currentSummaryEventSource) {
                        currentSummaryEventSource.close();
                        currentSummaryEventSource = null;
                    }
                    if (summaryPollingTimer) {
                        clearInterval(summaryPollingTimer);
                        summaryPollingTimer = null;
                    }
                    showSummaryError("Couldn't finish this summary. Try again.");
                    showToast('Summary generation failed', 'error');
                }
            } catch (err) {}
        };

        currentSummaryEventSource.onerror = () => {
            // Wait for polling to check before declaring error
        };

        // Polling Fallback: checks every 3 seconds
        summaryPollingTimer = setInterval(async () => {
            if (jobCompleted) return;
            try {
                const pollRes = await fetch(`${API}/api/summary/start`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        session_id: jobTag.session_id,
                        file_ids: jobTag.files,
                        words: jobTag.words,
                        style: jobTag.style
                    })
                });
                if (pollRes.ok) {
                    const pollData = await pollRes.json();
                    if (pollData.cached && (pollData.text || pollData.content)) {
                        onDone({
                            text: pollData.text || pollData.content || '',
                            words_target: jobTag.words,
                            cached: false
                        });
                    }
                }
            } catch (err) {}
        }, 3000);

    } catch (err) {
        showSummaryError("Couldn't finish this summary. Try again.");
        showToast(`Failed: ${err.message}`, 'error');
    }
}
window.startSummaryJob = startSummaryJob;

function cancelCurrentSummaryJob() {
    if (currentSummaryEventSource) {
        currentSummaryEventSource.close();
        currentSummaryEventSource = null;
    }
    if (summaryPollingTimer) {
        clearInterval(summaryPollingTimer);
        summaryPollingTimer = null;
    }
    if (currentSummaryJobId) {
        fetch(`${API}/api/summary/${currentSummaryJobId}/cancel`, { method: 'POST' }).catch(() => {});
        currentSummaryJobId = null;
    }
    showSummaryError("Couldn't finish this summary. Try again.");
    showToast('Summary canceled', 'info');
}
window.cancelCurrentSummaryJob = cancelCurrentSummaryJob;

function renderSummary(result) {
    if (!result) return;
    lastSummaryResult = result;
    if (currentSessionId) {
        summarySessionResults[currentSessionId] = result;
    }

    const progressWrap = document.getElementById('summary-running-state');
    const emptyView = document.getElementById('summary-idle-state');
    const contentView = document.getElementById('summary-result-state');
    const errorView = document.getElementById('summary-error-state');
    const statPill = document.getElementById('summary-count-pill');
    const savedTag = document.getElementById('summary-saved-tag');
    const markdownBody = document.getElementById('summary-prose-content');
    const btnStart = document.getElementById('btn-start-summary');

    if (progressWrap) progressWrap.style.display = 'none';
    if (emptyView) emptyView.style.display = 'none';
    if (errorView) errorView.style.display = 'none';
    if (contentView) contentView.style.display = 'flex';
    if (btnStart) btnStart.disabled = false;

    const text = result.text || result.content || '';
    const wordCount = text ? text.trim().split(/\s+/).filter(Boolean).length : 0;
    const targetWords = result.words_target || summaryState.words || 500;

    if (statPill) {
        statPill.textContent = wordCount === 0 ? 'No text yet' : `Target ${targetWords} · Got ${wordCount} words`;
    }
    if (savedTag) {
        savedTag.style.display = result.cached ? 'inline-flex' : 'none';
    }
    if (markdownBody) {
        markdownBody.innerHTML = formatMarkdown(text);
        markdownBody.scrollTop = 0;
        updateSummaryScrollFade(markdownBody);
        if (!markdownBody._fadeBound) {
            markdownBody.addEventListener('scroll', () => updateSummaryScrollFade(markdownBody), { passive: true });
            markdownBody._fadeBound = true;
        }
    }

    const dot = document.getElementById('summary-dock-dot');
    if (dot) dot.style.display = 'none';

    pendingBackgroundSummary = null;
    if (window.setBudState) window.setBudState('happy');
}
window.renderSummary = renderSummary;
window.renderSummaryResult = renderSummary; // backward-compat

function copySummaryText() {
    if (!lastSummaryResult || !lastSummaryResult.text) return;
    navigator.clipboard.writeText(lastSummaryResult.text);
    showToast('Copied summary to clipboard', 'info');
}
window.copySummaryText = copySummaryText;

function downloadSummaryMd() {
    if (!lastSummaryResult || !lastSummaryResult.text) return;
    const blob = new Blob([lastSummaryResult.text], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `summary-${currentSessionId || 'notes'}.md`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    showToast('Downloaded markdown summary', 'success');
}
window.downloadSummaryMd = downloadSummaryMd;

async function pinSummaryToNotebook() {
    if (!currentSessionId || !lastSummaryResult || !lastSummaryResult.text) {
        showToast('No summary to pin', 'error');
        return;
    }
    const lines = lastSummaryResult.text.split('\n').map(l => l.trim()).filter(Boolean);
    const title = (lines[0] || 'Summary').replace(/^[#*\-•\s]+/, '').substring(0, 60);

    try {
        const res = await fetch(`${API}/api/notebook`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                title: `Summary: ${title}`,
                content: lastSummaryResult.text,
                source: 'Summary Studio'
            })
        });
        if (res.ok) {
            showToast('Pinned', 'success');
            loadNotebookItems();
        } else {
            showToast('Failed to pin summary', 'error');
        }
    } catch (e) {
        showToast('Error pinning summary', 'error');
    }
}
window.pinSummaryToNotebook = pinSummaryToNotebook;

// ─── C6: Notebook Controller ────────────────────────────────────────────────
let notebookItems = [];
let lastNotebookTrigger = null;

function toggleNotebookDrawer(open) {
    const drawer = document.getElementById('notebook-drawer');
    const overlay = document.getElementById('notebook-overlay');
    if (!drawer || !overlay) return;

    const willOpen = typeof open === 'boolean' ? open : !drawer.classList.contains('is-open');

    if (willOpen) {
        lastNotebookTrigger = document.activeElement;
        drawer.classList.add('is-open', 'open');
        overlay.classList.add('is-open', 'open');
        drawer.setAttribute('aria-hidden', 'false');
        loadNotebookItems();
        const closeBtn = drawer.querySelector('.btn-drawer-close');
        if (closeBtn) closeBtn.focus();
    } else {
        drawer.classList.remove('is-open', 'open');
        overlay.classList.remove('is-open', 'open');
        drawer.setAttribute('aria-hidden', 'true');
        if (lastNotebookTrigger && typeof lastNotebookTrigger.focus === 'function') {
            lastNotebookTrigger.focus();
        }
    }
}
window.toggleNotebookDrawer = toggleNotebookDrawer;

// Global Escape key listener for slide-over drawers and popovers
window.addEventListener('keydown', (e) => {
    if (e.key === 'Escape') {
        const notebookDrawer = document.getElementById('notebook-drawer');
        if (notebookDrawer && (notebookDrawer.classList.contains('is-open') || notebookDrawer.classList.contains('open'))) {
            toggleNotebookDrawer(false);
            return;
        }
        const fileDrawer = document.getElementById('file-manager-drawer');
        if (fileDrawer && (fileDrawer.classList.contains('is-open') || fileDrawer.classList.contains('open'))) {
            toggleFileManager(false);
            return;
        }
        const focusPopover = document.getElementById('focus-popover');
        if (focusPopover && (focusPopover.classList.contains('is-open') || focusPopover.classList.contains('open'))) {
            toggleFocusPopover(false);
            return;
        }
    }
});

async function loadNotebookItems() {
    if (!currentSessionId) return;
    try {
        const res = await fetch(`${API}/api/notebook?session_id=${currentSessionId}`);
        if (!res.ok) return;
        const items = await res.json();
        notebookItems = items || [];

        // Update badge counts immediately
        const sidebarBadge = document.getElementById('sidebar-notebook-badge');
        const countBadge = document.getElementById('notebook-count-badge');
        const summaryBadge = document.getElementById('notebook-items-summary');
        if (sidebarBadge) {
            sidebarBadge.textContent = notebookItems.length;
            sidebarBadge.style.display = notebookItems.length > 0 ? 'inline-flex' : 'none';
        }
        if (countBadge) {
            countBadge.textContent = `${notebookItems.length} item${notebookItems.length === 1 ? '' : 's'}`;
        }
        if (summaryBadge) {
            summaryBadge.textContent = `${notebookItems.length} saved note${notebookItems.length === 1 ? '' : 's'}`;
        }

        const listContainer = document.getElementById('notebook-items-list');
        if (!listContainer) return;

        if (notebookItems.length === 0) {
            listContainer.innerHTML = `
                <div class="notebook-empty-state" style="padding:60px 24px;text-align:center;color:var(--text-muted);display:flex;flex-direction:column;align-items:center;gap:12px;">
                    <div style="font-size:2rem;color:var(--accent-primary);">📌</div>
                    <div style="font-size:0.95rem;color:var(--text-primary);font-weight:600;">Pin useful answers and summaries here.</div>
                </div>
            `;
            return;
        }

        listContainer.innerHTML = notebookItems.map(item => {
            const dateStr = item.created_at ? new Date(item.created_at).toLocaleDateString(undefined, { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }) : '';
            return `
                <div class="notebook-item-card" data-id="${item.id}">
                    <div class="notebook-item-header">
                        <h4 class="notebook-item-title">${escapeHtml(item.title || 'Pinned Note')}</h4>
                        <button class="btn-notebook-remove" onclick="deleteNotebookItem(${item.id})" title="Remove from notebook" aria-label="Remove">
                            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.75"><path d="M18 6 6 18"/><path d="m6 6 12 12"/></svg>
                        </button>
                    </div>
                    <div class="notebook-item-snippet">${escapeHtml(item.content || '')}</div>
                    <div class="notebook-item-footer">
                        <span class="notebook-source-chip">${escapeHtml(item.source || 'Note')}</span>
                        <span class="notebook-date-text">${dateStr}</span>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        console.error('Failed to load notebook items:', e);
    }
}
window.loadNotebookItems = loadNotebookItems;

async function deleteNotebookItem(id) {
    try {
        const res = await fetch(`${API}/api/notebook/${id}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Note removed', 'info');
            loadNotebookItems();
        } else {
            showToast('Failed to remove note', 'error');
        }
    } catch (e) {
        showToast('Error removing note', 'error');
    }
}
window.deleteNotebookItem = deleteNotebookItem;

async function confirmClearAllNotebook() {
    if (!notebookItems || notebookItems.length === 0) return;
    if (!confirm('Clear all pinned notes from your notebook for this session?')) return;

    try {
        const res = await fetch(`${API}/api/notebook/clear?session_id=${currentSessionId}`, { method: 'DELETE' });
        if (res.ok) {
            showToast('Notebook cleared', 'info');
            loadNotebookItems();
        } else {
            showToast('Failed to clear notebook', 'error');
        }
    } catch (e) {
        showToast('Error clearing notebook', 'error');
    }
}
window.confirmClearAllNotebook = confirmClearAllNotebook;

function exportNotebookStudySheet() {
    if (!notebookItems || notebookItems.length === 0) {
        showToast('Notebook is empty', 'error');
        return;
    }
    // Triggers standard window.print which uses our custom @media print stylesheet
    window.print();
}
window.exportNotebookStudySheet = exportNotebookStudySheet;

// ─── Quiz Arena ──────────────────────────────────────────────────────────────
function selectDifficulty(diff, el) {
    selectedDifficulty = diff;
    document.querySelectorAll('.diff-chip').forEach(c => c.classList.remove('active'));
    if (el) el.classList.add('active');
}
window.selectDifficulty = selectDifficulty;

function adjustQuizStepper(delta) {
    quizQuestionCount = Math.max(3, Math.min(25, quizQuestionCount + delta));
    const valEl = document.getElementById('stepper-count-val');
    if (valEl) valEl.textContent = String(quizQuestionCount);
}
window.adjustQuizStepper = adjustQuizStepper;

async function generateQuiz(focusTopic) {
    if (!currentSessionId) { showToast('Select a study session first', 'error'); return; }

    const btn = document.getElementById('btn-start-quiz');
    if (btn) { btn.disabled = true; btn.textContent = 'Generating...'; }
    if (window.setBudState) window.setBudState('thinking');

    try {
        const res = await fetch(`${API}/api/quiz/generate`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                difficulty_label: selectedDifficulty,
                num_questions: quizQuestionCount,
                focus_topic: focusTopic || ''
            })
        });
        const data = await res.json();
        if (res.ok && data.questions && data.questions.length > 0) {
            currentQuiz = data;
            userAnswers = new Array(data.questions.length).fill(-1);
            renderQuizCards(data.questions);
            showToast(`${data.questions.length} questions prepared!`, 'success');
            if (window.setBudState) window.setBudState('happy');
        } else {
            showToast(`Could not generate quiz. Have you uploaded notes?`, 'error');
            if (window.setBudState) window.setBudState('idle');
        }
    } catch (e) {
        showToast(`Quiz error: ${e.message}`, 'error');
        if (window.setBudState) window.setBudState('idle');
    } finally {
        if (btn) { btn.disabled = false; btn.textContent = 'Start Quiz'; }
    }
}
window.generateQuiz = generateQuiz;

function renderQuizCards(questions) {
    const container = document.getElementById('quiz-questions-container');
    const progressBar = document.getElementById('quiz-top-progress');
    const submitArea = document.getElementById('quiz-submit-area');
    const resultsArea = document.getElementById('quiz-results-container');
    if (!container) return;

    if (progressBar) progressBar.style.display = 'block';
    if (submitArea) submitArea.style.display = 'block';
    if (resultsArea) resultsArea.style.display = 'none';
    updateQuizProgress();

    container.innerHTML = questions.map((q, qi) => `
        <div class="quiz-card glass-card" id="quiz-card-${qi}">
            <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--marigold);text-transform:uppercase;letter-spacing:1px;margin-bottom:8px;">
                Question ${qi + 1} of ${questions.length}
            </div>
            <div class="quiz-card-q">${escapeHtml(q.question)}</div>
            <div class="quiz-options-list">
                ${q.options.map((opt, oi) => `
                    <button class="quiz-option-btn" id="opt-${qi}-${oi}" onclick="selectAnswer(${qi}, ${oi})">
                        ${escapeHtml(opt)}
                    </button>
                `).join('')}
            </div>
            <div class="quiz-explanation" id="explanation-${qi}" style="display:none;padding:14px;border-radius:10px;background:rgba(234,170,0,0.08);border:1px solid rgba(234,170,0,0.25);font-size:0.9rem;line-height:1.6;color:var(--ice);margin-top:14px;">
                💡 ${escapeHtml(q.explanation || '')}
            </div>
        </div>
    `).join('');

    container.scrollIntoView({ behavior: 'smooth' });
}

function selectAnswer(qIndex, oIndex) {
    if (!currentQuiz) return;
    userAnswers[qIndex] = oIndex;

    const q = currentQuiz.questions[qIndex];
    q.options.forEach((_, oi) => {
        const el = document.getElementById(`opt-${qIndex}-${oi}`);
        if (el) el.classList.toggle('selected', oi === oIndex);
    });

    updateQuizProgress();
}
window.selectAnswer = selectAnswer;

function updateQuizProgress() {
    const fill = document.getElementById('quiz-top-progress-fill');
    if (!fill || !currentQuiz) return;
    const answered = userAnswers.filter(a => a >= 0).length;
    const pct = (answered / currentQuiz.questions.length) * 100;
    fill.style.width = pct + '%';
}

async function submitQuiz() {
    if (!currentQuiz) return;
    const unanswered = userAnswers.filter(a => a < 0).length;
    if (unanswered > 0 && !confirm(`You have ${unanswered} unanswered question(s). Submit now?`)) return;

    try {
        const res = await fetch(`${API}/api/quiz/submit`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                session_id: currentSessionId,
                quiz_attempt_id: currentQuiz.quiz_id,
                answers: userAnswers
            })
        });
        const data = await res.json();

        // Reveal correct/incorrect options
        currentQuiz.questions.forEach((q, qi) => {
            const correctIdx = q.correct_index;
            const userIdx = userAnswers[qi];

            q.options.forEach((_, oi) => {
                const el = document.getElementById(`opt-${qi}-${oi}`);
                if (!el) return;
                el.style.pointerEvents = 'none';
                if (oi === correctIdx) {
                    el.classList.add('correct');
                } else if (oi === userIdx) {
                    el.classList.add('incorrect');
                }
            });

            const expEl = document.getElementById(`explanation-${qi}`);
            if (expEl) expEl.style.display = 'block';
        });

        // Trigger confetti burst (marigold + ice)
        if (window.triggerConfetti) window.triggerConfetti();
        if (window.setBudState) window.setBudState('celebrating');

        // Render Results with count-up score
        const resultsDiv = document.getElementById('quiz-results-container');
        const submitArea = document.getElementById('quiz-submit-area');
        if (submitArea) submitArea.style.display = 'none';

        if (resultsDiv) {
            resultsDiv.style.display = 'block';
            resultsDiv.innerHTML = `
                <div class="glass-card" style="padding:36px;text-align:center;margin-top:24px;">
                    <h3 style="font-family:'Clash Display',sans-serif;font-size:1.8rem;color:var(--heading-color);margin-bottom:18px;">Quiz Completed</h3>
                    <div style="display:flex;justify-content:center;align-items:center;gap:36px;margin-bottom:24px;">
                        <div>
                            <div id="countup-score" style="font-family:'Clash Display',sans-serif;font-size:3.6rem;font-weight:700;color:var(--accent-primary);line-height:1;">0%</div>
                            <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text-secondary);letter-spacing:1px;margin-top:4px;">SCORE</div>
                        </div>
                        <div style="border-left:1px solid var(--border-color);padding-left:36px;">
                            <div style="font-family:'Clash Display',sans-serif;font-size:2.4rem;font-weight:700;color:var(--heading-color);line-height:1;">${data.correct_answers} / ${data.total_questions}</div>
                            <div style="font-family:'JetBrains Mono',monospace;font-size:0.75rem;color:var(--text-secondary);letter-spacing:1px;margin-top:4px;">CORRECT ANSWERS</div>
                        </div>
                    </div>
                    ${data.remediation ? `
                        <div style="text-align:left;padding:18px 24px;border-radius:14px;background:var(--surface-elevated);border:1px solid var(--border-color);margin-top:16px;">
                            <div style="font-family:'Clash Display',sans-serif;font-weight:700;color:var(--accent-primary);margin-bottom:6px;">🎯 Study Prescription</div>
                            <div style="color:var(--text-secondary);font-size:0.92rem;line-height:1.7;">${formatMarkdown(data.remediation)}</div>
                        </div>
                    ` : ''}
                    <div style="margin-top:24px;">
                        <button class="btn-cta-marigold" onclick="generateQuiz()" style="padding:10px 24px;font-size:0.9rem;">Take Another Quiz</button>
                    </div>
                </div>
            `;

            // Count-up animation
            const targetScore = Math.round(data.score_percentage || 0);
            let currentDisplay = 0;
            const countEl = document.getElementById('countup-score');
            const stepTime = 1200 / Math.max(targetScore, 1);
            const counterInterval = setInterval(() => {
                currentDisplay += 1;
                if (countEl) countEl.textContent = `${currentDisplay}%`;
                if (currentDisplay >= targetScore) {
                    clearInterval(counterInterval);
                    if (countEl) countEl.textContent = `${targetScore}%`;
                }
            }, stepTime);

            resultsDiv.scrollIntoView({ behavior: 'smooth' });
        }

        loadAnalytics();
    } catch (e) {
        showToast(`Submission error: ${e.message}`, 'error');
    }
}
window.submitQuiz = submitQuiz;

// ─── Stats: 3 Clean Glass Cards Only ─────────────────────────────────────────
async function loadAnalytics() {
    if (!currentSessionId) return;
    try {
        const res = await fetch(`${API}/api/analytics/${currentSessionId}`);
        const data = await res.json();

        // 1. Accuracy Ring
        if (window.renderAccuracyRing) {
            window.renderAccuracyRing('stats-accuracy-ring', data.overall_accuracy || 0,
                data.total_questions || 0, data.total_correct || 0);
        }

        // 2. Score Trend (Smooth marigold line, no clutter)
        if (window.renderScoreChart && data.score_history) {
            window.renderScoreChart('stats-score-chart', data.score_history);
        }

        // 3. "Focus on these" (Top 3 weak topics)
        renderFocusTopics(data.topic_mastery || {});
    } catch (e) {
        console.error('Failed to load analytics:', e);
    }
}

function renderFocusTopics(topicMastery) {
    const container = document.getElementById('stats-focus-topics');
    if (!container) return;

    const entries = Object.entries(topicMastery).sort((a, b) => a[1] - b[1]); // lowest first

    if (entries.length === 0) {
        container.innerHTML = `
            <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;text-align:center;padding:24px 0;color:var(--text-muted);">
                <div style="font-size:2rem;margin-bottom:10px;">💡</div>
                <div style="font-size:0.9rem;">Take a quiz to unlock your study tips.</div>
            </div>
        `;
        return;
    }

    const weakTopics = entries.slice(0, 3);
    container.innerHTML = `
        <div style="display:flex;flex-direction:column;gap:12px;">
            ${weakTopics.map(([topic, pct], idx) => `
                <div style="padding:14px 18px;border-radius:12px;background:var(--surface-elevated);border:1px solid var(--border-color);display:flex;align-items:center;justify-content:space-between;">
                    <div>
                        <div style="font-family:'JetBrains Mono',monospace;font-size:0.68rem;color:var(--accent-primary);margin-bottom:2px;">PRIORITY ${idx + 1}</div>
                        <div style="font-weight:600;font-size:0.92rem;color:var(--text-primary);">${escapeHtml(topic)}</div>
                    </div>
                    <div style="font-family:'JetBrains Mono',monospace;font-size:0.95rem;color:${pct >= 60 ? 'var(--accent-primary)' : 'var(--error-color)'};font-weight:700;">
                        ${Math.round(pct)}%
                    </div>
                </div>
            `).join('')}
        </div>
    `;
}

// ─── Utility Functions ───────────────────────────────────────────────────────
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function formatMarkdown(text) {
    if (!text) return '';

    // Strip "Source: ..." and unneeded filler lines (C9)
    text = text.replace(/Source:\s*No relevant documents found\.?/gi, '');
    text = text.replace(/^Source:\s*.*$/gim, '');
    text = text.replace(/^\s*[\*\-]\s*$/gm, '');

    // Render KaTeX Math (C9)
    if (window.katex) {
        // Block math: $$ ... $$
        text = text.replace(/\$\$([\s\S]+?)\$\$/g, (match, math) => {
            try {
                return '<div class="katex-display">' + window.katex.renderToString(math.trim(), { displayMode: true, throwOnError: false }) + '</div>';
            } catch (err) {
                return `<div class="katex-display"><code>${escapeHtml(math.trim())}</code></div>`;
            }
        });

        // Inline math: $ ... $
        text = text.replace(/\$([^\$\n]+?)\$/g, (match, math) => {
            try {
                return window.katex.renderToString(math.trim(), { displayMode: false, throwOnError: false });
            } catch (err) {
                return `<code>${escapeHtml(math.trim())}</code>`;
            }
        });
    }

    // Parse Markdown tables into real HTML tables with aubergine headers and ice 12% borders
    text = text.replace(/(?:^|\n)((?:\|[^\n]+\|\r?\n)(?:\|[-: |]+\|\r?\n)(?:\|[^\n]+\|\r?\n?)+)/g, (match, tableBlock) => {
        const rows = tableBlock.trim().split(/\r?\n/).map(r => r.trim()).filter(Boolean);
        if (rows.length < 2) return match;

        const headerCols = rows[0].replace(/^\||\|$/g, '').split('|').map(c => c.trim());
        const dataRows = rows.slice(2);

        let tableHtml = '<div class="table-scroll-container"><table class="markdown-table"><thead><tr>';
        headerCols.forEach(col => {
            tableHtml += `<th>${escapeHtml(col)}</th>`;
        });
        tableHtml += '</tr></thead><tbody>';

        dataRows.forEach(row => {
            const cols = row.replace(/^\||\|$/g, '').split('|').map(c => c.trim());
            tableHtml += '<tr>';
            cols.forEach(col => {
                tableHtml += `<td>${escapeHtml(col)}</td>`;
            });
            tableHtml += '</tr>';
        });

        tableHtml += '</tbody></table></div>';
        return '\n' + tableHtml + '\n';
    });

    let formatted = text
        .replace(/^### (.+)$/gm, '<h3>$1</h3>')
        .replace(/^## (.+)$/gm, '<h2>$1</h2>')
        .replace(/^# (.+)$/gm, '<h1>$1</h1>')
        .replace(/\*\*\*(.+?)\*\*\*/g, '<strong><em>$1</em></strong>')
        .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
        .replace(/\*(.+?)\*/g, '<em>$1</em>')
        .replace(/```(\w*)\n([\s\S]*?)```/g, '<pre><code>$2</code></pre>')
        .replace(/`(.+?)`/g, '<code>$1</code>')
        .replace(/^\- (.+)$/gm, '<li>$1</li>')
        .replace(/^\* (.+)$/gm, '<li>$1</li>')
        .replace(/^\d+\. (.+)$/gm, '<li>$1</li>')
        .replace(/\n\n/g, '</p><p>')
        .replace(/\n/g, '<br>');

    // Strip stray unparsed asterisks
    formatted = formatted.replace(/(^|\s)\*(\s|$)/g, '$1$2').replace(/\s*\*\s*$/g, '');

    return formatted;
}

// ─── Initialization ──────────────────────────────────────────────────────────
document.addEventListener('DOMContentLoaded', () => {
    initTheme();
    initUpload();
    initDragAndDrop();
    initChatSearch();
    loadSessions();
    initSummaryStudio();
    restoreFocusState();

    // Close popovers on click outside
    document.addEventListener('click', (e) => {
        const popover = document.getElementById('focus-popover');
        const pill = document.getElementById('btn-focus-pill');
        if (popover && (popover.classList.contains('is-open') || popover.classList.contains('open'))) {
            if (!popover.contains(e.target) && !pill.contains(e.target)) {
                toggleFocusPopover(false);
            }
        }
    });

    // Render initial welcome on both chat containers immediately so it is never blank
    const chatContainer = document.getElementById('chat-messages-container');
    if (chatContainer && chatContainer.children.length === 0) {
        renderWelcomeMessage(chatContainer, false);
    }
    const askContainer = document.getElementById('ask-messages-container');
    if (askContainer && askContainer.children.length === 0) {
        renderWelcomeMessage(askContainer, true);
    }

    // Listen to Enter key on floating chat input
    const chatInput = document.getElementById('chat-input');
    if (chatInput) {
        chatInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendChat();
            }
        });
    }

    // Listen to Enter key on Ask input
    const askInput = document.getElementById('ask-input');
    if (askInput) {
        askInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                sendAskChat();
            }
        });
    }
});
