/*
 * © 2026 gamer-09. All rights reserved.
 * This code is proprietary. Unauthorized copying, modification,
 * distribution, or use of this software is strictly prohibited.
 *
 * ── October Halloween layer ──────────────────────────────────────────────
 * A date-gated, on-device 3D-projected motion backdrop: a moonlit graveyard
 * with parallax hills, carved pumpkins, bats, floating spirits, drifting fog,
 * rising embers and a camera that eases toward the pointer.
 *
 * Nothing is loaded from the network and no images are used. The only stored
 * values are two local preference flags (theme on/off, motion on/off).
 *
 * Loads AFTER glass-backdrop.js. It only runs during October — SEASON_YEAR is
 * pinned to 2026 so this is strictly "this October"; set it to null to make
 * the theme return every October instead.
 *
 * Exposes window.PTR29Halloween:
 *   active()        is the seasonal theme currently running?
 *   setEnabled(on)  turn the whole seasonal theme on/off (remembered)
 *   setMotion(on)   freeze/resume the scene (shares the glass motion flag)
 *   motionOn()      current motion preference
 *   refresh()       re-measure + repaint (resize)
 */
(function () {
  'use strict';

  var SEASON_MONTH = 9;     // October (zero-based)
  var SEASON_YEAR = null;   // null = every October; set a year to pin it
  var OFF_KEY = 'ptr29_halloween_off_v1';   // suffixed with the season year
  var MOTION_KEY = 'ptr29_glass_motion_v1';
  var TAU = Math.PI * 2;

  var today = new Date();
  if (today.getMonth() !== SEASON_MONTH) return;
  if (SEASON_YEAR !== null && today.getFullYear() !== SEASON_YEAR) return;

  var wrap = document.getElementById('glass-backdrop');
  if (!wrap) return;

  // ── layer + canvas ───────────────────────────────────────────────────────
  var layer = document.createElement('div');
  layer.id = 'halloween-backdrop';
  layer.setAttribute('aria-hidden', 'true');
  var canvas = document.createElement('canvas');
  canvas.id = 'hw-canvas';
  layer.appendChild(canvas);
  var scrim = document.getElementById('gb-scrim');
  if (scrim && scrim.parentNode === wrap) wrap.insertBefore(layer, scrim);
  else wrap.appendChild(layer);

  var ctx = canvas.getContext('2d', { alpha: false });
  if (!ctx) return;

  // ── state ────────────────────────────────────────────────────────────────
  var state = {
    active: false,
    motion: true,
    visible: true,
    quality: 'high',
    t: 0
  };
  var reducedMotion = false;
  try { reducedMotion = window.matchMedia('(prefers-reduced-motion: reduce)').matches; } catch (e) {}
  try {
    var savedMotion = localStorage.getItem(MOTION_KEY);
    state.motion = savedMotion === null ? !reducedMotion : savedMotion === '1';
  } catch (e) { state.motion = !reducedMotion; }

  var w = 0, h = 0, dpr = 1;
  var raf = 0, last = 0, lastPaint = 0, frames = 0, fpsAt = 0;
  var cam = { x: 0, y: 0, tx: 0, ty: 0 };
  var cxv = 0, cyv = 0;
  var sizeTimer = 0;

  // ── deterministic randomness (same sky every load) ───────────────────────
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  var R = rng(0x10F31A);

  // ── scene data ───────────────────────────────────────────────────────────
  var stars = [];
  for (var i = 0; i < 150; i++) {
    stars.push({
      x: R(),
      y: R() * 0.70,
      r: 0.35 + R() * 1.5,
      a: 0.20 + R() * 0.75,
      tw: R() * TAU,
      sp: 0.4 + R() * 2.0,
      tint: R()
    });
  }

  var clouds = [
    { x: 0.02, y: 0.14, w: 0.52, h: 0.075, sp: 0.006, a: 0.42 },
    { x: 0.46, y: 0.22, w: 0.42, h: 0.060, sp: 0.009, a: 0.34 },
    { x: 0.74, y: 0.10, w: 0.35, h: 0.055, sp: 0.004, a: 0.30 },
    { x: 0.21, y: 0.30, w: 0.58, h: 0.050, sp: 0.007, a: 0.24 }
  ];

  var fog = [];
  for (var f = 0; f < 8; f++) {
    fog.push({
      x: R(),
      y: 0.46 + R() * 0.46,
      w: 0.26 + R() * 0.42,
      h: 0.045 + R() * 0.075,
      sp: 0.006 + R() * 0.020,
      a: 0.05 + R() * 0.085,
      d: R(),
      tint: R()
    });
  }

  var pumpkins = [];
  var pumpkinCols = [-0.90, -0.55, -0.15, 0.20, 0.54, 0.86];
  for (var p = 0; p < pumpkinCols.length; p++) {
    var pd = 0.30 + R() * 0.66;
    pumpkins.push({
      nx: pumpkinCols[p] + (R() - 0.5) * 0.12,
      ny: 0.17 + R() * 0.31,
      d: pd,
      size: 0.058 + R() * 0.036,
      ph: R() * TAU,
      rot: (R() - 0.5) * 0.26,
      flick: 0.72 + R() * 0.42
    });
  }
  pumpkins.sort(function (a, b) { return a.d - b.d; });

  var bats = [];
  for (var b = 0; b < 9; b++) {
    bats.push({
      nx: R() * 2.6 - 1.3,
      ny: -0.98 + R() * 0.88,
      d: 0.06 + R() * 0.56,
      speed: (R() < 0.5 ? -1 : 1) * (0.030 + R() * 0.085),
      ph: R() * TAU,
      fs: 4.6 + R() * 6.4,
      amp: 0.010 + R() * 0.030,
      size: 0.011 + R() * 0.013
    });
  }

  var ghosts = [
    { nx: -0.44, ny: 0.02, d: 0.24, size: 0.028, ph: 0.4, a: 0.75 },
    { nx: 0.16, ny: -0.10, d: 0.38, size: 0.035, ph: 2.7, a: 0.60 },
    { nx: 0.63, ny: 0.06, d: 0.18, size: 0.023, ph: 4.9, a: 0.68 }
  ];

  var embers = [];
  for (var e = 0; e < 46; e++) {
    embers.push({
      nx: R() * 2.2 - 1.1,
      y: R(),
      d: 0.10 + R() * 0.80,
      sp: 0.020 + R() * 0.055,
      size: 0.0018 + R() * 0.0034,
      ph: R() * TAU,
      warm: R() < 0.74
    });
  }

  var trees = [];

  // ── offscreen sprites (cheap per-frame glow) ─────────────────────────────
  function makeSprite(rgb) {
    var c = document.createElement('canvas');
    c.width = c.height = 48;
    var g2 = c.getContext('2d');
    var g = g2.createRadialGradient(24, 24, 0, 24, 24, 24);
    g.addColorStop(0, 'rgba(' + rgb + ',1)');
    g.addColorStop(0.28, 'rgba(' + rgb + ',.72)');
    g.addColorStop(0.62, 'rgba(' + rgb + ',.20)');
    g.addColorStop(1, 'rgba(' + rgb + ',0)');
    g2.fillStyle = g;
    g2.fillRect(0, 0, 48, 48);
    return c;
  }
  var emberWarm = makeSprite('255,156,64');
  var emberCool = makeSprite('186,128,255');

  // ── geometry ─────────────────────────────────────────────────────────────
  function pxX(nx, d) {
    return w * 0.5 + nx * (w * 0.5) * (0.62 + d * 0.52) - cxv * (10 + d * 34);
  }
  function pxY(ny, d) {
    return h * 0.58 + ny * (h * 0.5) * (0.52 + d * 0.66) - cyv * (8 + d * 24);
  }
  function ridgeY(x, base, amp, phase, shift) {
    var u = (x - cxv * shift) / (w || 1);
    return base +
      Math.sin(u * 7.4 + phase + state.t * 0.012) * amp +
      Math.sin(u * 17.3 + phase * 1.7) * amp * 0.35;
  }
  function hash(n) {
    var s = Math.sin(n * 127.1 + 311.7) * 43758.5453;
    return s - Math.floor(s);
  }

  // ── sizing ───────────────────────────────────────────────────────────────
  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, state.quality === 'high' ? 1.6 : 1.15);
    var rs = state.quality === 'high' ? 0.85 : 0.62;
    w = layer.clientWidth || window.innerWidth || 1;
    h = layer.clientHeight || window.innerHeight || 1;
    canvas.width = Math.max(2, Math.round(w * dpr * rs));
    canvas.height = Math.max(2, Math.round(h * dpr * rs));
    var k = dpr * rs;
    ctx.setTransform(k, 0, 0, k, 0, 0);
    buildTrees();
  }

  function buildTrees() {
    trees = [];
    var sc = Math.min(w, h) / 900;
    trees.push(makeTree(w * 0.03, h * 1.03, 160 * sc, -0.22, 7, 0xB01));
    trees.push(makeTree(w * 0.98, h * 1.05, 185 * sc, 0.20, 7, 0xB02));
  }

  function makeTree(baseX, baseY, len, lean, depth, seed) {
    var rr = rng(seed);
    var segs = [];
    (function branch(x, y, l, ang, d, wid) {
      if (d <= 0 || l < 4) return;
      var x2 = x + Math.cos(ang) * l;
      var y2 = y + Math.sin(ang) * l;
      segs.push({ x1: x, y1: y, x2: x2, y2: y2, w: wid, d: d });
      var n = d > 4 ? 2 : 3;
      for (var b = 0; b < n; b++) {
        branch(x2, y2, l * (0.60 + rr() * 0.20), ang + (rr() - 0.5) * 1.55, d - 1, wid * 0.64);
      }
    })(baseX, baseY, len, -Math.PI / 2 + lean, depth, Math.max(2, len * 0.075));
    return { x: baseX, y: baseY, segs: segs, ph: baseX * 0.01 };
  }

  // ── scene painters ───────────────────────────────────────────────────────
  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#04020b');
    g.addColorStop(0.46, '#0b0418');
    g.addColorStop(0.78, '#1b0629');
    g.addColorStop(1, '#090212');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, w, h);

    var hg = ctx.createRadialGradient(w * 0.5, h * 0.62, 0, w * 0.5, h * 0.62, Math.max(w, h) * 0.7);
    hg.addColorStop(0, 'rgba(255,112,32,.10)');
    hg.addColorStop(0.45, 'rgba(124,52,170,.09)');
    hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg;
    ctx.fillRect(0, 0, w, h);
  }

  function drawStars(time) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var ox = -cxv * (2 + s.y * 8);
      var oy = -cyv * (1 + s.y * 5);
      var x = (s.x * w + ox + w * 2) % w;
      var y = s.y * h * 0.72 + oy;
      var a = s.a * (0.52 + 0.48 * Math.sin(time * s.sp + s.tw));
      if (a <= 0.01) continue;
      var col = s.tint > 0.86 ? '255,186,120' : (s.tint > 0.70 ? '196,170,255' : '255,244,226');
      ctx.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
      ctx.beginPath();
      ctx.arc(x, y, s.r, 0, TAU);
      ctx.fill();
    }

    // occasional shooting star
    var cycle = Math.floor(time / 9);
    var local = time - cycle * 9;
    if (local < 0.9) {
      var t = local / 0.9;
      var x0 = (0.12 + hash(cycle * 3.1) * 0.72) * w;
      var y0 = (0.06 + hash(cycle * 7.7) * 0.20) * h;
      var x1 = x0 - w * 0.16;
      var y1 = y0 + h * 0.09;
      var x = x0 + (x1 - x0) * t;
      var y = y0 + (y1 - y0) * t;
      var g = ctx.createLinearGradient(x, y, x1, y1);
      g.addColorStop(0, 'rgba(255,235,200,' + (0.85 * (1 - t)) + ')');
      g.addColorStop(1, 'rgba(255,160,80,0)');
      ctx.strokeStyle = g;
      ctx.lineWidth = 1.4;
      ctx.beginPath();
      ctx.moveTo(x, y);
      ctx.lineTo(x1, y1);
      ctx.stroke();
    }
  }

  function drawMoon(time) {
    var mx = pxX(0.58, 0.06);
    var my = pxY(-0.70, 0.06);
    var mr = Math.min(w, h) * (0.112 + 0.0018 * Math.sin(time * 0.7));

    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(mx, my, mr * 0.55, mx, my, mr * 4.8);
    halo.addColorStop(0, 'rgba(255,188,98,.30)');
    halo.addColorStop(0.34, 'rgba(255,124,42,.12)');
    halo.addColorStop(0.68, 'rgba(168,72,210,.06)');
    halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo;
    ctx.beginPath();
    ctx.arc(mx, my, mr * 4.8, 0, TAU);
    ctx.fill();
    ctx.restore();

    var sphere = ctx.createRadialGradient(mx - mr * 0.38, my - mr * 0.42, mr * 0.08, mx, my, mr);
    sphere.addColorStop(0, '#fff8e2');
    sphere.addColorStop(0.48, '#ffe6b0');
    sphere.addColorStop(0.82, '#f7b568');
    sphere.addColorStop(1, '#c76f26');
    ctx.fillStyle = sphere;
    ctx.beginPath();
    ctx.arc(mx, my, mr, 0, TAU);
    ctx.fill();

    // craters, clipped to the moon
    ctx.save();
    ctx.beginPath();
    ctx.arc(mx, my, mr * 0.995, 0, TAU);
    ctx.clip();
    var craters = [
      [-0.30, -0.22, 0.19], [0.18, -0.34, 0.12], [0.34, 0.10, 0.16],
      [-0.10, 0.28, 0.20], [-0.46, 0.24, 0.10], [0.06, 0.02, 0.08],
      [0.48, -0.16, 0.07], [-0.18, -0.55, 0.06]
    ];
    for (var i = 0; i < craters.length; i++) {
      var cr = craters[i];
      var cg = ctx.createRadialGradient(
        mx + cr[0] * mr, my + cr[1] * mr, 0,
        mx + cr[0] * mr, my + cr[1] * mr, cr[2] * mr
      );
      cg.addColorStop(0, 'rgba(176,106,52,.20)');
      cg.addColorStop(0.7, 'rgba(196,126,62,.10)');
      cg.addColorStop(1, 'rgba(196,126,62,0)');
      ctx.fillStyle = cg;
      ctx.beginPath();
      ctx.arc(mx + cr[0] * mr, my + cr[1] * mr, cr[2] * mr, 0, TAU);
      ctx.fill();
    }
    // soft dark limb for depth
    var limb = ctx.createRadialGradient(mx - mr * 0.25, my - mr * 0.25, mr * 0.5, mx, my, mr);
    limb.addColorStop(0, 'rgba(0,0,0,0)');
    limb.addColorStop(1, 'rgba(72,24,8,.28)');
    ctx.fillStyle = limb;
    ctx.fillRect(mx - mr, my - mr, mr * 2, mr * 2);
    ctx.restore();
  }

  function drawClouds(time) {
    ctx.save();
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var x = (((c.x + time * c.sp) % 1.5) - 0.25) * w;
      var y = c.y * h;
      var rx = c.w * w;
      var ry = c.h * h;
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
      g.addColorStop(0, 'rgba(28,10,48,' + c.a + ')');
      g.addColorStop(0.55, 'rgba(22,8,40,' + (c.a * 0.55) + ')');
      g.addColorStop(1, 'rgba(18,6,34,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function ridgePath(base, amp, phase, shift) {
    var step = Math.max(12, w / 70);
    ctx.beginPath();
    ctx.moveTo(-step, h);
    for (var x = -step; x <= w + step; x += step) {
      ctx.lineTo(x, ridgeY(x, base, amp, phase, shift));
    }
    ctx.lineTo(w + step, h);
    ctx.closePath();
  }

  function drawHeadstoneRow(base, amp, phase, shift, scale, color) {
    for (var i = 0; i < 12; i++) {
      var x = ((i + 0.5) / 12) * w + (i % 2 ? -1 : 1) * w * 0.018;
      var y = ridgeY(x, base, amp, phase, shift) + scale * 0.16;
      var s = scale * (0.72 + hash(i * 4.3) * 0.65);
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate((hash(i * 9.1) - 0.5) * 0.18);
      ctx.fillStyle = color;
      if (i % 4 === 0) {
        ctx.fillRect(-s * 0.16, -s * 1.55, s * 0.32, s * 1.55);
        ctx.fillRect(-s * 0.58, -s * 1.18, s * 1.16, s * 0.30);
      } else {
        ctx.beginPath();
        ctx.moveTo(-s * 0.55, 0);
        ctx.lineTo(-s * 0.55, -s * 0.82);
        ctx.quadraticCurveTo(0, -s * 1.42, s * 0.55, -s * 0.82);
        ctx.lineTo(s * 0.55, 0);
        ctx.closePath();
        ctx.fill();
      }
      ctx.strokeStyle = 'rgba(168,85,247,.18)';
      ctx.lineWidth = Math.max(0.6, s * 0.055);
      ctx.stroke();
      ctx.restore();
    }
  }

  function drawGraveyard() {
    ridgePath(h * 0.612, h * 0.022, 0.3, 12);
    ctx.fillStyle = 'rgba(14,5,28,.92)';
    ctx.fill();
    drawHeadstoneRow(h * 0.612, h * 0.022, 0.3, 12, Math.max(4, h * 0.010), 'rgba(19,7,36,.96)');

    ridgePath(h * 0.658, h * 0.030, 2.1, 22);
    ctx.fillStyle = 'rgba(9,3,20,.96)';
    ctx.fill();
    drawHeadstoneRow(h * 0.658, h * 0.030, 2.1, 22, Math.max(6, h * 0.015), 'rgba(13,4,25,.98)');

    ridgePath(h * 0.730, h * 0.042, 4.4, 34);
    ctx.fillStyle = 'rgba(5,1,12,.985)';
    ctx.fill();
  }

  function drawFog(time, front) {
    ctx.save();
    ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < fog.length; i++) {
      var f = fog[i];
      if (front ? f.d < 0.52 : f.d >= 0.52) continue;
      var x = (((f.x + time * f.sp) % 1.5) - 0.25) * w;
      var y = f.y * h;
      var rx = f.w * w * (0.8 + f.d * 0.55);
      var ry = f.h * h * (0.8 + f.d * 0.55);
      ctx.save();
      ctx.translate(x, y);
      ctx.scale(1, ry / rx);
      var col = f.tint < 0.62 ? '126,84,206' : '255,126,52';
      var g = ctx.createRadialGradient(0, 0, 0, 0, 0, rx);
      g.addColorStop(0, 'rgba(' + col + ',' + f.a.toFixed(3) + ')');
      g.addColorStop(0.58, 'rgba(' + col + ',' + (f.a * 0.34).toFixed(3) + ')');
      g.addColorStop(1, 'rgba(' + col + ',0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(0, 0, rx, 0, TAU);
      ctx.fill();
      ctx.restore();
    }
    ctx.restore();
  }

  function drawGhost(g, time) {
    var x = pxX(g.nx + Math.sin(time * 0.25 + g.ph) * 0.085, g.d);
    var y = pxY(g.ny + Math.sin(time * 0.55 + g.ph) * 0.045, g.d);
    var r = Math.min(w, h) * g.size * (0.6 + g.d * 0.8);
    var a = g.a * (0.70 + 0.30 * Math.sin(time * 1.3 + g.ph));

    ctx.save();
    ctx.translate(x, y);

    var glow = ctx.createRadialGradient(0, 0, r * 0.15, 0, 0, r * 2.7);
    glow.addColorStop(0, 'rgba(188,208,255,' + (0.10 * a).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(120,110,255,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 2.7, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(214,226,255,' + (0.155 * a).toFixed(3) + ')';
    ctx.beginPath();
    ctx.moveTo(0, -r * 1.25);
    ctx.bezierCurveTo(r * 1.05, -r * 1.15, r * 1.15, -r * 0.10, r * 0.86, r * 0.72);
    ctx.quadraticCurveTo(r * 0.55, r * 0.40, r * 0.30, r * 0.84);
    ctx.quadraticCurveTo(0, r * 0.46, -r * 0.30, r * 0.84);
    ctx.quadraticCurveTo(-r * 0.55, r * 0.40, -r * 0.86, r * 0.72);
    ctx.bezierCurveTo(-r * 1.15, -r * 0.10, -r * 1.05, -r * 1.15, 0, -r * 1.25);
    ctx.closePath();
    ctx.fill();

    ctx.fillStyle = 'rgba(28,14,48,' + (0.55 * a).toFixed(3) + ')';
    ctx.beginPath();
    ctx.ellipse(-r * 0.28, -r * 0.32, r * 0.105, r * 0.175, 0, 0, TAU);
    ctx.fill();
    ctx.beginPath();
    ctx.ellipse(r * 0.28, -r * 0.32, r * 0.105, r * 0.175, 0, 0, TAU);
    ctx.fill();
    ctx.restore();
  }

  function drawBat(b, time) {
    var nx = b.nx + time * b.speed;
    nx = ((nx + 1.4) % 2.8 + 2.8) % 2.8 - 1.4;
    var x = pxX(nx, b.d);
    var y = pxY(b.ny + Math.sin(time * (0.8 + b.d) + b.ph) * b.amp, b.d);
    var s = Math.min(w, h) * b.size * (0.6 + b.d * 0.9);
    var flap = Math.sin(time * b.fs + b.ph);
    var a = (0.55 + b.d * 0.45).toFixed(3);

    ctx.save();
    ctx.translate(x, y);
    ctx.scale(s * (b.speed < 0 ? -1 : 1), s);
    ctx.fillStyle = 'rgba(6,2,12,' + a + ')';
    ctx.beginPath();
    ctx.moveTo(0, -0.05);
    ctx.bezierCurveTo(-0.35, -0.55 - flap * 0.35, -1.15, -0.85 - flap * 0.55, -1.85, -0.22 - flap * 0.30);
    ctx.bezierCurveTo(-1.20, 0.02, -0.85, -0.05, -0.55, 0.16);
    ctx.quadraticCurveTo(-0.35, 0.24, -0.18, 0.10);
    ctx.quadraticCurveTo(-0.12, 0.48, 0, 0.55);
    ctx.quadraticCurveTo(0.12, 0.48, 0.18, 0.10);
    ctx.quadraticCurveTo(0.35, 0.24, 0.55, 0.16);
    ctx.bezierCurveTo(0.85, -0.05, 1.20, 0.02, 1.85, -0.22 - flap * 0.30);
    ctx.bezierCurveTo(1.15, -0.85 - flap * 0.55, 0.35, -0.55 - flap * 0.35, 0, -0.05);
    ctx.closePath();
    ctx.fill();

    ctx.beginPath();
    ctx.moveTo(-0.17, -0.34);
    ctx.lineTo(-0.11, -0.64);
    ctx.lineTo(0.01, -0.41);
    ctx.closePath();
    ctx.fill();
    ctx.beginPath();
    ctx.moveTo(0.17, -0.34);
    ctx.lineTo(0.11, -0.64);
    ctx.lineTo(-0.01, -0.41);
    ctx.closePath();
    ctx.fill();
    ctx.restore();
  }

  function tri(x, y, tw, th) {
    ctx.beginPath();
    ctx.moveTo(x, y);
    ctx.lineTo(x - tw, y + th);
    ctx.lineTo(x + tw, y + th);
    ctx.closePath();
    ctx.fill();
  }

  function drawPumpkin(pk, time) {
    var r = Math.min(w, h) * pk.size * (0.55 + pk.d * 0.8);
    var x = pxX(pk.nx + Math.sin(time * 0.35 + pk.ph) * 0.012, pk.d);
    var y = pxY(pk.ny + Math.sin(time * 0.9 + pk.ph) * 0.010, pk.d);
    var fl = 0.72 + 0.20 * Math.sin(time * 7.3 + pk.ph) + 0.08 * Math.sin(time * 17.1 + pk.ph * 2.2);
    fl = Math.max(0.45, Math.min(1.15, fl)) * pk.flick;
    var a = 0.55 + pk.d * 0.45;

    ctx.save();
    ctx.translate(x, y);
    ctx.rotate(pk.rot + Math.sin(time * 0.4 + pk.ph) * 0.02);

    // ground contact shadow
    ctx.globalAlpha = a * 0.45;
    ctx.fillStyle = 'rgba(0,0,0,.6)';
    ctx.beginPath();
    ctx.ellipse(0, r * 1.03, r * 1.16, r * 0.24, 0, 0, TAU);
    ctx.fill();
    ctx.globalAlpha = 1;

    // warm halo
    ctx.globalCompositeOperation = 'lighter';
    var glow = ctx.createRadialGradient(0, 0, r * 0.35, 0, 0, r * 3.1);
    glow.addColorStop(0, 'rgba(255,142,42,' + (0.20 * fl * a).toFixed(3) + ')');
    glow.addColorStop(0.55, 'rgba(255,92,22,' + (0.07 * fl * a).toFixed(3) + ')');
    glow.addColorStop(1, 'rgba(255,60,0,0)');
    ctx.fillStyle = glow;
    ctx.beginPath();
    ctx.arc(0, 0, r * 3.1, 0, TAU);
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // body lobes
    var body = ctx.createLinearGradient(-r, -r, r * 0.8, r);
    body.addColorStop(0, '#ffb45c');
    body.addColorStop(0.34, '#f57b1d');
    body.addColorStop(0.70, '#c7460b');
    body.addColorStop(1, '#782305');
    ctx.fillStyle = body;
    var lobes = [[-0.46, 0.58], [0, 0.66], [0.46, 0.58]];
    for (var l = 0; l < lobes.length; l++) {
      ctx.beginPath();
      ctx.ellipse(lobes[l][0] * r, 0, lobes[l][1] * r, r * 0.92, 0, 0, TAU);
      ctx.fill();
    }

    // carved shading ridges
    ctx.globalAlpha = 0.22 * a;
    ctx.strokeStyle = '#5b1403';
    ctx.lineWidth = Math.max(1, r * 0.035);
    for (var s2 = -1; s2 <= 1; s2++) {
      ctx.beginPath();
      ctx.moveTo(s2 * r * 0.33, -r * 0.82);
      ctx.quadraticCurveTo(s2 * r * 0.44, 0, s2 * r * 0.30, r * 0.84);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;

    // stem
    ctx.fillStyle = '#3b2410';
    ctx.beginPath();
    ctx.moveTo(-r * 0.11, -r * 0.86);
    ctx.quadraticCurveTo(-r * 0.17, -r * 1.14, r * 0.02, -r * 1.21);
    ctx.quadraticCurveTo(r * 0.02, -r * 0.98, r * 0.10, -r * 0.86);
    ctx.closePath();
    ctx.fill();

    // glowing carved face
    ctx.globalCompositeOperation = 'lighter';
    var faceGlow = ctx.createRadialGradient(0, r * 0.05, r * 0.10, 0, r * 0.05, r * 0.98);
    faceGlow.addColorStop(0, 'rgba(255,214,120,' + (0.34 * fl * a).toFixed(3) + ')');
    faceGlow.addColorStop(1, 'rgba(255,140,20,0)');
    ctx.fillStyle = faceGlow;
    ctx.beginPath();
    ctx.arc(0, r * 0.05, r * 0.98, 0, TAU);
    ctx.fill();

    ctx.fillStyle = 'rgba(255,228,152,' + Math.min(1, 0.92 * fl * a).toFixed(3) + ')';
    tri(-r * 0.40, -r * 0.27, r * 0.20, r * 0.19);
    tri(r * 0.40, -r * 0.27, r * 0.20, r * 0.19);

    ctx.beginPath();
    ctx.moveTo(-r * 0.46, r * 0.23);
    ctx.lineTo(-r * 0.26, r * 0.09);
    ctx.lineTo(-r * 0.10, r * 0.26);
    ctx.lineTo(r * 0.06, r * 0.09);
    ctx.lineTo(r * 0.24, r * 0.26);
    ctx.lineTo(r * 0.44, r * 0.12);
    ctx.lineTo(r * 0.36, r * 0.35);
    ctx.lineTo(r * 0.14, r * 0.41);
    ctx.lineTo(-r * 0.12, r * 0.35);
    ctx.lineTo(-r * 0.34, r * 0.43);
    ctx.closePath();
    ctx.fill();
    ctx.globalCompositeOperation = 'source-over';

    // rim light along the top curve
    ctx.strokeStyle = 'rgba(255,186,100,' + (0.28 * a).toFixed(3) + ')';
    ctx.lineWidth = Math.max(1, r * 0.035);
    ctx.beginPath();
    ctx.ellipse(0, 0, r * 0.98, r * 0.90, 0, Math.PI * 1.05, Math.PI * 1.85);
    ctx.stroke();
    ctx.restore();
  }

  function drawEmbers(time) {
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < embers.length; i++) {
      var em = embers[i];
      var prog = (em.y + time * em.sp) % 1;
      var x = pxX(em.nx + Math.sin(time * (0.5 + em.d) + em.ph) * 0.045, em.d);
      var y = pxY(0.58 - prog * 0.95, em.d);
      var r = Math.max(1.5, Math.min(w, h) * em.size * (0.5 + em.d));
      var a = Math.sin(prog * Math.PI) * (0.32 + em.d * 0.45);
      if (a <= 0.01) continue;
      var sp = em.warm ? emberWarm : emberCool;
      ctx.globalAlpha = a;
      ctx.drawImage(sp, x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.globalAlpha = 1;
    ctx.restore();
  }

  function drawTrees(time) {
    for (var i = 0; i < trees.length; i++) {
      var tr = trees[i];
      ctx.save();
      ctx.translate(tr.x, tr.y);
      ctx.rotate(Math.sin(time * 0.22 + tr.ph) * 0.012);
      ctx.translate(-tr.x, -tr.y);
      ctx.lineCap = 'round';
      for (var s = 0; s < tr.segs.length; s++) {
        var sg = tr.segs[s];
        ctx.strokeStyle = 'rgba(4,1,10,' + Math.min(0.98, 0.42 + sg.d * 0.085).toFixed(3) + ')';
        ctx.lineWidth = sg.w;
        ctx.beginPath();
        ctx.moveTo(sg.x1, sg.y1);
        ctx.lineTo(sg.x2, sg.y2);
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  function draw() {
    if (!w || !h) size();
    var time = state.t;
    cxv = cam.x + Math.sin(time * 0.11) * 0.16 + Math.sin(time * 0.043) * 0.10;
    cyv = cam.y + Math.cos(time * 0.09) * 0.10;

    drawSky();
    drawStars(time);
    drawMoon(time);
    drawClouds(time);
    drawGraveyard();
    drawFog(time, false);
    for (var g = 0; g < ghosts.length; g++) drawGhost(ghosts[g], time);
    for (var b = 0; b < bats.length; b++) drawBat(bats[b], time);
    for (var p = 0; p < pumpkins.length; p++) drawPumpkin(pumpkins[p], time);
    drawFog(time, true);
    drawEmbers(time);
    drawTrees(time);
  }

  // ── animation loop ───────────────────────────────────────────────────────
  function updateCamera(dt) {
    var k = Math.min(1, dt * 2.6);
    cam.x += (cam.tx - cam.x) * k;
    cam.y += (cam.ty - cam.y) * k;
  }

  function loop(now) {
    if (!state.active || !state.motion) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    if (!last) last = now;
    var dt = Math.min((now - last) / 1000, 0.05);
    last = now;
    updateCamera(dt);

    if (now - fpsAt > 1400) {
      var fps = Math.round(frames * 1000 / (now - fpsAt));
      frames = 0;
      fpsAt = now;
      if (state.quality === 'high' && state.motion && fps > 3 && fps < 34) {
        state.quality = 'low';
        size();
        draw();
      }
    }
    frames++;

    if (!state.visible) return;
    if (state.quality === 'low' && now - lastPaint < 33) return;
    lastPaint = now;
    state.t += dt;
    draw();
  }

  function start() {
    if (!raf && state.active && state.motion) {
      last = 0;
      lastPaint = 0;
      fpsAt = 0;
      frames = 0;
      raf = requestAnimationFrame(loop);
    }
  }
  function stop() {
    if (raf) {
      cancelAnimationFrame(raf);
      raf = 0;
    }
    last = 0;
    lastPaint = 0;
  }

  // ── header toggle ────────────────────────────────────────────────────────
  var btn = null;

  function paintButton() {
    if (!btn) return;
    btn.textContent = state.active ? '🎃' : '🕯️';
    btn.title = state.active
      ? 'Halloween mode is on — click to switch back to the normal look'
      : 'Turn the October Halloween theme back on';
    btn.setAttribute('aria-pressed', state.active ? 'true' : 'false');
    btn.setAttribute('aria-label', state.active ? 'Disable Halloween theme' : 'Enable Halloween theme');
  }

  function installButton() {
    var actions = document.querySelector('header .header-actions');
    if (!actions || document.getElementById('halloween-btn')) { btn = document.getElementById('halloween-btn'); return; }
    btn = document.createElement('button');
    btn.type = 'button';
    btn.id = 'halloween-btn';
    btn.className = 'secondary';
    btn.addEventListener('click', function () { setEnabled(!state.active); });
    var themeBtn = document.getElementById('theme-toggle');
    if (themeBtn && themeBtn.parentNode === actions) actions.insertBefore(btn, themeBtn);
    else actions.appendChild(btn);
    paintButton();
  }

  // ── activate / deactivate ────────────────────────────────────────────────
  function activate() {
    if (state.active) return;
    state.active = true;
    document.documentElement.classList.add('ptr29-halloween');
    document.body.classList.add('ptr29-halloween');
    layer.classList.add('on');

    // The glass waves are replaced by this scene while the season is on.
    var gb = window.PTR29GlassBackdrop;
    if (gb && gb.setEnabled) gb.setEnabled(false);

    size();
    draw();
    start();
    paintButton();
  }

  function deactivate() {
    if (!state.active) return;
    state.active = false;
    document.documentElement.classList.remove('ptr29-halloween');
    document.body.classList.remove('ptr29-halloween');
    layer.classList.remove('on');
    stop();

    var gb = window.PTR29GlassBackdrop;
    if (gb && gb.setEnabled && document.body.classList.contains('ptr29-glass-ui')) {
      gb.setTheme(document.documentElement.classList.contains('ptr29-light-theme'));
      gb.setEnabled(true);
    }
    paintButton();
  }

  function setEnabled(on) {
    on = !!on;
    try { localStorage.setItem(OFF_KEY + ':' + today.getFullYear(), on ? '0' : '1'); } catch (e) {}
    if (on) activate(); else deactivate();
    return state.active;
  }

  function setMotion(on) {
    state.motion = !!on;
    if (!state.active) return state.motion;
    if (state.motion) { last = 0; lastPaint = 0; start(); }
    else { stop(); draw(); }
    return state.motion;
  }

  // Keep the existing "Live backdrop animation" toggles in sync with this
  // scene too, so one switch controls both backdrops.
  var gbApi = window.PTR29GlassBackdrop;
  if (gbApi && typeof gbApi.setMotion === 'function' && !gbApi.__hwMotionBridge) {
    var originalSetMotion = gbApi.setMotion;
    gbApi.setMotion = function (on) {
      var result = originalSetMotion.call(gbApi, on);
      setMotion(on);
      return result;
    };
    gbApi.__hwMotionBridge = true;
  }

  // ── events ───────────────────────────────────────────────────────────────
  window.addEventListener('pointermove', function (e) {
    if (!state.active || !state.motion) return;
    var vw = window.innerWidth || 1;
    var vh = window.innerHeight || 1;
    cam.tx = Math.max(-1, Math.min(1, (e.clientX / vw - 0.5) * 2));
    cam.ty = Math.max(-1, Math.min(1, (e.clientY / vh - 0.5) * 2));
  }, { passive: true });

  document.addEventListener('visibilitychange', function () {
    state.visible = !document.hidden;
    last = 0;
    lastPaint = 0;
    if (!state.active) return;
    if (state.visible && state.motion) start();
    else if (!state.visible) stop();
  });

  window.addEventListener('resize', function () {
    clearTimeout(sizeTimer);
    sizeTimer = setTimeout(function () {
      if (state.active) { size(); draw(); }
    }, 150);
  });

  window.addEventListener('orientationchange', function () {
    setTimeout(function () {
      if (state.active) { size(); draw(); }
    }, 280);
  });

  // Reduced-motion preference can change mid-session.
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.addEventListener) {
      mq.addEventListener('change', function (e) {
        if (e.matches && state.active) { state.motion = false; stop(); draw(); }
      });
    }
  } catch (e) {}

  // ── public API + boot ────────────────────────────────────────────────────
  window.PTR29Halloween = {
    active: function () { return state.active; },
    setEnabled: setEnabled,
    setMotion: setMotion,
    motionOn: function () { return state.motion; },
    refresh: function () { if (state.active) { size(); draw(); } }
  };

  installButton();
  // The opt-out is remembered per season, so switching the pumpkin off this
  // October doesn't suppress the theme in future Octobers.
  var off = false;
  try { off = localStorage.getItem(OFF_KEY + ':' + today.getFullYear()) === '1'; } catch (e) {}
  if (!off) {
    if (document.body) activate();
    else document.addEventListener('DOMContentLoaded', activate, { once: true });
  } else {
    paintButton();
  }

  // A tab left open across midnight on 31 October should return to normal.
  setInterval(function () {
    var d = new Date();
    var inSeason = d.getMonth() === SEASON_MONTH && (SEASON_YEAR === null || d.getFullYear() === SEASON_YEAR);
    if (!inSeason) {
      deactivate();
      if (btn) btn.style.display = 'none';
    }
  }, 30 * 60 * 1000);
})();
