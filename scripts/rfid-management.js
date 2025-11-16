// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);
let allUsers = []; // Store all users for searching

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

    // User is admin, load data
    loadUsers();
    viewAllRfid();
});

async function loadUsers() {
    try {
        const { data, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        // Store all users for searching
        allUsers = data || [];

        // Populate dropdown
        populateUserDropdown(allUsers);

    } catch (err) {
        console.error('Error loading users:', err);
        showNotification('error', 'Failed to load users: ' + err.message);
    }
}

function populateUserDropdown(users) {
    const dropdown = document.getElementById('userDropdown');
    if (!dropdown) return;

    dropdown.innerHTML = '';

    if (!users || users.length === 0) {
        dropdown.innerHTML = '<div class="p-4 text-sm text-gray-500 dark:text-gray-400 transition-colors duration-200">No users found</div>';
        return;
    }

    users.forEach(user => {
        const name = (user.first_name || '') + ' ' + (user.last_name || '');
        const displayText = user.email + (name.trim() ? ' (' + name.trim() + ')' : '') + (user.is_admin ? ' 👑' : '');

        const item = document.createElement('div');
        item.className = 'user-dropdown-item px-4 py-3 hover:bg-gray-50 dark:hover:bg-slate-700 cursor-pointer text-sm transition-colors duration-150';
        item.innerHTML = `
            <div class="font-medium text-gray-900 dark:text-gray-200">${displayText}</div>
            ${name.trim() ? `<div class="text-xs text-gray-500 dark:text-gray-400">${user.email}</div>` : ''}
        `;

        item.addEventListener('click', () => selectUser(user.id, displayText));
        dropdown.appendChild(item);
    });
}

function selectUser(userId, displayText) {
    document.getElementById('userSelect').value = userId;
    document.getElementById('userSearch').value = displayText;

    const clearBtn = document.getElementById('clearUserBtn');
    if (clearBtn) clearBtn.classList.remove('hidden');

    hideUserDropdown();
}

function clearUserSelection() {
    document.getElementById('userSelect').value = '';
    document.getElementById('userSearch').value = '';

    const clearBtn = document.getElementById('clearUserBtn');
    if (clearBtn) clearBtn.classList.add('hidden');

    hideUserDropdown();
}

function filterUsers() {
    const searchInput = document.getElementById('userSearch');
    const searchTerm = searchInput.value.toLowerCase().trim();
    const selectedUserId = document.getElementById('userSelect').value;
    const clearBtn = document.getElementById('clearUserBtn');

    // If user types something new, clear selection
    if (selectedUserId && searchTerm) {
        const selectedUser = allUsers.find(u => u.id === selectedUserId);
        if (selectedUser) {
            const selectedDisplay = selectedUser.email +
                ((selectedUser.first_name || selectedUser.last_name) ?
                    ' (' + (selectedUser.first_name || '') + ' ' + (selectedUser.last_name || '') + ')' : '') +
                (selectedUser.is_admin ? ' 👑' : '');

            if (searchInput.value !== selectedDisplay) {
                document.getElementById('userSelect').value = '';
                clearBtn?.classList.add('hidden');
            }
        }
    }

    // Show/hide dropdown based on search
    if (!searchTerm && !document.getElementById('userSelect').value) {
        populateUserDropdown(allUsers);
        showUserDropdown();
    } else if (document.getElementById('userSelect').value && !searchTerm) {
        hideUserDropdown();
    } else {
        // Filter users
        const filtered = allUsers.filter(user => {
            const email = (user.email || '').toLowerCase();
            const firstName = (user.first_name || '').toLowerCase();
            const lastName = (user.last_name || '').toLowerCase();
            const fullName = (firstName + ' ' + lastName).trim();

            return email.includes(searchTerm) ||
                firstName.includes(searchTerm) ||
                lastName.includes(searchTerm) ||
                fullName.includes(searchTerm);
        });

        populateUserDropdown(filtered);
        showUserDropdown();
    }
}

function showUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown && allUsers.length > 0) {
        dropdown.classList.remove('hidden');
    }
}

function hideUserDropdown() {
    const dropdown = document.getElementById('userDropdown');
    if (dropdown) {
        dropdown.classList.add('hidden');
    }
}

// Close dropdown when clicking outside
document.addEventListener('click', function (event) {
    const searchBox = document.getElementById('userSearch');
    const dropdown = document.getElementById('userDropdown');

    if (searchBox && dropdown && !searchBox.contains(event.target) && !dropdown.contains(event.target)) {
        hideUserDropdown();
    }
});

async function handleRfidAssignment(event) {
    event.preventDefault();

    const form = event.target;
    const rfidInput = document.getElementById('rfidUid');
    const userSelect = document.getElementById('userSelect');
    const userSearch = document.getElementById('userSearch');
    const submitBtn = form.querySelector('button[type="submit"]');
    const resultDiv = document.getElementById('rfidResult');
    const clearBtn = document.getElementById('clearUserBtn');

    // Disable form while processing
    form.querySelectorAll('input, button').forEach(el => el.disabled = true);
    submitBtn.innerHTML = '<i data-lucide="loader" class="w-5 h-5 mr-2 animate-spin"></i> Processing...';
    lucide.createIcons();

    // Initialize loading state
    resultDiv.innerHTML = `
        <div class="flex items-center p-4 bg-blue-50 text-blue-700 rounded-lg">
            <i data-lucide="loader" class="w-5 h-5 mr-2 animate-spin"></i>
            <span>Processing request...</span>
        </div>
    `;
    lucide.createIcons();

    try {
        const rfidUid = rfidInput.value.trim().toUpperCase();
        const userId = userSelect.value;

        // Validate inputs
        if (!rfidUid || !userId) {
            throw new Error('Please enter Device ID and select a user');
        }

        // Validate RFID format
        if (!/^[A-F0-9]{8,20}$/.test(rfidUid)) {
            throw new Error('Invalid Device ID format. Must be 8-20 hex characters (0-9, A-F)');
        }

        // Update status
        resultDiv.innerHTML = `
            <div class="flex items-center p-4 bg-blue-50 text-blue-700 rounded-lg">
                <i data-lucide="search" class="w-5 h-5 mr-2"></i>
                <span>Checking device status...</span>
            </div>
        `;
        lucide.createIcons();

        // Check if RFID is already assigned
        const { data: existingRfid, error: rfidCheckError } = await supabase
            .from('rfid_cards')
            .select('*, user:users!user_id(email, first_name, last_name)')
            .eq('rfid_uid', rfidUid)
            .maybeSingle();

        if (rfidCheckError && rfidCheckError.code !== 'PGRST116') {
            throw rfidCheckError;
        }

        if (existingRfid && existingRfid.user_id !== userId) {
            const userName = existingRfid.user.first_name ?
                `${existingRfid.user.first_name} ${existingRfid.user.last_name}` :
                existingRfid.user.email;
            throw new Error(`This device is already registered to ${userName}`);
        }

        // Check if user already has a device
        resultDiv.innerHTML = `
            <div class="flex items-center p-4 bg-blue-50 text-blue-700 rounded-lg">
                <i data-lucide="loader" class="w-5 h-5 mr-2 animate-spin"></i>
                <span>Checking user's device status...</span>
            </div>
        `;
        lucide.createIcons();

        const { data: userRfidCards, error: userCheckError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('user_id', userId)
            .order('created_at', { ascending: false })
            .limit(1);

        if (userCheckError) throw userCheckError;

        let result;
        const isUpdate = userRfidCards && userRfidCards.length > 0;

        resultDiv.innerHTML = `
            <div class="flex items-center p-4 bg-blue-50 text-blue-700 rounded-lg">
                <i data-lucide="loader" class="w-5 h-5 mr-2 animate-spin"></i>
                <span>${isUpdate ? 'Updating device assignment...' : 'Registering new device...'}</span>
            </div>
        `;
        lucide.createIcons();

        if (isUpdate) {
            result = await supabase
                .from('rfid_cards')
                .update({
                    rfid_uid: rfidUid,
                    is_active: true
                })
                .eq('id', userRfidCards[0].id)
                .select();
        } else {
            result = await supabase
                .from('rfid_cards')
                .insert({
                    rfid_uid: rfidUid,
                    user_id: userId,
                    is_active: true
                })
                .select();
        }

        if (result.error) throw result.error;

        // Success! Update UI
        resultDiv.innerHTML = `
            <div class="flex items-center p-4 bg-green-50 text-green-700 rounded-lg">
                <i data-lucide="check-circle" class="w-5 h-5 mr-2"></i>
                <div>
                    <p class="font-medium">Device registered successfully!</p>
                    <p class="text-sm mt-1">${isUpdate ? 'Updated existing device' : 'Created new device registration'}</p>
                </div>
            </div>
        `;
        lucide.createIcons();

        // Show notification
        showNotification('success', isUpdate ? 'Device Updated Successfully' : 'Device Registered Successfully');

        // Clear form and refresh data
        rfidInput.value = '';
        clearUserSelection();
        await viewAllRfid();

    } catch (err) {
        console.error('Error processing device:', err);

        // Show error in form
        resultDiv.innerHTML = `
            <div class="flex items-center p-4 bg-red-50 text-red-700 rounded-lg">
                <i data-lucide="alert-circle" class="w-5 h-5 mr-2"></i>
                <div>
                    <p class="font-medium">Registration failed</p>
                    <p class="text-sm mt-1">${err.message || 'An unexpected error occurred'}</p>
                </div>
            </div>
        `;
        lucide.createIcons();

        // Show error notification
        showNotification('error', err.message || 'Failed to process device registration');

    } finally {
        // Re-enable form
        form.querySelectorAll('input, button').forEach(el => el.disabled = false);
        submitBtn.innerHTML = `
            <i data-lucide="plus-circle" class="w-5 h-5 mr-2"></i>
            Register Device
        `;
        lucide.createIcons();

        // Refresh the device list
        const allRfidData = document.getElementById('allRfidData');
        if (allRfidData) {
            allRfidData.innerHTML = '<div class="p-4 text-center text-gray-500"><i data-lucide="loader" class="w-5 h-5 mr-2 inline-block animate-spin"></i> Refreshing device list...</div>';
            lucide.createIcons();
            await viewAllRfid();
        }
    }
}

async function viewAllRfid() {
    try {
        const { data: rfidCards, error } = await supabase
            .from('rfid_cards')
            .select('*, user:users!user_id(email, first_name, last_name)')
            .order('created_at', { ascending: false });

        if (error) throw error;

        const allRfidData = document.getElementById('allRfidData');
        if (!allRfidData) return;

        if (!rfidCards || rfidCards.length === 0) {
            allRfidData.innerHTML = `
                <div class="flex flex-col items-center justify-center p-8 text-gray-500 dark:text-gray-400 transition-colors duration-200">
                    <i data-lucide="inbox" class="w-12 h-12 mb-3"></i>
                    <p class="text-lg font-medium">No devices registered</p>
                    <p class="text-sm mt-1">Register a device to get started</p>
                </div>
            `;
            lucide.createIcons();
            return;
        }

        let html = '<div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700 transition-colors duration-200">';
        html += `
            <table class="w-full border-collapse min-w-[800px]">
                <thead>
                    <tr class="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-gray-700 transition-colors duration-200">
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Device ID</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">User</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Status</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Registered</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Actions</th>
                    </tr>
                </thead>
                <tbody class="bg-white dark:bg-slate-900/50 transition-colors duration-200">
        `;

        rfidCards.forEach(card => {
            const user = card.user;
            const userName = user.first_name ?
                `${user.first_name} ${user.last_name}` :
                user.email;
            const createdDate = new Date(card.created_at).toLocaleDateString();

            html += `
                <tr class="border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-all duration-150">
                    <td class="px-4 py-3 font-mono font-medium text-sm text-slate-900 dark:text-gray-200">${card.rfid_uid}</td>
                    <td class="px-4 py-3">
                        <div class="text-sm font-medium text-gray-900 dark:text-gray-200">${userName}</div>
                        ${user.first_name ? `<div class="text-xs text-gray-500 dark:text-gray-400">${user.email}</div>` : ''}
                    </td>
                    <td class="px-4 py-3">
                        <span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium transition-colors duration-200 ${card.is_active ?
                    'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' :
                    'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400'
                }">
                            ${card.is_active ? '🟢 Active' : '🔴 Inactive'}
                        </span>
                    </td>
                    <td class="px-4 py-3 text-sm text-gray-500 dark:text-gray-400">${createdDate}</td>
                    <td class="px-4 py-3">
                        <div class="flex gap-2">
                            <button 
                                onclick="toggleRfidStatus('${card.id}', ${!card.is_active})"
                                class="px-3 py-1.5 rounded-md text-sm font-medium text-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 ${card.is_active ?
                    'bg-red-500 hover:bg-red-600' :
                    'bg-green-500 hover:bg-green-600'
                }">
                                ${card.is_active ? 'Deactivate' : 'Activate'}
                            </button>
                            <button onclick="deleteRfid('${card.id}')" class="px-3 py-1.5 rounded-md bg-red-50 hover:bg-red-100 text-red-600 border border-red-200 transition-colors duration-200 flex items-center gap-1">
                                <i data-lucide="trash-2" class="w-3 h-3"></i>
                                <span class="text-xs">Delete</span>
                            </button>
                        </div>
                    </td>
                </tr>
            `;
        });

        html += '</tbody></table></div>';
        html += `
            <div class="mt-4 px-2 text-sm text-slate-600 dark:text-gray-400 transition-colors duration-200">
                Total devices: <span class="font-semibold text-slate-900 dark:text-gray-200">${rfidCards.length}</span>
            </div>
        `;
        allRfidData.innerHTML = html;
        lucide.createIcons();

    } catch (err) {
        console.error('Error loading RFID cards:', err);
        document.getElementById('allRfidData').innerHTML = `
            <div class="flex items-center justify-center p-8 text-red-600 dark:text-red-400 transition-colors duration-200">
                <i data-lucide="alert-circle" class="w-5 h-5 mr-2"></i>
                <span>Error loading devices: ${err.message}</span>
            </div>
        `;
        lucide.createIcons();
    }
}

function showNotification(type, message) {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600';
    notification.className = `fixed top-20 right-4 ${bgColor} text-white px-6 py-4 rounded-lg shadow-xl z-[9999] transition-all duration-300 transform`;
    notification.style.animation = 'slideInRight 0.3s ease-out';

    notification.innerHTML = `
        <div class="flex items-center">
            <i data-lucide="${type === 'success' ? 'check-circle' : 'alert-circle'}" class="w-5 h-5 mr-2"></i>
            <span>${message}</span>
        </div>
    `;

    // Add animation keyframes if not already added
    if (!document.getElementById('notification-styles')) {
        const style = document.createElement('style');
        style.id = 'notification-styles';
        style.textContent = `
            @keyframes slideInRight {
                from {
                    opacity: 0;
                    transform: translateX(100px);
                }
                to {
                    opacity: 1;
                    transform: translateX(0);
                }
            }
        `;
        document.head.appendChild(style);
    }

    document.body.appendChild(notification);
    lucide.createIcons();

    // Animate out
    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
}

async function toggleRfidStatus(rfidId, activate) {
    if (!confirm('Are you sure you want to ' + (activate ? 'activate' : 'deactivate') + ' this device?')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('rfid_cards')
            .update({ is_active: activate })
            .eq('id', rfidId);

        if (error) throw error;

        // Show success notification
        showNotification('success', 'Device ' + (activate ? 'activated' : 'deactivated') + ' successfully!');

        // Refresh the list
        await viewAllRfid();

    } catch (err) {
        console.error('Error updating device status:', err);
        showNotification('error', err.message || 'Failed to update device status');
    }
}

// Delete all RFID devices function
async function deleteAllRfid() {
    if (!confirm('Are you sure you want to delete all RFID devices? This action cannot be undone.')) {
        return;
    }
    try {
        const { error } = await supabase.from('rfid_cards').delete().neq('id', '00000000-0000-0000-0000-000000000000'); // Delete all
        if (error) throw error;
        showNotification('success', 'All RFID devices deleted successfully.');
        viewAllRfid(); // Reload the devices
    } catch (err) {
        console.error('Error deleting all RFID devices:', err);
        showNotification('error', 'Error deleting devices: ' + err.message);
    }
}

// Delete individual RFID device function
async function deleteRfid(cardId) {
    if (!confirm('Are you sure you want to delete this RFID device?')) {
        return;
    }
    try {
        const { error } = await supabase.from('rfid_cards').delete().eq('id', cardId);
        if (error) throw error;
        showNotification('success', 'RFID device deleted successfully.');
        viewAllRfid(); // Reload the devices
    } catch (err) {
        console.error('Error deleting RFID device:', err);
        showNotification('error', 'Error deleting device: ' + err.message);
    }
}

async function logout() {
    await supabase.auth.signOut();
    sessionStorage.removeItem('userEmail');
    window.location.href = 'login.html';
}

