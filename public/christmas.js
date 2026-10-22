/*
 * © 2026 gamer-09. All rights reserved.
 * This code is proprietary. Unauthorized copying, modification,
 * distribution, or use of this software is strictly prohibited.
 *
 * ── December Christmas layer ──────────────────────────────────────────────
 * A date-gated, on-device 3D-projected motion backdrop: a snowy winter night
 * with parallax hills, aurora, lit village, decorated tree with fairy lights,
 * flying sleighs, drifting snow, rising light motes and a camera that eases
 * toward the pointer.
 *
 * Nothing is loaded from the network and no images are used. The only stored
 * values are two local preference flags (theme on/off, motion on/off).
 *
 * Loads AFTER glass-backdrop.js. It only runs during December — SEASON_YEAR is
 * null so this returns every December; set it to a year to pin it.
 *
 * Exposes window.PTR29Christmas:
 *   active()        is the seasonal theme currently running?
 *   setEnabled(on)  turn the whole seasonal theme on/off (remembered)
 *   setMotion(on)   freeze/resume the scene (shares the glass motion flag)
 *   motionOn()      current motion preference
 *   refresh()       re-measure + repaint (resize)
 */
(function () {
  'use strict';

  var SEASON_MONTH = 11;    // December (zero-based)
  var SEASON_YEAR = null;   // null = every December; set a year to pin it
  var OFF_KEY = 'ptr29_christmas_off_v1';   // suffixed with the season year
  var MOTION_KEY = 'ptr29_glass_motion_v1';
  var TAU = Math.PI * 2;

  var today = new Date();
  if (today.getMonth() !== SEASON_MONTH) return;
  if (SEASON_YEAR !== null && today.getFullYear() !== SEASON_YEAR) return;

  var wrap = document.getElementById('glass-backdrop');
  if (!wrap) return;

  // ── layer + canvas ───────────────────────────────────────────────────────
  var layer = document.createElement('div');
  layer.id = 'christmas-backdrop';
  layer.setAttribute('aria-hidden', 'true');
  var canvas = document.createElement('canvas');
  canvas.id = 'xmas-canvas';
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

  // ── deterministic randomness ─────────────────────────────────────────────
  function rng(seed) {
    return function () {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      return seed / 4294967296;
    };
  }
  var R = rng(0x2C0FFEE);

  // ── scene data ───────────────────────────────────────────────────────────
  var stars = [];
  for (var i = 0; i < 170; i++) {
    stars.push({
      x: R(), y: R() * 0.72,
      r: 0.35 + R() * 1.5,
      a: 0.20 + R() * 0.75,
      tw: R() * TAU,
      sp: 0.4 + R() * 2.0,
      tint: R()
    });
  }

  var clouds = [
    { x: 0.02, y: 0.16, w: 0.52, h: 0.075, sp: 0.006, a: 0.42 },
    { x: 0.46, y: 0.24, w: 0.42, h: 0.060, sp: 0.009, a: 0.34 },
    { x: 0.74, y: 0.12, w: 0.35, h: 0.055, sp: 0.004, a: 0.30 },
    { x: 0.21, y: 0.32, w: 0.58, h: 0.050, sp: 0.007, a: 0.24 }
  ];

  var snow = [];
  for (var s = 0; s < 150; s++) {
    snow.push({
      nx: R() * 2.3 - 1.15, y: R(),
      d: 0.06 + R() * 0.86,
      sp: 0.035 + R() * 0.085,
      size: 0.0016 + R() * 0.0036,
      ph: R() * TAU,
      sway: 0.010 + R() * 0.045,
      glint: R() < 0.28
    });
  }

  var houses = [];
  var houseCols = [-0.86, -0.60, -0.34, -0.08, 0.18, 0.44, 0.70, 0.92];
  for (var hi = 0; hi < houseCols.length; hi++) {
    var hd = 0.34 + R() * 0.52;
    houses.push({
      nx: houseCols[hi] + (R() - 0.5) * 0.10,
      ny: 0.17 + R() * 0.26,
      d: hd,
      w: 0.048 + R() * 0.030,
      h: 0.034 + R() * 0.024,
      ph: R() * TAU,
      lit: R() < 0.82,
      tree: R() < 0.55
    });
  }
  houses.sort(function (a, b) { return a.d - b.d; });

  var sleighs = [];
  for (var sl = 0; sl < 2; sl++) {
    sleighs.push({
      nx: R() * 2.6 - 1.3, ny: -0.72 + R() * 0.44,
      d: 0.10 + R() * 0.34,
      speed: (R() < 0.5 ? -1 : 1) * (0.045 + R() * 0.055),
      ph: R() * TAU, amp: 0.012 + R() * 0.024
    });
  }

  var lights = [];
  for (var li = 0; li < 60; li++) {
    lights.push({
      nx: R() * 2.2 - 1.1, y: R(),
      d: 0.12 + R() * 0.80,
      sp: 0.008 + R() * 0.030,
      size: 0.0022 + R() * 0.0034,
      ph: R() * TAU, col: R()
    });
  }
  var trees = [];

  var aurora = [
    { y: 0.16, amp: 0.055, sp: 0.010, hue: '110,220,170', a: 0.16 },
    { y: 0.24, amp: 0.045, sp: 0.014, hue: '150,180,255', a: 0.12 },
    { y: 0.10, amp: 0.065, sp: 0.007, hue: '190,150,255', a: 0.10 }
  ];

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
  var glowWarm = makeSprite('255,214,140');
  var glowRed = makeSprite('255,96,96');
  var glowGreen = makeSprite('120,230,140');
  var glowBlue = makeSprite('150,200,255');

  function pxX(nx, d) { return w * 0.5 + nx * (w * 0.5) * (0.62 + d * 0.52) - cxv * (10 + d * 34); }
  function pxY(ny, d) { return h * 0.58 + ny * (h * 0.5) * (0.52 + d * 0.66) - cyv * (8 + d * 24); }
  function ridgeY(x, base, amp, phase, shift) {
    var u = (x - cxv * shift) / (w || 1);
    return base + Math.sin(u * 7.4 + phase + state.t * 0.012) * amp + Math.sin(u * 17.3 + phase * 1.7) * amp * 0.35;
  }

  function size() {
    dpr = Math.min(window.devicePixelRatio || 1, state.quality === 'high' ? 1.6 : 1.15);
    var rs = state.quality === 'high' ? 0.85 : 0.62;
    w = layer.clientWidth || window.innerWidth || 1;
    h = layer.clientHeight || window.innerHeight || 1;
    canvas.width = Math.max(2, Math.round(w * dpr * rs));
    canvas.height = Math.max(2, Math.round(h * dpr * rs));
    ctx.setTransform(dpr * rs, 0, 0, dpr * rs, 0, 0);
    buildTrees();
  }

  function buildTrees() {
    trees = [];
    var sc = Math.min(w, h) / 900;
    trees.push(makeTree(w * 0.05, h * 1.04, 150 * sc, -0.20, 7, 0xC01));
    trees.push(makeTree(w * 0.96, h * 1.05, 172 * sc, 0.18, 7, 0xC02));
  }

  function makeTree(baseX, baseY, len, lean, depth, seed) {
    var rr = rng(seed), segs = [];
    (function branch(x, y, l, ang, d, wid) {
      if (d <= 0 || l < 4) return;
      var x2 = x + Math.cos(ang) * l, y2 = y + Math.sin(ang) * l;
      segs.push({ x1: x, y1: y, x2: x2, y2: y2, w: wid, d: d });
      var n = d > 4 ? 2 : 3;
      for (var b = 0; b < n; b++) branch(x2, y2, l * (0.60 + rr() * 0.20), ang + (rr() - 0.5) * 1.55, d - 1, wid * 0.64);
    })(baseX, baseY, len, -Math.PI / 2 + lean, depth, Math.max(2, len * 0.075));
    return { x: baseX, y: baseY, segs: segs, ph: baseX * 0.01 };
  }

  function drawSky() {
    var g = ctx.createLinearGradient(0, 0, 0, h);
    g.addColorStop(0, '#03081a'); g.addColorStop(0.44, '#071531'); g.addColorStop(0.76, '#0d2348'); g.addColorStop(1, '#050b1c');
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    var hg = ctx.createRadialGradient(w * 0.5, h * 0.60, 0, w * 0.5, h * 0.60, Math.max(w, h) * 0.7);
    hg.addColorStop(0, 'rgba(120,190,255,.09)'); hg.addColorStop(0.45, 'rgba(80,120,220,.09)'); hg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = hg; ctx.fillRect(0, 0, w, h);
  }

  function drawAurora(time) {
    ctx.save(); ctx.globalCompositeOperation = 'screen';
    for (var i = 0; i < aurora.length; i++) {
      var a = aurora[i];
      var yBase = a.y * h + Math.sin(time * a.sp * 6) * a.amp * h;
      var grd = ctx.createLinearGradient(0, yBase - h * 0.16, 0, yBase + h * 0.16);
      grd.addColorStop(0, 'rgba(' + a.hue + ',0)');
      grd.addColorStop(0.5, 'rgba(' + a.hue + ',' + (a.a * (0.7 + 0.3 * Math.sin(time * 0.5 + i))).toFixed(3) + ')');
      grd.addColorStop(1, 'rgba(' + a.hue + ',0)');
      ctx.fillStyle = grd; ctx.save(); ctx.translate(-cxv * 12, 0);
      ctx.beginPath();
      var step = Math.max(20, w / 40);
      ctx.moveTo(-step, yBase + h * 0.16);
      for (var x = -step; x <= w + step; x += step) ctx.lineTo(x, yBase + Math.sin(x * 0.006 + time * a.sp * 3 + i) * a.amp * h * 0.9);
      ctx.lineTo(w + step, yBase + h * 0.16); ctx.closePath(); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  function drawStars(time) {
    for (var i = 0; i < stars.length; i++) {
      var s = stars[i];
      var ox = -cxv * (2 + s.y * 8), oy = -cyv * (1 + s.y * 5);
      var x = (s.x * w + ox + w * 2) % w, y = s.y * h * 0.72 + oy;
      var a = s.a * (0.52 + 0.48 * Math.sin(time * s.sp + s.tw));
      if (a <= 0.01) continue;
      var col = s.tint > 0.86 ? '255,220,170' : (s.tint > 0.70 ? '190,215,255' : '255,252,246');
      ctx.fillStyle = 'rgba(' + col + ',' + a.toFixed(3) + ')';
      ctx.beginPath(); ctx.arc(x, y, s.r, 0, TAU); ctx.fill();
    }
  }

  function drawMoon(time) {
    var mx = pxX(0.60, 0.05), my = pxY(-0.72, 0.05);
    var mr = Math.min(w, h) * (0.088 + 0.0014 * Math.sin(time * 0.7));
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    var halo = ctx.createRadialGradient(mx, my, mr * 0.55, mx, my, mr * 4.8);
    halo.addColorStop(0, 'rgba(196,222,255,.30)'); halo.addColorStop(0.34, 'rgba(140,184,255,.12)'); halo.addColorStop(0.68, 'rgba(150,150,255,.06)'); halo.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = halo; ctx.beginPath(); ctx.arc(mx, my, mr * 4.8, 0, TAU); ctx.fill(); ctx.restore();
    var sphere = ctx.createRadialGradient(mx - mr * 0.38, my - mr * 0.42, mr * 0.08, mx, my, mr);
    sphere.addColorStop(0, '#ffffff'); sphere.addColorStop(0.48, '#e8f1ff'); sphere.addColorStop(0.82, '#c2d8f4'); sphere.addColorStop(1, '#8aa6c8');
    ctx.fillStyle = sphere; ctx.beginPath(); ctx.arc(mx, my, mr, 0, TAU); ctx.fill();
  }

  function drawClouds(time) {
    ctx.save();
    for (var i = 0; i < clouds.length; i++) {
      var c = clouds[i];
      var x = (((c.x + time * c.sp) % 1.5) - 0.25) * w, y = c.y * h, rx = c.w * w, ry = c.h * h;
      ctx.save(); ctx.translate(x, y); ctx.scale(1, ry / rx);
      var g = ctx.createRadialGradient(0, 0, rx * 0.05, 0, 0, rx);
      g.addColorStop(0, 'rgba(30,46,80,' + c.a + ')'); g.addColorStop(0.55, 'rgba(22,34,64,' + (c.a * 0.55) + ')'); g.addColorStop(1, 'rgba(18,26,50,0)');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(0, 0, rx, 0, TAU); ctx.fill(); ctx.restore();
    }
    ctx.restore();
  }

  function ridgePath(base, amp, phase, shift) {
    var step = Math.max(12, w / 70);
    ctx.beginPath(); ctx.moveTo(-step, h);
    for (var x = -step; x <= w + step; x += step) ctx.lineTo(x, ridgeY(x, base, amp, phase, shift));
    ctx.lineTo(w + step, h); ctx.closePath();
  }
  function drawSnowCap(base, amp, phase, shift, color) {
    ctx.save(); ctx.strokeStyle = color; ctx.lineWidth = Math.max(1.5, h * 0.004);
    ctx.beginPath();
    var step = Math.max(12, w / 80);
    for (var x = -step; x <= w + step; x += step) { var y = ridgeY(x, base, amp, phase, shift); if (x === -step) ctx.moveTo(x, y); else ctx.lineTo(x, y); }
    ctx.stroke(); ctx.restore();
  }

  function drawVillage() {
    ridgePath(h * 0.616, h * 0.020, 0.3, 12); ctx.fillStyle = 'rgba(20,34,60,.94)'; ctx.fill(); drawSnowCap(h * 0.616, h * 0.020, 0.3, 12, 'rgba(226,240,255,.42)');
    ridgePath(h * 0.664, h * 0.028, 2.1, 22); ctx.fillStyle = 'rgba(14,24,46,.96)'; ctx.fill(); drawSnowCap(h * 0.664, h * 0.028, 2.1, 22, 'rgba(214,232,255,.36)');
    ridgePath(h * 0.734, h * 0.040, 4.4, 34); ctx.fillStyle = 'rgba(8,14,30,.985)'; ctx.fill(); drawSnowCap(h * 0.734, h * 0.040, 4.4, 34, 'rgba(196,220,255,.28)');
  }

  function drawHouse(hz, time) {
    var x = pxX(hz.nx + Math.sin(time * 0.2 + hz.ph) * 0.006, hz.d), y = pxY(hz.ny, hz.d);
    var hw = Math.min(w, h) * hz.w * (0.6 + hz.d * 0.8), hh = Math.min(w, h) * hz.h * (0.6 + hz.d * 0.8);
    var flick = hz.lit ? Math.max(0.4, Math.min(1.1, 0.72 + 0.22 * Math.sin(time * 5.1 + hz.ph) + 0.06 * Math.sin(time * 13.7 + hz.ph))) : 0;
    ctx.save(); ctx.translate(x, y);
    if (hz.lit) {
      ctx.globalCompositeOperation = 'lighter';
      var glow = ctx.createRadialGradient(0, -hh * 0.2, hw * 0.2, 0, -hh * 0.2, hw * 3.4);
      glow.addColorStop(0, 'rgba(255,196,110,' + (0.24 * flick).toFixed(3) + ')'); glow.addColorStop(0.6, 'rgba(255,150,60,' + (0.07 * flick).toFixed(3) + ')'); glow.addColorStop(1, 'rgba(255,140,60,0)');
      ctx.fillStyle = glow; ctx.beginPath(); ctx.arc(0, -hh * 0.2, hw * 3.4, 0, TAU); ctx.fill(); ctx.globalCompositeOperation = 'source-over';
    }
    ctx.fillStyle = 'rgba(16,26,48,.96)'; ctx.fillRect(-hw * 0.5, -hh, hw, hh);
    ctx.fillStyle = 'rgba(230,242,255,.88)'; ctx.beginPath(); ctx.moveTo(-hw * 0.62, -hh); ctx.lineTo(0, -hh * 1.62); ctx.lineTo(hw * 0.62, -hh); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.92)'; ctx.beginPath(); ctx.moveTo(-hw * 0.58, -hh); ctx.lineTo(0, -hh * 1.55); ctx.lineTo(hw * 0.16, -hh * 1.12); ctx.lineTo(-hw * 0.20, -hh * 1.30); ctx.closePath(); ctx.fill();
    if (hz.lit) {
      ctx.fillStyle = 'rgba(255,214,140,' + (0.92 * flick).toFixed(3) + ')'; ctx.fillRect(-hw * 0.30, -hh * 0.78, hw * 0.22, hh * 0.26); ctx.fillRect(hw * 0.08, -hh * 0.78, hw * 0.22, hh * 0.26);
      ctx.fillStyle = 'rgba(255,244,200,' + (0.85 * flick).toFixed(3) + ')'; ctx.fillRect(-hw * 0.06, -hh * 0.36, hw * 0.16, hh * 0.16);
    } else {
      ctx.fillStyle = 'rgba(60,84,120,.70)'; ctx.fillRect(-hw * 0.30, -hh * 0.78, hw * 0.22, hh * 0.26); ctx.fillRect(hw * 0.08, -hh * 0.78, hw * 0.22, hh * 0.26);
    }
    if (hz.tree) {
      ctx.fillStyle = 'rgba(34,86,54,.95)'; var tw = hw * 0.18, tx = hw * 0.62;
      for (var t = 0; t < 3; t++) { var ty = -hh * (0.2 + t * 0.34), sw = tw * (1 - t * 0.22); ctx.beginPath(); ctx.moveTo(tx, ty - hh * 0.5); ctx.lineTo(tx - sw, ty); ctx.lineTo(tx + sw, ty); ctx.closePath(); ctx.fill(); }
      ctx.fillStyle = 'rgba(255,236,170,.9)'; ctx.beginPath(); ctx.arc(tx, -hh * 1.06, Math.max(0.8, tw * 0.18), 0, TAU); ctx.fill();
    }
    ctx.restore();
  }

  function drawTree(sx, sy, scale, time, seed) {
    var rr = rng(seed); ctx.save(); ctx.translate(sx, sy);
    ctx.fillStyle = 'rgba(60,38,22,.95)'; ctx.fillRect(-scale * 0.06, 0, scale * 0.12, scale * 0.34);
    var tiers = 4;
    for (var t = 0; t < tiers; t++) {
      var ty = -scale * (0.34 + t * 0.52), tw = scale * (0.70 - t * 0.13);
      ctx.fillStyle = t % 2 ? 'rgba(24,74,48,.96)' : 'rgba(30,90,58,.96)';
      ctx.beginPath(); ctx.moveTo(0, ty - scale * 0.72); ctx.lineTo(-tw, ty); ctx.lineTo(tw, ty); ctx.closePath(); ctx.fill();
      ctx.fillStyle = 'rgba(240,250,255,.80)';
      ctx.beginPath(); ctx.moveTo(0, ty - scale * 0.72); ctx.lineTo(-tw * 0.42, ty - scale * 0.34); ctx.lineTo(-tw * 0.14, ty - scale * 0.44); ctx.lineTo(tw * 0.18, ty - scale * 0.30); ctx.lineTo(tw * 0.44, ty - scale * 0.40); ctx.closePath(); ctx.fill();
    }
    ctx.globalCompositeOperation = 'lighter'; ctx.drawImage(glowWarm, -scale * 0.5, -scale * 3.1, scale, scale); ctx.globalCompositeOperation = 'source-over';
    drawStarShape(0, -scale * 2.62, scale * 0.22, 'rgba(255,236,150,.98)');
    var cols = ['255,120,110', '140,230,150', '150,200,255', '255,214,140'];
    for (var k = 0; k < 26; k++) {
      var p = k / 26, ang = p * TAU * 3.4 + time * 0.6, ly = -scale * (0.42 + p * 2.0), lr = scale * (0.66 - p * 0.5) * (0.5 + 0.5 * Math.abs(Math.cos(ang))), lx = Math.sin(ang) * lr;
      var blink = 0.55 + 0.45 * Math.sin(time * 3 + k * 1.7);
      ctx.globalAlpha = 0.5 + 0.5 * blink; ctx.drawImage(rr() < 0.25 ? glowRed : glowWarm, lx - scale * 0.10, ly - scale * 0.10, scale * 0.20, scale * 0.20);
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function drawStarShape(cx, cy, r, color) {
    ctx.fillStyle = color; ctx.beginPath();
    for (var i = 0; i < 5; i++) { var a1 = -Math.PI / 2 + i * TAU / 5, a2 = a1 + TAU / 10; ctx.lineTo(cx + Math.cos(a1) * r, cy + Math.sin(a1) * r); ctx.lineTo(cx + Math.cos(a2) * r * 0.44, cy + Math.sin(a2) * r * 0.44); }
    ctx.closePath(); ctx.fill();
  }

  function drawSleigh(sg, time) {
    var nx = sg.nx + time * sg.speed; nx = ((nx + 1.4) % 2.8 + 2.8) % 2.8 - 1.4;
    var x = pxX(nx, sg.d), y = pxY(sg.ny + Math.sin(time * (0.6 + sg.d) + sg.ph) * sg.amp, sg.d);
    var s = Math.min(w, h) * (0.020 + sg.d * 0.028), dir = sg.speed < 0 ? -1 : 1;
    ctx.save(); ctx.translate(x, y); ctx.scale(dir * s, s);
    ctx.fillStyle = 'rgba(12,18,34,.92)';
    for (var r = 0; r < 2; r++) { var rx = -1.1 - r * 0.9; ctx.beginPath(); ctx.ellipse(rx, 0.15, 0.34, 0.16, 0, 0, TAU); ctx.fill(); ctx.fillRect(rx - 0.10, 0.28, 0.07, 0.22); ctx.fillRect(rx + 0.12, 0.28, 0.07, 0.22); ctx.beginPath(); ctx.arc(rx - 0.34, -0.02, 0.12, 0, TAU); ctx.fill(); }
    ctx.fillStyle = 'rgba(200,40,50,.95)'; ctx.beginPath(); ctx.moveTo(-1.0, 0.10); ctx.lineTo(0.30, 0.10); ctx.quadraticCurveTo(0.62, 0.10, 0.66, -0.18); ctx.lineTo(0.62, -0.34); ctx.lineTo(-0.02, -0.34); ctx.quadraticCurveTo(-0.3, -0.22, -1.0, -0.02); ctx.closePath(); ctx.fill();
    ctx.fillStyle = 'rgba(255,214,140,.85)'; ctx.fillRect(0.36, -0.14, 0.14, 0.10); ctx.fillStyle = 'rgba(240,248,255,.85)'; ctx.fillRect(-0.9, -0.30, 0.36, 0.16);
    ctx.restore();
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; ctx.globalAlpha = 0.5;
    for (var sp = 0; sp < 5; sp++) { ctx.drawImage(glowWarm, x + dir * (18 + sp * 16) - 8, y + Math.sin(time * 2 + sp) * 4 - 8, 16, 16); }
    ctx.restore();
  }

  function drawHouseLights(time) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter'; var cols = [glowRed, glowGreen, glowBlue, glowWarm];
    for (var f = 0; f < 2; f++) {
      var base = f === 0 ? h * 0.640 : h * 0.700, amp = f === 0 ? h * 0.020 : h * 0.030, count = 22;
      for (var i = 0; i < count; i++) {
        var x = ((i + 0.5) / count) * w, sag = Math.sin((i / count) * Math.PI) * h * 0.030;
        var y = ridgeY(x, base, amp, f * 2.1, f ? 22 : 12) + h * 0.006 + sag;
        var blink = 0.5 + 0.5 * Math.sin(time * 2.4 + i * 0.9 + f);
        ctx.globalAlpha = 0.35 + 0.5 * blink; ctx.drawImage(cols[(i + f) % cols.length], x - 6, y - 6, 12, 12);
      }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function drawSnow(time) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < snow.length; i++) {
      var sn = snow[i], prog = (sn.y + time * sn.sp) % 1;
      var x = pxX(sn.nx + Math.sin(time * (0.4 + sn.d) + sn.ph) * sn.sway, sn.d), y = pxY(0.6 - prog * 1.1, sn.d);
      var r = Math.max(1.2, Math.min(w, h) * sn.size * (0.5 + sn.d)), a = Math.sin(prog * Math.PI) * (0.45 + sn.d * 0.5);
      if (a <= 0.01) continue;
      if (sn.glint) { ctx.globalAlpha = a; ctx.drawImage(glowWarm, x - r * 3, y - r * 3, r * 6, r * 6); }
      else { ctx.fillStyle = 'rgba(232,244,255,' + a.toFixed(3) + ')'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); }
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function drawLights(time) {
    ctx.save(); ctx.globalCompositeOperation = 'lighter';
    for (var i = 0; i < lights.length; i++) {
      var L = lights[i], prog = (L.y + time * L.sp) % 1;
      var x = pxX(L.nx + Math.sin(time * (0.4 + L.d) + L.ph) * 0.03, L.d), y = pxY(0.6 - prog * 1.05, L.d);
      var r = Math.max(1.4, Math.min(w, h) * L.size * (0.5 + L.d)), a = Math.sin(prog * Math.PI) * (0.30 + L.d * 0.45);
      if (a <= 0.01) continue;
      var sp = L.col < 0.3 ? glowRed : (L.col < 0.6 ? glowGreen : (L.col < 0.82 ? glowBlue : glowWarm));
      ctx.globalAlpha = a; ctx.drawImage(sp, x - r * 3, y - r * 3, r * 6, r * 6);
    }
    ctx.globalAlpha = 1; ctx.restore();
  }

  function drawTrees(time) {
    for (var i = 0; i < trees.length; i++) {
      var tr = trees[i];
      ctx.save(); ctx.translate(tr.x, tr.y); ctx.rotate(Math.sin(time * 0.22 + tr.ph) * 0.010); ctx.translate(-tr.x, -tr.y); ctx.lineCap = 'round';
      for (var s = 0; s < tr.segs.length; s++) {
        var sg = tr.segs[s];
        ctx.strokeStyle = 'rgba(6,10,22,' + Math.min(0.98, 0.44 + sg.d * 0.085).toFixed(3) + ')'; ctx.lineWidth = sg.w;
        ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1); ctx.lineTo(sg.x2, sg.y2); ctx.stroke();
        ctx.strokeStyle = 'rgba(230,242,255,' + Math.min(0.5, 0.10 + sg.d * 0.05).toFixed(3) + ')'; ctx.lineWidth = Math.max(0.6, sg.w * 0.4);
        ctx.beginPath(); ctx.moveTo(sg.x1, sg.y1 - sg.w * 0.3); ctx.lineTo(sg.x2, sg.y2 - sg.w * 0.3); ctx.stroke();
      }
      ctx.restore();
    }
  }

  function draw() {
    if (!w || !h) size();
    var time = state.t;
    cxv = cam.x + Math.sin(time * 0.11) * 0.16 + Math.sin(time * 0.043) * 0.10;
    cyv = cam.y + Math.cos(time * 0.09) * 0.10;
    drawSky(); drawAurora(time); drawStars(time); drawMoon(time); drawClouds(time);
    drawVillage(); drawHouseLights(time);
    for (var hz = 0; hz < houses.length; hz++) drawHouse(houses[hz], time);
    drawTree(w * 0.16, h * 0.985, Math.min(w, h) * 0.11, time, 0xD01);
    for (var sl = 0; sl < sleighs.length; sl++) drawSleigh(sleighs[sl], time);
    drawSnow(time); drawLights(time); drawTrees(time);
  }

  function updateCamera(dt) { var k = Math.min(1, dt * 2.6); cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; }
  function loop(now) {
    if (!state.active || !state.motion) { raf = 0; return; }
    raf = requestAnimationFrame(loop);
    if (!last) last = now;
    var dt = Math.min((now - last) / 1000, 0.05); last = now; updateCamera(dt);
    if (now - fpsAt > 1400) {
      var fps = Math.round(frames * 1000 / (now - fpsAt));
      frames = 0; fpsAt = now;
      if (state.quality === 'high' && state.motion && fps > 3 && fps < 34) { state.quality = 'low'; size(); draw(); }
    }
    frames++;
    if (!state.visible) return;
    if (state.quality === 'low' && now - lastPaint < 33) return;
    lastPaint = now; state.t += dt; draw();
  }
  function start() { if (!raf && state.active && state.motion) { last = 0; lastPaint = 0; fpsAt = 0; frames = 0; raf = requestAnimationFrame(loop); } }
  function stop() { if (raf) { cancelAnimationFrame(raf); raf = 0; } last = 0; lastPaint = 0; }

  var btn = null;
  function paintButton() {
    if (!btn) return;
    btn.textContent = state.active ? '🎄' : '🕯️';
    btn.title = state.active ? 'Christmas mode is on — click to switch back to the normal look' : 'Turn the December Christmas theme back on';
    btn.setAttribute('aria-pressed', state.active ? 'true' : 'false');
    btn.setAttribute('aria-label', state.active ? 'Disable Christmas theme' : 'Enable Christmas theme');
  }
  function installButton() {
    var actions = document.querySelector('header .header-actions');
    if (!actions || document.getElementById('christmas-btn')) { btn = document.getElementById('christmas-btn'); return; }
    btn = document.createElement('button');
    btn.type = 'button'; btn.id = 'christmas-btn'; btn.className = 'secondary';
    btn.addEventListener('click', function () { setEnabled(!state.active); });
    var themeBtn = document.getElementById('theme-toggle');
    if (themeBtn && themeBtn.parentNode === actions) actions.insertBefore(btn, themeBtn);
    else actions.appendChild(btn);
    paintButton();
  }

  function activate() {
    if (state.active) return;
    state.active = true;
    document.documentElement.classList.add('ptr29-christmas');
    document.body.classList.add('ptr29-christmas');
    layer.classList.add('on');
    var gb = window.PTR29GlassBackdrop;
    if (gb && gb.setEnabled) gb.setEnabled(false);
    size(); draw(); start(); paintButton();
  }
  function deactivate() {
    if (!state.active) return;
    state.active = false;
    document.documentElement.classList.remove('ptr29-christmas');
    document.body.classList.remove('ptr29-christmas');
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
    if (state.motion) { last = 0; lastPaint = 0; start(); } else { stop(); draw(); }
    return state.motion;
  }

  var gbApi = window.PTR29GlassBackdrop;
  if (gbApi && typeof gbApi.setMotion === 'function' && !gbApi.__xmasMotionBridge) {
    var originalSetMotion = gbApi.setMotion;
    gbApi.setMotion = function (on) { var result = originalSetMotion.call(gbApi, on); setMotion(on); return result; };
    gbApi.__xmasMotionBridge = true;
  }

  window.addEventListener('pointermove', function (e) {
    if (!state.active || !state.motion) return;
    var vw = window.innerWidth || 1, vh = window.innerHeight || 1;
    cam.tx = Math.max(-1, Math.min(1, (e.clientX / vw - 0.5) * 2));
    cam.ty = Math.max(-1, Math.min(1, (e.clientY / vh - 0.5) * 2));
  }, { passive: true });
  document.addEventListener('visibilitychange', function () {
    state.visible = !document.hidden; last = 0; lastPaint = 0;
    if (!state.active) return;
    if (state.visible && state.motion) start(); else if (!state.visible) stop();
  });
  window.addEventListener('resize', function () { clearTimeout(sizeTimer); sizeTimer = setTimeout(function () { if (state.active) { size(); draw(); } }, 150); });
  window.addEventListener('orientationchange', function () { setTimeout(function () { if (state.active) { size(); draw(); } }, 280); });
  try {
    var mq = window.matchMedia('(prefers-reduced-motion: reduce)');
    if (mq.addEventListener) mq.addEventListener('change', function (e) { if (e.matches && state.active) { state.motion = false; stop(); draw(); } });
  } catch (e) {}

  window.PTR29Christmas = {
    active: function () { return state.active; },
    setEnabled: setEnabled, setMotion: setMotion, motionOn: function () { return state.motion; },
    refresh: function () { if (state.active) { size(); draw(); } }
  };

  installButton();
  var off = false;
  try { off = localStorage.getItem(OFF_KEY + ':' + today.getFullYear()) === '1'; } catch (e) {}
  if (!off) { if (document.body) activate(); else document.addEventListener('DOMContentLoaded', activate, { once: true }); }
  else { paintButton(); }

  setInterval(function () {
    var d = new Date();
    var nowInSeason = d.getMonth() === SEASON_MONTH && (SEASON_YEAR === null || d.getFullYear() === SEASON_YEAR);
    if (!nowInSeason) { deactivate(); if (btn) btn.style.display = 'none'; }
  }, 30 * 60 * 1000);
})();
