// ---------- THREE.js setup ----------
const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x87ceeb, 5, 120);

const camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.1, 1000);
camera.position.set(0, 3, -7);

const light = new THREE.DirectionalLight(0xffffff, 1);
light.position.set(5, 10, 5);
scene.add(light);

// ---------- Terrain & road ----------
function createTerrain() {
    const geo = new THREE.BoxGeometry(400, 1, 400);
    const mat = new THREE.MeshLambertMaterial({ color: 0x1f8a3d });
    const terrain = new THREE.Mesh(geo, mat);
    terrain.position.set(0, -0.5, 0);
    scene.add(terrain);
}
createTerrain();

let roadSegments = [];
function createRoad(zPos) {
    const geo = new THREE.BoxGeometry(10, 0.12, 60);
    const mat = new THREE.MeshLambertMaterial({ color: 0x333333 });
    const r = new THREE.Mesh(geo, mat);
    r.position.set(0, 0, zPos);
    scene.add(r);
    roadSegments.push(r);
}
for (let i = 0; i < 6; i++) createRoad(i * 60);

// ---------- Car factory ----------
let car = null;
let currentCarStats = {};

function makeCar(type) {
    const group = new THREE.Group();

    let bodyColor;
    if (type === "audi") bodyColor = 0x3b82f6;
    if (type === "bugatti") bodyColor = 0xf97316;
    if (type === "ferrari") bodyColor = 0xef4444;
    if (type === "mercedes") bodyColor = 0x9ca3af;

    // body
    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.5, 2.6),
        new THREE.MeshLambertMaterial({ color: bodyColor })
    );
    body.position.y = 0.5;
    group.add(body);

    // cabin
    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1.0, 0.38, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    cabin.position.set(0, 0.88, -0.15);
    group.add(cabin);

    // wheels
    function wheel(x, z) {
        const w = new THREE.Mesh(
            new THREE.CylinderGeometry(0.28, 0.28, 0.35, 12),
            new THREE.MeshLambertMaterial({ color: 0x000000 })
        );
        w.rotation.z = Math.PI / 2;
        w.position.set(x, 0.25, z);
        return w;
    }
    group.add(wheel(0.7, 1.05));
    group.add(wheel(-0.7, 1.05));
    group.add(wheel(0.7, -1.05));
    group.add(wheel(-0.7, -1.05));

    // spoiler (small)
    const spoiler = new THREE.Mesh(
        new THREE.BoxGeometry(0.8, 0.05, 0.15),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    spoiler.position.set(0, 0.75, 1.1);
    group.add(spoiler);

    return group;
}

function spawnCar(type) {
    if (car) scene.remove(car);
    car = makeCar(type);
    car.position.set(0, 0.5, 2);
    scene.add(car);

    // stats by type (tuned)
    const stats = {
        audi: { maxSpeed: 0.55, accel: 0.012, handling: 0.04, driftFactor: 0.96, nitroBoost: 1.7 },
        bugatti: { maxSpeed: 0.85, accel: 0.016, handling: 0.035, driftFactor: 0.93, nitroBoost: 1.9 },
        ferrari: { maxSpeed: 0.75, accel: 0.015, handling: 0.045, driftFactor: 0.94, nitroBoost: 1.8 },
        mercedes: { maxSpeed: 0.65, accel: 0.013, handling: 0.05, driftFactor: 0.97, nitroBoost: 1.6 }
    };
    currentCarStats = stats[type] || stats.audi;

    // reset dynamics
    currentSpeed = 0;
    xVel = 0;
    nitroReady = true;
    nitroActive = false;
    nitroCooldown = 0;
    updateNitroHUD();
}

// ---------- Controls & dynamics ----------
let keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

// mobile buttons
const leftBtn = document.getElementById("leftBtn");
const rightBtn = document.getElementById("rightBtn");
const boostBtn = document.getElementById("boostBtn");

let mobileLeft = false, mobileRight = false, mobileBoost = false;
leftBtn.addEventListener("touchstart", () => mobileLeft = true);
leftBtn.addEventListener("touchend", () => mobileLeft = false);
rightBtn.addEventListener("touchstart", () => mobileRight = true);
rightBtn.addEventListener("touchend", () => mobileRight = false);
boostBtn.addEventListener("touchstart", () => mobileBoost = true);
boostBtn.addEventListener("touchend", () => mobileBoost = false);

// hud elements
const speedEl = document.getElementById("speedometer");
const nitroEl = document.getElementById("nitro");
function updateSpeedHUD() {
    const kmh = Math.round(currentSpeed * 300); // arbitrary scale for feel
    speedEl.innerText = `${kmh} km/h`;
}
function updateNitroHUD() {
    nitroEl.innerText = nitroActive ? "Nitro: ACTIVE" : (nitroReady ? "Nitro: Ready" : `Nitro: cooldown ${Math.ceil(nitroCooldown)}s`);
}

// physics vars
let currentSpeed = 0;
let xVel = 0;
let speed = 0.45; // base used for road movement

// nitro
let nitroReady = true;
let nitroActive = false;
let nitroDuration = 2.0; // seconds
let nitroTimer = 0;
let nitroCooldown = 0;

// drift
let isDrifting = false;

// ---------- Input helpers ----------
function isLeft() {
    return keys["arrowleft"] || keys["a"] || mobileLeft;
}
function isRight() {
    return keys["arrowright"] || keys["d"] || mobileRight;
}
function isDriftKey() {
    return keys["shift"] || keys["shiftleft"] || keys["shiftright"];
}
function isNitroKey() {
    return keys[" "] || mobileBoost; // space or mobile boost
}

// ---------- Update car dynamics ----------
function updateCar() {
    if (!car) return;

    // acceleration toward target maxSpeed
    let targetMax = currentCarStats.maxSpeed * (nitroActive ? currentCarStats.nitroBoost : 1);
    if (currentSpeed < targetMax) {
        currentSpeed += currentCarStats.accel;
        if (currentSpeed > targetMax) currentSpeed = targetMax;
    } else {
        // natural friction
        currentSpeed *= 0.995;
        if (currentSpeed < 0.01) currentSpeed = 0;
    }

    // steering
    const handling = currentCarStats.handling * (isDriftKey() ? 1.4 : 1.0);
    if (isLeft()) xVel -= handling;
    if (isRight()) xVel += handling;

    // drift behavior
    isDrifting = isDriftKey();
    if (isDrifting) {
        // while drift: reduce friction sideways and slight speed penalty
        xVel *= 0.975;
        currentSpeed *= currentCarStats.driftFactor;
    } else {
        xVel *= 0.85;
    }

    // clamp lateral position
    car.position.x += xVel;
    if (car.position.x > 4.2) car.position.x = 4.2;
    if (car.position.x < -4.2) car.position.x = -4.2;

    // move road segments backwards (simulate forward movement)
    for (let i = 0; i < roadSegments.length; i++) {
        let r = roadSegments[i];
        r.position.z += currentSpeed * 60; // scale to make movement visible

        if (r.position.z > 120) {
            r.position.z -= roadSegments.length * 60;
        }
    }

    // camera
    camera.position.x += (car.position.x * 0.6 - camera.position.x) * 0.08;
    camera.position.z = car.position.z - 7;
    camera.position.y = 2.6;
    camera.lookAt(car.position.x, car.position.y, car.position.z + 10);

    // nitro logic
    if (isNitroKey() && nitroReady && !nitroActive) {
        nitroActive = true;
        nitroTimer = nitroDuration;
        nitroReady = false;
    }
    if (nitroActive) {
        nitroTimer -= deltaTime;
        if (nitroTimer <= 0) {
            nitroActive = false;
            nitroCooldown = 5.0; // cooldown seconds
        }
    } else if (!nitroReady) {
        nitroCooldown -= deltaTime;
        if (nitroCooldown <= 0) {
            nitroReady = true;
            nitroCooldown = 0;
        }
    }
    updateSpeedHUD();
    updateNitroHUD();
}

// ---------- Car selection wiring ----------
document.querySelectorAll(".carBtn").forEach(btn => {
    btn.addEventListener("click", () => {
        const choice = btn.getAttribute("data-car");
        spawnCar(choice);
        document.getElementById("carSelectMenu").style.display = "none";
    });
});

// ---------- Animation loop ----------
let lastTime = performance.now();
let deltaTime = 0;

function animate() {
    requestAnimationFrame(animate);
    let now = performance.now();
    deltaTime = (now - lastTime) / 1000;
    lastTime = now;

    updateCar();
    renderer.render(scene, camera);
}
animate();

// ---------- Start with a default car visible (menu shows until pick) ----------
spawnCar("audi");

// ---------- Resize handler ----------
window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});
