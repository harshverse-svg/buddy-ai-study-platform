/**
 * SHIKSHA BUDDY — Physics Particle Swarm (Marigold Canvas)
 * Feature 4: Canvas2D with 2500 pre-rendered 2D cross/star sprites in Aubergine & Ice,
 * Euler physics with spatial hash collisions, cursor orbiting & burst, and
 * ScrollTrigger vortex funnel draining downward into the closing CTA.
 */

(function () {
    'use strict';

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const isMobile = window.innerWidth < 768;

    const section = document.getElementById('swarm-section');
    const canvas = document.getElementById('swarm-canvas');
    if (!section || !canvas) return;

    const ctx = canvas.getContext('2d');
    
    // Adaptive Quality Tracking (2500 -> 1200 -> 600)
    let qualityLevel = 0;
    let slowFramesCount = 0;
    let lastFrameTime = performance.now();
    let maxParticles = isMobile ? 1200 : 2500;

    let width, height;
    let particles = [];
    let isVisible = false;

    let mouseX = -9999, mouseY = -9999;
    let isMouseOver = false;
    let scrollProgress = 0;
    let sectionRect = { left: 0, top: 0 };

    function updateSectionRect() {
        if (section) sectionRect = section.getBoundingClientRect();
    }

    // ─── Pre-Render Offscreen Sprites ──────────────────────────────────────────
    const spriteCrossAubergine = createOffscreenSprite('cross', '#3A0F34');
    const spriteStarAubergine = createOffscreenSprite('star', '#3A0F34');
    const spriteCrossIce = createOffscreenSprite('cross', 'rgba(221, 227, 232, 0.7)');

    function createOffscreenSprite(type, color) {
        const off = document.createElement('canvas');
        off.width = 24;
        off.height = 24;
        const octx = off.getContext('2d');
        octx.fillStyle = color;
        octx.translate(12, 12);

        if (type === 'cross') {
            // Plus / Cross shape
            octx.fillRect(-6, -1.8, 12, 3.6);
            octx.fillRect(-1.8, -6, 3.6, 12);
        } else if (type === 'star') {
            // 4-pointed Star
            octx.beginPath();
            octx.moveTo(0, -8);
            octx.quadraticCurveTo(0, 0, 8, 0);
            octx.quadraticCurveTo(0, 0, 0, 8);
            octx.quadraticCurveTo(0, 0, -8, 0);
            octx.quadraticCurveTo(0, 0, 0, -8);
            octx.fill();
        }
        return off;
    }

    // ─── Particle Structure ───────────────────────────────────────────────────
    function initParticles() {
        particles = [];
        // Most aubergine (#3A0F34), a few ice (#DDE3E8 at 70% opacity)
        const sprites = [
            spriteCrossAubergine,
            spriteStarAubergine,
            spriteCrossAubergine,
            spriteStarAubergine,
            spriteCrossIce
        ];

        for (let i = 0; i < maxParticles; i++) {
            const sprite = sprites[i % sprites.length];
            particles.push({
                x: Math.random() * width,
                y: Math.random() * height,
                vx: (Math.random() - 0.5) * 1.5,
                vy: (Math.random() - 0.5) * 1.5,
                radius: 7,
                rotation: Math.random() * Math.PI * 2,
                rotSpeed: (Math.random() - 0.5) * 0.05,
                sprite: sprite,
                alpha: 0.85 + Math.random() * 0.15
            });
        }
    }

    // ─── Resize Handler (Debounced 200ms) ───────────────────────────────────────
    function resize() {
        const dpr = isMobile ? 1 : Math.min(window.devicePixelRatio || 1, 1.5);
        width = section.clientWidth || window.innerWidth;
        height = section.clientHeight || window.innerHeight;

        canvas.width = Math.floor(width * dpr);
        canvas.height = Math.floor(height * dpr);
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

        updateSectionRect();

        if (particles.length === 0) {
            initParticles();
        }
    }

    // ─── Spatial Hash Grid for Soft Collisions ────────────────────────────────
    const CELL_SIZE = 28;
    let grid = new Map();

    function hashPos(x, y) {
        const cx = Math.floor(x / CELL_SIZE);
        const cy = Math.floor(y / CELL_SIZE);
        return `${cx},${cy}`;
    }

    function checkAdaptiveQuality() {
        const now = performance.now();
        const dt = now - lastFrameTime;
        lastFrameTime = now;

        if (dt > 20) {
            slowFramesCount++;
            if (slowFramesCount >= 30 && qualityLevel < 2) {
                qualityLevel++;
                slowFramesCount = 0;
                if (qualityLevel === 1) {
                    maxParticles = isMobile ? 600 : 1200;
                } else if (qualityLevel === 2) {
                    maxParticles = isMobile ? 350 : 600;
                }
            }
        } else {
            slowFramesCount = Math.max(0, slowFramesCount - 1);
        }
    }

    function updatePhysics(activeCount) {
        grid.clear();

        // Populate spatial grid
        for (let i = 0; i < activeCount; i++) {
            const p = particles[i];
            const key = hashPos(p.x, p.y);
            if (!grid.has(key)) grid.set(key, []);
            grid.get(key).push(i);
        }

        // Vortex center moving from center down to bottom
        const vortexCenterX = width * 0.5;
        const vortexCenterY = height * 0.5 + scrollProgress * (height * 0.6);
        const funnelActive = scrollProgress > 0.02;

        for (let i = 0; i < activeCount; i++) {
            const p = particles[i];

            // 1. Natural drift
            p.vx += (Math.random() - 0.5) * 0.12;
            p.vy += (Math.random() - 0.5) * 0.12;

            // 2. Cursor attraction & orbital swarm (within 220px)
            if (isMouseOver) {
                const cdx = mouseX - p.x;
                const cdy = mouseY - p.y;
                const cdist = Math.hypot(cdx, cdy);

                if (cdist > 1 && cdist < 220) {
                    const normX = cdx / cdist;
                    const normY = cdy / cdist;
                    const pull = (1.0 - cdist / 220) * 0.35;

                    p.vx += normX * pull;
                    p.vy += normY * pull;

                    p.vx += -normY * pull * 0.8;
                    p.vy += normX * pull * 0.8;
                }
            }

            // 3. Scroll Funnel & Vortex Force
            if (funnelActive) {
                const vdx = vortexCenterX - p.x;
                const vdy = vortexCenterY - p.y;
                const vdist = Math.hypot(vdx, vdy);

                if (vdist > 2) {
                    const vNormX = vdx / vdist;
                    const vNormY = vdy / vdist;

                    const spinForce = scrollProgress * 1.8;
                    p.vx += -vNormY * spinForce;
                    p.vy += vNormX * spinForce;

                    const suction = scrollProgress * 1.5;
                    p.vx += vNormX * suction;
                    p.vy += vNormY * suction;
                }
            }

            // 4. Soft pairwise repulsion
            const cx = Math.floor(p.x / CELL_SIZE);
            const cy = Math.floor(p.y / CELL_SIZE);

            for (let ox = -1; ox <= 1; ox++) {
                for (let oy = -1; oy <= 1; oy++) {
                    const cellKey = `${cx + ox},${cy + oy}`;
                    const neighbors = grid.get(cellKey);
                    if (neighbors) {
                        for (let n = 0; n < neighbors.length; n++) {
                            const otherIdx = neighbors[n];
                            if (otherIdx <= i) continue;
                            const other = particles[otherIdx];

                            const dx = other.x - p.x;
                            const dy = other.y - p.y;
                            const distSq = dx * dx + dy * dy;
                            const minDist = 14;

                            if (distSq > 0.01 && distSq < minDist * minDist) {
                                const dist = Math.sqrt(distSq);
                                const overlap = (minDist - dist) * 0.5;
                                const nx = dx / dist;
                                const ny = dy / dist;

                                p.x -= nx * overlap * 0.5;
                                p.y -= ny * overlap * 0.5;
                                other.x += nx * overlap * 0.5;
                                other.y += ny * overlap * 0.5;

                                p.vx -= nx * 0.08;
                                p.vy -= ny * 0.08;
                                other.vx += nx * 0.08;
                                other.vy += ny * 0.08;
                            }
                        }
                    }
                }
            }

            // 5. Velocity damping
            p.vx *= 0.96;
            p.vy *= 0.96;

            // 6. Update position & rotation
            p.x += p.vx;
            p.y += p.vy;
            p.rotation += p.rotSpeed + (p.vx + p.vy) * 0.02;

            // 7. Wall bounce (restitution 0.8)
            if (p.x < p.radius) {
                p.x = p.radius;
                p.vx = -p.vx * 0.8;
            } else if (p.x > width - p.radius) {
                p.x = width - p.radius;
                p.vx = -p.vx * 0.8;
            }

            if (p.y < p.radius) {
                p.y = p.radius;
                p.vy = -p.vy * 0.8;
            } else if (p.y > height - p.radius) {
                if (funnelActive && scrollProgress > 0.8) {
                    p.y = -10;
                    p.x = Math.random() * width;
                } else {
                    p.y = height - p.radius;
                    p.vy = -p.vy * 0.8;
                }
            }
        }
    }

    window._swarmFrameCount = 0;
    function swarmTick() {
        if (!isVisible || document.hidden) return;
        window._swarmFrameCount++;

        checkAdaptiveQuality();

        const activeCount = Math.min(maxParticles, particles.length);

        if (!prefersReducedMotion) {
            updatePhysics(activeCount);
        }

        ctx.clearRect(0, 0, width, height);

        const globalAlpha = Math.max(0, 1.0 - scrollProgress * 0.95);

        for (let i = 0; i < activeCount; i++) {
            const p = particles[i];
            ctx.save();
            ctx.translate(p.x, p.y);
            ctx.rotate(p.rotation);
            ctx.globalAlpha = p.alpha * globalAlpha;
            ctx.drawImage(p.sprite, -12, -12);
            ctx.restore();
        }
    }

    // ─── Interaction & ScrollTrigger Setup ─────────────────────────────────────
    function bindInteractions() {
        section.addEventListener('pointerenter', () => { isMouseOver = true; }, { passive: true });
        section.addEventListener('pointerleave', () => { isMouseOver = false; }, { passive: true });
        section.addEventListener('pointermove', (e) => {
            mouseX = e.clientX - sectionRect.left;
            mouseY = e.clientY - sectionRect.top;
        }, { passive: true });

        // Click burst trigger
        section.addEventListener('click', (e) => {
            const clickX = e.clientX - sectionRect.left;
            const clickY = e.clientY - sectionRect.top;
            const activeCount = Math.min(maxParticles, particles.length);

            for (let i = 0; i < activeCount; i++) {
                const p = particles[i];
                const dx = p.x - clickX;
                const dy = p.y - clickY;
                const dist = Math.hypot(dx, dy);
                if (dist > 0.1 && dist < 260) {
                    const force = (1.0 - dist / 260) * 11.0;
                    p.vx += (dx / dist) * force;
                    p.vy += (dy / dist) * force;
                }
            }
        });

        // ScrollTrigger Funnel
        if (typeof gsap !== 'undefined' && typeof ScrollTrigger !== 'undefined' && !prefersReducedMotion) {
            ScrollTrigger.create({
                trigger: section,
                start: "top bottom",
                end: "bottom top",
                scrub: 0.5,
                onUpdate: (self) => {
                    scrollProgress = self.progress;
                }
            });

            // Nav contrast: toggle .nav--on-amber while swarm is under the top navbar (height ~64px)
            const navbar = document.querySelector('.landing-navbar');
            if (navbar) {
                ScrollTrigger.create({
                    trigger: section,
                    start: "top 64px",
                    end: "bottom 64px",
                    onToggle: (self) => {
                        navbar.classList.toggle('nav--on-amber', self.isActive);
                    }
                });
            }
        }

        // Visibility & document.hidden observer (rootMargin 100px)
        document.addEventListener('visibilitychange', () => {
            if (document.hidden) {
                isVisible = false;
            } else {
                updateSectionRect();
            }
        });

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    isVisible = entry.isIntersecting && !document.hidden;
                    if (isVisible) updateSectionRect();
                });
            }, { rootMargin: '100px', threshold: 0.01 });
            observer.observe(section);
        } else {
            isVisible = true;
        }

        // Shared ticker hookup
        if (typeof gsap !== 'undefined') {
            gsap.ticker.add(swarmTick);
        } else {
            function loop() {
                swarmTick();
                requestAnimationFrame(loop);
            }
            requestAnimationFrame(loop);
        }
    }

    document.addEventListener('DOMContentLoaded', () => {
        resize();
        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(resize, 200);
        }, { passive: true });
        bindInteractions();
    });
})();
