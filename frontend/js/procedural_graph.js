/**
 * SHIKSHA BUDDY — Procedural Force-Directed Concept Map
 * Full label auto-sizing (r = max(26, sqrt(w^2 + h^2)/2 + 12)),
 * 3px #12060F text halo, marigold stroke, hub nodes,
 * collision radius = r + 14, fit-to-view, pan/zoom, and reset button.
 */

(function() {
    'use strict';

    let canvas, ctx;
    let nodes = [], edges = [];
    let width = 800, height = 600;
    let offsetX = 0, offsetY = 0, scale = 1;
    let isDragging = false, dragNode = null;
    let isPanning = false, panStartX = 0, panStartY = 0;
    let selectedNode = null;
    let hoveredNode = null;
    let animationId = null;
    let lastTime = 0;
    let currentTopicMastery = {};

    const FONT_SPEC = '600 13px "Inter", sans-serif';
    const LINE_HEIGHT = 16;

    // Helper: Fuzzy match node label to topic mastery data
    function resolveNodeMastery(label, masteryMap) {
        if (!masteryMap || !label || Object.keys(masteryMap).length === 0) {
            return { status: 'untested', color: 'rgba(138, 47, 122, 0.40)' };
        }
        const cleanLabel = label.toLowerCase().trim();

        // 1. Exact or substring match
        for (const [topic, pct] of Object.entries(masteryMap)) {
            const cleanTopic = topic.toLowerCase().trim();
            if (cleanTopic === cleanLabel || cleanLabel.includes(cleanTopic) || cleanTopic.includes(cleanLabel)) {
                if (pct < 60) return { status: 'weak', color: '#C2485E', pct };
                if (pct < 80) return { status: 'okay', color: '#C8921A', pct };
                return { status: 'strong', color: '#DDE3E8', pct };
            }
        }

        // 2. Token overlap
        const labelWords = cleanLabel.split(/\W+/).filter(w => w.length >= 3);
        for (const [topic, pct] of Object.entries(masteryMap)) {
            const topicWords = topic.toLowerCase().split(/\W+/).filter(w => w.length >= 3);
            const matches = labelWords.some(lw => topicWords.includes(lw));
            if (matches) {
                if (pct < 60) return { status: 'weak', color: '#C2485E', pct };
                if (pct < 80) return { status: 'okay', color: '#C8921A', pct };
                return { status: 'strong', color: '#DDE3E8', pct };
            }
        }

        return { status: 'untested', color: 'rgba(138, 47, 122, 0.40)' };
    }

    // Helper: Wrap label into up to 3 lines (~14 chars per line)
    function formatNodeLabel(text) {
        if (!text) return { lines: ['Concept'], isTruncated: false };
        const words = text.trim().split(/\s+/);
        const lines = [];
        let curLine = '';

        for (let i = 0; i < words.length; i++) {
            const word = words[i];
            const testLine = curLine ? `${curLine} ${word}` : word;
            if (testLine.length <= 14 || !curLine) {
                curLine = testLine;
            } else {
                lines.push(curLine);
                curLine = word;
                if (lines.length === 2) {
                    // 3rd line takes rest or gets truncated
                    const rest = words.slice(i).join(' ');
                    if (rest.length > 15) {
                        lines.push(rest.slice(0, 13) + '…');
                        return { lines, isTruncated: true };
                    } else {
                        lines.push(rest);
                        return { lines, isTruncated: false };
                    }
                }
            }
        }
        if (curLine && lines.length < 3) {
            lines.push(curLine);
        }
        return { lines, isTruncated: false };
    }

    // Measure text dimensions for radius calculation
    function computeNodeMetrics(measureCtx, label) {
        const { lines, isTruncated } = formatNodeLabel(label);
        let maxW = 0;
        if (measureCtx) {
            measureCtx.font = FONT_SPEC;
            lines.forEach(line => {
                const w = measureCtx.measureText(line).width;
                if (w > maxW) maxW = w;
            });
        } else {
            lines.forEach(line => {
                const w = line.length * 8.5;
                if (w > maxW) maxW = w;
            });
        }

        const totalH = lines.length * LINE_HEIGHT;
        // r = max(26, sqrt(w^2 + h^2)/2 + 12)
        const computedR = Math.max(26, Math.round(Math.sqrt(maxW * maxW + totalH * totalH) / 2 + 12));

        return {
            lines,
            isTruncated,
            textWidth: maxW,
            textHeight: totalH,
            radius: computedR
        };
    }

    function initGraph(nodesData, edgesData, masteryMap = null) {
        if (masteryMap) currentTopicMastery = masteryMap;
        canvas = document.getElementById('concept-map-canvas');
        if (!canvas) return;
        ctx = canvas.getContext('2d');

        resizeCanvas();
        window.removeEventListener('resize', resizeCanvas);
        window.addEventListener('resize', resizeCanvas, { passive: true });

        // Calculate node degrees for hub node detection
        const degrees = {};
        edgesData.forEach(e => {
            degrees[e.source] = (degrees[e.source] || 0) + 1;
            degrees[e.target] = (degrees[e.target] || 0) + 1;
        });

        // Initialize node positions and dynamic radii with mastery data
        nodes = nodesData.map((n, i) => {
            const metrics = computeNodeMetrics(ctx, n.label || n.id);
            const degree = degrees[n.id] || 0;
            const isHub = degree >= 3 || (nodesData.length <= 4 && degree >= 2);
            const finalR = isHub ? Math.round(metrics.radius * 1.14) : metrics.radius;
            const mastery = resolveNodeMastery(n.label || n.id, currentTopicMastery);

            const angle = (i / Math.max(1, nodesData.length)) * Math.PI * 2;
            const dist = 140 + Math.random() * 80;

            return {
                ...n,
                x: width / 2 + Math.cos(angle) * dist,
                y: height / 2 + Math.sin(angle) * dist,
                vx: 0,
                vy: 0,
                radius: finalR,
                lines: metrics.lines,
                isTruncated: metrics.isTruncated,
                degree,
                isHub,
                mastery
            };
        });

        edges = edgesData.map(e => ({
            ...e,
            sourceNode: nodes.find(n => n.id === e.source),
            targetNode: nodes.find(n => n.id === e.target)
        })).filter(e => e.sourceNode && e.targetNode);

        // Attach event listeners
        canvas.removeEventListener('mousedown', onMouseDown);
        canvas.removeEventListener('mousemove', onMouseMove);
        canvas.removeEventListener('mouseup', onMouseUp);
        canvas.removeEventListener('wheel', onWheel);
        canvas.removeEventListener('mouseleave', onMouseLeave);

        canvas.addEventListener('mousedown', onMouseDown);
        canvas.addEventListener('mousemove', onMouseMove);
        canvas.addEventListener('mouseup', onMouseUp);
        canvas.addEventListener('wheel', onWheel, { passive: false });
        canvas.addEventListener('mouseleave', onMouseLeave);

        // Fit graph to view initially
        setTimeout(() => {
            fitToView();
        }, 120);

        if (animationId) cancelAnimationFrame(animationId);
        lastTime = performance.now();
        simulate();
    }

    function resizeCanvas() {
        if (!canvas) return;
        const container = canvas.parentElement;
        if (!container) return;
        width = container.clientWidth || 800;
        height = container.clientHeight || 600;
        const dpr = window.devicePixelRatio || 1;
        canvas.width = width * dpr;
        canvas.height = height * dpr;
        canvas.style.width = width + 'px';
        canvas.style.height = height + 'px';
        ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
        fitToView();
    }

    function fitToView() {
        if (!nodes.length) return;

        let minX = Infinity, maxX = -Infinity;
        let minY = Infinity, maxY = -Infinity;

        nodes.forEach(n => {
            if (n.x - n.radius < minX) minX = n.x - n.radius;
            if (n.x + n.radius > maxX) maxX = n.x + n.radius;
            if (n.y - n.radius < minY) minY = n.y - n.radius;
            if (n.y + n.radius > maxY) maxY = n.y + n.radius;
        });

        const pad = 80;
        const graphW = Math.max(100, maxX - minX + pad * 2);
        const graphH = Math.max(100, maxY - minY + pad * 2);

        scale = Math.min(1.2, Math.max(0.45, Math.min(width / graphW, height / graphH)));
        const centerX = (minX + maxX) / 2;
        const centerY = (minY + maxY) / 2;

        offsetX = (width / 2) - centerX * scale;
        offsetY = (height / 2) - centerY * scale;
    }

    function simulate() {
        animationId = requestAnimationFrame(simulate);

        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.05);
        lastTime = now;

        if (nodes.length === 0) {
            draw();
            return;
        }

        // 1. Pairwise Repulsion & Collision Force (collision radius = r + 14)
        for (let i = 0; i < nodes.length; i++) {
            for (let j = i + 1; j < nodes.length; j++) {
                const a = nodes[i], b = nodes[j];
                const dx = b.x - a.x;
                const dy = b.y - a.y;
                const dist = Math.sqrt(dx * dx + dy * dy) || 1;

                // Base inverse-square repulsion
                const repulsionForce = 9500 / (dist * dist);
                const rx = (dx / dist) * repulsionForce;
                const ry = (dy / dist) * repulsionForce;
                a.vx -= rx;
                a.vy -= ry;
                b.vx += rx;
                b.vy += ry;

                // Collision avoidance: collision radius = r + 14
                const minDistance = (a.radius + 14) + (b.radius + 14);
                if (dist < minDistance) {
                    const overlap = (minDistance - dist) * 0.18;
                    const cx = (dx / dist) * overlap;
                    const cy = (dy / dist) * overlap;
                    a.vx -= cx;
                    a.vy -= cy;
                    b.vx += cx;
                    b.vy += cy;
                }
            }
        }

        // 2. Edge Springs
        const IDEAL_LEN = 190;
        for (const edge of edges) {
            const a = edge.sourceNode, b = edge.targetNode;
            const dx = b.x - a.x;
            const dy = b.y - a.y;
            const dist = Math.sqrt(dx * dx + dy * dy) || 1;
            const spring = (dist - IDEAL_LEN) * 0.006;
            const fx = (dx / dist) * spring;
            const fy = (dy / dist) * spring;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
        }

        // 3. Center Gravity
        for (const node of nodes) {
            const gx = (width / 2 - node.x) * 0.0004;
            const gy = (height / 2 - node.y) * 0.0004;
            node.vx += gx;
            node.vy += gy;
        }

        // 4. Position update & damping
        const DAMPING = 0.82;
        for (const node of nodes) {
            if (node === dragNode) continue;
            node.vx *= DAMPING;
            node.vy *= DAMPING;
            node.x += node.vx * dt * 60;
            node.y += node.vy * dt * 60;
        }

        draw();
    }

    function isLightMode() {
        return document.documentElement.getAttribute('data-theme') === 'light' ||
            (document.getElementById('app') && document.getElementById('app').getAttribute('data-theme') === 'light');
    }

    function draw() {
        if (!ctx) return;
        ctx.clearRect(0, 0, width, height);

        const isLight = isLightMode();

        // ─── 0. Canvas Background in Light Mode ─────────────────────────────
        if (isLight) {
            ctx.save();
            ctx.setTransform(1, 0, 0, 1, 0, 0);
            const bgGrad = ctx.createRadialGradient(
                width / 2, height / 2, 0,
                width / 2, height / 2, Math.max(width, height) * 0.75
            );
            bgGrad.addColorStop(0, '#FFFFFF');
            bgGrad.addColorStop(0.7, '#F7F8FF');
            bgGrad.addColorStop(1, '#EEF2FF');
            ctx.fillStyle = bgGrad;
            ctx.fillRect(0, 0, width, height);
            ctx.restore();
        }

        ctx.save();
        ctx.translate(offsetX, offsetY);
        ctx.scale(scale, scale);

        // ─── 1. Draw Edges ──────────────────────────────────────────────────
        for (const edge of edges) {
            const a = edge.sourceNode, b = edge.targetNode;
            const isHighlighted = selectedNode && (edge.source === selectedNode.id || edge.target === selectedNode.id);
            const isHoveredEdge = !isHighlighted && hoveredNode && (edge.source === hoveredNode.id || edge.target === hoveredNode.id);

            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            const mx = (a.x + b.x) / 2;
            const my = (a.y + b.y) / 2;
            const curveOff = 16;
            ctx.quadraticCurveTo(mx + curveOff, my - curveOff, b.x, b.y);

            // Theme-aware edge colors (Default: rgba(99,102,241,0.10), Hover: rgba(99,102,241,0.35), Active: #6366F1)
            let strokeColor;
            if (isHighlighted) {
                strokeColor = isLight ? '#6366F1' : '#FFB800';
            } else if (isHoveredEdge) {
                strokeColor = isLight ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 184, 0, 0.40)';
            } else {
                strokeColor = isLight ? 'rgba(99, 102, 241, 0.10)' : 'rgba(221, 227, 232, 0.25)';
            }

            ctx.strokeStyle = strokeColor;
            ctx.lineWidth = isHighlighted ? 2.5 : 2.0; // 2px default thickness as specified
            ctx.stroke();

            // Arrow head
            const angle = Math.atan2(b.y - (my - curveOff), b.x - (mx + curveOff));
            const arrowX = b.x - Math.cos(angle) * b.radius;
            const arrowY = b.y - Math.sin(angle) * b.radius;

            ctx.beginPath();
            ctx.moveTo(arrowX, arrowY);
            ctx.lineTo(arrowX - 8 * Math.cos(angle - 0.4), arrowY - 8 * Math.sin(angle - 0.4));
            ctx.lineTo(arrowX - 8 * Math.cos(angle + 0.4), arrowY - 8 * Math.sin(angle + 0.4));
            ctx.closePath();
            ctx.fillStyle = strokeColor;
            ctx.fill();
        }

        // ─── 2. Draw Nodes ──────────────────────────────────────────────────
        for (const node of nodes) {
            const isSelected = selectedNode && node.id === selectedNode.id;
            const isConnected = selectedNode && edges.some(
                e => (e.source === selectedNode.id && e.target === node.id) ||
                     (e.target === selectedNode.id && e.source === node.id)
            );
            // Selected node gets glow, neighbors highlighted, others dim to 40%
            const isDimmed = selectedNode && !isSelected && !isConnected;

            ctx.save();
            if (isDimmed) {
                ctx.globalAlpha = 0.40;
            }

            // Glow on Selected Node (Soft Indigo Glow in Light Mode, Marigold in Dark Mode)
            if (isSelected) {
                ctx.beginPath();
                ctx.arc(node.x, node.y, node.radius + 16, 0, Math.PI * 2);
                const glowGrad = ctx.createRadialGradient(
                    node.x, node.y, node.radius,
                    node.x, node.y, node.radius + 16
                );
                const glowColor = isLight ? 'rgba(99, 102, 241, 0.35)' : 'rgba(255, 184, 0, 0.50)';
                glowGrad.addColorStop(0, glowColor);
                glowGrad.addColorStop(1, 'rgba(0, 0, 0, 0.0)');
                ctx.fillStyle = glowGrad;
                ctx.fill();
            }

            // Enhanced Node Shadow for Light Mode
            if (isLight) {
                ctx.shadowColor = 'rgba(15, 23, 42, 0.08)';
                ctx.shadowBlur = 14;
                ctx.shadowOffsetY = 4;
            } else {
                ctx.shadowColor = 'transparent';
                ctx.shadowBlur = 0;
                ctx.shadowOffsetY = 0;
            }

            // Node Circle Fill:
            // Light mode: Hub -> soft indigo tint #EEF2FF; Normal -> clean white #FFFFFF
            // Dark mode: Hub -> elevated slate #1E293B; Normal -> dark panel #111827
            ctx.beginPath();
            ctx.arc(node.x, node.y, node.radius, 0, Math.PI * 2);
            ctx.fillStyle = isLight
                ? (node.isHub ? '#EEF2FF' : '#FFFFFF')
                : (node.isHub ? '#1E293B' : '#111827');
            ctx.fill();

            // Clear shadow before stroke & text
            ctx.shadowColor = 'transparent';
            ctx.shadowBlur = 0;
            ctx.shadowOffsetY = 0;

            // Node Circle Stroke:
            let masteryColor;
            if (node.mastery && node.mastery.status) {
                if (node.mastery.status === 'weak') masteryColor = '#E11D48';
                else if (node.mastery.status === 'okay') masteryColor = isLight ? '#F4B400' : '#F59E0B';
                else if (node.mastery.status === 'strong') masteryColor = isLight ? '#6366F1' : '#38BDF8';
                else masteryColor = isLight ? 'rgba(99, 102, 241, 0.20)' : 'rgba(148, 163, 184, 0.40)';
            } else {
                masteryColor = isLight ? 'rgba(99, 102, 241, 0.20)' : 'rgba(148, 163, 184, 0.40)';
            }
            ctx.lineWidth = isSelected ? 3.5 : (node.isHub ? 2.5 : 2);
            ctx.strokeStyle = isSelected ? (isLight ? '#6366F1' : '#F8FAFC') : masteryColor;
            ctx.stroke();

            // Node Text:
            ctx.font = FONT_SPEC;
            ctx.textAlign = 'center';
            ctx.textBaseline = 'middle';

            const textColor = isLight
                ? (node.isHub ? '#312E81' : '#0F172A')
                : (node.isHub ? '#FBBF24' : '#F8FAFC');
            const haloColor = isLight ? '#FFFFFF' : '#0B0F17';

            const lines = node.lines;
            const totalLines = lines.length;

            lines.forEach((line, li) => {
                const lineY = node.y + (li - (totalLines - 1) / 2) * LINE_HEIGHT;

                // 3px halo stroke for crisp contrast against edges/nodes
                ctx.lineWidth = 3;
                ctx.strokeStyle = haloColor;
                ctx.lineJoin = 'round';
                ctx.strokeText(line, node.x, lineY);

                // Main text fill
                ctx.fillStyle = textColor;
                ctx.fillText(line, node.x, lineY);
            });

            ctx.restore();
        }

        ctx.restore();
    }

    function getNodeAt(screenX, screenY) {
        const worldX = (screenX - offsetX) / scale;
        const worldY = (screenY - offsetY) / scale;

        for (let i = nodes.length - 1; i >= 0; i--) {
            const n = nodes[i];
            const dx = worldX - n.x;
            const dy = worldY - n.y;
            if (dx * dx + dy * dy <= n.radius * n.radius) {
                return n;
            }
        }
        return null;
    }

    function onMouseDown(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;
        const node = getNodeAt(x, y);

        if (node) {
            dragNode = node;
            isDragging = true;
            selectNode(node);
        } else {
            isPanning = true;
            panStartX = e.clientX - offsetX;
            panStartY = e.clientY - offsetY;
            selectedNode = null;
            updateNodeInspector(null);
        }
        hideTooltip();
    }

    function onMouseMove(e) {
        const rect = canvas.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const y = e.clientY - rect.top;

        if (isDragging && dragNode) {
            dragNode.x = (x - offsetX) / scale;
            dragNode.y = (y - offsetY) / scale;
            dragNode.vx = 0;
            dragNode.vy = 0;
            hideTooltip();
        } else if (isPanning) {
            offsetX = e.clientX - panStartX;
            offsetY = e.clientY - panStartY;
            hideTooltip();
        } else {
            const node = getNodeAt(x, y);
            hoveredNode = node;
            canvas.style.cursor = node ? 'pointer' : 'grab';

            if (node) {
                showTooltip(node, x, y);
            } else {
                hideTooltip();
            }
        }
    }

    function onMouseUp() {
        isDragging = false;
        dragNode = null;
        isPanning = false;
    }

    function onMouseLeave() {
        isDragging = false;
        dragNode = null;
        isPanning = false;
        hideTooltip();
    }

    function onWheel(e) {
        e.preventDefault();
        const zoomDelta = e.deltaY > 0 ? 0.9 : 1.1;
        const rect = canvas.getBoundingClientRect();
        const mx = e.clientX - rect.left;
        const my = e.clientY - rect.top;

        offsetX = mx - (mx - offsetX) * zoomDelta;
        offsetY = my - (my - offsetY) * zoomDelta;
        scale *= zoomDelta;
        scale = Math.max(0.3, Math.min(3.0, scale));
        hideTooltip();
    }

    function selectNode(node) {
        selectedNode = node;
        updateNodeInspector(node);
    }

    function showTooltip(node, mouseX, mouseY) {
        const tooltip = document.getElementById('concept-map-tooltip');
        if (!tooltip) return;

        tooltip.innerHTML = `<strong>${escapeHtml(node.label || node.id)}</strong><br><span style="color:var(--marigold);font-size:0.7rem;">${escapeHtml(node.category || (node.isHub ? 'Hub Concept' : 'Concept'))}</span>`;
        tooltip.style.left = `${mouseX + 16}px`;
        tooltip.style.top = `${mouseY + 16}px`;
        tooltip.style.display = 'block';
    }

    function hideTooltip() {
        const tooltip = document.getElementById('concept-map-tooltip');
        if (tooltip) tooltip.style.display = 'none';
    }

    function escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text || '';
        return div.innerHTML;
    }

    function updateNodeInspector(node) {
        const labelEl = document.getElementById('node-label');
        const catEl = document.getElementById('node-category');
        const summaryEl = document.getElementById('node-summary');
        const quizBtn = document.getElementById('btn-quiz-node');
        const askBtn = document.getElementById('btn-ask-node');

        if (!node) {
            if (labelEl) labelEl.textContent = 'Select a Node';
            if (catEl) {
                catEl.textContent = '—';
                catEl.style.background = 'rgba(234, 170, 0, 0.15)';
                catEl.style.color = 'var(--marigold)';
            }
            if (summaryEl) summaryEl.textContent = 'Click on any node in the concept map to view details.';
            if (quizBtn) quizBtn.style.display = 'none';
            if (askBtn) askBtn.style.display = 'none';
            return;
        }

        if (labelEl) labelEl.textContent = node.label;
        if (catEl) {
            catEl.textContent = node.category || (node.isHub ? 'Core Hub' : 'Concept');
            catEl.style.background = node.isHub ? 'var(--accent-primary)' : 'var(--surface-elevated)';
            catEl.style.color = node.isHub ? '#FFFFFF' : 'var(--text-primary)';
        }
        if (summaryEl) summaryEl.textContent = node.summary || 'No summary available for this concept.';
        if (quizBtn) {
            quizBtn.style.display = 'block';
            quizBtn.dataset.topic = node.label;
        }
        if (askBtn) {
            askBtn.style.display = 'block';
            askBtn.dataset.topic = node.label;
        }
    }

    // Expose to global API
    window.initConceptGraph = initGraph;
    window.resetGraphView = fitToView;
    window.getSelectedConceptNode = () => selectedNode;
    window.redrawConceptGraph = draw;
    window.setConceptMapMastery = function(topicMastery) {
        currentTopicMastery = topicMastery || {};
        nodes.forEach(n => {
            n.mastery = resolveNodeMastery(n.label || n.id, currentTopicMastery);
        });
        draw();
    };

})();
