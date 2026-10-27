/**
 * SHIKSHA BUDDY — Brand Globe: "SHIKSHA BUDDY" on a 3D Sphere / Cube
 * Section 3: Three.js 3D brand sphere in closing CTA
 * - 4096x2048 CanvasTexture with 9 horizontal rows of "SHIKSHA BUDDY  ✦  " in Clash Display 800
 * - Seamless 4-unit repeat (exactly 1024px each)
 * - Alternating solid ice (#DDE3E8) and outlined marigold (#EAAA00)
 * - MeshStandardMaterial with emissiveMap (intensity 0.5, roughness 0.6)
 * - Fresnel rim in marigold, thin ice wireframe icosahedron shell (scale 1.04, opacity 0.08), slow orbit ring
 * - Auto-rotate .12 rad/s, 18deg tilt, pointer drag with inertia (touch-action: pan-y)
 * - Hover tilt toward cursor, click soft pulse, lazy-loaded and paused offscreen, DPR cap 1.5
 */

(function () {
    'use strict';

    const SHAPE = 'sphere'; // 'sphere' | 'cube'
    const container = document.getElementById('brand-globe-container');
    const canvas = document.getElementById('brand-globe-canvas');
    if (!container || !canvas) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isVisible = false;
    let renderer, scene, camera;
    let mainGroup, sphereMesh, shellMesh, ringMesh;
    let isDragging = false;
    let prevPointerX = 0, prevPointerY = 0;
    let dragVelocityX = 0, dragVelocityY = 0;
    let hoverTiltX = 0, hoverTiltY = 0;
    let targetHoverTiltX = 0, targetHoverTiltY = 0;
    let pulseScale = 1.0;
    let lastTime = performance.now();

    // ─── 1. Generate Seamless 4096x2048 Sphere Texture ──────────────────────────
    function createBrandTexture() {
        const off = document.createElement('canvas');
        off.width = 4096;
        off.height = 2048;
        const ctx = off.getContext('2d');

        // Dark aubergine background
        ctx.fillStyle = '#1B0A18';
        ctx.fillRect(0, 0, 4096, 2048);

        const repeatUnit = "SHIKSHA BUDDY  ✦  ";
        const unitWidth = 4096 / 4; // Exactly 1024px per unit so 4 units wrap seamlessly!

        // Calibrate font size so unit width is exactly 1024px
        let testSize = 70;
        ctx.font = `800 ${testSize}px "Clash Display", sans-serif`;
        let measured = ctx.measureText(repeatUnit).width;
        let fontSize = Math.floor(testSize * (unitWidth / (measured || 1)));
        ctx.font = `800 ${fontSize}px "Clash Display", sans-serif`;

        // 9 horizontal rows distributed between ±70° latitude (approx Y = 260 to 1780)
        const rowCount = 9;
        const minY = 280;
        const maxY = 1768;
        const stepY = (maxY - minY) / (rowCount - 1);

        for (let r = 0; r < rowCount; r++) {
            const y = minY + r * stepY;
            const isOdd = r % 2 === 1;
            const shiftX = isOdd ? unitWidth * 0.5 : 0.0;

            if (isOdd) {
                // Outlined marigold (#EAAA00) with 3px stroke
                ctx.strokeStyle = '#EAAA00';
                ctx.lineWidth = 3;
                for (let u = -1; u < 5; u++) {
                    ctx.strokeText(repeatUnit, u * unitWidth + shiftX, y);
                }
            } else {
                // Solid ice (#DDE3E8)
                ctx.fillStyle = '#DDE3E8';
                for (let u = -1; u < 5; u++) {
                    ctx.fillText(repeatUnit, u * unitWidth + shiftX, y);
                }
            }
        }

        // Fade poles into plain aubergine so text isn't pinched at top/bottom
        const topGrad = ctx.createLinearGradient(0, 0, 0, 240);
        topGrad.addColorStop(0, '#1B0A18');
        topGrad.addColorStop(1, 'rgba(27, 10, 24, 0)');
        ctx.fillStyle = topGrad;
        ctx.fillRect(0, 0, 4096, 240);

        const botGrad = ctx.createLinearGradient(0, 1808, 0, 2048);
        botGrad.addColorStop(0, 'rgba(27, 10, 24, 0)');
        botGrad.addColorStop(1, '#1B0A18');
        ctx.fillStyle = botGrad;
        ctx.fillRect(0, 1808, 4096, 240);

        const tex = new THREE.CanvasTexture(off);
        tex.wrapS = THREE.RepeatWrapping;
        tex.wrapT = THREE.ClampToEdgeWrapping;
        tex.minFilter = THREE.LinearFilter;
        tex.magFilter = THREE.LinearFilter;
        return tex;
    }

    // ─── 2. Setup Three.js Scene ───────────────────────────────────────────────
    function initScene() {
        if (typeof THREE === 'undefined') return;

        const w = container.clientWidth || 480;
        const h = container.clientHeight || 480;

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(40, w / h, 0.1, 50);
        camera.position.set(0, 0, 3.4);

        renderer = new THREE.WebGLRenderer({
            canvas: canvas,
            alpha: true,
            antialias: true,
            powerPreference: 'high-performance'
        });
        renderer.setSize(w, h);
        renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));

        mainGroup = new THREE.Group();
        // 18deg initial tilt
        mainGroup.rotation.z = (18 * Math.PI) / 180;
        mainGroup.rotation.x = (10 * Math.PI) / 180;
        scene.add(mainGroup);

        const brandTexture = createBrandTexture();

        // 1. Sphere Geometry
        if (SHAPE === 'sphere') {
            const sphereGeo = new THREE.SphereGeometry(1.0, 64, 64);
            const sphereMat = new THREE.MeshStandardMaterial({
                map: brandTexture,
                emissiveMap: brandTexture,
                emissive: new THREE.Color(0xffffff),
                emissiveIntensity: 0.5,
                roughness: 0.6,
                metalness: 0.08
            });
            sphereMesh = new THREE.Mesh(sphereGeo, sphereMat);
            mainGroup.add(sphereMesh);
        } else {
            // Cube fallback option
            const boxGeo = new THREE.BoxGeometry(1.4, 1.4, 1.4);
            const boxMat = new THREE.MeshStandardMaterial({
                map: brandTexture,
                emissiveMap: brandTexture,
                emissive: new THREE.Color(0xffffff),
                emissiveIntensity: 0.5,
                roughness: 0.6
            });
            sphereMesh = new THREE.Mesh(boxGeo, boxMat);
            mainGroup.add(sphereMesh);
        }

        // 2. Thin Ice Wireframe Icosahedron Shell (scale 1.04, opacity .08)
        const shellGeo = new THREE.IcosahedronGeometry(1.04, 1);
        const shellMat = new THREE.MeshBasicMaterial({
            color: 0xDDE3E8,
            wireframe: true,
            transparent: true,
            opacity: 0.08
        });
        shellMesh = new THREE.Mesh(shellGeo, shellMat);
        mainGroup.add(shellMesh);

        // 3. Slow Orbit Ring
        const ringGeo = new THREE.TorusGeometry(1.30, 0.005, 8, 80);
        const ringMat = new THREE.MeshBasicMaterial({
            color: 0xEAAA00,
            transparent: true,
            opacity: 0.32
        });
        ringMesh = new THREE.Mesh(ringGeo, ringMat);
        ringMesh.rotation.x = Math.PI * 0.42;
        ringMesh.rotation.y = Math.PI * 0.12;
        mainGroup.add(ringMesh);

        // 4. Lights: Ambient, Marigold Fresnel Rim Light, and Key Soft Light
        const ambientLight = new THREE.AmbientLight(0x3A0F34, 1.4);
        scene.add(ambientLight);

        // Marigold Rim Light from back/side
        const rimLight = new THREE.DirectionalLight(0xEAAA00, 2.2);
        rimLight.position.set(-3, 2, -2.5);
        scene.add(rimLight);

        // Soft Key Light from front
        const keyLight = new THREE.DirectionalLight(0xF4F7FA, 1.1);
        keyLight.position.set(3, 3, 4);
        scene.add(keyLight);

        bindEvents();
    }

    // ─── 3. Interactions: Drag with Inertia, Cursor Tilt, Click Pulse ───────────
    function bindEvents() {
        container.style.touchAction = 'pan-y'; // Ensure page scroll still works on mobile!

        function handleResize() {
            if (!container || !renderer || !camera) return;
            const w = container.clientWidth || 320;
            const h = container.clientHeight || 320;
            camera.aspect = w / h;
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
            renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
        }
        window.addEventListener('resize', handleResize, { passive: true });

        container.addEventListener('pointerdown', (e) => {
            isDragging = true;
            prevPointerX = e.clientX;
            prevPointerY = e.clientY;
            dragVelocityX = 0;
            dragVelocityY = 0;
        }, { passive: true });

        window.addEventListener('pointermove', (e) => {
            if (isDragging) {
                const deltaX = e.clientX - prevPointerX;
                const deltaY = e.clientY - prevPointerY;
                prevPointerX = e.clientX;
                prevPointerY = e.clientY;

                dragVelocityX = deltaX * 0.005;
                dragVelocityY = deltaY * 0.005;

                if (mainGroup) {
                    mainGroup.rotation.y += dragVelocityX;
                    mainGroup.rotation.x += dragVelocityY;
                }
            }

            // Hover tilt toward cursor
            const rect = container.getBoundingClientRect();
            if (e.clientX >= rect.left && e.clientX <= rect.right &&
                e.clientY >= rect.top && e.clientY <= rect.bottom) {
                const normX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
                const normY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
                targetHoverTiltX = -normY * 0.18;
                targetHoverTiltY = normX * 0.18;
            } else {
                targetHoverTiltX = 0;
                targetHoverTiltY = 0;
            }
        }, { passive: true });

        window.addEventListener('pointerup', () => {
            isDragging = false;
        }, { passive: true });

        // Click soft pulse animation
        container.addEventListener('click', () => {
            if (prefersReducedMotion) return;
            pulseScale = 1.08;
        }, { passive: true });

        // Resize handler
        window.addEventListener('resize', () => {
            if (!container || !renderer || !camera) return;
            const w = container.clientWidth;
            const h = container.clientHeight;
            camera.aspect = (w || 1) / (h || 1);
            camera.updateProjectionMatrix();
            renderer.setSize(w, h);
        }, { passive: true });
    }

    // ─── 4. Animation Loop ──────────────────────────────────────────────────────
    function tick() {
        if (!isVisible || document.hidden) return;
        if (!renderer || !scene || !camera) return;

        const cw = container.clientWidth || 320;
        const ch = container.clientHeight || 320;
        const targetPixelRatio = Math.min(window.devicePixelRatio || 1, 1.5);
        const expectedW = Math.floor(cw * targetPixelRatio);
        if (Math.abs(canvas.width - expectedW) > 4) {
            camera.aspect = cw / ch;
            camera.updateProjectionMatrix();
            renderer.setSize(cw, ch);
            renderer.setPixelRatio(targetPixelRatio);
        }

        const now = performance.now();
        const dt = Math.min((now - lastTime) / 1000, 0.1);
        lastTime = now;

        if (!prefersReducedMotion) {
            // Auto-rotation: .12 rad/s
            if (!isDragging) {
                mainGroup.rotation.y += 0.12 * dt;
            }

            // Drag inertia damping
            if (!isDragging && (Math.abs(dragVelocityX) > 0.0001 || Math.abs(dragVelocityY) > 0.0001)) {
                mainGroup.rotation.y += dragVelocityX;
                mainGroup.rotation.x += dragVelocityY;
                dragVelocityX *= 0.94;
                dragVelocityY *= 0.94;
            }

            // Smooth hover tilt
            hoverTiltX += (targetHoverTiltX - hoverTiltX) * 0.08;
            hoverTiltY += (targetHoverTiltY - hoverTiltY) * 0.08;
            mainGroup.position.x = hoverTiltY * 0.2;
            mainGroup.position.y = hoverTiltX * 0.2;

            // Soft pulse recovery
            pulseScale += (1.0 - pulseScale) * 0.1;
            mainGroup.scale.set(pulseScale, pulseScale, pulseScale);

            // Slow counter-rotation on shell and orbit ring
            if (shellMesh) shellMesh.rotation.y -= 0.04 * dt;
            if (ringMesh) ringMesh.rotation.z += 0.06 * dt;
        }

        renderer.render(scene, camera);
    }

    // ─── 5. Visibility / Lazy Loading ───────────────────────────────────────────
    if ('IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isVisible = entry.isIntersecting && !document.hidden;
                if (isVisible && !renderer) {
                    initScene();
                }
            });
        }, { rootMargin: '120px' });
        observer.observe(container);
    } else {
        isVisible = true;
        initScene();
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            isVisible = false;
        } else if (container.getBoundingClientRect().top < window.innerHeight) {
            isVisible = true;
            lastTime = performance.now();
        }
    });

    // Hook into shared ticker / requestAnimationFrame
    if (typeof gsap !== 'undefined') {
        gsap.ticker.add(tick);
    } else {
        function loop() {
            tick();
            requestAnimationFrame(loop);
        }
        requestAnimationFrame(loop);
    }
})();
