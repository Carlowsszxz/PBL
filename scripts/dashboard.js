// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// ============================================================================
// HELPER FUNCTIONS
// ============================================================================

/**
 * Format a timestamp into a human-readable "time ago" string
 * @param {string} timestamp - ISO timestamp string
 * @returns {string} - Formatted string like "2 hours ago" or "Just now"
 */
function formatTimeAgo(timestamp) {
    if (!timestamp) return 'Recently';
    
    const now = new Date();
    const past = new Date(timestamp);
    const diffMs = now - past;
    const diffSecs = Math.floor(diffMs / 1000);
    const diffMins = Math.floor(diffSecs / 60);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);
    
    if (diffSecs < 60) return 'Just now';
    if (diffMins < 60) return `${diffMins} min${diffMins !== 1 ? 's' : ''} ago`;
    if (diffHours < 24) return `${diffHours} hour${diffHours !== 1 ? 's' : ''} ago`;
    if (diffDays < 7) return `${diffDays} day${diffDays !== 1 ? 's' : ''} ago`;
    
    // For older dates, show the actual date
    return past.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
}

/**
 * Escape HTML special characters to prevent XSS attacks
 * @param {string} text - Raw text that may contain HTML
 * @returns {string} - Escaped text safe for innerHTML
 */
function escapeHtml(text) {
    if (!text) return '';
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

/**
 * Format duration in seconds to human-readable string
 * @param {number} seconds - Duration in seconds
 * @returns {string} - Formatted string like "2h 30m" or "45m"
 */
function formatDuration(seconds) {
    if (!seconds || seconds < 0) return '0m';
    
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    
    if (hours > 0) {
        return `${hours}h ${minutes}m`;
    }
    return `${minutes}m`;
}

/**
 * Alternative time ago formatter (used in timeline)
 * @param {string} dateString - ISO timestamp string
 * @returns {string} - Formatted string like "2 mins ago" or "Just now"
 */
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

// ============================================================================
// RFID CARD MANAGEMENT
// ============================================================================

// Check if user needs to register RFID card
async function updateUserRfidStatus() {
    try {
        const { data: { user } } = await supabase.auth.getUser();
        if (!user) return;

        // Get user info
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('email', user.email)
            .single();

        if (userError) throw userError;

        // Check if user has RFID card
        const { data: rfidCard, error: rfidError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('user_id', userData.id)
            .maybeSingle();

        if (rfidError && rfidError.code !== 'PGRST116') throw rfidError;

        const rfidAssignment = document.getElementById('rfidAssignment');
        if (!rfidCard && rfidAssignment) {
            rfidAssignment.classList.remove('hidden');
            rfidAssignment.classList.add('show');
        } else if (rfidAssignment) {
            rfidAssignment.classList.remove('show');
            rfidAssignment.classList.add('hidden');
        }

    } catch (err) {
        console.error('Error checking RFID status:', err);
    }
}

// RFID Card Registration
async function handleRfidRegistration(event) {
    event.preventDefault();

    const form = event.target;
    const rfidInput = form.querySelector('#rfidInput');
    const submitBtn = form.querySelector('button[type="submit"]');
    const errorDiv = document.getElementById('rfidError');

    // Disable form while processing
    rfidInput.disabled = true;
    submitBtn.disabled = true;
    errorDiv.textContent = '';

    try {
        const rfidUid = rfidInput.value.trim().toUpperCase();
        const { data: { user } } = await supabase.auth.getUser();

        // Validate RFID format
        if (!/^[A-F0-9]{8,20}$/.test(rfidUid)) {
            throw new Error('Invalid Device ID format. Must be 8-20 hex characters (0-9, A-F)');
        }

        // Check if RFID already registered
        const { data: existingRfid, error: checkError } = await supabase
            .from('rfid_cards')
            .select('user:users!user_id(email)')
            .eq('rfid_uid', rfidUid)
            .maybeSingle();

        if (checkError && checkError.code !== 'PGRST116') {
            throw checkError;
        }

        if (existingRfid) {
            throw new Error(`This device is already registered to ${existingRfid.user.email}`);
        }

        // Get user info
        const { data: userData, error: userError } = await supabase
            .from('users')
            .select('id')
            .eq('email', user.email)
            .single();

        if (userError) throw userError;

        // Register the RFID card
        const { error: insertError } = await supabase
            .from('rfid_cards')
            .insert({
                rfid_uid: rfidUid,
                user_id: userData.id,
                is_active: true
            });

        if (insertError) throw insertError;

        // Show success message
        alert('Device registered successfully!');

        // Clear form and hide registration container
        form.reset();
        document.getElementById('rfidAssignment').style.display = 'none';

        // Update UI
        updateUserRfidStatus();

    } catch (err) {
        console.error('Error registering device:', err);
        const errorMsg = err.message || 'Failed to register device';
        errorDiv.textContent = '❌ ' + errorMsg;
        errorDiv.className = 'mt-4 text-red-600 text-sm';
    } finally {
        // Re-enable form
        rfidInput.disabled = false;
        submitBtn.disabled = false;
    }
}

// ================================================================
// ====== RFID SCANNING & USER LOOKUP SYSTEM ======
// ================================================================

// Global state for admin mode toggle
let rfidAdminMode = false;
let lastScannedRfid = null;
let scanDisplayTimeout = null;

/**
 * Look up user details from RFID UID using JOIN query
 * @param {string} rfidUid - The RFID card UID (e.g., "93B12CDA")
 * @returns {Object} User data object or error info
 */
async function lookupUserByRfid(rfidUid) {
    console.log('🔍 RFID Lookup Started:', rfidUid);

    try {
        // Query rfid_cards table and JOIN with users table
        const { data: rfidData, error: rfidError } = await supabase
            .from('rfid_cards')
            .select(`
                id,
                rfid_uid,
                is_active,
                created_at,
                user:users!user_id (
                    id,
                    email,
                    first_name,
                    last_name,
                    student_id,
                    is_admin
                )
            `)
            .eq('rfid_uid', rfidUid.toUpperCase())
            .maybeSingle();

        if (rfidError) {
            console.error('❌ Database error:', rfidError);
            return { success: false, error: 'database', message: rfidError.message };
        }

        // No RFID card found
        if (!rfidData) {
            console.warn('⚠️ Unregistered RFID:', rfidUid);
            return {
                success: false,
                error: 'unregistered',
                rfidUid: rfidUid,
                message: 'This RFID card is not registered in the system'
            };
        }

        // Check if card is inactive (unless admin mode is on)
        if (!rfidData.is_active && !rfidAdminMode) {
            console.warn('⚠️ Inactive RFID card:', rfidUid);
            return {
                success: false,
                error: 'inactive',
                rfidUid: rfidUid,
                user: rfidData.user,
                message: 'This RFID card has been deactivated'
            };
        }

        // Success - user found
        const user = rfidData.user;
        const fullName = `${user.first_name || ''} ${user.last_name || ''}`.trim() || user.email;

        console.log('✅ User Found:', {
            name: fullName,
            email: user.email,
            studentId: user.student_id,
            isActive: rfidData.is_active
        });

        return {
            success: true,
            rfidUid: rfidData.rfid_uid,
            isActive: rfidData.is_active,
            user: {
                id: user.id,
                email: user.email,
                firstName: user.first_name,
                lastName: user.last_name,
                fullName: fullName,
                studentId: user.student_id,
                isAdmin: user.is_admin
            }
        };

    } catch (err) {
        console.error('❌ Unexpected error in lookupUserByRfid:', err);
        return { success: false, error: 'exception', message: err.message };
    }
}

/**
 * Assign user to a seat and update occupancy
 * @param {Object} userData - User data from lookupUserByRfid
 * @param {string} tableId - Table ID (e.g., "table-1")
 * @param {number} seatNumber - Seat number to assign
 * @returns {Object} Assignment result
 */
async function assignUserToSeat(userData, tableId, seatNumber) {
    console.log('🪑 Seat Assignment Started:', { user: userData.fullName, table: tableId, seat: seatNumber });

    try {
        // Step 1: Check if user already has an occupied seat
        const { data: existingSeats, error: checkError } = await supabase
            .from('occupancy')
            .select('*')
            .eq('occupied_by', userData.email)
            .eq('is_occupied', true);

        if (checkError) throw checkError;

        // Step 2: Auto-release previous seats if any
        if (existingSeats && existingSeats.length > 0) {
            console.log(`⚠️ User already occupies ${existingSeats.length} seat(s). Auto-releasing...`);

            for (const seat of existingSeats) {
                const { error: releaseError } = await supabase
                    .from('occupancy')
                    .update({
                        is_occupied: false,
                        occupied_by: null,
                        occupied_at: null
                    })
                    .eq('table_id', seat.table_id)
                    .eq('seat_number', seat.seat_number);

                if (releaseError) console.error('Error releasing seat:', releaseError);
                else console.log(`✅ Released: ${seat.table_id} seat ${seat.seat_number}`);

                // Log logout event for previous seat
                await supabase.from('actlog_iot').insert({
                    seat_number: seat.seat_number,
                    event: 'logout',
                    uid: lastScannedRfid,
                    decibel: null
                });
            }
        }

        // Step 3: Check if target seat exists, create if not
        const { data: seatExists } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', tableId)
            .eq('seat_number', seatNumber)
            .maybeSingle();

        if (!seatExists) {
            // Create seat if it doesn't exist
            const { error: createError } = await supabase
                .from('occupancy')
                .insert({
                    table_id: tableId,
                    seat_number: seatNumber,
                    is_occupied: false,
                    occupied_by: null,
                    occupied_at: null
                });

            if (createError) throw createError;
            console.log('✅ Created new seat entry');
        }

        // Step 4: Assign user to new seat
        const { error: assignError } = await supabase
            .from('occupancy')
            .update({
                is_occupied: true,
                occupied_by: userData.email,
                occupied_at: new Date().toISOString()
            })
            .eq('table_id', tableId)
            .eq('seat_number', seatNumber);

        if (assignError) throw assignError;

        // Step 5: Log login event to actlog_iot
        const { error: logError } = await supabase
            .from('actlog_iot')
            .insert({
                seat_number: seatNumber,
                event: 'login',
                uid: lastScannedRfid,
                decibel: null
            });

        if (logError) console.warn('Failed to log activity:', logError);

        console.log('✅ Seat assignment successful:', { table: tableId, seat: seatNumber, user: userData.fullName });

        return {
            success: true,
            tableId: tableId,
            seatNumber: seatNumber,
            message: `Seat ${seatNumber} assigned to ${userData.fullName}`
        };

    } catch (err) {
        console.error('❌ Error in assignUserToSeat:', err);
        return { success: false, error: err.message };
    }
}

/**
 * Display RFID scan result in the UI
 * @param {Object} scanResult - Result from lookupUserByRfid
 * @param {Object|null} seatAssignment - Result from assignUserToSeat (optional)
 */
function displayRfidScan(scanResult, seatAssignment = null) {
    console.log('🎯 displayRfidScan() called with:', { scanResult, seatAssignment });
    
    // Fail-safe: Check if display container exists
    const displayContainer = document.getElementById('rfidScanDisplay');
    if (!displayContainer) {
        console.warn('⚠️ RFID Scan Display container not found in DOM. Add #rfidScanDisplay to dashboard.html');
        return;
    }
    
    console.log('✅ Container found, current hidden state:', displayContainer.classList.contains('hidden'));

    const successDiv = document.getElementById('rfidSuccess');
    const inactiveDiv = document.getElementById('rfidInactive');
    const unregisteredDiv = document.getElementById('rfidUnregistered');
    const adminModeDiv = document.getElementById('rfidAdminMode');
    const scanTimeSpan = document.getElementById('rfidScanTime');

    // Clear previous timeout
    if (scanDisplayTimeout) {
        clearTimeout(scanDisplayTimeout);
        scanDisplayTimeout = null;
    }

    // Hide all state divs first
    successDiv?.classList.add('hidden');
    inactiveDiv?.classList.add('hidden');
    unregisteredDiv?.classList.add('hidden');

    // Show admin mode indicator if active
    if (rfidAdminMode) {
        adminModeDiv?.classList.remove('hidden');
    } else {
        adminModeDiv?.classList.add('hidden');
    }

    // Update scan time
    const now = new Date();
    if (scanTimeSpan) {
        scanTimeSpan.textContent = `Scanned at ${now.toLocaleTimeString()}`;
    }

    // ========================================================================
    // MANUAL CLOSE RESPECT: Only auto-open if user hasn't manually closed
    // ========================================================================
    // If user clicked the X button (userManuallyClosed = true), the panel
    // stays closed and shows a red notification badge instead.
    // The flag resets when:
    // 1. A truly NEW scan arrives (different UID/timestamp)
    // 2. Panel auto-closes after 8 seconds (timeout expires)
    // This prevents annoying auto-reopen behavior during polling.
    // ========================================================================
    
    const rfidFloatingBtn = document.getElementById('rfidFloatingBtn');
    const rfidBadge = document.getElementById('rfidBadge');
    
    if (!userManuallyClosed) {
        // User hasn't manually closed - auto-open the panel
        displayContainer.classList.remove('hidden');
        displayContainer.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
        displayContainer.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
        
        // Hide the floating button (it's replaced by the expanded panel)
        if (rfidFloatingBtn) {
            rfidFloatingBtn.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
        }
        
        // Hide notification badge (no need to show when panel is open)
        if (rfidBadge) {
            rfidBadge.classList.add('hidden');
        }
        
        isPanelOpen = true;
        console.log('🔓 RFID panel auto-opened');
    } else {
        // User manually closed - respect their choice, show badge instead
        console.log('⏸️ Panel stays closed (user manually closed it). Showing badge instead.');
        displayContainer.classList.add('hidden');
        if (rfidBadge) {
            rfidBadge.classList.remove('hidden'); // Show red pulse badge to notify activity
        }
    }

    // Handle different scan results
    if (scanResult.success) {
        // Success - show user info
        successDiv?.classList.remove('hidden');
        
        // Reset icon to green check mark (in case it was changed to logout icon)
        const iconContainer = successDiv?.querySelector('.w-10.h-10');
        if (iconContainer) {
            iconContainer.className = 'w-10 h-10 bg-green-100 rounded-full flex items-center justify-center flex-shrink-0';
            const icon = iconContainer?.querySelector('i');
            if (icon) {
                icon.className = 'w-5 h-5 text-green-600';
                icon.setAttribute('data-lucide', 'check');
            }
        }
        
        // Fail-safe: Check if elements exist before setting content
        const nameEl = document.getElementById('rfidUserName');
        const emailEl = document.getElementById('rfidUserEmail');
        const studentIdEl = document.getElementById('rfidStudentId');
        const seatEl = document.getElementById('rfidSeatNumber');

        if (nameEl) nameEl.textContent = scanResult.user?.fullName || 'Unknown';
        if (emailEl) emailEl.textContent = scanResult.user?.email || 'N/A';
        if (studentIdEl) studentIdEl.textContent = scanResult.user?.studentId || 'N/A';

        if (seatEl) {
            if (seatAssignment && seatAssignment.success) {
                seatEl.textContent = `${seatAssignment.tableId} - Seat ${seatAssignment.seatNumber}`;
            } else {
                seatEl.textContent = 'Pending...';
            }
        }

        // Refresh Lucide icons
        if (window.lucide) lucide.createIcons();

        // Auto-hide after 8 seconds (extended for visibility)
        scanDisplayTimeout = setTimeout(() => {
            closeRfidPanel(false); // false = auto-close, not manual
            console.log('✅ RFID scan display auto-hidden (reset manual close flag)');
        }, 8000);

    } else if (scanResult.error === 'inactive') {
        // Inactive card
        inactiveDiv?.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();

        // Auto-hide after 8 seconds
        scanDisplayTimeout = setTimeout(() => {
            closeRfidPanel(false); // false = auto-close, not manual
            console.log('⚠️ RFID inactive display auto-hidden (reset manual close flag)');
        }, 8000);

    } else if (scanResult.error === 'unregistered') {
        // Unregistered card
        unregisteredDiv?.classList.remove('hidden');
        const uidEl = document.getElementById('rfidUnknownUid');
        if (uidEl) uidEl.textContent = scanResult.rfidUid || 'Unknown';
        if (window.lucide) lucide.createIcons();

        // Auto-hide after 8 seconds
        scanDisplayTimeout = setTimeout(() => {
            closeRfidPanel(false); // false = auto-close, not manual
            console.log('❌ RFID unregistered display auto-hidden (reset manual close flag)');
        }, 8000);
    }
    
    // Log display state for debugging
    console.log('🎫 RFID scan display updated:', {
        visible: !displayContainer.classList.contains('hidden'),
        state: scanResult.success ? 'success' : scanResult.error || 'unknown'
    });
}

/**
 * Display logout notification in the RFID panel
 * Shows when a user logs out by tapping their card
 */
function displayLogoutNotification(logoutData) {
    console.log('👋 Displaying logout notification:', logoutData);
    
    const displayContainer = document.getElementById('rfidScanDisplay');
    if (!displayContainer) {
        console.warn('⚠️ RFID Scan Display container not found');
        return;
    }

    const successDiv = document.getElementById('rfidSuccess');
    const inactiveDiv = document.getElementById('rfidInactive');
    const unregisteredDiv = document.getElementById('rfidUnregistered');
    const scanTimeSpan = document.getElementById('rfidScanTime');

    // Clear previous timeout
    if (scanDisplayTimeout) {
        clearTimeout(scanDisplayTimeout);
        scanDisplayTimeout = null;
    }

    // Hide all state divs
    successDiv?.classList.add('hidden');
    inactiveDiv?.classList.add('hidden');
    unregisteredDiv?.classList.add('hidden');

    // Update scan time
    const now = new Date();
    if (scanTimeSpan) {
        scanTimeSpan.textContent = `Logged out at ${now.toLocaleTimeString()}`;
    }

    // Show logout message in success div (reuse for logout)
    if (successDiv) {
        successDiv.classList.remove('hidden');
        
        // Update elements to show logout info
        const nameEl = document.getElementById('rfidUserName');
        const emailEl = document.getElementById('rfidUserEmail');
        const studentIdEl = document.getElementById('rfidStudentId');
        const seatEl = document.getElementById('rfidSeatNumber');

        if (nameEl) nameEl.textContent = logoutData.userName;
        if (emailEl) emailEl.textContent = 'Logged Out';
        if (studentIdEl) studentIdEl.textContent = '—';
        if (seatEl) seatEl.textContent = `Seat ${logoutData.seatNumber || '—'} freed`;

        // Change icon to logout icon (reuse check icon area)
        const iconContainer = successDiv.querySelector('.w-10.h-10');
        if (iconContainer) {
            iconContainer.className = 'w-10 h-10 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0';
            const icon = iconContainer.querySelector('i');
            if (icon) {
                icon.className = 'w-5 h-5 text-blue-600';
                icon.setAttribute('data-lucide', 'log-out');
            }
        }
    }

    // Auto-open panel if user hasn't manually closed it
    const rfidFloatingBtn = document.getElementById('rfidFloatingBtn');
    const rfidBadge = document.getElementById('rfidBadge');
    
    if (!userManuallyClosed) {
        displayContainer.classList.remove('hidden');
        displayContainer.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
        displayContainer.classList.remove('opacity-0', 'scale-95', 'pointer-events-none');
        
        if (rfidFloatingBtn) {
            rfidFloatingBtn.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
        }
        
        if (rfidBadge) {
            rfidBadge.classList.add('hidden');
        }
        
        isPanelOpen = true;
        console.log('👋 Logout panel auto-opened');
    } else {
        displayContainer.classList.add('hidden');
        if (rfidBadge) {
            rfidBadge.classList.remove('hidden');
        }
    }

    // Refresh Lucide icons
    if (window.lucide) lucide.createIcons();

    // Auto-hide after 6 seconds (shorter for logout)
    scanDisplayTimeout = setTimeout(() => {
        closeRfidPanel(false);
        console.log('👋 Logout notification auto-hidden');
    }, 6000);
}

/**
 * Handle RFID scan detection from actlog_iot table
 * This function is called by the polling system when a new scan is detected
 */
async function handleRfidScan(rfidUid, tableId, seatNumber) {
    try {
        console.log('🎫 RFID Scan Detected:', { rfidUid, tableId, seatNumber });

        lastScannedRfid = rfidUid;

        // Step 1: Look up user by RFID (always returns an object, never throws)
        const userLookup = await lookupUserByRfid(rfidUid);

        // Step 2: If user found, assign to seat
        let seatAssignment = null;
        if (userLookup && userLookup.success) {
            try {
                seatAssignment = await assignUserToSeat(userLookup.user, tableId, seatNumber);
            } catch (seatErr) {
                console.error('❌ Error assigning seat:', seatErr);
                // Continue anyway to show user lookup result
            }
        }

        // Step 3: Display result in UI (fail-safe function with null checks)
        displayRfidScan(userLookup, seatAssignment);

        // Step 4: Refresh dashboard data
        const userEmail = sessionStorage.getItem('userEmail');
        if (userEmail) {
            loadUserInfo(userEmail);
        }
    } catch (err) {
        console.error('❌ Unexpected error in handleRfidScan:', err);
        // Don't throw - just log and continue polling
    }
}

// ============================================================================
// RFID SCAN DEDUPLICATION & PANEL STATE MANAGEMENT
// ============================================================================
// These variables prevent the panel from reopening repeatedly when polling
// detects the same scan multiple times from the backend.
//
// Problem: Backend polling (every 1.5s) returns the same scan row repeatedly,
// causing the panel to flicker or reopen even after the user closes it.
//
// Solution: Track event history per UID to determine true state changes:
// 1. lastProcessedScanId - Database row ID (may change on each insert)
// 2. lastProcessedScanTimestamp - Exact timestamp of scan creation
// 3. lastProcessedScanUid - RFID card UID (the actual card being scanned)
// 4. lastEventByUid - Map of UID -> last event type (login/logout)
//
// A scan is only considered "new" if it represents a STATE CHANGE for that UID.
// This prevents duplicate processing and logout->login flicker.
// ============================================================================

let lastProcessedScanId = null;        // Last processed database row ID
let lastProcessedScanTimestamp = null; // Last processed scan timestamp
let lastProcessedScanUid = null;       // Last processed RFID card UID
let lastEventByUid = new Map();        // Track last event type per UID (login/logout)
let userManuallyClosed = false;        // Flag: User clicked X button to close panel
let isPanelOpen = false;               // Current panel visibility state

/**
 * ============================================================================
 * Poll actlog_iot table for new RFID scans
 * ============================================================================
 * This function runs every 1.5 seconds to detect new scans from the Arduino.
 * 
 * STATE CHANGE DETECTION LOGIC:
 * Instead of processing every event, we track the LAST EVENT TYPE per UID.
 * An event is only processed if it represents a STATE CHANGE:
 * 
 * Example Flow:
 * 1. User taps card (not logged in) → 'login' event → Process (show login panel)
 * 2. Polling continues → Still sees 'login' → Skip (no state change)
 * 3. User taps card again (logged in) → 'logout' event → Process (show logout panel)
 * 4. Polling continues → Still sees 'logout' → Skip (no state change)
 * 
 * Why This Works:
 * - Prevents duplicate processing of same event
 * - Handles rapid login/logout sequences correctly
 * - No flicker from processing both logout and login in quick succession
 * - Only shows notification when user's actual state changes
 * 
 * Transfer Handling:
 * During transfers, Arduino creates: logout (old table) → login (new table)
 * Since these have SAME UID but DIFFERENT timestamps, we detect both.
 * We process the LATEST event (login), which is correct for transfers.
 * 
 * MANUAL CLOSE RESPECT:
 * When a state change is detected, userManuallyClosed resets to false,
 * allowing the panel to auto-open for the new event.
 * ============================================================================
 */
async function checkForNewRfidScans() {
    try {
        // ====================================================================
        // FETCH LAST 5 EVENTS: Get multiple events to handle rapid login/logout
        // During transfers, Arduino creates logout then login events quickly.
        // We need to see the full sequence to determine the final state.
        // ====================================================================
        const { data: recentScans, error } = await supabase
            .from('actlog_iot')
            .select('id, seat_number, event, uid, created_at, name')
            .in('event', ['login', 'logout'])
            .order('created_at', { ascending: false })
            .limit(5); // Get last 5 events to see full context

        if (error) {
            console.error('Error checking for RFID scans:', error);
            return;
        }

        if (!recentScans || recentScans.length === 0) return;

        // ====================================================================
        // GROUP EVENTS BY UID: Find the most recent event for each unique UID
        // ====================================================================
        const latestEventByUid = new Map();
        
        for (const scan of recentScans) {
            const uid = scan.uid;
            
            // Only process recent scans (within 10 seconds)
            const scanTime = new Date(scan.created_at);
            const now = new Date();
            const ageInSeconds = (now - scanTime) / 1000;
            
            if (ageInSeconds > 10) continue; // Skip old scans
            
            // Store the first (most recent) event for this UID
            if (!latestEventByUid.has(uid)) {
                latestEventByUid.set(uid, scan);
            }
        }

        // ====================================================================
        // PROCESS EACH UID: Check if event represents a state change
        // ====================================================================
        if (latestEventByUid.size > 0) {
            console.log('📋 Found', latestEventByUid.size, 'unique UID(s) with recent events');
        }
        
        for (const [uid, scan] of latestEventByUid) {
            const lastKnownEvent = lastEventByUid.get(uid);
            const currentEvent = scan.event;
            
            // ============================================================
            // STATE CHANGE DETECTION: Only process if event type changed
            // Example: Last was 'login', now is 'logout' → Process logout
            //          Last was 'logout', now is 'login' → Process login
            //          Last was 'login', now is 'login' → Skip (duplicate)
            // ============================================================
            const isStateChange = lastKnownEvent !== currentEvent;
            
            if (isStateChange) {
                console.log('🔄 State change detected for UID:', uid);
                console.log('📊 Event details:', {
                    uid: uid,
                    previousState: lastKnownEvent || 'unknown',
                    newState: currentEvent,
                    seat: scan.seat_number,
                    timestamp: scan.created_at
                });
                
                // Update tracking: Remember this event for this UID
                lastEventByUid.set(uid, currentEvent);
                
                // Update global tracking (for backwards compatibility)
                lastProcessedScanId = scan.id;
                lastProcessedScanTimestamp = scan.created_at;
                lastProcessedScanUid = uid;
                
                // Reset manual close flag for new state changes
                userManuallyClosed = false;

                // ========================================================
                // HANDLE EVENT TYPE: Process login vs logout
                // ========================================================
                if (currentEvent === 'login') {
                    console.log('✅ Processing LOGIN for UID:', uid);
                    const tableId = 'table-1';
                    await handleRfidScan(
                        uid,
                        tableId,
                        scan.seat_number
                    );
                } else if (currentEvent === 'logout') {
                    console.log('👋 Processing LOGOUT for UID:', uid);
                    displayLogoutNotification({
                        rfidUid: uid,
                        userName: scan.name || 'User',
                        seatNumber: scan.seat_number
                    });
                    
                    // Refresh dashboard to update occupancy
                    const userEmail = sessionStorage.getItem('userEmail');
                    if (userEmail) {
                        loadUserInfo(userEmail);
                    }
                }
            } else {
                // No state change - same event as last time (duplicate)
                // Skip silently to avoid console spam
            }
        }

    } catch (err) {
        console.error('Error in checkForNewRfidScans:', err);
    }
}

// Toggle admin mode (can be called from browser console for testing)
window.toggleRfidAdminMode = function () {
    rfidAdminMode = !rfidAdminMode;
    console.log(`🔧 Admin Mode: ${rfidAdminMode ? 'ENABLED' : 'DISABLED'}`);
};

// Test function to manually trigger RFID display (call from console)
window.testRfidDisplay = function() {
    console.log('🧪 Testing RFID display...');
    
    const testScanResult = {
        success: true,
        rfidUid: 'TEST123456',
        isActive: true,
        user: {
            id: 'test-id',
            email: 'test@example.com',
            firstName: 'Test',
            lastName: 'User',
            fullName: 'Test User',
            studentId: 'S12345',
            isAdmin: false
        }
    };
    
    const testSeatAssignment = {
        success: true,
        tableId: 'table-1',
        seatNumber: 5
    };
    
    displayRfidScan(testScanResult, testSeatAssignment);
    console.log('✅ Test display triggered - check top-right corner!');

    const adminModeDiv = document.getElementById('rfidAdminMode');
    if (rfidAdminMode) {
        adminModeDiv?.classList.remove('hidden');
    } else {
        adminModeDiv?.classList.add('hidden');
    }

    return rfidAdminMode;
};

// ================================================================
// ====== END RFID SCANNING SYSTEM ======
// ================================================================

// == UI INIT: Fade, cursor, nav, lucide ==
document.addEventListener('DOMContentLoaded', function () {
    // Set up RFID registration form
    document.getElementById('assignRfidForm')?.addEventListener('submit', handleRfidRegistration);

    // Lucide icons
    if (window.lucide) lucide.createIcons();

    // Fade in content
    setTimeout(() => {
        const fadeContent = document.querySelector('.fade-content');
        if (fadeContent) fadeContent.classList.add('is-visible');
    }, 100);

    // Check if user needs to register RFID
    updateUserRfidStatus();

    // Cursor follower effect
    const cursorFollower = document.getElementById('cursor-follower');
    let mouseX = 0, mouseY = 0, followerX = 0, followerY = 0;
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX; mouseY = e.clientY;
        cursorFollower.style.opacity = '1';
    });
    function animateCursor() {
        followerX += (mouseX - followerX) * 0.1;
        followerY += (mouseY - followerY) * 0.1;
        cursorFollower.style.transform = `translate(${followerX}px, ${followerY}px) translate(-50%, -50%)`;
        requestAnimationFrame(animateCursor);
    }
    animateCursor();

    // Header trigger menu logic
    const headerTrigger = document.getElementById('headerTrigger');
    const headerNav = document.getElementById('headerNav');
    let headerExpanded = false;
    headerTrigger?.addEventListener('click', () => {
        headerExpanded = !headerExpanded;
        if (headerExpanded) {
            headerTrigger.classList.add('header-expanded', 'trigger-expanded');
            headerNav.classList.remove('header-collapsed');
            headerNav.classList.add('header-expanded');
        } else {
            headerTrigger.classList.remove('header-expanded', 'trigger-expanded');
            headerNav.classList.remove('header-expanded');
            headerNav.classList.add('header-collapsed');
        }
    });

    // Mobile burger menu logic
    const burgerBtn = document.getElementById('burgerMenuBtn');
    const mobileOverlay = document.getElementById('mobileMenuOverlay');
    const mobilePanel = document.getElementById('mobileMenuPanel');
    burgerBtn?.addEventListener('click', () => {
        burgerBtn.classList.toggle('active');
        mobileOverlay.classList.toggle('active');
        mobilePanel.classList.toggle('active');
    });
    mobileOverlay?.addEventListener('click', () => {
        burgerBtn.classList.remove('active');
        mobileOverlay.classList.remove('active');
        mobilePanel.classList.remove('active');
    });

    // Navigation item hover label (UI label)
    const navItems = document.querySelectorAll('.sidebar-nav-item');
    const navLabel = document.getElementById('navLabel');
    navItems.forEach(item => {
        item.addEventListener('mouseenter', (e) => {
            const label = e.currentTarget.getAttribute('data-label');
            navLabel.textContent = label; navLabel.classList.add('visible');
        });
        item.addEventListener('mouseleave', () => navLabel.classList.remove('visible'));
    });
});

// Check authentication on page load
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
        console.log('No user found, redirecting to login...');
        window.location.href = 'login.html';
        return;
    }

    // Verify user exists in database and check if admin
    const { data: existingUser } = await supabase
        .from('users')
        .select('*, is_admin')
        .eq('email', userEmail)
        .single();

    if (!existingUser) {
        // User was deleted, clear everything and redirect
        console.log('User was deleted from database, signing out...');
        await supabase.auth.signOut();
        sessionStorage.removeItem('userEmail');
        window.location.href = 'login.html';
        return;
    }

    // If admin, redirect to admin dashboard
    if (existingUser.is_admin === true) {
        window.location.href = 'setup.html';
        return;
    }

    // User exists and is not admin, load dashboard
    startNowClock();
    loadUserInfo(userEmail);

    // Auto-refresh dashboard every 2 seconds
    // Polling with Page Visibility pause
    let pollHandle = null;
    let rfidPollHandle = null;

    const startPolling = () => {
        if (pollHandle) return;
        pollHandle = setInterval(() => loadUserInfo(userEmail), 2000);
    };

    const stopPolling = () => {
        if (pollHandle) {
            clearInterval(pollHandle);
            pollHandle = null;
        }
    };

    // Start RFID scan detection polling (checks actlog_iot for new scans)
    const startRfidPolling = () => {
        if (rfidPollHandle) return;
        rfidPollHandle = setInterval(() => checkForNewRfidScans(), 1500);
    };

    const stopRfidPolling = () => {
        if (rfidPollHandle) {
            clearInterval(rfidPollHandle);
            rfidPollHandle = null;
        }
    };

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            stopPolling();
            stopRfidPolling();
        } else {
            startPolling();
            startRfidPolling();
        }
    });

    startPolling();
    startRfidPolling();

    // Prevent navigation away from student pages
    setupNavigationGuard();
});

async function loadUserInfo(email) {
    try {
        // Get user details
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', email)
            .single();

        if (userError) {
            console.error('Error loading user:', userError);
            // Don't redirect on database errors - only show error in UI
            document.getElementById('statusText').textContent = 'Error loading data. Please refresh.';
            return;
        }

        if (!users) {
            // User not found, redirect to login
            console.log('User not found, redirecting...');
            await supabase.auth.signOut();
            sessionStorage.removeItem('userEmail');
            window.location.href = 'login.html';
            return;
        }

        // Display user's name, fallback to email if name not available
        let displayName = '';
        if (users.first_name || users.last_name) {
            displayName = (users.first_name || '') + ' ' + (users.last_name || '');
            displayName = displayName.trim();
        }
        if (!displayName) {
            displayName = users.email; // Fallback to email if no name
        }
        document.getElementById('userName').textContent = displayName;
        document.getElementById('welcomeSub').textContent = 'Student Portal';

        // Check for correction requests
        checkCorrectionRequests();

        // Get user's access device
        const { data: rfidCards, error: rfidError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('user_id', users.id)
            .eq('is_active', true)
            .limit(1);

        if (rfidError) throw rfidError;

        const hasRfid = rfidCards && rfidCards.length > 0;
        const rfidUid = hasRfid ? rfidCards[0].rfid_uid : '';

        // Show/hide RFID assignment form
        if (hasRfid) {
            document.getElementById('rfidAssignment').style.display = 'none';
            document.getElementById('myStatus').style.display = 'block';
            // Don't show seat and noise here - wait until we confirm occupancy

            // First, check if user is currently occupying any seat
            const { data: currentSeat, error: seatError } = await supabase
                .from('occupancy')
                .select('*')
                .eq('occupied_by', email)
                .eq('is_occupied', true)
                .maybeSingle();

            if (!seatError && currentSeat) {
                // User is occupying a seat - show it
                setSessionPill(true);
                document.getElementById('statusText').innerHTML = 'Device ID: ' + rfidUid + ' · <span style="color:green">Active Session</span>';

                document.getElementById('mySeat').style.display = 'block';
                document.getElementById('myNoise').style.display = 'block';

                // Format table name (e.g., "table-1" -> "Table 1")
                const tableName = currentSeat.table_id.replace('table-', 'Table ');
                document.getElementById('seatInfo').innerHTML =
                    '📍 ' + tableName + ', Seat ' + currentSeat.seat_number + ' - <span style="color:green">OCCUPIED</span>';

                // Show noise level for the user's current table
                displayCurrentNoiseLevel(currentSeat.table_id);

                // Update stats based on when seat was occupied
                updateStatsApprox(currentSeat.occupied_at);

                // Load announcements and activity
                loadAnnouncementsAndActivity(rfidUid);
            } else {
                // No current seat, check activity log for session history
                const { data: events, error: eventError } = await supabase
                    .from('actlog_iot')
                    .select('*')
                    .eq('uid', rfidCards[0].rfid_uid)
                    .order('created_at', { ascending: false })
                    .limit(10);

                if (!eventError && events && events.length > 0) {
                    // Find most recent login or logout event (skip noise events)
                    let lastEvent = null;
                    for (let i = 0; i < events.length; i++) {
                        if (events[i].event === 'login' || events[i].event === 'logout') {
                            lastEvent = events[i];
                            break;
                        }
                    }

                    if (lastEvent && lastEvent.event === 'login') {
                        // Had a login but not currently in occupancy table - session ended
                        setSessionPill(false);
                        document.getElementById('statusText').innerHTML = 'Device ID: ' + rfidUid + ' · <span style="color:red">Session Ended</span>';

                        document.getElementById('mySeat').style.display = 'none';
                        document.getElementById('myNoise').style.display = 'none';

                        setNoiseUI(null);
                        updateStatsApprox(null);
                        loadAnnouncementsAndActivity(rfidUid);
                    } else {
                        setSessionPill(false);
                        document.getElementById('statusText').innerHTML = 'Device ID: ' + rfidUid + ' · <span style="color:red">Session Ended</span>';

                        // Hide seat and noise sections when not occupied
                        document.getElementById('mySeat').style.display = 'none';
                        document.getElementById('myNoise').style.display = 'none';

                        setNoiseUI(null);
                        updateStatsApprox(null);
                        loadAnnouncementsAndActivity(rfidUid);
                    }
                } else {
                    setSessionPill(false);
                    document.getElementById('statusText').innerHTML = 'Device ID: ' + rfidUid + ' · <span style="color:orange">No active session</span>';

                    // Hide seat and noise sections when not occupied
                    document.getElementById('mySeat').style.display = 'none';
                    document.getElementById('myNoise').style.display = 'none';

                    setNoiseUI(null);
                    updateStatsApprox(null);
                    loadAnnouncementsAndActivity(rfidUid);
                }
            }
        } else {
            // No access device - show registration form
            document.getElementById('rfidAssignment').style.display = 'block';
            document.getElementById('myStatus').style.display = 'none';
            document.getElementById('mySeat').style.display = 'none';
            document.getElementById('myNoise').style.display = 'none';
        }

    } catch (err) {
        console.error('Error loading user info:', err);

        if (err.message && (err.message.includes('not found') || err.message.includes('Row not found'))) {
            console.log('User not found, signing out...');
            await supabase.auth.signOut();
            sessionStorage.removeItem('userEmail');
            window.location.href = 'login.html';
            return;
        }

        document.getElementById('statusText').textContent = 'Error: ' + err.message;
    }
}

async function displayCurrentNoiseLevel(tableId) {
    try {
        // Require a valid tableId; if missing, clear UI
        if (!tableId) {
            setNoiseUI(null);
            return;
        }

        // Fetch current noise level for the specified table
        const { data: noiseData, error } = await supabase
            .from('noise_log')
            .select('*')
            .eq('table_id', tableId)
            .maybeSingle();

        if (!error && noiseData && noiseData.decibel !== undefined) {
            const db = Math.round(noiseData.decibel);
            let emoji = '🟢';
            let tip = 'Quiet environment.';
            if (db > 70) { emoji = '🔴'; tip = 'Very loud. Consider moving or reporting a noise issue.'; }
            else if (db > 55) { emoji = '🟠'; tip = 'Loud. Headphones recommended.'; }
            else if (db > 40) { emoji = '🟡'; tip = 'Moderate noise.'; }

            setNoiseUI({ db, emoji, updatedAt: noiseData.updated_at, tip });
        } else {
            setNoiseUI(null);
        }
    } catch (err) {
        setNoiseUI(null);
    }
}

// Helpers/UI updaters
function startNowClock() {
    const el = document.getElementById('nowTime');
    if (!el) return;
    const tick = () => { el.textContent = new Date().toLocaleString(); };
    tick();
    setInterval(tick, 1000);
}

function setSessionPill(isLoggedIn) {
    const pill = document.getElementById('sessionPill');
    if (!pill) return;
    if (isLoggedIn) {
        pill.textContent = 'Device Active';
        pill.className = 'text-xs px-3 py-1 rounded-full bg-green-100 text-green-800';
    } else {
        pill.textContent = 'Device Inactive';
        pill.className = 'text-xs px-3 py-1 rounded-full bg-gray-200 text-gray-700';
    }
}

function setNoiseUI(payload) {
    const emojiEl = document.getElementById('noiseEmoji');
    const dbEl = document.getElementById('noiseDb');
    const updEl = document.getElementById('noiseUpdated');
    const tipEl = document.getElementById('noiseTip');
    const gaugeEl = document.getElementById('noiseGauge');
    const comfortEl = document.getElementById('noiseComfort');
    const containerEl = document.getElementById('myNoise');

    if (!emojiEl || !dbEl || !updEl || !tipEl || !gaugeEl || !comfortEl || !containerEl) return;

    if (!payload) {
        emojiEl.textContent = '—';
        dbEl.textContent = '—';
        updEl.textContent = 'No noise data';
        tipEl.textContent = 'Tap your device at the reader to start monitoring noise levels';
        comfortEl.textContent = '';
        gaugeEl.style.width = '0%';
        containerEl.className = 'p-6 bg-gradient-to-br from-green-50 to-teal-50 rounded-xl border border-green-100';
        return;
    }

    const db = payload.db || 0;
    emojiEl.textContent = payload.emoji;
    dbEl.textContent = db;

    // Update comfort level text
    let comfortText = '';
    let comfortColor = '';
    if (db < 30) {
        comfortText = 'Comfortable';
        comfortColor = 'text-green-600';
    } else if (db <= 40) {
        comfortText = 'Lower Noise';
        comfortColor = 'text-yellow-600';
    } else if (db <= 55) {
        comfortText = 'Moderate';
        comfortColor = 'text-orange-600';
    } else if (db <= 70) {
        comfortText = 'Loud';
        comfortColor = 'text-red-600';
    } else {
        comfortText = 'Very Loud';
        comfortColor = 'text-red-600';
    }
    comfortEl.textContent = comfortText;
    comfortEl.className = `ml-2 text-sm font-medium ${comfortColor}`;

    // Update container background and border for warning
    if (db < 30) {
        containerEl.className = 'p-6 bg-gradient-to-br from-green-50 to-teal-50 rounded-xl border border-green-100';
    } else {
        containerEl.className = 'p-6 bg-gradient-to-br from-yellow-50 to-orange-50 rounded-xl border border-yellow-200';
    }

    // Update gauge (0-100dB scale, max 100%)
    const gaugePercent = Math.min((db / 100) * 100, 100);
    gaugeEl.style.width = `${gaugePercent}%`;

    updEl.textContent = payload.updatedAt ? 'Updated: ' + new Date(payload.updatedAt).toLocaleTimeString() : '—';
    tipEl.textContent = payload.tip || '';
}

async function updateStatsApprox(loginAt) {
    const sessionEl = document.getElementById('statSessionTime');
    const weekEl = document.getElementById('statWeekSessions');
    const avgEl = document.getElementById('statAvgLength');

    if (sessionEl && loginAt) {
        const ms = Date.now() - new Date(loginAt).getTime();
        const mins = Math.max(0, Math.floor(ms / 60000));
        sessionEl.textContent = mins + 'm';
    } else if (sessionEl) {
        sessionEl.textContent = '0m';
    }

    // Calculate real stats if we have rfidUid
    const rfidUid = sessionStorage.getItem('rfidUid') || '';
    if (rfidUid) {
        await calculateRealStats(rfidUid, weekEl, avgEl);
        return;
    }

    // If no RFID UID, try to resolve the current logged-in user's registered RFID
    const userEmail = sessionStorage.getItem('userEmail') || '';
    if (userEmail) {
        try {
            const { data: user, error: userError } = await supabase
                .from('users')
                .select('id')
                .eq('email', userEmail)
                .maybeSingle();

            if (!userError && user && user.id) {
                const { data: card, error: cardError } = await supabase
                    .from('rfid_cards')
                    .select('rfid_uid')
                    .eq('user_id', user.id)
                    .maybeSingle();

                if (!cardError && card && card.rfid_uid) {
                    // Cache the found rfidUid for faster subsequent loads
                    sessionStorage.setItem('rfidUid', card.rfid_uid);
                    await calculateRealStats(card.rfid_uid, weekEl, avgEl);
                    return;
                }
            }
        } catch (err) {
            console.error('Error resolving user RFID:', err);
        }
    }

    // Fallback: show site-wide weekly sessions
    if (weekEl) {
        weekEl.textContent = '...';
        await fetchWeeklySessions(weekEl);
    }
    if (avgEl) avgEl.textContent = '0m';
}

async function calculateRealStats(rfidUid, weekEl, avgEl) {
    try {
        // Get events from last 7 days
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        const { data: events } = await supabase
            .from('actlog_iot')
            .select('event, created_at')
            .eq('uid', rfidUid)
            .in('event', ['login', 'logout'])
            .gte('created_at', oneWeekAgo.toISOString())
            .order('created_at', { ascending: true });

        if (!events || events.length === 0) {
            if (weekEl) weekEl.textContent = '0';
            if (avgEl) avgEl.textContent = '0m';
            return;
        }

        // Count sessions (each login is a session start)
        const sessionCount = events.filter(e => e.event === 'login').length;
        if (weekEl) weekEl.textContent = sessionCount.toString();

        // Calculate average session length
        let totalSessionTime = 0;
        let activeSessions = 0;
        let loginTime = null;

        for (const event of events) {
            if (event.event === 'login') {
                loginTime = new Date(event.created_at);
                activeSessions++;
            } else if (event.event === 'logout' && loginTime) {
                const sessionLength = new Date(event.created_at).getTime() - loginTime.getTime();
                totalSessionTime += sessionLength;
                loginTime = null;
                activeSessions--;
            }
        }

        // Handle case where there's an active login without logout
        if (loginTime && activeSessions > 0) {
            const currentTime = Date.now();
            const sessionLength = currentTime - loginTime.getTime();
            totalSessionTime += sessionLength;
        }

        const completedSessions = events.filter(e => e.event === 'login').length - (loginTime ? 1 : 0);
        const avgLengthMs = completedSessions > 0 ? totalSessionTime / completedSessions : 0;
        const avgLengthMins = Math.round(avgLengthMs / 60000);

        if (avgEl) {
            if (avgLengthMins > 60) {
                const hours = Math.floor(avgLengthMins / 60);
                const mins = avgLengthMins % 60;
                avgEl.textContent = `${hours}h ${mins}m`;
            } else {
                avgEl.textContent = avgLengthMins + 'm';
            }
        }
    } catch (err) {
        console.error('Error calculating stats:', err);
        if (weekEl) weekEl.textContent = '—';
        if (avgEl) avgEl.textContent = '—';
    }
}

// Fetch site-wide count of login sessions in the last 7 days and set the element text
async function fetchWeeklySessions(weekEl) {
    try {
        const oneWeekAgo = new Date();
        oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

        // Use Supabase to count login events in the last 7 days
        const { count, error } = await supabase
            .from('actlog_iot')
            .select('id', { count: 'exact', head: true })
            .eq('event', 'login')
            .gte('created_at', oneWeekAgo.toISOString());

        if (error) {
            console.error('Error fetching weekly sessions:', error);
            weekEl.textContent = '—';
            return;
        }

        // Supabase returns count as a number when head:true is used
        weekEl.textContent = (typeof count === 'number') ? count.toString() : '0';
    } catch (err) {
        console.error('Unexpected error fetching weekly sessions:', err);
        weekEl.textContent = '—';
    }
}

async function loadAnnouncementsAndActivity(rfidUid) {
    // Announcements from announcements table
    try {
        // Get all announcements (filter out expired client-side)
        const { data: announcements } = await supabase
            .from('announcements')
            .select('*')
            .order('is_priority', { ascending: false })
            .order('created_at', { ascending: false })
            .limit(5);

        // Filter out expired announcements client-side
        const activeAnnouncements = announcements ? announcements.filter(ann => {
            if (!ann.expires_at) return true;
            return new Date(ann.expires_at) > new Date();
        }) : [];
        const container = document.getElementById('announcements');
        const annUpdated = document.getElementById('annUpdated');
        if (annUpdated) annUpdated.textContent = 'Updated ' + new Date().toLocaleTimeString();
        if (container) {
            if (!activeAnnouncements || activeAnnouncements.length === 0) {
                container.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-8 text-center">
                        
                        <p class="text-gray-500 text-sm font-medium">No announcements yet</p>
                        <p class="text-gray-400 text-xs mt-1">Check back later for updates</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            } else {
                container.innerHTML = activeAnnouncements.map(ann => {
                    const timeAgo = formatTimeAgo(ann.created_at);
                    return `
                    <div class="group relative backdrop-blur-sm rounded-xl p-4 border border-indigo-100/50 dark:border-indigo-300/50 hover:border-indigo-300 dark:hover:border-indigo-400 hover:shadow-md transition-all duration-300">
                        ${ann.is_priority ? `
                        <div class="absolute top-3 right-3">
                            <span class="inline-flex items-center gap-1 px-2 py-1 bg-red-100 dark:bg-red-900 text-red-700 dark:text-red-300 text-xs font-semibold rounded-full">
                                <i data-lucide="alert-circle" class="w-3 h-3"></i>
                                Important
                            </span>
                        </div>
                        ` : ''}
                        
                        <div class="flex items-start gap-3 mb-2">
                            <div class="w-8 h-8 bg-gradient-to-br from-indigo-100 to-purple-100 dark:from-indigo-800 dark:to-purple-800 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5">
                                <i data-lucide="${ann.is_priority ? 'alert-triangle' : 'bell'}" class="w-4 h-4 text-indigo-600 dark:text-indigo-300"></i>
                            </div>
                            <div class="flex-1 min-w-0 ${ann.is_priority ? 'pr-20' : ''}">
                                <h4 class="font-bold text-gray-900 dark:text-gray-100 text-base leading-tight mb-1">
                                    ${escapeHtml(ann.title || 'Announcement')}
                                </h4>
                                <p class="text-gray-600 dark:text-gray-300 text-base leading-relaxed whitespace-pre-wrap">
                                    ${escapeHtml(ann.message || '')}
                                </p>
                            </div>
                        </div>
                        
                        <div class="flex items-center justify-between mt-3 pt-3 border-t border-gray-100 dark:border-gray-700">
                            <span class="text-sm text-gray-500 dark:text-gray-400 flex items-center gap-1">
                                <i data-lucide="clock" class="w-3 h-3"></i>
                                ${timeAgo}
                            </span>
                        </div>
                    </div>
                `}).join('');
                if (window.lucide) lucide.createIcons();
            }
        }
    } catch (e) {
        console.error('Error loading announcements:', e);
        const container = document.getElementById('announcements');
        if (container) {
            container.innerHTML = '<p class="text-gray-500 text-sm">Error loading announcements</p>';
        }
    }

    // Activity (recent session activity for this device)
    try {
        if (!rfidUid) {
            const tl = document.getElementById('activityTimeline');
            if (tl) {
                tl.innerHTML = `
                    <div class="flex flex-col items-center justify-center py-8 text-center">
                        <div class="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-3">
                            <i data-lucide="radio" class="w-8 h-8 text-gray-400"></i>
                        </div>
                        <p class="text-gray-500 text-sm font-medium">No RFID device registered</p>
                        <p class="text-gray-400 text-xs mt-1">Register your access card to start tracking</p>
                    </div>
                `;
                if (window.lucide) lucide.createIcons();
            }
            return;
        }
        // Fetch a larger slice for grouping (last 40 events)
        const { data: rawEvents } = await supabase
            .from('actlog_iot')
            .select('event, seat_number, created_at')
            .eq('uid', rfidUid)
            .in('event', ['login', 'logout'])
            .order('created_at', { ascending: false })
            .limit(40);

        const tl = document.getElementById('activityTimeline');
        if (!tl) return;

        if (!rawEvents || rawEvents.length === 0) {
            tl.innerHTML = `
                <div class="flex flex-col items-center justify-center py-8 text-center">
                    <div class="w-16 h-16 bg-gradient-to-br from-gray-100 to-gray-200 rounded-full flex items-center justify-center mb-3">
                        <i data-lucide="calendar-x" class="w-8 h-8 text-gray-400"></i>
                    </div>
                    <p class="text-gray-500 text-sm font-medium">No activity today</p>
                    <p class="text-gray-400 text-xs mt-1">Your sessions will appear here</p>
                </div>
            `;
            return;
        }

        // Compute today's study time & login count using pairs
        const todayStart = new Date(); todayStart.setHours(0, 0, 0, 0);
        const todayEvents = rawEvents.filter(ev => new Date(ev.created_at) >= todayStart);
        let currentLoginTime = null;
        let studyMs = 0;
        let loginCountToday = 0;
        for (const ev of [...todayEvents].reverse()) { // chronological
            if (ev.event === 'login') {
                loginCountToday++;
                if (!currentLoginTime) currentLoginTime = new Date(ev.created_at);
            } else if (ev.event === 'logout' && currentLoginTime) {
                studyMs += new Date(ev.created_at).getTime() - currentLoginTime.getTime();
                currentLoginTime = null;
            }
        }
        // Active session (no logout yet): count until now
        if (currentLoginTime) {
            studyMs += Date.now() - currentLoginTime.getTime();
        }

        function formatDuration(ms) {
            const mins = Math.floor(ms / 60000);
            if (mins < 60) return mins + 'm';
            const h = Math.floor(mins / 60);
            const m = mins % 60;
            return `${h}h${m ? ' ' + m + 'm' : ''}`;
        }

        // Group events by relative day buckets: Today, Yesterday, Earlier This Week
        const now = new Date();
        const startOfToday = new Date(now.getFullYear(), now.getMonth(), now.getDate());
        const startOfYesterday = new Date(startOfToday.getTime() - 86400000);
        const startOfWeek = new Date(startOfToday.getTime() - 6 * 86400000); // last 7 days window

        const groups = {
            'Today': [],
            'Yesterday': [],
            'Earlier This Week': []
        };

        for (const ev of rawEvents) {
            const dt = new Date(ev.created_at);
            if (dt >= startOfToday) groups['Today'].push(ev);
            else if (dt >= startOfYesterday) groups['Yesterday'].push(ev);
            else if (dt >= startOfWeek) groups['Earlier This Week'].push(ev);
        }

        const iconFor = (ev) => ev.event === 'login'
            ? '<span class="timeline-icon bg-green-100 text-green-600">⏺</span>'
            : '<span class="timeline-icon bg-red-100 text-red-600">◈</span>';
        const labelFor = (ev) => ev.event === 'login' ? 'Seat Reserved' : 'Seat Released';

        const renderEvent = (ev) => {
            const seat = ev.seat_number ? `Seat ${ev.seat_number}` : 'Seat —';
            return `
                <div class="timeline-item">
                    ${iconFor(ev)}
                    <div class="timeline-content">
                        <div class="timeline-primary">${labelFor(ev)}</div>
                        <div class="timeline-meta">
                            ${seat} · <span title="${new Date(ev.created_at).toLocaleString()}">${getTimeAgo(ev.created_at)}</span>
                        </div>
                    </div>
                </div>
            `;
        };

        let html = `
            <div class="timeline-summary-card">
                <div class="flex items-center justify-between mb-2">
                    <div class="text-sm font-medium text-gray-700">Today</div>
                    <div class="text-xs text-gray-500">Updated ${new Date().toLocaleTimeString()}</div>
                </div>
                <div class="grid grid-cols-2 gap-3 text-xs">
                    <div class="p-2 rounded-lg bg-white/60 border border-gray-200">
                        <div class="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Study Time</div>
                        <div class="text-sm font-semibold text-gray-800">${studyMs ? formatDuration(studyMs) : '0m'}</div>
                    </div>
                    <div class="p-2 rounded-lg bg-white/60 border border-gray-200">
                        <div class="text-[11px] uppercase tracking-wide text-gray-500 mb-1">Logins</div>
                        <div class="text-sm font-semibold text-gray-800">${loginCountToday}</div>
                    </div>
                </div>
            </div>
        `;

        const order = ['Today', 'Yesterday', 'Earlier This Week'];
        for (const key of order) {
            const items = groups[key];
            if (!items || items.length === 0) continue;
            html += `
                <div class="timeline-group">
                    <div class="timeline-group-header">${key}</div>
                    <div class="space-y-2">
                        ${items.map(renderEvent).join('')}
                    </div>
                </div>
            `;
        }

        tl.innerHTML = html;
    } catch (e) {
        const tl = document.getElementById('activityTimeline');
        if (tl) tl.innerHTML = '<p class="text-gray-500 text-sm">Unable to load activity</p>';
    }
}

// Utilities (moved to top of file with other helper functions)

// Locate on map action
document.addEventListener('click', function (e) {
    const btn = e.target.closest('#locateOnMapBtn');
    if (btn) {
        // Get current seat number from the page
        const seatInfo = document.getElementById('seatInfo');
        let seatNumber = null;

        if (seatInfo && seatInfo.textContent) {
            // Extract seat number from text like "You are at Seat A-15" or "Seat: A-15"
            const match = seatInfo.textContent.match(/[Ss]eat[:\s]+([A-Z]-\d+)/);
            if (match) {
                seatNumber = match[1];
            }
        }

        // Navigate to map with seat parameter
        if (seatNumber) {
            window.location.href = `map.html?highlight=${encodeURIComponent(seatNumber)}`;
        } else {
            window.location.href = 'map.html';
        }
    }
});

// RFID Assignment form
document.getElementById('assignRfidForm').addEventListener('submit', async function (e) {
    e.preventDefault();

    const rfidInput = document.getElementById('rfidInput').value.trim();
    const userEmail = sessionStorage.getItem('userEmail');

    if (!rfidInput) {
        document.getElementById('rfidError').textContent = 'Please enter your Device ID';
        return;
    }

    try {
        // Get current user
        const { data: users, error: userError } = await supabase
            .from('users')
            .select('*')
            .eq('email', userEmail)
            .single();

        if (userError) throw userError;

        // Check if RFID already exists
        const { data: existingCard, error: cardError } = await supabase
            .from('rfid_cards')
            .select('*')
            .eq('rfid_uid', rfidInput)
            .single();

        if (!cardError && existingCard) {
            document.getElementById('rfidError').textContent = 'This device is already registered to another user';
            return;
        }

        // Insert new device registration
        const { error: insertError } = await supabase
            .from('rfid_cards')
            .insert({
                rfid_uid: rfidInput,
                user_id: users.id,
                is_active: true
            });

        if (insertError) throw insertError;

        alert('Device registered successfully!');
        document.getElementById('rfidInput').value = '';
        loadUserInfo(userEmail);
    } catch (err) {
        document.getElementById('rfidError').textContent = 'Error: ' + err.message;
    }
});

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
                window.history.pushState(null, '', 'dashboard.html');
                window.location.href = 'dashboard.html';
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

// ============= CORRECTION NOTIFICATION FUNCTIONS =============

async function checkCorrectionRequests() {
    try {
        const userEmail = sessionStorage.getItem('userEmail');
        if (!userEmail) return;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', userEmail)
            .single();

        if (error || !user) return;

        // Check if user has correction requests
        if (user.correction_requested && user.correction_reason) {
            showCorrectionAlert(user);
        } else {
            hideCorrectionAlert();
        }

    } catch (err) {
        console.error('Error checking correction requests:', err);
    }
}

function showCorrectionAlert(user) {
    const alertDiv = document.getElementById('correctionAlert');
    const detailsDiv = document.getElementById('correctionDetails');
    const deadlineSpan = document.getElementById('correctionDeadline');

    if (!alertDiv || !detailsDiv || !deadlineSpan) return;

    // Set correction details
    detailsDiv.textContent = user.correction_reason || 'Please contact administrator for details.';

    // Format deadline
    if (user.correction_deadline) {
        const deadline = new Date(user.correction_deadline);
        const options = { 
            year: 'numeric', 
            month: 'short', 
            day: 'numeric', 
            hour: '2-digit', 
            minute: '2-digit' 
        };
        deadlineSpan.textContent = deadline.toLocaleDateString('en-US', options);
    } else {
        deadlineSpan.textContent = 'Contact administrator';
    }

    // Show the alert
    alertDiv.classList.remove('hidden');
    
    // Re-initialize Lucide icons
    if (window.lucide) {
        lucide.createIcons();
    }
}

function hideCorrectionAlert() {
    const alertDiv = document.getElementById('correctionAlert');
    if (alertDiv) {
        alertDiv.classList.add('hidden');
    }
}

function closeCorrectionAlert() {
    hideCorrectionAlert();
    // Store in sessionStorage that user has seen this alert
    sessionStorage.setItem('correctionAlertDismissed', 'true');
}

async function openCorrectionModal() {
    try {
        const userEmail = sessionStorage.getItem('userEmail');
        if (!userEmail) return;

        const { data: user, error } = await supabase
            .from('users')
            .select('*')
            .eq('email', userEmail)
            .single();

        if (error || !user) {
            alert('Error loading user data. Please refresh the page.');
            return;
        }

        // Populate modal with current user data
        document.getElementById('updateFirstName').value = user.first_name || '';
        document.getElementById('updateLastName').value = user.last_name || '';
        document.getElementById('updateEmail').value = user.email || '';
        document.getElementById('updateStudentId').value = user.student_id || '';
        document.getElementById('updateDepartment').value = user.college_department || '';
        
        // Show correction reason in modal
        document.getElementById('modalCorrectionReason').textContent = user.correction_reason || '';

        // Show modal
        document.getElementById('updateInfoModal').classList.remove('hidden');
        
        // Re-initialize Lucide icons
        if (window.lucide) {
            lucide.createIcons();
        }

    } catch (err) {
        console.error('Error opening correction modal:', err);
        alert('Error loading user data: ' + err.message);
    }
}

function closeUpdateInfoModal() {
    document.getElementById('updateInfoModal').classList.add('hidden');
}

async function submitUpdatedInfo(event) {
    event.preventDefault();

    const firstName = document.getElementById('updateFirstName').value.trim();
    const lastName = document.getElementById('updateLastName').value.trim();
    const email = document.getElementById('updateEmail').value.trim();
    const studentId = document.getElementById('updateStudentId').value.trim();
    const department = document.getElementById('updateDepartment').value;

    if (!firstName || !lastName || !email || !studentId || !department) {
        alert('Please fill in all required fields.');
        return;
    }

    // Validate email domain
    if (!email.endsWith('@umak.edu.ph')) {
        alert('Email must use the official university domain (@umak.edu.ph)');
        return;
    }

    // Validate student ID format (basic check)
    if (!/^[a-zA-Z]\d{8}$/.test(studentId)) {
        alert('Student ID format appears incorrect. Please use format like: a12345027');
        return;
    }

    try {
        const currentEmail = sessionStorage.getItem('userEmail');
        if (!currentEmail) {
            alert('Session expired. Please login again.');
            return;
        }

        // Get current user to get ID
        const { data: currentUser, error: currentUserError } = await supabase
            .from('users')
            .select('id')
            .eq('email', currentEmail)
            .single();

        if (currentUserError || !currentUser) {
            throw new Error('Failed to find current user');
        }

        // Update user information and mark as pending verification again
        const { error: updateError } = await supabase
            .from('users')
            .update({
                first_name: firstName,
                last_name: lastName,
                email: email,
                student_id: studentId,
                college_department: department,
                correction_requested: false,
                correction_reason: null,
                is_verified: false, // Mark as unverified again for admin review
                data_verified: false
            })
            .eq('id', currentUser.id);

        if (updateError) throw updateError;

        // Update session storage with new email if changed
        if (email !== currentEmail) {
            sessionStorage.setItem('userEmail', email);
        }

        alert('✅ Information updated successfully! Your account will be reviewed by an administrator.');
        
        closeUpdateInfoModal();
        hideCorrectionAlert();
        
        // Refresh the page to show updated information
        window.location.reload();

    } catch (err) {
        console.error('Error updating user information:', err);
        alert('❌ Error updating information: ' + err.message);
    }
}

function contactAdmin() {
    const subject = encodeURIComponent('Account Correction Assistance');
    const body = encodeURIComponent('Hello,\n\nI need assistance with the correction request for my account. Please help me understand what needs to be updated.\n\nThank you.');
    
    // Try to open email client
    window.location.href = `mailto:admin@umak.edu.ph?subject=${subject}&body=${body}`;
}

// Close modal when clicking outside
document.addEventListener('click', function(event) {
    const modal = document.getElementById('updateInfoModal');
    if (event.target === modal) {
        closeUpdateInfoModal();
    }
});

// Close modal with Escape key
document.addEventListener('keydown', function(event) {
    if (event.key === 'Escape') {
        const modal = document.getElementById('updateInfoModal');
        if (!modal.classList.contains('hidden')) {
            closeUpdateInfoModal();
        }
    }
});

// Handle form submission
document.addEventListener('DOMContentLoaded', function() {
    const updateForm = document.getElementById('updateInfoForm');
    if (updateForm) {
        updateForm.addEventListener('submit', submitUpdatedInfo);
    }
    
    // ========================================================================
    // RFID PANEL CONTROL HELPER FUNCTIONS
    // ========================================================================
    // These functions provide explicit control over panel visibility and
    // manage the state flags that prevent unwanted reopening.
    // ========================================================================
    
    /**
     * Open the RFID scan panel (triggered by user clicking floating button)
     * This resets the userManuallyClosed flag, allowing future scans to auto-open.
     */
    window.openRfidPanel = function() {
        const displayContainer = document.getElementById('rfidScanDisplay');
        const rfidFloatingBtn = document.getElementById('rfidFloatingBtn');
        const rfidBadge = document.getElementById('rfidBadge');
        
        if (displayContainer) {
            // Show panel with smooth transition (scale + opacity)
            displayContainer.classList.remove('hidden', 'opacity-0', 'scale-95', 'pointer-events-none');
            displayContainer.classList.add('opacity-100', 'scale-100', 'pointer-events-auto');
        }
        
        if (rfidFloatingBtn) {
            // Hide floating button (replaced by expanded panel)
            rfidFloatingBtn.classList.add('scale-0', 'opacity-0', 'pointer-events-none');
        }
        
        if (rfidBadge) {
            // Hide notification badge (no need when panel is open)
            rfidBadge.classList.add('hidden');
        }
        
        isPanelOpen = true;
        userManuallyClosed = false; // Reset flag - user wants to see notifications
        console.log('👤 User manually opened panel');
    };
    
    /**
     * Close the RFID scan panel
     * @param {boolean} isManualClose - true if user clicked X button, false if auto-closed by timeout
     * 
     * Manual close (X button clicked):
     * - Sets userManuallyClosed = true
     * - Panel stays closed until next NEW scan
     * - Clears any pending auto-hide timeout
     * 
     * Auto-close (8-second timeout expired):
     * - Sets userManuallyClosed = false
     * - Panel can auto-open on next scan
     * - Shows notification badge to indicate activity
     */
    window.closeRfidPanel = function(isManualClose = true) {
        const displayContainer = document.getElementById('rfidScanDisplay');
        const rfidFloatingBtn = document.getElementById('rfidFloatingBtn');
        const rfidBadge = document.getElementById('rfidBadge');
        
        if (displayContainer) {
            // Hide panel with smooth transition
            displayContainer.classList.add('hidden', 'opacity-0', 'scale-95', 'pointer-events-none');
            displayContainer.classList.remove('opacity-100', 'scale-100', 'pointer-events-auto');
        }
        
        if (rfidFloatingBtn) {
            // Show floating button again
            rfidFloatingBtn.classList.remove('scale-0', 'opacity-0', 'pointer-events-none');
        }
        
        if (rfidBadge && !isManualClose) {
            // Show notification badge after auto-close (not manual close)
            rfidBadge.classList.remove('hidden');
        }
        
        isPanelOpen = false;
        
        if (isManualClose) {
            // User clicked X button - prevent auto-reopen on same scan
            userManuallyClosed = true;
            console.log('🚫 User manually closed panel - will not auto-reopen until new scan');
            
            // Clear any pending auto-hide timeout (user dismissed early)
            if (scanDisplayTimeout) {
                clearTimeout(scanDisplayTimeout);
                scanDisplayTimeout = null;
            }
        } else {
            // Auto-closed by timeout - allow auto-reopen on next scan
            userManuallyClosed = false;
        }
    };
    
    // Event Listeners
    const rfidFloatingBtn = document.getElementById('rfidFloatingBtn');
    const rfidCloseBtn = document.getElementById('rfidCloseBtn');
    
    if (rfidFloatingBtn) {
        rfidFloatingBtn.addEventListener('click', function() {
            openRfidPanel();
        });
    }
    
    if (rfidCloseBtn) {
        rfidCloseBtn.addEventListener('click', function() {
            closeRfidPanel(true); // true = manual close
        });
    }
});

