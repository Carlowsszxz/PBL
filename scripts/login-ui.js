// login.html: UI effects for fade, icons, nav, cursor, burger - OPTIMIZED

(function () {
    'use strict';

    let spotlightRAF = null;
    let glareRAF = null;
    let isSpotlightActive = false;
    let isGlareActive = false;
    let lastSpotlightUpdate = 0;
    let lastGlareUpdate = 0;
    const THROTTLE_MS = 16; // ~60fps

    function init() {
        // Wait for DOM to be ready
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', init);
            return;
        }

        // Initialize Lucide icons (with fallback)
        if (typeof lucide !== 'undefined') {
            requestIdleCallback(() => {
                lucide.createIcons();
            }, { timeout: 2000 });
        }

        // Fade in content
        const fadeContent = document.getElementById('fade-content');
        if (fadeContent) {
            requestAnimationFrame(() => {
                fadeContent.classList.add('is-visible');
            });
        }

        // Lazy load background image
        lazyLoadBackground();

        // Initialize spotlight (throttled)
        initSpotlight();

        // Initialize header navigation
        initHeaderNav();

        // Initialize mobile menu
        initMobileMenu();

        // Initialize navigation labels
        initNavLabels();

        // Initialize glare effect (optimized)
        initGlare();

        // Initialize login slideshow (right panel)
        initLoginSlideshow();
    }

    // Lazy load background image
    function lazyLoadBackground() {
        const bgEl = document.getElementById('library-background');
        if (!bgEl) return;

        const bgUrl = bgEl.getAttribute('data-bg');
        if (!bgUrl) return;

        // Use IntersectionObserver to load when in viewport
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    const img = new Image();
                    img.onload = () => {
                        bgEl.style.backgroundImage = `url('${bgUrl}')`;
                        bgEl.classList.add('loaded');
                    };
                    img.src = bgUrl;
                    observer.disconnect();
                }
            });
        }, { rootMargin: '50px' });

        observer.observe(bgEl);
    }

    // Login slideshow: cycles through available library images (library1..library3 exist)
    function initLoginSlideshow() {
        const container = document.getElementById('loginSlideshow');
        if (!container) return;

        const existingSlides = container.querySelectorAll('.login-slide');
        if (existingSlides.length > 0) {
            // Slides already exist in HTML, just set up the slideshow
            let current = 0;
            // Ensure first is active
            existingSlides.forEach((slide, i) => {
                if (i === 0) slide.classList.add('active');
                else slide.classList.remove('active');
            });
            if (existingSlides.length > 1) {
                setInterval(() => {
                    existingSlides[current].classList.remove('active');
                    current = (current + 1) % existingSlides.length;
                    existingSlides[current].classList.add('active');
                }, 5000);
            }
            return;
        }

        // Only check existing images to avoid console spam
        const existingImages = ['images/library1.jpg', 'images/library2.jpg', 'images/library3.jpg'];
        const found = [];
        let loadedCount = 0;
        
        if (existingImages.length === 0) {
            buildSlides([]);
            return;
        }
        
        existingImages.forEach(src => {
            const img = new Image();
            img.onload = () => {
                found.push(src);
                loadedCount++;
                if (loadedCount === existingImages.length) buildSlides(found);
            };
            img.onerror = () => {
                loadedCount++;
                if (loadedCount === existingImages.length) buildSlides(found);
            };
            img.src = src;
        });
        
        function buildSlides(images) {
            if (!images.length) {
                const fallback = 'images/library1.jpg';
                const div = document.createElement('div');
                div.className = 'login-slide active';
                div.style.backgroundImage = `url(${fallback})`;
                container.appendChild(div);
                return;
            }
            
            images.forEach((src, i) => {
                const div = document.createElement('div');
                div.className = `login-slide${i === 0 ? ' active' : ''}`;
                div.style.backgroundImage = `url(${src})`;
                container.appendChild(div);
            });
            
            if (images.length > 1) {
                let current = 0;
                setInterval(() => {
                    const slides = container.querySelectorAll('.login-slide');
                    slides[current].classList.remove('active');
                    current = (current + 1) % slides.length;
                    slides[current].classList.add('active');
                }, 5000);
            }
        }
    }

    // Optimized spotlight with throttling
    function initSpotlight() {
        const backgroundSpotlight = document.getElementById('background-spotlight');
        if (!backgroundSpotlight) return;

        // Skip on mobile for performance
        if (window.matchMedia && window.matchMedia('(max-width: 768px)').matches) {
            return;
        }

        let targetX = 50;
        let targetY = 50;
        let currentX = 50;
        let currentY = 50;

        function updateSpotlight(now) {
            if (!isSpotlightActive) return;

            if (now - lastSpotlightUpdate < THROTTLE_MS) {
                spotlightRAF = requestAnimationFrame(updateSpotlight);
                return;
            }
            lastSpotlightUpdate = now;

            // Smooth interpolation
            currentX += (targetX - currentX) * 0.05;
            currentY += (targetY - currentY) * 0.05;

            backgroundSpotlight.style.setProperty('--spotlight-x', `${currentX}%`);
            backgroundSpotlight.style.setProperty('--spotlight-y', `${currentY}%`);

            // Stop if values are stable
            if (Math.abs(targetX - currentX) < 0.1 && Math.abs(targetY - currentY) < 0.1) {
                isSpotlightActive = false;
                spotlightRAF = null;
            } else {
                spotlightRAF = requestAnimationFrame(updateSpotlight);
            }
        }

        let mouseMoveThrottle = null;
        document.addEventListener('mousemove', (e) => {
            if (mouseMoveThrottle) return;

            mouseMoveThrottle = setTimeout(() => {
                targetX = (e.clientX / window.innerWidth) * 100;
                targetY = (e.clientY / window.innerHeight) * 100;

                if (!isSpotlightActive) {
                    isSpotlightActive = true;
                    lastSpotlightUpdate = performance.now();
                    spotlightRAF = requestAnimationFrame(updateSpotlight);
                }

                mouseMoveThrottle = null;
            }, THROTTLE_MS);
        }, { passive: true });
    }

    // Header navigation
    function initHeaderNav() {
        const headerTrigger = document.getElementById('headerTrigger');
        const headerNav = document.getElementById('headerNav');
        if (!headerTrigger || !headerNav) return;

        let headerExpanded = false;
        headerTrigger.addEventListener('click', () => {
            headerExpanded = !headerExpanded;
            if (headerExpanded) {
                headerTrigger.classList.add('header-expanded', 'trigger-expanded');
                headerTrigger.classList.remove('trigger-collapsed');
                headerNav.classList.remove('header-collapsed', 'animating-out');
                headerNav.classList.add('header-expanded', 'animating-in');
            } else {
                headerTrigger.classList.remove('header-expanded', 'trigger-expanded');
                headerTrigger.classList.add('trigger-collapsed');
                headerNav.classList.remove('header-expanded', 'animating-in');
                headerNav.classList.add('header-collapsed', 'animating-out');
            }
        }, { passive: true });
    }

    // Mobile burger menu
    function initMobileMenu() {
        const burgerBtn = document.getElementById('burgerMenuBtn');
        const mobileOverlay = document.getElementById('mobileMenuOverlay');
        const mobilePanel = document.getElementById('mobileMenuPanel');
        if (!burgerBtn || !mobileOverlay || !mobilePanel) return;

        burgerBtn.addEventListener('click', () => {
            burgerBtn.classList.toggle('active');
            mobileOverlay.classList.toggle('active');
            mobilePanel.classList.toggle('active');
        }, { passive: true });

        mobileOverlay.addEventListener('click', () => {
            burgerBtn.classList.remove('active');
            mobileOverlay.classList.remove('active');
            mobilePanel.classList.remove('active');
        }, { passive: true });
    }

    // Navigation hover labels
    function initNavLabels() {
        const navItems = document.querySelectorAll('.sidebar-nav-item');
        const navLabel = document.getElementById('navLabel');
        if (!navLabel) return;

        navItems.forEach(item => {
            item.addEventListener('mouseenter', (e) => {
                const label = e.currentTarget.getAttribute('data-label');
                if (label) {
                    navLabel.textContent = label;
                    navLabel.classList.add('visible');
                }
            }, { passive: true });

            item.addEventListener('mouseleave', () => {
                navLabel.classList.remove('visible');
            }, { passive: true });
        });
    }

    // Optimized glare effect with IntersectionObserver
    function initGlare() {
        const glassmorphicContainer = document.getElementById('glassmorphic-container');
        if (!glassmorphicContainer) return;

        let mouseX = 0;
        let mouseY = 0;
        let currentX = 50;
        let currentY = 50;
        let glareOpacity = 0;
        let targetGlareOpacity = 0;
        let isInViewport = false;

        // Use IntersectionObserver to only animate when visible
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isInViewport = entry.isIntersecting;
                if (!isInViewport) {
                    targetGlareOpacity = 0;
                    cancelAnimationFrame(glareRAF);
                    glareRAF = null;
                    isGlareActive = false;
                }
            });
        }, { threshold: 0.1 });

        observer.observe(glassmorphicContainer);

        function updateGlare(now) {
            if (!isInViewport || !isGlareActive) return;

            if (now - lastGlareUpdate < THROTTLE_MS) {
                glareRAF = requestAnimationFrame(updateGlare);
                return;
            }
            lastGlareUpdate = now;

            const rect = glassmorphicContainer.getBoundingClientRect();
            if (rect.width === 0 || rect.height === 0) {
                glareRAF = requestAnimationFrame(updateGlare);
                return;
            }

            const containerX = rect.left;
            const containerY = rect.top;
            const containerWidth = rect.width;
            const containerHeight = rect.height;

            const mouseRelativeX = mouseX - containerX;
            const mouseRelativeY = mouseY - containerY;

            const isNearContainer = mouseX >= containerX - 50 &&
                mouseX <= containerX + containerWidth + 50 &&
                mouseY >= containerY - 50 &&
                mouseY <= containerY + containerHeight + 50;

            if (isNearContainer) {
                const xPercent = Math.max(0, Math.min(100, (mouseRelativeX / containerWidth) * 100));
                const yPercent = Math.max(0, Math.min(100, (mouseRelativeY / containerHeight) * 100));

                const distFromLeft = mouseRelativeX;
                const distFromRight = containerWidth - mouseRelativeX;
                const distFromTop = mouseRelativeY;
                const distFromBottom = containerHeight - mouseRelativeY;
                const minDist = Math.min(distFromLeft, distFromRight, distFromTop, distFromBottom);

                const edgeThreshold = 80;
                const cornerMultiplier = minDist < edgeThreshold ? (edgeThreshold - minDist) / edgeThreshold : 0;
                targetGlareOpacity = Math.min(0.7, 0.25 + cornerMultiplier * 0.45);

                currentX += (xPercent - currentX) * 0.15;
                currentY += (yPercent - currentY) * 0.15;
            } else {
                targetGlareOpacity = 0;
            }

            glareOpacity += (targetGlareOpacity - glareOpacity) * 0.15;

            glassmorphicContainer.style.setProperty('--x', `${currentX}%`);
            glassmorphicContainer.style.setProperty('--y', `${currentY}%`);
            glassmorphicContainer.style.setProperty('--glare-opacity', glareOpacity);

            if (Math.abs(targetGlareOpacity - glareOpacity) > 0.01 || Math.abs(glareOpacity) > 0.01 || isNearContainer) {
                glareRAF = requestAnimationFrame(updateGlare);
            } else {
                isGlareActive = false;
                glareRAF = null;
            }
        }

        let mouseMoveThrottle = null;
        function handleMouseMove(e) {
            if (mouseMoveThrottle) return;

            mouseMoveThrottle = setTimeout(() => {
                mouseX = e.clientX;
                mouseY = e.clientY;

                if (!isGlareActive && isInViewport) {
                    isGlareActive = true;
                    lastGlareUpdate = performance.now();
                    glareRAF = requestAnimationFrame(updateGlare);
                }

                mouseMoveThrottle = null;
            }, THROTTLE_MS);
        }

        function handleMouseLeave() {
            targetGlareOpacity = 0;
        }

        document.addEventListener('mousemove', handleMouseMove, { passive: true });
        glassmorphicContainer.addEventListener('mouseleave', handleMouseLeave, { passive: true });
    }

    // requestIdleCallback polyfill
    if (!window.requestIdleCallback) {
        window.requestIdleCallback = function (cb, opts) {
            const timeout = opts?.timeout || 0;
            const start = performance.now();
            return setTimeout(() => {
                cb({
                    didTimeout: false,
                    timeRemaining: () => Math.max(0, timeout - (performance.now() - start))
                });
            }, 1);
        };
    }

    // Initialize
    init();
})();

// Midnight logout module
// Signs out non-admin users when local time transitions to 00:00 (midnight).
(function () {
    'use strict';

    const CHECK_INTERVAL_MS = 20 * 1000; // check every 20s
    const SUPABASE_WAIT_MS = 5000; // wait up to 5s for supabase client

    let lastFiredDate = null; // track the date we last triggered logout

    function nowIsMidnight() {
        const d = new Date();
        return d.getHours() === 0 && d.getMinutes() === 0;
    }

    async function ensureSupabase(timeout = SUPABASE_WAIT_MS) {
        const start = Date.now();
        while (typeof window.supabase === 'undefined') {
            if (Date.now() - start > timeout) return null;
            // eslint-disable-next-line no-await-in-loop
            await new Promise(r => setTimeout(r, 250));
        }
        return window.supabase;
    }

    async function signOutIfStudent() {
        try {
            const supabase = await ensureSupabase();

            // If no supabase client available, fallback to clearing sessionStorage and redirect
            if (!supabase) {
                const email = sessionStorage.getItem('userEmail');
                if (email) {
                    sessionStorage.removeItem('userEmail');
                    window.location.href = 'login.html';
                }
                return;
            }

            const { data: { session } } = await supabase.auth.getSession();
            if (!session || !session.user) return; // nothing to do

            const userEmail = session.user.email;
            if (!userEmail) return;

            // Query users table to determine role
            const { data: userRow, error } = await supabase
                .from('users')
                .select('is_admin')
                .eq('email', userEmail)
                .maybeSingle();

            if (error) {
                console.warn('Midnight logout: could not fetch user role', error.message || error);
                // conservative fallback: sign the user out
                await supabase.auth.signOut();
                sessionStorage.removeItem('userEmail');
                window.location.href = 'login.html';
                return;
            }

            if (userRow && userRow.is_admin) {
                // don't sign out admins
                return;
            }

            // Sign out non-admin user
            await supabase.auth.signOut();
            sessionStorage.removeItem('userEmail');
            // optional small delay to ensure sign-out processed
            setTimeout(() => window.location.href = 'login.html', 300);

        } catch (err) {
            console.error('Midnight logout error', err);
            // best-effort fallback
            sessionStorage.removeItem('userEmail');
            window.location.href = 'login.html';
        }
    }

    function checkAndFire() {
        const d = new Date();
        const dateKey = d.toISOString().slice(0, 10); // YYYY-MM-DD

        if (dateKey === lastFiredDate) return; // already fired for this date

        if (nowIsMidnight()) {
            lastFiredDate = dateKey;
            // trigger logout
            signOutIfStudent();
        }
    }

    // Run immediate check on visibility change (useful if tab was inactive over midnight)
    document.addEventListener('visibilitychange', () => {
        if (!document.hidden) checkAndFire();
    });

    // Run check on load
    window.addEventListener('load', () => {
        // also run an immediate check in case the page loaded exactly at midnight
        checkAndFire();
    });

    // Periodic polling
    setInterval(checkAndFire, CHECK_INTERVAL_MS);

})();
