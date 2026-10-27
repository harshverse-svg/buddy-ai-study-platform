/**
 * BUDDY — Procedural 3D Neural Core
 * Three.js + Inline GLSL Shaders — 100% Code Generated
 */
import * as THREE from 'three';

let scene, camera, renderer, coreGroup;
let particles, icosahedron, energySphere;
let clock, mouseX = 0, mouseY = 0;
let currentState = 'idle'; // 'idle' | 'thinking' | 'ready'

let container = document.getElementById('hero-three-container') || document.getElementById('three-container');
if (container) {
    init();
    animate();
} else {
    // Retry if DOM is still preparing
    window.addEventListener('DOMContentLoaded', () => {
        container = document.getElementById('hero-three-container') || document.getElementById('three-container');
        if (container && !renderer) {
            init();
            animate();
        }
    });
}

function init() {
    if (!container) return;
    // Scene
    scene = new THREE.Scene();
    scene.fog = new THREE.FogExp2(0x05070B, 0.015);
    clock = new THREE.Clock();

    // Camera
    const aspect = (container.clientWidth || 400) / (container.clientHeight || 350);
    camera = new THREE.PerspectiveCamera(60, aspect, 0.1, 100);
    camera.position.z = 5;

    // Renderer
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setSize(container.clientWidth || 400, container.clientHeight || 350);
    renderer.setPixelRatio(1);
    renderer.setClearColor(0x05070B, 0);
    container.appendChild(renderer.domElement);

    // Core Group
    coreGroup = new THREE.Group();
    scene.add(coreGroup);

    // 1. Wireframe Icosahedron Cage (Marigold Gold Crystal Cage)
    const icoGeo = new THREE.IcosahedronGeometry(2, 1);
    const icoMat = new THREE.MeshBasicMaterial({
        color: 0xEAAA00,
        wireframe: true,
        transparent: true,
        opacity: 0.22
    });
    icosahedron = new THREE.Mesh(icoGeo, icoMat);
    coreGroup.add(icosahedron);

    // 2. Inner Energy Sphere with GLSL Simplex Noise (Crystalline Marigold & Amber)
    const sphereGeo = new THREE.IcosahedronGeometry(1.2, 48);
    const sphereMat = new THREE.ShaderMaterial({
        uniforms: {
            uTime: { value: 0 },
            uColor1: { value: new THREE.Color(0xEAAA00) }, // Marigold Gold
            uColor2: { value: new THREE.Color(0xFF8A00) }, // Warm Amber
            uColor3: { value: new THREE.Color(0xDDE3E8) }, // Ice Silver
            uIntensity: { value: 1.0 },
            uMorph: { value: 0.3 }
        },
        vertexShader: `
            uniform float uTime;
            uniform float uMorph;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vDisplacement;

            // 3D Simplex Noise
            vec3 mod289(vec3 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 mod289(vec4 x) { return x - floor(x * (1.0 / 289.0)) * 289.0; }
            vec4 permute(vec4 x) { return mod289(((x*34.0)+1.0)*x); }
            vec4 taylorInvSqrt(vec4 r) { return 1.79284291400159 - 0.85373472095314 * r; }

            float snoise(vec3 v) {
                const vec2 C = vec2(1.0/6.0, 1.0/3.0);
                const vec4 D = vec4(0.0, 0.5, 1.0, 2.0);
                vec3 i = floor(v + dot(v, C.yyy));
                vec3 x0 = v - i + dot(i, C.xxx);
                vec3 g = step(x0.yzx, x0.xyz);
                vec3 l = 1.0 - g;
                vec3 i1 = min(g.xyz, l.zxy);
                vec3 i2 = max(g.xyz, l.zxy);
                vec3 x1 = x0 - i1 + C.xxx;
                vec3 x2 = x0 - i2 + C.yyy;
                vec3 x3 = x0 - D.yyy;
                i = mod289(i);
                vec4 p = permute(permute(permute(
                    i.z + vec4(0.0, i1.z, i2.z, 1.0))
                    + i.y + vec4(0.0, i1.y, i2.y, 1.0))
                    + i.x + vec4(0.0, i1.x, i2.x, 1.0));
                float n_ = 0.142857142857;
                vec3 ns = n_ * D.wyz - D.xzx;
                vec4 j = p - 49.0 * floor(p * ns.z * ns.z);
                vec4 x_ = floor(j * ns.z);
                vec4 y_ = floor(j - 7.0 * x_);
                vec4 x = x_ * ns.x + ns.yyyy;
                vec4 y = y_ * ns.x + ns.yyyy;
                vec4 h = 1.0 - abs(x) - abs(y);
                vec4 b0 = vec4(x.xy, y.xy);
                vec4 b1 = vec4(x.zw, y.zw);
                vec4 s0 = floor(b0)*2.0 + 1.0;
                vec4 s1 = floor(b1)*2.0 + 1.0;
                vec4 sh = -step(h, vec4(0.0));
                vec4 a0 = b0.xzyw + s0.xzyw*sh.xxyy;
                vec4 a1 = b1.xzyw + s1.xzyw*sh.zzww;
                vec3 p0 = vec3(a0.xy, h.x);
                vec3 p1 = vec3(a0.zw, h.y);
                vec3 p2 = vec3(a1.xy, h.z);
                vec3 p3 = vec3(a1.zw, h.w);
                vec4 norm = taylorInvSqrt(vec4(dot(p0,p0), dot(p1,p1), dot(p2,p2), dot(p3,p3)));
                p0 *= norm.x; p1 *= norm.y; p2 *= norm.z; p3 *= norm.w;
                vec4 m = max(0.6 - vec4(dot(x0,x0), dot(x1,x1), dot(x2,x2), dot(x3,x3)), 0.0);
                m = m * m;
                return 42.0 * dot(m*m, vec4(dot(p0,x0), dot(p1,x1), dot(p2,x2), dot(p3,x3)));
            }

            void main() {
                vNormal = normal;
                vPosition = position;
                float noise = snoise(position * 1.5 + uTime * 0.3);
                float displacement = noise * uMorph;
                vDisplacement = displacement;
                vec3 newPos = position + normal * displacement;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(newPos, 1.0);
            }
        `,
        fragmentShader: `
            uniform float uTime;
            uniform vec3 uColor1;
            uniform vec3 uColor2;
            uniform vec3 uColor3;
            uniform float uIntensity;
            varying vec3 vNormal;
            varying vec3 vPosition;
            varying float vDisplacement;

            void main() {
                float fresnel = pow(1.0 - abs(dot(normalize(vNormal), vec3(0.0, 0.0, 1.0))), 2.0);
                vec3 color = mix(uColor1, uColor2, vDisplacement * 2.0 + 0.5);
                color = mix(color, uColor3, fresnel * 0.5);
                float alpha = (0.4 + fresnel * 0.6) * uIntensity;
                gl_FragColor = vec4(color, alpha);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        depthWrite: false
    });
    energySphere = new THREE.Mesh(sphereGeo, sphereMat);
    coreGroup.add(energySphere);

    // 3. Torus Ring
    const torusGeo = new THREE.TorusGeometry(1.8, 0.02, 16, 100);
    const torusMat = new THREE.MeshBasicMaterial({
        color: 0x7F00FF,
        transparent: true,
        opacity: 0.3
    });
    const torus = new THREE.Mesh(torusGeo, torusMat);
    torus.rotation.x = Math.PI / 2;
    coreGroup.add(torus);

    // Second torus
    const torus2 = new THREE.Mesh(
        new THREE.TorusGeometry(2.2, 0.015, 16, 100),
        new THREE.MeshBasicMaterial({ color: 0x00FF9D, transparent: true, opacity: 0.15 })
    );
    torus2.rotation.x = Math.PI / 3;
    torus2.rotation.y = Math.PI / 4;
    coreGroup.add(torus2);

    // 4. Particle System (1500 particles)
    const particleCount = 1500;
    const positions = new Float32Array(particleCount * 3);
    const colors = new Float32Array(particleCount * 3);
    const sizes = new Float32Array(particleCount);

    const goldColor = new THREE.Color(0xEAAA00);
    const amberColor = new THREE.Color(0xFF8A00);
    const silverColor = new THREE.Color(0xDDE3E8);

    for (let i = 0; i < particleCount; i++) {
        const theta = Math.random() * Math.PI * 2;
        const phi = Math.acos(2 * Math.random() - 1);
        const r = 2 + Math.random() * 2;

        positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
        positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta);
        positions[i * 3 + 2] = r * Math.cos(phi);

        const colorChoice = Math.random();
        const color = colorChoice < 0.5 ? goldColor : (colorChoice < 0.8 ? amberColor : silverColor);
        colors[i * 3] = color.r;
        colors[i * 3 + 1] = color.g;
        colors[i * 3 + 2] = color.b;

        sizes[i] = 1 + Math.random() * 3;
    }

    const particleGeo = new THREE.BufferGeometry();
    particleGeo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    particleGeo.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    particleGeo.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    // Generate particle texture from canvas
    const canvas = document.createElement('canvas');
    canvas.width = 32;
    canvas.height = 32;
    const ctx = canvas.getContext('2d');
    const gradient = ctx.createRadialGradient(16, 16, 0, 16, 16, 16);
    gradient.addColorStop(0, 'rgba(255, 255, 255, 1)');
    gradient.addColorStop(0.3, 'rgba(255, 255, 255, 0.5)');
    gradient.addColorStop(1, 'rgba(255, 255, 255, 0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 32, 32);
    const particleTexture = new THREE.CanvasTexture(canvas);

    const particleMat = new THREE.PointsMaterial({
        map: particleTexture,
        size: 0.05,
        transparent: true,
        opacity: 0.6,
        vertexColors: true,
        blending: THREE.AdditiveBlending,
        depthWrite: false,
        sizeAttenuation: true
    });

    particles = new THREE.Points(particleGeo, particleMat);
    coreGroup.add(particles);

    // Mouse interaction
    const trackMouse = (e) => {
        if (!container) return;
        const rect = container.getBoundingClientRect();
        if (e.clientX >= rect.left && e.clientX <= rect.right &&
            e.clientY >= rect.top && e.clientY <= rect.bottom) {
            mouseX = ((e.clientX - rect.left) / rect.width - 0.5) * 2;
            mouseY = ((e.clientY - rect.top) / rect.height - 0.5) * 2;
        }
    };
    window.addEventListener('mousemove', trackMouse, { passive: true });

    // Scroll reaction (rotates and subtly floats core on landing scrollytelling)
    window.addEventListener('scroll', () => {
        if (!coreGroup) return;
        const scrollY = window.scrollY || window.pageYOffset || 0;
        coreGroup.rotation.y = scrollY * 0.0025;
        coreGroup.position.y = Math.sin(scrollY * 0.002) * 0.35;
    }, { passive: true });

    // Resize
    window.addEventListener('resize', onResize);
}

// Function to move the neural core renderer between containers (e.g. Hero Showcase <-> Study Chat)
window.mountNeuralCore = function(targetId) {
    const target = document.getElementById(targetId);
    if (!target || !renderer) return;
    if (renderer.domElement.parentElement !== target) {
        target.appendChild(renderer.domElement);
        container = target;
        setTimeout(onResize, 50);
    }
};

function onResize() {
    if (!container || !camera || !renderer) return;
    const w = container.clientWidth;
    const h = container.clientHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h);
}

function animate() {
    requestAnimationFrame(animate);

    const time = clock.getElapsedTime();
    const delta = clock.getDelta();

    if (!coreGroup) return;

    // State-based animations
    const sphereMat = energySphere.material;
    sphereMat.uniforms.uTime.value = time;

    switch (currentState) {
        case 'idle':
            // Smooth crystalline Marigold rotation + mouse parallax
            coreGroup.rotation.y += 0.003;
            coreGroup.rotation.x += 0.001;
            coreGroup.rotation.x += (mouseY * 0.2 - coreGroup.rotation.x) * 0.02;
            coreGroup.rotation.y += (mouseX * 0.3 - coreGroup.rotation.y) * 0.02;
            sphereMat.uniforms.uColor1.value.set(0xEAAA00);
            sphereMat.uniforms.uColor2.value.set(0xFF8A00);
            sphereMat.uniforms.uMorph.value += (0.3 - sphereMat.uniforms.uMorph.value) * 0.05;
            sphereMat.uniforms.uIntensity.value += (1.0 - sphereMat.uniforms.uIntensity.value) * 0.05;
            icosahedron.material.opacity += (0.22 - icosahedron.material.opacity) * 0.05;
            break;

        case 'thinking':
            // High-speed Amber-Aubergine morphing
            coreGroup.rotation.y += 0.015;
            coreGroup.rotation.x += 0.008;
            sphereMat.uniforms.uColor1.value.set(0xFF8A00);
            sphereMat.uniforms.uColor2.value.set(0xEAAA00);
            sphereMat.uniforms.uMorph.value += (0.8 - sphereMat.uniforms.uMorph.value) * 0.1;
            sphereMat.uniforms.uIntensity.value = 1.2 + Math.sin(time * 5) * 0.3;
            icosahedron.material.opacity = 0.35 + Math.sin(time * 3) * 0.15;
            break;

        case 'ready':
            // Brilliant Marigold energy pulse
            coreGroup.rotation.y += 0.005;
            sphereMat.uniforms.uColor1.value.set(0xFFB800);
            sphereMat.uniforms.uColor2.value.set(0xDDE3E8);
            sphereMat.uniforms.uMorph.value += (0.4 - sphereMat.uniforms.uMorph.value) * 0.05;
            sphereMat.uniforms.uIntensity.value = 1.0 + Math.sin(time * 2) * 0.2;
            icosahedron.material.opacity = 0.25 + Math.sin(time * 1.5) * 0.05;
            break;
    }

    // Animate particles orbiting
    const positions = particles.geometry.attributes.position.array;
    for (let i = 0; i < positions.length; i += 3) {
        const x = positions[i];
        const z = positions[i + 2];
        const speed = currentState === 'thinking' ? 0.008 : 0.002;
        const angle = speed;
        positions[i] = x * Math.cos(angle) - z * Math.sin(angle);
        positions[i + 2] = x * Math.sin(angle) + z * Math.cos(angle);
    }
    particles.geometry.attributes.position.needsUpdate = true;

    renderer.render(scene, camera);
}

// Expose state control to the global scope
window.setNeuralCoreState = function(state) {
    currentState = state;
    if (state === 'ready') {
        setTimeout(() => { currentState = 'idle'; }, 5000);
    }
};
