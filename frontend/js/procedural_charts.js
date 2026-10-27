/**
 * SHIKSHA BUDDY — Procedural SVG & Canvas Charts
 * Lusion-Inspired Editorial Palette: Marigold (#EAAA00), Amber (#FF9E1B), Ice (#DDE3E8), Aubergine (#3A0F34)
 * Zero cyan, zero blue-purple. Pure code-generated analytics visuals.
 */

(function() {
    'use strict';

    function isLightMode() {
        return document.documentElement.getAttribute('data-theme') === 'light' ||
            (document.getElementById('app') && document.getElementById('app').getAttribute('data-theme') === 'light');
    }

    // ─── SVG Accuracy Ring ───────────────────────────────────────────────────
    window.renderAccuracyRing = function(containerId, percentage, totalQuestions, totalCorrect) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const isLight = isLightMode();
        const radius = 64;
        const strokeWidth = 8;
        const circumference = 2 * Math.PI * radius;
        const dashOffset = circumference * (1 - Math.min(100, Math.max(0, percentage)) / 100);

        // Determine rank & color
        let rank = 'Beginner';
        let rankColor = isLight ? '#F4B400' : '#F59E0B';
        if (percentage >= 90) {
            rank = 'Master Scholar';
            rankColor = isLight ? '#6366F1' : '#FFB800';
        } else if (percentage >= 75) {
            rank = 'Proficient';
            rankColor = isLight ? '#6366F1' : '#FFB800';
        } else if (percentage >= 60) {
            rank = 'Developing';
            rankColor = isLight ? '#64748B' : '#94A3B8';
        }

        const bgTrackColor = isLight ? 'rgba(99, 102, 241, 0.10)' : 'rgba(255, 255, 255, 0.1)';
        const textColor = isLight ? '#0F172A' : '#F8FAFC';
        const subtextColor = isLight ? '#64748B' : '#94A3B8';
        const gradStart = isLight ? '#6366F1' : '#FFB800';
        const gradEnd = isLight ? '#F4B400' : '#F59E0B';

        container.innerHTML = `
            <svg width="180" height="180" viewBox="0 0 180 180" style="display:block;margin:0 auto;">
                <defs>
                    <linearGradient id="ringGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                        <stop offset="0%" style="stop-color:${gradStart}"/>
                        <stop offset="100%" style="stop-color:${gradEnd}"/>
                    </linearGradient>
                    <filter id="ringGlow" x="-20%" y="-20%" width="140%" height="140%">
                        <feGaussianBlur stdDeviation="4" result="glow"/>
                        <feMerge>
                            <feMergeNode in="glow"/>
                            <feMergeNode in="SourceGraphic"/>
                        </feMerge>
                    </filter>
                </defs>

                <!-- Background ring -->
                <circle cx="90" cy="90" r="${radius}" fill="none"
                    stroke="${bgTrackColor}" stroke-width="${strokeWidth}"/>

                <!-- Progress ring -->
                <circle cx="90" cy="90" r="${radius}" fill="none"
                    stroke="url(#ringGrad)" stroke-width="${strokeWidth}"
                    stroke-linecap="round"
                    stroke-dasharray="${circumference}"
                    stroke-dashoffset="${dashOffset}"
                    transform="rotate(-90 90 90)"
                    filter="url(#ringGlow)"
                    style="transition: stroke-dashoffset 1.4s cubic-bezier(0.2, 0.8, 0.2, 1)">
                </circle>

                <!-- Percentage text -->
                <text x="90" y="82" text-anchor="middle" fill="${textColor}"
                    font-family="'Clash Display', sans-serif" font-size="28" font-weight="700" letter-spacing="-0.03em">
                    ${Math.round(percentage)}%
                </text>
                <text x="90" y="104" text-anchor="middle" fill="${subtextColor}"
                    font-family="'JetBrains Mono', monospace" font-size="10" letter-spacing="1px">
                    ${totalCorrect}/${totalQuestions} CORRECT
                </text>
                <text x="90" y="132" text-anchor="middle" fill="${rankColor}"
                    font-family="'Inter', sans-serif" font-size="11" font-weight="600" letter-spacing="0.5px">
                    ${rank}
                </text>
            </svg>
        `;
    };

    // ─── Canvas Bezier Score Progression Chart (Smooth Marigold Line, No Clutter) ───
    window.renderScoreChart = function(canvasId, scoreHistory) {
        const canvas = document.getElementById(canvasId);
        if (!canvas) return;

        const isLight = isLightMode();

        if (!scoreHistory || scoreHistory.length === 0) {
            const container = canvas.parentElement;
            if (container) {
                container.innerHTML = `
                    <div style="height:100%;display:flex;flex-direction:column;align-items:center;justify-content:center;color:var(--text-muted);font-size:0.85rem;">
                        <span style="font-size:1.5rem;margin-bottom:8px;">📈</span>
                        <span>Complete quizzes to track score trend</span>
                    </div>
                `;
            }
            return;
        }

        const ctx = canvas.getContext('2d');
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const container = canvas.parentElement;
        const w = container.clientWidth || 300;
        const h = container.clientHeight || 200;

        canvas.width = w * dpr;
        canvas.height = h * dpr;
        canvas.style.width = w + 'px';
        canvas.style.height = h + 'px';
        ctx.scale(dpr, dpr);

        const padding = { top: 20, right: 24, bottom: 28, left: 36 };
        const chartW = Math.max(10, w - padding.left - padding.right);
        const chartH = Math.max(10, h - padding.top - padding.bottom);

        // Subtle horizontal guide lines (0, 50, 100%)
        ctx.strokeStyle = isLight ? 'rgba(99, 102, 241, 0.08)' : 'rgba(255, 255, 255, 0.08)';
        ctx.lineWidth = 1;
        for (let i = 0; i <= 2; i++) {
            const y = padding.top + (chartH / 2) * i;
            ctx.beginPath();
            ctx.moveTo(padding.left, y);
            ctx.lineTo(w - padding.right, y);
            ctx.stroke();

            ctx.fillStyle = isLight ? '#64748B' : '#94A3B8';
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.textAlign = 'right';
            ctx.fillText(`${100 - i * 50}%`, padding.left - 6, y + 3);
        }

        // Data points
        const points = scoreHistory.map((s, i) => ({
            x: padding.left + (i / Math.max(scoreHistory.length - 1, 1)) * chartW,
            y: padding.top + chartH - ((s.score || 0) / 100) * chartH,
            score: s.score || 0
        }));

        // Gradient fill under curve
        const gradient = ctx.createLinearGradient(0, padding.top, 0, h - padding.bottom);
        const gradColor = isLight ? 'rgba(99, 102, 241, 0.16)' : 'rgba(255, 184, 0, 0.20)';
        const gradZero = isLight ? 'rgba(99, 102, 241, 0)' : 'rgba(255, 184, 0, 0)';
        gradient.addColorStop(0, gradColor);
        gradient.addColorStop(1, gradZero);

        // Draw filled area with bezier curves
        ctx.beginPath();
        ctx.moveTo(points[0].x, h - padding.bottom);
        for (let i = 0; i < points.length; i++) {
            if (i === 0) {
                ctx.lineTo(points[i].x, points[i].y);
            } else {
                const cpx = (points[i - 1].x + points[i].x) / 2;
                ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
            }
        }
        ctx.lineTo(points[points.length - 1].x, h - padding.bottom);
        ctx.closePath();
        ctx.fillStyle = gradient;
        ctx.fill();

        // Draw stroke line
        ctx.beginPath();
        for (let i = 0; i < points.length; i++) {
            if (i === 0) {
                ctx.moveTo(points[i].x, points[i].y);
            } else {
                const cpx = (points[i - 1].x + points[i].x) / 2;
                ctx.bezierCurveTo(cpx, points[i - 1].y, cpx, points[i].y, points[i].x, points[i].y);
            }
        }
        ctx.strokeStyle = isLight ? '#6366F1' : '#FFB800';
        ctx.lineWidth = 2.5;
        ctx.stroke();

        // Draw points with glow
        for (const p of points) {
            // Glow
            ctx.beginPath();
            ctx.arc(p.x, p.y, 7, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? 'rgba(99, 102, 241, 0.25)' : 'rgba(255, 184, 0, 0.30)';
            ctx.fill();

            // Center dot
            ctx.beginPath();
            ctx.arc(p.x, p.y, 3.5, 0, Math.PI * 2);
            ctx.fillStyle = isLight ? '#6366F1' : '#FFB800';
            ctx.fill();
            ctx.strokeStyle = isLight ? '#FFFFFF' : '#0B0F17';
            ctx.lineWidth = 1.5;
            ctx.stroke();

            // Score label
            ctx.font = '9px "JetBrains Mono", monospace';
            ctx.fillStyle = isLight ? '#0F172A' : '#F8FAFC';
            ctx.textAlign = 'center';
            ctx.fillText(`${Math.round(p.score)}%`, p.x, p.y - 10);
        }
    };

    // ─── Topic Mastery Horizontal Bars ───────────────────────────────────────
    window.renderTopicBars = function(containerId, topicMastery) {
        const container = document.getElementById(containerId);
        if (!container) return;

        const isLight = isLightMode();
        const topics = Object.entries(topicMastery).sort((a, b) => b[1] - a[1]);

        if (topics.length === 0) {
            container.innerHTML = `
                <div style="padding:24px 0;text-align:center;color:var(--text-muted);font-size:0.85rem;">
                    Take quizzes to unlock topic mastery insights
                </div>
            `;
            return;
        }

        container.innerHTML = topics.map(([name, pct]) => {
            const color = pct >= 75
                ? (isLight ? '#B45309' : '#FFB800')
                : (pct >= 50
                    ? (isLight ? '#D97706' : '#F59E0B')
                    : (isLight ? '#DC2626' : '#F43F5E'));
            const trackBg = isLight ? 'rgba(0, 0, 0, 0.08)' : 'rgba(255, 255, 255, 0.08)';

            return `
                <div style="margin-bottom:14px;">
                    <div style="display:flex;justify-content:space-between;margin-bottom:6px;font-size:0.84rem;">
                        <span style="color:var(--text-primary);font-weight:500;">${name}</span>
                        <span style="color:${color};font-family:'JetBrains Mono',monospace;font-weight:600;">${Math.round(pct)}%</span>
                    </div>
                    <div style="width:100%;height:6px;background:${trackBg};border-radius:3px;overflow:hidden;">
                        <div class="topic-bar-fill" style="width:${pct}%;height:100%;background:${color};border-radius:3px;transition:width 0.8s cubic-bezier(0.2,0.8,0.2,1);"></div>
                    </div>
                </div>
            `;
        }).join('');
    };

    // ─── Marigold + Ice Confetti Burst ───────────────────────────────────────
    window.triggerConfetti = function() {
        const canvas = document.getElementById('confetti-canvas') || document.getElementById('particle-canvas');
        if (!canvas) return;

        const ctx = canvas.getContext('2d');
        canvas.width = window.innerWidth;
        canvas.height = window.innerHeight;

        const particles = [];
        const colors = ['#EAAA00', '#FF9E1B', '#DDE3E8', '#FFFFFF', '#3A0F34'];

        for (let i = 0; i < 90; i++) {
            particles.push({
                x: window.innerWidth / 2,
                y: window.innerHeight / 2 - 50,
                vx: (Math.random() - 0.5) * 14,
                vy: (Math.random() - 0.7) * 15,
                gravity: 0.35,
                rotation: Math.random() * 360,
                rotSpeed: (Math.random() - 0.5) * 8,
                size: 6 + Math.random() * 8,
                color: colors[Math.floor(Math.random() * colors.length)],
                life: 1.0,
                decay: 0.008 + Math.random() * 0.012
            });
        }

        function step() {
            ctx.clearRect(0, 0, canvas.width, canvas.height);
            let alive = false;

            for (const p of particles) {
                if (p.life <= 0) continue;
                alive = true;

                p.x += p.vx;
                p.y += p.vy;
                p.vy += p.gravity;
                p.rotation += p.rotSpeed;
                p.life -= p.decay;

                ctx.save();
                ctx.translate(p.x, p.y);
                ctx.rotate((p.rotation * Math.PI) / 180);
                ctx.fillStyle = p.color;
                ctx.globalAlpha = Math.max(0, p.life);
                ctx.fillRect(-p.size / 2, -p.size / 2, p.size, p.size * 0.6);
                ctx.restore();
            }

            if (alive) {
                requestAnimationFrame(step);
            } else {
                ctx.clearRect(0, 0, canvas.width, canvas.height);
            }
        }

        requestAnimationFrame(step);
    };

    // Backward compatibility alias
    window.triggerParticleBurst = function(x, y) {
        window.triggerConfetti();
    };

})();
