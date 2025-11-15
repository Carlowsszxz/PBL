// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

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
                    photo_url,
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
                photoUrl: user.photo_url,
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
                    noise_db: null
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
                noise_db: null
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
    const displayContainer = document.getElementById('rfidScanDisplay');
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
    scanTimeSpan.textContent = `Scanned at ${now.toLocaleTimeString()}`;

    // Show display container
    displayContainer?.classList.remove('hidden');

    // Handle different scan results
    if (scanResult.success) {
        // Success - show user info
        successDiv?.classList.remove('hidden');
        document.getElementById('rfidUserName').textContent = scanResult.user.fullName;
        document.getElementById('rfidUserEmail').textContent = scanResult.user.email;
        document.getElementById('rfidStudentId').textContent = scanResult.user.studentId || 'N/A';

        if (seatAssignment && seatAssignment.success) {
            document.getElementById('rfidSeatNumber').textContent = `${seatAssignment.tableId} - Seat ${seatAssignment.seatNumber}`;
        } else {
            document.getElementById('rfidSeatNumber').textContent = 'Pending...';
        }

        // Refresh Lucide icons
        if (window.lucide) lucide.createIcons();

        // Auto-hide after 3 seconds
        scanDisplayTimeout = setTimeout(() => {
            displayContainer?.classList.add('hidden');
        }, 3000);

    } else if (scanResult.error === 'inactive') {
        // Inactive card
        inactiveDiv?.classList.remove('hidden');
        if (window.lucide) lucide.createIcons();

        // Auto-hide after 5 seconds
        scanDisplayTimeout = setTimeout(() => {
            displayContainer?.classList.add('hidden');
        }, 5000);

    } else if (scanResult.error === 'unregistered') {
        // Unregistered card
        unregisteredDiv?.classList.remove('hidden');
        document.getElementById('rfidUnknownUid').textContent = scanResult.rfidUid;
        if (window.lucide) lucide.createIcons();

        // Auto-hide after 5 seconds
        scanDisplayTimeout = setTimeout(() => {
            displayContainer?.classList.add('hidden');
        }, 5000);
    }
}

/**
 * Handle RFID scan detection from actlog_iot table
 * This function is called by the polling system when a new scan is detected
 */
async function handleRfidScan(rfidUid, tableId, seatNumber) {
    console.log('🎫 RFID Scan Detected:', { rfidUid, tableId, seatNumber });

    lastScannedRfid = rfidUid;

    // Step 1: Look up user by RFID
    const userLookup = await lookupUserByRfid(rfidUid);

    // Step 2: If user found, assign to seat
    let seatAssignment = null;
    if (userLookup.success) {
        seatAssignment = await assignUserToSeat(userLookup.user, tableId, seatNumber);
    }

    // Step 3: Display result in UI
    displayRfidScan(userLookup, seatAssignment);

    // Step 4: Refresh dashboard data
    const userEmail = sessionStorage.getItem('userEmail');
    if (userEmail) {
        loadUserInfo(userEmail);
    }
}

// Track last processed scan to avoid duplicates
let lastProcessedScanId = null;

/**
 * Poll actlog_iot table for new RFID scans
 * This function runs every 1.5 seconds to detect new scans
 */
async function checkForNewRfidScans() {
    try {
        // Get the most recent login event from actlog_iot
        const { data: recentScans, error } = await supabase
            .from('actlog_iot')
            .select('id, seat_number, event, uid, created_at')
            .eq('event', 'login')
            .order('created_at', { ascending: false })
            .limit(1)
            .maybeSingle();

        if (error) {
            console.error('Error checking for RFID scans:', error);
            return;
        }

        // No scans found
        if (!recentScans) return;

        // Check if this is a new scan (not processed yet)
        if (lastProcessedScanId !== recentScans.id) {
            // Check if scan is recent (within last 10 seconds to avoid processing old scans on page load)
            const scanTime = new Date(recentScans.created_at);
            const now = new Date();
            const ageInSeconds = (now - scanTime) / 1000;

            if (ageInSeconds <= 10) {
                console.log('🆕 New RFID scan detected!', recentScans);
                lastProcessedScanId = recentScans.id;

                // Process the scan (table ID derived from seat number pattern if needed)
                const tableId = 'table-1'; // Default table, adjust as needed
                await handleRfidScan(
                    recentScans.uid,
                    tableId,
                    recentScans.seat_number
                );
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

    if (!emojiEl || !dbEl || !updEl || !tipEl || !gaugeEl || !comfortEl) return;

    if (!payload) {
        emojiEl.textContent = '—';
        dbEl.textContent = '—';
        updEl.textContent = 'No noise data';
        tipEl.textContent = 'Tap your device at the reader to start monitoring noise levels';
        comfortEl.textContent = '';
        gaugeEl.style.width = '0%';
        return;
    }

    const db = payload.db || 0;
    emojiEl.textContent = payload.emoji;
    dbEl.textContent = db;

    // Update comfort level text
    let comfortText = '';
    let comfortColor = '';
    if (db <= 40) {
        comfortText = 'Comfortable';
        comfortColor = 'text-green-600';
    } else if (db <= 55) {
        comfortText = 'Moderate';
        comfortColor = 'text-yellow-600';
    } else if (db <= 70) {
        comfortText = 'Loud';
        comfortColor = 'text-orange-600';
    } else {
        comfortText = 'Very Loud';
        comfortColor = 'text-red-600';
    }
    comfortEl.textContent = comfortText;
    comfortEl.className = `ml-2 text-sm font-medium ${comfortColor}`;

    // Update gauge (0-100dB scale, max 100%)
    const gaugePercent = Math.min((db / 100) * 100, 100);
    gaugeEl.style.width = `${gaugePercent}%`;

    updEl.textContent = payload.updatedAt ? 'Updated: ' + new Date(payload.updatedAt).toLocaleTimeString() : '—';
    tipEl.textContent = payload.tip || '';
}

function updateStatsApprox(loginAt) {
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
        calculateRealStats(rfidUid, weekEl, avgEl);
    } else {
        if (weekEl) weekEl.textContent = '0';
        if (avgEl) avgEl.textContent = '0m';
    }
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
                    <div class="text-center py-8">
                        <div class="text-4xl mb-2">📢</div>
                        <p class="text-gray-500 text-sm font-medium">No announcements</p>
                        <p class="text-gray-400 text-xs mt-1">Check back later for updates</p>
                    </div>
                `;
            } else {
                container.innerHTML = activeAnnouncements.map(ann => `
                    <div class="p-3 rounded-lg border ${ann.is_priority ? 'border-rose-300 bg-rose-50' : 'border-slate-200 bg-slate-50'}">
                        <div class="flex items-center justify-between gap-2 text-sm mb-1">
                            <div class="flex items-center gap-2">
                                <span class="font-medium ${ann.is_priority ? 'text-rose-700' : 'text-slate-700'}">${escapeHtml(ann.title || 'Announcement')}</span>
                                ${ann.is_priority ? '<span class="px-1.5 py-0.5 text-xs rounded bg-rose-200 text-rose-800 font-medium">Priority</span>' : ''}
                            </div>
                            <span class="text-xs text-gray-500">${ann.created_at ? new Date(ann.created_at).toLocaleDateString() : ''}</span>
                        </div>
                        <div class="text-gray-800 whitespace-pre-wrap text-sm">${escapeHtml(ann.message || '')}</div>
                    </div>
                `).join('');
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
            if (tl) tl.innerHTML = `
                <div class="text-center py-8">
                    <div class="text-4xl mb-2">📊</div>
                    <p class="text-gray-500 text-sm font-medium">No activity yet</p>
                    <p class="text-gray-400 text-xs mt-1">Register your access device to start tracking</p>
                </div>
            `;
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
                <div class="text-center py-8">
                    <div class="text-4xl mb-2">📊</div>
                    <p class="text-gray-500 text-sm font-medium">No activity yet</p>
                    <p class="text-gray-400 text-xs mt-1">Your session activity will appear here</p>
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

// Utilities
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

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text || '';
    return div.innerHTML;
}

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
});

