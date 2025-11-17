// ============================================
//  BASIC THREE.JS SETUP
// ============================================

const canvas = document.getElementById("game");
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setClearAlpha(1);

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x87ceeb); // sky
scene.fog = new THREE.Fog(0x87ceeb, 20, 180);

const camera = new THREE.PerspectiveCamera(
    70, window.innerWidth / window.innerHeight, 0.1, 1000
);
camera.position.set(0, 3, -7);

// ============================================
//  LIGHTING
// ============================================

const ambient = new THREE.AmbientLight(0xffffff, 0.6);
scene.add(ambient);

const sun = new THREE.DirectionalLight(0xffffff, 1.1);
sun.position.set(50, 100, -20);
scene.add(sun);

// ============================================
//  SKYDOME (OPTIONAL, but makes game pretty)
// ============================================

function makeSky() {
    const geo = new THREE.SphereGeometry(500, 32, 32);
    const mat = new THREE.MeshBasicMaterial({
        color: 0x87ceeb,
        side: THREE.BackSide
    });
    const sky = new THREE.Mesh(geo, mat);
    scene.add(sky);
}
makeSky();

// ============================================
//  TERRAIN / GROUND
// ============================================

function createTerrain() {
    const geo = new THREE.BoxGeometry(500, 1, 500);
    const mat = new THREE.MeshPhongMaterial({
        color: 0x2a963f,
        shininess: 5,
        specular: 0x003300
    });
    const ground = new THREE.Mesh(geo, mat);
    ground.position.set(0, -0.5, 0);
    scene.add(ground);
}
createTerrain();

// ============================================
//  ROAD
// ============================================

let roadSegments = [];

function createRoad(zPos) {
    const geo = new THREE.BoxGeometry(10, 0.12, 60);
    const mat = new THREE.MeshPhongMaterial({
        color: 0x2f2f2f,
        shininess: 10,
        specular: 0x111111
    });
    const road = new THREE.Mesh(geo, mat);
    road.position.set(0, 0, zPos);
    scene.add(road);
    roadSegments.push(road);
}

for (let i = 0; i < 6; i++) createRoad(i * 60);

// ============================================
//  CAR BUILDER
// ============================================

let car = null;
let currentCarStats = {};

function carColor(type) {
    return {
        audi: 0x3b82f6,
        bugatti: 0xf97316,
        ferrari: 0xef4444,
        mercedes: 0x9ca3af
    }[type] || 0xffffff;
}

function makeCar(type) {
    const group = new THREE.Group();
    const color = carColor(type);

    const body = new THREE.Mesh(
        new THREE.BoxGeometry(1.4, 0.5, 2.6),
        new THREE.MeshLambertMaterial({ color })
    );
    body.position.y = 0.5;
    group.add(body);

    const cabin = new THREE.Mesh(
        new THREE.BoxGeometry(1, 0.4, 1.2),
        new THREE.MeshLambertMaterial({ color: 0x111111 })
    );
    cabin.position.set(0, 0.88, -0.15);
    group.add(cabin);

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

    return group;
}

function spawnCar(type) {
    if (car) scene.remove(car);
    car = makeCar(type);
    car.position.set(0, 0.5, 2);
    scene.add(car);

    const stats = {
        audi:     { maxSpeed: 0.55, accel: 0.012, handling: 0.04, drift: 0.96, nitro: 1.6 },
        bugatti:  { maxSpeed: 0.85, accel: 0.016, handling: 0.035, drift: 0.93, nitro: 2.0 },
        ferrari:  { maxSpeed: 0.75, accel: 0.015, handling: 0.045, drift: 0.94, nitro: 1.8 },
        mercedes: { maxSpeed: 0.65, accel: 0.013, handling: 0.05, drift: 0.97, nitro: 1.5 }
    };

    currentCarStats = stats[type];
}

// ============================================
//  CAR CONTROLS / PHYSICS
// ============================================

let keys = {};
document.addEventListener("keydown", e => keys[e.key.toLowerCase()] = true);
document.addEventListener("keyup", e => keys[e.key.toLowerCase()] = false);

let xVel = 0;
let currentSpeed = 0;
let nitroReady = true;
let nitroActive = false;
let nitroTimer = 0;
let nitroCooldown = 0;

function updateCar(delta) {
    if (!car) return;

    let targetMax = currentCarStats.maxSpeed;
    if (nitroActive) targetMax *= currentCarStats.nitro;

    if (currentSpeed < targetMax) {
        currentSpeed += currentCarStats.accel;
    } else {
        currentSpeed *= 0.996;
    }

    // steering
    if (keys["arrowleft"] || keys["a"]) xVel -= currentCarStats.handling;
    if (keys["arrowright"] || keys["d"]) xVel += currentCarStats.handling;

    xVel *= 0.9;
    car.position.x += xVel;

    if (car.position.x > 4.2) car.position.x = 4.2;
    if (car.position.x < -4.2) car.position.x = -4.2;

    // road movement (MAKE CAR FEEL FAST)
    roadSegments.forEach(r => {
        r.position.z += currentSpeed * 120;  // fast ✔

        if (r.position.z > 90) {
            r.position.z -= 360;
        }
    });

    // camera follow + bob
    camera.position.x += (car.position.x * 0.6 - camera.position.x) * 0.08;
    camera.position.z = -7;
    camera.position.y = 2.6 + Math.sin(performance.now() * 0.004) * 0.05;

    camera.lookAt(car.position.x, 0.8, 10);

    // nitro
    if ((keys[" "] || keys["shift"]) && nitroReady) {
        nitroActive = true;
        nitroReady = false;
        nitroTimer = 2;
    }

    if (nitroActive) {
        nitroTimer -= delta;
        if (nitroTimer <= 0) {
            nitroActive = false;
            nitroCooldown = 5;
        }
    } else if (!nitroReady) {
        nitroCooldown -= delta;
        if (nitroCooldown <= 0) {
            nitroReady = true;
        }
    }
}

// ============================================
//  CAR SELECT MENU
// ============================================

document.querySelectorAll(".carBtn").forEach(btn => {
    btn.addEventListener("click", () => {
        spawnCar(btn.dataset.car);
        document.getElementById("carSelectMenu").style.display = "none";
    });
});

// default
spawnCar("audi");

// ============================================
//  MAIN LOOP
// ============================================

let last = performance.now();
function animate() {
    let now = performance.now();
    let delta = (now - last) / 1000;
    last = now;

    updateCar(delta);
    renderer.render(scene, camera);

    requestAnimationFrame(animate);
}
animate();

// ============================================
//  RESIZE
// ============================================
window.addEventListener("resize", () => {
    renderer.setSize(window.innerWidth, window.innerHeight);
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
});

