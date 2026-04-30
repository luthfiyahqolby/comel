import "./styles.css";
import { directions, getDirectionById, type DirectionData, type GestureDirectionId } from "./data/directions";
import {
  getNavigationById,
  mapGestureToNavigation,
  navigationCommands,
  type NavigationCommand,
  type NavigationCommandId
} from "./data/navigation";
import { createZaydScene } from "./scene/createZaydScene";
import { GestureController } from "./gesture/GestureController";

type GestureMode = "lesson" | "navigation";
type PanelId = "material" | "directions" | "navigation";

const app = mustGet<HTMLDivElement>("app");
const toggleSidebarBtn = mustGet<HTMLButtonElement>("toggleSidebarBtn");
const directionList = mustGet<HTMLDivElement>("directionList");
const navigationList = mustGet<HTMLDivElement>("navigationList");
const arabicWord = mustGet<HTMLParagraphElement>("arabicWord");
const latinWord = mustGet<HTMLParagraphElement>("latinWord");
const indoMeaning = mustGet<HTMLParagraphElement>("indoMeaning");
const lessonHint = mustGet<HTMLParagraphElement>("lessonHint");
const sourceBadge = mustGet<HTMLSpanElement>("sourceBadge");
const feedbackToast = mustGet<HTMLDivElement>("feedbackToast");
const movementCaption = mustGet<HTMLDivElement>("movementCaption");
const fullscreenBtn = mustGet<HTMLButtonElement>("fullscreenBtn");
const canvasShell = mustGet<HTMLDivElement>("canvasShell");
const resetBtn = mustGet<HTMLButtonElement>("resetBtn");
const soundBtn = mustGet<HTMLButtonElement>("soundBtn");
const gestureVideo = mustGet<HTMLVideoElement>("gestureVideo");
const startGestureBtn = mustGet<HTMLButtonElement>("startGestureBtn");
const stopGestureBtn = mustGet<HTMLButtonElement>("stopGestureBtn");
const gestureStatus = mustGet<HTMLParagraphElement>("gestureStatus");
const cameraPlaceholder = mustGet<HTMLDivElement>("cameraPlaceholder");
const lessonModeBtn = mustGet<HTMLButtonElement>("lessonModeBtn");
const navigationModeBtn = mustGet<HTMLButtonElement>("navigationModeBtn");
const menuMaterialBtn = mustGet<HTMLButtonElement>("menuMaterialBtn");
const menuDirectionsBtn = mustGet<HTMLButtonElement>("menuDirectionsBtn");
const menuNavigationBtn = mustGet<HTMLButtonElement>("menuNavigationBtn");
const materialPanel = mustGet<HTMLElement>("materialPanel");
const directionsPanel = mustGet<HTMLElement>("directionsPanel");
const navigationPanel = mustGet<HTMLElement>("navigationPanel");
const canvas = mustGet<HTMLCanvasElement>("renderCanvas");

const zaydScene = createZaydScene(canvas);
let activeDirection: GestureDirectionId = "right";
let activeNavigation: NavigationCommandId = "walkForward";
let activeMode: GestureMode = "lesson";
let activePanel: PanelId = "material";
let soundEnabled = true;
let sidebarVisible = true;
let gestureController: GestureController | null = null;
let toastTimer = 0;

renderDirectionMenu();
renderNavigationMenu();
switchPanel("material");
activateMode("lesson");
showWelcome();

resetBtn.addEventListener("click", () => {
  zaydScene.reset();
  showFeedback("Zayd kembali ke titik awal.");
});

soundBtn.addEventListener("click", () => {
  soundEnabled = !soundEnabled;
  soundBtn.textContent = `Suara: ${soundEnabled ? "ON" : "OFF"}`;
  soundBtn.classList.toggle("active", soundEnabled);
  soundBtn.setAttribute("aria-pressed", String(soundEnabled));
});

fullscreenBtn.addEventListener("click", async () => {
  try {
    if (document.fullscreenElement) {
      await document.exitFullscreen();
    } else {
      await canvasShell.requestFullscreen();
    }
  } catch {
    showFeedback("Mode full screen tidak bisa diaktifkan di browser ini.");
  }
});

document.addEventListener("fullscreenchange", () => {
  const isFullscreen = document.fullscreenElement === canvasShell;
  fullscreenBtn.textContent = isFullscreen ? "Keluar Full Screen" : "Full Screen 3D";
  setTimeout(() => zaydScene.engine.resize(), 120);
});

toggleSidebarBtn.addEventListener("click", () => {
  sidebarVisible = !sidebarVisible;
  app.classList.toggle("sidebar-hidden", !sidebarVisible);
  toggleSidebarBtn.setAttribute("aria-expanded", String(sidebarVisible));
  toggleSidebarBtn.setAttribute("aria-label", sidebarVisible ? "Sembunyikan menu" : "Tampilkan menu");
  toggleSidebarBtn.textContent = sidebarVisible ? "☰" : "☰ Menu";

  // Saat sidebar disembunyikan, kamera benar-benar dimatikan agar privasi lebih aman.
  if (!sidebarVisible && gestureController) {
    stopGestureCamera();
    setGestureStatus("Sidebar disembunyikan. Kamera otomatis dimatikan.", "info");
  }

  setTimeout(() => zaydScene.engine.resize(), 220);
});

menuMaterialBtn.addEventListener("click", () => switchPanel("material"));
menuDirectionsBtn.addEventListener("click", () => switchPanel("directions"));
menuNavigationBtn.addEventListener("click", () => switchPanel("navigation"));
lessonModeBtn.addEventListener("click", () => activateMode("lesson"));
navigationModeBtn.addEventListener("click", () => activateMode("navigation"));

startGestureBtn.addEventListener("click", async () => {
  startGestureBtn.disabled = true;
  try {
    gestureController = new GestureController({
      video: gestureVideo,
      onGesture: handleGesture,
      onStatus: setGestureStatus
    });
    await gestureController.start();
    stopGestureBtn.disabled = false;
    cameraPlaceholder.classList.add("hidden");
    setGestureStatus(
      `Gesture aktif. Model pose statis. Mode saat ini: ${activeMode === "lesson" ? "8 Arah" : "Petunjuk Berjalan"}.`,
      "success"
    );
  } catch (error) {
    const message = error instanceof Error ? error.message : "Gesture gagal diaktifkan.";
    setGestureStatus(message, "error");
    startGestureBtn.disabled = false;
    stopGestureBtn.disabled = true;
  }
});

stopGestureBtn.addEventListener("click", () => stopGestureCamera());

window.addEventListener("beforeunload", () => {
  gestureController?.stop();
  zaydScene.dispose();
});

function renderDirectionMenu(): void {
  directionList.innerHTML = "";

  directions.forEach((direction) => {
    const button = document.createElement("button");
    button.className = "direction-card";
    button.type = "button";
    button.dataset.direction = direction.id;
    button.innerHTML = `
      <span class="direction-emoji">${direction.emoji}</span>
      <span class="direction-content">
        <span class="direction-arabic" dir="rtl">${direction.arabic}</span>
        <span class="direction-meta">${direction.meaning} · <em>${direction.latin}</em></span>
        <span class="direction-gesture">${direction.gesture}</span>
      </span>
      <span class="command-chip">${direction.commandLabel}</span>
    `;
    button.addEventListener("click", () => {
      switchPanel("directions");
      activateMode("lesson");
      runDirection(direction.id, "Manual");
    });
    directionList.appendChild(button);
  });
}

function renderNavigationMenu(): void {
  navigationList.innerHTML = "";
  navigationCommands.forEach((command) => {
    const button = document.createElement("button");
    button.className = "direction-card nav-card";
    button.type = "button";
    button.dataset.navigation = command.id;
    button.innerHTML = `
      <span class="direction-emoji">${command.emoji}</span>
      <span class="direction-content">
        <span class="direction-arabic" dir="rtl">${command.arabic}</span>
        <span class="direction-meta">${command.meaning} · <em>${command.latin}</em></span>
        <span class="direction-gesture">${command.gesture}</span>
      </span>
      <span class="command-chip">${command.commandLabel}</span>
    `;
    button.addEventListener("click", () => {
      switchPanel("navigation");
      activateMode("navigation");
      runNavigation(command.id, "Manual");
    });
    navigationList.appendChild(button);
  });
}

function switchPanel(panel: PanelId): void {
  activePanel = panel;
  materialPanel.classList.toggle("active-panel", panel === "material");
  directionsPanel.classList.toggle("active-panel", panel === "directions");
  navigationPanel.classList.toggle("active-panel", panel === "navigation");

  const entries: Array<[PanelId, HTMLButtonElement]> = [
    ["material", menuMaterialBtn],
    ["directions", menuDirectionsBtn],
    ["navigation", menuNavigationBtn]
  ];

  entries.forEach(([id, button]) => {
    button.classList.toggle("active", id === panel);
    button.setAttribute("aria-pressed", String(id === panel));
  });

  if (panel === "directions") activateMode("lesson");
  if (panel === "navigation") activateMode("navigation");
  if (panel === "material") showWelcome();
}

function activateMode(mode: GestureMode): void {
  activeMode = mode;
  lessonModeBtn.classList.toggle("active", mode === "lesson");
  navigationModeBtn.classList.toggle("active", mode === "navigation");
  lessonModeBtn.setAttribute("aria-pressed", String(mode === "lesson"));
  navigationModeBtn.setAttribute("aria-pressed", String(mode === "navigation"));

  setGestureStatus(`Mode gesture: ${mode === "lesson" ? "8 Arah" : "Petunjuk Berjalan"}. Gunakan pose statis, tahan ±0,65 detik.`, "info");
}

function handleGesture(gesture: GestureDirectionId): void {
  if (activeMode === "lesson") {
    switchPanel("directions");
    if (gesture === "front") {
      showMovementCaption("Gesture terbaca: DEPAN / MAJU. Zayd bergerak maju ke depan.", "success");
    } else if (gesture === "back") {
      showMovementCaption("Gesture terbaca: BELAKANG / MUNDUR. Zayd bergerak mundur ke belakang.", "success");
    }
    runDirection(gesture, "Gesture");
    return;
  }

  const command = mapGestureToNavigation(gesture);
  if (!command) {
    showFeedback("Gesture ini tidak dipakai pada mode petunjuk berjalan.");
    setGestureStatus("Untuk berjalan, gunakan kanan, kiri, atas, bawah, maju, atau mundur.", "warning");
    return;
  }
  switchPanel("navigation");
  if (command === "walkForward") {
    showMovementCaption("Gesture terbaca: MAJU. Zayd berjalan maju.", "success");
    setGestureStatus("Gesture maju terbaca: telapak terbuka stabil. Zayd berjalan maju.", "success");
  } else if (command === "walkBackward") {
    showMovementCaption("Gesture terbaca: MUNDUR. Zayd berjalan mundur.", "success");
    setGestureStatus("Gesture mundur terbaca: kepal tangan stabil. Zayd berjalan mundur.", "success");
  }
  runNavigation(command, "Gesture");
}

function runDirection(directionId: GestureDirectionId, source: "Manual" | "Gesture"): void {
  const direction = getDirectionById(directionId);
  activeDirection = directionId;
  updateLessonHud(direction, source, "Section 2 · 8 Arah");
  updateActiveMenu();
  zaydScene.playDirection(directionId);
  showFeedback(`${direction.arabic} = ${direction.meaning}`);

  if (soundEnabled) speakArabic(direction.arabic);
}

function runNavigation(commandId: NavigationCommandId, source: "Manual" | "Gesture"): void {
  const command = getNavigationById(commandId);
  activeNavigation = commandId;
  updateNavigationHud(command, source);
  updateActiveMenu();
  zaydScene.playNavigation(commandId);
  showFeedback(`${command.arabic} = ${command.meaning}`);

  if (soundEnabled) speakArabic(command.arabic);
}

function updateLessonHud(item: DirectionData, source: "Manual" | "Gesture", sectionLabel: string): void {
  arabicWord.textContent = item.arabic;
  latinWord.textContent = item.latin;
  indoMeaning.textContent = `${item.meaning} · ${sectionLabel}`;
  lessonHint.textContent = `${item.hint} Gesture: ${item.gesture}.`;
  sourceBadge.textContent = source;
  sourceBadge.classList.toggle("gesture", source === "Gesture");
}

function updateNavigationHud(item: NavigationCommand, source: "Manual" | "Gesture"): void {
  arabicWord.textContent = item.arabic;
  latinWord.textContent = item.latin;
  indoMeaning.textContent = `${item.meaning} · Section 3 · Petunjuk Berjalan`;
  lessonHint.textContent = `${item.hint} Gesture: ${item.gesture}.`;
  sourceBadge.textContent = source;
  sourceBadge.classList.toggle("gesture", source === "Gesture");
}

function updateActiveMenu(): void {
  document.querySelectorAll<HTMLButtonElement>(".direction-card").forEach((card) => {
    card.classList.toggle(
      "active",
      (activePanel === "directions" && card.dataset.direction === activeDirection) ||
        (activePanel === "navigation" && card.dataset.navigation === activeNavigation)
    );
  });
}

function showWelcome(): void {
  arabicWord.textContent = "مَرْحَبًا";
  latinWord.textContent = "marḥaban";
  indoMeaning.textContent = "Selamat belajar bersama Zayd · Section 1 · Materi";
  lessonHint.textContent = "Gunakan menu 8 Arah untuk posisi dasar atau Petunjuk Berjalan untuk instruksi bergerak.";
  sourceBadge.textContent = "Materi";
  sourceBadge.classList.remove("gesture");
  showMovementCaption("Menunggu gesture maju/mundur...", "info");
}

function showMovementCaption(message: string, tone: "info" | "success" | "warning" = "info"): void {
  movementCaption.textContent = message;
  movementCaption.dataset.tone = tone;
}

function showFeedback(message: string): void {
  feedbackToast.textContent = message;
  feedbackToast.classList.add("show");
  window.clearTimeout(toastTimer);
  toastTimer = window.setTimeout(() => feedbackToast.classList.remove("show"), 1600);
}

function speakArabic(text: string): void {
  if (!("speechSynthesis" in window)) return;

  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ar-SA";
  utterance.rate = 0.78;
  utterance.pitch = 1.02;
  utterance.volume = 1;
  window.speechSynthesis.speak(utterance);
}

function stopGestureCamera(): void {
  gestureController?.stop();
  gestureController = null;
  startGestureBtn.disabled = false;
  stopGestureBtn.disabled = true;
  cameraPlaceholder.classList.remove("hidden");
}

function setGestureStatus(message: string, tone: "info" | "success" | "warning" | "error" = "info"): void {
  gestureStatus.textContent = message;
  gestureStatus.dataset.tone = tone;

  const upper = message.toUpperCase();
  if (upper.includes("MAJU") || upper.includes("DEPAN") || upper.includes("MUNDUR") || upper.includes("BELAKANG")) {
    showMovementCaption(message, tone === "error" ? "warning" : tone);
  }
}

function mustGet<T extends HTMLElement>(id: string): T {
  const element = document.getElementById(id);
  if (!element) throw new Error(`Element #${id} tidak ditemukan.`);
  return element as T;
}
