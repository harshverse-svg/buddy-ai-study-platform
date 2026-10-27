/**
 * SHIKSHA BUDDY — Seamless Page Transitions (SPA)
 * Feature 6: High-resolution pixelated resolving wordmark (2x DPR offscreen canvas),
 * 56px geometric loader mark morph, real 220px progress bar,
 * crisp HTML text swap, and clean route management.
 */

(function () {
    'use strict';

    let isTransitioning = false;
    let currentRoute = window.location.hash.includes('app') ? 'app' : 'landing';

    // Create transition DOM if not already present
    function createTransitionDOM() {
        if (document.getElementById('page-transition-overlay')) return;

        const overlay = document.createElement('div');
        overlay.id = 'page-transition-overlay';
        overlay.className = 'page-trans-overlay';
        overlay.setAttribute('aria-hidden', 'true');

        // 12 Columns container
        const colsContainer = document.createElement('div');
        colsContainer.className = 'trans-cols-container';
        for (let i = 0; i < 12; i++) {
            const col = document.createElement('div');
            col.className = 'trans-col';
            colsContainer.appendChild(col);
        }
        overlay.appendChild(colsContainer);

        // Center Content container (strictly centered with flex, no overlapping)
        const center = document.createElement('div');
        center.className = 'trans-center-stage';
        center.innerHTML = `
            <!-- 56px Geometric Loader Mark (Above wordmark with 24px spacing) -->
            <div class="trans-loader-mark">
                <svg class="trans-geo-svg" viewBox="0 0 56 56" width="56" height="56">
                    <rect class="geo-morph-rect" x="8" y="8" width="40" height="40" rx="0" fill="none" stroke="#EAAA00" stroke-width="2.5"/>
                </svg>
            </div>

            <!-- Resolving Wordmark Box -->
            <div class="trans-wordmark-container">
                <canvas id="trans-pixel-canvas"></canvas>
                <div id="trans-sharp-text" class="trans-sharp-text" style="display:none;">Shiksha Buddy</div>
            </div>

            <!-- 220px Progress Track (Below wordmark) -->
            <div class="trans-progress-line">
                <div class="trans-progress-bar" id="trans-progress-bar"></div>
            </div>

            <!-- Crafted by Neural Nomads -->
            <div class="trans-credit">
                <span>Crafted by Neural Nomads</span>
            </div>
        `;
        overlay.appendChild(center);
        document.body.appendChild(overlay);
    }

    // High-Resolution Pixelated Text Resolver
    function renderPixelatedText(targetText, onComplete) {
        const canvas = document.getElementById('trans-pixel-canvas');
        const sharpTextEl = document.getElementById('trans-sharp-text');
        if (!canvas) {
            if (onComplete) onComplete();
            return;
        }

        // Show canvas, hide sharp text during resolve
        canvas.style.display = 'block';
        if (sharpTextEl) {
            sharpTextEl.style.display = 'none';
            sharpTextEl.textContent = targetText;
        }

        const dpr = Math.max(2, window.devicePixelRatio || 2);
        const container = canvas.parentElement;
        const displayW = Math.min(520, Math.max(260, container ? container.clientWidth : 360));
        const displayH = 80;

        // Set on-screen canvas buffer size to 2x DPR
        canvas.width = displayW * dpr;
        canvas.height = displayH * dpr;
        canvas.style.width = displayW + 'px';
        canvas.style.height = displayH + 'px';

        const ctx = canvas.getContext('2d');
        ctx.imageSmoothingEnabled = false;

        // High-resolution offscreen canvas (2x DPR)
        const offW = Math.round(displayW * dpr);
        const offH = Math.round(displayH * dpr);
        const offCanvas = document.createElement('canvas');
        offCanvas.width = offW;
        offCanvas.height = offH;
        const offCtx = offCanvas.getContext('2d');

        offCtx.fillStyle = '#000000';
        offCtx.fillRect(0, 0, offW, offH);

        // Render at font 800 64px "Clash Display" scaled for DPR
        const fontSize = Math.round(36 * dpr);
        offCtx.font = `800 ${fontSize}px "Clash Display", sans-serif`;
        offCtx.textAlign = 'center';
        offCtx.textBaseline = 'middle';
        offCtx.fillStyle = '#DDE3E8'; // var(--ice)
        offCtx.fillText(targetText, offW / 2, offH / 2);

        const imgData = offCtx.getImageData(0, 0, offW, offH);
        const data = imgData.data;

        // Pixel sampling steps down: 28 > 18 > 12 > 8 > 4 > 2 > 1
        const pixelSizes = [28, 18, 12, 8, 4, 2, 1];
        let step = 0;

        function drawStep() {
            const size = Math.round(pixelSizes[step] * (dpr / 2));
            ctx.clearRect(0, 0, canvas.width, canvas.height);

            for (let y = 0; y < offH; y += size) {
                for (let x = 0; x < offW; x += size) {
                    const idx = (y * offW + x) * 4;
                    const r = data[idx];
                    const a = data[idx + 3];

                    if (r > 35 && a > 35) {
                        // Marigold flicker blocks only during first steps (size >= 8)
                        const isMarigoldFlicker = (pixelSizes[step] >= 8) && (Math.random() < 0.14);
                        ctx.fillStyle = isMarigoldFlicker ? '#EAAA00' : '#DDE3E8';
                        ctx.fillRect(x, y, size, size);
                    }
                }
            }

            step++;
            if (step < pixelSizes.length) {
                setTimeout(drawStep, 80);
            } else {
                // Hold crisp text for at least 500ms, then swap to real HTML text node
                setTimeout(() => {
                    canvas.style.display = 'none';
                    if (sharpTextEl) {
                        sharpTextEl.style.display = 'block';
                    }
                    if (onComplete) onComplete();
                }, 520);
            }
        }

        drawStep();
    }

    // Core Transition Function
    function executeTransition(targetView, callback) {
        if (isTransitioning) return;
        isTransitioning = true;

        const overlay = document.getElementById('page-transition-overlay');
        const cols = overlay.querySelectorAll('.trans-col');
        const center = overlay.querySelector('.trans-center-stage');
        const progressBar = document.getElementById('trans-progress-bar');
        const targetTitle = targetView === 'app' ? 'Shiksha Buddy' : 'Shiksha Buddy';

        overlay.classList.add('is-active');
        document.body.classList.add('loading-locked');
        document.body.classList.add('in-transition');

        // Reset elements
        gsap.set(cols, { transformOrigin: 'bottom center', scaleY: 0 });
        gsap.set(center, { opacity: 0, scale: 0.95 });
        if (progressBar) progressBar.style.width = '0%';

        const tl = gsap.timeline();

        // 1. OUT: 12 Columns scale up from bottom (0.04s stagger, power4.inOut, 0.5s)
        tl.to(cols, {
            scaleY: 1,
            duration: 0.5,
            ease: 'power4.inOut',
            stagger: 0.03
        });

        // 2. Center stage fade-in during full cover
        tl.to(center, {
            opacity: 1,
            scale: 1,
            duration: 0.3,
            ease: 'power2.out'
        }, '-=0.15');

        // Real Progress line animation (driven from 0% to 100% across transition)
        if (progressBar) {
            tl.to(progressBar, {
                width: '100%',
                duration: 1.1,
                ease: 'power1.inOut'
            }, '<');
        }

        // Start High-Res resolving wordmark
        tl.add(() => {
            renderPixelatedText(targetTitle);
        }, '<');

        // Minimum total overlay time: at least 1200ms
        tl.to({}, { duration: 1.25 });

        // Swap View in DOM while fully covered
        tl.add(() => {
            if (typeof callback === 'function') {
                callback();
            }
            currentRoute = targetView;
            if (targetView === 'app') {
                if (!window.location.hash.startsWith('#app')) {
                    window.location.hash = '#app';
                }
            } else {
                if (!window.location.hash.startsWith('#landing')) {
                    window.location.hash = '#landing';
                }
            }

            if (typeof ScrollTrigger !== 'undefined') {
                ScrollTrigger.refresh();
            }
            if (window.lenisInstance) {
                window.lenisInstance.scrollTo(0, { immediate: true });
            }
        });

        // 3. IN: Columns scale down to top
        tl.to(center, {
            opacity: 0,
            duration: 0.25,
            ease: 'power2.in'
        });

        tl.add(() => {
            gsap.set(cols, { transformOrigin: 'top center' });
        });

        tl.to(cols, {
            scaleY: 0,
            duration: 0.5,
            ease: 'power4.inOut',
            stagger: 0.03
        });

        tl.add(() => {
            overlay.classList.remove('is-active');
            document.body.classList.remove('loading-locked');
            document.body.classList.remove('in-transition');
            isTransitioning = false;
        });
    }

    // Public API
    window.PageTransitions = {
        init: function () {
            createTransitionDOM();

            function getWsIndexFromHash() {
                const h = (window.location.hash || '').toLowerCase();
                if (h.includes('ask')) return 1;
                if (h.includes('map')) return 2;
                if (h.includes('book')) return 3;
                if (h.includes('summary')) return 4;
                if (h.includes('quiz')) return 5;
                if (h.includes('stats')) return 6;
                return 0;
            }

            const initialTarget = window.location.hash.includes('app') ? 'app' : 'landing';
            const oldLoader = document.getElementById('lusion-loader');
            if (oldLoader) oldLoader.style.display = 'none';

            executeTransition(initialTarget, () => {
                if (initialTarget === 'app') {
                    const landing = document.getElementById('landing-view');
                    const app = document.getElementById('app-view') || document.getElementById('app');
                    if (landing) landing.style.display = 'none';
                    if (app) app.style.display = 'flex';
                    document.body.classList.add('in-app-mode', 'is-app');
                    if (window.destroyLenis) window.destroyLenis();
                    if (window.switchWorkspace) window.switchWorkspace(getWsIndexFromHash());
                } else {
                    const landing = document.getElementById('landing-view');
                    const app = document.getElementById('app-view') || document.getElementById('app');
                    if (app) app.style.display = 'none';
                    if (landing) landing.style.display = 'block';
                    document.body.classList.remove('in-app-mode', 'is-app');
                    if (window.initLenis) window.initLenis();
                }
            });

            window.addEventListener('hashchange', () => {
                const isApp = window.location.hash.includes('app');
                const target = isApp ? 'app' : 'landing';
                document.body.classList.toggle('is-app', isApp);
                if (target !== currentRoute && !isTransitioning) {
                    window.PageTransitions.navigate(target, getWsIndexFromHash());
                } else if (isApp && window.switchWorkspace) {
                    window.switchWorkspace(getWsIndexFromHash());
                }
            });
        },

        navigate: function (targetView, wsIndex = undefined) {
            function getWsIndexFromHash() {
                const h = (window.location.hash || '').toLowerCase();
                if (h.includes('ask')) return 1;
                if (h.includes('map')) return 2;
                if (h.includes('book')) return 3;
                if (h.includes('summary')) return 4;
                if (h.includes('quiz')) return 5;
                if (h.includes('stats')) return 6;
                return 0;
            }

            const resolvedWs = wsIndex !== undefined ? wsIndex : getWsIndexFromHash();

            executeTransition(targetView, () => {
                const landing = document.getElementById('landing-view');
                const app = document.getElementById('app-view') || document.getElementById('app');

                if (targetView === 'app') {
                    if (landing) landing.style.display = 'none';
                    if (app) app.style.display = 'flex';
                    document.body.classList.add('in-app-mode', 'is-app');
                    if (window.destroyLenis) window.destroyLenis();
                    if (window.HeroHologram) window.HeroHologram.pause();
                    if (window.switchWorkspace) window.switchWorkspace(resolvedWs);
                } else {
                    if (app) app.style.display = 'none';
                    if (landing) landing.style.display = 'block';
                    document.body.classList.remove('in-app-mode', 'is-app');
                    if (window.initLenis) window.initLenis();
                    if (window.HeroHologram) window.HeroHologram.play();
                    window.scrollTo({ top: 0, behavior: 'instant' });
                }
            });
        }
    };

    document.addEventListener('DOMContentLoaded', () => {
        window.PageTransitions.init();
    });
})();
