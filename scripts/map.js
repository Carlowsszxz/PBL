// Supabase Configuration
const SUPABASE_URL = 'https://xnqffcutsadthghqxeha.supabase.co';
const SUPABASE_KEY = 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6InhucWZmY3V0c2FkdGhnaHF4ZWhhIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NjE1NzcwMDMsImV4cCI6MjA3NzE1MzAwM30.wHKLzLhY1q-wGud5Maz3y07sXrkg0JLfY85VF6GGJrk';

const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_KEY);

// Track currently selected table
let currentTable = null;
let pollingInterval = null;

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

    // User exists and is not admin. Check if user has an assigned seat.
    await autoSelectUserTable(userEmail);

    // Prevent navigation away from student pages
    setupNavigationGuard();
    
    // Initialize Lucide icons for empty state
    if (window.lucide) lucide.createIcons();
});

/**
 * Auto-select user's assigned table and load their seat map
 * Checks both occupancy table and activity logs to find user's seat
 */
async function autoSelectUserTable(userEmail) {
    try {
        // Method 1: Check occupancy table for assigned seat
        const { data: occupancyData, error: occupancyError } = await supabase
            .from('occupancy')
            .select('table_id, seat_number, occupied_by, is_occupied')
            .eq('occupied_by', userEmail)
            .eq('is_occupied', true)
            .maybeSingle();

        let assignedTable = null;
        let assignedSeat = null;

        if (occupancyData) {
            assignedTable = occupancyData.table_id;
            assignedSeat = occupancyData.seat_number;
            console.log('Found assigned seat from occupancy:', { table: assignedTable, seat: assignedSeat });
        } else {
            // Method 2: Check activity logs for active RFID session
            const { data: userData } = await supabase
                .from('users')
                .select('id')
                .eq('email', userEmail)
                .single();

            if (userData) {
                const { data: rfidCards } = await supabase
                    .from('rfid_cards')
                    .select('rfid_uid')
                    .eq('user_id', userData.id)
                    .eq('is_active', true);

                if (rfidCards && rfidCards.length > 0) {
                    const { data: latestLog } = await supabase
                        .from('actlog_iot')
                        .select('event, seat_number, table_name')
                        .eq('uid', rfidCards[0].rfid_uid)
                        .order('created_at', { ascending: false })
                        .limit(1)
                        .maybeSingle();

                    if (latestLog && latestLog.event === 'login') {
                        assignedTable = latestLog.table_name || 'table-1';
                        assignedSeat = latestLog.seat_number;
                        console.log('Found active session from activity log:', { table: assignedTable, seat: assignedSeat });
                    }
                }
            }
        }

        // If user has an assigned table and seat, auto-select and load
        if (assignedTable && assignedSeat) {
            const tableSelector = document.getElementById('tableSelector');
            if (tableSelector) {
                // Set dropdown value to assigned table
                tableSelector.value = assignedTable;
                
                // Store assigned seat for highlighting
                sessionStorage.setItem('assignedSeat', assignedSeat);
                sessionStorage.setItem('assignedTable', assignedTable);
                
                // Trigger table change to load the map
                handleTableChange();
            }
        } else {
            // No assigned seat - clear any stored values and show empty state
            sessionStorage.removeItem('assignedSeat');
            sessionStorage.removeItem('assignedTable');
            console.log('No assigned seat found - waiting for manual table selection');
        }
    } catch (err) {
        console.error('Error auto-selecting table:', err);
        // On error, just show empty state
        sessionStorage.removeItem('assignedSeat');
        sessionStorage.removeItem('assignedTable');
    }
}

/**
 * Handle table selection change
 * Called when user selects a table from dropdown
 */
function handleTableChange() {
    const selector = document.getElementById('tableSelector');
    const selectedTable = selector.value;
    
    // Clear any existing polling
    if (pollingInterval) {
        clearInterval(pollingInterval);
        pollingInterval = null;
    }
    
    if (!selectedTable) {
        // No table selected - show empty state
        currentTable = null;
        showEmptyState();
        return;
    }
    
    // Update current table
    currentTable = selectedTable;
    
    // Extract table number for display (e.g., "table-1" -> "Table 1")
    const tableNumber = selectedTable.split('-')[1];
    const mapTitle = document.getElementById('mapTitle');
    if (mapTitle) {
        mapTitle.textContent = `Seat Map – Table ${tableNumber}`;
    }
    
    // Hide empty state, show loading
    const emptyState = document.getElementById('emptyState');
    const seatMap = document.getElementById('seatMap');
    if (emptyState) emptyState.classList.add('hidden');
    if (seatMap) seatMap.classList.remove('hidden');
    
    // Show stats bar and user banner
    const statsBar = document.getElementById('statsBar');
    const userBanner = document.getElementById('userBanner');
    if (statsBar) {
        statsBar.innerHTML = `
            <div class="flex items-center justify-center gap-3 sm:gap-6 flex-wrap text-sm sm:text-base">
                <span class="text-gray-500 text-sm">Loading stats...</span>
            </div>
        `;
    }
    if (userBanner) {
        userBanner.classList.remove('hidden');
        userBanner.innerHTML = `
            <div class="flex items-center justify-center gap-2 text-sm sm:text-base">
                <span class="text-gray-500 text-sm">Loading status...</span>
            </div>
        `;
    }
    
    // Load map for selected table
    loadMap(selectedTable);
    
    // Start polling every 2 seconds
    pollingInterval = setInterval(() => loadMap(selectedTable), 2000);
}

/**
 * Show empty state (no table selected)
 */
function showEmptyState() {
    const emptyState = document.getElementById('emptyState');
    const seatMap = document.getElementById('seatMap');
    const mapButtons = document.getElementById('mapButtons');
    const mapLegend = document.getElementById('mapLegend');
    const statsBar = document.getElementById('statsBar');
    const userBanner = document.getElementById('userBanner');
    const mapTitle = document.getElementById('mapTitle');
    
    if (emptyState) emptyState.classList.remove('hidden');
    if (seatMap) seatMap.classList.add('hidden');
    if (mapButtons) mapButtons.classList.add('hidden');
    if (mapLegend) mapLegend.classList.add('hidden');
    if (mapTitle) mapTitle.textContent = 'Seat Map';
    
    if (statsBar) {
        statsBar.innerHTML = `
            <div class="flex items-center justify-center gap-3 sm:gap-6 flex-wrap text-sm sm:text-base">
                <span class="text-gray-500 text-sm">Select a table to view occupancy stats</span>
            </div>
        `;
    }
    
    if (userBanner) {
        userBanner.classList.add('hidden');
    }
    
    // Reinitialize Lucide icons
    if (window.lucide) lucide.createIcons();
}

async function loadMap(tableId = currentTable) {
    try {
        // Add loading indicator
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            // Target SVG (Lucide creates SVG) or fallback to i element
            const icon = refreshBtn.querySelector('svg') || refreshBtn.querySelector('i');
            if (icon) {
                icon.style.animation = 'spin 1s linear infinite';
            }
        }

        // Get user email for session
        const userEmail = sessionStorage.getItem('userEmail');

        // Get user's information
        const { data: user, error: userError } = await supabase
            .from('users')
            .select('id, email')
            .eq('email', userEmail)
            .single();

        if (userError) throw userError;

        // Get user's access device
        const { data: rfidCards, error: rfidError } = await supabase
            .from('rfid_cards')
            .select('rfid_uid')
            .eq('user_id', user.id)
            .eq('is_active', true);

        // Check if user has an active session
        let isLoggedIn = false;
        let userSeatNumber = null;
        // Table name where the user's latest login occurred (used to scope highlighting)
        let userSeatTable = null;

        if (rfidCards && rfidCards.length > 0) {
            // Check latest activity log to see if user has an active session
            const { data: latestLog, error: logError } = await supabase
                .from('actlog_iot')
                .select('event, seat_number, table_name')
                .eq('uid', rfidCards[0].rfid_uid)
                .order('created_at', { ascending: false })
                .limit(1)
                .single();

            // User is logged in if latest event is 'login'
            // Also capture the table name where the login happened so we only highlight
            // the user's seat when viewing the same table.
            let userSeatTable = null;
            if (latestLog && latestLog.event === 'login') {
                isLoggedIn = true;
                userSeatNumber = latestLog.seat_number;
                userSeatTable = latestLog.table_name || null;
            }
        }

        // If no table selected, don't load anything
        if (!tableId) {
            showEmptyState();
            return;
        }
        
        // Get all seats for selected table
        const { data: seats, error: seatsError } = await supabase
            .from('occupancy')
            .select('*')
            .eq('table_id', tableId)
            .order('seat_number', { ascending: true });

        // Handle case where seats might not exist yet or error occurs
        let seatsData = seats || [];
        console.log('Seats data fetched:', seatsData);
        if (seatsError) {
            console.warn('Error fetching seats:', seatsError);
            // Continue with empty seats array - will show all as available
        }

        // Calculate occupancy stats
        const totalSeats = 8;
        const occupiedSeats = seatsData.filter(s => s.is_occupied === true).length || 0;
        const availableSeats = totalSeats - occupiedSeats;
        const occupancyPercent = Math.round((occupiedSeats / totalSeats) * 100);

        // Update stats bar - always show stats even if no seats found
        const statsBar = document.getElementById('statsBar');
        if (statsBar) {
            const isMobile = window.innerWidth < 640;
            const iconSize = isMobile ? 'w-4 h-4' : 'w-5 h-5';
            const gapSize = isMobile ? 'gap-1.5' : 'gap-2';
            const textSize = isMobile ? 'text-sm' : 'text-base';

            statsBar.innerHTML = `
                <div class="flex items-center justify-center gap-3 sm:gap-6 flex-wrap ${textSize}">
                    <div class="flex items-center ${gapSize}">
                        <i data-lucide="circle" class="${iconSize} text-gray-500"></i>
                        <span class="font-semibold text-gray-700">Available: ${availableSeats}</span>
                    </div>
                    <div class="flex items-center ${gapSize}">
                        <i data-lucide="circle" class="${iconSize} text-green-600"></i>
                        <span class="font-semibold text-gray-700">Occupied: ${occupiedSeats}</span>
                    </div>
                    <div class="flex items-center ${gapSize}">
                        <i data-lucide="activity" class="${iconSize} text-indigo-600"></i>
                        <span class="font-semibold text-gray-700">Capacity: ${occupancyPercent}%</span>
                    </div>
                    <div class="flex items-center ${gapSize} text-gray-600">
                        <i data-lucide="clock" class="${iconSize}"></i>
                        <span class="text-sm" id="last-updated">Just now</span>
                    </div>
                </div>
            `;

            // Reinitialize icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }

        // Update user status banner
        const userBanner = document.getElementById('userBanner');
        if (userBanner) {
            const isMobile = window.innerWidth < 640;
            const iconSize = isMobile ? 'w-4 h-4' : 'w-5 h-5';
            const gapSize = isMobile ? 'gap-1.5' : 'gap-2';
            const paddingSize = isMobile ? 'p-3' : 'p-4';
            const marginSize = isMobile ? 'mb-4' : 'mb-6';
            const textSize = isMobile ? 'text-sm' : 'text-base';

            if (isLoggedIn && userSeatNumber) {
                userBanner.innerHTML = `
                    <div class="flex items-center justify-center ${gapSize} ${textSize} flex-wrap">
                        <i data-lucide="map-pin" class="${iconSize} text-indigo-600 flex-shrink-0"></i>
                        <span class="font-semibold text-indigo-700">You're at Seat ${userSeatNumber}</span>
                        <span class="text-xs sm:text-sm text-gray-600 whitespace-nowrap">• Active session via device</span>
                    </div>
                `;
                userBanner.className = `${paddingSize} rounded-lg bg-gradient-to-r from-indigo-50 to-purple-50 border border-indigo-200 ${marginSize}`;
            } else {
                userBanner.innerHTML = `
                    <div class="flex items-center justify-center ${gapSize} ${textSize} flex-wrap text-center">
                        <i data-lucide="info" class="${iconSize} text-indigo-600 flex-shrink-0"></i>
                        <span class="text-gray-700">Tap your RFID card at the reader to occupy a seat and see your location highlighted.</span>
                    </div>
                `;
                userBanner.className = `${paddingSize} rounded-lg bg-indigo-50 border border-indigo-200 ${marginSize}`;
            }

            // Reinitialize icons
            if (typeof lucide !== 'undefined') {
                lucide.createIcons();
            }
        }

        // Always show seat UI - users should see occupancy regardless of login status
        const mapDiv = document.getElementById('seatMap');
        const legendEl = document.getElementById('mapLegend');
        const buttonsEl = document.getElementById('mapButtons');
        const seatPromptEl = document.getElementById('seatPrompt');

        // Always reveal seat UI
        if (mapDiv) {
            mapDiv.classList.remove('message-mode');
            mapDiv.classList.remove('hidden');
            mapDiv.innerHTML = '';
        }
        if (legendEl) legendEl.classList.remove('hidden');
        if (buttonsEl) buttonsEl.classList.remove('hidden');
        if (seatPromptEl) seatPromptEl.classList.add('hidden');

        // Display 8 seats (always visible, with user seat highlighted when logged in)
        for (let i = 1; i <= 8; i++) {
            const seat = seatsData.find(s => s.seat_number === i) || {
                seat_number: i,
                is_occupied: false,
                occupied_by: null
            };

            const seatDiv = document.createElement('div');

            // Check if this seat is occupied by the current user
            // Compare by: (1) email in occupancy, (2) seat number from activity log, (3) assigned seat in storage
            const isUserSeat = seat.is_occupied && seat.occupied_by === userEmail;
            const isUserSeatByActivity = isLoggedIn && userSeatNumber === i && userSeatTable === tableId;
            const assignedSeatNumber = parseInt(sessionStorage.getItem('assignedSeat') || '0', 10);
            const assignedTableStored = sessionStorage.getItem('assignedTable') || '';
            // Only consider assigned seat as the user's seat when viewing the same table
            const isAssignedSeat = assignedSeatNumber && assignedSeatNumber === i && assignedTableStored === tableId;
            const isCurrentUserSeat = isUserSeat || isUserSeatByActivity || isAssignedSeat;

            // Check if this seat should be highlighted (from URL parameter)
            const urlParams = new URLSearchParams(window.location.search);
            const highlightSeat = urlParams.get('highlight');
            const isHighlighted = highlightSeat && (seat.seat_number === highlightSeat || i === highlightSeat);

            if (isCurrentUserSeat) {
                // This is the logged-in user's seat - show as "Your Seat"
                seatDiv.className = 'seat user-seat';
                seatDiv.innerHTML = `
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <i data-lucide="map-pin" class="w-5 h-5 text-indigo-100"></i>
                        <div class="seat-number">Seat ${i}</div>
                        <div class="seat-details">Your Seat</div>
                    </div>
                `;
            } else if (isHighlighted) {
                seatDiv.className = 'seat user-seat';
                seatDiv.style.animation = 'pulse 2s ease-in-out infinite';
                seatDiv.innerHTML = `
                    <div class="seat-badge">HERE</div>
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <i data-lucide="navigation" class="w-5 h-5 text-indigo-100"></i>
                        <div class="seat-number">Seat ${i}</div>
                        <div class="seat-details">Highlighted</div>
                    </div>
                `;
                // Scroll this seat into view after a short delay
                setTimeout(() => {
                    seatDiv.scrollIntoView({ behavior: 'smooth', block: 'center', inline: 'center' });
                }, 300);
            } else if (seat.is_occupied) {
                // Seat is occupied by someone else - show as "Occupied"
                seatDiv.className = 'seat occupied';
                seatDiv.innerHTML = `
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <i data-lucide="user" class="w-5 h-5 text-white opacity-90"></i>
                        <div class="seat-number">Seat ${i}</div>
                        <div class="seat-details">Occupied</div>
                    </div>
                `;
            } else {
                // Seat is available
                seatDiv.className = 'seat available';
                seatDiv.innerHTML = `
                    <div class="flex flex-col items-center justify-center gap-1.5">
                        <i data-lucide="circle" class="w-5 h-5 text-white opacity-75"></i>
                        <div class="seat-number">Seat ${i}</div>
                        <div class="seat-details">Available</div>
                    </div>
                `;
            }

            mapDiv.appendChild(seatDiv);
        }

        // Reinitialize Lucide icons for seat elements
        if (typeof lucide !== 'undefined') {
            lucide.createIcons();
        }

        console.log('Rendered', mapDiv.children.length, 'seats to mapDiv');

        // Update title - show the currently selected table
        const mapTitle = document.getElementById('mapTitle');
        if (mapTitle) {
            const tableNumber = (tableId || currentTable || '').split('-')[1] || '';
            mapTitle.textContent = tableNumber ? `Seat Map - Table ${tableNumber}` : 'Seat Map';
            mapTitle.style.display = 'block';
        }

        // Show all UI elements - always visible
        const mapButtons = document.getElementById('mapButtons');
        const mapLegend = document.getElementById('mapLegend');
        const lastUpdate = document.getElementById('lastUpdate');
        if (mapButtons) mapButtons.style.display = 'flex';
        if (mapLegend) mapLegend.style.display = 'flex';
        if (lastUpdate) lastUpdate.style.display = 'block';

    } catch (err) {
        console.error('Error loading map:', err);

        // Show error in stats bar
        const statsBar = document.getElementById('statsBar');
        if (statsBar) {
            statsBar.innerHTML = `
                <div class="flex items-center justify-center gap-6 flex-wrap">
                    <span class="text-red-600">Error loading stats: ${err.message || 'Unknown error'}</span>
                </div>
            `;
        }

        // Show error in seat map
        const seatMap = document.getElementById('seatMap');
        if (seatMap) {
            seatMap.innerHTML = '<p class="text-red-600">Error loading seat map. Please refresh.</p>';
        }
    } finally {
        // Remove loading indicator
        const refreshBtn = document.getElementById('refreshBtn');
        if (refreshBtn) {
            // Target SVG (Lucide creates SVG) or fallback to i element
            const icon = refreshBtn.querySelector('svg') || refreshBtn.querySelector('i');
            if (icon) {
                icon.style.animation = '';
            }
        }

        // Update last refresh time
        const lastUpdate = document.getElementById('lastUpdate');
        if (lastUpdate) {
            const now = new Date();
            const timeString = now.toLocaleTimeString();
            lastUpdate.textContent = `Updated: ${timeString}`;
        }
    }
}

function showFullMap() {
    // Hide burger menu when modal opens (it has higher z-index and blocks escape key)
    const burgerBtn = document.getElementById('burgerMenuBtn');
    let burgerBtnOriginalDisplay = null;
    if (burgerBtn) {
        burgerBtnOriginalDisplay = burgerBtn.style.display || window.getComputedStyle(burgerBtn).display;
        burgerBtn.style.display = 'none';
        burgerBtn.style.zIndex = '1'; // Lower z-index when modal is open
    }

    // Create full-screen modal for image
    const modal = document.createElement('div');
    modal.className = 'full-map-modal';
    modal.style.cssText = 'position:fixed;top:0;left:0;width:100%;height:100%;background:rgba(0,0,0,0.95);z-index:1000000;display:flex;align-items:center;justify-content:center;overflow-y:auto;-webkit-overflow-scrolling:touch;';

    // Prevent body scroll on mobile
    document.body.style.overflow = 'hidden';

    const modalContent = document.createElement('div');
    const isMobile = window.innerWidth < 768;
    modalContent.style.cssText = `position:relative;max-width:${isMobile ? '100vw' : '95vw'};max-height:${isMobile ? '100vh' : '95vh'};display:flex;align-items:center;justify-content:center;padding:${isMobile ? '44px 8px 8px' : '16px'};box-sizing:border-box;`;

    // Create close button
    const closeBtn = document.createElement('button');
    closeBtn.className = 'close-full-map-btn';
    closeBtn.setAttribute('aria-label', 'Close full map view');
    closeBtn.innerHTML = '<i data-lucide="x" class="close-icon"></i>';

    // Create PDF viewer element for floor plan
    const pdfViewer = document.createElement('iframe');
    pdfViewer.src = 'images/FloorPlan.pdf';
    const viewerWidth = isMobile ? '100%' : '90vw';
    const viewerHeight = isMobile ? 'calc(100vh - 60px)' : '90vh';
    pdfViewer.style.cssText = `width:${viewerWidth};height:${viewerHeight};border:none;border-radius:${isMobile ? '0' : '10px'};box-shadow:0 4px 20px rgba(0,0,0,0.5);background:white;max-width:100%;`;
    pdfViewer.title = 'Floor Plan';

    // Fallback message if PDF can't load
    const fallbackMsg = document.createElement('div');
    fallbackMsg.style.cssText = `padding:${isMobile ? '24px 16px' : '40px'};background:white;border-radius:10px;text-align:center;color:#333;display:none;max-width:90vw;box-sizing:border-box;`;
    fallbackMsg.innerHTML = `
        <h2 style="color:#dc3545;font-size:${isMobile ? '1.25rem' : '1.5rem'};margin-bottom:12px;">Floor Plan PDF</h2>
        <p style="font-size:${isMobile ? '0.9rem' : '1rem'};margin-bottom:12px;">If the PDF doesn't load, you can <a href="images/FloorPlan.pdf" target="_blank" style="color:#007bff;text-decoration:underline;">download it here</a></p>
        <p style="font-size:${isMobile ? '0.8rem' : '0.9em'};color:#666;margin-top:20px;">Make sure the file exists at: <code style="font-size:0.85em;background:#f5f5f5;padding:2px 6px;border-radius:4px;">images/FloorPlan.pdf</code></p>
    `;

    // Fallback if iframe fails to load (some browsers)
    pdfViewer.onerror = function () {
        pdfViewer.style.display = 'none';
        fallbackMsg.style.display = 'block';
    };

    modalContent.appendChild(pdfViewer);
    modalContent.appendChild(fallbackMsg);
    modal.appendChild(modalContent);
    modal.appendChild(closeBtn);
    document.body.appendChild(modal);

    // Close button functionality
    const closeModal = function () {
        document.body.style.overflow = '';
        modal.remove();

        // Restore burger menu visibility and z-index
        if (burgerBtn) {
            burgerBtn.style.display = burgerBtnOriginalDisplay || '';
            if (window.innerWidth <= 768) {
                burgerBtn.style.zIndex = '999999';
            }
        }
    };

    closeBtn.addEventListener('click', closeModal, { passive: true });
    closeBtn.addEventListener('touchend', function (e) {
        e.preventDefault();
        closeModal();
    }, { passive: false });

    // Initialize Lucide icon for close button
    if (window.lucide) {
        setTimeout(() => {
            lucide.createIcons();
        }, 100);
    }

    // Close on outside click/touch
    modal.addEventListener('click', function (e) {
        if (e.target === modal) {
            closeModal();
        }
    }, { passive: true });

    modal.addEventListener('touchend', function (e) {
        if (e.target === modal) {
            e.preventDefault();
            closeModal();
        }
    }, { passive: false });

    // Close on Escape key
    const escapeHandler = function (e) {
        if (e.key === 'Escape' || e.keyCode === 27) {
            e.preventDefault();
            e.stopPropagation();
            closeModal();
            document.removeEventListener('keydown', escapeHandler);
        }
    };
    // Use capture phase to catch escape key before other handlers
    document.addEventListener('keydown', escapeHandler, true);
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
                window.history.pushState(null, '', 'map.html');
                window.location.href = 'map.html';
            }
        }
    });

    // Removed leave-warning on student pages

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

