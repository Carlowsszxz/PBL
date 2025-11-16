// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Function to toggle search form visibility
function toggleSearch() {
    const searchForm = document.getElementById('searchForm');
    const searchToggle = document.getElementById('searchToggle');

    if (!searchForm.style.display || searchForm.style.display === 'grid') {
        searchForm.style.display = 'none';
        searchToggle.textContent = 'Show Search';
    } else {
        searchForm.style.display = 'grid';
        searchToggle.textContent = 'Hide Search';
    }
}

// Check if user is admin on page load
document.addEventListener('DOMContentLoaded', async function () {
    // Initialize search form state
    const searchForm = document.getElementById('searchForm');
    const searchToggle = document.getElementById('searchToggle');

    if (searchForm) {
        searchForm.style.display = 'grid';  // Show the form by default
    }

    if (searchToggle) {
        searchToggle.textContent = 'Hide Search';
    }

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

    // Initialize polling for logs
    initializeLogPolling();

    // User is admin, load logs automatically
    viewLogs();
});

let currentFilters = null;

function initializeLogPolling() {
    // Set polling interval (5 seconds)
    const POLL_INTERVAL = 5000;

    // Initial load
    viewLogs(currentFilters);

    // Set up polling interval
    let pollInterval = setInterval(() => {
        viewLogs(currentFilters);
    }, POLL_INTERVAL);

    // Handle page visibility changes
    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            // Clear interval when page is hidden
            clearInterval(pollInterval);
        } else {
            // Reload data and restart polling when page becomes visible
            viewLogs(currentFilters);
            pollInterval = setInterval(() => {
                viewLogs(currentFilters);
            }, POLL_INTERVAL);
        }
    });
}

async function viewLogs(filters = null) {
    try {
        currentFilters = filters;

        // Build query
        let query = supabase
            .from('actlog_iot')
            .select('*');

        // Apply filters if provided
        if (filters) {
            if (filters.userName) {
                // Use ilike for case-insensitive partial match
                query = query.ilike('name', '%' + filters.userName + '%');
            }

            if (filters.event && filters.event !== '') {
                query = query.eq('event', filters.event);
            }

            if (filters.dateFrom) {
                query = query.gte('created_at', filters.dateFrom);
            }

            if (filters.dateTo) {
                // Add one day to include the entire end date
                const endDate = new Date(filters.dateTo);
                endDate.setHours(23, 59, 59, 999);
                query = query.lte('created_at', endDate.toISOString());
            }

            if (filters.seat && filters.seat !== '') {
                query = query.eq('seat_number', parseInt(filters.seat));
            }

            if (filters.rfid && filters.rfid !== '') {
                query = query.ilike('uid', '%' + filters.rfid + '%');
            }

            if (filters.noiseMin !== null && filters.noiseMin !== '') {
                query = query.gte('decibel', parseFloat(filters.noiseMin));
            }

            if (filters.noiseMax !== null && filters.noiseMax !== '') {
                query = query.lte('decibel', parseFloat(filters.noiseMax));
            }
        }

        // Order by date descending and limit
        query = query.order('created_at', { ascending: false }).limit(500);

        const { data: logs, error } = await query;

        if (error) throw error;

        // Show search info if filters are active
        const searchInfo = document.getElementById('searchInfo');
        if (filters && hasActiveFilters(filters)) {
            const filterCount = countActiveFilters(filters);
            searchInfo.classList.remove('hidden');
            searchInfo.innerHTML = `🔍 Showing filtered results (${logs ? logs.length : 0} event${logs && logs.length !== 1 ? 's' : ''} found) - ${filterCount} filter${filterCount !== 1 ? 's' : ''} applied. <a href="javascript:void(0)" onclick="clearSearch()" style="color:#007bff;text-decoration:underline;">Clear filters</a>`;
        } else {
            searchInfo.classList.add('hidden');
        }

        if (!logs || logs.length === 0) {
            if (filters && hasActiveFilters(filters)) {
                document.getElementById('logData').innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No events found matching your search criteria.</p>';
            } else {
                document.getElementById('logData').innerHTML = '<p style="padding:20px;text-align:center;color:#666;">No events yet.</p>';
            }
            return;
        }

        let html = '<table class="logs-table"><thead><tr><th>Time</th><th>Event</th><th>User</th><th>Seat</th><th>Noise (dB)</th><th>RFID UID</th><th>Actions</th></tr></thead><tbody>';

        logs.forEach(log => {
            const time = new Date(log.created_at).toLocaleString();
            const eventText = log.event === 'login' ? 'LOGIN' : log.event === 'logout' ? 'LOGOUT' : log.event.toUpperCase();
            const eventClass = log.event === 'login' ? 'event-login' : log.event === 'logout' ? 'event-logout' : 'event-noise';

            html += '<tr>';
            html += '<td>' + time + '</td>';
            html += '<td class="' + eventClass + '">' + escapeHtml(eventText) + '</td>';
            html += '<td>' + escapeHtml(log.name || 'N/A') + '</td>';
            html += '<td>' + (log.seat_number ? 'Seat ' + log.seat_number : '-') + '</td>';
            html += '<td>' + (log.decibel !== null && log.decibel !== undefined ? log.decibel + ' dB' : '-') + '</td>';
            html += '<td>' + escapeHtml(log.uid || 'N/A') + '</td>';
            html += '<td><button onclick="deleteLog(\'' + log.id + '\')" class="delete-btn px-3 py-1 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors duration-200 flex items-center gap-1"><i data-lucide="trash-2" class="w-3 h-3"></i><span class="text-xs">Delete</span></button></td>';
            html += '</tr>';
        });

        html += '</tbody></table>';
        document.getElementById('logData').innerHTML = html;
        if (window.lucide) lucide.createIcons();
    } catch (err) {
        console.error('Error loading logs:', err);
        document.getElementById('logData').innerHTML = '<p style="color:red;padding:20px;">Error loading logs: ' + err.message + '</p>';
    }
}

function toggleSearch() {
    const form = document.getElementById('searchForm');
    const toggle = document.getElementById('searchToggle');
    form.classList.toggle('active');
    toggle.classList.toggle('active');

    if (form.classList.contains('active')) {
        toggle.textContent = '✖️ Close Search';
    } else {
        toggle.textContent = '🔍 Advanced Search';
    }
}

function performSearch() {
    const filters = {
        userName: document.getElementById('searchUserName').value.trim(),
        event: document.getElementById('searchEvent').value,
        dateFrom: document.getElementById('searchDateFrom').value,
        dateTo: document.getElementById('searchDateTo').value,
        seat: document.getElementById('searchSeat').value.trim(),
        rfid: document.getElementById('searchRfid').value.trim(),
        noiseMin: document.getElementById('searchNoiseMin').value.trim(),
        noiseMax: document.getElementById('searchNoiseMax').value.trim()
    };

    // Convert empty strings to null for cleaner checks
    Object.keys(filters).forEach(key => {
        if (filters[key] === '') {
            filters[key] = null;
        }
    });

    // Convert datetime-local to ISO string
    if (filters.dateFrom) {
        filters.dateFrom = new Date(filters.dateFrom).toISOString();
    }
    if (filters.dateTo) {
        filters.dateTo = new Date(filters.dateTo).toISOString();
    }

    viewLogs(filters);
}

function clearSearch() {
    document.getElementById('searchUserName').value = '';
    document.getElementById('searchEvent').value = '';
    document.getElementById('searchDateFrom').value = '';
    document.getElementById('searchDateTo').value = '';
    document.getElementById('searchSeat').value = '';
    document.getElementById('searchRfid').value = '';
    document.getElementById('searchNoiseMin').value = '';
    document.getElementById('searchNoiseMax').value = '';

    currentFilters = null;
    viewLogs();
}

function hasActiveFilters(filters) {
    return Object.values(filters).some(val => val !== null && val !== '');
}

function countActiveFilters(filters) {
    return Object.values(filters).filter(val => val !== null && val !== '').length;
}

function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

async function logout() {
    // Sign out from Supabase Auth
    await supabase.auth.signOut();

    // Clear session storage
    sessionStorage.removeItem('userEmail');

    // Redirect to login
    window.location.href = 'login.html';
}

// Sidebar toggle functionality
document.addEventListener('DOMContentLoaded', function () {
    const sidebarToggle = document.getElementById('sidebarToggle');
    const adminSidebar = document.getElementById('adminSidebar');
    const body = document.body;
    if (sidebarToggle && adminSidebar) {
        sidebarToggle.addEventListener('click', function () {
            const isOpen = adminSidebar.classList.toggle('sidebar-open');
            body.classList.toggle('sidebar-open');
            sidebarToggle.setAttribute('aria-expanded', isOpen.toString());
        });
        body.addEventListener('click', function (e) {
            if (window.innerWidth <= 768 && body.classList.contains('sidebar-open')) {
                if (!adminSidebar.contains(e.target) && !sidebarToggle.contains(e.target)) {
                    adminSidebar.classList.remove('sidebar-open');
                    body.classList.remove('sidebar-open');
                    sidebarToggle.setAttribute('aria-expanded', 'false');
                }
            }
        });
        document.addEventListener('keydown', function (e) {
            if (e.key === 'Escape' && body.classList.contains('sidebar-open')) {
                adminSidebar.classList.remove('sidebar-open');
                body.classList.remove('sidebar-open');
                sidebarToggle.setAttribute('aria-expanded', 'false');
                sidebarToggle.focus();
            }
        });
    }
    if (window.lucide) lucide.createIcons();
});

// Delete all logs function
async function deleteAllLogs() {
    if (!confirm('Are you sure you want to delete all logs? This action cannot be undone.')) {
        return;
    }
    try {
        const { error } = await supabase.from('actlog_iot').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        if (error) throw error;
        alert('All logs deleted successfully.');
        viewLogs(); // Reload the logs
    } catch (err) {
        console.error('Error deleting all logs:', err);
        alert('Error deleting logs: ' + err.message);
    }
}

// Delete individual log function
async function deleteLog(logId) {
    if (!confirm('Are you sure you want to delete this log entry?')) {
        return;
    }
    try {
        const { error } = await supabase.from('actlog_iot').delete().eq('id', logId);
        if (error) throw error;
        viewLogs(); // Reload the logs
    } catch (err) {
        console.error('Error deleting log:', err);
        alert('Error deleting log: ' + err.message);
    }
}

