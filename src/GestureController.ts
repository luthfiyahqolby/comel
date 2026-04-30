import { FilesetResolver, HandLandmarker } from "@mediapipe/tasks-vision";
import type { GestureDirectionId } from "../data/directions";

type Landmark = { x: number; y: number; z: number };
type HandResult = { landmarks?: Landmark[][] };

type GestureControllerOptions = {
  video: HTMLVideoElement;
  onGesture: (direction: GestureDirectionId) => void;
  onStatus?: (message: string, tone?: "info" | "success" | "warning" | "error") => void;
};

type GestureCandidate = {
  direction: GestureDirectionId;
  label: string;
  instruction: string;
};

const WASM_PATH = "https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@0.10.14/wasm";
const HAND_MODEL_PATH =
  "https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task";

const HOLD_TO_CONFIRM_MS = 650;
const COOLDOWN_MS = 1100;

const LABELS: Record<GestureDirectionId, { label: string; instruction: string }> = {
  front: { label: "MAJU / DEPAN", instruction: "telapak terbuka stabil" },
  back: { label: "MUNDUR / BELAKANG", instruction: "kepal tangan stabil" },
  right: { label: "KANAN", instruction: "jempol mengarah ke kanan" },
  left: { label: "KIRI", instruction: "jempol mengarah ke kiri" },
  up: { label: "NAIK / ATAS", instruction: "telunjuk mengarah ke atas" },
  down: { label: "TURUN / BAWAH", instruction: "telunjuk mengarah ke bawah" },
  inside: { label: "DALAM", instruction: "dua tangan dekat di tengah" },
  outside: { label: "LUAR", instruction: "dua tangan terbuka melebar" }
};

export class GestureController {
  private readonly video: HTMLVideoElement;
  private readonly onGesture: (direction: GestureDirectionId) => void;
  private readonly onStatus?: GestureControllerOptions["onStatus"];
  private landmarker: HandLandmarker | null = null;
  private stream: MediaStream | null = null;
  private animationFrameId = 0;
  private isRunning = false;
  private lastVideoTime = -1;
  private cooldownUntil = 0;
  private candidateDirection: GestureDirectionId | null = null;
  private candidateSince = 0;
  private lastStatusAt = 0;

  constructor(options: GestureControllerOptions) {
    this.video = options.video;
    this.onGesture = options.onGesture;
    this.onStatus = options.onStatus;
  }

  async start(): Promise<void> {
    if (this.isRunning) return;

    if (!navigator.mediaDevices?.getUserMedia) {
      throw new Error("Browser tidak mendukung akses kamera.");
    }

    this.setStatus("Meminta izin kamera...", "info");
    this.stream = await navigator.mediaDevices.getUserMedia({
      audio: false,
      video: {
        width: { ideal: 640 },
        height: { ideal: 480 },
        facingMode: "user"
      }
    });

    this.video.srcObject = this.stream;
    await this.video.play();

    this.setStatus("Memuat mesin gesture MediaPipe...", "info");
    this.landmarker = await this.createLandmarker();

    this.isRunning = true;
    this.resetCandidate();
    this.setStatus(
      "Gesture aktif. Model sudah diganti dari swipe ke pose statis: tahan gesture ±0,65 detik.",
      "success"
    );
    this.loop();
  }

  stop(): void {
    this.isRunning = false;
    cancelAnimationFrame(this.animationFrameId);
    this.landmarker?.close();
    this.landmarker = null;
    this.stream?.getTracks().forEach((track) => track.stop());
    this.stream = null;
    this.video.pause();
    this.video.srcObject = null;
    this.resetCandidate();
    this.setStatus("Gesture dimatikan. Mode manual tetap bisa digunakan.", "info");
  }

  private async createLandmarker(): Promise<HandLandmarker> {
    const vision = await FilesetResolver.forVisionTasks(WASM_PATH);

    try {
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_PATH,
          delegate: "GPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
    } catch {
      this.setStatus("GPU tidak tersedia. Gesture memakai mode CPU.", "warning");
      return await HandLandmarker.createFromOptions(vision, {
        baseOptions: {
          modelAssetPath: HAND_MODEL_PATH,
          delegate: "CPU"
        },
        runningMode: "VIDEO",
        numHands: 2
      });
    }
  }

  private loop = (): void => {
    if (!this.isRunning || !this.landmarker) return;

    if (this.video.currentTime !== this.lastVideoTime) {
      this.lastVideoTime = this.video.currentTime;
      const result = this.landmarker.detectForVideo(this.video, performance.now()) as HandResult;
      this.processResult(result);
    }

    this.animationFrameId = requestAnimationFrame(this.loop);
  };

  private processResult(result: HandResult): void {
    const now = performance.now();
    const hands = result.landmarks ?? [];

    if (now < this.cooldownUntil) {
      return;
    }

    const candidate = this.classifyCandidate(hands);
    if (!candidate) {
      if (this.candidateDirection && now - this.lastStatusAt > 500) {
        this.setStatus("Gesture belum stabil. Tahan pose tangan lebih jelas.", "warning");
        this.lastStatusAt = now;
      }
      this.resetCandidate();
      return;
    }

    if (this.candidateDirection !== candidate.direction) {
      this.candidateDirection = candidate.direction;
      this.candidateSince = now;
      this.lastStatusAt = 0;
    }

    const progress = Math.min(100, Math.round(((now - this.candidateSince) / HOLD_TO_CONFIRM_MS) * 100));
    if (now - this.lastStatusAt > 220) {
      this.setStatus(
        `Membaca gesture ${candidate.label}: ${candidate.instruction}. Tahan ${progress}%...`,
        "info"
      );
      this.lastStatusAt = now;
    }

    if (now - this.candidateSince >= HOLD_TO_CONFIRM_MS) {
      this.emit(candidate.direction);
    }
  }

  private classifyCandidate(hands: Landmark[][]): GestureCandidate | null {
    if (hands.length >= 2) {
      const twoHand = this.classifyTwoHands(hands[0], hands[1]);
      if (twoHand) return twoHand;
    }

    if (hands.length >= 1) {
      return this.classifyOneHand(hands[0]);
    }

    return null;
  }

  private classifyTwoHands(handA: Landmark[], handB: Landmark[]): GestureCandidate | null {
    const a = getPalmCenter(handA);
    const b = getPalmCenter(handB);
    const distance = Math.abs(a.x - b.x);
    const avgY = (a.y + b.y) / 2;

    // Hindari salah baca ketika tangan terlalu dekat ke tepi kamera.
    if (avgY < 0.05 || avgY > 0.95) return null;

    if (distance < 0.22) return makeCandidate("inside");
    if (distance > 0.52) return makeCandidate("outside");
    return null;
  }

  private classifyOneHand(hand: Landmark[]): GestureCandidate | null {
    const fingers = getFingerStates(hand);
    const extendedCount = Object.values(fingers).filter(Boolean).length;
    const wrist = hand[0];
    const indexTip = hand[8];
    const indexMcp = hand[5];
    const thumbTip = hand[4];
    const thumbMcp = hand[2];
    const palmSize = getPalmSize(hand);

    const onlyIndex = fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;
    if (onlyIndex) {
      const verticalDistance = indexTip.y - indexMcp.y;
      if (verticalDistance < -palmSize * 0.38) return makeCandidate("up");
      if (verticalDistance > palmSize * 0.24) return makeCandidate("down");
    }

    const thumbOnly = fingers.thumb && !fingers.index && !fingers.middle && !fingers.ring && !fingers.pinky;
    if (thumbOnly) {
      const dx = thumbTip.x - thumbMcp.x;
      if (dx > palmSize * 0.32) return makeCandidate("right");
      if (dx < -palmSize * 0.32) return makeCandidate("left");
    }

    // Telapak terbuka = maju/depan. Diposisikan setelah index/thumb agar tidak bentrok.
    if (extendedCount >= 4) return makeCandidate("front");

    // Kepal tangan = mundur/belakang.
    const compactHand = getHandSize(hand) < palmSize * 1.85;
    if (extendedCount <= 1 && compactHand) return makeCandidate("back");

    // Fallback kepal tangan untuk kamera yang kurang jelas.
    if (extendedCount === 0) return makeCandidate("back");

    // Fallback jempol kanan/kiri: jempol dominan secara horizontal.
    const thumbDominates = Math.abs(thumbTip.x - wrist.x) > Math.abs(indexTip.y - wrist.y) * 0.7;
    if (fingers.thumb && thumbDominates && extendedCount <= 2) {
      return thumbTip.x > wrist.x ? makeCandidate("right") : makeCandidate("left");
    }

    return null;
  }

  private emit(direction: GestureDirectionId): void {
    const label = LABELS[direction].label;
    this.cooldownUntil = performance.now() + COOLDOWN_MS;
    this.resetCandidate();
    this.setStatus(`Gesture terbaca: ${label}. Perintah dikirim ke Zayd.`, "success");
    this.onGesture(direction);
  }

  private resetCandidate(): void {
    this.candidateDirection = null;
    this.candidateSince = 0;
  }

  private setStatus(message: string, tone: "info" | "success" | "warning" | "error" = "info"): void {
    this.onStatus?.(message, tone);
  }
}

function makeCandidate(direction: GestureDirectionId): GestureCandidate {
  return {
    direction,
    label: LABELS[direction].label,
    instruction: LABELS[direction].instruction
  };
}

function getPalmCenter(landmarks: Landmark[]): { x: number; y: number } {
  const ids = [0, 5, 9, 13, 17];
  const sum = ids.reduce(
    (acc, id) => {
      const point = landmarks[id] ?? landmarks[0];
      return { x: acc.x + point.x, y: acc.y + point.y };
    },
    { x: 0, y: 0 }
  );
  return { x: sum.x / ids.length, y: sum.y / ids.length };
}

function getFingerStates(landmarks: Landmark[]): {
  thumb: boolean;
  index: boolean;
  middle: boolean;
  ring: boolean;
  pinky: boolean;
} {
  const palmSize = getPalmSize(landmarks);
  const thumbTip = landmarks[4];
  const thumbIp = landmarks[3];
  const wrist = landmarks[0];

  return {
    thumb: Math.abs(thumbTip.x - wrist.x) > Math.abs(thumbIp.x - wrist.x) + palmSize * 0.08,
    index: isFingerExtended(landmarks, 8, 6, palmSize),
    middle: isFingerExtended(landmarks, 12, 10, palmSize),
    ring: isFingerExtended(landmarks, 16, 14, palmSize),
    pinky: isFingerExtended(landmarks, 20, 18, palmSize)
  };
}

function isFingerExtended(landmarks: Landmark[], tipId: number, pipId: number, palmSize: number): boolean {
  const tip = landmarks[tipId];
  const pip = landmarks[pipId];
  return tip.y < pip.y - palmSize * 0.08;
}

function getPalmSize(landmarks: Landmark[]): number {
  const wrist = landmarks[0];
  const middleMcp = landmarks[9];
  return Math.max(distance2D(wrist, middleMcp), 0.08);
}

function getHandSize(landmarks: Landmark[]): number {
  const xs = landmarks.map((point) => point.x);
  const ys = landmarks.map((point) => point.y);
  const width = Math.max(...xs) - Math.min(...xs);
  const height = Math.max(...ys) - Math.min(...ys);
  return Math.max(width, height);
}

function distance2D(a: Landmark, b: Landmark): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}
