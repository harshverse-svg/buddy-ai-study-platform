/**
 * SHIKSHA BUDDY — Lusion-Inspired Global Motion & Interaction Architecture
 * Integrates:
 * 1. Lenis smooth scroll synced with GSAP & ScrollTrigger
 * 2. Exact animated wordmark (blur-in, marigold shine, cursor deflection)
 * 3. Headline word blur-in reveal
 * 4. Dual-layer custom cursor (10px dot + 40px difference ring with label expansion)
 * 5. Magnetic button physics with GSAP quickTo
 * 6. Cinematic 0-100 counter loader with aubergine clip-path wipe
 * 7. Velocity & direction-reactive marquee
 * 8. Pinned feature scenes & SVG drawn step connector line
 * 9. Mascot "Bud" with blinking, pupil tracking, and thinking state pulse
 */

(function () {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isTouchDevice = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. LENIS SMOOTH SCROLL & SCROLLTRIGGER SYNC (Single Ticker)
    // ═══════════════════════════════════════════════════════════════════════════

    let lenis = null;
    let lenisTickerFn = null;

    function initLenis() {
        if (prefersReducedMotion || typeof Lenis === 'undefined') return;
        if (lenis) return; // already active

        lenis = new Lenis({
            duration: 1.0,
            easing: (t) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
            orientation: 'vertical',
            gestureOrientation: 'vertical',
            smoothWheel: true,
            syncTouch: false,
            lerp: 0.1,
            wheelMultiplier: 1,
            touchMultiplier: 1.5
        });

        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined') {
            lenis.on('scroll', ScrollTrigger.update);
            lenisTickerFn = (time) => {
                lenis.raf(time * 1000);
            };
            gsap.ticker.add(lenisTickerFn);
            gsap.ticker.lagSmoothing(0);
        }

        window.lenisInstance = lenis;
    }

    function destroyLenis() {
        if (!lenis) return;
        if (lenisTickerFn && typeof gsap !== 'undefined') {
            gsap.ticker.remove(lenisTickerFn);
            lenisTickerFn = null;
        }
        try {
            lenis.destroy();
        } catch (e) {}
        lenis = null;
        window.lenisInstance = null;
    }
    window.destroyLenis = destroyLenis;
    window.initLenis = initLenis;

    // Debounced resize (200ms) - never call ScrollTrigger.refresh() per scroll tick
    let resizeTimeout = null;
    window.addEventListener('resize', () => {
        clearTimeout(resizeTimeout);
        resizeTimeout = setTimeout(() => {
            if (typeof ScrollTrigger !== 'undefined') {
                ScrollTrigger.refresh();
            }
            if (window.updateWordmarkCache) {
                window.updateWordmarkCache();
            }
        }, 200);
    }, { passive: true });

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. CINEMATIC LOADER
    // ═══════════════════════════════════════════════════════════════════════════

    function initLoader() {
        const loader = document.getElementById('lusion-loader');
        const counterEl = document.getElementById('loader-counter');
        const progressBar = document.getElementById('loader-progress-bar');
        if (!loader || !counterEl) {
            document.body.classList.remove('loading-locked');
            return;
        }

        if (prefersReducedMotion) {
            loader.style.display = 'none';
            document.body.classList.remove('loading-locked');
            return;
        }

        document.body.classList.add('loading-locked');
        let progress = 0;
        const duration = 1400; // ms
        const startTime = performance.now();

        function updateLoader(now) {
            const elapsed = now - startTime;
            progress = Math.min(100, Math.floor((elapsed / duration) * 100));
            counterEl.textContent = String(progress).padStart(2, '0');
            if (progressBar) progressBar.style.width = `${progress}%`;

            if (progress < 100) {
                requestAnimationFrame(updateLoader);
            } else {
                setTimeout(() => {
                    loader.classList.add('reveal-out');
                    document.body.classList.remove('loading-locked');
                    setTimeout(() => {
                        loader.style.display = 'none';
                        triggerHeroEntrance();
                    }, 800);
                }, 200);
            }
        }

        requestAnimationFrame(updateLoader);
    }

    function triggerHeroEntrance() {
        if (typeof gsap !== 'undefined') {
            gsap.fromTo('.hero-sub', 
                { opacity: 0, y: 30, filter: 'blur(10px)' }, 
                { opacity: 1, y: 0, filter: 'blur(0px)', duration: 1.2, ease: 'power3.out', delay: 0.2 }
            );
            gsap.fromTo('.hero-actions', 
                { opacity: 0, y: 30 }, 
                { opacity: 1, y: 0, duration: 1.0, ease: 'power3.out', delay: 0.4 }
            );
            gsap.fromTo('.hero-scroll-hint', 
                { opacity: 0 }, 
                { opacity: 1, duration: 1.0, ease: 'power2.out', delay: 0.8 }
            );
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. ANIMATED WORDMARK (Cached Rects, Max 6 Letters, Transform-Only)
    // ═══════════════════════════════════════════════════════════════════════════

    function initWordmark() {
        const wm = document.getElementById('wm');
        if (!wm) return;

        const txt = wm.textContent.trim();
        wm.textContent = '';

        [...txt].forEach((c, i) => {
            const s = document.createElement('span');
            s.className = c === ' ' ? 'sp' : 'ch';
            s.textContent = c === ' ' ? '' : c;
            s.style.setProperty('--i', i);
            wm.appendChild(s);
        });

        if (prefersReducedMotion || isTouchDevice) return;

        const chars = [...wm.querySelectorAll('.ch')];
        let charData = [];

        function cacheCharPositions() {
            charData = chars.map(el => {
                const r = el.getBoundingClientRect();
                return {
                    el,
                    cx: r.left + r.width / 2,
                    cy: r.top + r.height / 2
                };
            });
        }
        window.updateWordmarkCache = cacheCharPositions;

        // Cache after render
        setTimeout(cacheCharPositions, 300);

        let mx = -999, my = -999;
        let pointerMoved = false;

        window.addEventListener('pointermove', e => {
            mx = e.clientX;
            my = e.clientY;
            pointerMoved = true;
        }, { passive: true });

        // Update once per frame via gsap.ticker or single rAF
        if (typeof gsap !== 'undefined') {
            gsap.ticker.add(() => {
                if (!pointerMoved || charData.length === 0) return;
                pointerMoved = false;

                // Sort by distance and only transform closest 6 within 240px
                const nearby = [];
                for (let i = 0; i < charData.length; i++) {
                    const item = charData[i];
                    const dx = mx - item.cx;
                    const dy = my - item.cy;
                    const dist = Math.hypot(dx, dy);
                    if (dist < 240) {
                        nearby.push({ item, dist, dx, dy });
                    } else {
                        // Reset if previously displaced
                        item.el.style.transform = '';
                    }
                }

                nearby.sort((a, b) => a.dist - b.dist);
                const activeCount = Math.min(6, nearby.length);

                for (let i = 0; i < nearby.length; i++) {
                    const { item, dist, dx, dy } = nearby[i];
                    if (i < activeCount) {
                        const f = 1 - dist / 240;
                        // Transform-only, NO per-frame filter:blur
                        item.el.style.transform = `translate3d(${-dx * 0.1 * f}px, ${-dy * 0.1 * f}px, 0) scale(${1 + f * 0.08})`;
                    } else {
                        item.el.style.transform = '';
                    }
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. HEADLINE BLUR-IN REVEAL ("Study slow. Learn deep.")
    // ═══════════════════════════════════════════════════════════════════════════

    function initHeadlineReveal() {
        const hl = document.getElementById('hero-headline');
        if (!hl) return;

        const raw = hl.innerHTML;
        // The headline contains: Study slow. Learn <span class="highlight-marigold">deep.</span>
        // Let's split words and preserve the marigold accent
        const words = [
            { text: 'Study', isAccent: false },
            { text: 'slow.', isAccent: false },
            { text: 'Learn', isAccent: false },
            { text: 'deep.', isAccent: true }
        ];

        hl.innerHTML = '';
        words.forEach((w, i) => {
            const span = document.createElement('span');
            span.className = `hl-word ${w.isAccent ? 'hl-marigold' : ''}`;
            span.textContent = w.text + ' ';
            span.style.setProperty('--wi', i);
            hl.appendChild(span);
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. CUSTOM CURSOR DELEGATION (Handled via cursor.js)
    // ═══════════════════════════════════════════════════════════════════════════

    function initCustomCursor() {
        // Unified single custom cursor is managed in cursor.js
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. MAGNETIC BUTTONS (gsap.quickTo within 80px, cached rects)
    // ═══════════════════════════════════════════════════════════════════════════

    function initMagneticButtons() {
        if (isTouchDevice || prefersReducedMotion || typeof gsap === 'undefined') return;

        const magneticEls = document.querySelectorAll('.btn-magnetic, .btn-cta-marigold, .dock-item, .btn-new-chat');

        magneticEls.forEach(btn => {
            const xTo = gsap.quickTo(btn, "x", { duration: 0.4, ease: "power3.out" });
            const yTo = gsap.quickTo(btn, "y", { duration: 0.4, ease: "power3.out" });
            let rect = null;

            btn.addEventListener('mouseenter', () => {
                rect = btn.getBoundingClientRect();
            }, { passive: true });

            btn.addEventListener('mousemove', (e) => {
                if (!rect) rect = btn.getBoundingClientRect();
                const btnCenterX = rect.left + rect.width / 2;
                const btnCenterY = rect.top + rect.height / 2;

                const dx = e.clientX - btnCenterX;
                const dy = e.clientY - btnCenterY;
                const dist = Math.hypot(dx, dy);

                if (dist < 80) {
                    const pull = Math.min(14, dist * 0.25);
                    const angle = Math.atan2(dy, dx);
                    xTo(Math.cos(angle) * pull);
                    yTo(Math.sin(angle) * pull);
                }
            }, { passive: true });

            btn.addEventListener('mouseleave', () => {
                rect = null;
                xTo(0);
                yTo(0);
            }, { passive: true });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 7. SCROLL-VELOCITY & DIRECTION-REACTIVE MARQUEE
    // ═══════════════════════════════════════════════════════════════════════════

    function initMarquee() {
        const marqueeTrack = document.getElementById('tagline-marquee-track');
        if (!marqueeTrack) return;

        let baseSpeed = 1.0;
        let currentPos = 0;
        let direction = 1; // 1 for leftward, -1 for rightward
        let lastScrollY = window.scrollY;
        let scrollVelocity = 0;
        let halfWidth = (marqueeTrack.scrollWidth || 2000) / 2;

        function updateMarqueeDimensions() {
            if (marqueeTrack) {
                halfWidth = (marqueeTrack.scrollWidth || 2000) / 2;
            }
        }
        window.addEventListener('resize', updateMarqueeDimensions, { passive: true });
        setTimeout(updateMarqueeDimensions, 300);

        window.addEventListener('scroll', () => {
            const currentScrollY = window.scrollY;
            const delta = currentScrollY - lastScrollY;
            scrollVelocity = Math.min(Math.abs(delta) * 0.15, 12);
            direction = delta >= 0 ? 1 : -1;
            lastScrollY = currentScrollY;
        }, { passive: true });

        function tickMarquee() {
            scrollVelocity *= 0.94; // Decay velocity back to base
            const speed = (baseSpeed + scrollVelocity) * direction;
            currentPos -= speed;

            // Half width reset for seamless infinite loop (cached, no layout read)
            if (currentPos <= -halfWidth) {
                currentPos += halfWidth;
            } else if (currentPos > 0) {
                currentPos -= halfWidth;
            }

            marqueeTrack.style.transform = `translate3d(${currentPos}px, 0, 0)`;
        }

        if (typeof gsap !== 'undefined') {
            gsap.ticker.add(tickMarquee);
        } else {
            function loop() {
                tickMarquee();
                requestAnimationFrame(loop);
            }
            requestAnimationFrame(loop);
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 8. PINNED FEATURE SCENES & SVG DRAWN CONNECTOR LINE
    // ═══════════════════════════════════════════════════════════════════════════

    function initFeatureScenes() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined' || prefersReducedMotion) return;

        // Pinned feature cards animation
        const scenes = document.querySelectorAll('.feature-scene-card');
        scenes.forEach((scene, index) => {
            gsap.fromTo(scene, 
                { opacity: 0.2, scale: 0.95, y: 40 },
                {
                    opacity: 1,
                    scale: 1,
                    y: 0,
                    duration: 1,
                    ease: "power2.out",
                    scrollTrigger: {
                        trigger: scene,
                        start: "top 75%",
                        end: "top 35%",
                        scrub: 0.5
                    }
                }
            );
        });

        // SVG Step Connector Line drawing
        const connectorPath = document.getElementById('steps-connector-path');
        if (connectorPath) {
            const pathLength = connectorPath.getTotalLength();
            connectorPath.style.strokeDasharray = pathLength;
            connectorPath.style.strokeDashoffset = pathLength;

            gsap.to(connectorPath, {
                strokeDashoffset: 0,
                ease: "none",
                scrollTrigger: {
                    trigger: "#how-it-works",
                    start: "top 70%",
                    end: "bottom 70%",
                    scrub: 1
                }
            });
        }
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 9. MASCOT "BUD" (SVG Orb with Blinking, Cursor Tracking & Thinking State)
    // ═══════════════════════════════════════════════════════════════════════════

    function initMascotBud() {
        const bud = document.getElementById('mascot-bud');
        if (!bud) return;
        const leftPupil = bud.querySelector('.pupil-left');
        const rightPupil = bud.querySelector('.pupil-right');

        let budRect = null;
        function updateBudRect() {
            if (bud) budRect = bud.getBoundingClientRect();
        }
        window.addEventListener('resize', updateBudRect, { passive: true });
        setTimeout(updateBudRect, 300);

        // Eye tracking
        window.addEventListener('pointermove', (e) => {
            if (!budRect) updateBudRect();
            if (!budRect) return;
            const budX = budRect.left + budRect.width / 2;
            const budY = budRect.top + budRect.height / 2;

            const dx = e.clientX - budX;
            const dy = e.clientY - budY;
            const dist = Math.hypot(dx, dy);
            const maxOffset = 3.5;

            const angle = Math.atan2(dy, dx);
            const offsetX = Math.cos(angle) * Math.min(dist * 0.05, maxOffset);
            const offsetY = Math.sin(angle) * Math.min(dist * 0.05, maxOffset);

            if (leftPupil) leftPupil.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);
            if (rightPupil) rightPupil.setAttribute('transform', `translate(${offsetX}, ${offsetY})`);
        }, { passive: true });

        // Natural blink every 4s
        setInterval(() => {
            bud.classList.add('is-blinking');
            setTimeout(() => {
                bud.classList.remove('is-blinking');
            }, 180);
        }, 4000);

        // Hover bounce
        bud.addEventListener('mouseenter', () => {
            bud.classList.add('is-bouncing');
            setTimeout(() => { bud.classList.remove('is-bouncing'); }, 600);
        });

        // Global mascot state manager
        window.setBudState = function(state) {
            bud.classList.remove('is-thinking', 'is-happy', 'is-celebrating');
            if (state === 'thinking') {
                bud.classList.add('is-thinking');
                document.body.classList.add('ai-thinking');
            } else if (state === 'happy') {
                bud.classList.add('is-happy');
                document.body.classList.remove('ai-thinking');
            } else if (state === 'celebrating') {
                bud.classList.add('is-celebrating');
                document.body.classList.remove('ai-thinking');
            } else {
                document.body.classList.remove('ai-thinking');
            }
        };
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 10. INITIALIZATION
    // ═══════════════════════════════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', () => {
        initLenis();
        initLoader();
        initWordmark();
        initHeadlineReveal();
        initCustomCursor();
        initMagneticButtons();
        initMarquee();
        initFeatureScenes();
        initMascotBud();

        if (document.fonts && document.fonts.ready) {
            document.fonts.ready.then(() => {
                if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
            });
        }
    });

    window.addEventListener('load', () => {
        if (typeof ScrollTrigger !== 'undefined') ScrollTrigger.refresh();
    }, { passive: true });

    window.LusionMotion = {
        initLenis,
        initWordmark,
        initHeadlineReveal,
        initCustomCursor,
        initMagneticButtons,
        initMarquee,
        initMascotBud
    };
})();
