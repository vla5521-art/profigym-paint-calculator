import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { ViewerMesh } from "../../cad/api.ts";
import { VIEWER_CATEGORIES } from "./colors.ts";

export interface CadViewerProps {
  mesh: ViewerMesh | null;
  selectedFaceIds: string[];
  onSelectFace: (faceId: string) => void;
  onPreview?: (preview: Blob) => void;
}

type CameraActions = { view: (axis: "iso" | "front" | "top" | "right") => void; reset: () => void; capture: () => void };

function geometry(positions: number[], normals: number[], indices: number[]): THREE.BufferGeometry {
  const value = new THREE.BufferGeometry();
  value.setAttribute("position", new THREE.Float32BufferAttribute(positions, 3));
  value.setAttribute("normal", new THREE.Float32BufferAttribute(normals, 3));
  value.setIndex(indices);
  value.computeBoundingSphere();
  return value;
}

export function CadViewer({ mesh, selectedFaceIds, onSelectFace, onPreview }: CadViewerProps): React.JSX.Element {
  const hostRef = useRef<HTMLDivElement | null>(null);
  const actionsRef = useRef<CameraActions | null>(null);
  const selectedRef = useRef(selectedFaceIds);
  const onSelectRef = useRef(onSelectFace);
  const onPreviewRef = useRef(onPreview);
  const [cameraType, setCameraType] = useState<"perspective" | "orthographic">("perspective");
  const [webglError, setWebglError] = useState<string | null>(null);
  const [hovered, setHovered] = useState<{ id: string; area: number } | null>(null);
  const [rendererState, setRendererState] = useState<"loading" | "webgl" | "fallback">("loading");
  const [materialState, setMaterialState] = useState("");

  useEffect(() => { selectedRef.current = selectedFaceIds; }, [selectedFaceIds]);
  useEffect(() => { onSelectRef.current = onSelectFace; }, [onSelectFace]);
  useEffect(() => { onPreviewRef.current = onPreview; }, [onPreview]);

  useEffect(() => {
    const host = hostRef.current;
    if (!host || !mesh?.available) return undefined;
    if (typeof navigator !== "undefined" && navigator.userAgent.includes("jsdom")) {
      setWebglError("WebGL недоступен. Таблицы, площади, решения и отчёт продолжают работать.");
      setRendererState("fallback");
      return undefined;
    }
    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
      setWebglError(null);
      setRendererState("webgl");
    } catch {
      setWebglError("WebGL недоступен. Таблицы, площади, решения и отчёт продолжают работать.");
      setRendererState("fallback");
      return undefined;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.domElement.dataset.testid = "cad-viewer-canvas";
    renderer.domElement.setAttribute("aria-label", "Полотно интерактивной 3D-модели");
    renderer.outputColorSpace = THREE.SRGBColorSpace;
    host.appendChild(renderer.domElement);
    const scene = new THREE.Scene();
    scene.background = new THREE.Color(0x07182b);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x203044, 2.3));
    const directional = new THREE.DirectionalLight(0xffffff, 2.6);
    directional.position.set(2, 3, 4);
    scene.add(directional);
    scene.add(new THREE.AxesHelper(40));
    const group = new THREE.Group();
    scene.add(group);
    const objects: THREE.Mesh[] = [];
    for (const face of mesh.faces) {
      const category = VIEWER_CATEGORIES[face.category];
      const material = new THREE.MeshStandardMaterial({ color: category.color, transparent: category.opacity < 1, opacity: category.opacity, roughness: 0.72, metalness: 0.05, side: THREE.DoubleSide });
      const object = new THREE.Mesh(geometry(face.positions, face.normals, face.indices), material);
      object.userData = { faceId: face.faceId, areaMm2: face.areaMm2, category: face.category, baseColor: category.color };
      group.add(object);
      objects.push(object);
    }
    for (const patch of mesh.patches) {
      const category = VIEWER_CATEGORIES[patch.category];
      const material = new THREE.MeshStandardMaterial({ color: category.color, transparent: true, opacity: 0.82, roughness: 0.45, polygonOffset: true, polygonOffsetFactor: -2, side: THREE.DoubleSide });
      const object = new THREE.Mesh(geometry(patch.positions, patch.normals, patch.indices), material);
      object.userData = { faceId: patch.faceIds[0], areaMm2: patch.areaMm2, category: patch.category, baseColor: category.color, patch: true };
      group.add(object);
      objects.push(object);
    }
    const box = new THREE.Box3().setFromObject(group);
    const center = box.getCenter(new THREE.Vector3());
    const size = Math.max(box.getSize(new THREE.Vector3()).length(), 1);
    const aspect = Math.max(host.clientWidth, 1) / Math.max(host.clientHeight, 1);
    const camera: THREE.PerspectiveCamera | THREE.OrthographicCamera = cameraType === "perspective"
      ? new THREE.PerspectiveCamera(42, aspect, size / 10_000, size * 100)
      : new THREE.OrthographicCamera(-size * aspect / 2, size * aspect / 2, size / 2, -size / 2, -size * 100, size * 100);
    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.copy(center);
    const setView = (kind: "iso" | "front" | "top" | "right") => {
      const direction = kind === "front" ? new THREE.Vector3(0, -1, 0) : kind === "top" ? new THREE.Vector3(0, 0, 1) : kind === "right" ? new THREE.Vector3(1, 0, 0) : new THREE.Vector3(1, -1, 0.8);
      camera.position.copy(center).add(direction.normalize().multiplyScalar(size * 1.25));
      camera.up.set(0, 0, 1);
      camera.lookAt(center);
      controls.update();
    };
    setView("iso");
    actionsRef.current = {
      view: setView,
      reset: () => setView("iso"),
      capture: () => renderer.domElement.toBlob((blob) => { if (blob) onPreviewRef.current?.(blob); }, "image/png"),
    };
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    const pick = (event: MouseEvent | PointerEvent, select: boolean) => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.x = ((event.clientX - rect.left) / rect.width) * 2 - 1;
      pointer.y = -((event.clientY - rect.top) / rect.height) * 2 + 1;
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(objects, false)[0]?.object as THREE.Mesh | undefined;
      const faceId = hit?.userData.faceId as string | undefined;
      setHovered(faceId ? { id: faceId, area: Number(hit?.userData.areaMm2 ?? 0) } : null);
      if (select && faceId) onSelectRef.current(faceId);
    };
    const click = (event: MouseEvent) => pick(event, true);
    const move = (event: PointerEvent) => pick(event, false);
    renderer.domElement.addEventListener("click", click);
    renderer.domElement.addEventListener("pointermove", move);
    const resize = () => {
      const width = Math.max(host.clientWidth, 1);
      const height = Math.max(host.clientHeight, 1);
      renderer.setSize(width, height, false);
      if (camera instanceof THREE.PerspectiveCamera) camera.aspect = width / height;
      else {
        const half = size / 2;
        camera.left = -half * width / height; camera.right = half * width / height; camera.top = half; camera.bottom = -half;
      }
      camera.updateProjectionMatrix();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(host);
    resize();
    let frame = 0;
    const animate = () => {
      for (const object of objects) {
        const material = object.material as THREE.MeshStandardMaterial;
        const selected = selectedRef.current.includes(String(object.userData.faceId));
        material.color.setHex(selected ? VIEWER_CATEGORIES.selected.color : Number(object.userData.baseColor));
        material.emissive.setHex(selected ? 0x4c4c4c : 0x000000);
      }
      controls.update();
      renderer.render(scene, camera);
      frame = window.requestAnimationFrame(animate);
    };
    setMaterialState(JSON.stringify(objects.map((object) => ({
      faceId: String(object.userData.faceId),
      category: String(object.userData.category),
      selected: selectedRef.current.includes(String(object.userData.faceId)),
      patch: Boolean(object.userData.patch),
    }))));
    animate();
    return () => {
      window.cancelAnimationFrame(frame);
      observer.disconnect();
      renderer.domElement.removeEventListener("click", click);
      renderer.domElement.removeEventListener("pointermove", move);
      controls.dispose();
      for (const object of objects) { object.geometry.dispose(); (object.material as THREE.Material).dispose(); }
      renderer.dispose();
      renderer.domElement.remove();
      actionsRef.current = null;
    };
  }, [mesh, cameraType]);

  useEffect(() => {
    if (!mesh?.available) return;
    setMaterialState(JSON.stringify([
      ...mesh.faces.map((face) => ({ faceId: face.faceId, category: face.category, selected: selectedFaceIds.includes(face.faceId), patch: false })),
      ...mesh.patches.map((patch) => ({ faceId: patch.faceIds[0] ?? "", category: patch.category, selected: patch.faceIds.some((id) => selectedFaceIds.includes(id)), patch: true })),
    ]));
  }, [mesh, selectedFaceIds]);

  if (!mesh) return <div className="cad-viewer-fallback" data-testid="cad-viewer-fallback" role="status">Построение 3D-сетки…</div>;
  if (!mesh.available) return <div className="cad-viewer-fallback" data-testid="cad-viewer-fallback" role="alert">{mesh.warning?.message ?? "3D-сетка недоступна"}</div>;
  return <section className="cad-viewer-shell" data-testid="cad-viewer" data-renderer-state={rendererState} data-selected-face-id={selectedFaceIds[0] ?? ""} aria-label="Интерактивная 3D-модель">
    <div className="cad-viewer-toolbar" role="toolbar" aria-label="Управление камерой">
      {(["iso", "front", "top", "right"] as const).map((view) => <button key={view} type="button" onClick={() => actionsRef.current?.view(view)}>{view === "iso" ? "Изометрия" : view === "front" ? "Спереди" : view === "top" ? "Сверху" : "Справа"}</button>)}
      <button type="button" onClick={() => actionsRef.current?.reset()}>Сброс камеры</button>
      <button type="button" onClick={() => setCameraType((current) => current === "perspective" ? "orthographic" : "perspective")}>{cameraType === "perspective" ? "Ортографическая" : "Перспективная"}</button>
      {onPreview && <button type="button" onClick={() => actionsRef.current?.capture()}>Снимок для отчёта</button>}
    </div>
    <div ref={hostRef} className="cad-viewer-canvas" tabIndex={0} aria-label="3D viewer: вращение, масштабирование и выбор граней" />
    {webglError && <p className="cad-viewer-error" data-testid="cad-viewer-fallback" role="alert">{webglError}</p>}
    <p className="cad-viewer-status" aria-live="polite">{hovered ? `Грань ${hovered.id}, ${hovered.area.toLocaleString("ru-RU")} мм²` : `${mesh.triangleCount.toLocaleString("ru-RU")} треугольников · выберите грань кликом`}</p>
    <output hidden data-testid="cad-viewer-state" data-face-count={mesh.faces.length} data-triangle-count={mesh.triangleCount} data-patch-count={mesh.patches.length} data-selected-face-id={selectedFaceIds[0] ?? ""} data-material-state={materialState}>
      {selectedFaceIds.length > 0 ? `Выбрана грань ${selectedFaceIds.join(", ")}` : "Грань не выбрана"}
    </output>
    <div className="cad-viewer-legend" aria-label="Легенда категорий">
      {Object.entries(VIEWER_CATEGORIES).filter(([key]) => key !== "selected").map(([key, category]) => <span key={key}><i style={{ backgroundColor: `#${category.color.toString(16).padStart(6, "0")}` }} />{category.label} <small>({category.pattern})</small></span>)}
    </div>
  </section>;
}
