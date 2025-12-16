const canvas = document.querySelector<HTMLCanvasElement>("#space")!;
const ctx = canvas.getContext("2d")!;
const modeSelect = document.querySelector<HTMLSelectElement>("#mode")!;
const slidersHost = document.querySelector<HTMLDivElement>("#sliders")!;

const DPR = () => Math.min(window.devicePixelRatio || 1, 2.5);

const defaultParams = {
  speed: 2.5,
  trailLength: 340,
  glowStrength: 1.1,
  noiseAmplitude: 0.4,
  keepBand: 0.28,
  pauseDuration: 90,
  axisOpacity: 0.08,
};

type Mode = "run" | "stay" | "keep" | "pause";

type Params = typeof defaultParams;

interface Point {
  x: number;
  y: number;
  age: number;
}

const ranges: Record<keyof Params, { min: number; max: number; step: number; label: string }> = {
  speed: { min: 0.5, max: 6, step: 0.1, label: "Speed" },
  trailLength: { min: 60, max: 600, step: 10, label: "Trail Length" },
  glowStrength: { min: 0.2, max: 2.5, step: 0.1, label: "Glow" },
  noiseAmplitude: { min: 0, max: 1.2, step: 0.05, label: "Noise" },
  keepBand: { min: 0.05, max: 0.8, step: 0.01, label: "Keep Band" },
  pauseDuration: { min: 10, max: 220, step: 5, label: "Pause Frames" },
  axisOpacity: { min: 0, max: 0.3, step: 0.01, label: "Axis Opacity" },
};

let params: Params = { ...defaultParams };
let mode: Mode = "run";
let points: Point[] = [];
let baseDir = { x: 1, y: 0 };
let pausedFrames = 0;
let t = 0;

function setupUI() {
  slidersHost.innerHTML = "";
  Object.entries(ranges).forEach(([key, meta]) => {
    const id = `range-${key}`;
    const row = document.createElement("div");
    row.className = "range-row";
    const label = document.createElement("label");
    label.htmlFor = id;
    label.textContent = meta.label;
    const input = document.createElement("input");
    input.type = "range";
    input.id = id;
    input.min = meta.min.toString();
    input.max = meta.max.toString();
    input.step = meta.step.toString();
    input.value = params[key as keyof Params].toString();
    const valueEl = document.createElement("span");
    valueEl.className = "value";
    valueEl.textContent = formatValue(key as keyof Params, params[key as keyof Params]);
    input.addEventListener("input", () => {
      const v = Number(input.value);
      params = { ...params, [key]: v } as Params;
      valueEl.textContent = formatValue(key as keyof Params, v);
      if (key === "trailLength") {
        points = points.slice(-Math.floor(params.trailLength));
      }
    });
    row.append(label, input, valueEl);
    slidersHost.appendChild(row);
  });

  modeSelect.addEventListener("change", () => {
    mode = modeSelect.value as Mode;
    resetPath();
  });

  document.querySelectorAll<HTMLButtonElement>("[data-capture]").forEach((btn) => {
    btn.addEventListener("click", () => capture(btn.dataset.capture || "frame"));
  });
}

function formatValue(key: keyof Params, value: number) {
  if (key === "trailLength" || key === "pauseDuration") return Math.round(value).toString();
  return value.toFixed(2);
}

function resize() {
  const dpr = DPR();
  const { clientWidth, clientHeight } = canvas;
  canvas.width = Math.max(1, Math.floor(clientWidth * dpr));
  canvas.height = Math.max(1, Math.floor(clientHeight * dpr));
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
}

function resetPath() {
  const { width, height } = canvas.getBoundingClientRect();
  points = [
    { x: width * 0.3, y: height * 0.5, age: 0 },
    { x: width * 0.32, y: height * 0.5, age: 1 },
  ];
  baseDir = { x: 1, y: 0 };
  pausedFrames = 0;
}

function randNorm() {
  return (Math.random() * 2 - 1);
}

function stepRun(step: number, { width, height }: DOMRect) {
  const dirJitter = params.noiseAmplitude * 0.7;
  baseDir.x += randNorm() * dirJitter;
  baseDir.y += randNorm() * dirJitter * 0.6;
  const len = Math.hypot(baseDir.x, baseDir.y) || 1;
  baseDir.x /= len;
  baseDir.y /= len;
  const proposed = { x: points[points.length - 1].x + baseDir.x * step, y: points[points.length - 1].y + baseDir.y * step };

  let attempts = 0;
  while (intersectsExisting(points[points.length - 1], proposed) && attempts < 12) {
    const angle = (Math.random() - 0.5) * Math.PI * 0.35;
    const cos = Math.cos(angle);
    const sin = Math.sin(angle);
    const nx = baseDir.x * cos - baseDir.y * sin;
    const ny = baseDir.x * sin + baseDir.y * cos;
    baseDir = { x: nx, y: ny };
    proposed.x = points[points.length - 1].x + baseDir.x * step;
    proposed.y = points[points.length - 1].y + baseDir.y * step;
    attempts += 1;
  }

  // keep slowly drifting forward across the canvas
  if (proposed.x > width * 0.9) {
    proposed.x = width * 0.1;
    points = points.slice(-Math.floor(params.trailLength / 2));
  }
  proposed.y = clamp(proposed.y, height * 0.05, height * 0.95);
  appendPoint(proposed);
}

function stepStay(step: number, { width, height }: DOMRect) {
  const center = { x: width * 0.5, y: height * 0.5 };
  const last = points[points.length - 1];
  const jitter = params.noiseAmplitude + 0.2;
  const dx = Math.cos(t * 0.01) * jitter * 12 + randNorm() * jitter * 6;
  const dy = Math.sin(t * 0.013) * jitter * 12 + randNorm() * jitter * 6;
  const target = { x: last.x + dx, y: last.y + dy };
  const towardsCenter = 0.04;
  target.x = mix(target.x, center.x, towardsCenter);
  target.y = mix(target.y, center.y, towardsCenter);
  appendPoint(target);
}

function stepKeep(step: number, { width, height }: DOMRect) {
  const band = height * params.keepBand;
  const centerY = height * 0.5;
  const last = points[points.length - 1];
  baseDir.x = Math.max(0.4, baseDir.x + randNorm() * 0.1);
  baseDir.y += randNorm() * params.noiseAmplitude * 0.5;
  const len = Math.hypot(baseDir.x, baseDir.y) || 1;
  baseDir.x /= len;
  baseDir.y /= len;
  let next = {
    x: last.x + baseDir.x * step,
    y: last.y + baseDir.y * step,
  };
  if (next.y > centerY + band) next.y = centerY + band - randNorm() * 4;
  if (next.y < centerY - band) next.y = centerY - band + randNorm() * 4;
  if (next.x > width * 0.98) {
    next.x = width * 0.1;
    baseDir.x = 0.8;
  }
  appendPoint(next);
}

function stepPause(step: number, dims: DOMRect) {
  if (pausedFrames > 0) {
    pausedFrames -= 1;
    const last = points[points.length - 1];
    const jitter = params.noiseAmplitude * 4 + 0.5;
    appendPoint({ x: last.x + randNorm() * jitter, y: last.y + randNorm() * jitter, age: 0 });
    return;
  }
  const last = points[points.length - 1];
  baseDir.x += randNorm() * params.noiseAmplitude * 0.6;
  baseDir.y += randNorm() * params.noiseAmplitude * 0.6;
  const len = Math.hypot(baseDir.x, baseDir.y) || 1;
  baseDir.x /= len;
  baseDir.y /= len;
  appendPoint({ x: last.x + baseDir.x * step * 0.8, y: last.y + baseDir.y * step * 0.8, age: 0 });
  if (Math.random() < 0.015 + params.noiseAmplitude * 0.02) {
    pausedFrames = Math.round(params.pauseDuration);
  }
  wrapIfNeeded(dims);
}

function wrapIfNeeded({ width, height }: DOMRect) {
  const last = points[points.length - 1];
  if (last.x > width * 0.98) last.x = width * 0.02;
  if (last.x < width * 0.02) last.x = width * 0.98;
  if (last.y > height * 0.98) last.y = height * 0.98;
  if (last.y < height * 0.02) last.y = height * 0.02;
}

function appendPoint(p: { x: number; y: number; age?: number }) {
  points.push({ ...p, age: t });
  const maxPoints = Math.max(3, Math.floor(params.trailLength));
  if (points.length > maxPoints) {
    points = points.slice(points.length - maxPoints);
  }
}

function intersectsExisting(a: Point, b: { x: number; y: number }) {
  if (points.length < 3) return false;
  for (let i = 0; i < points.length - 2; i++) {
    if (segmentsIntersect(points[i], points[i + 1], a, b)) return true;
  }
  return false;
}

function segmentsIntersect(p1: Point, p2: Point, p3: { x: number; y: number }, p4: { x: number; y: number }) {
  const d = (p4.y - p3.y) * (p2.x - p1.x) - (p4.x - p3.x) * (p2.y - p1.y);
  if (d === 0) return false;
  const ua = ((p4.x - p3.x) * (p1.y - p3.y) - (p4.y - p3.y) * (p1.x - p3.x)) / d;
  const ub = ((p2.x - p1.x) * (p1.y - p3.y) - (p2.y - p1.y) * (p1.x - p3.x)) / d;
  return ua > 0 && ua < 1 && ub > 0 && ub < 1;
}

function clamp(v: number, min: number, max: number) {
  return Math.min(Math.max(v, min), max);
}

function mix(a: number, b: number, tVal: number) {
  return a * (1 - tVal) + b * tVal;
}

function draw() {
  const { width, height } = canvas.getBoundingClientRect();
  ctx.clearRect(0, 0, width, height);
  ctx.fillStyle = "#000";
  ctx.fillRect(0, 0, width, height);

  if (params.axisOpacity > 0) {
    ctx.save();
    ctx.strokeStyle = `rgba(120,150,200,${params.axisOpacity})`;
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(width / 2, 0);
    ctx.lineTo(width / 2, height);
    ctx.moveTo(0, height / 2);
    ctx.lineTo(width, height / 2);
    ctx.stroke();
    ctx.restore();
  }

  if (points.length < 2) return;
  const layers = [
    { width: 16, alpha: 0.08 * params.glowStrength, blur: 24 },
    { width: 8, alpha: 0.16 * params.glowStrength, blur: 12 },
    { width: 3, alpha: 0.9, blur: 0 },
  ];

  layers.forEach((layer) => {
    ctx.save();
    ctx.lineJoin = "round";
    ctx.lineCap = "round";
    ctx.strokeStyle = `rgba(120, 220, 255, ${layer.alpha})`;
    ctx.lineWidth = layer.width;
    ctx.shadowBlur = layer.blur;
    ctx.shadowColor = `rgba(120,220,255,${layer.alpha})`;

    ctx.beginPath();
    for (let i = 0; i < points.length; i++) {
      const p = points[i];
      const fade = i / points.length;
      const localAlpha = Math.pow(fade, 1.5);
      ctx.globalAlpha = localAlpha;
      if (i === 0) ctx.moveTo(p.x, p.y);
      else ctx.lineTo(p.x, p.y);
    }
    ctx.stroke();
    ctx.restore();
  });

  // leading orb
  const head = points[points.length - 1];
  const glow = 16 * params.glowStrength;
  const gradient = ctx.createRadialGradient(head.x, head.y, 0, head.x, head.y, glow * 1.4);
  gradient.addColorStop(0, "rgba(255,255,255,0.95)");
  gradient.addColorStop(0.3, "rgba(120,220,255,0.8)");
  gradient.addColorStop(1, "rgba(0,0,0,0)");
  ctx.fillStyle = gradient;
  ctx.beginPath();
  ctx.arc(head.x, head.y, glow * 1.4, 0, Math.PI * 2);
  ctx.fill();
}

function animate() {
  t += 1;
  const dims = canvas.getBoundingClientRect();
  const step = params.speed * 2.4;
  switch (mode) {
    case "run":
      stepRun(step, dims);
      break;
    case "stay":
      stepStay(step, dims);
      break;
    case "keep":
      stepKeep(step, dims);
      break;
    case "pause":
      stepPause(step, dims);
      break;
  }
  draw();
  requestAnimationFrame(animate);
}

function capture(label: string) {
  const link = document.createElement("a");
  link.download = `state-space-${label}.png`;
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function init() {
  setupUI();
  resize();
  resetPath();
  window.addEventListener("resize", resize);
  requestAnimationFrame(animate);
}

init();
