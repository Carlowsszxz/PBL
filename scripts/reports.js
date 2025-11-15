// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

let currentUserId = null;
let allReports = [];
let currentView = 'my'; // 'my' or 'all'
let isCurrentUserAdmin = false;

// Quick Templates
const templates = {
    noise: {
        type: 'complaint',
        title: 'Excessive Noise Disturbance',
        description: 'There is excessive noise coming from [specify location/seat]. The noise level is making it difficult to concentrate on my studies. This occurred at [time] on [date].'
    },
    lights: {
        type: 'issue',
        title: 'Lighting Problem',
        description: 'The light at [seat/area number] is [flickering/not working/too dim]. This is affecting my ability to read and study properly. Location: [specific area].'
    },
    ac: {
        type: 'issue',
        title: 'Air Conditioning/Temperature Issue',
        description: 'The temperature in [area/section] is [too cold/too hot]. The AC seems to be [not working/set too high/set too low]. This is making it uncomfortable to study.'
    },
    furniture: {
        type: 'issue',
        title: 'Furniture Damage or Issue',
        description: 'The [chair/table/desk] at seat [number] is [broken/wobbly/damaged]. Specifically, [describe the problem]. This needs repair or replacement.'
    },
    wifi: {
        type: 'issue',
        title: 'WiFi Connectivity Problem',
        description: 'I am experiencing [no connection/slow internet/intermittent connectivity] in [area/section]. This started at approximately [time]. Network name: [if known].'
    },
    cleaning: {
        type: 'complaint',
        title: 'Cleaning/Maintenance Request',
        description: 'The [area/restroom/desk] at [location] needs cleaning/maintenance. Issue: [describe what needs attention]. This was noticed at [time].'
    }
};

// Check authentication on page load
document.addEventListener('DOMContentLoaded', async function () {
    // Setup character counter
    const descriptionTextarea = document.getElementById('reportDescription');
    const charCount = document.getElementById('charCount');

    descriptionTextarea.addEventListener('input', function () {
        const count = this.value.length;
        charCount.textContent = `${count}/500`;

        if (count >= 500) {
            charCount.classList.add('text-red-600');
            charCount.classList.remove('text-gray-500');
        } else {
            charCount.classList.add('text-gray-500');
            charCount.classList.remove('text-red-600');
        }
    });

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
        console.log('No user found, redirecting to login...');
        window.location.href = 'login.html';
        return;
    }

    // Verify user exists in database and get user ID
    const { data: existingUser, error: userError } = await supabase
        .from('users')
        .select('id, is_admin')
        .eq('email', userEmail)
        .single();

    if (userError || !existingUser) {
        // User was deleted, clear everything and redirect
        console.log('User was deleted from database, signing out...');
        await supabase.auth.signOut();
        sessionStorage.removeItem('userEmail');
        window.location.href = 'login.html';
        return;
    }

    // Store admin status for later use
    isCurrentUserAdmin = existingUser.is_admin === true;

    currentUserId = existingUser.id;

    // Update daily limit indicator
    await updateDailyLimitUI();

    // Load submitted reports
    await loadMyReports();

    // Re-initialize Lucide icons after content is loaded
    setTimeout(() => {
        lucide.createIcons();
    }, 100);

    // Prevent navigation away from student pages
    setupNavigationGuard();
});

// Use template function
function useTemplate(templateName) {
    const template = templates[templateName];
    if (!template) return;

    document.getElementById('reportType').value = template.type;
    document.getElementById('reportTitle').value = template.title;
    document.getElementById('reportDescription').value = template.description;

    // Update character count
    const charCount = document.getElementById('charCount');
    charCount.textContent = `${template.description.length}/500`;

    // Re-initialize Lucide icons
    setTimeout(() => {
        lucide.createIcons();
    }, 50);
}

// Check daily report submission limit
async function checkDailyLimit() {
    if (!currentUserId) return { canSubmit: false, remaining: 0, count: 0 };

    const DAILY_LIMIT = 3;

    // Get start of today in user's timezone
    const today = new Date();
    today.setHours(0, 0, 0, 0);
    const todayISO = today.toISOString();

    try {
        const { data, error, count } = await supabase
            .from('student_reports')
            .select('id', { count: 'exact', head: false })
            .eq('user_id', currentUserId)
            .gte('created_at', todayISO);

        if (error) {
            console.error('Error checking daily limit:', error);
            return { canSubmit: true, remaining: DAILY_LIMIT, count: 0 }; // Fail open
        }

        const reportsToday = count || 0;
        const remaining = Math.max(0, DAILY_LIMIT - reportsToday);
        const canSubmit = reportsToday < DAILY_LIMIT;

        return { canSubmit, remaining, count: reportsToday };
    } catch (err) {
        console.error('Error checking daily limit:', err);
        return { canSubmit: true, remaining: DAILY_LIMIT, count: 0 }; // Fail open
    }
}

// Update daily limit UI indicator
async function updateDailyLimitUI() {
    const limitInfo = await checkDailyLimit();
    const limitIndicator = document.getElementById('dailyLimitIndicator');

    if (!limitIndicator) return;

    if (limitInfo.canSubmit) {
        if (limitInfo.remaining === 3) {
            limitIndicator.innerHTML = `
                <div class="flex items-center gap-2 text-sm text-gray-600">
                    <i data-lucide="info" class="w-4 h-4"></i>
                    <span>You can submit up to <strong>3 reports</strong> per day</span>
                </div>`;
        } else {
            limitIndicator.innerHTML = `
                <div class="flex items-center gap-2 text-sm ${limitInfo.remaining === 1 ? 'text-amber-700' : 'text-blue-600'}">
                    <i data-lucide="alert-circle" class="w-4 h-4"></i>
                    <span><strong>${limitInfo.remaining}</strong> report${limitInfo.remaining === 1 ? '' : 's'} remaining today</span>
                </div>`;
        }
        limitIndicator.classList.remove('hidden');
    } else {
        limitIndicator.innerHTML = `
            <div class="flex items-center gap-2 text-sm text-red-600 bg-red-50 border border-red-200 rounded-lg p-3">
                <i data-lucide="octagon-x" class="w-5 h-5"></i>
                <span><strong>Daily limit reached:</strong> You've submitted 3 reports today. Please try again tomorrow.</span>
            </div>`;
        limitIndicator.classList.remove('hidden');
    }

    // Re-initialize Lucide icons
    setTimeout(() => {
        lucide.createIcons();
    }, 50);
}

async function submitReport() {
    const errorDiv = document.getElementById('reportError');
    const successDiv = document.getElementById('reportSuccess');
    const reportForm = document.getElementById('reportForm');
    const submitBtn = document.querySelector('#reportForm button[type="submit"]');

    // Clear previous messages
    errorDiv.textContent = '';
    errorDiv.classList.add('hidden');
    successDiv.textContent = '';
    successDiv.classList.add('hidden');

    if (!currentUserId) {
        errorDiv.textContent = 'Error: User not found. Please log in again.';
        errorDiv.classList.remove('hidden');
        return;
    }

    // Check daily limit before submission
    const limitInfo = await checkDailyLimit();
    if (!limitInfo.canSubmit) {
        errorDiv.textContent = '⛔ Daily limit reached: You can only submit 3 reports per day. Please try again tomorrow.';
        errorDiv.classList.remove('hidden');

        // Disable submit button
        if (submitBtn) {
            submitBtn.disabled = true;
            submitBtn.classList.add('opacity-50', 'cursor-not-allowed');
        }

        // Update UI indicator
        await updateDailyLimitUI();
        return;
    }

    const reportType = document.getElementById('reportType').value;
    const title = document.getElementById('reportTitle').value.trim();
    const description = document.getElementById('reportDescription').value.trim();

    if (!reportType || !title || !description) {
        errorDiv.textContent = 'Please fill in all fields.';
        errorDiv.classList.remove('hidden');
        return;
    }

    if (description.length < 20) {
        errorDiv.textContent = 'Description must be at least 20 characters.';
        errorDiv.classList.remove('hidden');
        return;
    }

    try {
        const { data, error } = await supabase
            .from('student_reports')
            .insert([
                {
                    user_id: currentUserId,
                    report_type: reportType,
                    title: title,
                    description: description,
                    status: 'pending'
                }
            ])
            .select();

        if (error) throw error;

        // Success
        successDiv.textContent = '✓ Report submitted successfully!';
        successDiv.classList.remove('hidden');
        reportForm.reset();

        // Reset character counter
        document.getElementById('charCount').textContent = '0/500';

        // Update daily limit UI
        await updateDailyLimitUI();

        // Reload reports list
        await loadMyReports();

        // Re-initialize Lucide icons
        setTimeout(() => {
            lucide.createIcons();
        }, 100);

        // Clear success message after 3 seconds
        setTimeout(() => {
            successDiv.textContent = '';
            successDiv.classList.add('hidden');
        }, 3000);

    } catch (err) {
        console.error('Error submitting report:', err);
        errorDiv.textContent = 'Error submitting report: ' + (err.message || 'Unknown error');
        errorDiv.classList.remove('hidden');
    }
}

async function loadMyReports() {
    const reportsListDiv = document.getElementById('reportsList');

    if (!currentUserId) {
        reportsListDiv.innerHTML = '<p class="text-gray-500 text-center py-8">Error: User not found.</p>';
        return;
    }

    try {
        const { data: reports, error } = await supabase
            .from('student_reports')
            .select('*')
            .eq('user_id', currentUserId)
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Store reports globally for filtering
        allReports = reports || [];

        // Update statistics
        updateStatistics(allReports);

        // Apply current filters
        applyFilters();

    } catch (err) {
        console.error('Error loading reports:', err);
        reportsListDiv.innerHTML = '<p class="text-red-500 text-center py-8">Error loading reports: ' + (err.message || 'Unknown error') + '</p>';
    }
}

async function loadAllReports() {
    const reportsListDiv = document.getElementById('reportsList');

    try {
        // Fetch all reports with user information
        const { data: reports, error: reportsError } = await supabase
            .from('student_reports')
            .select('*')
            .order('created_at', { ascending: false });

        if (reportsError) throw reportsError;

        if (!reports || reports.length === 0) {
            allReports = [];
            updateStatistics(allReports);
            applyFilters();
            return;
        }

        // Get unique user IDs
        const userIds = [...new Set(reports.map(r => r.user_id))];

        // Fetch user information
        const { data: users, error: usersError } = await supabase
            .from('users')
            .select('id, first_name, last_name, email')
            .in('id', userIds);

        if (usersError) throw usersError;

        // Create a map of user info
        const userMap = {};
        (users || []).forEach(user => {
            userMap[user.id] = {
                first_name: user.first_name,
                last_name: user.last_name,
                email: user.email
            };
        });

        // Store reports globally for filtering with user info
        allReports = (reports || []).map(report => ({
            ...report,
            user_info: userMap[report.user_id] || null
        }));

        // Update statistics
        updateStatistics(allReports);

        // Apply current filters
        applyFilters();

    } catch (err) {
        console.error('Error loading all reports:', err);
        reportsListDiv.innerHTML = '<p class="text-red-500 text-center py-8">Error loading reports: ' + (err.message || 'Unknown error') + '</p>';
    }
}

function switchToMyReports() {
    currentView = 'my';
    updateTabStyles();
    loadMyReports();
}

function switchToAllReports() {
    currentView = 'all';
    updateTabStyles();
    loadAllReports();
}

function updateTabStyles() {
    const myTab = document.getElementById('tabMyReports');
    const allTab = document.getElementById('tabAllReports');

    if (currentView === 'my') {
        myTab.classList.add('active');
        allTab.classList.remove('active');
    } else {
        allTab.classList.add('active');
        myTab.classList.remove('active');
    }
    
    // Update tab text to indicate anonymization for non-admin users
    if (!isCurrentUserAdmin) {
        allTab.innerHTML = `
            <span class="flex items-center gap-2">
                Show All Reports
                <i data-lucide="eye-off" class="w-3 h-3" title="Names are anonymized for privacy"></i>
            </span>
        `;
        // Re-initialize Lucide icons
        setTimeout(() => {
            lucide.createIcons();
        }, 50);
    }
}

function refreshReports() {
    if (currentView === 'my') {
        loadMyReports();
    } else {
        loadAllReports();
    }
}

function updateStatistics(reports) {
    const total = reports.length;
    const pending = reports.filter(r => r.status === 'pending' || r.status === 'reviewing').length;
    const resolved = reports.filter(r => r.status === 'resolved').length;

    document.getElementById('totalCount').textContent = total;
    document.getElementById('pendingCount').textContent = pending;
    document.getElementById('resolvedCount').textContent = resolved;
}

function applyFilters() {
    const reportsListDiv = document.getElementById('reportsList');
    const filterStatus = document.getElementById('filterStatus').value;
    const sortBy = document.getElementById('sortBy').value;

    let filteredReports = [...allReports];

    // Apply status filter
    if (filterStatus !== 'all') {
        filteredReports = filteredReports.filter(r => r.status === filterStatus);
    }

    // Apply sorting
    if (sortBy === 'newest') {
        filteredReports.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } else if (sortBy === 'oldest') {
        filteredReports.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    } else if (sortBy === 'status') {
        const statusOrder = { pending: 0, reviewing: 1, resolved: 2, dismissed: 3 };
        filteredReports.sort((a, b) => statusOrder[a.status] - statusOrder[b.status]);
    }

    // Display filtered reports
    displayReports(filteredReports);
}

function displayReports(reports) {
    const reportsListDiv = document.getElementById('reportsList');

    if (!reports || reports.length === 0) {
        reportsListDiv.innerHTML = `
            <div class="text-center py-12">
                <div class="text-6xl mb-4">📭</div>
                <h3 class="text-xl font-semibold text-gray-700 mb-2">No reports found</h3>
                <p class="text-gray-500 text-sm">
                    ${allReports.length === 0
                ? (currentView === 'my'
                    ? 'Your feedback helps us improve! Submit your first report above.'
                    : 'No reports have been submitted yet.')
                : 'Try adjusting your filters to see more reports.'}
                </p>
            </div>
        `;
        return;
    }

    let html = '';
    
    // Add privacy notice for non-admin users viewing all reports
    if (currentView === 'all' && !isCurrentUserAdmin) {
        html += `
            <div class="mb-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
                <div class="flex items-start gap-3">
                    <div class="flex-shrink-0">
                        <i data-lucide="shield-check" class="w-5 h-5 text-blue-600 mt-0.5"></i>
                    </div>
                    <div>
                        <h4 class="font-medium text-blue-900 mb-1">Privacy Protected</h4>
                        <p class="text-sm text-blue-800">
                            Student names are anonymized to protect privacy. Each user is assigned a consistent anonymous ID.
                        </p>
                    </div>
                </div>
            </div>
        `;
    }
    reports.forEach((report, index) => {
        const statusIcon = getStatusIcon(report.status);
        const statusProgress = getStatusProgress(report.status);
        const typeIcon = getTypeIcon(report.report_type);
        const timeAgo = getTimeAgo(report.created_at);
        const replyTimeAgo = report.replied_at ? getTimeAgo(report.replied_at) : null;

        // Get user info for "Show All Reports" view
        let userInfoHtml = '';
        if (currentView === 'all' && report.user_info) {
            let displayName;
            
            if (isCurrentUserAdmin) {
                // Admin can see real names
                displayName = `${report.user_info.first_name || ''} ${report.user_info.last_name || ''}`.trim() || report.user_info.email || 'Unknown User';
            } else {
                // Non-admin users see anonymous names
                const anonymousId = generateAnonymousId(report.user_id);
                displayName = `Anonymous User ${anonymousId}`;
            }
            
            userInfoHtml = `
                <div class="mb-2 flex items-center gap-2 text-sm text-gray-600">
                    <i data-lucide="user" class="w-3 h-3"></i>
                    <span class="font-medium">${escapeHtml(displayName)}</span>
                    ${!isCurrentUserAdmin ? '<i data-lucide="eye-off" class="w-3 h-3 text-gray-400" title="Identity protected"></i>' : ''}
                </div>
            `;
        }

        html += `
            <div class="bg-white rounded-xl border border-gray-200 p-5 hover:shadow-lg transition-all duration-300" id="report-${report.id}">
                <!-- Header -->
                <div class="flex items-start justify-between mb-3">
                    <div class="flex-1">
                        <div class="flex items-center gap-2 mb-2">
                            <span class="text-2xl">${typeIcon}</span>
                            <h3 class="font-bold text-gray-900">${escapeHtml(report.title)}</h3>
                        </div>
                        ${userInfoHtml}
                    </div>
                    <span class="report-status-badge status-${report.status}">
                        ${statusIcon} ${report.status.charAt(0).toUpperCase() + report.status.slice(1)}
                    </span>
                </div>
                
                <!-- Progress Bar -->
                <div class="mb-4">
                    <div class="flex items-center justify-between text-xs text-gray-500 mb-1">
                        <span>Submitted</span>
                        <span>Reviewing</span>
                        <span>Resolved</span>
                    </div>
                    <div class="h-2 bg-gray-200 rounded-full overflow-hidden">
                        <div class="h-full bg-gradient-to-r from-indigo-500 to-purple-500 transition-all duration-500" 
                             style="width: ${statusProgress}%"></div>
                    </div>
                </div>
                
                <!-- Timestamps -->
                <div class="text-sm text-gray-600 mb-3 flex items-center gap-4">
                    <span class="flex items-center gap-1">
                        <i data-lucide="clock" class="w-3 h-3"></i>
                        ${timeAgo}
                    </span>
                    ${report.updated_at && report.updated_at !== report.created_at ? `
                    <span class="flex items-center gap-1">
                        <i data-lucide="refresh-cw" class="w-3 h-3"></i>
                        Updated ${getTimeAgo(report.updated_at)}
                    </span>
                    ` : ''}
                </div>
                
                <!-- Description (Collapsible) -->
                <div class="mb-3">
                    <button onclick="toggleDescription('${report.id}')" 
                            class="text-sm font-medium text-indigo-600 hover:text-indigo-700 flex items-center gap-1">
                        <i data-lucide="chevron-down" class="w-4 h-4" id="chevron-${report.id}"></i>
                        View Details
                    </button>
                    <div id="desc-${report.id}" class="hidden mt-2 p-3 bg-gray-50 rounded-lg text-sm text-gray-700 leading-relaxed">
                        ${escapeHtml(report.description)}
                    </div>
                </div>
                
                <!-- Admin Reply -->
                ${report.admin_reply ? `
                <div class="mt-3 p-4 bg-gradient-to-br from-blue-50 to-indigo-50 border-l-4 border-indigo-500 rounded-lg">
                    <div class="flex items-center gap-2 mb-2">
                        <i data-lucide="message-circle" class="w-4 h-4 text-indigo-600"></i>
                        <span class="font-semibold text-indigo-900">Admin Reply</span>
                        ${replyTimeAgo ? `<span class="text-xs text-indigo-600">(${replyTimeAgo})</span>` : ''}
                    </div>
                    <p class="text-sm text-gray-700 leading-relaxed whitespace-pre-wrap">${escapeHtml(report.admin_reply)}</p>
                </div>
                ` : `
                <div class="mt-3 p-3 bg-amber-50 border-l-4 border-amber-400 rounded-lg flex items-center gap-2">
                    <i data-lucide="hourglass" class="w-4 h-4 text-amber-600"></i>
                    <span class="text-sm text-amber-800">Waiting for admin response...</span>
                </div>
                `}
            </div>
        `;
    });

    reportsListDiv.innerHTML = html;

    // Re-initialize Lucide icons
    setTimeout(() => {
        lucide.createIcons();
    }, 50);
}

function toggleDescription(reportId) {
    const desc = document.getElementById(`desc-${reportId}`);
    const chevron = document.getElementById(`chevron-${reportId}`);

    if (desc.classList.contains('hidden')) {
        desc.classList.remove('hidden');
        chevron.style.transform = 'rotate(180deg)';
    } else {
        desc.classList.add('hidden');
        chevron.style.transform = 'rotate(0deg)';
    }
}

function getStatusIcon(status) {
    const icons = {
        pending: '⏳',
        reviewing: '🔍',
        resolved: '✅',
        dismissed: '❌'
    };
    return icons[status] || '📋';
}

function getStatusProgress(status) {
    const progress = {
        pending: 33,
        reviewing: 66,
        resolved: 100,
        dismissed: 100
    };
    return progress[status] || 0;
}

function getTypeIcon(type) {
    const icons = {
        issue: '🔧',
        feedback: '💬',
        complaint: '⚠️',
        suggestion: '💡',
        other: '📋'
    };
    return icons[type] || '📋';
}

function getTimeAgo(dateString) {
    const date = new Date(dateString);
    const now = new Date();
    const seconds = Math.floor((now - date) / 1000);

    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return Math.floor(seconds / 60) + ' mins ago';
    if (seconds < 86400) return Math.floor(seconds / 3600) + ' hours ago';
    if (seconds < 604800) return Math.floor(seconds / 86400) + ' days ago';

    return date.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDate(dateString) {
    const date = new Date(dateString);
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function generateAnonymousId(userId) {
    // Create a simple hash of the user ID to generate consistent anonymous IDs
    // This ensures the same user always gets the same anonymous ID
    let hash = 0;
    const str = userId.toString();
    for (let i = 0; i < str.length; i++) {
        const char = str.charCodeAt(i);
        hash = ((hash << 5) - hash) + char;
        hash = hash & hash; // Convert to 32-bit integer
    }
    // Return a positive number between 1-999
    return Math.abs(hash % 999) + 1;
}

// Store beforeunload handler so we can remove it on logout
let beforeUnloadHandler = null;

// ================================================================
// ====== Navigation Guard for Students ======
function setupNavigationGuard() {
    // Prevent browser back/forward navigation to login or admin pages
    window.addEventListener('popstate', function (event) {
        const userEmail = sessionStorage.getItem('userEmail');
        if (userEmail) {
            // If logged in, prevent going to login page
            if (window.location.href.includes('login.html')) {
                window.history.pushState(null, '', 'reports.html');
                window.location.href = 'reports.html';
            }
        }
    });

    // Override all anchor clicks to check if they're allowed
    document.addEventListener('click', function (e) {
        const anchor = e.target.closest('a');
        if (!anchor) return;

        const href = anchor.getAttribute('href');
        if (!href) return;

        // Allow navigation to student pages
        const allowedPages = ['dashboard.html', 'map.html', 'reports.html'];
        const isAllowed = allowedPages.some(page => href.includes(page));

        // Block navigation to login or admin pages
        if (href.includes('login.html') || href.includes('setup.html') ||
            href.includes('user-management.html') || href.includes('rfid-management.html') ||
            href.includes('student-reports.html') || href.includes('activity-logs.html') ||
            href.includes('lcd-messages.html')) {
            e.preventDefault();
            alert('Please use the Logout button to leave your session.');
            return false;
        }

        // If it's a student page, allow it
        if (isAllowed) {
            return true;
        }
    }, true);
}

async function logout() {
    // Remove beforeunload listener before logout
    if (beforeUnloadHandler) {
        window.removeEventListener('beforeunload', beforeUnloadHandler);
    }

    // Sign out from Supabase Auth
    await supabase.auth.signOut();

    // Clear session storage
    sessionStorage.removeItem('userEmail');

    // Redirect to login
    window.location.href = 'login.html';
}
