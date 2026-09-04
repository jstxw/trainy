"use client";

import { useEffect, useRef, useState } from "react";
import * as THREE from "three";
import { OrbitControls } from "three/examples/jsm/controls/OrbitControls.js";
import type { Coordinate, JourneyLeg } from "@/lib/domain";
import { journeyTooltip } from "@/lib/journey-tooltip";
import { railCoordinates, type RailPathStyle } from "@/lib/rail-path";
import {
  biomeFor,
  greatCirclePoints,
  liftedArcPoints,
  lonLatToVector,
  valueNoise3,
  vectorToLonLat,
  viewCenterFor,
  viewDistanceFor,
  type Biome,
  type Vector,
} from "@/lib/planet-geometry";

// A stylised low-poly planet. Real coastlines come from Natural Earth; the
// faceted terrain, biomes and trees are generated on the client.

const PLANET_DETAIL = 56;
const LAND_HEIGHT = 0.012;
const LAND_RELIEF = 0.016;
const ROUTE_RADIUS = 1.034;
const MASK_WIDTH = 2048;
const MASK_HEIGHT = 1024;
const MAX_TREES = 3200;
const MAX_ROCKS = 700;
const MAX_CRYSTALS = 600;
const STAR_COUNT = 1400;
const SIDEBAR_SHIFT_PX = 230;
const COMPACT_SHIFT_PX = 170;

// Brand colourway rather than realism: white land, lavender seas, indigo forests,
// matching the flat map's light indigo/lavender theme.
const PALETTE = {
  ocean: ["#cfd3f5", "#c6cbf2"],
  sand: ["#e9ebfb", "#e2e4f9"],
  meadow: ["#ffffff", "#f9f9fe"],
  forest: ["#f1f2fd", "#eaecfb"],
  desert: ["#efeafc", "#e8e1fa"],
  snow: ["#ffffff", "#fbfbff"],
  canopy: ["#5b5fe6", "#7c74ec", "#8055e8", "#9a8cf0", "#4a4fe0"],
  trunk: "#a3a7e0",
  rock: "#d3d6f2",
  crystal: "#d6d2f7",
  rail: "#4046e0",
  air: "#8055e8",
  markerRail: "#4046e0",
  markerAir: "#8055e8",
  markerDim: "#c7cbea",
};

type LandMask = (lon: number, lat: number) => boolean;

type FaceInfo = {
  centroid: Vector;
  radius: number;
  biome: Biome;
  coastal: boolean;
};

type GeoPolygon = { type: "Polygon"; coordinates: Coordinate[][] };
type GeoMultiPolygon = { type: "MultiPolygon"; coordinates: Coordinate[][][] };
type LandGeoJson = { features: Array<{ geometry: GeoPolygon | GeoMultiPolygon }> };

async function loadLandMask(): Promise<LandMask> {
  const response = await fetch("/geo/land-110m.json");
  if (!response.ok) throw new Error("Land data could not be loaded.");
  const geo = (await response.json()) as LandGeoJson;

  const canvas = document.createElement("canvas");
  canvas.width = MASK_WIDTH;
  canvas.height = MASK_HEIGHT;
  const ctx = canvas.getContext("2d", { willReadFrequently: true });
  if (!ctx) throw new Error("Canvas is unavailable.");

  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, MASK_WIDTH, MASK_HEIGHT);
  ctx.fillStyle = "#fff";
  for (const feature of geo.features) {
    const polygons = feature.geometry.type === "Polygon"
      ? [feature.geometry.coordinates]
      : feature.geometry.coordinates;
    for (const polygon of polygons) {
      ctx.beginPath();
      for (const ring of polygon) {
        ring.forEach(([lon, lat], index) => {
          const x = ((lon + 180) / 360) * MASK_WIDTH;
          const y = ((90 - lat) / 180) * MASK_HEIGHT;
          if (index === 0) ctx.moveTo(x, y);
          else ctx.lineTo(x, y);
        });
        ctx.closePath();
      }
      ctx.fill("evenodd");
    }
  }

  const { data } = ctx.getImageData(0, 0, MASK_WIDTH, MASK_HEIGHT);
  return (lon, lat) => {
    const x = Math.min(MASK_WIDTH - 1, Math.max(0, Math.floor(((lon + 180) / 360) * MASK_WIDTH)));
    const y = Math.min(MASK_HEIGHT - 1, Math.max(0, Math.floor(((90 - lat) / 180) * MASK_HEIGHT)));
    return data[(y * MASK_WIDTH + x) * 4] > 127;
  };
}

function pick(pair: string[], noise: number, color: THREE.Color) {
  color.set(pair[Math.min(pair.length - 1, Math.floor(noise * pair.length))]);
}

function buildTerrain(land: LandMask): { mesh: THREE.Mesh; faces: FaceInfo[] } {
  const geometry = new THREE.IcosahedronGeometry(1, PLANET_DETAIL);
  const position = geometry.getAttribute("position") as THREE.BufferAttribute;
  const colors = new Float32Array(position.count * 3);
  const faces: FaceInfo[] = [];
  const color = new THREE.Color();
  const vertex = new THREE.Vector3();

  for (let face = 0; face < position.count / 3; face += 1) {
    const verts: Vector[] = [];
    for (let k = 0; k < 3; k += 1) {
      vertex.fromBufferAttribute(position, face * 3 + k);
      verts.push([vertex.x, vertex.y, vertex.z]);
    }
    const sum: Vector = [
      verts[0][0] + verts[1][0] + verts[2][0],
      verts[0][1] + verts[1][1] + verts[2][1],
      verts[0][2] + verts[1][2] + verts[2][2],
    ];
    const length = Math.hypot(...sum) || 1;
    const centroid: Vector = [sum[0] / length, sum[1] / length, sum[2] / length];
    const [clon, clat] = vectorToLonLat(centroid);
    const isLand = land(clon, clat);
    const region = valueNoise3(centroid[0] * 4.5 + 11, centroid[1] * 4.5, centroid[2] * 4.5);
    const fine = valueNoise3(centroid[0] * 36, centroid[1] * 36 + 5, centroid[2] * 36);
    const biome = biomeFor(clat, region);

    let coastal = false;
    let radius = 0;
    for (let k = 0; k < 3; k += 1) {
      const [x, y, z] = verts[k];
      const [lon, lat] = vectorToLonLat(verts[k]);
      const vertexLand = land(lon, lat);
      if (!vertexLand) coastal = true;
      const relief = valueNoise3(x * 42 + 3, y * 42, z * 42) * LAND_RELIEF * (biome === "snow" ? 0.7 : 1);
      const height = vertexLand ? LAND_HEIGHT + relief : 0;
      radius += 1 + height;
      position.setXYZ(face * 3 + k, x * (1 + height), y * (1 + height), z * (1 + height));
    }
    radius /= 3;

    if (!isLand) pick(PALETTE.ocean, fine, color);
    else if (coastal && biome !== "snow") pick(PALETTE.sand, fine, color);
    else pick(PALETTE[biome], fine, color);

    for (let k = 0; k < 3; k += 1) {
      colors[(face * 3 + k) * 3] = color.r;
      colors[(face * 3 + k) * 3 + 1] = color.g;
      colors[(face * 3 + k) * 3 + 2] = color.b;
    }

    if (isLand) faces.push({ centroid, radius, biome, coastal });
  }

  geometry.setAttribute("color", new THREE.BufferAttribute(colors, 3));
  geometry.computeVertexNormals();
  const material = new THREE.MeshLambertMaterial({ vertexColors: true, flatShading: true });
  const mesh = new THREE.Mesh(geometry, material);
  mesh.name = "terrain";
  return { mesh, faces };
}

function seededRandom(seed: number) {
  let state = seed >>> 0;
  return () => {
    state = (Math.imul(state, 1664525) + 1013904223) >>> 0;
    return state / 4294967296;
  };
}

const UP = new THREE.Vector3(0, 1, 0);

function placeInstances(
  mesh: THREE.InstancedMesh,
  spots: Array<{ face: FaceInfo; scale: number; lift: number; spin: number; tint?: string }>,
) {
  const matrix = new THREE.Matrix4();
  const quaternion = new THREE.Quaternion();
  const spinQuaternion = new THREE.Quaternion();
  const normal = new THREE.Vector3();
  const positionVector = new THREE.Vector3();
  const scaleVector = new THREE.Vector3();
  const color = new THREE.Color();

  spots.forEach(({ face, scale, lift, spin, tint }, index) => {
    normal.set(face.centroid[0], face.centroid[1], face.centroid[2]);
    positionVector.copy(normal).multiplyScalar(face.radius + lift * scale);
    quaternion.setFromUnitVectors(UP, normal);
    spinQuaternion.setFromAxisAngle(UP, spin);
    quaternion.multiply(spinQuaternion);
    scaleVector.setScalar(scale);
    matrix.compose(positionVector, quaternion, scaleVector);
    mesh.setMatrixAt(index, matrix);
    if (tint) mesh.setColorAt(index, color.set(tint));
  });
  mesh.instanceMatrix.needsUpdate = true;
  if (mesh.instanceColor) mesh.instanceColor.needsUpdate = true;
}

function buildDecorations(faces: FaceInfo[]): THREE.Group {
  const random = seededRandom(20260904);
  const group = new THREE.Group();
  group.name = "decorations";

  const trees: Array<{ face: FaceInfo; scale: number; lift: number; spin: number; tint?: string }> = [];
  const rocks: typeof trees = [];
  const crystals: typeof trees = [];

  for (const face of faces) {
    if (face.coastal) continue;
    const roll = random();
    if (face.biome === "forest" && roll < 0.12 && trees.length < MAX_TREES) {
      trees.push({ face, scale: 0.0065 + random() * 0.0045, lift: 0, spin: random() * Math.PI, tint: PALETTE.canopy[Math.floor(random() * PALETTE.canopy.length)] });
    } else if (face.biome === "meadow" && roll < 0.025 && trees.length < MAX_TREES) {
      trees.push({ face, scale: 0.0055 + random() * 0.0035, lift: 0, spin: random() * Math.PI, tint: PALETTE.canopy[2] });
    } else if (face.biome === "snow" && roll < 0.06 && crystals.length < MAX_CRYSTALS) {
      crystals.push({ face, scale: 0.006 + random() * 0.007, lift: 0, spin: random() * Math.PI });
    } else if (face.biome === "desert" && roll < 0.05 && rocks.length < MAX_ROCKS) {
      rocks.push({ face, scale: 0.005 + random() * 0.006, lift: 0.3, spin: random() * Math.PI, tint: PALETTE.desert[1] });
    } else if ((face.biome === "forest" || face.biome === "meadow") && roll > 0.985 && rocks.length < MAX_ROCKS) {
      rocks.push({ face, scale: 0.006 + random() * 0.007, lift: 0.3, spin: random() * Math.PI, tint: PALETTE.rock });
    }
  }

  const canopyGeometry = new THREE.ConeGeometry(1, 2.4, 5);
  canopyGeometry.translate(0, 1.6, 0);
  const canopy = new THREE.InstancedMesh(
    canopyGeometry,
    new THREE.MeshLambertMaterial({ flatShading: true }),
    Math.max(1, trees.length),
  );
  const trunkGeometry = new THREE.CylinderGeometry(0.22, 0.28, 0.9, 5);
  trunkGeometry.translate(0, 0.4, 0);
  const trunk = new THREE.InstancedMesh(
    trunkGeometry,
    new THREE.MeshLambertMaterial({ color: PALETTE.trunk, flatShading: true }),
    Math.max(1, trees.length),
  );
  placeInstances(canopy, trees);
  placeInstances(trunk, trees.map((tree) => ({ ...tree, tint: undefined })));
  canopy.count = trees.length;
  trunk.count = trees.length;

  const rockMesh = new THREE.InstancedMesh(
    new THREE.DodecahedronGeometry(1, 0),
    new THREE.MeshLambertMaterial({ flatShading: true }),
    Math.max(1, rocks.length),
  );
  placeInstances(rockMesh, rocks);
  rockMesh.count = rocks.length;

  const crystalGeometry = new THREE.ConeGeometry(0.55, 3.2, 4);
  crystalGeometry.translate(0, 1.5, 0);
  const crystalMesh = new THREE.InstancedMesh(
    crystalGeometry,
    new THREE.MeshLambertMaterial({ color: PALETTE.crystal, flatShading: true, emissive: "#8d7bd8", emissiveIntensity: 0.35 }),
    Math.max(1, crystals.length),
  );
  placeInstances(crystalMesh, crystals);
  crystalMesh.count = crystals.length;

  group.add(canopy, trunk, rockMesh, crystalMesh);
  return group;
}

function buildStars(): THREE.Points {
  const random = seededRandom(9);
  const positions = new Float32Array(STAR_COUNT * 3);
  for (let i = 0; i < STAR_COUNT; i += 1) {
    const direction = new THREE.Vector3(random() - 0.5, random() - 0.5, random() - 0.5).normalize();
    direction.multiplyScalar(28 + random() * 24);
    positions.set([direction.x, direction.y, direction.z], i * 3);
  }
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const material = new THREE.PointsMaterial({ color: "#8d7bd8", size: 0.14, sizeAttenuation: true, transparent: true, opacity: 0.55 });
  const stars = new THREE.Points(geometry, material);
  stars.name = "stars";
  return stars;
}

function buildAtmosphere(): THREE.Mesh {
  const material = new THREE.MeshBasicMaterial({
    color: "#8d7bd8",
    transparent: true,
    opacity: 0.22,
    side: THREE.BackSide,
    depthWrite: false,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(1.08, 48, 32), material);
  mesh.name = "atmosphere";
  return mesh;
}

function subsample(points: Coordinate[], max: number): Coordinate[] {
  if (points.length <= max) return points;
  const step = (points.length - 1) / (max - 1);
  const result: Coordinate[] = [];
  for (let i = 0; i < max; i += 1) result.push(points[Math.round(i * step)]);
  return result;
}

function toVector3(points: Vector[]): THREE.Vector3[] {
  return points.map(([x, y, z]) => new THREE.Vector3(x, y, z));
}

type RouteMesh = THREE.Mesh<THREE.TubeGeometry, THREE.MeshBasicMaterial> & { userData: { leg: JourneyLeg } };

function buildJourneys(
  legs: JourneyLeg[],
  selectedLegId: string | null,
  pathStyle: RailPathStyle,
): { group: THREE.Group; routes: RouteMesh[] } {
  const group = new THREE.Group();
  group.name = "journeys";
  const routes: RouteMesh[] = [];
  const markers: Array<{ position: Vector; scale: number; dim: boolean; mode: JourneyLeg["mode"] }> = [];

  for (const leg of legs) {
    const dim = Boolean(selectedLegId) && leg.id !== selectedLegId;
    const selected = leg.id === selectedLegId;
    let points: Vector[];
    if (leg.mode === "air") {
      points = liftedArcPoints(leg.origin.coordinates, leg.destination.coordinates, 72, ROUTE_RADIUS, 0.24);
    } else if (pathStyle === "straight") {
      points = greatCirclePoints(leg.origin.coordinates, leg.destination.coordinates, 48, ROUTE_RADIUS);
    } else {
      points = subsample(railCoordinates(leg, pathStyle), 180).map((coordinate) => lonLatToVector(coordinate, ROUTE_RADIUS));
    }

    const curve = new THREE.CatmullRomCurve3(toVector3(points), false, "catmullrom", 0);
    const geometry = new THREE.TubeGeometry(
      curve,
      Math.min(420, Math.max(24, points.length * 2)),
      selected ? 0.0072 : leg.mode === "air" ? 0.0044 : 0.005,
      6,
      false,
    );
    const material = new THREE.MeshBasicMaterial({
      color: leg.mode === "air" ? PALETTE.air : PALETTE.rail,
      transparent: dim,
      opacity: dim ? 0.28 : 1,
    });
    const mesh = new THREE.Mesh(geometry, material) as RouteMesh;
    mesh.userData = { leg };
    routes.push(mesh);
    group.add(mesh);

    markers.push(
      { position: lonLatToVector(leg.origin.coordinates, ROUTE_RADIUS), scale: selected ? 0.013 : 0.0105, dim, mode: leg.mode },
      { position: lonLatToVector(leg.destination.coordinates, ROUTE_RADIUS), scale: selected ? 0.013 : 0.0105, dim, mode: leg.mode },
    );
    if (leg.mode === "rail" && pathStyle === "actual" && Array.isArray(leg.stops)) {
      for (const stop of leg.stops) {
        if (stop.boarded) continue;
        markers.push({ position: lonLatToVector(stop.place.coordinates, ROUTE_RADIUS), scale: 0.0042, dim, mode: leg.mode });
      }
    }
  }

  if (markers.length > 0) {
    const markerMesh = new THREE.InstancedMesh(
      new THREE.SphereGeometry(1, 10, 8),
      new THREE.MeshBasicMaterial({ color: "#ffffff" }),
      markers.length,
    );
    const matrix = new THREE.Matrix4();
    const color = new THREE.Color();
    markers.forEach(({ position, scale, dim, mode }, index) => {
      matrix.makeScale(scale, scale, scale);
      matrix.setPosition(position[0], position[1], position[2]);
      markerMesh.setMatrixAt(index, matrix);
      markerMesh.setColorAt(index, color.set(dim ? PALETTE.markerDim : mode === "air" ? PALETTE.markerAir : PALETTE.markerRail));
    });
    markerMesh.instanceMatrix.needsUpdate = true;
    if (markerMesh.instanceColor) markerMesh.instanceColor.needsUpdate = true;
    group.add(markerMesh);
  }

  return { group, routes };
}

function disposeObject(object: THREE.Object3D) {
  object.traverse((child) => {
    if (child instanceof THREE.Mesh || child instanceof THREE.Points || child instanceof THREE.InstancedMesh) {
      child.geometry.dispose();
      const materials = Array.isArray(child.material) ? child.material : [child.material];
      for (const material of materials) material.dispose();
    }
  });
}

type CameraFlight = { from: THREE.Vector3; to: THREE.Vector3; start: number; duration: number };

type PlanetState = {
  scene: THREE.Scene;
  camera: THREE.PerspectiveCamera;
  renderer: THREE.WebGLRenderer;
  controls: OrbitControls;
  journeys: THREE.Group | null;
  routes: RouteMesh[];
  flight: CameraFlight | null;
  userMoved: boolean;
};

export default function PlanetGlobe({
  legs,
  selectedLegId = null,
  onSelectLeg,
  sidebarOpen = true,
  railPathStyle = "actual",
  continuousRotation = false,
}: {
  legs: JourneyLeg[];
  selectedLegId?: string | null;
  onSelectLeg?: (id: string) => void;
  sidebarOpen?: boolean;
  railPathStyle?: RailPathStyle;
  continuousRotation?: boolean;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const tooltipRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<PlanetState | null>(null);
  const onSelectLegRef = useRef(onSelectLeg);
  const sidebarOpenRef = useRef(sidebarOpen);
  const continuousRotationRef = useRef(continuousRotation);
  const [error, setError] = useState<string | null>(null);
  const [terrainReady, setTerrainReady] = useState(false);

  useEffect(() => {
    onSelectLegRef.current = onSelectLeg;
  }, [onSelectLeg]);

  // Scene setup runs once; journeys and camera framing update in the effects below.
  useEffect(() => {
    const container = containerRef.current;
    if (!container || sceneRef.current) return;

    let renderer: THREE.WebGLRenderer;
    try {
      renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, powerPreference: "high-performance" });
    } catch {
      queueMicrotask(() => setError("WebGL could not start in this browser."));
      return;
    }
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    renderer.setClearColor(0x000000, 0);
    container.appendChild(renderer.domElement);

    const scene = new THREE.Scene();
    const camera = new THREE.PerspectiveCamera(38, 1, 0.05, 120);
    const initialDirection = viewCenterFor([], null);
    camera.position.set(initialDirection[0] * 3.4, initialDirection[1] * 3.4, initialDirection[2] * 3.4);

    const controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.dampingFactor = 0.08;
    controls.enablePan = false;
    controls.minDistance = 1.3;
    controls.maxDistance = 4.6;
    controls.rotateSpeed = 0.55;
    controls.zoomSpeed = 0.7;
    controls.autoRotate = true;
    controls.autoRotateSpeed = 0.2;

    scene.add(new THREE.AmbientLight("#ffffff", 0.7));
    scene.add(new THREE.HemisphereLight("#ffffff", "#8d7bd8", 1.0));
    const sun = new THREE.DirectionalLight("#ffffff", 2.0);
    scene.add(sun);
    scene.add(buildStars(), buildAtmosphere());

    const state: PlanetState = { scene, camera, renderer, controls, journeys: null, routes: [], flight: null, userMoved: false };
    sceneRef.current = state;

    const stopAutoRotate = () => {
      if (continuousRotationRef.current) return;
      controls.autoRotate = false;
      state.userMoved = true;
    };
    controls.addEventListener("start", stopAutoRotate);

    const resize = () => {
      const width = container.clientWidth || 1;
      const height = container.clientHeight || 1;
      renderer.setSize(width, height, false);
      camera.aspect = width / height;
      applyViewOffset(camera, width, height, sidebarOpenRef.current);
    };
    const resizeObserver = new ResizeObserver(resize);
    resizeObserver.observe(container);
    resize();

    let cancelled = false;
    loadLandMask()
      .then((land) => {
        if (cancelled) return;
        const { mesh, faces } = buildTerrain(land);
        scene.add(mesh, buildDecorations(faces));
        setTerrainReady(true);
      })
      .catch(() => {
        if (!cancelled) setError("The planet's coastlines could not be loaded.");
      });

    // Hover and click picking against the journey tubes only.
    const raycaster = new THREE.Raycaster();
    const pointer = new THREE.Vector2();
    let pointerDown: { x: number; y: number } | null = null;
    let hovered: RouteMesh | null = null;
    let pendingMove: PointerEvent | null = null;

    const pickAt = (event: PointerEvent): RouteMesh | null => {
      const rect = renderer.domElement.getBoundingClientRect();
      pointer.set(((event.clientX - rect.left) / rect.width) * 2 - 1, -((event.clientY - rect.top) / rect.height) * 2 + 1);
      raycaster.setFromCamera(pointer, camera);
      const hit = raycaster.intersectObjects(state.routes, false)[0];
      return (hit?.object as RouteMesh | undefined) ?? null;
    };

    const showTooltip = (event: PointerEvent, route: RouteMesh | null) => {
      const tooltip = tooltipRef.current;
      if (!tooltip) return;
      if (!route) {
        tooltip.hidden = true;
        renderer.domElement.style.cursor = "";
        return;
      }
      const card = journeyTooltip({ object: route.userData.leg });
      if (!card) return;
      if (hovered !== route) {
        tooltip.innerHTML = card.html;
        Object.assign(tooltip.style, card.style);
      }
      const rect = container.getBoundingClientRect();
      tooltip.style.left = `${event.clientX - rect.left + 14}px`;
      tooltip.style.top = `${event.clientY - rect.top + 14}px`;
      tooltip.hidden = false;
      renderer.domElement.style.cursor = "pointer";
    };

    const onPointerMove = (event: PointerEvent) => {
      pendingMove = event;
    };
    const onPointerDown = (event: PointerEvent) => {
      pointerDown = { x: event.clientX, y: event.clientY };
    };
    const onPointerUp = (event: PointerEvent) => {
      if (!pointerDown) return;
      const moved = Math.hypot(event.clientX - pointerDown.x, event.clientY - pointerDown.y);
      pointerDown = null;
      if (moved > 5) return;
      const route = pickAt(event);
      if (route) onSelectLegRef.current?.(route.userData.leg.id);
    };
    const onPointerLeave = () => {
      pendingMove = null;
      hovered = null;
      if (tooltipRef.current) tooltipRef.current.hidden = true;
      renderer.domElement.style.cursor = "";
    };
    renderer.domElement.addEventListener("pointermove", onPointerMove);
    renderer.domElement.addEventListener("pointerdown", onPointerDown);
    renderer.domElement.addEventListener("pointerup", onPointerUp);
    renderer.domElement.addEventListener("pointerleave", onPointerLeave);

    const sunOffset = new THREE.Vector3();
    let frame = 0;
    const animate = (now: number) => {
      frame = requestAnimationFrame(animate);

      if (state.flight) {
        const { from, to, start, duration } = state.flight;
        const t = Math.min(1, (now - start) / duration);
        const eased = 1 - Math.pow(1 - t, 3);
        const fromDirection = from.clone().normalize();
        const toDirection = to.clone().normalize();
        const direction = fromDirection.lerp(toDirection, eased).normalize();
        const distance = THREE.MathUtils.lerp(from.length(), to.length(), eased);
        camera.position.copy(direction.multiplyScalar(distance));
        if (t >= 1) state.flight = null;
      }

      controls.update();
      sunOffset.copy(camera.position).normalize();
      sun.position.copy(sunOffset).multiplyScalar(4).add(new THREE.Vector3(1.6, 2.4, 0));

      if (pendingMove && !pointerDown) {
        const route = pickAt(pendingMove);
        showTooltip(pendingMove, route);
        hovered = route;
        pendingMove = null;
      }

      renderer.render(scene, camera);
    };
    frame = requestAnimationFrame(animate);

    return () => {
      cancelled = true;
      cancelAnimationFrame(frame);
      resizeObserver.disconnect();
      controls.removeEventListener("start", stopAutoRotate);
      renderer.domElement.removeEventListener("pointermove", onPointerMove);
      renderer.domElement.removeEventListener("pointerdown", onPointerDown);
      renderer.domElement.removeEventListener("pointerup", onPointerUp);
      renderer.domElement.removeEventListener("pointerleave", onPointerLeave);
      controls.dispose();
      disposeObject(scene);
      renderer.dispose();
      renderer.domElement.remove();
      sceneRef.current = null;
    };
  }, []);

  useEffect(() => {
    continuousRotationRef.current = continuousRotation;
    const state = sceneRef.current;
    if (!state) return;
    state.controls.autoRotate = continuousRotation || (!state.userMoved && legs.length === 0 && !selectedLegId);
  }, [continuousRotation, legs.length, selectedLegId]);

  useEffect(() => {
    sidebarOpenRef.current = sidebarOpen;
    const state = sceneRef.current;
    const container = containerRef.current;
    if (!state || !container) return;
    applyViewOffset(state.camera, container.clientWidth || 1, container.clientHeight || 1, sidebarOpen);
  }, [sidebarOpen]);

  // Rebuild journey meshes whenever the data, selection or route style changes,
  // and fly the camera to frame what changed.
  useEffect(() => {
    const state = sceneRef.current;
    if (!state) return;

    if (state.journeys) {
      state.scene.remove(state.journeys);
      disposeObject(state.journeys);
    }
    const { group, routes } = buildJourneys(legs, selectedLegId, railPathStyle);
    state.scene.add(group);
    state.journeys = group;
    state.routes = routes;

    const direction = viewCenterFor(legs, selectedLegId);
    const distance = viewDistanceFor(legs, selectedLegId);
    const target = new THREE.Vector3(direction[0], direction[1], direction[2]).multiplyScalar(distance);
    state.flight = {
      from: state.camera.position.clone(),
      to: target,
      start: performance.now(),
      duration: 750,
    };
    // Journey framing normally stops the idle spin; the landing and login
    // compositions explicitly keep rotating to showcase the 3D view.
    if (!continuousRotation && (legs.length > 0 || selectedLegId)) state.controls.autoRotate = false;
  }, [continuousRotation, legs, railPathStyle, selectedLegId]);

  if (error) {
    return (
      <div className="map-error" role="alert">
        <strong>The 3D planet could not load.</strong>
        <span>{error} Check hardware acceleration and reload the page.</span>
      </div>
    );
  }

  return (
    <div ref={containerRef} className="planet-globe" aria-label="3D journey planet">
      <div ref={tooltipRef} className="planet-tooltip" hidden />
      {!terrainReady && (
        <div className="planet-loading" aria-live="polite">
          <span className="map-loading__mark" />
          <span>Shaping your planet…</span>
        </div>
      )}
      <div className="planet-hint" aria-hidden="true">
        Drag to orbit · Scroll to zoom · Click a route
      </div>
    </div>
  );
}

function applyViewOffset(camera: THREE.PerspectiveCamera, width: number, height: number, sidebarOpen: boolean) {
  const compact = window.innerWidth <= 760;
  if (sidebarOpen && !compact) camera.setViewOffset(width, height, -SIDEBAR_SHIFT_PX, 0, width, height);
  else if (sidebarOpen && compact) camera.setViewOffset(width, height, 0, COMPACT_SHIFT_PX, width, height);
  else camera.clearViewOffset();
  camera.updateProjectionMatrix();
}
