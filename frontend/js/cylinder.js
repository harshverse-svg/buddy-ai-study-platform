/**
 * SHIKSHA BUDDY — 3D Cylindrical Card Carousel (6 Cards)
 * Matches app dock:
 * 01 Study Chat: "Ask your notes anything." (#app/chat)
 * 02 Ask Anything: "Your personal mentor. Ask anything, no files needed." (#app/ask)
 * 03 Mind Map: "See how ideas connect." (#app/map)
 * 04 Study Book: "Your notes, rewritten as a book." (#app/book)
 * 05 Quiz Arena: "Quizzes that learn how you learn." (#app/quiz)
 * 06 Progress Stats: "Track focus and weak spots." (#app/stats)
 *
 * Pinned ScrollTrigger scrub (0 to -300deg) with snap: 1/5.
 * Radius --R: 460px (desktop), 330px (<900px).
 * Per-frame angle-based opacity, brightness shading, front-card scale 1.06 & marigold glow.
 * All 6 cards visible and readable around the ring without flattening.
 */

(function () {
    'use strict';

    const CARDS = [
        {
            num: '01',
            title: 'Study Chat',
            tagline: 'Ask your notes anything.',
            desc: 'Every explanation is grounded in your uploaded materials. No hallucinations, no generic internet summaries.',
            ws: 0,
            route: '#app/chat'
        },
        {
            num: '02',
            title: 'Ask Anything',
            tagline: 'Your personal mentor. Ask anything, no files needed.',
            desc: 'Clear step-by-step guidance, intuitive analogies, and customized study coaching across any subject or curriculum.',
            ws: 1,
            route: '#app/ask'
        },
        {
            num: '03',
            title: 'Mind Map',
            tagline: 'See how ideas connect.',
            desc: 'Interactive force-directed concept graphs reveal dependencies and prerequisites across all your course units.',
            ws: 2,
            route: '#app/map'
        },
        {
            num: '04',
            title: 'Study Book',
            tagline: 'Your notes, rewritten as a book.',
            desc: 'Messy slides and handouts synthesized into clear, publication-grade study chapters with key takeaways.',
            ws: 3,
            route: '#app/book'
        },
        {
            num: '05',
            title: 'Quiz Arena',
            tagline: 'Quizzes that learn how you learn.',
            desc: 'Four cognitive difficulty tiers with contextual explanations that isolate weak spots before exam day.',
            ws: 4,
            route: '#app/quiz'
        },
        {
            num: '06',
            title: 'Progress Stats',
            tagline: 'Track focus and weak spots.',
            desc: 'Precision accuracy ring, score trajectory, and AI study prescriptions tailored to your specific retention curve.',
            ws: 5,
            route: '#app/stats'
        }
    ];

    let currentActiveIdx = -1;

    function initCylinderCarousel() {
        const section = document.getElementById('cylinder-section');
        const ring = document.getElementById('cylinder-ring');
        if (!section || !ring) return;

        const cardEls = Array.from(ring.querySelectorAll('.cylinder-card'));
        const counterEl = document.getElementById('cylinder-active-counter');
        const titleEl = document.getElementById('cylinder-active-title');
        const subEl = document.getElementById('cylinder-active-sub');
        const launchBtn = document.getElementById('cylinder-active-btn');

        const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

        // Dynamic Radius determination: 460px desktop, 330px below 900px
        function getRadius() {
            return window.innerWidth < 900 ? 330 : 460;
        }

        let radius = getRadius();
        document.documentElement.style.setProperty('--R', `${radius}px`);
        document.documentElement.style.setProperty('--n', '6');

        // Set card index custom properties
        cardEls.forEach((card, i) => {
            card.style.setProperty('--i', i);
        });

        // Frame update function given current rotation angle in degrees
        function updateCardsDisplay(currentRy) {
            document.documentElement.style.setProperty('--ry', `${currentRy}deg`);

            let closestIdx = 0;
            let minDiff = 999;

            cardEls.forEach((card, i) => {
                // Angle of this card relative to the front (0 deg): 6 cards spaced at 60 deg
                const baseAngle = i * 60; // 0, 60, 120, 180, 240, 300
                let angle = (baseAngle + currentRy) % 360;
                // Normalize angle to -180 .. 180
                while (angle < -180) angle += 360;
                while (angle > 180) angle -= 360;

                const rad = angle * (Math.PI / 180);
                const cosVal = Math.cos(rad);

                // Opacity: 0.35 + 0.65 * cos(angle) (never fully hidden, minimum ~0.35)
                const opacity = 0.35 + 0.65 * Math.max(0, cosVal);
                // Brightness shading: 0.65 for back, 1.0 for front
                const brightness = 0.65 + 0.35 * Math.max(0, cosVal);

                const isFront = Math.abs(angle) < 30;
                const scale = isFront ? 1.06 : 1.0;

                card.style.transform = `rotateY(${baseAngle}deg) translateZ(${radius}px) scale(${scale})`;
                card.style.opacity = Math.max(0.35, opacity).toFixed(3);
                card.style.filter = `brightness(${brightness.toFixed(3)})`;

                if (isFront) {
                    card.classList.add('is-active');
                    card.classList.remove('is-dimmed');
                } else {
                    card.classList.remove('is-active');
                    card.classList.add('is-dimmed');
                }

                if (Math.abs(angle) < minDiff) {
                    minDiff = Math.abs(angle);
                    closestIdx = i;
                }
            });

            if (closestIdx !== currentActiveIdx) {
                currentActiveIdx = closestIdx;
                const data = CARDS[closestIdx];
                if (data) {
                    if (counterEl) counterEl.textContent = `${data.num} / 06`;
                    if (titleEl) {
                        if (typeof gsap !== 'undefined') {
                            gsap.fromTo(titleEl,
                                { opacity: 0.3, y: 8, filter: 'blur(6px)' },
                                { opacity: 1, y: 0, filter: 'blur(0px)', duration: 0.35, ease: 'power2.out' }
                            );
                        }
                        titleEl.textContent = data.title;
                    }
                    if (subEl) subEl.textContent = data.tagline;

                    if (launchBtn) {
                        launchBtn.onclick = () => {
                            window.location.hash = data.route;
                            if (window.enterApp) window.enterApp(data.ws);
                        };
                    }
                }
            }
        }

        // Initialize at 0deg
        updateCardsDisplay(0);

        // Click on cards to deep-link to that studio tab
        cardEls.forEach((card, i) => {
            card.addEventListener('click', () => {
                if (i === currentActiveIdx && CARDS[i]) {
                    window.location.hash = CARDS[i].route;
                    if (window.enterApp) window.enterApp(CARDS[i].ws);
                }
            });
        });

        // Resize handler to update radius
        window.addEventListener('resize', () => {
            const newRadius = getRadius();
            if (newRadius !== radius) {
                radius = newRadius;
                document.documentElement.style.setProperty('--R', `${radius}px`);
                updateCardsDisplay(gsap.getProperty(ring, "rotationY") || 0);
            }
        }, { passive: true });

        if (prefersReducedMotion || typeof gsap === 'undefined' || typeof ScrollTrigger === 'undefined') {
            return;
        }

        // GSAP ScrollTrigger Pinned Scrub with Snap: 1/5 (6 stops: 0deg to -300deg in 60deg steps)
        const totalRot = -300;
        const rotObj = { ry: 0 };

        gsap.to(rotObj, {
            ry: totalRot,
            ease: "none",
            scrollTrigger: {
                trigger: section,
                start: "top top",
                end: "+=2600",
                pin: true,
                scrub: 1,
                anticipatePin: 1,
                snap: {
                    snapTo: 1 / 5, // 5 intervals between 6 cards
                    duration: { min: 0.25, max: 0.45 },
                    ease: "power2.out"
                },
                onUpdate: (self) => {
                    const currentRy = self.progress * totalRot;
                    gsap.set(ring, { rotationY: currentRy });
                    updateCardsDisplay(currentRy);
                }
            }
        });
    }

    document.addEventListener('DOMContentLoaded', initCylinderCarousel);
})();
