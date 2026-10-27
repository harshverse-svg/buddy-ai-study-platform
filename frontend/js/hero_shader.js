/**
 * SHIKSHA BUDDY — Lusion-Inspired Hero WebGL Shader
 * 9-slice vertical poster panels over morphing Aubergine-Marigold liquid/flower FBM.
 * Features: full-screen triangle, lerp mouse (0.06), DPR capped at 1.5,
 * paused when off-screen via IntersectionObserver, reduced-motion fallback.
 */

(function () {
    'use strict';

    const canvas = document.getElementById('hero-shader-canvas');
    if (!canvas) return;

    const parentContainer = canvas.closest('.hero-shader-container');
    if (parentContainer && (parentContainer.style.display === 'none' || getComputedStyle(parentContainer).display === 'none')) {
        return;
    }

    // Check reduced motion preference
    const prefersReducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (prefersReducedMotion) {
        canvas.style.display = 'none';
        return;
    }

    const gl = canvas.getContext('webgl', {
        alpha: false,
        antialias: false,
        depth: false,
        stencil: false,
        powerPreference: 'high-performance'
    }) || canvas.getContext('experimental-webgl');

    if (!gl) {
        console.warn('WebGL not supported, using CSS gradient fallback.');
        canvas.style.display = 'none';
        return;
    }

    // Vertex Shader: Single full-screen triangle (standard 3-vertex quad trick)
    const vsSource = `
        attribute vec2 position;
        void main() {
            gl_Position = vec4(position, 0.0, 1.0);
        }
    `;

    // Fragment Shader: Exact user-specified Lusion 9-slice morphing shader
    const fsSource = `
        precision highp float;
        uniform vec2 uRes;
        uniform vec2 uMouse;
        uniform float uTime;

        float h(vec2 p) {
            return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453);
        }

        float n(vec2 p) {
            vec2 i = floor(p);
            vec2 f = fract(p);
            f = f * f * (3.0 - 2.0 * f);
            return mix(mix(h(i), h(i + vec2(1.0, 0.0)), f.x), mix(h(i + vec2(0.0, 1.0)), h(i + vec2(1.0, 1.0)), f.x), f.y);
        }

        float fbm(vec2 p) {
            float v = 0.0;
            float a = 0.5;
            for (int i = 0; i < 5; i++) {
                v += a * n(p);
                p *= 2.02;
                a *= 0.5;
            }
            return v;
        }

        void main() {
            vec2 uv = gl_FragCoord.xy / uRes;
            float S = 9.0;
            float id = floor(uv.x * S);

            vec2 p = (uv - 0.5) * vec2(uRes.x / uRes.y, 1.0);
            p.y += sin(id * 1.7 + uTime * 0.3) * 0.04;

            vec2 m = (uMouse - 0.5) * vec2(uRes.x / uRes.y, 1.0);
            p += (m - p) * 0.1 * exp(-length(p - m) * 2.2);

            vec2 q = vec2(fbm(p * 2.0 + uTime * 0.05), fbm(p * 2.0 + vec2(5.2, 1.3) - uTime * 0.04));
            float f = fbm(p * 2.5 + q * 2.0 + uTime * 0.06);

            vec3 bg = vec3(0.07, 0.024, 0.06);
            vec3 au = vec3(0.227, 0.059, 0.204);
            vec3 ma = vec3(0.918, 0.667, 0.0);
            vec3 ic = vec3(0.867, 0.89, 0.91);

            vec3 c = mix(bg, au, smoothstep(0.2, 0.6, f));
            c = mix(c, ma, smoothstep(0.55, 0.85, f) * 0.85);
            c = mix(c, ic, smoothstep(0.8, 1.0, f) * 0.35);

            c *= 0.9 + 0.1 * sin(id * 3.1);
            float e = min(fract(uv.x * S), 1.0 - fract(uv.x * S));
            c += ic * 0.06 * (1.0 - smoothstep(0.0, 0.0015, e));
            c += (h(gl_FragCoord.xy + uTime) - 0.5) * 0.05;

            // Dark gradient fade at the bottom to guarantee optimal text readability
            float bottomFade = smoothstep(0.0, 0.38, uv.y);
            c = mix(bg * 0.8, c, bottomFade);

            gl_FragColor = vec4(c, 1.0);
        }
    `;

    function createShader(gl, type, source) {
        const shader = gl.createShader(type);
        gl.shaderSource(shader, source);
        gl.compileShader(shader);
        if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
            console.error('Shader compilation error:', gl.getShaderInfoLog(shader));
            gl.deleteShader(shader);
            return null;
        }
        return shader;
    }

    const vertexShader = createShader(gl, gl.VERTEX_SHADER, vsSource);
    const fragmentShader = createShader(gl, gl.FRAGMENT_SHADER, fsSource);
    if (!vertexShader || !fragmentShader) return;

    const program = gl.createProgram();
    gl.attachShader(program, vertexShader);
    gl.attachShader(program, fragmentShader);
    gl.linkProgram(program);

    if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
        console.error('Program linking error:', gl.getProgramInfoLog(program));
        return;
    }

    gl.useProgram(program);

    // Full-screen triangle covering [-1, -1] to [3, 3]
    const positionBuffer = gl.createBuffer();
    gl.bindBuffer(gl.ARRAY_BUFFER, positionBuffer);
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([
        -1.0, -1.0,
         3.0, -1.0,
        -1.0,  3.0
    ]), gl.STATIC_DRAW);

    const positionLocation = gl.getAttribLocation(program, 'position');
    gl.enableVertexAttribArray(positionLocation);
    gl.vertexAttribPointer(positionLocation, 2, gl.FLOAT, false, 0, 0);

    const uResLoc = gl.getUniformLocation(program, 'uRes');
    const uMouseLoc = gl.getUniformLocation(program, 'uMouse');
    const uTimeLoc = gl.getUniformLocation(program, 'uTime');

    // State & Mouse Tracking with lerp(0.06)
    let targetMouseX = 0.5;
    let targetMouseY = 0.5;
    let mouseX = 0.5;
    let mouseY = 0.5;
    let startTime = performance.now();
    let isVisible = true;
    let animationFrameId = null;

    function onPointerMove(e) {
        targetMouseX = e.clientX / window.innerWidth;
        targetMouseY = 1.0 - (e.clientY / window.innerHeight); // Invert Y for WebGL coords
    }
    window.addEventListener('pointermove', onPointerMove, { passive: true });

    // Resize handler capping DPR at 1.5 for mid-range 60fps performance
    function resize() {
        const dpr = Math.min(window.devicePixelRatio || 1, 1.5);
        const w = window.innerWidth;
        const h = window.innerHeight;
        const dw = Math.floor(w * dpr);
        const dh = Math.floor(h * dpr);

        if (canvas.width !== dw || canvas.height !== dh) {
            canvas.width = dw;
            canvas.height = dh;
            gl.viewport(0, 0, dw, dh);
        }
    }

    window.addEventListener('resize', resize, { passive: true });
    resize();

    // IntersectionObserver to pause rendering when hero is off-screen
    const heroSection = document.getElementById('hero') || canvas.parentElement;
    if (heroSection && 'IntersectionObserver' in window) {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                isVisible = entry.isIntersecting;
                if (isVisible && !animationFrameId) {
                    render();
                }
            });
        }, { threshold: 0.05 });
        observer.observe(heroSection);
    }

    // Main render loop
    function render() {
        if (!isVisible) {
            animationFrameId = null;
            return;
        }

        // Smooth mouse lerp
        mouseX += (targetMouseX - mouseX) * 0.06;
        mouseY += (targetMouseY - mouseY) * 0.06;

        const currentTime = (performance.now() - startTime) * 0.001;

        gl.uniform2f(uResLoc, canvas.width, canvas.height);
        gl.uniform2f(uMouseLoc, mouseX, mouseY);
        gl.uniform1f(uTimeLoc, currentTime);

        gl.drawArrays(gl.TRIANGLES, 0, 3);

        animationFrameId = requestAnimationFrame(render);
    }

    render();

    // Expose pause/resume controls for view switching
    window.HeroShader = {
        pause: () => { isVisible = false; },
        resume: () => {
            if (!isVisible) {
                isVisible = true;
                resize();
                render();
            }
        }
    };
})();
