import {
  AbstractMesh,
  Animation,
  ArcRotateCamera,
  Color3,
  Color4,
  CubicEase,
  DirectionalLight,
  EasingFunction,
  Engine,
  HemisphericLight,
  Mesh,
  MeshBuilder,
  Scene,
  SceneLoader,
  ShadowGenerator,
  StandardMaterial,
  TransformNode,
  Vector3
} from "@babylonjs/core";
import "@babylonjs/loaders/glTF";
import type { GestureDirectionId } from "../data/directions";
import type { NavigationCommandId } from "../data/navigation";

type SceneApi = {
  scene: Scene;
  engine: Engine;
  playDirection: (direction: GestureDirectionId) => void;
  playNavigation: (command: NavigationCommandId) => void;
  reset: () => void;
  dispose: () => void;
};

type Actor = {
  root: TransformNode;
  meshes: AbstractMesh[];
  body?: TransformNode;
  head?: TransformNode;
  leftArmPivot?: TransformNode;
  rightArmPivot?: TransformNode;
  leftLegPivot?: TransformNode;
  rightLegPivot?: TransformNode;
  kind: "procedural" | "glb";
};

type Materials = ReturnType<typeof createMaterials>;

const HOME = new Vector3(0, 0, 0);
const FRAME_RATE = 60;
const LESSON_TARGETS: Record<GestureDirectionId, Vector3> = {
  right: new Vector3(2.8, 0, 0),
  left: new Vector3(-2.8, 0, 0),
  up: new Vector3(0, 1.9, 0),
  down: new Vector3(0, -0.08, 0),
  front: new Vector3(0, 0, 2.4),
  back: new Vector3(0, 0, -2.5),
  inside: new Vector3(0, 0, -3.25),
  outside: new Vector3(0, 0, 2.7)
};

export function createZaydScene(canvas: HTMLCanvasElement): SceneApi {
  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    antialias: true
  });

  const scene = new Scene(engine);
  scene.clearColor = new Color4(0.03, 0.06, 0.11, 1);

  const camera = new ArcRotateCamera("camera", -Math.PI / 2, Math.PI / 3.05, 11.5, new Vector3(0, 1.5, 0), scene);
  camera.attachControl(canvas, true);
  camera.lowerRadiusLimit = 7;
  camera.upperRadiusLimit = 18;
  camera.wheelPrecision = 48;
  camera.panningSensibility = 0;

  const hemi = new HemisphericLight("hemiLight", new Vector3(0, 1, 0), scene);
  hemi.intensity = 0.82;

  const sun = new DirectionalLight("sunLight", new Vector3(-0.45, -1, 0.45), scene);
  sun.position = new Vector3(6, 9, -4);
  sun.intensity = 0.95;

  const shadowGenerator = new ShadowGenerator(1024, sun);
  shadowGenerator.useBlurExponentialShadowMap = true;
  shadowGenerator.blurKernel = 18;

  const materials = createMaterials(scene);
  createEnvironment(scene, materials);
  const actorState: { current: Actor } = { current: createProceduralZayd(scene, materials) };
  actorState.current.root.position.copyFrom(HOME);
  actorState.current.meshes.forEach((mesh) => mesh instanceof Mesh && shadowGenerator.addShadowCaster(mesh));

  void tryLoadRealZayd(scene, shadowGenerator).then((realActor) => {
    if (!realActor) return;
    const previous = actorState.current;
    realActor.root.position.copyFrom(previous.root.position);
    realActor.root.rotation.copyFrom(previous.root.rotation);
    realActor.root.scaling.copyFrom(previous.root.scaling);
    previous.root.dispose(false, true);
    actorState.current = realActor;
  });

  const ground = scene.getMeshByName("ground");
  if (ground) {
    ground.receiveShadows = true;
  }

  let idleTime = 0;
  scene.onBeforeRenderObservable.add(() => {
    idleTime += scene.getEngine().getDeltaTime() / 1000;
    const actor = actorState.current;
    if (actor.kind === "procedural" && actor.body && actor.head) {
      actor.body.position.y = 0.82 + Math.sin(idleTime * 2.1) * 0.025;
      actor.head.rotation.y = Math.sin(idleTime * 1.6) * 0.06;
    }
  });

  engine.runRenderLoop(() => scene.render());

  const resizeHandler = () => engine.resize();
  window.addEventListener("resize", resizeHandler);

  function playDirection(direction: GestureDirectionId): void {
    const actor = actorState.current;
    const target = LESSON_TARGETS[direction].clone();

    scene.stopAnimation(actor.root);
    animateVector3(scene, actor.root, "position", target, 920);
    animateFloat(scene, actor.root, "rotation.y", getDirectionRotation(direction), 820);
    playActionMotion(scene, actor, direction === "up" || direction === "down" ? 0.15 : 0.4, 820);
    highlightLesson(direction, scene);
  }

  function playNavigation(command: NavigationCommandId): void {
    const actor = actorState.current;
    scene.stopAnimation(actor.root);

    const current = actor.root.position.clone();
    const rotationY = normalizeAngle(actor.root.rotation.y);
    let nextPosition = current.clone();
    let nextRotation = rotationY;

    switch (command) {
      case "walkForward": {
        const dir = new Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
        nextPosition = current.add(new Vector3(dir.x * 1.7, 0, dir.z * 1.7));
        break;
      }
      case "walkBackward": {
        const dir = new Vector3(Math.sin(rotationY), 0, Math.cos(rotationY));
        nextPosition = current.add(new Vector3(-dir.x * 1.45, 0, -dir.z * 1.45));
        break;
      }
      case "turnRight": {
        nextRotation = rotationY + Math.PI / 2;
        break;
      }
      case "turnLeft": {
        nextRotation = rotationY - Math.PI / 2;
        break;
      }
      case "goUp": {
        nextPosition = new Vector3(current.x, Math.min(current.y + 1.1, 2.3), current.z - 0.8);
        break;
      }
      case "goDown": {
        nextPosition = new Vector3(current.x, Math.max(current.y - 1.1, 0), current.z + 0.8);
        break;
      }
    }

    clampPosition(nextPosition);
    animateVector3(scene, actor.root, "position", nextPosition, 880);
    animateFloat(scene, actor.root, "rotation.y", nextRotation, 780);
    playActionMotion(scene, actor, command.startsWith("turn") ? 0.18 : 0.5, 850);
    highlightNavigation(command, scene);
  }

  function reset(): void {
    const actor = actorState.current;
    scene.stopAnimation(actor.root);
    actor.root.position.copyFrom(HOME);
    actor.root.rotation.set(0, 0, 0);
    actor.root.scaling.setAll(1);
    clearHighlights(scene);
  }

  return {
    scene,
    engine,
    playDirection,
    playNavigation,
    reset,
    dispose: () => {
      window.removeEventListener("resize", resizeHandler);
      scene.dispose();
      engine.dispose();
    }
  };
}

function createMaterials(scene: Scene) {
  const make = (name: string, color: Color3, alpha = 1) => {
    const material = new StandardMaterial(name, scene);
    material.diffuseColor = color;
    material.specularColor = new Color3(0.15, 0.15, 0.15);
    material.alpha = alpha;
    return material;
  };

  return {
    ground: make("matGround", new Color3(0.1, 0.18, 0.28)),
    accent: make("matAccent", new Color3(0.08, 0.68, 0.63)),
    skin: make("matSkin", new Color3(0.92, 0.7, 0.51)),
    shirt: make("matShirt", new Color3(0.24, 0.48, 0.88)),
    pants: make("matPants", new Color3(0.09, 0.13, 0.22)),
    hair: make("matHair", new Color3(0.1, 0.07, 0.06)),
    shoes: make("matShoes", new Color3(0.86, 0.93, 0.98)),
    glass: make("matGlass", new Color3(0.49, 0.87, 0.99), 0.28),
    house: make("matHouse", new Color3(0.42, 0.2, 0.58)),
    marker: make("matMarker", new Color3(0.98, 0.8, 0.2)),
    stair: make("matStair", new Color3(0.29, 0.37, 0.56))
  };
}

function createEnvironment(scene: Scene, materials: Materials): void {
  const ground = MeshBuilder.CreateGround("ground", { width: 16, height: 16 }, scene);
  ground.material = materials.ground;
  ground.position.y = -0.1;

  for (let i = -7; i <= 7; i += 1) {
    const lineX = MeshBuilder.CreateBox(`gridX-${i}`, { width: 0.03, depth: 16, height: 0.01 }, scene);
    lineX.position.set(i, -0.09, 0);
    lineX.material = materials.glass;

    const lineZ = MeshBuilder.CreateBox(`gridZ-${i}`, { width: 16, depth: 0.03, height: 0.01 }, scene);
    lineZ.position.set(0, -0.09, i);
    lineZ.material = materials.glass;
  }

  const houseBase = MeshBuilder.CreateBox("houseBase", { width: 2.6, height: 2.4, depth: 2.4 }, scene);
  houseBase.position.set(0, 1.05, -3.25);
  houseBase.material = materials.house;

  const houseDoor = MeshBuilder.CreateBox("houseDoor", { width: 1.15, height: 1.6, depth: 0.2 }, scene);
  houseDoor.position.set(0, 0.9, -2.05);
  houseDoor.material = materials.accent;

  const stairGroup = new TransformNode("stairs", scene);
  for (let step = 0; step < 4; step += 1) {
    const stair = MeshBuilder.CreateBox(`stair-${step}`, { width: 2.1, depth: 1, height: 0.28 }, scene);
    stair.position.set(4.2, 0.04 + step * 0.28, 2.8 - step * 0.9);
    stair.material = materials.stair;
    stair.parent = stairGroup;
  }

  const platform = MeshBuilder.CreateBox("platform", { width: 2.2, depth: 2.2, height: 0.2 }, scene);
  platform.position.set(4.2, 1.2, -0.1);
  platform.material = materials.accent;

  const centerMark = MeshBuilder.CreateDisc("centerMark", { radius: 0.7, tessellation: 48 }, scene);
  centerMark.position.set(0, -0.085, 0);
  centerMark.rotation.x = Math.PI / 2;
  centerMark.material = materials.marker;

  const lessonMarkers: Array<[string, Vector3]> = [
    ["marker-right", LESSON_TARGETS.right],
    ["marker-left", LESSON_TARGETS.left],
    ["marker-up", LESSON_TARGETS.up],
    ["marker-down", LESSON_TARGETS.down],
    ["marker-front", LESSON_TARGETS.front],
    ["marker-back", LESSON_TARGETS.back],
    ["marker-inside", LESSON_TARGETS.inside],
    ["marker-outside", LESSON_TARGETS.outside]
  ];

  lessonMarkers.forEach(([name, position]) => {
    const marker = MeshBuilder.CreateCylinder(name, { diameter: 0.35, height: 0.18 }, scene);
    marker.position.copyFrom(position);
    marker.position.y = Math.max(position.y, 0) + 0.06;
    marker.material = materials.marker;
  });
}

function createProceduralZayd(scene: Scene, materials: Materials): Actor {
  const root = new TransformNode("zaydRoot", scene);

  const body = MeshBuilder.CreateCapsule("zaydBody", { radius: 0.38, height: 1.5 }, scene);
  body.material = materials.shirt;
  body.position.set(0, 0.82, 0);
  body.parent = root;

  const headPivot = new TransformNode("zaydHeadPivot", scene);
  headPivot.parent = root;
  headPivot.position.set(0, 1.72, 0);

  const head = MeshBuilder.CreateSphere("zaydHead", { diameter: 0.76, segments: 20 }, scene);
  head.material = materials.skin;
  head.parent = headPivot;

  const hair = MeshBuilder.CreateSphere("zaydHair", { diameter: 0.8, segments: 16 }, scene);
  hair.scaling.y = 0.65;
  hair.position.y = 0.2;
  hair.material = materials.hair;
  hair.parent = headPivot;

  const leftArmPivot = new TransformNode("zaydLeftArmPivot", scene);
  leftArmPivot.parent = root;
  leftArmPivot.position.set(-0.52, 1.36, 0);

  const rightArmPivot = new TransformNode("zaydRightArmPivot", scene);
  rightArmPivot.parent = root;
  rightArmPivot.position.set(0.52, 1.36, 0);

  const leftArm = MeshBuilder.CreateCapsule("zaydLeftArm", { radius: 0.12, height: 0.88 }, scene);
  leftArm.material = materials.skin;
  leftArm.position.y = -0.4;
  leftArm.rotation.z = 0.18;
  leftArm.parent = leftArmPivot;

  const rightArm = MeshBuilder.CreateCapsule("zaydRightArm", { radius: 0.12, height: 0.88 }, scene);
  rightArm.material = materials.skin;
  rightArm.position.y = -0.4;
  rightArm.rotation.z = -0.18;
  rightArm.parent = rightArmPivot;

  const leftLegPivot = new TransformNode("zaydLeftLegPivot", scene);
  leftLegPivot.parent = root;
  leftLegPivot.position.set(-0.18, 0.18, 0);

  const rightLegPivot = new TransformNode("zaydRightLegPivot", scene);
  rightLegPivot.parent = root;
  rightLegPivot.position.set(0.18, 0.18, 0);

  const leftLeg = MeshBuilder.CreateCapsule("zaydLeftLeg", { radius: 0.14, height: 1 }, scene);
  leftLeg.material = materials.pants;
  leftLeg.position.y = -0.48;
  leftLeg.parent = leftLegPivot;

  const rightLeg = MeshBuilder.CreateCapsule("zaydRightLeg", { radius: 0.14, height: 1 }, scene);
  rightLeg.material = materials.pants;
  rightLeg.position.y = -0.48;
  rightLeg.parent = rightLegPivot;

  const leftShoe = MeshBuilder.CreateBox("zaydLeftShoe", { width: 0.22, height: 0.12, depth: 0.38 }, scene);
  leftShoe.material = materials.shoes;
  leftShoe.position.set(0, -1, 0.12);
  leftShoe.parent = leftLegPivot;

  const rightShoe = MeshBuilder.CreateBox("zaydRightShoe", { width: 0.22, height: 0.12, depth: 0.38 }, scene);
  rightShoe.material = materials.shoes;
  rightShoe.position.set(0, -1, 0.12);
  rightShoe.parent = rightLegPivot;

  const meshes = [body, head, hair, leftArm, rightArm, leftLeg, rightLeg, leftShoe, rightShoe];
  return {
    root,
    meshes,
    body,
    head: headPivot,
    leftArmPivot,
    rightArmPivot,
    leftLegPivot,
    rightLegPivot,
    kind: "procedural"
  };
}

async function tryLoadRealZayd(scene: Scene, shadowGenerator: ShadowGenerator): Promise<Actor | null> {
  try {
    const result = await SceneLoader.ImportMeshAsync("", `${import.meta.env.BASE_URL}models/`, "zayd.glb", scene);
    if (!result.meshes.length) return null;

    const root = new TransformNode("zaydGlbRoot", scene);
    result.meshes.forEach((mesh) => {
      if (mesh !== root) {
        mesh.parent = root;
      }
      if (mesh instanceof Mesh) {
        shadowGenerator.addShadowCaster(mesh);
      }
    });

    root.scaling.setAll(1.15);
    root.position.copyFrom(HOME);
    return {
      root,
      meshes: result.meshes,
      kind: "glb"
    };
  } catch {
    return null;
  }
}

function playActionMotion(scene: Scene, actor: Actor, swing: number, duration: number): void {
  if (actor.leftArmPivot && actor.rightArmPivot && actor.leftLegPivot && actor.rightLegPivot) {
    animateFloat(scene, actor.leftArmPivot, "rotation.x", swing, duration / 2, true);
    animateFloat(scene, actor.rightArmPivot, "rotation.x", -swing, duration / 2, true);
    animateFloat(scene, actor.leftLegPivot, "rotation.x", -swing * 0.9, duration / 2, true);
    animateFloat(scene, actor.rightLegPivot, "rotation.x", swing * 0.9, duration / 2, true);
  }
}

function getDirectionRotation(direction: GestureDirectionId): number {
  switch (direction) {
    case "right":
      return Math.PI / 2;
    case "left":
      return -Math.PI / 2;
    case "back":
    case "inside":
      return Math.PI;
    case "outside":
    case "front":
      return 0;
    case "up":
    case "down":
      return 0;
  }
}

function highlightLesson(direction: GestureDirectionId, scene: Scene): void {
  clearHighlights(scene);
  const target = scene.getMeshByName(`marker-${direction}`);
  target?.scaling.setAll(1.8);
}

function highlightNavigation(command: NavigationCommandId, scene: Scene): void {
  clearHighlights(scene);
  if (command === "goUp" || command === "goDown") {
    const stairs = scene.getTransformNodeByName("stairs");
    stairs?.getChildMeshes().forEach((mesh) => mesh.scaling.setAll(1.08));
    const platform = scene.getMeshByName("platform");
    platform?.scaling.setAll(1.05);
  }
}

function clearHighlights(scene: Scene): void {
  scene.meshes
    .filter((mesh) => mesh.name.startsWith("marker-"))
    .forEach((mesh) => mesh.scaling.setAll(1));
  scene
    .getTransformNodeByName("stairs")
    ?.getChildMeshes()
    .forEach((mesh) => mesh.scaling.setAll(1));
  scene.getMeshByName("platform")?.scaling.setAll(1);
}

function animateVector3(scene: Scene, target: TransformNode, property: string, value: Vector3, durationMs: number): void {
  const animation = new Animation(`anim-${property}`, property, FRAME_RATE, Animation.ANIMATIONTYPE_VECTOR3, Animation.ANIMATIONLOOPMODE_CONSTANT);
  animation.setKeys([
    { frame: 0, value: target.position.clone() },
    { frame: (FRAME_RATE * durationMs) / 1000, value }
  ]);
  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
  animation.setEasingFunction(ease);
  target.animations = [animation];
  scene.beginAnimation(target, 0, (FRAME_RATE * durationMs) / 1000, false);
}

function animateFloat(
  scene: Scene,
  target: TransformNode,
  property: string,
  value: number,
  durationMs: number,
  autoBack = false
): void {
  const startValue = readFloat(target, property);
  const endFrame = (FRAME_RATE * durationMs) / 1000;
  const keys = autoBack
    ? [
        { frame: 0, value: startValue },
        { frame: endFrame / 2, value },
        { frame: endFrame, value: 0 }
      ]
    : [
        { frame: 0, value: startValue },
        { frame: endFrame, value }
      ];

  const animation = new Animation(`anim-${property}`, property, FRAME_RATE, Animation.ANIMATIONTYPE_FLOAT, Animation.ANIMATIONLOOPMODE_CONSTANT);
  animation.setKeys(keys);
  const ease = new CubicEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEINOUT);
  animation.setEasingFunction(ease);
  target.animations = target.animations.filter((item) => item.targetProperty !== property);
  target.animations.push(animation);
  scene.beginAnimation(target, 0, endFrame, false);
}

function readFloat(target: TransformNode, property: string): number {
  const [group, key] = property.split(".");
  if (group === "rotation" && key in target.rotation) {
    return target.rotation[key as keyof Vector3] as number;
  }
  if (group === "position" && key in target.position) {
    return target.position[key as keyof Vector3] as number;
  }
  if (group === "scaling" && key in target.scaling) {
    return target.scaling[key as keyof Vector3] as number;
  }
  return 0;
}

function clampPosition(position: Vector3): void {
  position.x = Math.max(-5.5, Math.min(5.5, position.x));
  position.z = Math.max(-5.5, Math.min(5.5, position.z));
  position.y = Math.max(0, Math.min(2.3, position.y));
}

function normalizeAngle(angle: number): number {
  while (angle > Math.PI) angle -= Math.PI * 2;
  while (angle < -Math.PI) angle += Math.PI * 2;
  return angle;
}
