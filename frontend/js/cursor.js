/**
 * SHIKSHA BUDDY — Custom Dynamic Cursor
 * Features:
 * - Landing mode: Solid 14px marigold circle, expanding 84px arrow state, 96px outline state
 * - App mode (body.is-app): Ultra-clean 10px marigold dot centered on pointer (x-5px, y-5px),
 *   scaling to max 14px on clickable controls, hidden on text inputs & reading surfaces,
 *   never obstructing buttons or dock icons.
 */

(function () {
    'use strict';

    const isTouch = ('ontouchstart' in window) || (navigator.maxTouchPoints > 0);
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    if (isTouch || prefersReducedMotion) {
        document.documentElement.classList.add('no-custom-cursor');
        return;
    }

    let cursorEl = null;
    let arrowEl = null;
    let labelEl = null;
    let xTo = null;
    let yTo = null;
    let xToApp = null;
    let yToApp = null;
    let isKeyboardNav = false;
    let isMouseDown = false;

    function isApp() {
        return document.body.classList.contains('is-app') || window.location.hash.startsWith('#app');
    }

    function initCursor() {
        const oldCursor = document.getElementById('shiksha-cursor');
        if (oldCursor) oldCursor.remove();

        cursorEl = document.createElement('div');
        cursorEl.id = 'shiksha-cursor';
        cursorEl.className = isApp() ? 'shiksha-cursor cursor--app' : 'shiksha-cursor default-state';
        cursorEl.innerHTML = `
            <svg class="cursor-icon-arrow" viewBox="0 0 24 24" width="20" height="20" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
                <line x1="5" y1="12" x2="19" y2="12"></line>
                <polyline points="12 5 19 12 12 19"></polyline>
            </svg>
            <span class="cursor-text-label"></span>
        `;
        document.body.appendChild(cursorEl);

        arrowEl = cursorEl.querySelector('.cursor-icon-arrow');
        labelEl = cursorEl.querySelector('.cursor-text-label');

        if (typeof gsap !== 'undefined') {
            xTo = gsap.quickTo(cursorEl, "x", { duration: 0.25, ease: "power3.out" });
            yTo = gsap.quickTo(cursorEl, "y", { duration: 0.25, ease: "power3.out" });
            xToApp = gsap.quickTo(cursorEl, "x", { duration: 0.12, ease: "power2.out" });
            yToApp = gsap.quickTo(cursorEl, "y", { duration: 0.12, ease: "power2.out" });
        }

        bindEvents();
    }

    function bindEvents() {
        window.addEventListener('hashchange', () => {
            resetCursor();
        });

        window.addEventListener('pointermove', (e) => {
            if (isKeyboardNav) {
                isKeyboardNav = false;
                document.body.classList.remove('keyboard-navigation');
                cursorEl.style.opacity = '1';
            }

            if (isApp()) {
                // In app mode, center on pointer: translate3d(x - 5px, y - 5px, 0)
                if (xToApp && yToApp) {
                    xToApp(e.clientX - 5);
                    yToApp(e.clientY - 5);
                } else {
                    cursorEl.style.transform = `translate3d(${e.clientX - 5}px, ${e.clientY - 5}px, 0)`;
                }
                handleAppHover(e);
            } else {
                // In landing mode, centered with CSS transform
                if (xTo && yTo) {
                    xTo(e.clientX);
                    yTo(e.clientY);
                } else {
                    cursorEl.style.transform = `translate3d(${e.clientX}px, ${e.clientY}px, 0)`;
                }
            }
        }, { passive: true });

        // Pointer enter/leave window
        document.addEventListener('mouseleave', () => {
            if (cursorEl) cursorEl.style.opacity = '0';
        });

        document.addEventListener('mouseenter', () => {
            if (cursorEl) cursorEl.style.opacity = isApp() ? '0.95' : '1';
        });

        // Mouse down/up hold scale
        window.addEventListener('mousedown', () => {
            isMouseDown = true;
            if (cursorEl) cursorEl.classList.add('is-pressed');
        });

        window.addEventListener('mouseup', () => {
            isMouseDown = false;
            if (cursorEl) cursorEl.classList.remove('is-pressed');
        });

        // Keyboard accessibility
        window.addEventListener('keydown', (e) => {
            if (e.key === 'Tab' || e.key.startsWith('Arrow')) {
                isKeyboardNav = true;
                document.body.classList.add('keyboard-navigation');
                if (cursorEl) cursorEl.style.opacity = '0';
            }
        });

        // Hover handling
        document.addEventListener('mouseover', (e) => {
            if (isKeyboardNav) return;

            if (isApp()) {
                handleAppHover(e);
            } else {
                handleLandingHover(e);
            }
        });

        document.addEventListener('mouseout', (e) => {
            if (isApp()) {
                const isOverText = e.relatedTarget && e.relatedTarget.closest && e.relatedTarget.closest('input, textarea, [contenteditable="true"], .chat-scroll-area, .summary-reading-area, .summary-reading-card, #summary-reading-card, .book-reading-column, #book-content, .notebook-items-list, .notebook-item-card');
                if (isOverText) {
                    if (cursorEl) cursorEl.style.opacity = '0';
                    return;
                }
                // Return to clean app dot
                if (cursorEl) {
                    cursorEl.classList.remove('is-hover-clickable');
                    cursorEl.classList.remove('cursor--hidden');
                    cursorEl.style.opacity = '0.95';
                }
            } else {
                const target = e.target.closest('[data-cursor], button, a, input, textarea, .glass-card, .cylinder-card, .dock-item');
                if (target) {
                    resetCursor();
                }
            }
        });
    }

    function handleAppHover(e) {
        if (!cursorEl) return;
        cursorEl.className = 'shiksha-cursor cursor--app';
        if (labelEl) labelEl.textContent = '';

        // 1. Over text inputs, textareas, messages scroll area, or reading cards: hide custom dot and restore native cursor
        const textArea = e.target.closest('input, textarea, [contenteditable="true"], .chat-scroll-area, .summary-reading-area, .summary-reading-card, #summary-reading-card, .book-reading-column, #book-content, .notebook-items-list, .notebook-item-card');
        if (textArea) {
            cursorEl.style.opacity = '0';
            return;
        }

        // 2. Over clickable elements: scale 1.4 (max 14px), no arrow, no label, no ring
        const clickable = e.target.closest('button, a, .dock-item, .mode-tab, .summary-segment-btn, .suggestion-chip, .summary-checkbox-pill, .tile, .btn-desk-resume, .btn-desk-resume-secondary, .btn-desk-files-ghost, .btn-file-delete, .session-item, .drawer-file-item, .desk-file-row, .btn-focus-pill, .focus-preset-btn, .focus-btn-primary, .focus-btn-secondary, .btn-notebook-remove, .notebook-header-btn');
        if (clickable) {
            cursorEl.style.opacity = '0.95';
            cursorEl.classList.add('is-hover-clickable');
            return;
        }

        // 3. Regular surface
        cursorEl.style.opacity = '0.95';
    }

    function handleLandingHover(e) {
        if (isApp() || !cursorEl) return;

        const target = e.target.closest('[data-cursor], button, a, input, textarea, .glass-card, .cylinder-card, .dock-item');
        if (!target) {
            resetCursor();
            return;
        }

        const customType = target.getAttribute('data-cursor');

        if (customType === 'hidden') {
            cursorEl.style.opacity = '0';
            return;
        }

        if (target.matches('input, textarea, [contenteditable="true"]')) {
            setCursorState('text');
            return;
        }

        if (customType === 'outline' || target.closest('.cylinder-card, .feature-scene-card, .stats-glass-card')) {
            const label = target.getAttribute('data-cursor-label') || 'Explore';
            setCursorState('outline', label);
            return;
        }

        if (customType === 'arrow' || target.closest('button, a, .btn-cta-marigold, .btn-cta-secondary, .dock-item, .nav-pill-btn, .suggestion-chip')) {
            let label = target.getAttribute('data-cursor-label');
            if (!label) {
                const explicit = target.getAttribute('data-cursor');
                label = explicit && explicit !== 'arrow' ? explicit : 'Open';
            }
            setCursorState('arrow', label);
            return;
        }

        resetCursor();
    }

    function setCursorState(state, label = '') {
        if (!cursorEl || isApp()) return;
        cursorEl.className = 'shiksha-cursor';
        cursorEl.style.opacity = '1';

        if (state === 'arrow') {
            cursorEl.classList.add('state-arrow');
            if (labelEl) labelEl.textContent = label;
        } else if (state === 'outline') {
            cursorEl.classList.add('state-outline');
            if (labelEl) labelEl.textContent = label;
        } else if (state === 'text') {
            cursorEl.classList.add('state-text');
            if (labelEl) labelEl.textContent = '';
        }
    }

    function resetCursor() {
        if (!cursorEl) return;
        if (isApp()) {
            cursorEl.className = 'shiksha-cursor cursor--app';
            cursorEl.style.opacity = '0.95';
        } else {
            cursorEl.className = 'shiksha-cursor default-state';
            cursorEl.style.opacity = '1';
        }
        if (labelEl) labelEl.textContent = '';
    }

    document.addEventListener('DOMContentLoaded', initCursor);
})();
