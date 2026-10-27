/**
 * SHIKSHA BUDDY — Hero Full-Screen Hologram Video & WebGL Gradient-Map Recolor
 * - Fullscreen video behind text with scrim
 * - WebGL gradient-map quad recoloring: Silver & Plum face, Marigold eyes/rim, dark background, NO blue
 * - Object-fit: cover emulation with focal point 68%/40% (desktop) & 60%/30% (mobile)
 * - requestVideoFrameCallback with shared ticker fallback
 * - Cursor parallax (±12px transform) & ScrollTrigger exit (opacity 1->0, scale 1->1.12)
 * - Zero CPU/GPU waste: paused offscreen and on document.hidden
 */

(function () {
    'use strict';

    const heroSection = document.getElementById('hero');
    const video = document.getElementById('hero-hologram-video');
    const canvas = document.getElementById('hero-hologram-canvas');

    if (!heroSection || !video || !canvas) return;

    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let isVisible = true;
    let gl = null;
    let program = null;
    let texture = null;
    let uScaleLoc = null;
    let uOffsetLoc = null;
    let rvfcId = null;
    let rafId = null;

    // ─── 1. WebGL Initialization & Shader Compilation ───────────────────────────
    function initWebGL() {
        try {
            gl = canvas.getContext('webgl', { alpha: false, antialias: false, powerPreference: 'high-performance' }) ||
                 canvas.getContext('experimental-webgl');
        } catch (e) {
            gl = null;
        }

        if (!gl) {
            console.warn('WebGL not supported for hero recolor. Activating CSS fallback.');
            applyCssFallback();
            return false;
        }

        const vsSource = `
            attribute vec2 aPos;
            varying vec2 vUv;
            uniform vec2 uScale;
            uniform vec2 uOffset;

            void main() {
                vec2 baseUv = (aPos + 1.0) * 0.5;
                baseUv.y = 1.0 - baseUv.y;
                vUv = baseUv * uScale + uOffset;
                gl_Position = vec4(aPos, 0.0, 1.0);
            }
        `;

        const fsSource = `
            precision mediump float;
            varying vec2 vUv;
            uniform sampler2D uTex;

            void main() {
                vec4 c = texture2D(uTex, vUv);
                float l = dot(c.rgb, vec3(0.299, 0.587, 0.114));
                vec3 bg = vec3(0.07, 0.024, 0.06);
                vec3 plum = vec3(0.35, 0.12, 0.31);
                vec3 amber = vec3(0.918, 0.667, 0.0); // Original bright marigold #EAAA00
                vec3 silver = vec3(0.87, 0.89, 0.91);

                vec3 o = mix(bg, plum, smoothstep(0.05, 0.40, l));
                o = mix(o, amber, smoothstep(0.38, 0.72, l) * 0.85);
                o = mix(o, silver, smoothstep(0.72, 0.98, l));

                gl_FragColor = vec4(o, 1.0);
            }
        `;

        function compileShader(type, src) {
            const shader = gl.createShader(type);
            gl.shaderSource(shader, src);
            gl.compileShader(shader);
            if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
                console.error('Hero Shader error:', gl.getShaderInfoLog(shader));
                gl.deleteShader(shader);
                return null;
            }
            return shader;
        }

        const vs = compileShader(gl.VERTEX_SHADER, vsSource);
        const fs = compileShader(gl.FRAGMENT_SHADER, fsSource);
        if (!vs || !fs) return false;

        program = gl.createProgram();
        gl.attachShader(program, vs);
        gl.attachShader(program, fs);
        gl.linkProgram(program);

        if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
            console.error('Hero Program link error:', gl.getProgramInfoLog(program));
            return false;
        }

        gl.useProgram(program);

        // Fullscreen Quad Buffer (-1 to 1)
        const quadBuffer = gl.createBuffer();
        gl.bindBuffer(gl.ARRAY_BUFFER, quadBuffer);
        const vertices = new Float32Array([
            -1.0, -1.0,
             1.0, -1.0,
            -1.0,  1.0,
            -1.0,  1.0,
             1.0, -1.0,
             1.0,  1.0
        ]);
        gl.bufferData(gl.ARRAY_BUFFER, vertices, gl.STATIC_DRAW);

        const aPos = gl.getAttribLocation(program, 'aPos');
        gl.enableVertexAttribArray(aPos);
        gl.vertexAttribPointer(aPos, 2, gl.FLOAT, false, 0, 0);

        // Uniform locations
        uScaleLoc = gl.getUniformLocation(program, 'uScale');
        uOffsetLoc = gl.getUniformLocation(program, 'uOffset');
        const uTexLoc = gl.getUniformLocation(program, 'uTex');
        gl.uniform1i(uTexLoc, 0);

        // Video Texture
        texture = gl.createTexture();
        gl.activeTexture(gl.TEXTURE0);
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
        gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);

        return true;
    }

    function applyCssFallback() {
        if (!video) return;
        video.style.opacity = '1';
        video.style.position = 'absolute';
        video.style.inset = '0';
        video.style.width = '100%';
        video.style.height = '100%';
        video.style.objectFit = 'cover';
        video.style.objectPosition = window.innerWidth < 900 ? '60% 30%' : '68% 40%';
        video.style.filter = 'grayscale(1) contrast(1.2) brightness(0.8)';
        if (canvas) canvas.style.display = 'none';
    }

    // ─── 2. Object-Fit: Cover with Focal Point & Render ─────────────────────────
    let canvasW = 0, canvasH = 0;

    function resizeCanvas() {
        if (!canvas) return;
        const rect = heroSection.getBoundingClientRect();
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        canvasW = Math.max(1, Math.floor(rect.width * dpr));
        canvasH = Math.max(1, Math.floor(rect.height * dpr));

        if (canvas.width !== canvasW || canvas.height !== canvasH) {
            canvas.width = canvasW;
            canvas.height = canvasH;
            if (gl) gl.viewport(0, 0, canvasW, canvasH);
        }
    }

    function updateCoverUniforms() {
        if (!gl || !program || !uScaleLoc || !uOffsetLoc) return;

        const isMobile = window.innerWidth < 900;
        const focalX = isMobile ? 0.60 : 0.68;
        const focalY = isMobile ? 0.30 : 0.40;

        const vw = video.videoWidth || 1280;
        const vh = video.videoHeight || 720;
        const videoAspect = vw / vh;
        const screenAspect = (canvasW || 1) / (canvasH || 1);

        let scaleX = 1.0, scaleY = 1.0;
        let offsetX = 0.0, offsetY = 0.0;

        if (screenAspect > videoAspect) {
            // Screen is wider than video: cropped top and bottom
            scaleX = 1.0;
            const lenY = videoAspect / screenAspect;
            scaleY = lenY;
            offsetY = Math.max(0.0, Math.min(1.0 - lenY, focalY - lenY * 0.5));
            offsetX = 0.0;
        } else {
            // Screen is taller than video: cropped left and right
            scaleY = 1.0;
            const lenX = screenAspect / videoAspect;
            scaleX = lenX;
            offsetX = Math.max(0.0, Math.min(1.0 - lenX, focalX - lenX * 0.5));
            offsetY = 0.0;
        }

        gl.uniform2f(uScaleLoc, scaleX, scaleY);
        gl.uniform2f(uOffsetLoc, offsetX, offsetY);
    }

    function renderFrame() {
        if (!gl || !isVisible || video.readyState < 2) return;

        // Upload current video frame to texture
        gl.bindTexture(gl.TEXTURE_2D, texture);
        gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, video);

        updateCoverUniforms();
        gl.drawArrays(gl.TRIANGLES, 0, 6);
    }

    // ─── 3. Video Playback & Frame Pump ─────────────────────────────────────────
    function onVideoFrame() {
        if (!isVisible || document.hidden) return;
        renderFrame();
        if ('requestVideoFrameCallback' in video) {
            rvfcId = video.requestVideoFrameCallback(onVideoFrame);
        }
    }

    function startFrameLoop() {
        if (!gl) return;
        if ('requestVideoFrameCallback' in video) {
            if (!rvfcId) rvfcId = video.requestVideoFrameCallback(onVideoFrame);
        } else {
            if (!rafId) {
                function ticker() {
                    if (isVisible && !document.hidden) renderFrame();
                    rafId = requestAnimationFrame(ticker);
                }
                rafId = requestAnimationFrame(ticker);
            }
        }
    }

    function stopFrameLoop() {
        if (rvfcId && 'cancelVideoFrameCallback' in video) {
            video.cancelVideoFrameCallback(rvfcId);
            rvfcId = null;
        }
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    function playVideo() {
        if (!video) return;
        video.muted = true;
        const p = video.play();
        if (p !== undefined) {
            p.then(() => {
                startFrameLoop();
            }).catch(() => {
                video.muted = true;
                video.play().then(startFrameLoop).catch(() => {});
            });
        }
    }

    function pauseVideo() {
        if (video && !video.paused) {
            video.pause();
        }
        stopFrameLoop();
    }

    // ─── 4. IntersectionObserver & Visibility Handling ─────────────────────────
    if ('IntersectionObserver' in window && heroSection) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach((entry) => {
                if (entry.isIntersecting && !document.hidden) {
                    isVisible = true;
                    resizeCanvas();
                    playVideo();
                } else {
                    isVisible = false;
                    pauseVideo();
                }
            });
        }, { rootMargin: '100px 0px' });
        observer.observe(heroSection);
    }

    document.addEventListener('visibilitychange', () => {
        if (document.hidden) {
            pauseVideo();
        } else if (isVisible) {
            playVideo();
        }
    }, { passive: true });

    // ─── 5. Parallax (±12px with Cursor) & ScrollTrigger Exit ────────────────────
    let quickX = null;
    let quickY = null;
    let targetX = 0, targetY = 0;
    let currentX = 0, currentY = 0;

    function initMotion() {
        if (prefersReducedMotion) return;

        if (typeof gsap !== 'undefined') {
            quickX = gsap.quickTo(canvas, "x", { duration: 0.6, ease: "power2.out" });
            quickY = gsap.quickTo(canvas, "y", { duration: 0.6, ease: "power2.out" });

            // Scroll Exit: Opacity 1 -> 0, Scale 1 -> 1.12 with scrub
            if (typeof ScrollTrigger !== 'undefined') {
                gsap.to(canvas, {
                    opacity: 0,
                    scale: 1.12,
                    ease: "none",
                    scrollTrigger: {
                        trigger: heroSection,
                        start: "top top",
                        end: "bottom top",
                        scrub: true
                    }
                });
            }
        }

        window.addEventListener('mousemove', (e) => {
            if (!isVisible || prefersReducedMotion) return;
            const nx = ((e.clientX / window.innerWidth) - 0.5) * 2; // -1 to 1
            const ny = ((e.clientY / window.innerHeight) - 0.5) * 2;

            if (quickX && quickY) {
                quickX(nx * 12);
                quickY(ny * 12);
            } else {
                targetX = nx * 12;
                targetY = ny * 12;
            }
        }, { passive: true });

        // Fallback lerp loop if GSAP quickTo is not available
        if (!quickX) {
            function lerpMotion() {
                if (isVisible && !prefersReducedMotion) {
                    currentX += (targetX - currentX) * 0.08;
                    currentY += (targetY - currentY) * 0.08;
                    canvas.style.transform = `translate3d(${currentX.toFixed(2)}px, ${currentY.toFixed(2)}px, 0)`;
                }
                requestAnimationFrame(lerpMotion);
            }
            requestAnimationFrame(lerpMotion);
        }
    }

    // ─── Lifecycle & Public API ─────────────────────────────────────────────────
    document.addEventListener('DOMContentLoaded', () => {
        resizeCanvas();
        initWebGL();
        playVideo();
        initMotion();

        let resizeTimer;
        window.addEventListener('resize', () => {
            clearTimeout(resizeTimer);
            resizeTimer = setTimeout(() => {
                resizeCanvas();
                if (isVisible) renderFrame();
            }, 100);
        }, { passive: true });
    });

    window.HeroHologram = {
        play: playVideo,
        pause: pauseVideo,
        videoElement: video,
        canvasElement: canvas
    };

    window.HeroParticles = { pause: pauseVideo, resume: playVideo };
    window.HeroShader = { pause: pauseVideo, resume: playVideo };
})();
