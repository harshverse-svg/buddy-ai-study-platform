/**
 * BUDDY — ThreeUI "Aureon" Shader & Motion Engine
 * ThreeUI Orbital Dust & AURAL Material Field, Holo Cards, Thermo Buttons & Spark Badges
 * Designed for High-Legibility, Focus-Driven Premium AI Study Platform (ThreeUI.com aesthetic)
 */

(function () {
    'use strict';

    // ═══════════════════════════════════════════════════════════════════════════
    // 1. CLEAN OBSIDIAN CANVAS & MOTION GRAPHICS
    // Full-screen noisy shader background removed per Linear/Vercel matte specification.
    // Replaced with dynamic cursor border spotlight tracking and scrollytelling engine.
    // ═══════════════════════════════════════════════════════════════════════════

    function initCursorSpotlightTracking() {
        // High-performance RAF throttle for cursor spotlight on glass/bento cards
        let lastMove = 0;
        window.addEventListener('mousemove', (e) => {
            const now = performance.now();
            if (now - lastMove < 16) return; // ~60fps
            lastMove = now;

            const cards = document.querySelectorAll('.bento-card, .glass-card, .timeline-step-card, .threeui-shader-btn, .threeui-thermo-btn, .spec-col');
            cards.forEach(card => {
                const rect = card.getBoundingClientRect();
                if (e.clientX >= rect.left - 60 && e.clientX <= rect.right + 60 &&
                    e.clientY >= rect.top - 60 && e.clientY <= rect.bottom + 60) {
                    const x = e.clientX - rect.left;
                    const y = e.clientY - rect.top;
                    card.style.setProperty('--mouse-x', `${x}px`);
                    card.style.setProperty('--mouse-y', `${y}px`);
                    card.style.setProperty('--x', `${x}px`);
                    card.style.setProperty('--y', `${y}px`);
                }
            });
        }, { passive: true });
    }

    function initScrollytelling() {
        const timelineContainer = document.querySelector('.scrolly-timeline-container');
        const fillBar = document.getElementById('pipeline-progress-fill');
        const stepCards = document.querySelectorAll('.timeline-step-card');

        if (!timelineContainer || !fillBar) return;

        function updateProgress() {
            const rect = timelineContainer.getBoundingClientRect();
            const winH = window.innerHeight;
            const startOffset = winH * 0.75;
            const currentDist = startOffset - rect.top;
            const totalDist = rect.height;

            let progress = currentDist / totalDist;
            progress = Math.max(0, Math.min(1, progress));
            fillBar.style.height = `${(progress * 100).toFixed(1)}%`;

            stepCards.forEach((card, idx) => {
                const cardRect = card.getBoundingClientRect();
                if (cardRect.top < winH * 0.8 && cardRect.bottom > winH * 0.2) {
                    card.classList.add('step-active');
                } else {
                    card.classList.remove('step-active');
                }
            });
        }

        window.addEventListener('scroll', updateProgress, { passive: true });
        updateProgress();
    }

    function initScrollReveal() {
        const items = document.querySelectorAll('.reveal-item');
        if (!items.length) return;

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) {
                    entry.target.classList.add('is-revealed');
                }
            });
        }, {
            threshold: 0.1,
            rootMargin: '0px 0px -40px 0px'
        });

        items.forEach(el => observer.observe(el));
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 2. THREEUI "HOLO CARD" (DARK SOULS FOIL & SUBTLE PHYSICAL GLASS TEXTURE)
    // ═══════════════════════════════════════════════════════════════════════════

    function applyHoloCards() {
        const cardSelectors = [
            '.quiz-card',
            '.analytics-card',
            '.glass-card',
            '.neural-core-panel',
            '.node-inspector',
            '.cheat-sheet-panel',
            '.remediation-card',
            '.book-content'
        ];

        const cards = document.querySelectorAll(cardSelectors.join(', '));

        cards.forEach((card) => {
            if (card.dataset.holoBound === 'true') return;
            card.dataset.holoBound = 'true';

            card.classList.add('threeui-holo-card');

            // Inject subtle holographic foil layer & specular shine
            if (!card.querySelector('.holo-foil-layer')) {
                const foil = document.createElement('div');
                foil.className = 'holo-foil-layer';
                card.appendChild(foil);
            }

            if (!card.querySelector('.holo-shine-layer')) {
                const shine = document.createElement('div');
                shine.className = 'holo-shine-layer';
                card.appendChild(shine);
            }

            let bounds;
            let isHovered = false;

            card.addEventListener('mouseenter', () => {
                isHovered = true;
                bounds = card.getBoundingClientRect();
                card.classList.add('holo-active');
            });

            card.addEventListener('mousemove', (e) => {
                if (!isHovered || !bounds) bounds = card.getBoundingClientRect();

                const mouseX = e.clientX - bounds.left;
                const mouseY = e.clientY - bounds.top;

                const normX = (mouseX / bounds.width) - 0.5;
                const normY = (mouseY / bounds.height) - 0.5;

                // Subtle 3D tilt (max 8-10 deg for high-end feel)
                const rotX = -normY * 12;
                const rotY = normX * 12;

                const angle = Math.atan2(mouseY - bounds.height / 2, mouseX - bounds.width / 2) * (180 / Math.PI) + 90;

                const px = (mouseX / bounds.width) * 100;
                const py = (mouseY / bounds.height) * 100;

                card.style.setProperty('--card-rot-x', `${rotX.toFixed(2)}deg`);
                card.style.setProperty('--card-rot-y', `${rotY.toFixed(2)}deg`);
                card.style.setProperty('--foil-angle', `${angle.toFixed(1)}deg`);
                card.style.setProperty('--mouse-x', `${px.toFixed(1)}%`);
                card.style.setProperty('--mouse-y', `${py.toFixed(1)}%`);
            });

            card.addEventListener('mouseleave', () => {
                isHovered = false;
                card.classList.remove('holo-active');
                card.style.setProperty('--card-rot-x', '0deg');
                card.style.setProperty('--card-rot-y', '0deg');
                card.style.setProperty('--mouse-x', '50%');
                card.style.setProperty('--mouse-y', '50%');
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 3. THREEUI "AUREON CRYSTAL" & "THERMO BUTTON" SHADERS
    // ═══════════════════════════════════════════════════════════════════════════

    function applyShaderButtons() {
        const buttonSelectors = [
            '.btn-generate',
            '.btn-generate-quiz',
            '.btn-send',
            '.btn-new-session',
            '.btn-quiz-node',
            '.btn-secondary'
        ];

        const buttons = document.querySelectorAll(buttonSelectors.join(', '));

        buttons.forEach((btn) => {
            if (btn.dataset.shaderBtnBound === 'true') return;
            btn.dataset.shaderBtnBound = 'true';

            btn.classList.add('threeui-shader-btn');

            // Primary CTAs get the ThreeUI "Thermo" multi-colored heatmap glow underneath the glass
            const isPrimaryCTA = btn.classList.contains('btn-generate') ||
                                 btn.classList.contains('btn-generate-quiz') ||
                                 btn.classList.contains('btn-send') ||
                                 btn.classList.contains('btn-new-session');

            if (isPrimaryCTA) {
                btn.classList.add('threeui-thermo-btn');
                if (!btn.querySelector('.thermo-heat-glow')) {
                    const thermoGlow = document.createElement('span');
                    thermoGlow.className = 'thermo-heat-glow';
                    btn.prepend(thermoGlow);
                }
            }

            // Spotlight / heat coordinates tracking on cursor move
            btn.addEventListener('mousemove', (e) => {
                const rect = btn.getBoundingClientRect();
                const x = e.clientX - rect.left;
                const y = e.clientY - rect.top;
                btn.style.setProperty('--x', `${x}px`);
                btn.style.setProperty('--y', `${y}px`);
                btn.style.setProperty('--btn-x', `${x}px`);
                btn.style.setProperty('--btn-y', `${y}px`);
            });
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 4. THREEUI "SPARK BADGES" (SELF-DRAWING BORDER & PARTICLE BURST)
    // ═══════════════════════════════════════════════════════════════════════════

    function applySparkBadges() {
        const pills = document.querySelectorAll('.difficulty-pill');

        pills.forEach((pill) => {
            if (pill.dataset.sparkBound === 'true') return;
            pill.dataset.sparkBound = 'true';

            pill.classList.add('spark-badge');

            if (!pill.querySelector('.spark-badge-label')) {
                const text = pill.textContent.trim();
                pill.innerHTML = `
                    <svg class="spark-svg-border" viewBox="0 0 100 36" preserveAspectRatio="none">
                        <rect class="spark-rect" x="1.5" y="1.5" width="97" height="33" rx="16" />
                    </svg>
                    <span class="spark-badge-label">${text}</span>
                `;
            }

            pill.addEventListener('click', () => {
                triggerSparkBurst(pill);
            });
        });
    }

    function triggerSparkBurst(element) {
        const canvas = document.getElementById('particle-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const rect = element.getBoundingClientRect();
        const originX = rect.left + rect.width / 2;
        const originY = rect.top + rect.height / 2;

        const sparks = [];
        const count = 30;
        const colors = ['#00F2FE', '#7F00FF', '#00FF9D', '#FFB800', '#FFFFFF'];

        for (let i = 0; i < count; i++) {
            const angle = Math.random() * Math.PI * 2;
            const speed = 1.8 + Math.random() * 4.5;
            sparks.push({
                x: originX,
                y: originY,
                vx: Math.cos(angle) * speed,
                vy: Math.sin(angle) * speed,
                size: 1.2 + Math.random() * 2.5,
                life: 1.0,
                decay: 0.025 + Math.random() * 0.035,
                color: colors[Math.floor(Math.random() * colors.length)]
            });
        }

        function animateSparks() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let active = false;

            for (let i = 0; i < sparks.length; i++) {
                const s = sparks[i];
                if (s.life <= 0) continue;

                s.x += s.vx;
                s.y += s.vy;
                s.life -= s.decay;

                if (s.life <= 0) continue;
                active = true;

                const radius = Math.max(0.1, s.size * s.life);

                ctx.save();
                ctx.globalAlpha = Math.max(0, s.life);
                ctx.shadowColor = s.color;
                ctx.shadowBlur = 6;
                ctx.fillStyle = s.color;
                ctx.beginPath();
                ctx.arc(s.x, s.y, radius, 0, Math.PI * 2);
                ctx.fill();
                ctx.restore();
            }

            if (active) {
                requestAnimationFrame(animateSparks);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }

        animateSparks();
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 5. THREEUI "TYPOGRAPHY VORTEX" REVEAL
    // ═══════════════════════════════════════════════════════════════════════════

    function applyTypographyVortex(container) {
        if (!container) return;
        const textElements = container.querySelectorAll('h1, h2, h3, p, li, .quiz-card');
        textElements.forEach((el, index) => {
            if (el.dataset.vortexApplied) return;
            el.dataset.vortexApplied = 'true';
            el.classList.add('threeui-typography-vortex');
            el.style.animationDelay = `${Math.min(index * 0.035, 0.35)}s`;
        });
    }

    // ═══════════════════════════════════════════════════════════════════════════
    // 6. INITIALIZATION & OBSERVER
    // ═══════════════════════════════════════════════════════════════════════════

    document.addEventListener('DOMContentLoaded', () => {
        initCursorSpotlightTracking();
        initScrollytelling();
        initScrollReveal();
        applyHoloCards();
        applyShaderButtons();
        applySparkBadges();

        const observer = new MutationObserver(() => {
            applyHoloCards();
            applyShaderButtons();
            applySparkBadges();
        });

        observer.observe(document.body, { childList: true, subtree: true });
    });

    window.ThreeUI = {
        applyHoloCards,
        applyShaderButtons,
        applySparkBadges,
        triggerSparkBurst,
        applyTypographyVortex,
        initScrollytelling,
        initScrollReveal
    };

})();
