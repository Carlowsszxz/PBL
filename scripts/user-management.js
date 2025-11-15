// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

let supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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

    // User is admin, load users list
    viewAllUsers();
    loadPendingValidation();
});

async function addUser() {
    const email = document.getElementById('userEmail').value.trim();
    const firstName = document.getElementById('userFirstName').value.trim();
    const lastName = document.getElementById('userLastName').value.trim();
    const studentId = document.getElementById('userStudentId').value.trim();
    const department = document.getElementById('userDepartment').value;
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
    resultDiv.textContent = 'Checking email availability...';

    try {
        // Check if email already exists in public.users table
        const { data: existingUser, error: checkError } = await supabase
            .from('users')
            .select('email')
            .eq('email', email)
            .maybeSingle();

        if (checkError) {
            console.error('Error checking email:', checkError);
            resultDiv.textContent = '❌ Error checking email: ' + checkError.message;
            return;
        }

        if (existingUser) {
            resultDiv.textContent = '❌ A user with this email already exists!';
            return;
        }

        resultDiv.textContent = 'Creating user and sending confirmation email...';

        // Step 1: Create user in Supabase Auth (this sends confirmation email)
        const { data: authData, error: authError } = await supabase.auth.signUp({
            email: email,
            password: password,
            options: {
                data: {
                    first_name: firstName,
                    last_name: lastName,
                    student_id: studentId,
                    college_department: department
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
                student_id: studentId || null,
                college_department: department || null,
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
        document.getElementById('userStudentId').value = '';
        document.getElementById('userDepartment').value = '';
        document.getElementById('userPassword').value = '';
        document.getElementById('makeAdmin').checked = false;

        // Refresh users list
        viewAllUsers();

    } catch (err) {
        console.error('Error creating user:', err);
        resultDiv.textContent = '❌ Error: ' + err.message;
    }
}

async function viewAllUsers() {
    try {
        const { data: users, error } = await supabase
            .from('users')
            .select('*')
            .order('created_at', { ascending: false });

        if (error) throw error;

        if (!users || users.length === 0) {
            document.getElementById('allUsersData').innerHTML = '<p class="text-center text-gray-500 dark:text-gray-400 py-8">No users found.</p>';
            return;
        }

        let html = `
        <div class="overflow-x-auto rounded-lg border border-slate-200 dark:border-gray-700">
            <table class="w-full border-collapse transition-colors duration-200">
                <thead>
                    <tr class="bg-slate-100 dark:bg-slate-800 border-b border-slate-200 dark:border-gray-700">
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Email</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Name</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Student ID</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Department</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Status</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Admin</th>
                        <th class="px-4 py-3 text-left text-sm font-semibold text-slate-700 dark:text-gray-200">Actions</th>
                    </tr>
                </thead>
                <tbody class="bg-white dark:bg-slate-900/50">
        `;

        users.forEach((user, index) => {
            const fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || 'N/A';
            const studentId = user.student_id || 'N/A';
            const department = user.college_department || 'N/A';
            const isSuperAdmin = user.email === 'admin@umak.edu.ph';
            
            // Determine verification status
            let verificationStatus = '';
            if (user.is_verified) {
                verificationStatus = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✅ Verified</span>';
            } else if (user.correction_requested) {
                verificationStatus = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">⚠️ Correction Requested</span>';
            } else {
                verificationStatus = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400">❌ Unverified</span>';
            }

            // Admin status display
            let adminStatus = '';
            if (isSuperAdmin) {
                adminStatus = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-100 text-purple-800 dark:bg-purple-900/30 dark:text-purple-400">👑 Super Admin</span>';
            } else if (user.is_admin) {
                adminStatus = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400">✅ Admin</span>';
            } else {
                adminStatus = '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-gray-100 text-gray-800 dark:bg-gray-800 dark:text-gray-300">User</span>';
            }

            // Action buttons - different for super admin
            let actionButtons = '';
            if (isSuperAdmin) {
                actionButtons = `
                    <div class="flex gap-2">
                        <span class="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-300 text-gray-500 cursor-not-allowed" 
                            title="Super admin cannot be modified">
                            Protected
                        </span>
                        <span class="px-3 py-1.5 text-xs font-medium rounded-md bg-gray-300 text-gray-500 cursor-not-allowed" 
                            title="Super admin cannot be deleted">
                            Protected
                        </span>
                    </div>
                `;
            } else {
                actionButtons = `
                    <div class="flex gap-2">
                        <button 
                            onclick="toggleAdmin('${user.id}', '${escapeHtml(user.email)}', ${!user.is_admin})" 
                            class="px-3 py-1.5 text-xs font-medium rounded-md transition-all duration-200 ${user.is_admin
                        ? 'bg-orange-500 hover:bg-orange-600 text-white'
                        : 'bg-blue-500 hover:bg-blue-600 text-white'} hover:shadow-md hover:-translate-y-0.5"
                            title="${user.is_admin ? 'Remove admin privileges' : 'Grant admin privileges'}">
                            ${user.is_admin ? 'Remove Admin' : 'Make Admin'}
                        </button>
                        <button 
                            onclick="deleteUser('${user.id}', '${escapeHtml(user.email)}')" 
                            class="px-3 py-1.5 text-xs font-medium rounded-md bg-red-500 hover:bg-red-600 text-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5"
                            title="Delete user">
                            Delete
                        </button>
                    </div>
                `;
            }

            html += `
                <tr class="border-b border-slate-100 dark:border-gray-800 hover:bg-slate-50 dark:hover:bg-slate-800/50 transition-colors duration-150 ${isSuperAdmin ? 'bg-purple-50/50 dark:bg-purple-900/10' : ''}">
                    <td class="px-4 py-3 text-sm ${isSuperAdmin ? 'text-purple-900 dark:text-purple-300 font-medium' : 'text-slate-900 dark:text-gray-200'}">${escapeHtml(user.email)}</td>
                    <td class="px-4 py-3 text-sm ${isSuperAdmin ? 'text-purple-900 dark:text-purple-300 font-medium' : 'text-slate-900 dark:text-gray-200'}">${escapeHtml(fullName)}</td>
                    <td class="px-4 py-3 text-sm text-slate-600 dark:text-gray-400">${escapeHtml(studentId)}</td>
                    <td class="px-4 py-3 text-sm text-slate-600 dark:text-gray-400 max-w-xs truncate" title="${escapeHtml(department)}">${escapeHtml(department)}</td>
                    <td class="px-4 py-3">
                        ${verificationStatus}
                    </td>
                    <td class="px-4 py-3">
                        ${adminStatus}
                    </td>
                    <td class="px-4 py-3">
                        ${actionButtons}
                    </td>
                </tr>
            `;
        });

        html += `
                </tbody>
            </table>
        </div>
        <div class="mt-4 text-sm text-slate-600 dark:text-gray-400">
            Total users: <span class="font-semibold text-slate-900 dark:text-gray-200">${users.length}</span>
        </div>
        `;

        document.getElementById('allUsersData').innerHTML = html;
    } catch (err) {
        console.error('Error loading users:', err);
        document.getElementById('allUsersData').innerHTML = '<p class="text-center text-red-600 dark:text-red-400 py-8">Error loading users: ' + err.message + '</p>';
    }
}

async function toggleAdmin(userId, userEmail, makeAdmin) {
    // Protect super admin account
    if (userEmail === 'admin@umak.edu.ph') {
        showNotification('❌ Super admin account cannot be modified!', 'error');
        return;
    }

    if (!confirm('Are you sure you want to ' + (makeAdmin ? 'make' : 'remove') + ' ' + userEmail + ' ' + (makeAdmin ? 'an admin' : 'from admin') + '?')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('users')
            .update({ is_admin: makeAdmin })
            .eq('id', userId);

        if (error) throw error;

        // Show success notification
        showNotification('✅ Admin status updated!', 'success');

        viewAllUsers();
    } catch (err) {
        showNotification('❌ Error: ' + err.message, 'error');
    }
}

async function deleteUser(userId, userEmail) {
    // Protect super admin account
    if (userEmail === 'admin@umak.edu.ph') {
        showNotification('❌ Super admin account cannot be deleted!', 'error');
        return;
    }

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

        // Show success notification
        showNotification('✅ User deleted!', 'success');

        viewAllUsers();
    } catch (err) {
        showNotification('❌ Error: ' + err.message, 'error');
    }
}

function showNotification(message, type = 'success') {
    const notification = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-green-500 dark:bg-green-600' : 'bg-red-500 dark:bg-red-600';
    notification.className = `fixed top-20 right-4 ${bgColor} text-white px-6 py-4 rounded-lg shadow-xl z-[9999] transition-all duration-300 transform`;
    notification.style.animation = 'slideInRight 0.3s ease-out';
    notification.textContent = message;

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

    setTimeout(() => {
        notification.style.opacity = '0';
        notification.style.transform = 'translateX(100px)';
        setTimeout(() => notification.remove(), 300);
    }, 3000);
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

// ============= VALIDATION FUNCTIONS =============

async function loadPendingValidation() {
    try {
        const { data: pendingUsers, error } = await supabase
            .from('users')
            .select('*')
            .eq('is_verified', false)
            .eq('is_admin', false)
            .order('created_at', { ascending: false });

        if (error) throw error;

        const pendingCount = pendingUsers?.length || 0;
        document.getElementById('pendingCount').textContent = pendingCount > 0 ? `${pendingCount} pending` : 'None pending';

        if (!pendingUsers || pendingUsers.length === 0) {
            document.getElementById('pendingValidationData').innerHTML = `
                <div class="text-center py-8">
                    <i data-lucide="check-circle" class="w-12 h-12 text-green-500 mx-auto mb-4"></i>
                    <p class="text-gray-500 dark:text-gray-400">No students pending validation</p>
                </div>
            `;
            // Re-initialize Lucide icons
            if (window.lucide) {
                lucide.createIcons();
            }
            return;
        }

        let html = `
        <div class="space-y-4">
        `;

        pendingUsers.forEach((user, index) => {
            const fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || 'N/A';
            const studentId = user.student_id || 'N/A';
            const department = user.college_department || 'N/A';
            const createdDate = new Date(user.created_at).toLocaleDateString('en-US', {
                year: 'numeric',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit'
            });

            html += `
                <div class="bg-white dark:bg-slate-800/50 border border-slate-200 dark:border-gray-700 rounded-lg p-6 transition-all duration-200 hover:border-slate-300 dark:hover:border-gray-600">
                    <div class="flex justify-between items-start mb-4">
                        <div class="flex-1">
                            <h3 class="text-lg font-semibold text-slate-900 dark:text-gray-100 mb-2">${escapeHtml(fullName)}</h3>
                            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                                <div>
                                    <span class="font-medium text-slate-600 dark:text-gray-400">Email:</span>
                                    <span class="text-slate-900 dark:text-gray-200 ml-2">${escapeHtml(user.email)}</span>
                                </div>
                                <div>
                                    <span class="font-medium text-slate-600 dark:text-gray-400">Student ID:</span>
                                    <span class="text-slate-900 dark:text-gray-200 ml-2">${escapeHtml(studentId)}</span>
                                </div>
                                <div class="md:col-span-2">
                                    <span class="font-medium text-slate-600 dark:text-gray-400">Department:</span>
                                    <span class="text-slate-900 dark:text-gray-200 ml-2">${escapeHtml(department)}</span>
                                </div>
                                <div>
                                    <span class="font-medium text-slate-600 dark:text-gray-400">Registered:</span>
                                    <span class="text-slate-900 dark:text-gray-200 ml-2">${createdDate}</span>
                                </div>
                                <div>
                                    <span class="font-medium text-slate-600 dark:text-gray-400">Status:</span>
                                    <span class="ml-2">
                                        ${user.correction_requested 
                                            ? '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400">⚠️ Correction Requested</span>'
                                            : '<span class="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900/30 dark:text-yellow-400">⏳ Pending Review</span>'
                                        }
                                    </span>
                                </div>
                            </div>
                            ${user.correction_reason ? `
                                <div class="mt-3 p-3 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-md">
                                    <span class="font-medium text-orange-800 dark:text-orange-300">Previous correction reason:</span>
                                    <p class="text-orange-700 dark:text-orange-400 text-sm mt-1">${escapeHtml(user.correction_reason)}</p>
                                </div>
                            ` : ''}
                        </div>
                    </div>
                    <div class="flex flex-wrap gap-2 pt-4 border-t border-slate-200 dark:border-gray-700">
                        <button 
                            onclick="approveUser('${user.id}', '${escapeHtml(user.email)}')" 
                            class="px-4 py-2 text-sm font-medium rounded-md bg-green-500 hover:bg-green-600 text-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 flex items-center gap-2"
                            title="Approve this student's registration">
                            <i data-lucide="check" class="w-4 h-4"></i>
                            Approve
                        </button>
                        <button 
                            onclick="requestCorrection('${user.id}', '${escapeHtml(user.email)}')" 
                            class="px-4 py-2 text-sm font-medium rounded-md bg-orange-500 hover:bg-orange-600 text-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 flex items-center gap-2"
                            title="Request corrections from student">
                            <i data-lucide="edit" class="w-4 h-4"></i>
                            Request Correction
                        </button>
                        <button 
                            onclick="rejectUser('${user.id}', '${escapeHtml(user.email)}')" 
                            class="px-4 py-2 text-sm font-medium rounded-md bg-red-500 hover:bg-red-600 text-white transition-all duration-200 hover:shadow-md hover:-translate-y-0.5 flex items-center gap-2"
                            title="Reject and delete this registration">
                            <i data-lucide="x" class="w-4 h-4"></i>
                            Reject
                        </button>
                    </div>
                </div>
            `;
        });

        html += `
        </div>
        `;

        document.getElementById('pendingValidationData').innerHTML = html;
        
        // Re-initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

    } catch (err) {
        console.error('Error loading pending validation:', err);
        document.getElementById('pendingValidationData').innerHTML = '<p class="text-center text-red-600 dark:text-red-400 py-8">Error loading pending validation: ' + err.message + '</p>';
    }
}

async function approveUser(userId, userEmail) {
    if (!confirm('Are you sure you want to approve ' + userEmail + '? This will verify their account and allow them full access to the system.')) {
        return;
    }

    try {
        const { error } = await supabase
            .from('users')
            .update({ 
                is_verified: true,
                data_verified: true,
                verification_date: new Date().toISOString(),
                correction_requested: false,
                correction_reason: null
            })
            .eq('id', userId);

        if (error) throw error;

        showNotification('✅ Student approved successfully!', 'success');
        loadPendingValidation();
        viewAllUsers();

    } catch (err) {
        showNotification('❌ Error approving user: ' + err.message, 'error');
    }
}

let currentCorrectionUserId = null;
let currentCorrectionUserEmail = null;

async function requestCorrection(userId, userEmail) {
    // Store current user info for the modal
    currentCorrectionUserId = userId;
    currentCorrectionUserEmail = userEmail;
    
    // Get user data to display in modal
    try {
        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('id', userId)
            .single();

        if (error) throw error;

        // Populate student info in modal
        const fullName = ((user.first_name || '') + ' ' + (user.last_name || '')).trim() || 'N/A';
        const studentId = user.student_id || 'N/A';
        const department = user.college_department || 'N/A';

        document.getElementById('correctionStudentInfo').innerHTML = `
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 bg-orange-100 dark:bg-orange-900/30 rounded-full flex items-center justify-center">
                    <i data-lucide="user" class="w-5 h-5 text-orange-600 dark:text-orange-400"></i>
                </div>
                <div>
                    <div class="font-semibold text-slate-900 dark:text-gray-100">${escapeHtml(fullName)}</div>
                    <div class="text-sm text-slate-600 dark:text-gray-400">${escapeHtml(userEmail)}</div>
                </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 text-sm">
                <div>
                    <span class="font-medium text-slate-600 dark:text-gray-400">Student ID:</span>
                    <span class="text-slate-900 dark:text-gray-200 ml-2">${escapeHtml(studentId)}</span>
                </div>
                <div>
                    <span class="font-medium text-slate-600 dark:text-gray-400">Department:</span>
                    <span class="text-slate-900 dark:text-gray-200 ml-2 text-xs">${escapeHtml(department)}</span>
                </div>
            </div>
        `;

        // Clear form
        document.querySelectorAll('.correction-checkbox').forEach(checkbox => {
            checkbox.checked = false;
        });
        document.getElementById('customCorrectionReason').value = '';

        // Show modal
        document.getElementById('correctionModal').classList.remove('hidden');
        
        // Re-initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

    } catch (err) {
        showNotification('❌ Error loading user data: ' + err.message, 'error');
    }
}

function closeCorrectionModal() {
    document.getElementById('correctionModal').classList.add('hidden');
    currentCorrectionUserId = null;
    currentCorrectionUserEmail = null;
}

async function submitCorrectionRequest() {
    if (!currentCorrectionUserId || !currentCorrectionUserEmail) {
        showNotification('❌ Error: No user selected', 'error');
        return;
    }

    // Get selected correction reasons
    const selectedReasons = [];
    const reasonDescriptions = {
        'student_id': 'Student ID format is incorrect (should match format like a12345027)',
        'email_format': 'Email address should use official university domain (@umak.edu.ph)',
        'name_verification': 'First name or last name appears incorrect or incomplete',
        'department_mismatch': 'College department doesn\'t match student ID or records',
        'missing_information': 'Required fields are empty or incomplete',
        'document_verification': 'Additional documents needed to verify identity/enrollment'
    };

    document.querySelectorAll('.correction-checkbox:checked').forEach(checkbox => {
        selectedReasons.push(reasonDescriptions[checkbox.value]);
    });

    const customReason = document.getElementById('customCorrectionReason').value.trim();

    if (selectedReasons.length === 0 && !customReason) {
        showNotification('❌ Please select at least one correction reason or provide custom instructions', 'error');
        return;
    }

    // Build correction message
    let correctionMessage = '';
    
    if (selectedReasons.length > 0) {
        correctionMessage += 'Please correct the following issues with your registration:\n\n';
        selectedReasons.forEach((reason, index) => {
            correctionMessage += `${index + 1}. ${reason}\n`;
        });
        correctionMessage += '\n';
    }

    if (customReason) {
        correctionMessage += 'Additional Instructions:\n' + customReason + '\n\n';
    }

    correctionMessage += 'Please update your information and contact the administrator once corrections are made. You have 7 days to make these corrections.';

    try {
        // Calculate correction deadline (7 days from now)
        const deadline = new Date();
        deadline.setDate(deadline.getDate() + 7);

        const correctionFields = document.querySelectorAll('.correction-checkbox:checked');
        const fields = Array.from(correctionFields).map(cb => cb.value);

        // First try with all fields
        let updateData = {
            correction_requested: true,
            correction_reason: correctionMessage,
            correction_date: new Date().toISOString(),
            correction_deadline: deadline.toISOString()
        };

        // Only add correction_fields if there are fields selected
        if (fields.length > 0) {
            updateData.correction_fields = fields.join(','); // Use simple comma-separated string
        }

        console.log('Updating user with data:', updateData); // Debug log

        let { error } = await supabase
            .from('users')
            .update(updateData)
            .eq('id', currentCorrectionUserId);

        if (error) {
            console.error('Supabase error details:', JSON.stringify(error, null, 2));
            console.error('Error message:', error.message);
            console.error('Error code:', error.code);
            console.error('Error details:', error.details);
            console.error('Error hint:', error.hint);
            
            // Try with simpler data structure
            console.log('Retrying with minimal data...');
            const minimalData = {
                correction_requested: true,
                correction_reason: correctionMessage
            };
            
            const { error: retryError } = await supabase
                .from('users')
                .update(minimalData)
                .eq('id', currentCorrectionUserId);
                
            if (retryError) {
                console.error('Retry error:', JSON.stringify(retryError, null, 2));
                throw new Error(`Database update failed: ${retryError.message || 'Unknown error'}`);
            }
            
            console.log('Minimal update succeeded, now trying with dates...');
            
            // If minimal worked, try adding dates one by one
            const dateData = {
                correction_date: new Date().toISOString()
            };
            
            const { error: dateError } = await supabase
                .from('users')
                .update(dateData)
                .eq('id', currentCorrectionUserId);
                
            if (!dateError) {
                // Date worked, try deadline
                const deadlineData = {
                    correction_deadline: deadline.toISOString()
                };
                
                await supabase
                    .from('users')
                    .update(deadlineData)
                    .eq('id', currentCorrectionUserId);
            }
        }

        showNotification('✅ Correction request sent to student!', 'success');
        closeCorrectionModal();
        loadPendingValidation();
        viewAllUsers();

        // TODO: Send email notification to student about correction request
        // This would require additional email service integration

    } catch (err) {
        console.error('Full error object:', JSON.stringify(err, null, 2));
        console.error('Error message:', err.message);
        console.error('Error stack:', err.stack);
        showNotification('❌ Error requesting correction: ' + (err.message || 'Unknown error'), 'error');
    }
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('correctionModal');
    if (event.target === modal) {
        closeCorrectionModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('correctionModal');
        if (!modal.classList.contains('hidden')) {
            closeCorrectionModal();
        }
    }
});

async function rejectUser(userId, userEmail) {
    if (!confirm('Are you sure you want to reject ' + userEmail + '? This will permanently delete their account and they will need to register again.')) {
        return;
    }

    try {
        // Delete any related RFID cards first
        await supabase
            .from('rfid_cards')
            .delete()
            .eq('user_id', userId);

        // Delete the user
        const { error } = await supabase
            .from('users')
            .delete()
            .eq('id', userId);

        if (error) throw error;

        showNotification('✅ Student registration rejected and removed!', 'success');
        loadPendingValidation();
        viewAllUsers();

    } catch (err) {
        showNotification('❌ Error rejecting user: ' + err.message, 'error');
    }
}

