/**
 * SHIKSHA BUDDY — Giant Type Mask Transition
 * Feature 2: SVG <mask id="deepTextMask"> scaling "LEARN DEEP"
 * Measure with JS on load/resize, set viewBox to text bbox so it fills ~90vw and never clips.
 * Stack as LEARN / DEEP on mobile screens.
 * Animate ONLY transform:scale on the mask group, capped at uncover (~22x), then hide layer.
 */

(function () {
    'use strict';

    function initMaskTransition() {
        if (typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') return;

        const section = document.getElementById('mask-transition-section');
        const svg = document.getElementById('giant-mask-svg');
        const maskGroup = document.getElementById('giant-mask-svg-group');
        const maskText = document.getElementById('giant-mask-svg-text');
        const visibleGroup = document.getElementById('giant-text-visible-group');
        const visibleText = document.getElementById('giant-text-visible');
        const hintEl = document.getElementById('mask-scroll-hint');
        const overlayWrap = document.getElementById('mask-overlay-layer');

        if (!section || !svg || !maskGroup || !maskText) return;

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
        if (prefersReducedMotion) {
            if (overlayWrap) overlayWrap.style.display = 'none';
            return;
        }

        // Apply will-change to mask overlay layer
        if (overlayWrap) {
            overlayWrap.style.willChange = 'transform, opacity';
            overlayWrap.style.transform = 'translateZ(0)';
            overlayWrap.style.backfaceVisibility = 'hidden';
        }

        function configureSVGText() {
            const isMobile = window.innerWidth < 768;
            if (isMobile) {
                // Stack as LEARN / DEEP on mobile
                const stackedContent = '<tspan x="50%" dy="-0.6em">LEARN</tspan><tspan x="50%" dy="1.2em">DEEP</tspan>';
                maskText.innerHTML = stackedContent;
                if (visibleText) visibleText.innerHTML = stackedContent;
                maskText.setAttribute('font-size', '200');
                if (visibleText) visibleText.setAttribute('font-size', '200');
            } else {
                maskText.textContent = 'LEARN DEEP';
                if (visibleText) visibleText.textContent = 'LEARN DEEP';
                maskText.setAttribute('font-size', '240');
                if (visibleText) visibleText.setAttribute('font-size', '240');
            }

            // Measure bbox
            try {
                const bbox = maskText.getBBox();
                if (bbox.width > 0 && bbox.height > 0) {
                    // Fit tightly to ~90vw with safe aspect ratio
                    const padX = bbox.width * 0.06;
                    const padY = bbox.height * 0.35;
                    const vbX = Math.round(bbox.x - padX);
                    const vbY = Math.round(bbox.y - padY);
                    const vbW = Math.round(bbox.width + padX * 2);
                    const vbH = Math.round(bbox.height + padY * 2);
                    svg.setAttribute('viewBox', `${vbX} ${vbY} ${vbW} ${vbH}`);
                }
            } catch (e) {
                // Fallback default viewBox
                svg.setAttribute('viewBox', '0 0 1920 1080');
            }
        }

        configureSVGText();

        let resizeTimer = null;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                configureSVGText();
                ScrollTrigger.refresh();
            }, 200);
        }, { passive: true });

        // Transform origin at center of the text
        gsap.set(maskGroup, { transformOrigin: "50% 50%" });
        if (visibleGroup) gsap.set(visibleGroup, { transformOrigin: "50% 50%" });

        // Pinned scrub timeline: end: "+=1500", scrub: true, anticipatePin: 1
        const tl = gsap.timeline({
            scrollTrigger: {
                trigger: section,
                start: "top top",
                end: "+=1500",
                pin: true,
                scrub: true,
                anticipatePin: 1,
                onLeave: () => {
                    if (overlayWrap) {
                        overlayWrap.style.display = 'none';
                        overlayWrap.style.willChange = 'auto';
                    }
                },
                onEnterBack: () => {
                    if (overlayWrap) {
                        overlayWrap.style.display = 'block';
                        overlayWrap.style.willChange = 'transform, opacity';
                    }
                }
            }
        });

        // 1. Fade out hint quickly
        if (hintEl) {
            tl.to(hintEl, {
                opacity: 0,
                duration: 0.25,
                ease: "power1.out"
            }, 0);
        }

        // 2. Fade out visible text
        if (visibleGroup) {
            tl.to(visibleGroup, {
                opacity: 0,
                scale: 1.8,
                duration: 0.6,
                ease: "power2.in"
            }, 0);
        }

        // 3. Animate only transform:scale on the mask group, capped at uncover (~22x)
        tl.to(maskGroup, {
            scale: 22,
            duration: 1.4,
            ease: "power2.in"
        }, 0);

        // 4. Fade out overlay wrap as opening completes
        if (overlayWrap) {
            tl.to(overlayWrap, {
                opacity: 0,
                duration: 0.4,
                ease: "power2.in",
                onComplete: () => {
                    overlayWrap.style.willChange = 'auto';
                }
            }, 1.1);
        }
    }

    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initMaskTransition);
    } else {
        initMaskTransition();
    }
})();

