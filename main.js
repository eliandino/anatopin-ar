console.log("main.js successfully loaded");

const startCameraButton = document.querySelector("#start-camera");
const video = document.querySelector("#camera-video");
const statusText = document.querySelector("#status-text");
const statusPill = document.querySelector("#status-pill");
const instructionChip = document.querySelector("#instruction-chip");
const welcomeCard = document.querySelector("#welcome-card");
const app = document.querySelector("#app");

if (!startCameraButton) {
  throw new Error('Missing element: #start-camera');
}

if (!video) {
  throw new Error('Missing element: #camera-video');
}

function updateStatus(message, state = "idle") {
  if (statusText) {
    statusText.textContent = message;
  }

  if (statusPill) {
    statusPill.dataset.state = state;
  }
}

startCameraButton.addEventListener("click", async () => {
  console.log("Start camera button clicked");

  startCameraButton.disabled = true;
  startCameraButton.textContent = "Opening camera…";
  updateStatus("Requesting camera", "loading");

  try {
    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error(
        "Camera API is unavailable. Open this page directly in Chrome over HTTPS."
      );
    }

    const stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        facingMode: {
          ideal: "environment"
        }
      }
    });

    video.srcObject = stream;
    await video.play();

    app?.classList.add("camera-started");
    welcomeCard?.classList.add("is-hidden");

    updateStatus("Camera running", "tracking");

    if (instructionChip) {
      instructionChip.textContent =
        "Camera test successful. Three.js and MediaPipe can now be added.";
    }

    console.log("Camera opened successfully");
  } catch (error) {
    console.error("Camera error:", error);

    updateStatus("Camera unavailable", "error");

    if (instructionChip) {
      instructionChip.textContent =
        `${error.name || "Error"}: ${error.message}`;
    }

    startCameraButton.disabled = false;
    startCameraButton.textContent = "Try camera again";

    alert(`${error.name || "Camera error"}\n\n${error.message}`);
  }
});
