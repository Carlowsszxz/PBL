// login.html: UI effects for fade, icons, nav, cursor, burger - OPTIMIZED

(function() {
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
        window.requestIdleCallback = function(cb, opts) {
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
