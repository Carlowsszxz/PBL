// register.html: UI-only logic (fade, icons, nav, cursor, burger)
document.addEventListener('DOMContentLoaded', function() {
    if (window.lucide) lucide.createIcons();
    setTimeout(() => {
        document.getElementById('fade-content')?.classList.add('is-visible');
    }, 100);
    // Cursor follower
    const cursorFollower = document.getElementById('cursor-follower');
    let mouseX=0, mouseY=0, followerX=0, followerY=0;
    document.addEventListener('mousemove', (e) => {
        mouseX = e.clientX; mouseY = e.clientY; cursorFollower.style.opacity = '1';
    });
    function animateCursor() {
        followerX += (mouseX - followerX) * 0.1;
        followerY += (mouseY - followerY) * 0.1;
        cursorFollower.style.transform = `translate(${followerX}px, ${followerY}px) translate(-50%, -50%)`;
        requestAnimationFrame(animateCursor);
    }
    animateCursor();
    // Header menu
    const headerTrigger=document.getElementById('headerTrigger');
    const headerNav=document.getElementById('headerNav');
    let headerExpanded=false;
    headerTrigger.addEventListener('click', () => {
        headerExpanded=!headerExpanded;
        if(headerExpanded){headerTrigger.classList.add('header-expanded','trigger-expanded');headerTrigger.classList.remove('trigger-collapsed');headerNav.classList.remove('header-collapsed','animating-out');headerNav.classList.add('header-expanded','animating-in');}
        else{headerTrigger.classList.remove('header-expanded','trigger-expanded');headerTrigger.classList.add('trigger-collapsed');headerNav.classList.remove('header-expanded','animating-in');headerNav.classList.add('header-collapsed','animating-out');}
    });
    // Mobile burger menu
    const burgerBtn = document.getElementById('burgerMenuBtn');
    const mobileOverlay = document.getElementById('mobileMenuOverlay');
    const mobilePanel = document.getElementById('mobileMenuPanel');
    burgerBtn.addEventListener('click', () => {
        burgerBtn.classList.toggle('active');
        mobileOverlay.classList.toggle('active');
        mobilePanel.classList.toggle('active');
    });
    mobileOverlay.addEventListener('click', () => {
        burgerBtn.classList.remove('active');
        mobileOverlay.classList.remove('active');
        mobilePanel.classList.remove('active');
    });
    // Nav item hover labels
    const navItems=document.querySelectorAll('.sidebar-nav-item');
    const navLabel=document.getElementById('navLabel');
    navItems.forEach(item=>{
        item.addEventListener('mouseenter',e=>{
            const label = e.currentTarget.getAttribute('data-label');
            navLabel.textContent = label;
            navLabel.classList.add('visible');
        });
        item.addEventListener('mouseleave',()=>{navLabel.classList.remove('visible');});
    });

    // Initialize register slideshow
    initRegisterSlideshow();
});

// Register slideshow: cycles through available library images
function initRegisterSlideshow() {
    const container = document.getElementById('registerSlideshow');
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

    // Fallback: dynamically build slides if not present
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
