// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================
// Dark Mode Helpers
// ============================================
function isDarkMode() {
    return document.documentElement.classList.contains('dark');
}

function getThemeColors() {
    const dark = isDarkMode();
    return {
        textColor: dark ? '#9ca3af' : '#6b7280',
        gridColor: dark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
        backgroundColor: dark ? 'rgba(26, 26, 46, 0.4)' : 'white',
        tooltipBg: dark ? 'rgba(26, 26, 46, 0.95)' : 'rgba(255, 255, 255, 0.95)',
        tooltipText: dark ? '#e5e7eb' : '#1f2937'
    };
}

// Check if user is admin on page load
document.addEventListener('DOMContentLoaded', async function () {
    // Check for Supabase Auth session
    const { data: { session } } = await supabase.auth.getSession();

    let userEmail = sessionStorage.getItem('userEmail');

    // If no session storage but has Supabase Auth session, get email from session
    if (!userEmail && session && session.user) {
        userEmail = session.user.email;
        sessionStorage.setItem('userEmail', userEmail);
    }

    // If no user email at all, redirect to login
    if (!userEmail) {
        window.location.href = 'login.html';
        return;
    }

    // Verify user is admin
    const { data: user, error } = await supabase
        .from('users')
        .select('is_admin')
        .eq('email', userEmail)
        .single();

    if (error || !user || !user.is_admin) {
        // Not admin or error, redirect to dashboard
        console.log('Not an admin user, redirecting...');
        window.location.href = 'dashboard.html';
        return;
    }

    // User is admin, initialize data and polling
    initializePolling();
});

// Compact UI toggle
function setupCompactToggle() {
    const btn = document.getElementById('toggleCompactBtn');
    const grid = document.getElementById('adminGrid');
    const applyCompactUi = (compact) => {
        if (!grid) return;
        const cards = Array.from(document.querySelectorAll('.dash-card'));
        if (compact) {
            grid.classList.remove('gap-6', 'p-6');
            grid.classList.add('gap-3', 'p-4');
            cards.forEach(el => { el.classList.remove('p-6'); el.classList.add('p-4'); });
            if (btn) btn.querySelector('span').textContent = 'Expanded View';
            localStorage.setItem('compactUi', '1');
        } else {
            grid.classList.remove('gap-3', 'p-4');
            grid.classList.add('gap-6', 'p-6');
            cards.forEach(el => { el.classList.remove('p-4'); el.classList.add('p-6'); });
            if (btn) btn.querySelector('span').textContent = 'Compact View';
            localStorage.setItem('compactUi', '');
        }
    };

    const initial = localStorage.getItem('compactUi') === '1';
    applyCompactUi(initial);
    if (btn) {
        btn.addEventListener('click', () => {
            const next = !(localStorage.getItem('compactUi') === '1');
            applyCompactUi(next);
        });
    }
}


// Initialize polling for all data
function initializePolling() {
    // Initial load of all data
    loadUsers();
    loadStats();
    viewOccupancy();
    viewNoiseLevel();
    loadAnnouncements();
    initializeOccupancyChart();
    initStatisticsReport();
    initReportsOverview();
    setupCompactToggle();

    // Initialize Noise Alert controls/UI and first fetches
    initNoiseAlertControls();
    pollNoiseAlerts();
    loadNoiseAlertHistory();

    // Optimized polling intervals - reduced frequency to improve performance
    const POLL_INTERVAL_FAST = 10000; // 10 seconds for critical updates (was 5s)
    const POLL_INTERVAL_MEDIUM = 20000; // 20 seconds for medium priority (was 10s)
    const POLL_INTERVAL_SLOW = 30000; // 30 seconds for low priority (was 30s)
    const ALERT_POLL_INTERVAL = 5000; // 5 seconds for alerts (was 2s)

    // Store interval IDs for cleanup
    let intervals = [];
    let isPolling = false;

    function startPolling() {
        if (isPolling) return;
        isPolling = true;

        // Critical updates (10s)
        intervals.push(setInterval(loadStats, POLL_INTERVAL_FAST));
        intervals.push(setInterval(viewNoiseLevel, POLL_INTERVAL_FAST));
        intervals.push(setInterval(pollNoiseAlerts, ALERT_POLL_INTERVAL));

        // Medium priority updates (20s)
        intervals.push(setInterval(viewOccupancy, POLL_INTERVAL_MEDIUM));
        intervals.push(setInterval(loadAnnouncements, POLL_INTERVAL_MEDIUM));
        intervals.push(setInterval(updateOccupancyChart, POLL_INTERVAL_MEDIUM));
        intervals.push(setInterval(refreshStatisticsReport, POLL_INTERVAL_MEDIUM));

        // Low priority updates (30s+)
        intervals.push(setInterval(loadUsers, POLL_INTERVAL_SLOW));
        intervals.push(setInterval(loadNoiseAlertHistory, POLL_INTERVAL_SLOW));
        intervals.push(setInterval(refreshReportsOverview, POLL_INTERVAL_MEDIUM * 2));

        console.log('Polling started with optimized intervals');
    }

    function stopPolling() {
        if (!isPolling) return;
        isPolling = false;

        intervals.forEach(clearInterval);
        intervals = [];
        console.log('Polling paused');
    }

    // Start initial polling
    startPolling();

    // Use Page Visibility API to pause/resume polling when tab is hidden
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
        } else {
            // Refresh critical data immediately when tab becomes visible
            loadStats();
            viewNoiseLevel();
            pollNoiseAlerts();

            // Restart polling
            startPolling();

            console.log('Tab visible, polling resumed');
        }
    });
}

// ========== NOISE ALERT SYSTEM ==========

const DEFAULT_NOISE_ALERT_THRESHOLD = 70; // dB
const DEFAULT_NOISE_ALERT_HOLD_SECONDS = 5; // seconds of continuous exceedance

let noiseAlertThreshold = parseInt(localStorage.getItem('noiseAlertThreshold') || String(DEFAULT_NOISE_ALERT_THRESHOLD), 10);
if (isNaN(noiseAlertThreshold)) noiseAlertThreshold = DEFAULT_NOISE_ALERT_THRESHOLD;

let noiseAlertHoldSeconds = parseInt(localStorage.getItem('noiseAlertHoldSeconds') || String(DEFAULT_NOISE_ALERT_HOLD_SECONDS), 10);
if (isNaN(noiseAlertHoldSeconds)) noiseAlertHoldSeconds = DEFAULT_NOISE_ALERT_HOLD_SECONDS;

let noiseAlertSoundEnabled = (localStorage.getItem('noiseAlertSoundEnabled') ?? 'true') === 'true';

// Per-table alert tracking state
// alertState[tableId] = { aboveSince: number|null, active: boolean, lastValue: number, lastRaisedAt: number|null }
const alertState = {};

function formatTableName(tableId) {
    if (!tableId) return 'Unknown Table';
    return tableId.replace('table-', 'Table ').replace(/\b\w/g, l => l.toUpperCase());
}

function initNoiseAlertControls() {
    const thresholdInput = document.getElementById('noiseThresholdInput');
    const thresholdValue = document.getElementById('noiseThresholdValue');
    const holdInput = document.getElementById('noiseHoldInput');
    const holdValue = document.getElementById('noiseHoldValue');
    const soundToggle = document.getElementById('noiseSoundToggle');
    const historyBtn = document.getElementById('refreshNoiseHistoryBtn');

    if (thresholdInput && thresholdValue) {
        thresholdInput.value = String(noiseAlertThreshold);
        thresholdValue.textContent = String(noiseAlertThreshold);
        thresholdInput.addEventListener('input', () => {
            thresholdValue.textContent = thresholdInput.value;
        });
        thresholdInput.addEventListener('change', () => {
            noiseAlertThreshold = parseInt(thresholdInput.value, 10);
            if (isNaN(noiseAlertThreshold)) noiseAlertThreshold = DEFAULT_NOISE_ALERT_THRESHOLD;
            localStorage.setItem('noiseAlertThreshold', String(noiseAlertThreshold));
        });
    }

    if (holdInput && holdValue) {
        holdInput.value = String(noiseAlertHoldSeconds);
        holdValue.textContent = String(noiseAlertHoldSeconds);
        holdInput.addEventListener('input', () => {
            holdValue.textContent = holdInput.value;
        });
        holdInput.addEventListener('change', () => {
            noiseAlertHoldSeconds = parseInt(holdInput.value, 10);
            if (isNaN(noiseAlertHoldSeconds)) noiseAlertHoldSeconds = DEFAULT_NOISE_ALERT_HOLD_SECONDS;
            localStorage.setItem('noiseAlertHoldSeconds', String(noiseAlertHoldSeconds));
        });
    }

    if (soundToggle) {
        soundToggle.checked = !!noiseAlertSoundEnabled;
        soundToggle.addEventListener('change', () => {
            noiseAlertSoundEnabled = !!soundToggle.checked;
            localStorage.setItem('noiseAlertSoundEnabled', noiseAlertSoundEnabled ? 'true' : 'false');
        });
    }

    if (historyBtn) {
        historyBtn.addEventListener('click', () => loadNoiseAlertHistory());
    }
}

function playBeep(durationMs = 300, frequency = 880, volume = 0.05) {
    try {
        const AudioContext = window.AudioContext || window.webkitAudioContext;
        const ctx = new AudioContext();
        const o = ctx.createOscillator();
        const g = ctx.createGain();
        o.type = 'sine';
        o.frequency.value = frequency;
        g.gain.value = volume;
        o.connect(g);
        g.connect(ctx.destination);
        o.start(0);
        setTimeout(() => { o.stop(0); ctx.close(); }, durationMs);
    } catch (e) {
        // Ignore sound errors
    }
}

function renderNoiseAlertsUI(rows, activeTablesSet) {
    const list = document.getElementById('noiseAlertsList');
    const empty = document.getElementById('noiseNoAlerts');
    const status = document.getElementById('noiseAlertsStatus');
    if (!list || !empty) return;

    // Build cards for all tables we know about, highlighting active alerts
    const cards = rows.map(row => {
        const tableId = row.table_id;
        const db = Math.round(row.decibel || 0);
        const active = activeTablesSet.has(tableId);
        const color = active ? 'bg-red-50 border-red-200 hover:bg-red-100' : (db >= Math.max(55, noiseAlertThreshold - 15) ? 'bg-yellow-50 border-yellow-200 hover:bg-yellow-100' : 'bg-green-50 border-green-200 hover:bg-green-100');
        const icon = active ? 'alert-triangle' : (db >= Math.max(55, noiseAlertThreshold - 15) ? 'alert-circle' : 'check-circle');
        const iconColor = active ? 'text-red-500' : (db >= Math.max(55, noiseAlertThreshold - 15) ? 'text-yellow-500' : 'text-green-500');
        const pulse = active ? 'animate-pulse' : '';
        const title = formatTableName(tableId);
        const msg = active ? 'Too noisy' : (db >= Math.max(55, noiseAlertThreshold - 15) ? 'Getting loud' : 'Normal');
        return `
            <div class="bg-white dark:bg-gray-800 border rounded-lg p-4 transition-all duration-200 hover:shadow-md ${color} ${pulse}">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-3">
                        <i data-lucide="${icon}" class="w-5 h-5 ${iconColor}"></i>
                        <div>
                            <div class="font-semibold text-gray-900 dark:text-white">${title}</div>
                            <div class="text-sm text-gray-600 dark:text-gray-400">${msg} • Threshold ${noiseAlertThreshold} dB</div>
                        </div>
                    </div>
                    <div class="text-right">
                        <div class="text-2xl font-bold text-gray-900 dark:text-white">${db}</div>
                        <div class="text-xs text-gray-500 dark:text-gray-400">dB</div>
                    </div>
                </div>
            </div>
        `;
    });

    // If there are tables with no noise_log rows yet, show a helpful message
    list.innerHTML = cards.join('');
    const anyActive = activeTablesSet.size > 0;
    empty.classList.toggle('hidden', anyActive || rows.length > 0);
    if (status) status.textContent = 'Updated ' + new Date().toLocaleTimeString();
    if (window.lucide) lucide.createIcons();
}

async function pollNoiseAlerts() {
    try {
        const { data: rows, error } = await supabase
            .from('noise_log')
            .select('*')
            .order('table_id', { ascending: true });
        if (error) throw error;

        const now = Date.now();
        const activeTables = new Set();

        if (rows && rows.length) {
            for (const r of rows) {
                const tableId = r.table_id;
                const db = Math.round(r.decibel || 0);
                if (!alertState[tableId]) alertState[tableId] = { aboveSince: null, active: false, lastValue: db, lastRaisedAt: null };
                const st = alertState[tableId];
                st.lastValue = db;

                if (db >= noiseAlertThreshold) {
                    if (!st.aboveSince) st.aboveSince = now;
                    const heldForMs = now - st.aboveSince;
                    if (!st.active && heldForMs >= noiseAlertHoldSeconds * 1000) {
                        // Transition: raise alert
                        st.active = true;
                        st.lastRaisedAt = now;
                        activeTables.add(tableId);

                        // Visual toast
                        const msg = `⚠️ ${formatTableName(tableId)} is too noisy (${db} dB).`;
                        showNotification(msg, 'warning');
                        // Sound (optional)
                        if (noiseAlertSoundEnabled && !document.hidden) playBeep();
                        // Log to actlog_iot
                        try {
                            await supabase.from('actlog_iot').insert({
                                event: 'noise_alert',
                                table_name: tableId,
                                decibel: db
                            });
                        } catch (e) { /* ignore logging errors */ }
                    } else if (st.active) {
                        activeTables.add(tableId);
                    }
                } else {
                    // Below threshold: clear timer and active state
                    st.aboveSince = null;
                    st.active = false;
                }
            }
        }

        renderNoiseAlertsUI(rows || [], activeTables);
    } catch (err) {
        // Fail silently to avoid UI spam
        console.error('Noise alert poll error:', err);
    }
}

async function loadNoiseAlertHistory() {
    const container = document.getElementById('noiseAlertHistory');
    if (!container) return;
    try {
        const { data, error } = await supabase
            .from('actlog_iot')
            .select('event, table_name, decibel, created_at')
            .eq('event', 'noise_alert')
            .order('created_at', { ascending: false })
            .limit(20);
        if (error) throw error;

        if (!data || data.length === 0) {
            container.innerHTML = '<div class="text-sm text-gray-500">No alerts yet.</div>';
            return;
        }

        container.innerHTML = data.map(row => {
            const when = new Date(row.created_at).toLocaleString();
            const title = formatTableName(row.table_name || '');
            const db = row.decibel != null ? Math.round(row.decibel) : '—';
            return `
                <div class="flex gap-4 p-4 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:shadow-md transition-shadow">
                    <div class="flex-shrink-0">
                        <div class="w-10 h-10 bg-red-100 dark:bg-red-900/30 rounded-full flex items-center justify-center">
                            <i data-lucide="alert-triangle" class="w-5 h-5 text-red-600 dark:text-red-400"></i>
                        </div>
                    </div>
                    <div class="flex-1 min-w-0">
                        <div class="flex items-center justify-between">
                            <h4 class="text-sm font-semibold text-gray-900 dark:text-white">${title} exceeded threshold</h4>
                            <span class="text-sm font-bold text-red-600 dark:text-red-400">${db} dB</span>
                        </div>
                        <p class="text-xs text-gray-500 dark:text-gray-400 mt-1">${when}</p>
                    </div>
                </div>
            `;
        }).join('');
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        container.innerHTML = `<div class="text-sm text-red-600">Error loading alert history: ${escapeHtml(err.message)}</div>`;
    }
}
// ========== END NOISE ALERT SYSTEM ==========

// ========== STATISTICS REPORT ==========

let topTablesChart = null;
let peakHoursChart = null;
let problemsChart = null;

function getDefaultDateRange() {
    const end = new Date();
    const start = new Date();
    start.setDate(end.getDate() - 6); // last 7 days inclusive
    const toISODate = d => d.toISOString().slice(0, 10);
    return { startDateStr: toISODate(start), endDateStr: toISODate(end) };
}

function parseDateInputs() {
    const startEl = document.getElementById('statsStartDate');
    const endEl = document.getElementById('statsEndDate');
    const tableEl = document.getElementById('statsTableFilter');
    const table = tableEl ? tableEl.value : 'all';

    let startStr = startEl && startEl.value ? startEl.value : null;
    let endStr = endEl && endEl.value ? endEl.value : null;
    if (!startStr || !endStr) {
        const def = getDefaultDateRange();
        startStr = startStr || def.startDateStr;
        endStr = endStr || def.endDateStr;
        if (startEl && !startEl.value) startEl.value = def.startDateStr;
        if (endEl && !endEl.value) endEl.value = def.endDateStr;
    }
    // Build ISO boundaries
    const startISO = new Date(startStr + 'T00:00:00').toISOString();
    const endISO = new Date(endStr + 'T23:59:59.999').toISOString();
    return { startISO, endISO, table };
}

function initStatisticsReport() {
    // Set defaults
    const { startDateStr, endDateStr } = getDefaultDateRange();
    const startEl = document.getElementById('statsStartDate');
    const endEl = document.getElementById('statsEndDate');
    if (startEl && !startEl.value) startEl.value = startDateStr;
    if (endEl && !endEl.value) endEl.value = endDateStr;

    // Event handlers
    const refreshBtn = document.getElementById('statsRefreshBtn');
    const exportBtn = document.getElementById('statsExportCsvBtn');
    const printBtn = document.getElementById('statsPrintBtn');
    const tableEl = document.getElementById('statsTableFilter');
    if (refreshBtn) refreshBtn.addEventListener('click', () => refreshStatisticsReport());
    if (exportBtn) exportBtn.addEventListener('click', () => exportStatisticsCsv());
    if (printBtn) printBtn.addEventListener('click', () => printStatisticsReport());
    if (startEl) startEl.addEventListener('change', () => refreshStatisticsReport());
    if (endEl) endEl.addEventListener('change', () => refreshStatisticsReport());
    if (tableEl) tableEl.addEventListener('change', () => refreshStatisticsReport());

    // Init charts
    const topTablesCtx = document.getElementById('topTablesChart');
    if (topTablesCtx) {
        const colors = getThemeColors();
        topTablesChart = new Chart(topTablesCtx, {
            type: 'bar',
            data: { labels: [], datasets: [{ label: 'Logins', data: [], backgroundColor: '#3b82f6' }] },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: colors.tooltipBg,
                        titleColor: colors.tooltipText,
                        bodyColor: colors.tooltipText,
                        borderColor: colors.gridColor,
                        borderWidth: 1
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: colors.textColor },
                        grid: { color: colors.gridColor }
                    },
                    x: {
                        ticks: { color: colors.textColor },
                        grid: { color: colors.gridColor }
                    }
                }
            }
        });
    }
    const peakHoursCtx = document.getElementById('peakHoursChart');
    if (peakHoursCtx) {
        const colors = getThemeColors();
        peakHoursChart = new Chart(peakHoursCtx, {
            type: 'bar',
            data: { labels: Array.from({ length: 24 }, (_, i) => String(i).padStart(2, '0') + ':00'), datasets: [{ label: 'Logins/hour', data: new Array(24).fill(0), backgroundColor: '#10b981' }] },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        display: false
                    },
                    tooltip: {
                        backgroundColor: colors.tooltipBg,
                        titleColor: colors.tooltipText,
                        bodyColor: colors.tooltipText,
                        borderColor: colors.gridColor,
                        borderWidth: 1
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: { color: colors.textColor },
                        grid: { color: colors.gridColor }
                    },
                    x: {
                        ticks: { color: colors.textColor },
                        grid: { color: colors.gridColor }
                    }
                }
            }
        });
    }
    const problemsCtx = document.getElementById('problemsChart');
    if (problemsCtx) {
        const colors = getThemeColors();
        problemsChart = new Chart(problemsCtx, {
            type: 'doughnut',
            data: { labels: [], datasets: [{ data: [], backgroundColor: ['#0e163e', '#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'] }] },
            options: {
                responsive: true,
                plugins: {
                    legend: {
                        position: 'bottom',
                        labels: { color: colors.textColor }
                    },
                    tooltip: {
                        backgroundColor: colors.tooltipBg,
                        titleColor: colors.tooltipText,
                        bodyColor: colors.tooltipText,
                        borderColor: colors.gridColor,
                        borderWidth: 1
                    }
                },
                cutout: '60%'
            }
        });
    }

    refreshStatisticsReport();
}

async function fetchActivityData(startISO, endISO, table) {
    let q = supabase.from('actlog_iot').select('event, table_name, created_at').gte('created_at', startISO).lte('created_at', endISO);
    if (table && table !== 'all') q = q.eq('table_name', table);
    const { data, error } = await q;
    if (error) throw error;
    return data || [];
}

async function fetchReportsData(startISO, endISO) {
    const { data, error } = await supabase
        .from('student_reports')
        .select('report_type, created_at')
        .gte('created_at', startISO)
        .lte('created_at', endISO);
    if (error) throw error;
    return data || [];
}

function formatTablePretty(id) {
    if (!id) return 'Unknown';
    return id.replace('table-', 'Table ');
}

async function refreshStatisticsReport() {
    try {
        const { startISO, endISO, table } = parseDateInputs();
        const [activity, reports] = await Promise.all([
            fetchActivityData(startISO, endISO, table),
            fetchReportsData(startISO, endISO)
        ]);

        // Top tables: count of login events per table
        const tableCounts = {};
        for (const row of activity) {
            if (row.event === 'login' || row.event === 'transfer') {
                const t = row.table_name || 'unknown';
                tableCounts[t] = (tableCounts[t] || 0) + 1;
            }
        }
        const topEntries = Object.entries(tableCounts).sort((a, b) => b[1] - a[1]).slice(0, 5);
        if (topTablesChart) {
            topTablesChart.data.labels = topEntries.map(([t]) => formatTablePretty(t));
            topTablesChart.data.datasets[0].data = topEntries.map(([, c]) => c);
            topTablesChart.update('none');
        }

        // Peak hours: count of logins per hour (00..23)
        const hours = new Array(24).fill(0);
        for (const row of activity) {
            if (row.event === 'login' || row.event === 'transfer') {
                const d = new Date(row.created_at);
                const h = d.getHours();
                hours[h]++;
            }
        }
        if (peakHoursChart) {
            peakHoursChart.data.datasets[0].data = hours;
            peakHoursChart.update('none');
        }

        // Problems chart: count by report_type
        const problemCounts = {};
        for (const r of reports) {
            const t = r.report_type || 'other';
            problemCounts[t] = (problemCounts[t] || 0) + 1;
        }
        const problemLabels = Object.keys(problemCounts);
        const problemData = problemLabels.map(l => problemCounts[l]);
        if (problemsChart) {
            problemsChart.data.labels = problemLabels.map(l => l[0].toUpperCase() + l.slice(1));
            problemsChart.data.datasets[0].data = problemData;
            problemsChart.update('none');
        }

        // Generate insights in new card format
        const insightsEl = document.getElementById('statsInsights');

        // Calculate peak hour (moved outside for scope)
        const peakHour = hours.reduce((best, v, i) => v > best.v ? { i, v } : best, { i: 0, v: 0 });

        // Calculate average session time (moved outside for scope)
        let totalSessionTime = 0;
        let sessionCount = 0;
        const userSessions = {};

        for (const row of activity) {
            if (!userSessions[row.user_email]) {
                userSessions[row.user_email] = [];
            }
            userSessions[row.user_email].push(row);
        }

        for (const userEvents of Object.values(userSessions)) {
            const sortedEvents = userEvents.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
            let loginTime = null;

            for (const event of sortedEvents) {
                if ((event.event === 'login' || event.event === 'transfer') && !loginTime) {
                    loginTime = new Date(event.created_at);
                } else if (event.event === 'logout' && loginTime) {
                    const logoutTime = new Date(event.created_at);
                    const sessionDuration = (logoutTime - loginTime) / (1000 * 60); // minutes
                    if (sessionDuration > 0 && sessionDuration < 480) { // reasonable session (under 8 hours)
                        totalSessionTime += sessionDuration;
                        sessionCount++;
                    }
                    loginTime = null;
                }
            }
        }

        const avgSessionMinutes = sessionCount > 0 ? Math.round(totalSessionTime / sessionCount) : 0;

        if (insightsEl) {
            const insights = [];

            // Calculate peak hour first (now using the outer one)
            // const peakHour = hours.reduce((best, v, i) => v > best.v ? { i, v } : best, { i: 0, v: 0 });

            // Calculate average session time (moved up)
            let totalSessionTime = 0;
            let sessionCount = 0;
            const userSessions = {};

            for (const row of activity) {
                if (!userSessions[row.user_email]) {
                    userSessions[row.user_email] = [];
                }
                userSessions[row.user_email].push(row);
            }

            for (const userEvents of Object.values(userSessions)) {
                const sortedEvents = userEvents.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
                let loginTime = null;

                for (const event of sortedEvents) {
                    if ((event.event === 'login' || event.event === 'transfer') && !loginTime) {
                        loginTime = new Date(event.created_at);
                    } else if (event.event === 'logout' && loginTime) {
                        const logoutTime = new Date(event.created_at);
                        const sessionDuration = (logoutTime - loginTime) / (1000 * 60); // minutes
                        if (sessionDuration > 0 && sessionDuration < 480) { // reasonable session (under 8 hours)
                            totalSessionTime += sessionDuration;
                            sessionCount++;
                        }
                        loginTime = null;
                    }
                }
            }

            const avgSessionMinutes = sessionCount > 0 ? Math.round(totalSessionTime / sessionCount) : 0;

            // Primary insights
            if (topEntries.length > 0) {
                const [t, c] = topEntries[0];
                insights.push({
                    type: 'success',
                    title: 'Most Popular Table',
                    description: `${formatTablePretty(t)} leads with ${c} login${c !== 1 ? 's' : ''}`
                });
            } else {
                insights.push({
                    type: 'warning',
                    title: 'No Activity Detected',
                    description: 'Check date filters or system connectivity'
                });
            }

            if (peakHour.v > 0) {
                insights.push({
                    type: 'info',
                    title: 'Peak Usage Time',
                    description: `${String(peakHour.i).padStart(2, '0')}:00 with ${peakHour.v} login${peakHour.v !== 1 ? 's' : ''}`
                });
            }

            if (problemLabels.length > 0) {
                const sortedP = [...problemLabels].sort((a, b) => (problemCounts[b] || 0) - (problemCounts[a] || 0));
                const topIssue = sortedP[0];
                const topCount = problemCounts[topIssue];
                insights.push({
                    type: 'alert',
                    title: 'Top Issue Type',
                    description: `${topIssue.charAt(0).toUpperCase() + topIssue.slice(1)} (${topCount} report${topCount !== 1 ? 's' : ''})`
                });
            } else {
                insights.push({
                    type: 'success',
                    title: 'No Issues Reported',
                    description: 'Great! No student problems in this period'
                });
            }

            // Add session insights if available
            if (sessionCount > 0) {
                insights.push({
                    type: 'info',
                    title: 'Average Session',
                    description: `${avgSessionMinutes} minutes per user session`
                });
            }

            // Generate HTML for insights cards
            const insightsHtml = insights.map(insight => {
                const iconColors = {
                    success: 'text-green-500',
                    warning: 'text-yellow-500',
                    info: 'text-blue-500',
                    alert: 'text-red-500'
                };

                const bgColors = {
                    success: 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800',
                    warning: 'bg-yellow-50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-800',
                    info: 'bg-blue-50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-800',
                    alert: 'bg-red-50 dark:bg-red-900/20 border-red-200 dark:border-red-800'
                };

                return `
                    <div class="flex items-start gap-3 p-3 bg-white dark:bg-slate-800 rounded-lg border border-gray-200 dark:border-gray-700 ${bgColors[insight.type] || bgColors.info}">
                        <div class="w-2 h-2 ${iconColors[insight.type] || 'text-blue-500'} rounded-full mt-2 flex-shrink-0"></div>
                        <div>
                            <div class="text-sm font-medium text-gray-900 dark:text-white">${escapeHtml(insight.title)}</div>
                            <div class="text-xs text-gray-600 dark:text-gray-400">${escapeHtml(insight.description)}</div>
                        </div>
                    </div>
                `;
            }).join('');

            insightsEl.innerHTML = insightsHtml;
        }

        // Update metric cards
        const totalLogins = activity.filter(row => row.event === 'login' || row.event === 'transfer').length;
        const totalReportsCount = reports.length;

        // Calculate peak hour (moved up)
        // const peakHour = hours.reduce((best, v, i) => v > best.v ? { i, v } : best, { i: 0, v: 0 });
        const peakHourStr = peakHour.v > 0 ? `${String(peakHour.i).padStart(2, '0')}:00` : '--:--';

        // Calculate average session time (moved up)
        // let totalSessionTime = 0;
        // let sessionCount = 0;
        // const userSessions = {};
        // ... (session calculation code moved up)
        // const avgSessionMinutes = sessionCount > 0 ? Math.round(totalSessionTime / sessionCount) : 0;
        const avgSessionStr = avgSessionMinutes > 0 ? `${avgSessionMinutes}m` : '--m';

        // Update metric elements
        const totalLoginsEl = document.getElementById('totalLoginsMetric');
        const peakHourEl = document.getElementById('peakHourMetric');
        const totalReportsEl = document.getElementById('totalReportsMetric');
        const avgSessionEl = document.getElementById('avgSessionMetric');

        if (totalLoginsEl) totalLoginsEl.textContent = totalLogins.toLocaleString();
        if (peakHourEl) peakHourEl.textContent = peakHourStr;
        if (totalReportsEl) totalReportsEl.textContent = totalReportsCount.toLocaleString();
        if (avgSessionEl) avgSessionEl.textContent = avgSessionStr;

        const lastEl = document.getElementById('statsLastUpdated');
        if (lastEl) lastEl.textContent = 'Updated ' + new Date().toLocaleTimeString();

        // Update icons in case buttons were newly added
        if (window.lucide) setTimeout(() => lucide.createIcons(), 0);
    } catch (err) {
        console.error('Statistics report error:', err);
    }
}

function exportStatisticsCsv() {
    try {
        const { startISO, endISO, table } = parseDateInputs();
        const lastUpdated = new Date().toISOString();
        // Extract data from current charts
        const lines = [];
        lines.push(['Statistics Report', lastUpdated]);
        lines.push(['Date Range', startISO, endISO]);
        lines.push(['Table Filter', table]);
        lines.push([]);

        if (topTablesChart) {
            lines.push(['Most Active Tables']);
            lines.push(['Table', 'Logins']);
            topTablesChart.data.labels.forEach((label, idx) => {
                lines.push([label, topTablesChart.data.datasets[0].data[idx]]);
            });
            lines.push([]);
        }
        if (peakHoursChart) {
            lines.push(['Peak Hours']);
            lines.push(['Hour', 'Logins']);
            peakHoursChart.data.labels.forEach((label, idx) => {
                lines.push([label, peakHoursChart.data.datasets[0].data[idx]]);
            });
            lines.push([]);
        }
        if (problemsChart) {
            lines.push(['Common Reported Problems']);
            lines.push(['Type', 'Count']);
            problemsChart.data.labels.forEach((label, idx) => {
                lines.push([label, problemsChart.data.datasets[0].data[idx]]);
            });
            lines.push([]);
        }

        const csv = lines.map(r => r.map(v => '"' + String(v).replace(/"/g, '""') + '"').join(',')).join('\r\n');
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'statistics-report.csv';
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
        showNotification('CSV exported', 'success');
    } catch (e) {
        showNotification('Failed to export CSV', 'error');
    }
}

function printStatisticsReport() {
    const section = document.getElementById('statisticsReport');
    if (!section) return;
    const w = window.open('', '_blank');
    const styles = Array.from(document.querySelectorAll('link[rel="stylesheet"], style'))
        .map(n => n.outerHTML).join('\n');
    w.document.write(`<!DOCTYPE html><html><head><title>Statistics Report</title>${styles}</head><body>`);
    w.document.write('<h2 style="font-family: ui-sans-serif, system-ui;">Statistics Report</h2>');
    w.document.write(section.outerHTML);
    w.document.write('</body></html>');
    w.document.close();
    w.focus();
    // Give charts a moment to render as images, then print
    setTimeout(() => { w.print(); w.close(); }, 300);
}
// ========== END STATISTICS REPORT ==========

// Load statistics
async function loadStats() {
    try {
        // Total users
        const { count: userCount } = await supabase
            .from('users')
            .select('*', { count: 'exact', head: true });

        // Total access devices
        const { count: rfidCount } = await supabase
            .from('rfid_cards')
            .select('*', { count: 'exact', head: true });

        // Occupied seats
        const { count: occupiedCount } = await supabase
            .from('occupancy')
            .select('*', { count: 'exact', head: true })
            .eq('table_id', 'table-1')
            .eq('is_occupied', true);

        // Pending reports
        const { count: pendingCount } = await supabase
            .from('student_reports')
            .select('*', { count: 'exact', head: true })
            .eq('status', 'pending');

        document.getElementById('totalUsers').textContent = userCount || 0;
        document.getElementById('totalRfid').textContent = rfidCount || 0;
        document.getElementById('occupiedSeats').textContent = occupiedCount || 0;
        document.getElementById('pendingReports').textContent = pendingCount || 0;

    } catch (err) {
        console.error('Error loading stats:', err);
    }
}

async function addUser() {
    const email = document.getElementById('userEmail').value.trim();
    const firstName = document.getElementById('userFirstName').value.trim();
    const lastName = document.getElementById('userLastName').value.trim();
    const password = document.getElementById('userPassword').value;
    const makeAdmin = document.getElementById('makeAdmin').checked;

    if (!email) {
        document.getElementById('userResult').textContent = '❌ Please enter email';
        return;
    }

    if (!password || password.length < 6) {
        document.getElementById('userResult').textContent = '❌ Password must be at least 6 characters';
        return;
    }

    const resultDiv = document.getElementById('userResult');
    resultDiv.textContent = 'Creating user and sending confirmation email...';

    try {
        // Step 1: Create user in Supabase Auth (this sends confirmation email)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName
                },
                emailRedirectTo: window.location.origin + '/login.html'
            }
        });

        if (authError) {
            if (authError.message.includes('already registered') || authError.message.includes('already exists')) {
                resultDiv.textContent = '❌ User with this email already exists in the system!';
            } else {
                resultDiv.textContent = '❌ Error creating user: ' + authError.message;
            }
            console.error('Auth error:', authError);
            return;
        }

        if (!authData.user) {
            resultDiv.textContent = '❌ Failed to create user. Please try again.';
            return;
        }

        // Step 2: Insert/Update user in public.users table with admin status
        const { data: userData, error: userError } = await supabase
            .from('users')
            .upsert({
                email: email,
                first_name: firstName,
                last_name: lastName,
                is_admin: makeAdmin || false,
                password: password  // Store password for legacy compatibility
            }, {
                onConflict: 'email'
            })
            .select();

        // Even if there's an error in public.users, the auth user was created and email was sent
        if (userError) {
            console.warn('Warning: User created in Auth but error in public.users table:', userError);
            // Still show success since email was sent
            resultDiv.innerHTML = '✅ User created and confirmation email sent!<br>' +
                '⚠️ Note: There was an issue updating the user profile. You may need to update manually.';
        } else {
            // Update admin status if needed
            if (makeAdmin && userData && userData.length > 0) {
                await supabase
                    .from('users')
                    .update({ is_admin: true })
                    .eq('email', email);
            }

            resultDiv.textContent = '✅ User created successfully! Confirmation email sent to ' + email +
                (makeAdmin ? ' (as Admin)' : '');
        }

        // Clear form
        document.getElementById('userEmail').value = '';
        document.getElementById('userFirstName').value = '';
        document.getElementById('userLastName').value = '';
        document.getElementById('userPassword').value = '';
        document.getElementById('makeAdmin').checked = false;

        // Refresh lists
        loadUsers();
        loadStats();

    } catch (err) {
        console.error('Error creating user:', err);
        resultDiv.textContent = '❌ Error: ' + err.message;
    }
}

async function loadUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Only populate userSelect if it exists (it might not be on all pages)
        const select = document.getElementById('userSelect');
        if (!select) {
            // Silently return - userSelect is optional (not present in setup.html)
            return;
        }
        select.innerHTML = '<option value="">Select User...</option>';

        data.forEach(user => {
            const option = document.createElement('option');
            option.value = user.id;
            const name = (user.first_name || '') + ' ' + (user.last_name || '');
            option.textContent = user.email + (name.trim() ? ' (' + name.trim() + ')' : '') + (user.is_admin ? ' [ADMIN]' : '');
            select.appendChild(option);
        });
    } catch (err) {
        console.error('Error loading users:', err);
    }
}

async function viewAllUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        let html = '<table border="1" style="width:100%;border-collapse:collapse;"><thead><tr><th>Email</th><th>Name</th><th>Admin</th><th>Actions</th></tr></thead><tbody>';

        users.forEach(user => {
            html += '<tr>';
            html += '<td>' + user.email + '</td>';
            html += '<td>' + (user.first_name || '') + ' ' + (user.last_name || '') + '</td>';
            html += '<td>' + (user.is_admin ? '✅ Yes' : '❌ No') + '</td>';
            html += '<td>';
            html += '<button onclick="toggleAdmin(\'' + user.id + '\', \'' + user.email + '\', ' + !user.is_admin + ')">';
            html += user.is_admin ? 'Remove Admin' : 'Make Admin';
            html += '</button> ';
            html += '<button class="danger" onclick="deleteUser(\'' + user.id + '\', \'' + user.email + '\')">Delete</button>';
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        document.getElementById('allUsersData').innerHTML = html;
    } catch (err) {
        document.getElementById('allUsersData').innerHTML = 'Error: ' + err.message;
    }
}

async function toggleAdmin(userId, userEmail, makeAdmin) {
    if (!confirm('Are you sure you want to ' + (makeAdmin ? 'make' : 'remove') + ' ' + userEmail + ' ' + (makeAdmin ? 'an admin' : 'from admin') + '?')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('users')
            .update({ is_admin: makeAdmin })
            .eq('id', userId);

        if (error) throw error;

        alert('Admin status updated! ✅');
        viewAllUsers();
        loadUsers();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function deleteUser(userId, userEmail) {
    if (!confirm('Are you sure you want to delete user: ' + userEmail + '?\n\nThis will also delete their access devices and related data!')) {
        return;
    }

    try {
        // Delete access devices first (foreign key constraint)
        await supabase
            .from('rfid_cards')
            .delete()
            .eq('user_id', userId);

        // Delete user
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        alert('User deleted! ✅');
        viewAllUsers();
        loadUsers();
        loadStats();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function assignRfid() {
    const rfidUid = document.getElementById('rfidUid').value.trim().toUpperCase();
    const userId = document.getElementById('userSelect').value;

    if (!rfidUid || !userId) {
        alert('Please enter RFID UID and select a user');
        return;
    }

    try {
        // Check if RFID already exists
        const { data: existing } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('rfid_uid', rfidUid)
            .eq('is_active', true)
            .single();

        if (existing) {
            document.getElementById('rfidResult').textContent = '❌ This device is already registered to another user!';
            return;
        }

        // Deactivate any existing RFID for this user
        await supabase
            .from('rfid_cards')
            .update({ is_active: false })
            .eq('user_id', userId);

        // Assign new RFID
        const { data, error } = await supabase
            .from('rfid_cards')
            .insert({ rfid_uid: rfidUid, user_id: userId, is_active: true });

        if (error) throw error;

        document.getElementById('rfidResult').textContent = 'Device registered! ✅';
        document.getElementById('rfidUid').value = '';
        loadUsers();
        loadStats();
    } catch (err) {
        document.getElementById('rfidResult').textContent = 'Error: ' + err.message;
    }
}

async function viewAllRfid() {
    try {
        const { data: rfidCards, error } = await supabase
            .from('rfid_cards')
            .select('*, users(email, first_name, last_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        let html = '<table border="1" style="width:100%;border-collapse:collapse;"><thead><tr><th>RFID UID</th><th>User</th><th>Status</th><th>Actions</th></tr></thead><tbody>';

        rfidCards.forEach(card => {
            const user = card.users;
            html += '<tr>';
            html += '<td>' + card.rfid_uid + '</td>';
            html += '<td>' + (user ? user.email : 'N/A') + '</td>';
            html += '<td>' + (card.is_active ? '🟢 Active' : '🔴 Inactive') + '</td>';
            html += '<td>';
            html += '<button onclick="toggleRfidStatus(\'' + card.id + '\', ' + !card.is_active + ')">';
            html += card.is_active ? 'Deactivate' : 'Activate';
            html += '</button>';
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        document.getElementById('allRfidData').innerHTML = html;
    } catch (err) {
        document.getElementById('allRfidData').innerHTML = 'Error: ' + err.message;
    }
}

async function toggleRfidStatus(rfidId, activate) {
    try {
        const { error } = await supabase
            .from('rfid_cards')
            .update({ is_active: activate })
            .eq('id', rfidId);

        if (error) throw error;

        alert('Device status updated! ✅');
        viewAllRfid();
    } catch (err) {
        alert('Error: ' + err.message);
    }
}

async function viewAllReports() {
    try {
        const { data: reports, error } = await supabase
            .from('student_reports')
            .select('*, user:users!user_id(email), replied_by_user:users!replied_by(email)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!reports || reports.length === 0) {
            document.getElementById('reportsData').innerHTML = '<p>No reports submitted yet.</p>';
            return;
        }

        let html = '<table border="1" style="width:100%;border-collapse:collapse;margin-top:10px;"><thead><tr style="background:#333;color:white;"><th style="padding:10px;">Date</th><th style="padding:10px;">User</th><th style="padding:10px;">Type</th><th style="padding:10px;">Title</th><th style="padding:10px;">Status</th><th style="padding:10px;">Actions</th></tr></thead><tbody>';

        reports.forEach(report => {
            const date = new Date(report.created_at).toLocaleString();
            const reportId = String(report.id); // Ensure it's a string

            html += '<tr style="border-bottom:1px solid #ddd;">';
            html += '<td style="padding:10px;">' + date + '</td>';
            html += '<td style="padding:10px;">' + (report.user ? escapeHtml(report.user.email) : 'N/A') + '</td>';
            html += '<td style="padding:10px;">' + escapeHtml(report.report_type) + '</td>';
            html += '<td style="padding:10px;max-width:200px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;" title="' + escapeHtml(report.title) + '">' + escapeHtml(report.title) + '</td>';
            html += '<td style="padding:10px;"><span class="report-status ' + report.status + '">' + escapeHtml(report.status) + '</span></td>';
            html += '<td style="padding:10px;">';
            html += '<select onchange="updateReportStatus(\'' + reportId.replace(/'/g, "\\'") + '\', this.value)" style="padding:5px;margin-right:5px;border:1px solid #ddd;border-radius:3px;">';
            html += '<option value="pending" ' + (report.status === 'pending' ? 'selected' : '') + '>Pending</option>';
            html += '<option value="reviewing" ' + (report.status === 'reviewing' ? 'selected' : '') + '>Reviewing</option>';
            html += '<option value="resolved" ' + (report.status === 'resolved' ? 'selected' : '') + '>Resolved</option>';
            html += '<option value="dismissed" ' + (report.status === 'dismissed' ? 'selected' : '') + '>Dismissed</option>';
            html += '</select>';
            html += '<button onclick="viewReportDetails(\'' + reportId.replace(/'/g, "\\'") + '\')" style="background:#007bff;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;margin-right:5px;">View Details</button>';
            html += '<button onclick="replyToReport(\'' + reportId.replace(/'/g, "\\'") + '\')" style="background:#17a2b8;color:white;border:none;padding:5px 10px;border-radius:3px;cursor:pointer;">' + (report.admin_reply ? 'Edit Reply' : 'Reply') + '</button>';
            html += '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        document.getElementById('reportsData').innerHTML = html;
    } catch (err) {
        document.getElementById('reportsData').innerHTML = 'Error: ' + err.message;
    }
}

async function updateReportStatus(reportId, newStatus) {
    if (!reportId || !newStatus) {
        console.error('Missing reportId or newStatus', { reportId, newStatus });
        alert('Error: Missing report ID or status');
        return;
    }

    console.log('Updating report status:', { reportId, newStatus });

    try {
        // First verify the report exists
        const { data: existingReport, error: fetchError } = await supabase
            .from('student_reports')
            .select('id, status')
            .eq('id', reportId)
            .single();

        if (fetchError) {
            console.error('Error fetching report:', fetchError);
            throw new Error('Report not found: ' + fetchError.message);
        }

        if (!existingReport) {
            throw new Error('Report not found');
        }

        console.log('Current report status:', existingReport.status);
        console.log('Updating to:', newStatus);

        // Update the status
        const { data, error } = await supabase
            .from('student_reports')
            .update({ status: newStatus })
            .eq('id', reportId)
            .select();

        if (error) {
            console.error('Supabase update error:', error);
            console.error('Error code:', error.code);
            console.error('Error message:', error.message);
            console.error('Error details:', error.details);
            throw error;
        }

        if (!data || data.length === 0) {
            console.error('Update returned no data');
            throw new Error('Update failed: No data returned. Check RLS policies.');
        }

        console.log('Update successful:', data[0]);

        // Show success message
        const statusMessages = {
            'pending': 'marked as Pending',
            'reviewing': 'marked as Reviewing',
            'resolved': 'marked as Resolved',
            'dismissed': 'dismissed'
        };

        const message = statusMessages[newStatus] || 'updated';

        // Refresh the reports list
        await viewAllReports();
        await loadStats();

        // Show a subtle notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ Report ' + message + '!';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);

    } catch (err) {
        console.error('Error updating report status:', err);

        // Show error notification
        const errorNotification = document.createElement('div');
        errorNotification.style.cssText = 'position:fixed;top:20px;right:20px;background:#dc3545;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);max-width:400px;';
        errorNotification.innerHTML = '❌ Error: ' + err.message + '<br><small>Check console for details</small>';
        document.body.appendChild(errorNotification);

        setTimeout(() => {
            errorNotification.style.opacity = '0';
            errorNotification.style.transition = 'opacity 0.3s';
            setTimeout(() => errorNotification.remove(), 300);
        }, 5000);

        // Also show alert for critical errors
        if (err.message && err.message.includes('RLS') || err.message.includes('policy')) {
            alert('Permission Error:\n\n' + err.message + '\n\nYou may need to update RLS policies in Supabase to allow admins to update reports.');
        }
    }
}

async function viewReportDetails(reportId) {
    if (!reportId) {
        console.error('Missing reportId');
        return;
    }

    try {
        const { data: report, error } = await supabase
            .from('student_reports')
            .select('*, user:users!user_id(email, first_name, last_name), replied_by_user:users!replied_by(email, first_name, last_name)')
            .eq('id', reportId)
            .single();

        if (error) throw error;

        if (!report) {
            alert('Report not found');
            return;
        }

        // Create a modal for better display
        const modal = document.createElement('div');
        modal.className = 'report-details-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:white;padding:30px;border-radius:10px;max-width:600px;max-height:80vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);';

        const userInfo = report.user ?
            report.user.email + (report.user.first_name ? ' (' + report.user.first_name + ' ' + report.user.last_name + ')' : '') :
            'N/A';

        modalContent.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h2 style="margin:0;color:#333;">Report Details</h2>
                <button class="close-modal-btn" style="background:#dc3545;color:white;border:none;padding:5px 15px;border-radius:5px;cursor:pointer;font-size:18px;">×</button>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Report ID:</strong> ${report.id}
            </div>
            <div style="margin-bottom:15px;">
                <strong>User:</strong> ${escapeHtml(userInfo)}
            </div>
            <div style="margin-bottom:15px;">
                <strong>Type:</strong> <span class="report-status ${report.report_type}" style="padding:3px 10px;border-radius:3px;font-size:0.9em;">${escapeHtml(report.report_type)}</span>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Status:</strong> <span class="report-status ${report.status}" style="padding:3px 10px;border-radius:3px;font-size:0.9em;">${escapeHtml(report.status)}</span>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Title:</strong>
                <div style="padding:10px;background:#f8f9fa;border-radius:5px;margin-top:5px;">${escapeHtml(report.title)}</div>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Description:</strong>
                <div style="padding:10px;background:#f8f9fa;border-radius:5px;margin-top:5px;white-space:pre-wrap;">${escapeHtml(report.description)}</div>
            </div>
            <div style="margin-bottom:15px;">
                <strong>Submitted:</strong> ${new Date(report.created_at).toLocaleString()}
            </div>
            <div style="margin-bottom:15px;">
                <strong>Last Updated:</strong> ${new Date(report.updated_at).toLocaleString()}
            </div>
            ${report.admin_reply ? `
            <div style="margin-top:20px;margin-bottom:15px;padding:15px;background:#e7f3ff;border-left:4px solid #007bff;border-radius:5px;">
                <strong style="display:block;margin-bottom:10px;color:#007bff;">Admin Reply:</strong>
                <div style="white-space:pre-wrap;color:#333;">${escapeHtml(report.admin_reply)}</div>
                <small style="color:#666;display:block;margin-top:10px;">
                    Replied: ${report.replied_at ? new Date(report.replied_at).toLocaleString() : 'N/A'}
                </small>
            </div>
            ` : `
            <div style="margin-top:20px;margin-bottom:15px;padding:15px;background:#fff3cd;border-left:4px solid #ffc107;border-radius:5px;">
                <strong style="color:#856404;">No admin reply yet</strong>
            </div>
            `}
            <div style="margin-top:20px;text-align:right;">
                <button onclick="replyToReport('${report.id}'); this.closest('.report-details-modal').remove();" style="background:#17a2b8;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin-right:10px;">${report.admin_reply ? 'Edit Reply' : 'Add Reply'}</button>
                <button class="close-modal-btn" style="background:#007bff;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;">Close</button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Add event listeners to close buttons
        const closeButtons = modalContent.querySelectorAll('.close-modal-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                modal.remove();
            });
        });

        // Close on outside click
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close on Escape key
        const escapeHandler = function (e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

    } catch (err) {
        console.error('Error viewing report details:', err);
        alert('Error loading report details: ' + err.message);
    }
}

async function replyToReport(reportId) {
    if (!reportId) {
        console.error('Missing reportId');
        return;
    }

    try {
        // Get current report and existing reply
        const { data: report, error: fetchError } = await supabase
            .from('student_reports')
            .select('*, user:users!user_id(email, first_name, last_name), replied_by_user:users!replied_by(email, first_name, last_name)')
            .eq('id', reportId)
            .single();

        if (fetchError) throw fetchError;

        if (!report) {
            alert('Report not found');
            return;
        }

        // Get current admin user
        const userEmail = sessionStorage.getItem('userEmail');
        const { data: currentAdmin } = await supabase
            .from('users')
            .select('id')
            .eq('email', userEmail)
            .single();

        // Create reply modal
        const modal = document.createElement('div');
        modal.className = 'report-reply-modal';
        modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;';

        const modalContent = document.createElement('div');
        modalContent.style.cssText = 'background:white;padding:30px;border-radius:10px;max-width:600px;max-height:80vh;overflow-y:auto;box-shadow:0 4px 20px rgba(0,0,0,0.3);';

        const userInfo = report.user ?
            report.user.email + (report.user.first_name ? ' (' + report.user.first_name + ' ' + report.user.last_name + ')' : '') :
            'N/A';

        modalContent.innerHTML = `
            <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:20px;">
                <h2 style="margin:0;color:#333;">${report.admin_reply ? 'Edit Reply' : 'Reply to Report'}</h2>
                <button class="close-reply-modal-btn" style="background:#dc3545;color:white;border:none;padding:5px 15px;border-radius:5px;cursor:pointer;font-size:18px;">×</button>
            </div>
            <div style="margin-bottom:15px;padding:10px;background:#f8f9fa;border-radius:5px;">
                <strong>Report from:</strong> ${escapeHtml(userInfo)}<br>
                <strong>Title:</strong> ${escapeHtml(report.title)}<br>
                <strong>Type:</strong> ${escapeHtml(report.report_type)}
            </div>
            ${report.admin_reply ? `
            <div style="margin-bottom:15px;padding:10px;background:#fff3cd;border-radius:5px;border-left:4px solid #ffc107;">
                <strong style="color:#856404;">Current Reply:</strong>
                <div style="margin-top:5px;white-space:pre-wrap;color:#333;">${escapeHtml(report.admin_reply)}</div>
                <small style="color:#666;display:block;margin-top:5px;">
                    Last replied: ${report.replied_at ? new Date(report.replied_at).toLocaleString() : 'N/A'}
                </small>
            </div>
            ` : ''}
            <div style="margin-bottom:15px;">
                <label for="replyText" style="display:block;margin-bottom:5px;font-weight:bold;">Your Reply:</label>
                <textarea id="replyText" rows="8" style="width:100%;padding:10px;border:1px solid #ddd;border-radius:5px;font-family:inherit;box-sizing:border-box;" placeholder="Enter your reply to the student...">${report.admin_reply ? escapeHtml(report.admin_reply) : ''}</textarea>
            </div>
            <div style="margin-top:20px;text-align:right;">
                <button class="close-reply-modal-btn" style="background:#6c757d;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;margin-right:10px;">Cancel</button>
                <button onclick="saveReply('${reportId}', ${currentAdmin ? "'" + currentAdmin.id + "'" : 'null'})" style="background:#17a2b8;color:white;border:none;padding:10px 20px;border-radius:5px;cursor:pointer;">Save Reply</button>
            </div>
        `;

        modal.appendChild(modalContent);
        document.body.appendChild(modal);

        // Add event listeners to close buttons
        const closeButtons = modalContent.querySelectorAll('.close-reply-modal-btn');
        closeButtons.forEach(btn => {
            btn.addEventListener('click', function () {
                modal.remove();
            });
        });

        // Close on outside click
        modal.addEventListener('click', function (e) {
            if (e.target === modal) {
                modal.remove();
            }
        });

        // Close on Escape key
        const escapeHandler = function (e) {
            if (e.key === 'Escape') {
                modal.remove();
                document.removeEventListener('keydown', escapeHandler);
            }
        };
        document.addEventListener('keydown', escapeHandler);

    } catch (err) {
        console.error('Error opening reply modal:', err);
        alert('Error: ' + err.message);
    }
}

async function saveReply(reportId, adminId) {
    const replyTextarea = document.getElementById('replyText');

    if (!replyTextarea) {
        alert('Reply textarea not found');
        return;
    }

    const replyText = replyTextarea.value.trim();

    if (!replyText) {
        alert('Please enter a reply');
        return;
    }

    try {
        const updateData = {
            admin_reply: replyText,
            replied_at: new Date().toISOString()
        };

        if (adminId) {
            updateData.replied_by = adminId;
        }

        const { data, error } = await supabase
            .from('student_reports')
            .update(updateData)
            .eq('id', reportId)
            .select();

        if (error) throw error;

        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:10001;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ Reply saved successfully!';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);

        // Close modal
        const modal = document.querySelector('.report-reply-modal');
        if (modal) {
            modal.remove();
        }

        // Refresh reports list
        await viewAllReports();

    } catch (err) {
        console.error('Error saving reply:', err);
        alert('Error saving reply: ' + err.message);
    }
}

// Helper function to escape HTML (prevent XSS)
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function viewLogs() {
    try {
        const { data: logs, error } = await supabase
            .from('actlog_iot')
            .select('*')
            .order('created_at', { ascending: false })
            .limit(100);

        if (error) throw error;

        if (logs.length === 0) {
            document.getElementById('logData').innerHTML = '<p>No events yet.</p>';
            return;
        }

        let html = '<table border="1" style="width:100%;border-collapse:collapse;"><thead><tr><th>Time</th><th>Event</th><th>User</th><th>Seat</th><th>Noise (dB)</th><th>RFID UID</th></tr></thead><tbody>';

        logs.forEach(log => {
            const time = new Date(log.created_at).toLocaleString();
            const eventIcon = log.event === 'login' ? '🔵' : log.event === 'logout' ? '🔴' : '🔊';

            html += '<tr>';
            html += '<td>' + time + '</td>';
            html += '<td>' + eventIcon + ' ' + log.event.toUpperCase() + '</td>';
            html += '<td>' + (log.name || 'N/A') + '</td>';
            html += '<td>' + (log.seat_number ? 'Seat ' + log.seat_number : '-') + '</td>';
            html += '<td>' + (log.decibel ? log.decibel + ' dB' : '-') + '</td>';
            html += '<td>' + (log.uid || 'N/A') + '</td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        document.getElementById('logData').innerHTML = html;
    } catch (err) {
        document.getElementById('logData').innerHTML = 'Error: ' + err.message;
    }
}

async function viewOccupancy() {
    const occupancyDataDiv = document.getElementById('occupancyData');
    const tableSelect = document.getElementById('occupancyTableSelect');

    if (!tableSelect) {
        occupancyDataDiv.innerHTML = '<p>Error: Table selector not found</p>';
        return;
    }

    const selectedTable = tableSelect.value;

    // Handle "Show All Tables" option
    if (selectedTable === 'all-tables') {
        await viewAllTablesOccupancy();
        return;
    }

    // Check if it's a future expansion table
    const isFutureExpansion = selectedTable.startsWith('table-') &&
        (selectedTable === 'table-3' || selectedTable === 'table-4');

    if (isFutureExpansion) {
        occupancyDataDiv.innerHTML =
            '<div style="padding:20px;background:#fff3cd;border-radius:5px;border:1px solid #ffc107;">' +
            '<h3 style="color:#856404;margin-top:0;">Future Expansion</h3>' +
            '<p style="color:#856404;">This table is planned for future expansion. Seat occupancy management will be available once the table is set up.</p>' +
            '</div>';
        return;
    }

    try {
        // First, get all seats for the selected table
        const { data: seats, error } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', selectedTable)
            .order('seat_number', { ascending: true });

        if (error) throw error;

        if (seats.length === 0) {
            occupancyDataDiv.innerHTML = '<p>No seats found for ' + selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) + '.</p>';
            return;
        }

        // Get all occupied emails to fetch RFID data
        const occupiedEmails = seats
            .filter(s => s.is_occupied && s.occupied_by && s.occupied_by !== 'ADMIN')
            .map(s => s.occupied_by);

        // Fetch RFID data for all occupied seats
        let rfidMap = {};
        if (occupiedEmails.length > 0) {
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('email, id')
                .in('email', occupiedEmails);

            if (!usersError && users) {
                const userIds = users.map(u => u.id);
                const { data: rfidCards, error: rfidError } = await supabase
                    .from('rfid_cards')
                    .select('user_id, rfid_uid')
                    .in('user_id', userIds);

                if (!rfidError && rfidCards) {
                    // Create a map: user_id -> rfid_uid
                    const rfidByUserId = {};
                    rfidCards.forEach(card => {
                        rfidByUserId[card.user_id] = card.rfid_uid;
                    });

                    // Create final map: email -> rfid_uid
                    users.forEach(user => {
                        if (rfidByUserId[user.id]) {
                            rfidMap[user.email] = rfidByUserId[user.id];
                        }
                    });
                }
            }
        }

        const tableName = selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()); // "table-1" -> "Table 1"

        // Apply filter
        let filteredSeats = seats;
        if (typeof currentFilter !== 'undefined' && currentFilter !== 'all') {
            filteredSeats = seats.filter(seat => {
                if (currentFilter === 'available') return !seat.is_occupied;
                if (currentFilter === 'student') return seat.is_occupied && seat.occupied_by !== 'ADMIN';
                if (currentFilter === 'admin') return seat.is_occupied && seat.occupied_by === 'ADMIN';
                return true;
            });
        }

        if (filteredSeats.length === 0) {
            occupancyDataDiv.innerHTML = '<p style="text-align:center;padding:20px;color:#6b7280;">No seats match the current filter.</p>';
            return;
        }

        let html = `
            <div class="overflow-x-auto">
                <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                    <thead class="bg-gray-50 dark:bg-gray-800">
                        <tr>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Seat</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">RFID UID</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Occupied At</th>
                            <th class="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                        </tr>
                    </thead>
                    <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">`;

        filteredSeats.forEach(seat => {
            const seatId = seat.id || (selectedTable + '-seat-' + seat.seat_number);
            const isAdminUse = seat.occupied_by === 'ADMIN';

            // Status badge
            const statusBadge = seat.is_occupied
                ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><i data-lucide="x-circle" class="w-3 h-3 mr-1"></i>Occupied</span>'
                : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><i data-lucide="check-circle" class="w-3 h-3 mr-1"></i>Available</span>';

            // Type badge
            let typeBadge = '-';
            if (seat.is_occupied) {
                if (isAdminUse) {
                    typeBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><i data-lucide="settings" class="w-3 h-3 mr-1"></i>Admin</span>';
                } else {
                    typeBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"><i data-lucide="user" class="w-3 h-3 mr-1"></i>Student</span>';
                }
            }

            // Determine what to display in RFID UID column
            let rfidDisplay = '-';
            if (seat.is_occupied) {
                if (isAdminUse) {
                    rfidDisplay = '-';
                } else if (rfidMap[seat.occupied_by]) {
                    // Show only RFID UID
                    rfidDisplay = escapeHtml(rfidMap[seat.occupied_by]);
                } else {
                    // No RFID found
                    rfidDisplay = '-';
                }
            }

            // Action buttons
            let actionButtons = '';
            if (seat.is_occupied) {
                actionButtons = `
                    <button onclick="toggleSeatOccupancy('${selectedTable}', ${seat.seat_number}, false, '${seatId}')"
                        class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors mr-2">
                        <i data-lucide="log-out" class="w-3 h-3 mr-1"></i>
                        Free Seat
                    </button>`;

                // Add "Move User" button for occupied seats
                if (seat.occupied_by && seat.occupied_by !== 'ADMIN') {
                    actionButtons += `
                        <button onclick="showMoveUserDialog('${selectedTable}', ${seat.seat_number}, '${escapeHtml(seat.occupied_by)}')"
                            class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                            <i data-lucide="move" class="w-3 h-3 mr-1"></i>
                            Move User
                        </button>`;
                }
            } else {
                actionButtons = `
                    <button onclick="openAssignModal('${selectedTable}', ${seat.seat_number})"
                        class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">
                        <i data-lucide="user-plus" class="w-3 h-3 mr-1"></i>
                        Assign Student
                    </button>`;
            }

            html += `
                        <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                ${tableName} - Seat ${seat.seat_number}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                ${statusBadge}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 font-mono">
                                ${rfidDisplay}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap">
                                ${typeBadge}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                ${seat.occupied_at ? new Date(seat.occupied_at).toLocaleString() : '-'}
                            </td>
                            <td class="px-6 py-4 whitespace-nowrap text-sm font-medium">
                                ${actionButtons}
                            </td>
                        </tr>`;
        });

        html += `
                    </tbody>
                </table>
            </div>`;
        occupancyDataDiv.innerHTML = html;

        // Initialize Lucide icons for the new table
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error loading occupancy:', err);
        occupancyDataDiv.innerHTML =
            '<div style="padding:20px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;">' +
            '<p style="color:#721c24;margin:0;">Error loading occupancy data: ' + err.message + '</p>' +
            '</div>';
    }
}

async function viewAllTablesOccupancy() {
    const occupancyDataDiv = document.getElementById('occupancyData');

    try {
        // Get all available tables (excluding future expansion)
        const availableTables = ['table-1', 'table-2'];

        // Fetch data for all tables
        const allSeatsPromises = availableTables.map(tableId =>
            supabase
                .from('occupancy')
                .select('*')
                .eq('table_id', tableId)
                .order('seat_number', { ascending: true })
        );

        const allSeatsResults = await Promise.all(allSeatsPromises);

        // Check for errors
        const errors = allSeatsResults.filter(result => result.error);
        if (errors.length > 0) {
            throw new Error('Failed to load some table data');
        }

        // Combine all seats data
        const allSeatsData = {};
        availableTables.forEach((tableId, index) => {
            allSeatsData[tableId] = allSeatsResults[index].data || [];
        });

        // Get all occupied emails across all tables
        const allOccupiedEmails = [];
        Object.values(allSeatsData).forEach(seats => {
            seats.forEach(seat => {
                if (seat.is_occupied && seat.occupied_by && seat.occupied_by !== 'ADMIN' && !allOccupiedEmails.includes(seat.occupied_by)) {
                    allOccupiedEmails.push(seat.occupied_by);
                }
            });
        });

        // Fetch RFID data for all occupied seats
        let rfidMap = {};
        if (allOccupiedEmails.length > 0) {
            const { data: users, error: usersError } = await supabase
                .from('users')
                .select('email, id')
                .in('email', allOccupiedEmails);

            if (!usersError && users) {
                const userIds = users.map(u => u.id);
                const { data: rfidCards, error: rfidError } = await supabase
                    .from('rfid_cards')
                    .select('user_id, rfid_uid')
                    .in('user_id', userIds);

                if (!rfidError && rfidCards) {
                    const rfidByUserId = {};
                    rfidCards.forEach(card => {
                        rfidByUserId[card.user_id] = card.rfid_uid;
                    });

                    users.forEach(user => {
                        if (rfidByUserId[user.id]) {
                            rfidMap[user.email] = rfidByUserId[user.id];
                        }
                    });
                }
            }
        }

        // Build HTML for all tables
        let html = '<div class="space-y-8">';

        availableTables.forEach(tableId => {
            const seats = allSeatsData[tableId];
            const tableName = tableId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());

            // Apply current filter
            let filteredSeats = seats;
            if (typeof currentFilter !== 'undefined' && currentFilter !== 'all') {
                filteredSeats = seats.filter(seat => {
                    if (currentFilter === 'available') return !seat.is_occupied;
                    if (currentFilter === 'student') return seat.is_occupied && seat.occupied_by !== 'ADMIN';
                    if (currentFilter === 'admin') return seat.is_occupied && seat.occupied_by === 'ADMIN';
                    return true;
                });
            }

            if (filteredSeats.length === 0) {
                html += `
                    <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                        <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                            <i data-lucide="table" class="w-5 h-5 text-emerald-500"></i>
                            ${tableName}
                        </h3>
                        <p class="text-gray-500 dark:text-gray-400 text-center py-8">No seats match the current filter.</p>
                    </div>`;
                return;
            }

            html += `
                <div class="bg-gray-50 dark:bg-gray-800 rounded-lg p-6">
                    <h3 class="text-lg font-semibold text-gray-900 dark:text-white mb-4 flex items-center gap-2">
                        <i data-lucide="table" class="w-5 h-5 text-emerald-500"></i>
                        ${tableName} (${filteredSeats.length} seats)
                    </h3>
                    <div class="overflow-x-auto">
                        <table class="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
                            <thead class="bg-white dark:bg-gray-900">
                                <tr>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Seat</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Status</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">RFID UID</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Type</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Occupied At</th>
                                    <th class="px-4 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">Actions</th>
                                </tr>
                            </thead>
                            <tbody class="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">`;

            filteredSeats.forEach(seat => {
                const seatId = seat.id || (tableId + '-seat-' + seat.seat_number);
                const isAdminUse = seat.occupied_by === 'ADMIN';

                // Status badge
                const statusBadge = seat.is_occupied
                    ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200"><i data-lucide="x-circle" class="w-3 h-3 mr-1"></i>Occupied</span>'
                    : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200"><i data-lucide="check-circle" class="w-3 h-3 mr-1"></i>Available</span>';

                // Type badge
                let typeBadge = '-';
                if (seat.is_occupied) {
                    if (isAdminUse) {
                        typeBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200"><i data-lucide="settings" class="w-3 h-3 mr-1"></i>Admin</span>';
                    } else {
                        typeBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200"><i data-lucide="user" class="w-3 h-3 mr-1"></i>Student</span>';
                    }
                }

                // RFID display
                let rfidDisplay = '-';
                if (seat.is_occupied) {
                    if (isAdminUse) {
                        rfidDisplay = '-';
                    } else if (rfidMap[seat.occupied_by]) {
                        rfidDisplay = escapeHtml(rfidMap[seat.occupied_by]);
                    } else {
                        rfidDisplay = '-';
                    }
                }

                // Action buttons
                let actionButtons = '';
                if (seat.is_occupied) {
                    actionButtons = `
                        <button onclick="toggleSeatOccupancy('${tableId}', ${seat.seat_number}, false, '${seatId}')"
                            class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-red-600 hover:bg-red-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-red-500 transition-colors mr-2">
                            <i data-lucide="log-out" class="w-3 h-3 mr-1"></i>
                            Free Seat
                        </button>`;

                    if (seat.occupied_by && seat.occupied_by !== 'ADMIN') {
                        actionButtons += `
                            <button onclick="showMoveUserDialog('${tableId}', ${seat.seat_number}, '${escapeHtml(seat.occupied_by)}')"
                                class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 transition-colors">
                                <i data-lucide="move" class="w-3 h-3 mr-1"></i>
                                Move User
                            </button>`;
                    }
                } else {
                    actionButtons = `
                        <button onclick="openAssignModal('${tableId}', ${seat.seat_number})"
                            class="inline-flex items-center px-3 py-1.5 border border-transparent text-xs font-medium rounded-md text-white bg-indigo-600 hover:bg-indigo-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-indigo-500 transition-colors">
                            <i data-lucide="user-plus" class="w-3 h-3 mr-1"></i>
                            Assign Student
                        </button>`;
                }

                html += `
                            <tr class="hover:bg-gray-50 dark:hover:bg-gray-800">
                                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">
                                    Seat ${seat.seat_number}
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap">
                                    ${statusBadge}
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300 font-mono">
                                    ${rfidDisplay}
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap">
                                    ${typeBadge}
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm text-gray-500 dark:text-gray-300">
                                    ${seat.occupied_at ? new Date(seat.occupied_at).toLocaleString() : '-'}
                                </td>
                                <td class="px-4 py-3 whitespace-nowrap text-sm font-medium">
                                    ${actionButtons}
                                </td>
                            </tr>`;
            });

            html += `
                            </tbody>
                        </table>
                    </div>
                </div>`;
        });

        html += '</div>';
        occupancyDataDiv.innerHTML = html;

        // Initialize Lucide icons
        if (window.lucide) lucide.createIcons();

    } catch (err) {
        console.error('Error loading all tables occupancy:', err);
        occupancyDataDiv.innerHTML =
            '<div style="padding:20px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;">' +
            '<p style="color:#721c24;margin:0;">Error loading occupancy data for all tables: ' + err.message + '</p>' +
            '</div>';
    }
}

async function toggleSeatOccupancy(tableId, seatNumber, occupy, seatId) {
    const action = occupy ? 'occupy' : 'free';
    const confirmMessage = occupy
        ? `Are you sure you want to manually occupy Seat ${seatNumber} on ${tableId.replace('-', ' ')}?`
        : `Are you sure you want to free Seat ${seatNumber} on ${tableId.replace('-', ' ')}?`;

    if (!confirm(confirmMessage)) {
        return;
    }

    try {
        const updateData = {
            is_occupied: occupy,
            table_id: tableId,
            seat_number: seatNumber
        };

        if (occupy) {
            // When occupying, set occupied_by to "ADMIN" and let trigger set occupied_at
            updateData.occupied_by = 'ADMIN';
        } else {
            // When freeing, clear occupied_by and let trigger set freed_at
            updateData.occupied_by = null;
        }

        // Try to update existing seat first
        const { data: updated, error: updateError } = await supabase
            .from('occupancy')
            .update(updateData)
            .eq('table_id', tableId)
            .eq('seat_number', seatNumber)
            .select();

        if (updateError) {
            // If update fails, try to upsert
            console.log('Update failed, trying upsert...', updateError);

            const { data: upserted, error: upsertError } = await supabase
                .from('occupancy')
                .upsert({
                    ...updateData,
                    id: seatId
                }, {
                    onConflict: 'table_id,seat_number'
                })
                .select();

            if (upsertError) throw upsertError;

            console.log('Seat occupancy toggled via upsert:', upserted);
        } else {
            console.log('Seat occupancy toggled via update:', updated);
        }

        // Show success notification
        const notification = document.createElement('div');
        notification.style.cssText = 'position:fixed;top:20px;right:20px;background:#28a745;color:white;padding:15px 20px;border-radius:5px;z-index:9999;box-shadow:0 4px 6px rgba(0,0,0,0.1);';
        notification.textContent = '✅ Seat ' + (occupy ? 'occupied' : 'freed') + ' successfully!';
        document.body.appendChild(notification);

        setTimeout(() => {
            notification.style.opacity = '0';
            notification.style.transition = 'opacity 0.3s';
            setTimeout(() => notification.remove(), 300);
        }, 2000);

        // Refresh the occupancy view
        await viewOccupancy();

    } catch (err) {
        console.error('Error toggling seat occupancy:', err);
        alert('Error: ' + err.message);
    }
}

// ========== STUDENT ASSIGNMENT MODAL FUNCTIONS ==========

// Global variables for assignment modal
let currentAssignMode = 'student';
let currentAssignSeat = null;
let selectedStudent = null;
let recentAssignments = [];
let currentFilter = 'all'; // Initialize filter

// Open assignment modal
window.openAssignModal = function openAssignModal(tableId, seatNumber) {
    currentAssignSeat = { tableId, seatNumber };
    currentAssignMode = 'student';
    selectedStudent = null;

    const modal = document.getElementById('assignModal');
    const title = document.getElementById('assignModalTitle');
    const tableName = tableId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());

    title.textContent = `Assign ${tableName} - Seat ${seatNumber}`;
    modal.classList.add('active');
    // Ensure overlay is visible for browsers that may override stylesheet rules
    try { modal.style.display = 'flex'; } catch (e) { /* ignore */ }
    document.body.style.overflow = 'hidden';

    // Reset modal state
    selectAssignMode('student');
    clearSelectedStudent();
    document.getElementById('studentSearchInput').value = '';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('confirmAssignBtn').disabled = true;
}

// Close assignment modal
window.closeAssignModal = function closeAssignModal() {
    const modal = document.getElementById('assignModal');
    modal.classList.remove('active');
    // Hide overlay completely to avoid it appearing unexpectedly
    try { modal.style.display = ''; } catch (e) { /* ignore */ }
    document.body.style.overflow = '';
    currentAssignSeat = null;
    selectedStudent = null;
}

// Select assignment mode (student or admin)
window.selectAssignMode = function selectAssignMode(mode) {
    currentAssignMode = mode;

    // Update UI
    document.querySelectorAll('.assign-mode-btn').forEach(btn => {
        if (btn.dataset.mode === mode) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    // Show/hide appropriate sections
    const studentSection = document.getElementById('studentSearchSection');
    const adminSection = document.getElementById('adminAssignSection');
    const confirmBtn = document.getElementById('confirmAssignBtn');

    if (mode === 'student') {
        studentSection.style.display = 'block';
        adminSection.style.display = 'none';
        confirmBtn.disabled = selectedStudent === null;
    } else {
        studentSection.style.display = 'none';
        adminSection.style.display = 'block';
        clearSelectedStudent();
        confirmBtn.disabled = false;
    }
}

// Debounce helper
let searchDebounceTimer;
window.searchStudents = function searchStudents(query) {
    clearTimeout(searchDebounceTimer);

    if (!query || query.trim().length < 2) {
        document.getElementById('searchResults').style.display = 'none';
        return;
    }

    searchDebounceTimer = setTimeout(async () => {
        await performStudentSearch(query.trim());
    }, 300);
}

// Perform student search with RFID card JOIN
async function performStudentSearch(query) {
    const resultsDiv = document.getElementById('searchResults');

    try {
        resultsDiv.innerHTML = '<div class="assign-loading"><div class="assign-spinner"></div><div>Searching...</div></div>';
        resultsDiv.style.display = 'block';

        // Search users by email, name, or student ID with RFID card JOIN
        const { data: users, error } = await supabase
            .from('users')
            .select(`
                *,
                rfid_card:rfid_cards!user_id (
                    id,
                    rfid_uid,
                    is_active,
                    created_at
                )
            `)
            .or(`email.ilike.%${query}%,student_id.ilike.%${query}%,first_name.ilike.%${query}%,last_name.ilike.%${query}%`)
            .eq('is_admin', false)
            .limit(10);

        if (error) throw error;

        if (!users || users.length === 0) {
            resultsDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #6b7280;">No students found</div>';
            return;
        }

        // Check current seat occupancy for each user
        const { data: occupancy } = await supabase
            .from('occupancy')
            .select('*')
            .eq('is_occupied', true)
            .in('occupied_by', users.map(u => u.email));

        const occupancyMap = {};
        if (occupancy) {
            occupancy.forEach(seat => {
                occupancyMap[seat.occupied_by] = seat;
            });
        }

        // Render results
        let html = '';
        users.forEach((user, index) => {
            // Build full name
            const firstName = user.first_name || '';
            const lastName = user.last_name || '';
            const fullName = `${firstName} ${lastName}`.trim() || user.email;
            const initials = firstName && lastName
                ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
                : user.email.substring(0, 2).toUpperCase();

            // Check RFID status
            const hasRfid = user.rfid_card && user.rfid_card.length > 0;
            const activeRfid = hasRfid && user.rfid_card[0].is_active;
            const rfidUid = hasRfid ? user.rfid_card[0].rfid_uid : null;

            // Check seat occupancy
            const currentSeat = occupancyMap[user.email];
            const isOccupied = !!currentSeat;
            const studentId = user.student_id || 'N/A';
            const department = user.college_department || '';

            // Store user data with RFID info
            const userId = `searchUser_${Date.now()}_${index}`;
            window[userId] = {
                ...user,
                hasRfid,
                activeRfid,
                rfidUid,
                fullName,
                isCurrentlyOccupied: isOccupied,
                currentSeat: currentSeat
            };

            // RFID status icon
            let rfidIcon = '';
            if (!hasRfid) {
                rfidIcon = '<span style="color: #ef4444; font-size: 0.75rem; margin-left: 6px;" title="No RFID card registered">❌</span>';
            } else if (activeRfid) {
                rfidIcon = '<span style="color: #10b981; font-size: 0.75rem; margin-left: 6px;" title="Active RFID card">💳</span>';
            } else {
                rfidIcon = '<span style="color: #f59e0b; font-size: 0.75rem; margin-left: 6px;" title="Inactive RFID card">⚠️</span>';
            }

            // Seat occupancy indicator
            let seatIndicator = '';
            if (isOccupied) {
                seatIndicator = `<span style="color: #dc2626; font-size: 0.75rem; margin-left: 6px;" title="Currently occupies ${currentSeat.table_id} Seat ${currentSeat.seat_number}">🪑 Seat ${currentSeat.seat_number}</span>`;
            }

            html += `
                <div class="search-result-item" onclick="selectStudentFromSearch(window['${userId}'])">
                    <div class="search-result-avatar" style="background: ${hasRfid && activeRfid ? '#10b981' : '#6b7280'};">${initials}</div>
                    <div class="search-result-info">
                        <div class="search-result-name">
                            ${escapeHtml(fullName)}${rfidIcon}${seatIndicator}
                        </div>
                        <div class="search-result-details">
                            ID: ${escapeHtml(studentId)} ${department ? '• ' + escapeHtml(department.substring(0, 30)) : ''}
                        </div>
                        ${!hasRfid ? '<div style="color: #ef4444; font-size: 0.75rem; margin-top: 4px;">⚠️ No RFID card assigned</div>' : ''}
                        ${hasRfid && !activeRfid ? '<div style="color: #f59e0b; font-size: 0.75rem; margin-top: 4px;">⚠️ RFID card inactive</div>' : ''}
                        ${hasRfid && activeRfid ? `<div style="color: #6b7280; font-size: 0.75rem; margin-top: 4px; font-family: monospace;">RFID: ${rfidUid}</div>` : ''}
                    </div>
                    <span class="search-result-badge ${isOccupied ? 'occupied' : 'available'}">
                        ${isOccupied ? '🔴 Occupied' : '✅ Available'}
                    </span>
                </div>
            `;
        });

        resultsDiv.innerHTML = html;

    } catch (err) {
        console.error('Error searching students:', err);
        resultsDiv.innerHTML = '<div style="padding: 20px; text-align: center; color: #ef4444;">Error searching students</div>';
    }
}

// Select student from search results
window.selectStudentFromSearch = async function selectStudentFromSearch(user) {
    selectedStudent = user;

    // Hide search results and show selected student
    document.getElementById('searchResults').style.display = 'none';
    const displayDiv = document.getElementById('selectedStudentDisplay');
    displayDiv.style.display = 'block';

    // Build display with full name
    const firstName = user.first_name || '';
    const lastName = user.last_name || '';
    const fullName = user.fullName || `${firstName} ${lastName}`.trim() || user.email;
    const initials = firstName && lastName
        ? `${firstName.charAt(0)}${lastName.charAt(0)}`.toUpperCase()
        : user.email.substring(0, 2).toUpperCase();

    // Update avatar with RFID status color
    const avatarDiv = document.getElementById('selectedStudentAvatar');
    avatarDiv.textContent = initials;
    avatarDiv.style.background = (user.hasRfid && user.activeRfid) ? '#10b981' : '#6b7280';

    // Update name and details
    document.getElementById('selectedStudentName').textContent = fullName;

    let detailsHtml = `ID: ${user.student_id || 'N/A'}`;
    if (user.college_department) {
        detailsHtml += ` • ${user.college_department}`;
    }

    // Add RFID status
    if (user.hasRfid && user.activeRfid) {
        detailsHtml += `<br><span style="color: #10b981; font-size: 0.875rem;">💳 RFID: ${user.rfidUid}</span>`;
    } else if (user.hasRfid && !user.activeRfid) {
        detailsHtml += `<br><span style="color: #f59e0b; font-size: 0.875rem;">⚠️ RFID card inactive</span>`;
    } else {
        detailsHtml += `<br><span style="color: #ef4444; font-size: 0.875rem;">❌ No RFID card registered</span>`;
    }

    document.getElementById('selectedStudentDetails').innerHTML = detailsHtml;

    // Enable/disable confirm button based on RFID status
    const confirmBtn = document.getElementById('confirmAssignBtn');
    if (user.hasRfid && user.activeRfid) {
        confirmBtn.disabled = false;
    } else {
        confirmBtn.disabled = true;
    }

    // Remove any existing warnings
    const existingWarnings = displayDiv.querySelectorAll('.assignment-warning');
    existingWarnings.forEach(w => w.remove());

    // Show warning if student already has a seat
    if (user.isCurrentlyOccupied && user.currentSeat) {
        const warning = document.createElement('div');
        warning.className = 'assignment-warning';
        warning.style.cssText = 'margin-top: 12px; padding: 12px; background: #fff3cd; border: 1px solid #ffc107; border-radius: 8px; color: #856404; font-size: 0.875rem;';
        warning.innerHTML = `<strong>⚠️ Warning:</strong> This student already occupies <strong>${user.currentSeat.table_id} Seat ${user.currentSeat.seat_number}</strong>. Assigning them here will automatically release their previous seat.`;
        displayDiv.appendChild(warning);
    }

    // Show error if no RFID card
    if (!user.hasRfid) {
        const error = document.createElement('div');
        error.className = 'assignment-warning';
        error.style.cssText = 'margin-top: 12px; padding: 12px; background: #fee2e2; border: 1px solid #ef4444; border-radius: 8px; color: #991b1b; font-size: 0.875rem;';
        error.innerHTML = `<strong>❌ Cannot Assign:</strong> This student has no registered RFID card. Please register an RFID card in the RFID Management section first.`;
        displayDiv.appendChild(error);
    } else if (!user.activeRfid) {
        const error = document.createElement('div');
        error.className = 'assignment-warning';
        error.style.cssText = 'margin-top: 12px; padding: 12px; background: #fef3c7; border: 1px solid #f59e0b; border-radius: 8px; color: #92400e; font-size: 0.875rem;';
        error.innerHTML = `<strong>⚠️ Cannot Assign:</strong> This student's RFID card is inactive. Please activate it in the RFID Management section first.`;
        displayDiv.appendChild(error);
    }
}

// Clear selected student
window.clearSelectedStudent = function clearSelectedStudent() {
    selectedStudent = null;
    document.getElementById('selectedStudentDisplay').style.display = 'none';
    document.getElementById('searchResults').style.display = 'none';
    document.getElementById('studentSearchInput').value = '';

    if (currentAssignMode === 'student') {
        document.getElementById('confirmAssignBtn').disabled = true;
    }
}

// Confirm assignment
window.confirmAssignment = async function confirmAssignment() {
    if (!currentAssignSeat) return;

    const { tableId, seatNumber } = currentAssignSeat;
    const loadingDiv = document.getElementById('assignLoading');
    const confirmBtn = document.getElementById('confirmAssignBtn');

    try {
        loadingDiv.style.display = 'block';
        confirmBtn.disabled = true;

        if (currentAssignMode === 'student' && selectedStudent) {
            // Assign student to seat (includes success notification)
            await assignStudentToSeat(tableId, seatNumber, selectedStudent);
        } else if (currentAssignMode === 'admin') {
            // Assign as admin use
            await assignAdminToSeat(tableId, seatNumber);
            showNotification('✅ Seat assigned for admin use!', 'success');
        }

        // Add to recent assignments
        addRecentAssignment(tableId, seatNumber, currentAssignMode, selectedStudent);

        // Close modal and refresh
        closeAssignModal();
        await viewOccupancy();
        updateOccupancyChart();

    } catch (err) {
        console.error('Error confirming assignment:', err);
        showNotification('❌ Error: ' + err.message, 'error');
    } finally {
        loadingDiv.style.display = 'none';
        confirmBtn.disabled = false;
    }
}

// Assign student to seat with RFID integration
async function assignStudentToSeat(tableId, seatNumber, student) {
    console.log('🎯 Assigning student to seat:', {
        student: student.fullName || student.email,
        table: tableId,
        seat: seatNumber,
        rfidUid: student.rfidUid
    });

    // Validate that student has active RFID
    if (!student.hasRfid || !student.activeRfid) {
        throw new Error('Student must have an active RFID card to occupy a seat');
    }

    // If student already has a seat, release it first
    if (student.isCurrentlyOccupied) {
        const { data: currentSeats } = await supabase
            .from('occupancy')
            .select('*')
            .eq('occupied_by', student.email)
            .eq('is_occupied', true);

        if (currentSeats && currentSeats.length > 0) {
            for (const seat of currentSeats) {
                await supabase
                    .from('occupancy')
                    .update({
                        is_occupied: false,
                        occupied_by: null,
                        occupied_at: null
                    })
                    .eq('id', seat.id);

                console.log(`✅ Released previous seat: ${seat.table_id} Seat ${seat.seat_number}`);

                // Log logout event for previous seat
                await supabase.from('actlog_iot').insert({
                    table_id: seat.table_id,
                    seat_number: seat.seat_number,
                    event: 'logout',
                    uid: student.rfidUid,
                    noise_db: null
                });
            }
        }
    }

    // Assign to new seat with RFID UID
    const { error } = await supabase
        .from('occupancy')
        .update({
            is_occupied: true,
            occupied_by: student.email,
            occupied_at: new Date().toISOString()
        })
        .eq('table_id', tableId)
        .eq('seat_number', seatNumber);

    if (error) throw error;

    // Log login event with RFID UID
    await supabase.from('actlog_iot').insert({
        table_id: tableId,
        seat_number: seatNumber,
        event: 'login',
        uid: student.rfidUid,
        noise_db: null
    });

    console.log(`✅ Seat assigned successfully to ${student.fullName || student.email} (RFID: ${student.rfidUid})`);

    // Show detailed success toast
    const fullName = student.fullName || student.email;
    const studentId = student.student_id || '';
    const toastMessage = `Seat assigned to ${fullName}${studentId ? ` (${studentId})` : ''} - ${tableId} Seat ${seatNumber}`;
    showNotification(`✅ ${toastMessage}`, 'success');
}

// Assign admin to seat
async function assignAdminToSeat(tableId, seatNumber) {
    const { error } = await supabase
        .from('occupancy')
        .update({
            is_occupied: true,
            occupied_by: 'ADMIN',
            occupied_at: new Date().toISOString()
        })
        .eq('table_id', tableId)
        .eq('seat_number', seatNumber);

    if (error) throw error;

    console.log(`✅ Assigned admin use to ${tableId} seat ${seatNumber}`);
}

// Filter seats
window.filterSeats = function filterSeats(filter) {
    currentFilter = filter;

    // Update filter chips
    document.querySelectorAll('.filter-chip').forEach(chip => {
        if (chip.dataset.filter === filter) {
            chip.classList.add('active');
        } else {
            chip.classList.remove('active');
        }
    });

    // Re-render occupancy with filter
    viewOccupancy();
}

// Add recent assignment
function addRecentAssignment(tableId, seatNumber, mode, student) {
    const assignment = {
        tableId,
        seatNumber,
        mode,
        student: student ? student.email : 'Admin Use',
        timestamp: new Date().toISOString()
    };

    recentAssignments.unshift(assignment);

    // Keep only last 5
    if (recentAssignments.length > 5) {
        recentAssignments = recentAssignments.slice(0, 5);
    }

    updateRecentAssignmentsUI();
}

// Update recent assignments UI
function updateRecentAssignmentsUI() {
    const container = document.getElementById('recentAssignments');
    const listDiv = document.getElementById('recentAssignmentsList');

    if (recentAssignments.length === 0) {
        container.style.display = 'none';
        return;
    }

    container.style.display = 'block';
    let html = '';

    recentAssignments.forEach(assignment => {
        const tableName = assignment.tableId.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase());
        const time = new Date(assignment.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });

        const typeIcon = assignment.mode === 'student' ? 'user' : 'settings';
        const typeLabel = assignment.mode === 'student' ? 'Student' : 'Admin';
        const typeColor = assignment.mode === 'student' ? 'purple' : 'blue';

        html += `
            <div class="flex items-center justify-between p-3 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors">
                <div class="flex-1">
                    <div class="font-medium text-gray-900 dark:text-white">${escapeHtml(assignment.student)}</div>
                    <div class="text-sm text-gray-600 dark:text-gray-400">${tableName} - Seat ${assignment.seatNumber}</div>
                    <div class="text-xs text-gray-500 dark:text-gray-500">${time}</div>
                </div>
                <div class="flex items-center gap-2">
                    <span class="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-${typeColor}-100 text-${typeColor}-800 dark:bg-${typeColor}-900 dark:text-${typeColor}-200">
                        <i data-lucide="${typeIcon}" class="w-3 h-3 mr-1"></i>
                        ${typeLabel}
                    </span>
                </div>
            </div>
        `;
    });

    listDiv.innerHTML = html;

    // Initialize Lucide icons for recent assignments
    if (window.lucide) lucide.createIcons();
}

// Clear recent assignments
window.clearRecentAssignments = function clearRecentAssignments() {
    if (!confirm('Clear all recent assignments?')) return;
    recentAssignments = [];
    updateRecentAssignmentsUI();
}

// Show notification helper
function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    let bgColor = '#28a745';
    if (type === 'error') bgColor = '#dc3545';
    else if (type === 'warning') bgColor = '#f59e0b';
    notification.style.cssText = `position:fixed;top:20px;right:20px;background:${bgColor};color:white;padding:15px 20px;border-radius:8px;z-index:9999;box-shadow:0 4px 12px rgba(0,0,0,0.2);font-weight:600;`;
    notification.textContent = message;
    document.body.appendChild(notification);

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transition = 'opacity 0.3s';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

// ========== END STUDENT ASSIGNMENT FUNCTIONS ==========

async function viewNoiseLevel() {
    const noiseDataDiv = document.getElementById('noiseData');
    const tableSelect = document.getElementById('noiseTableSelect');

    if (!tableSelect) {
        noiseDataDiv.innerHTML = '<p>Error: Table selector not found</p>';
        return;
    }

    const selectedTable = tableSelect.value;

    // Check if it's a future expansion table
    const isFutureExpansion = selectedTable.startsWith('table-') &&
        (selectedTable === 'table-2' || selectedTable === 'table-3' || selectedTable === 'table-4');

    if (isFutureExpansion) {
        noiseDataDiv.innerHTML =
            '<div style="padding:20px;background:#fff3cd;border-radius:5px;border:1px solid #ffc107;">' +
            '<h3 style="color:#856404;margin-top:0;">Future Expansion</h3>' +
            '<p style="color:#856404;">This table is planned for future expansion. Noise monitoring will be available once the table is set up.</p>' +
            '</div>';
        return;
    }

    try {
        const { data: noise, error } = await supabase
            .from('noise_log')
            .select('*')
            .eq('table_id', selectedTable)
            .single();

        if (error) {
            if (error.code === 'PGRST116') {
                noiseDataDiv.innerHTML =
                    '<div style="padding:20px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;">' +
                    '<p style="color:#721c24;margin:0;">No noise data available yet for ' + selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()) + '.</p>' +
                    '</div>';
            } else {
                throw error;
            }
            return;
        }

        const lastUpdate = noise.updated_at ? new Date(noise.updated_at).toLocaleString() : 'N/A';
        const tableName = selectedTable.replace('-', ' ').replace(/\b\w/g, l => l.toUpperCase()); // "table-1" -> "Table 1"

        // Calculate noise level properties
        const decibel = noise.decibel || 0;
        const maxDb = 100; // Maximum dB for visualization
        const percentage = Math.min(Math.round((decibel / maxDb) * 100), 100);

        // Determine color and status based on thresholds
        let gaugeClass = 'bg-green-500';
        let statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">Safe</span>';
        let statusColor = '#10b981';

        if (decibel >= 81) {
            gaugeClass = 'bg-red-500';
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">Alert</span>';
            statusColor = '#ef4444';
        } else if (decibel >= 61) {
            gaugeClass = 'bg-yellow-500';
            statusBadge = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800">Caution</span>';
            statusColor = '#f59e0b';
        }

        noiseDataDiv.innerHTML =
            '<div class="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6">' +
            '  <div class="flex items-center justify-between mb-4">' +
            '    <div>' +
            '      <h3 class="text-lg font-semibold text-gray-900 dark:text-white">' + tableName + '</h3>' +
            '      <div class="flex items-baseline gap-1 mt-1">' +
            '        <span class="text-3xl font-bold" style="color:' + statusColor + ';">' + decibel + '</span>' +
            '        <span class="text-lg text-gray-500 dark:text-gray-400">dB</span>' +
            '      </div>' +
            '    </div>' +
            '    <div>' + statusBadge + '</div>' +
            '  </div>' +

            '  <div class="mb-4">' +
            '    <div class="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4">' +
            '      <div class="' + gaugeClass + ' h-4 rounded-full transition-all duration-300 ease-out" style="width:' + percentage + '%;"></div>' +
            '    </div>' +
            '    <div class="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">' +
            '      <span>0 dB</span>' +
            '      <span class="text-green-600">≤60 Safe</span>' +
            '      <span class="text-yellow-600">61-80 Caution</span>' +
            '      <span class="text-red-600">≥81 Alert</span>' +
            '      <span>100 dB</span>' +
            '    </div>' +
            '  </div>' +

            '  <div class="grid grid-cols-3 gap-4 text-center">' +
            '    <div>' +
            '      <div class="text-xs text-gray-500 dark:text-gray-400">Status</div>' +
            '      <div class="text-sm font-medium" style="color:' + statusColor + ';">' +
            (decibel <= 60 ? 'Normal' : decibel <= 80 ? 'Moderate' : 'High') + '</div>' +
            '    </div>' +
            '    <div>' +
            '      <div class="text-xs text-gray-500 dark:text-gray-400">Last Updated</div>' +
            '      <div class="text-sm text-gray-900 dark:text-white">' + lastUpdate + '</div>' +
            '    </div>' +
            '    <div>' +
            '      <div class="text-xs text-gray-500 dark:text-gray-400">Level</div>' +
            '      <div class="text-sm font-medium text-gray-900 dark:text-white">' + percentage + '%</div>' +
            '    </div>' +
            '  </div>' +
            '</div>';
    } catch (err) {
        console.error('Error loading noise level:', err);
        noiseDataDiv.innerHTML =
            '<div style="padding:20px;background:#f8d7da;border-radius:5px;border:1px solid #f5c6cb;">' +
            '<p style="color:#721c24;margin:0;">Error loading noise data: ' + err.message + '</p>' +
            '</div>';
    }
}

async function logout() {
    // Sign out from Supabase Auth
    await supabase.auth.signOut();

    // Clear session storage
    sessionStorage.removeItem('userEmail');

    // Redirect to login
    window.location.href = 'login.html';
}

// ========== ANNOUNCEMENTS MANAGEMENT ==========

// Initialize announcement form character counter
document.addEventListener('DOMContentLoaded', function () {
    const messageInput = document.getElementById('announcementMessage');
    if (messageInput) {
        const charCount = document.getElementById('charCount');
        messageInput.addEventListener('input', () => {
            if (charCount) charCount.textContent = messageInput.value.length;
        });
    }

    // Announcement form submission
    const announcementForm = document.getElementById('announcementForm');
    if (announcementForm) {
        announcementForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            await createAnnouncement();
        });
    }
});

async function loadAnnouncements() {
    try {
        const { data: announcements, error } = await supabase
            .from('announcements')
            .select('*')
            .order('is_priority', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(20);

        if (error) throw error;

        // Filter out expired announcements client-side
        const data = announcements ? announcements.filter(ann => {
            if (!ann.expires_at) return true;
            return new Date(ann.expires_at) > new Date();
        }) : [];

        const container = document.getElementById('announcementsList');
        if (!container) return;

        if (!data || data.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-sm text-center py-4">No announcements yet. Create one above!</p>';
            return;
        }

        container.innerHTML = data.map(ann => {
            const createdAt = new Date(ann.created_at).toLocaleString();
            const expiresAt = ann.expires_at ? new Date(ann.expires_at).toLocaleString() : null;
            const isExpired = ann.expires_at ? new Date(ann.expires_at) < new Date() : false;

            return `
                <div class="p-4 rounded-lg border ${ann.is_priority ? 'border-rose-300 bg-rose-50' : 'border-gray-200 bg-white'} ${isExpired ? 'opacity-60' : ''}">
                    <div class="flex items-start justify-between gap-3 mb-2">
                        <div class="flex-1">
                            <div class="flex items-center gap-2 mb-1">
                                <h4 class="font-semibold ${ann.is_priority ? 'text-rose-700' : 'setup-title-color'}">${escapeHtml(ann.title || 'Untitled')}</h4>
                                ${ann.is_priority ? '<span class="px-2 py-0.5 text-xs rounded bg-rose-200 text-rose-800 font-medium">Priority</span>' : ''}
                                ${isExpired ? '<span class="px-2 py-1 text-xs rounded bg-gray-100 text-gray-700">Expired</span>' : ''}
                            </div>
                            <p class="text-sm text-gray-600 mb-2 whitespace-pre-wrap">${escapeHtml(ann.message || '')}</p>
                            <div class="text-xs text-gray-500">
                                Created: ${createdAt}
                                ${expiresAt ? ` • Expires: ${expiresAt}` : ''}
                            </div>
                        </div>
                        <div class="flex gap-2">
                            <button onclick="deleteAnnouncement('${ann.id}')" 
                                    class="px-3 py-1.5 text-xs rounded-lg bg-red-100 text-red-700 hover:bg-red-200 transition">
                                Delete
                            </button>
                        </div>
                    </div>
                </div>
            `;
        }).join('');

        // Reinitialize Lucide icons for the new buttons
        if (window.lucide) {
            setTimeout(() => lucide.createIcons(), 100);
        }
    } catch (err) {
        console.error('Error loading announcements:', err);
        const container = document.getElementById('announcementsList');
        if (container) {
            container.innerHTML = `<p class="text-red-500 text-sm text-center py-4">Error loading announcements: ${err.message}</p>`;
        }
    }
}

async function createAnnouncement() {
    const titleInput = document.getElementById('announcementTitle');
    const messageInput = document.getElementById('announcementMessage');
    const priorityCheck = document.getElementById('announcementPriority');
    const expiresInput = document.getElementById('announcementExpires');
    const resultDiv = document.getElementById('announcementResult');

    if (!titleInput || !messageInput) return;

    const title = titleInput.value.trim();
    const message = messageInput.value.trim();
    const isPriority = priorityCheck ? priorityCheck.checked : false;
    const expiresAt = expiresInput && expiresInput.value ? new Date(expiresInput.value).toISOString() : null;

    if (!title || !message) {
        if (resultDiv) {
            resultDiv.innerHTML = '<span class="text-red-600">Please fill in both title and message.</span>';
        }
        return;
    }

    try {
        // Get current user ID
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        // Verify admin status before creating
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('is_admin')
            .eq('email', session.user.email)
            .single();

        if (userError || !user || !user.is_admin) {
            throw new Error('Admin privileges required');
        }

        const { data, error } = await supabase
            .from('announcements')
            .insert([
                {
                    title: title,
                    message: message,
                    is_priority: isPriority,
                    created_by: session.user.id,
                    expires_at: expiresAt
                }
            ])
            .select()
            .single();

        if (error) throw error;

        if (resultDiv) {
            resultDiv.innerHTML = '<span class="text-green-600">Announcement posted successfully!</span>';
        }

        // Clear form
        clearAnnouncementForm();

        // Reload announcements list
        setTimeout(() => {
            loadAnnouncements();
            if (resultDiv) resultDiv.innerHTML = '';
        }, 1500);
    } catch (err) {
        console.error('Error creating announcement:', err);
        if (resultDiv) {
            resultDiv.innerHTML = `<span class="text-red-600">Error: ${err.message}</span>`;
        }
    }
}

function clearAnnouncementForm() {
    const titleInput = document.getElementById('announcementTitle');
    const messageInput = document.getElementById('announcementMessage');
    const priorityCheck = document.getElementById('announcementPriority');
    const expiresInput = document.getElementById('announcementExpires');
    const charCount = document.getElementById('charCount');
    const resultDiv = document.getElementById('announcementResult');

    if (titleInput) titleInput.value = '';
    if (messageInput) messageInput.value = '';
    if (priorityCheck) priorityCheck.checked = false;
    if (expiresInput) expiresInput.value = '';
    if (charCount) charCount.textContent = '0';
    if (resultDiv) resultDiv.innerHTML = '';
}


async function deleteAnnouncement(id) {
    if (!confirm('Are you sure you want to delete this announcement?')) return;

    try {
        // First verify admin status
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) throw new Error('Not authenticated');

        // Function to initialize and handle data polling
        function initializeDataPolling() {
            // Set polling interval (5 seconds)
            const POLL_INTERVAL = 5000;

            // Initial load
            loadUsers();
            loadStats();
            viewOccupancy();
            viewNoiseLevel();
            loadAnnouncements();

            // Set up polling intervals
            setInterval(loadStats, POLL_INTERVAL);
            setInterval(viewOccupancy, POLL_INTERVAL);
            setInterval(viewNoiseLevel, POLL_INTERVAL);
            setInterval(loadAnnouncements, POLL_INTERVAL);

            // User data doesn't need frequent updates
            setInterval(loadUsers, POLL_INTERVAL * 6); // Every 30 seconds

            // Handle page visibility changes
            document.addEventListener('visibilitychange', () => {
                if (!document.hidden) {
                    // Refresh all data when page becomes visible
                    loadUsers();
                    loadStats();
                    viewOccupancy();
                    viewNoiseLevel();
                    loadAnnouncements();
                }
            });
        }

        const { data: user, error: userError } = await supabase
            .from('users')
            .select('is_admin')
            .eq('email', session.user.email)
            .single();

        if (userError || !user || !user.is_admin) {
            throw new Error('Admin privileges required');
        }

        const { error } = await supabase
            .from('announcements')
            .delete()
            .eq('id', id);

        if (error) throw error;

        loadAnnouncements();
    } catch (err) {
        console.error('Error deleting announcement:', err);
        alert('Error deleting announcement: ' + err.message);
    }
}

// Pie Chart for Table Occupancy
let occupancyPieChart = null;

// Initialize the occupancy pie chart
function initializeOccupancyChart() {
    const ctx = document.getElementById('occupancyPieChart');
    if (!ctx) return;

    // Create the chart
    occupancyPieChart = new Chart(ctx, {
        type: 'doughnut',
        data: {
            labels: [],
            datasets: [{
                data: [],
                backgroundColor: [
                    '#0e163e', // Dark blue
                    '#3b82f6', // Blue
                    '#10b981', // Green
                    '#f59e0b', // Amber
                    '#ef4444', // Red
                    '#8b5cf6', // Purple
                    '#ec4899', // Pink
                    '#6366f1'  // Indigo
                ],
                borderWidth: 2,
                borderColor: isDarkMode() ? '#1a1a2e' : '#ffffff'
            }]
        },
        options: {
            responsive: true,
            maintainAspectRatio: true,
            cutout: '70%',
            plugins: {
                legend: {
                    display: false
                },
                tooltip: {
                    backgroundColor: getThemeColors().tooltipBg,
                    titleColor: getThemeColors().tooltipText,
                    bodyColor: getThemeColors().tooltipText,
                    borderColor: getThemeColors().gridColor,
                    borderWidth: 1,
                    padding: 12,
                    titleFont: {
                        size: 14,
                        weight: 'bold'
                    },
                    bodyFont: {
                        size: 13
                    },
                    callbacks: {
                        label: function (context) {
                            const label = context.label || '';
                            const value = context.parsed || 0;
                            const total = context.dataset.data.reduce((a, b) => a + b, 0);
                            const percentage = total > 0 ? ((value / total) * 100).toFixed(1) : 0;
                            return `${label}: ${value} seats (${percentage}%)`;
                        }
                    }
                }
            }
        }
    });

    // Initial update
    updateOccupancyChart();
}

// Update the occupancy pie chart with live data
async function updateOccupancyChart() {
    if (!occupancyPieChart) return;

    try {
        // Fetch occupancy data from the database
        const { data: occupancyData, error } = await supabase
            .from('occupancy')
            .select('table_id, seat_number, is_occupied');

        if (error) throw error;

        // Group by table and count occupied seats
        const tableOccupancy = {};
        const tableTotal = {};

        occupancyData.forEach(seat => {
            const tableId = seat.table_id || 'table-1';

            if (!tableOccupancy[tableId]) {
                tableOccupancy[tableId] = 0;
                tableTotal[tableId] = 0;
            }

            tableTotal[tableId]++;
            if (seat.is_occupied) {
                tableOccupancy[tableId]++;
            }
        });

        // Prepare chart data
        const labels = [];
        const data = [];
        let totalOccupied = 0;
        let totalSeats = 0;

        Object.keys(tableOccupancy).sort().forEach(tableId => {
            const tableName = tableId.replace('table-', 'Table ');
            const occupied = tableOccupancy[tableId];
            const total = tableTotal[tableId];

            labels.push(tableName);
            data.push(occupied);

            totalOccupied += occupied;
            totalSeats += total;
        });

        // Update chart
        occupancyPieChart.data.labels = labels;
        occupancyPieChart.data.datasets[0].data = data;
        occupancyPieChart.update('none'); // Use 'none' mode for performance

        // Update total occupancy percentage
        const totalPercentage = totalSeats > 0 ? ((totalOccupied / totalSeats) * 100).toFixed(1) : 0;
        const percentElement = document.getElementById('totalOccupancyPercent');
        if (percentElement) {
            percentElement.textContent = `${totalPercentage}%`;
        }

        // Update custom legend
        updateChartLegend(labels, data, tableOccupancy, tableTotal);

    } catch (error) {
        console.error('Error updating occupancy chart:', error);
    }
}

// Create custom legend with seat details
function updateChartLegend(labels, data, tableOccupancy, tableTotal) {
    const legendContainer = document.getElementById('chartLegend');
    if (!legendContainer) return;

    const colors = [
        '#0e163e', '#3b82f6', '#10b981', '#f59e0b',
        '#ef4444', '#8b5cf6', '#ec4899', '#6366f1'
    ];

    let legendHtml = '<div class="grid grid-cols-2 gap-3">';

    labels.forEach((label, index) => {
        const tableId = `table-${index + 1}`;
        const occupied = tableOccupancy[tableId] || 0;
        const total = tableTotal[tableId] || 0;
        const color = colors[index % colors.length];

        legendHtml += `
            <div class="flex items-center gap-2 text-sm">
                <div class="w-4 h-4 rounded" style="background-color: ${color}"></div>
                <div class="flex-1">
                    <div class="font-medium text-gray-700">${label}</div>
                    <div class="text-xs text-gray-500">${occupied}/${total} seats</div>
                </div>
            </div>
        `;
    });

    legendHtml += '</div>';
    legendContainer.innerHTML = legendHtml;
}

// Function to switch user from one table to another
async function switchUserTable(userEmail, fromTableId, fromSeatNumber, toTableId, toSeatNumber) {
    try {
        console.log(`Switching user ${userEmail} from ${fromTableId} Seat ${fromSeatNumber} to ${toTableId} Seat ${toSeatNumber}`);

        // Step 1: Free the old seat
        if (fromTableId && fromSeatNumber) {
            const { error: freeError } = await supabase
                .from('occupancy')
                .update({
                    is_occupied: false,
                    occupied_by: null,
                    freed_at: new Date().toISOString()
                })
                .eq('table_id', fromTableId)
                .eq('seat_number', fromSeatNumber);

            if (freeError) {
                console.error('Error freeing old seat:', freeError);
                throw freeError;
            }
            console.log(`Freed ${fromTableId} Seat ${fromSeatNumber}`);
        }

        // Step 2: Occupy the new seat
        const { error: occupyError } = await supabase
            .from('occupancy')
            .update({
                is_occupied: true,
                occupied_by: userEmail,
                occupied_at: new Date().toISOString()
            })
            .eq('table_id', toTableId)
            .eq('seat_number', toSeatNumber);

        if (occupyError) {
            console.error('Error occupying new seat:', occupyError);
            throw occupyError;
        }
        console.log(`Occupied ${toTableId} Seat ${toSeatNumber}`);

        // Step 3: Log the table switch in activity log
        const { error: logError } = await supabase
            .from('actlog_iot')
            .insert({
                user_email: userEmail,
                event_type: 'table_switch',
                seat_number: toSeatNumber,
                rfid_card_id: null, // Can be filled if RFID is available
                created_at: new Date().toISOString()
            });

        if (logError) {
            console.warn('Error logging table switch:', logError);
        }

        // Step 4: Refresh the UI
        viewOccupancy();
        updateOccupancyChart();

        return { success: true, message: `Successfully switched to ${toTableId} Seat ${toSeatNumber}` };

    } catch (error) {
        console.error('Error switching tables:', error);
        return { success: false, message: 'Failed to switch tables: ' + error.message };
    }
}

// Function to ensure only one seat per user is occupied
async function enforceOneOccupiedSeatPerUser(userEmail) {
    try {
        // Find all seats currently occupied by this user
        const { data: occupiedSeats, error } = await supabase
            .from('occupancy')
            .select('*')
            .eq('occupied_by', userEmail)
            .eq('is_occupied', true);

        if (error) {
            console.error('Error checking occupied seats:', error);
            return;
        }

        // If user has more than one occupied seat, free all except the most recent one
        if (occupiedSeats && occupiedSeats.length > 1) {
            console.warn(`User ${userEmail} has ${occupiedSeats.length} occupied seats. Cleaning up...`);

            // Sort by occupied_at to find the most recent
            occupiedSeats.sort((a, b) => new Date(b.occupied_at) - new Date(a.occupied_at));

            // Free all except the first (most recent)
            for (let i = 1; i < occupiedSeats.length; i++) {
                const seat = occupiedSeats[i];
                await supabase
                    .from('occupancy')
                    .update({
                        is_occupied: false,
                        occupied_by: null,
                        freed_at: new Date().toISOString()
                    })
                    .eq('id', seat.id);

                console.log(`Freed ${seat.table_id} Seat ${seat.seat_number} for user ${userEmail}`);
            }
        }
    } catch (error) {
        console.error('Error enforcing one seat per user:', error);
    }
}

// Function to get user's current occupied seat
async function getUserCurrentSeat(userEmail) {
    try {
        const { data, error } = await supabase
            .from('occupancy')
            .select('*')
            .eq('occupied_by', userEmail)
            .eq('is_occupied', true)
            .order('occupied_at', { ascending: false })
            .limit(1)
            .single();

        if (error && error.code !== 'PGRST116') { // PGRST116 = not found
            console.error('Error getting user current seat:', error);
            return null;
        }

        return data;
    } catch (error) {
        console.error('Error in getUserCurrentSeat:', error);
        return null;
    }
}

// Show dialog to move user to a different table/seat
function showMoveUserDialog(fromTableId, fromSeatNumber, userEmail) {
    const tables = ['table-1', 'table-2', 'table-3', 'table-4'];

    let dialog = `
        <div style="position:fixed;top:0;left:0;right:0;bottom:0;background:rgba(0,0,0,0.5);z-index:10000;display:flex;align-items:center;justify-content:center;" id="moveUserDialog">
            <div style="background:white;padding:24px;border-radius:8px;max-width:500px;width:90%;">
                <h3 style="margin:0 0 16px 0;font-size:1.25rem;font-weight:600;">Move User to Different Seat</h3>
                <p style="margin:0 0 16px 0;color:#666;">
                    Moving: <strong>${userEmail}</strong><br>
                    From: <strong>${fromTableId.replace('table-', 'Table ')} - Seat ${fromSeatNumber}</strong>
                </p>
                
                <div style="margin-bottom:12px;">
                    <label style="display:block;margin-bottom:4px;font-weight:500;">Select Target Table:</label>
                    <select id="targetTable" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
                        ${tables.map(t => `<option value="${t}">${t.replace('table-', 'Table ')}</option>`).join('')}
                    </select>
                </div>
                
                <div style="margin-bottom:16px;">
                    <label style="display:block;margin-bottom:4px;font-weight:500;">Select Target Seat:</label>
                    <select id="targetSeat" style="width:100%;padding:8px;border:1px solid #ddd;border-radius:4px;">
                        <option value="1">Seat 1</option>
                        <option value="2">Seat 2</option>
                        <option value="3">Seat 3</option>
                        <option value="4">Seat 4</option>
                        <option value="5">Seat 5</option>
                        <option value="6">Seat 6</option>
                        <option value="7">Seat 7</option>
                        <option value="8">Seat 8</option>
                    </select>
                </div>
                
                <div style="display:flex;gap:8px;justify-content:flex-end;">
                    <button onclick="closeMoveUserDialog()" style="padding:8px 16px;background:#6c757d;color:white;border:none;border-radius:4px;cursor:pointer;">Cancel</button>
                    <button onclick="executeMoveUser('${fromTableId}', ${fromSeatNumber}, '${userEmail}')" style="padding:8px 16px;background:#007bff;color:white;border:none;border-radius:4px;cursor:pointer;">Move User</button>
                </div>
            </div>
        </div>
    `;

    document.body.insertAdjacentHTML('beforeend', dialog);
}

function closeMoveUserDialog() {
    const dialog = document.getElementById('moveUserDialog');
    if (dialog) {
        dialog.remove();
    }
}

async function executeMoveUser(fromTableId, fromSeatNumber, userEmail) {
    const targetTable = document.getElementById('targetTable').value;
    const targetSeat = parseInt(document.getElementById('targetSeat').value);

    // Check if user is trying to move to the same seat
    if (fromTableId === targetTable && fromSeatNumber === targetSeat) {
        alert('User is already in this seat!');
        return;
    }

    // Check if target seat is available
    try {
        const { data: targetSeatData, error } = await supabase
            .from('occupancy')
            .select('is_occupied, occupied_by')
            .eq('table_id', targetTable)
            .eq('seat_number', targetSeat)
            .single();

        if (error) {
            alert('Error checking target seat: ' + error.message);
            return;
        }

        if (targetSeatData && targetSeatData.is_occupied) {
            if (!confirm(`Target seat is currently occupied by ${targetSeatData.occupied_by}. Do you want to force the move?`)) {
                return;
            }
        }

        // Perform the switch
        const result = await switchUserTable(userEmail, fromTableId, fromSeatNumber, targetTable, targetSeat);

        if (result.success) {
            alert(result.message);
            closeMoveUserDialog();
            viewOccupancy();
            updateOccupancyChart();
        } else {
            alert('Error: ' + result.message);
        }

    } catch (error) {
        console.error('Error in executeMoveUser:', error);
        alert('Error moving user: ' + error.message);
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ========== REPORTS OVERVIEW ==========

let currentReportsFilter = 'today';
let reportsOverviewChart = null;

// Initialize Reports Overview
function initReportsOverview() {
    refreshReportsOverview();
}

// Filter reports by time period
function filterReportsOverview(filter) {
    currentReportsFilter = filter;

    // Update active button state
    document.querySelectorAll('.reports-filter-btn[data-filter]').forEach(btn => {
        if (btn.getAttribute('data-filter') === filter) {
            btn.classList.add('active');
        } else {
            btn.classList.remove('active');
        }
    });

    refreshReportsOverview();
}

// Refresh reports overview data
async function refreshReportsOverview() {
    try {
        // Calculate date range based on filter
        let startDate;
        const now = new Date();

        switch (currentReportsFilter) {
            case 'today':
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'week':
                startDate = new Date(now);
                startDate.setDate(now.getDate() - 7);
                startDate.setHours(0, 0, 0, 0);
                break;
            case 'all':
                startDate = null; // No filter
                break;
            default:
                startDate = new Date(now);
                startDate.setHours(0, 0, 0, 0);
        }

        // Build query
        let query = supabase
            .from('student_reports')
            .select('report_type, created_at');

        if (startDate) {
            query = query.gte('created_at', startDate.toISOString());
        }

        const { data: reports, error } = await query;

        if (error) throw error;

        // Count by category
        const categoryCounts = {
            issue: 0,
            feedback: 0,
            complaint: 0,
            suggestion: 0,
            other: 0
        };

        let latestTimestamp = null;

        (reports || []).forEach(report => {
            const type = report.report_type || 'other';
            if (categoryCounts.hasOwnProperty(type)) {
                categoryCounts[type]++;
            } else {
                categoryCounts.other++;
            }

            // Track latest timestamp
            const reportDate = new Date(report.created_at);
            if (!latestTimestamp || reportDate > latestTimestamp) {
                latestTimestamp = reportDate;
            }
        });

        // Update category breakdown
        document.getElementById('issueCount').textContent = categoryCounts.issue;
        document.getElementById('feedbackCount').textContent = categoryCounts.feedback;
        document.getElementById('complaintCount').textContent = categoryCounts.complaint;
        document.getElementById('suggestionCount').textContent = categoryCounts.suggestion;
        document.getElementById('otherCount').textContent = categoryCounts.other;

        // Update total count badge
        const total = Object.values(categoryCounts).reduce((sum, count) => sum + count, 0);
        document.getElementById('reportsTotal').textContent = total;

        // Update last updated timestamp
        const lastUpdatedEl = document.getElementById('reportsLastUpdated');
        if (latestTimestamp) {
            const timeAgo = getTimeAgo(latestTimestamp);
            lastUpdatedEl.textContent = `Latest: ${timeAgo}`;
        } else {
            lastUpdatedEl.textContent = 'No reports';
        }

        // Update chart
        updateReportsChart(categoryCounts);

    } catch (err) {
        console.error('Error loading reports overview:', err);
        document.getElementById('reportsLastUpdated').textContent = 'Error loading data';
    }
}

// Update or create the reports chart
function updateReportsChart(categoryCounts) {
    const ctx = document.getElementById('reportsChart');
    if (!ctx) return;

    const chartData = {
        labels: ['Issues', 'Feedback', 'Complaints', 'Suggestions', 'Other'],
        datasets: [{
            label: 'Reports',
            data: [
                categoryCounts.issue,
                categoryCounts.feedback,
                categoryCounts.complaint,
                categoryCounts.suggestion,
                categoryCounts.other
            ],
            backgroundColor: [
                'rgba(147, 51, 234, 0.8)',   // Purple for Issues
                'rgba(245, 158, 11, 0.8)',   // Amber for Feedback
                'rgba(239, 68, 68, 0.8)',    // Red for Complaints
                'rgba(34, 197, 94, 0.8)',    // Green for Suggestions
                'rgba(107, 114, 128, 0.8)'   // Gray for Other
            ],
            borderColor: [
                'rgb(147, 51, 234)',
                'rgb(245, 158, 11)',
                'rgb(239, 68, 68)',
                'rgb(34, 197, 94)',
                'rgb(107, 114, 128)'
            ],
            borderWidth: 2
        }]
    };

    const config = {
        type: 'bar',
        data: chartData,
        options: {
            responsive: true,
            maintainAspectRatio: true,
            aspectRatio: 2.5,
            plugins: {
                legend: {
                    display: false
                },
                title: {
                    display: true,
                    text: `Report Distribution - ${currentReportsFilter === 'today' ? 'Today' : currentReportsFilter === 'week' ? 'This Week' : 'All Time'}`,
                    font: {
                        size: 14,
                        weight: '600'
                    },
                    color: getThemeColors().textColor
                },
                tooltip: {
                    backgroundColor: getThemeColors().tooltipBg,
                    titleColor: getThemeColors().tooltipText,
                    bodyColor: getThemeColors().tooltipText,
                    borderColor: getThemeColors().gridColor,
                    borderWidth: 1,
                    callbacks: {
                        label: function (context) {
                            return context.parsed.y + ' report' + (context.parsed.y === 1 ? '' : 's');
                        }
                    }
                }
            },
            scales: {
                y: {
                    beginAtZero: true,
                    ticks: {
                        stepSize: 1,
                        precision: 0,
                        color: getThemeColors().textColor
                    },
                    grid: {
                        color: getThemeColors().gridColor
                    }
                },
                x: {
                    ticks: {
                        color: getThemeColors().textColor
                    },
                    grid: {
                        display: false
                    }
                }
            }
        }
    };

    // Destroy existing chart if it exists
    if (reportsOverviewChart) {
        reportsOverviewChart.destroy();
    }

    // Create new chart
    reportsOverviewChart = new Chart(ctx, config);
}

// Helper function to get relative time
function getTimeAgo(date) {
    const now = new Date();
    const diffMs = now - date;
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMs / 3600000);
    const diffDays = Math.floor(diffMs / 86400000);

    if (diffMins < 1) return 'Just now';
    if (diffMins === 1) return '1 minute ago';
    if (diffMins < 60) return `${diffMins} minutes ago`;
    if (diffHours === 1) return '1 hour ago';
    if (diffHours < 24) return `${diffHours} hours ago`;
    if (diffDays === 1) return 'Yesterday';
    if (diffDays < 7) return `${diffDays} days ago`;
    return date.toLocaleDateString();
}
