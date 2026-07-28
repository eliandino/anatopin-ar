import * as THREE from "https://esm.sh/three@0.180.0";
import { OrbitControls } from "https://esm.sh/three@0.180.0/examples/jsm/controls/OrbitControls.js";
import {
  FilesetResolver,
  PoseLandmarker
} from "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/+esm";

/*
  AnatoPin AR starter
  -------------------
  This is an educational prototype, not a diagnostic scanner.

  Current MVP:
  - Rear-camera access
  - MediaPipe shoulder/hip tracking
  - Three.js chest anchor
  - Procedural rib cage, heart, lungs, and vessels
  - Heartbeat and blood-flow animation
  - Educational X-ray visualization
  - Detached study mode

  Replace the procedural anatomy with validated GLB models later.
*/

const MODEL_PLANE_Z = -4;
const POSE_INTERVAL_MS = 90;
const SHOULDER_REFERENCE_WIDTH = 1.42;

const app = document.querySelector("#app");
const video = document.querySelector("#camera-video");
const threeRoot = document.querySelector("#three-root");
const welcomeCard = document.querySelector("#welcome-card");
const startCameraButton = document.querySelector("#start-camera");
const xrayButton = document.querySelector("#xray-button");
const liveButton = document.querySelector("#live-button");
const studyButton = document.querySelector("#study-button");
const bpmSlider = document.querySelector("#bpm-slider");
const bpmOutput = document.querySelector("#bpm-output");
const statusPill = document.querySelector("#status-pill");
const statusText = document.querySelector("#status-text");
const instructionChip = document.querySelector("#instruction-chip");

const layerInputs = [...document.querySelectorAll("[data-layer]")];

const state = {
  cameraStarted: false,
  poseReady: false,
  tracking: false,
  xray: false,
  live: false,
  study: false,
  bpm: 72,
  stream: null,
  lastPoseTime: 0,
  lastTrackedTime: 0
};

let poseLandmarker = null;

const scene = new THREE.Scene();

const camera = new THREE.PerspectiveCamera(
  45,
  window.innerWidth / window.innerHeight,
  0.01,
  100
);

camera.position.set(0, 0, 0);

const renderer = new THREE.WebGLRenderer({
  alpha: true,
  antialias: true,
  powerPreference: "high-performance"
});

renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.setClearColor(0x000000, 0);
threeRoot.appendChild(renderer.domElement);

const controls = new OrbitControls(camera, renderer.domElement);
controls.enabled = false;
controls.enableDamping = true;
controls.target.set(0, 0, MODEL_PLANE_Z);
controls.minDistance = 1.8;
controls.maxDistance = 8;

scene.add(new THREE.HemisphereLight(0xbcefff, 0x102030, 2.4));

const keyLight = new THREE.DirectionalLight(0xffffff, 3.2);
keyLight.position.set(2, 4, 3);
scene.add(keyLight);

const rimLight = new THREE.PointLight(0x46dcff, 11, 12);
rimLight.position.set(-2, 0.5, -1);
scene.add(rimLight);

const anatomy = createAnatomy();
scene.add(anatomy.anchor);

const targetTransform = {
  position: new THREE.Vector3(0, -0.15, MODEL_PLANE_Z),
  scale: 1,
  rotationZ: 0,
  rotationY: 0
};

function createAnatomy() {
  const anchor = new THREE.Group();
  anchor.name = "chest-anchor";
  anchor.position.set(0, -0.15, MODEL_PLANE_Z);

  const ribs = createRibCage();
  const lungs = createLungs();
  const heart = createHeart();
  const flow = createBloodFlow();

  anchor.add(ribs, lungs, heart, flow.group);

  return {
    anchor,
    ribs,
    lungs,
    heart,
    flow
  };
}

function createMaterial({
  color,
  emissive = 0x000000,
  opacity = 1,
  roughness = 0.5,
  metalness = 0
}) {
  const material = new THREE.MeshStandardMaterial({
    color,
    emissive,
    emissiveIntensity: 0.3,
    transparent: opacity < 1,
    opacity,
    roughness,
    metalness,
    depthWrite: opacity >= 0.95
  });

  material.userData.baseOpacity = opacity;
  material.userData.baseEmissiveIntensity = 0.3;

  return material;
}

function tubeBetween(points, radius, material, tubularSegments = 40) {
  const curve = new THREE.CatmullRomCurve3(points);
  const geometry = new THREE.TubeGeometry(
    curve,
    tubularSegments,
    radius,
    8,
    false
  );

  return {
    mesh: new THREE.Mesh(geometry, material),
    curve
  };
}

function createRibCage() {
  const group = new THREE.Group();
  group.name = "ribs";
  group.userData.layer = "ribs";

  const boneMaterial = createMaterial({
    color: 0xd9f3f8,
    emissive: 0x3aa9c2,
    opacity: 0.62,
    roughness: 0.62
  });

  for (let index = 0; index < 8; index += 1) {
    const y = 0.58 - index * 0.145;
    const width = 0.58 + index * 0.035;
    const drop = index * 0.012;

    const left = tubeBetween(
      [
        new THREE.Vector3(-0.035, y, 0.14),
        new THREE.Vector3(-width, y - 0.03 - drop, 0.02),
        new THREE.Vector3(-0.32, y - 0.12, -0.23)
      ],
      0.017,
      boneMaterial
    ).mesh;

    const right = tubeBetween(
      [
        new THREE.Vector3(0.035, y, 0.14),
        new THREE.Vector3(width, y - 0.03 - drop, 0.02),
        new THREE.Vector3(0.32, y - 0.12, -0.23)
      ],
      0.017,
      boneMaterial
    ).mesh;

    group.add(left, right);
  }

  const sternum = new THREE.Mesh(
    new THREE.CapsuleGeometry(0.045, 0.72, 8, 16),
    boneMaterial
  );

  sternum.scale.set(0.8, 1, 0.55);
  sternum.position.set(0, 0.05, 0.16);
  group.add(sternum);

  const leftClavicle = tubeBetween(
    [
      new THREE.Vector3(-0.02, 0.75, 0.14),
      new THREE.Vector3(-0.34, 0.82, 0.11),
      new THREE.Vector3(-0.66, 0.73, 0.02)
    ],
    0.023,
    boneMaterial
  ).mesh;

  const rightClavicle = tubeBetween(
    [
      new THREE.Vector3(0.02, 0.75, 0.14),
      new THREE.Vector3(0.34, 0.82, 0.11),
      new THREE.Vector3(0.66, 0.73, 0.02)
    ],
    0.023,
    boneMaterial
  ).mesh;

  group.add(leftClavicle, rightClavicle);

  return group;
}

function createLungs() {
  const group = new THREE.Group();
  group.name = "lungs";
  group.userData.layer = "lungs";

  const lungMaterial = createMaterial({
    color: 0x76c9dd,
    emissive: 0x123f58,
    opacity: 0.28,
    roughness: 0.78
  });

  const geometry = new THREE.SphereGeometry(0.42, 32, 24);

  const leftLung = new THREE.Mesh(geometry, lungMaterial);
  leftLung.position.set(-0.31, 0.02, -0.03);
  leftLung.scale.set(0.72, 1.45, 0.56);

  const rightLung = new THREE.Mesh(geometry, lungMaterial);
  rightLung.position.set(0.34, 0.02, -0.03);
  rightLung.scale.set(0.82, 1.5, 0.58);

  group.add(leftLung, rightLung);
  group.userData.leftLung = leftLung;
  group.userData.rightLung = rightLung;

  return group;
}

function createHeart() {
  const group = new THREE.Group();
  group.name = "heart";
  group.userData.layer = "heart";
  group.position.set(0.08, -0.06, 0.19);
  group.rotation.z = -0.18;

  const heartMaterial = createMaterial({
    color: 0xa91431,
    emissive: 0x5b0718,
    opacity: 0.96,
    roughness: 0.55
  });

  const leftLobe = new THREE.Mesh(
    new THREE.SphereGeometry(0.23, 32, 24),
    heartMaterial
  );

  leftLobe.position.set(-0.1, 0.12, 0);
  leftLobe.scale.set(1, 1.18, 0.78);

  const rightLobe = leftLobe.clone();
  rightLobe.position.x = 0.1;

  const lowerHeart = new THREE.Mesh(
    new THREE.ConeGeometry(0.31, 0.62, 32),
    heartMaterial
  );

  lowerHeart.position.set(0, -0.19, 0);
  lowerHeart.rotation.z = Math.PI;

  group.add(leftLobe, rightLobe, lowerHeart);

  const vesselMaterial = createMaterial({
    color: 0xe85d6a,
    emissive: 0x6d111d,
    opacity: 0.92,
    roughness: 0.5
  });

  const aorta = tubeBetween(
    [
      new THREE.Vector3(0.04, 0.2, 0.02),
      new THREE.Vector3(0.08, 0.48, 0.02),
      new THREE.Vector3(0.26, 0.58, -0.02),
      new THREE.Vector3(0.4, 0.42, -0.08)
    ],
    0.04,
    vesselMaterial,
    48
  ).mesh;

  group.add(aorta);

  return group;
}

function createBloodFlow() {
  const group = new THREE.Group();
  group.name = "flow";
  group.userData.layer = "flow";

  const redCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.56, 0.18, 0.12),
    new THREE.Vector3(-0.18, 0.12, 0.21),
    new THREE.Vector3(0.02, -0.04, 0.25),
    new THREE.Vector3(0.08, 0.22, 0.23),
    new THREE.Vector3(0.2, 0.56, 0.08),
    new THREE.Vector3(0.48, 0.35, -0.08),
    new THREE.Vector3(0.54, -0.54, -0.12)
  ]);

  const blueCurve = new THREE.CatmullRomCurve3([
    new THREE.Vector3(-0.5, -0.58, -0.1),
    new THREE.Vector3(-0.1, -0.22, 0.18),
    new THREE.Vector3(-0.02, 0.02, 0.25),
    new THREE.Vector3(-0.28, 0.16, 0.15),
    new THREE.Vector3(-0.55, 0.28, 0.02),
    new THREE.Vector3(-0.48, 0.58, -0.08)
  ]);

  const redTube = new THREE.Mesh(
    new THREE.TubeGeometry(redCurve, 72, 0.018, 8, false),
    createMaterial({
      color: 0xff365a,
      emissive: 0xbb1230,
      opacity: 0.48,
      roughness: 0.45
    })
  );

  const blueTube = new THREE.Mesh(
    new THREE.TubeGeometry(blueCurve, 72, 0.018, 8, false),
    createMaterial({
      color: 0x2d8cff,
      emissive: 0x0d49a8,
      opacity: 0.48,
      roughness: 0.45
    })
  );

  group.add(redTube, blueTube);

  const particles = [];
  const particleGeometry = new THREE.SphereGeometry(0.027, 10, 8);

  function addParticles(curve, color, count, speed) {
    const material = new THREE.MeshBasicMaterial({
      color,
      transparent: true,
      opacity: 0.95
    });

    material.userData.baseOpacity = 0.95;

    for (let index = 0; index < count; index += 1) {
      const mesh = new THREE.Mesh(particleGeometry, material);
      const offset = index / count;
      mesh.position.copy(curve.getPointAt(offset));
      particles.push({ mesh, curve, offset, speed });
      group.add(mesh);
    }
  }

  addParticles(redCurve, 0xff526d, 18, 0.075);
  addParticles(blueCurve, 0x4f9cff, 15, 0.062);

  return {
    group,
    particles,
    redCurve,
    blueCurve
  };
}

function updateStatus(message, status = "idle") {
  statusText.textContent = message;
  statusPill.dataset.state = status;
}

function updateInstruction(message) {
  instructionChip.textContent = message;
}

function setControlsEnabled(enabled) {
  xrayButton.disabled = !enabled;
  liveButton.disabled = !enabled;
  studyButton.disabled = !enabled;
  bpmSlider.disabled = !enabled;

  layerInputs.forEach((input) => {
    input.disabled = !enabled;
  });
}

async function startCamera() {
  if (state.cameraStarted) return;

  startCameraButton.disabled = true;
  startCameraButton.textContent = "Starting camera…";
  updateStatus("Requesting camera", "loading");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Camera access is not supported in this browser.");
    }

    state.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: { ideal: "environment" },
        width: { ideal: 1280 },
        height: { ideal: 720 }
      }
    });

    video.srcObject = state.stream;
    await video.play();

    state.cameraStarted = true;
    app.classList.add("camera-started");
    welcomeCard.classList.add("is-hidden");
    setControlsEnabled(true);

    updateStatus("Loading body tracking", "loading");
    updateInstruction("Keep shoulders and hips visible.");

    try {
      await initializePoseLandmarker();
      state.poseReady = true;
      updateStatus("Searching for chest", "loading");
    } catch (poseError) {
      console.error("Pose initialization failed:", poseError);
      updateStatus("Manual demo mode", "error");
      updateInstruction(
        "Body tracking failed. The anatomy remains centered in demo mode."
      );
    }
  } catch (error) {
    console.error(error);
    updateStatus("Camera unavailable", "error");
    updateInstruction(error.message || "Camera permission was not granted.");

    startCameraButton.disabled = false;
    startCameraButton.textContent = "Try camera again";
  }
}

async function initializePoseLandmarker() {
  const wasmPath =
    "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@latest/wasm";

  const vision = await FilesetResolver.forVisionTasks(wasmPath);

  const options = {
    baseOptions: {
      modelAssetPath:
        "https://storage.googleapis.com/mediapipe-models/pose_landmarker/pose_landmarker_lite/float16/1/pose_landmarker_lite.task",
      delegate: "GPU"
    },
    runningMode: "VIDEO",
    numPoses: 1,
    minPoseDetectionConfidence: 0.5,
    minPosePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
    outputSegmentationMasks: false
  };

  try {
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options);
  } catch (gpuError) {
    console.warn("GPU pose tracking failed. Retrying on CPU.", gpuError);

    options.baseOptions.delegate = "CPU";
    poseLandmarker = await PoseLandmarker.createFromOptions(vision, options);
  }
}

function getVideoCoverMetrics() {
  const viewportWidth = renderer.domElement.clientWidth;
  const viewportHeight = renderer.domElement.clientHeight;

  const sourceWidth = video.videoWidth || viewportWidth;
  const sourceHeight = video.videoHeight || viewportHeight;

  const scale = Math.max(
    viewportWidth / sourceWidth,
    viewportHeight / sourceHeight
  );

  const renderedWidth = sourceWidth * scale;
  const renderedHeight = sourceHeight * scale;

  return {
    viewportWidth,
    viewportHeight,
    renderedWidth,
    renderedHeight,
    cropX: (renderedWidth - viewportWidth) / 2,
    cropY: (renderedHeight - viewportHeight) / 2
  };
}

function landmarkToScreen(landmark) {
  const metrics = getVideoCoverMetrics();

  return {
    x: landmark.x * metrics.renderedWidth - metrics.cropX,
    y: landmark.y * metrics.renderedHeight - metrics.cropY
  };
}

function screenToWorld(point, zPlane = MODEL_PLANE_Z) {
  const canvas = renderer.domElement;
  const normalizedX = (point.x / canvas.clientWidth) * 2 - 1;
  const normalizedY = -(point.y / canvas.clientHeight) * 2 + 1;

  const worldPoint = new THREE.Vector3(
    normalizedX,
    normalizedY,
    0.5
  ).unproject(camera);

  const direction = worldPoint.sub(camera.position).normalize();
  const distance = (zPlane - camera.position.z) / direction.z;

  return camera.position.clone().add(direction.multiplyScalar(distance));
}

function averageScreenPoint(a, b) {
  return {
    x: (a.x + b.x) / 2,
    y: (a.y + b.y) / 2
  };
}

function mixScreenPoint(a, b, amount) {
  return {
    x: THREE.MathUtils.lerp(a.x, b.x, amount),
    y: THREE.MathUtils.lerp(a.y, b.y, amount)
  };
}

function landmarkIsUsable(landmark) {
  const visibility = landmark.visibility ?? 1;
  const presence = landmark.presence ?? 1;
  return visibility > 0.35 && presence > 0.35;
}

function updateChestTarget(landmarks) {
  const leftShoulderLandmark = landmarks[11];
  const rightShoulderLandmark = landmarks[12];
  const leftHipLandmark = landmarks[23];
  const rightHipLandmark = landmarks[24];

  const requiredLandmarks = [
    leftShoulderLandmark,
    rightShoulderLandmark,
    leftHipLandmark,
    rightHipLandmark
  ];

  if (!requiredLandmarks.every(landmarkIsUsable)) {
    state.tracking = false;
    updateStatus("Show shoulders and hips", "loading");
    updateInstruction("Step back until the chest and waist are visible.");
    return;
  }

  const leftShoulderScreen = landmarkToScreen(leftShoulderLandmark);
  const rightShoulderScreen = landmarkToScreen(rightShoulderLandmark);
  const leftHipScreen = landmarkToScreen(leftHipLandmark);
  const rightHipScreen = landmarkToScreen(rightHipLandmark);

  const shoulderCenterScreen = averageScreenPoint(
    leftShoulderScreen,
    rightShoulderScreen
  );

  const hipCenterScreen = averageScreenPoint(leftHipScreen, rightHipScreen);

  // Move from the shoulder line toward the hip line to approximate the sternum.
  const chestScreen = mixScreenPoint(
    shoulderCenterScreen,
    hipCenterScreen,
    0.34
  );

  const leftShoulderWorld = screenToWorld(leftShoulderScreen);
  const rightShoulderWorld = screenToWorld(rightShoulderScreen);
  const chestWorld = screenToWorld(chestScreen);

  const shoulderWidth = leftShoulderWorld.distanceTo(rightShoulderWorld);
  const scale = THREE.MathUtils.clamp(
    shoulderWidth / SHOULDER_REFERENCE_WIDTH,
    0.45,
    2.4
  );

  const roll = Math.atan2(
    rightShoulderWorld.y - leftShoulderWorld.y,
    rightShoulderWorld.x - leftShoulderWorld.x
  );

  const shoulderDepthDifference =
    (leftShoulderLandmark.z ?? 0) - (rightShoulderLandmark.z ?? 0);

  const yaw = THREE.MathUtils.clamp(
    shoulderDepthDifference * 1.6,
    -0.65,
    0.65
  );

  targetTransform.position.copy(chestWorld);
  targetTransform.scale = scale;
  targetTransform.rotationZ = roll;
  targetTransform.rotationY = yaw;

  state.tracking = true;
  state.lastTrackedTime = performance.now();

  updateStatus("Chest locked", "tracking");
  updateInstruction("Move slowly. Anatomy follows the detected chest.");
}

function detectPose(now) {
  if (
    !state.cameraStarted ||
    !state.poseReady ||
    state.study ||
    video.readyState < 2 ||
    now - state.lastPoseTime < POSE_INTERVAL_MS
  ) {
    return;
  }

  state.lastPoseTime = now;

  try {
    const result = poseLandmarker.detectForVideo(video, now);
    const landmarks = result?.landmarks?.[0];

    if (landmarks) {
      updateChestTarget(landmarks);
    } else {
      state.tracking = false;
      updateStatus("Searching for chest", "loading");
      updateInstruction("Keep the chest centered and improve the lighting.");
    }
  } catch (error) {
    console.warn("Pose frame failed:", error);
  }
}

function smoothAnchor() {
  if (state.study) return;

  anatomy.anchor.position.lerp(targetTransform.position, 0.18);

  const nextScale = THREE.MathUtils.lerp(
    anatomy.anchor.scale.x,
    targetTransform.scale,
    0.16
  );

  anatomy.anchor.scale.setScalar(nextScale);

  anatomy.anchor.rotation.z = THREE.MathUtils.lerp(
    anatomy.anchor.rotation.z,
    targetTransform.rotationZ,
    0.16
  );

  anatomy.anchor.rotation.y = THREE.MathUtils.lerp(
    anatomy.anchor.rotation.y,
    targetTransform.rotationY,
    0.12
  );
}

function gaussianPulse(value, center, width) {
  const distance = (value - center) / width;
  return Math.exp(-(distance * distance));
}

function updateLiveAnatomy(elapsedSeconds, deltaSeconds) {
  const beatsPerSecond = state.bpm / 60;
  const cycle = (elapsedSeconds * beatsPerSecond) % 1;

  let heartScale = 1;
  let breath = 0;

  if (state.live) {
    const primaryBeat = gaussianPulse(cycle, 0.08, 0.05);
    const secondaryBeat = gaussianPulse(cycle, 0.25, 0.065);

    heartScale = 1 + primaryBeat * 0.1 + secondaryBeat * 0.045;
    breath = (Math.sin(elapsedSeconds * 1.35) + 1) * 0.5;
  }

  anatomy.heart.scale.set(
    heartScale,
    1 + (heartScale - 1) * 0.86,
    heartScale
  );

  const leftLung = anatomy.lungs.userData.leftLung;
  const rightLung = anatomy.lungs.userData.rightLung;
  const lungExpansion = 1 + breath * 0.035;

  leftLung.scale.set(0.72 * lungExpansion, 1.45 * lungExpansion, 0.56);
  rightLung.scale.set(0.82 * lungExpansion, 1.5 * lungExpansion, 0.58);

  anatomy.flow.particles.forEach((particle) => {
    if (state.live) {
      particle.offset =
        (particle.offset + particle.speed * deltaSeconds) % 1;
    }

    particle.mesh.position.copy(particle.curve.getPointAt(particle.offset));
  });
}

function setXrayMode(enabled) {
  state.xray = enabled;
  app.classList.toggle("xray-mode", enabled);
  xrayButton.setAttribute("aria-pressed", String(enabled));

  anatomy.anchor.traverse((object) => {
    if (!object.isMesh || !object.material) return;

    const materials = Array.isArray(object.material)
      ? object.material
      : [object.material];

    materials.forEach((material) => {
      if ("opacity" in material) {
        const baseOpacity = material.userData.baseOpacity ?? material.opacity;
        material.opacity = enabled
          ? THREE.MathUtils.clamp(baseOpacity * 1.18, 0.34, 1)
          : baseOpacity;
        material.transparent = material.opacity < 1;
        material.depthWrite = material.opacity >= 0.95;
      }

      if ("emissiveIntensity" in material) {
        material.emissiveIntensity = enabled
          ? 1.15
          : material.userData.baseEmissiveIntensity ?? 0.3;
      }

      material.needsUpdate = true;
    });
  });
}

function setLiveMode(enabled) {
  state.live = enabled;
  liveButton.setAttribute("aria-pressed", String(enabled));
  liveButton.textContent = enabled ? "Pause live" : "Play live";
}

function setStudyMode(enabled) {
  state.study = enabled;
  app.classList.toggle("study-mode", enabled);
  studyButton.setAttribute("aria-pressed", String(enabled));
  studyButton.textContent = enabled ? "Return to AR" : "Study view";

  controls.enabled = enabled;

  if (enabled) {
    anatomy.anchor.position.set(0, -0.08, MODEL_PLANE_Z);
    anatomy.anchor.scale.setScalar(1.28);
    anatomy.anchor.rotation.set(0, 0, 0);

    camera.position.set(0, 0.05, 0);
    camera.rotation.set(0, 0, 0);
    controls.target.set(0, -0.05, MODEL_PLANE_Z);
    controls.update();

    updateStatus("Study view", "tracking");
    updateInstruction("Drag to rotate. Pinch or scroll to zoom.");
  } else {
    controls.enabled = false;
    camera.position.set(0, 0, 0);
    camera.rotation.set(0, 0, 0);
    camera.quaternion.identity();
    camera.updateProjectionMatrix();

    updateStatus(
      state.tracking ? "Chest locked" : "Searching for chest",
      state.tracking ? "tracking" : "loading"
    );
    updateInstruction("Keep the chest centered and move slowly.");
  }
}

function setLayerVisibility(layerName, visible) {
  const layer = anatomy[layerName] ?? anatomy.flow?.group;

  if (layerName === "flow") {
    anatomy.flow.group.visible = visible;
    return;
  }

  if (layer) {
    layer.visible = visible;
  }
}

function onResize() {
  const width = window.innerWidth;
  const height = window.innerHeight;

  camera.aspect = width / height;
  camera.updateProjectionMatrix();

  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
  renderer.setSize(width, height);
}

startCameraButton.addEventListener("click", startCamera);

xrayButton.addEventListener("click", () => {
  setXrayMode(!state.xray);
});

liveButton.addEventListener("click", () => {
  setLiveMode(!state.live);
});

studyButton.addEventListener("click", () => {
  setStudyMode(!state.study);
});

bpmSlider.addEventListener("input", (event) => {
  state.bpm = Number(event.target.value);
  bpmOutput.value = `${state.bpm} BPM`;
  bpmOutput.textContent = `${state.bpm} BPM`;
});

layerInputs.forEach((input) => {
  input.addEventListener("change", () => {
    setLayerVisibility(input.dataset.layer, input.checked);
  });
});

window.addEventListener("resize", onResize);

window.addEventListener("pagehide", () => {
  state.stream?.getTracks().forEach((track) => track.stop());
  poseLandmarker?.close?.();
});

setControlsEnabled(false);
updateStatus("Camera off", "idle");

const clock = new THREE.Clock();
let elapsedSeconds = 0;

function animate(now) {
  requestAnimationFrame(animate);

  const deltaSeconds = Math.min(clock.getDelta(), 0.05);
  elapsedSeconds += deltaSeconds;

  detectPose(now);
  smoothAnchor();

  if (controls.enabled) {
    controls.update();
  }

  updateLiveAnatomy(elapsedSeconds, deltaSeconds);
  renderer.render(scene, camera);
}

requestAnimationFrame(animate);
