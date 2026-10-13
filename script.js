const f = (v, d) => v.toFixed(d).replace(".", ",");

// ---------- Utilidad para graficar en canvas (sin librerías) ----------
function plot(canvas, series, opts) {
  const ctx = canvas.getContext("2d");
  const W = canvas.width, H = canvas.height;
  const m = { l: 64, r: 30, t: 28, b: 48 };
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = "#fff";
  ctx.fillRect(0, 0, W, H);

  let xs = [], ys = [];
  series.forEach(s => { xs.push(...s.x); ys.push(...s.y); });
  let xmin = opts.xmin ?? Math.min(...xs), xmax = opts.xmax ?? Math.max(...xs);
  let ymin = opts.ymin ?? Math.min(...ys), ymax = opts.ymax ?? Math.max(...ys);
  if (ymin === ymax) { ymin -= 1; ymax += 1; }
  const pad = (ymax - ymin) * 0.08;
  if (opts.ymin === undefined) ymin -= pad;
  if (opts.ymax === undefined) ymax += pad;
  if (opts.equal) {
    // misma escala en x e y (para trayectorias)
    const sx = (W - m.l - m.r) / (xmax - xmin), sy = (H - m.t - m.b) / (ymax - ymin);
    if (sx < sy) { const c = (ymin + ymax) / 2, h = (H - m.t - m.b) / sx / 2; ymin = c - h; ymax = c + h; }
    else { const c = (xmin + xmax) / 2, w = (W - m.l - m.r) / sy / 2; xmin = c - w; xmax = c + w; }
  }
  const X = v => m.l + (v - xmin) / (xmax - xmin) * (W - m.l - m.r);
  const Y = v => H - m.b - (v - ymin) / (ymax - ymin) * (H - m.t - m.b);

  // rejilla y marcas
  ctx.font = "12px system-ui, sans-serif";
  ctx.strokeStyle = "#e6e8eb"; ctx.fillStyle = "#5b6168"; ctx.lineWidth = 1;
  const ticks = (a, b, n) => {
    const step = Math.pow(10, Math.floor(Math.log10((b - a) / n)));
    const err = (b - a) / n / step;
    const s = step * (err >= 5 ? 10 : err >= 2 ? 5 : err >= 1.5 ? 2 : 1);
    const out = [];
    for (let v = Math.ceil(a / s) * s; v <= b + 1e-9; v += s) out.push(+v.toFixed(10));
    return out;
  };
  ctx.textAlign = "center";
  ticks(xmin, xmax, 8).forEach(v => {
    ctx.beginPath(); ctx.moveTo(X(v), m.t); ctx.lineTo(X(v), H - m.b); ctx.stroke();
    ctx.fillText(+v.toFixed(2), X(v), H - m.b + 16);
  });
  ctx.textAlign = "right";
  ticks(ymin, ymax, 6).forEach(v => {
    ctx.beginPath(); ctx.moveTo(m.l, Y(v)); ctx.lineTo(W - m.r, Y(v)); ctx.stroke();
    ctx.fillText(+v.toFixed(2), m.l - 6, Y(v) + 4);
  });
  // ejes
  ctx.strokeStyle = "#1f2328";
  ctx.strokeRect(m.l, m.t, W - m.l - m.r, H - m.t - m.b);
  ctx.fillStyle = "#1f2328"; ctx.textAlign = "center";
  ctx.fillText(opts.xlabel, (m.l + W - m.r) / 2, H - 10);
  ctx.save(); ctx.translate(16, (m.t + H - m.b) / 2); ctx.rotate(-Math.PI / 2);
  ctx.fillText(opts.ylabel, 0, 0); ctx.restore();

  // series
  ctx.save();
  ctx.beginPath(); ctx.rect(m.l, m.t, W - m.l - m.r, H - m.t - m.b); ctx.clip();
  series.forEach(s => {
    ctx.strokeStyle = s.color; ctx.lineWidth = s.width || 2;
    ctx.setLineDash(s.dash || []);
    ctx.beginPath();
    s.x.forEach((x, i) => i ? ctx.lineTo(X(x), Y(s.y[i])) : ctx.moveTo(X(x), Y(s.y[i])));
    ctx.stroke();
    (s.points || []).forEach(p => {
      ctx.fillStyle = s.color; ctx.beginPath(); ctx.arc(X(p[0]), Y(p[1]), 5, 0, 2 * Math.PI); ctx.fill();
    });
  });
  ctx.restore();
  ctx.setLineDash([]);

  // leyenda
  let lx = m.l + 10;
  ctx.textAlign = "left";
  series.filter(s => s.label).forEach(s => {
    ctx.strokeStyle = s.color; ctx.lineWidth = 3; ctx.setLineDash(s.dash || []);
    ctx.beginPath(); ctx.moveTo(lx, m.t - 12); ctx.lineTo(lx + 22, m.t - 12); ctx.stroke();
    ctx.setLineDash([]);
    ctx.fillStyle = "#1f2328"; ctx.fillText(s.label, lx + 28, m.t - 8);
    lx += 40 + ctx.measureText(s.label).width;
  });
  return { X, Y };
}

const C1 = "#1f6feb", C2 = "#d1495b", C3 = "#2a9d8f", C4 = "#6c757d";

// ---------- Tema 1: ruta del dron ----------
// Ruta declarada (plano horizontal, origen en el centro de distribución, x = este, y = norte):
// A) 0–10 s: acelera hacia el este a 1,5 m/s² desde el reposo
// B) 10–30 s: crucero al este a 15 m/s
// C) giro a la izquierda en arco de radio 60 m a 15 m/s (90°)
// D) 20 s de crucero al norte a 15 m/s
// E) 10 s frenando a 1,5 m/s² hasta detenerse sobre el punto de entrega
function rutaDron(dt = 0.1) {
  const a0 = 1.5, v = 15, R = 60, w = v / R;
  const tA = 10, tB = 30, tC = tB + (Math.PI / 2) / w, tD = tC + 20, tE = tD + 10;
  const xB = 0.5 * a0 * tA * tA + v * (tB - tA); // 375 m
  const yC = R, xC = xB + R;                     // fin del arco: (435, 60)
  const yD = yC + v * (tD - tC);
  const d = [];
  for (let t = 0; t <= tE + 1e-9; t += dt) {
    let x, y, vx, vy, ax, ay;
    if (t <= tA) { x = 0.5 * a0 * t * t; y = 0; vx = a0 * t; vy = 0; ax = a0; ay = 0; }
    else if (t <= tB) { x = 0.5 * a0 * tA * tA + v * (t - tA); y = 0; vx = v; vy = 0; ax = 0; ay = 0; }
    else if (t <= tC) {
      const th = -Math.PI / 2 + w * (t - tB);
      x = xB + R * Math.cos(th); y = R + R * Math.sin(th);
      vx = -R * w * Math.sin(th); vy = R * w * Math.cos(th);
      ax = -R * w * w * Math.cos(th); ay = -R * w * w * Math.sin(th);
    }
    else if (t <= tD) { x = xC; y = yC + v * (t - tC); vx = 0; vy = v; ax = 0; ay = 0; }
    else { const s = t - tD; x = xC; y = yD + v * s - 0.5 * a0 * s * s; vx = 0; vy = v - a0 * s; ax = 0; ay = -a0; }
    d.push({ t, x, y, vx, vy, ax, ay });
  }
  return d;
}

function tema1() {
  const d = rutaDron();
  const t = d.map(p => p.t);
  plot(document.getElementById("t1-tray"), [
    { x: d.map(p => p.x), y: d.map(p => p.y), color: C1, label: "trayectoria",
      points: [[0, 0], [d.at(-1).x, d.at(-1).y]] }
  ], { xlabel: "x (este) [m]", ylabel: "y (norte) [m]", equal: true });
  plot(document.getElementById("t1-pos"), [
    { x: t, y: d.map(p => p.x), color: C1, label: "x(t)" },
    { x: t, y: d.map(p => p.y), color: C2, label: "y(t)" }
  ], { xlabel: "tiempo [s]", ylabel: "posición [m]" });
  plot(document.getElementById("t1-vel"), [
    { x: t, y: d.map(p => p.vx), color: C1, label: "vx" },
    { x: t, y: d.map(p => p.vy), color: C2, label: "vy" },
    { x: t, y: d.map(p => Math.hypot(p.vx, p.vy)), color: C4, dash: [6, 4], label: "|v|" }
  ], { xlabel: "tiempo [s]", ylabel: "velocidad [m/s]" });
  plot(document.getElementById("t1-acc"), [
    { x: t, y: d.map(p => p.ax), color: C1, label: "ax" },
    { x: t, y: d.map(p => p.ay), color: C2, label: "ay" },
    { x: t, y: d.map(p => Math.hypot(p.ax, p.ay)), color: C4, dash: [6, 4], label: "|a|" }
  ], { xlabel: "tiempo [s]", ylabel: "aceleración [m/s²]" });

  document.getElementById("t1-csv").addEventListener("click", () => {
    const rows = ["t_s,x_m,y_m,vx_ms,vy_ms,ax_ms2,ay_ms2"].concat(
      d.map(p => [p.t, p.x, p.y, p.vx, p.vy, p.ax, p.ay].map(v => v.toFixed(3)).join(",")));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([rows.join("\n")], { type: "text/csv" }));
    a.download = "ruta_dron.csv"; a.click();
  });
}

// ---------- Tema 2: simulación del salto ----------
function tema2() {
  const cv = document.getElementById("t2-canvas");
  const sV = document.getElementById("t2-v0"), sG = document.getElementById("t2-g"), sM = document.getElementById("t2-m");
  const oV = document.getElementById("t2-v0-o"), oG = document.getElementById("t2-g-o"), oM = document.getElementById("t2-m-o");
  const out = document.getElementById("t2-out");
  const vx = 6; // velocidad horizontal fija del personaje [m/s]
  let anim = null;

  function trayectoria(v0, g, mult) {
    const tUp = v0 / g, h = v0 * v0 / (2 * g);
    const tDown = Math.sqrt(2 * h / (g * mult));
    const xs = [], ys = [], N = 200, T = tUp + tDown;
    for (let i = 0; i <= N; i++) {
      const t = T * i / N;
      const y = t <= tUp ? v0 * t - 0.5 * g * t * t : h - 0.5 * g * mult * (t - tUp) ** 2;
      xs.push(vx * t); ys.push(Math.max(0, y));
    }
    return { xs, ys, h, tUp, tDown, T };
  }

  function dibujar() {
    const v0 = +sV.value, g = +sG.value, mult = +sM.value;
    oV.textContent = f(v0, 1) + " m/s";
    oG.textContent = f(g, 2) + " m/s²";
    oM.textContent = "× " + f(mult, 1);
    const j = trayectoria(v0, g, mult);
    const real = trayectoria(v0, 9.81, 1);
    const maxX = Math.max(12, real.xs.at(-1), j.xs.at(-1)) * 1.05;
    const maxY = Math.max(2, real.h, j.h) * 1.15;
    const ax = plot(cv, [
      { x: real.xs, y: real.ys, color: C4, dash: [6, 4], label: "mismo impulso con g = 9,81 (realista)" },
      { x: j.xs, y: j.ys, color: C1, width: 3, label: "salto del juego" }
    ], { xlabel: "distancia horizontal [m]", ylabel: "altura [m]", xmin: 0, xmax: maxX, ymin: 0, ymax: maxY });
    out.innerHTML =
      `Altura máxima h = v₀²/(2g) = <b>${f(j.h, 2)} m</b> · ` +
      `subida = v₀/g = <b>${f(j.tUp, 2)} s</b> · bajada = √(2h/(m·g)) = <b>${f(j.tDown, 2)} s</b> · ` +
      `tiempo en el aire = <b>${f(j.T, 2)} s</b> (con g = 9,81 y m = 1 serían ${f(real.T, 2)} s)`;

    // personaje animado recorriendo la trayectoria recalculada
    cancelAnimationFrame(anim);
    const ctx = cv.getContext("2d"), base = ctx.getImageData(0, 0, cv.width, cv.height);
    const t0 = performance.now();
    const paso = now => {
      const t = ((now - t0) / 1000) % (j.T + 0.6);
      const i = Math.min(200, Math.round(200 * Math.min(t, j.T) / j.T));
      ctx.putImageData(base, 0, 0);
      ctx.fillStyle = C2;
      ctx.fillRect(ax.X(j.xs[i]) - 8, ax.Y(j.ys[i]) - 22, 16, 22);
      anim = requestAnimationFrame(paso);
    };
    anim = requestAnimationFrame(paso);
  }
  [sV, sG, sM].forEach(s => s.addEventListener("input", dibujar));
  document.querySelectorAll("[data-preset]").forEach(b => b.addEventListener("click", () => {
    const [v, g, m] = b.dataset.preset.split(",");
    sV.value = v; sG.value = g; sM.value = m; dibujar();
  }));
  dibujar();
}

// ---------- Tema 3: caso numérico de gravedad artificial ----------
function tema3() {
  const g = 9.81, filas = [];
  [1, 2, 3, 4].forEach(rpm => {
    const w = 2 * Math.PI * rpm / 60;
    filas.push(`<tr><td>${rpm}</td><td>${f(w, 4)}</td><td>${f((60 / rpm), 1)}</td><td>${f((g / (w * w)), 1)}</td></tr>`);
  });
  document.getElementById("t3-tabla").innerHTML = filas.join("");
}

// ---------- Tema 4: sensibilidad a la carga de una llanta ----------
function tema4() {
  const mu0 = 1.8, Fz0 = 4000, k = 0.25;
  const mu = Fz => mu0 * (1 - k * (Fz - Fz0) / Fz0) ; // coeficiente que cae con la carga
  const Fz = [], simple = [], real = [];
  for (let f = 0; f <= 10000; f += 100) { Fz.push(f); simple.push(mu0 * f); real.push(mu(f) * f); }
  plot(document.getElementById("t4-plot"), [
    { x: Fz, y: simple, color: C4, dash: [6, 4], label: "modelo simple F = μN (μ = 1,8 fijo)" },
    { x: Fz, y: real, color: C2, width: 3, label: "con sensibilidad a la carga",
      points: [[3000, mu(3000) * 3000], [5000, mu(5000) * 5000], [7000, mu(7000) * 7000]] }
  ], { xlabel: "carga vertical Fz [N]", ylabel: "fuerza lateral máxima Fy,máx [N]", xmin: 0, ymin: 0 });

  const par = 2 * mu(5000) * 5000, trans = mu(7000) * 7000 + mu(3000) * 3000;
  document.getElementById("t4-ej").innerHTML =
    `Eje con 5000 N en cada llanta: Fy = 2 × ${f((mu(5000) * 5000), 0)} = <b>${f(par, 0)} N</b>. ` +
    `Si en la curva pasan 2000 N a la llanta exterior (7000 / 3000 N): ` +
    `${f((mu(7000) * 7000), 0)} + ${f((mu(3000) * 3000), 0)} = <b>${f(trans, 0)} N</b>. ` +
    `La carga total es la misma, pero el eje pierde ${f((par - trans), 0)} N de agarre lateral.`;
}

// ---------- Tema 5: curva fuerza–desplazamiento del gatillo ----------
function tema5() {
  const sK = document.getElementById("t5-k"), oK = document.getElementById("t5-k-o");
  function dibujar() {
    const k = +sK.value; // N/mm
    oK.textContent = f(k, 2) + " N/mm";
    const xs = [], resorte = [], arco = [];
    for (let x = 0; x <= 10; x += 0.05) {
      xs.push(x);
      resorte.push(k * x);                  // resorte ideal: F = k x
      arco.push(x < 2 ? 0 : x <= 8 ? k * (x - 2) : 0); // "arco": tensa entre 2 y 8 mm y suelta
    }
    plot(document.getElementById("t5-plot"), [
      { x: xs, y: resorte, color: C4, dash: [6, 4], label: "resorte ideal F = k·x" },
      { x: xs, y: arco, color: C3, width: 3, label: "efecto «arco» programado" }
    ], { xlabel: "recorrido del gatillo x [mm]", ylabel: "fuerza de resistencia [N]", xmin: 0, xmax: 10, ymin: 0 });
  }
  sK.addEventListener("input", dibujar);
  dibujar();
}

tema1(); tema2(); tema3(); tema4(); tema5();

// ---------- Menú: bajada suave y tema resaltado ----------
const enlaces = document.querySelectorAll("nav a");
enlaces.forEach(a => a.addEventListener("click", e => {
  const destino = document.querySelector(a.getAttribute("href"));
  if (!destino) return;
  e.preventDefault();
  const altoMenu = document.querySelector("nav").offsetHeight;
  const inicio = window.scrollY;
  const fin = destino.getBoundingClientRect().top + window.scrollY - altoMenu - 12;
  const duracion = 1200; // ms
  const t0 = performance.now();
  const suave = t => t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
  const paso = ahora => {
    const t = Math.min(1, (ahora - t0) / duracion);
    window.scrollTo(0, inicio + (fin - inicio) * suave(t));
    if (t < 1) requestAnimationFrame(paso);
  };
  requestAnimationFrame(paso);
  history.replaceState(null, "", a.getAttribute("href"));
}));

const marcarActivo = () => {
  const altoMenu = document.querySelector("nav").offsetHeight + 40;
  let actual = null;
  enlaces.forEach(a => {
    const s = document.querySelector(a.getAttribute("href"));
    if (s && s.getBoundingClientRect().top <= altoMenu) actual = a;
  });
  enlaces.forEach(a => a.classList.toggle("activo", a === actual));
};
window.addEventListener("scroll", marcarActivo, { passive: true });
marcarActivo();
