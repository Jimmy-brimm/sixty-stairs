// The screen, in two layers drawn by hand pixel by pixel:
//   world: the floor, the monsters, the knight; about 448 pixels on its short side (32-pixel tiles), lit
//   ui:    the HUD and menus, half that size, never lit
// One shader puts them together on a single quad: it multiplies the world by a small, smoothly filtered light
// map and scales both layers up with sharp edges at any window size. All drawing is done here in JavaScript, so a
// phone, a gaming PC and a software renderer draw the same picture.
import * as THREE from 'three'
import { glyph, textWidth, GLYPH_H } from './font.js'

export const rgba = (r, g, b, a = 255) => ((a << 24) | (b << 16) | (g << 8) | r) >>> 0
export const C = {
  white: rgba(242, 236, 250), gold: rgba(255, 206, 70), red: rgba(255, 80, 70), green: rgba(120, 236, 110),
  dim: rgba(170, 160, 190), dark: rgba(14, 10, 20), panel: rgba(20, 14, 28, 220), blue: rgba(120, 190, 255),
  ink: rgba(10, 6, 14, 235), xp: rgba(130, 200, 255), hp: rgba(220, 40, 60), hpBack: rgba(60, 16, 26, 230),
  clear: 0,
}
export const RARITY_COLORS = [rgba(220, 220, 230), rgba(110, 230, 110), rgba(90, 160, 255), rgba(200, 110, 255), rgba(255, 170, 40)]

// ------------------------------------------------------------------ art: palette-indexed frames, with recolourable ramps
export function loadArt(json) {
  const pal = new Uint32Array(json.palette.length + 1)
  json.palette.forEach((c, i) => { pal[i + 1] = rgba(c[0], c[1], c[2]) })
  const sprites = {}
  for (const [name, s] of Object.entries(json.sprites)) {
    sprites[name] = {
      name, w: s.w, h: s.h, ax: s.a[0], ay: s.a[1],
      frames: s.f.map(runs => {         // [count, colour, count, colour, ...]
        const out = new Uint16Array(s.w * s.h)
        for (let i = 0, at = 0; i < runs.length; i += 2) { out.fill(runs[i + 1], at, at + runs[i]); at += runs[i] }
        return out
      }),
    }
  }
  // glowing colours carry a flag in their alpha (0x80): the light map leaves them bright in the dark
  const glow = new Set(json.glow || [])
  for (const name of json.glowSprites || []) for (const f of sprites[name]?.frames || []) for (const i of f) if (i) glow.add(i)
  for (const i of glow) pal[i] = ((pal[i] & 0xffffff) | 0x80000000) >>> 0
  const out = { pal, sprites, ramps: json.ramps || {}, tile: json.tile }
  // half-size copies of every sprite, for the low graphics setting (made the first time they are asked for)
  const half = {}
  out.half = new Proxy(sprites, { get: (all, name) => half[name] || (all[name] ? (half[name] = halve(all[name])) : undefined) })
  return out
}

// a sprite at half size: each 2 x 2 block becomes its most common colour (empty if mostly empty)
function halve(s) {
  const w = Math.ceil(s.w / 2), h = Math.ceil(s.h / 2)
  return {
    name: s.name, w, h, ax: Math.floor(s.ax / 2), ay: Math.floor(s.ay / 2),
    frames: s.frames.map(f => {
      const out = new Uint16Array(w * h)
      for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
        const c = [], n = []
        for (let dy = 0; dy < 2; dy++) for (let dx = 0; dx < 2; dx++) {
          const sx = x * 2 + dx, sy = y * 2 + dy
          if (sx >= s.w || sy >= s.h) continue
          const v = f[sy * s.w + sx]
          if (!v) continue
          const i = c.indexOf(v)
          if (i < 0) { c.push(v); n.push(1) } else n[i]++
        }
        const filled = n.reduce((a, b) => a + b, 0)
        if (filled >= 2) out[y * w + x] = c[n.indexOf(Math.max(...n))]
      }
      return out
    }),
  }
}

// shades for a ramp: dark to light around a base colour, the shadows cooler and the lights warmer (as Terraria does)
export function shades(base, n) {
  const out = []
  for (let k = 0; k < n; k++) {
    const t = n === 1 ? 0.5 : k / (n - 1)
    const dark = [26, 14, 44], light = [255, 246, 214]
    const c = t < 0.5 ? base.map((v, i) => v + (dark[i] - v) * (0.55 * (0.5 - t) * 2)) : base.map((v, i) => v + (light[i] - v) * (0.35 * (t - 0.5) * 2))
    out.push(rgba(...c.map(v => Math.max(0, Math.min(255, Math.round(v))))))
  }
  return out
}
const toRGB = c => { const k = new THREE.Color(c); return [k.r * 255, k.g * 255, k.b * 255] }

// a palette with some ramps recoloured: { skin: '#e8b890', hair: ..., cloak: ..., trim: ..., armor: ... }
export function makePalette(art, colors) {
  const pal = art.pal.slice()
  for (const [name, color] of Object.entries(colors || {})) {
    const idx = art.ramps[name]
    if (!idx || color == null) continue
    const tones = shades(Array.isArray(color) ? color : toRGB(color), idx.length)
    idx.forEach((i, k) => { pal[i] = ((tones[k] & 0xffffff) | (pal[i] & 0xff000000)) >>> 0 })
  }
  return pal
}

// ------------------------------------------------------------------ a surface to draw on (the world, or the ui)
function surface(art, ui = false) {
  const S = { W: 0, H: 0, px: null, buf: null }
  const OPAQUE = ui ? 0xff000000 : 0      // on the HUD every colour is solid (no glow flag)
  S.resize = (w, h) => { S.W = w; S.H = h; S.buf = new Uint8Array(w * h * 4); S.px = new Uint32Array(S.buf.buffer) }
  S.clear = (c = C.dark) => S.px.fill(c)
  const blend = (i, c) => {
    const a = (c >>> 24) / 255, px = S.px
    if (a >= 1) { px[i] = c; return }
    const d = px[i], da = d >>> 24
    if (!da) { px[i] = c; return }
    const r = (d & 255) + (((c & 255) - (d & 255)) * a), g = ((d >> 8) & 255) + ((((c >> 8) & 255) - ((d >> 8) & 255)) * a), b = ((d >> 16) & 255) + ((((c >> 16) & 255) - ((d >> 16) & 255)) * a)
    px[i] = ((Math.max(da, c >>> 24) << 24) | (b << 16) | (g << 8) | r) >>> 0
  }
  S.blend = blend
  S.rect = (x, y, w, h, c) => {
    x = Math.round(x); y = Math.round(y)
    const W = S.W, x0 = Math.max(0, x), y0 = Math.max(0, y), x1 = Math.min(W, x + w), y1 = Math.min(S.H, y + h)
    if ((c >>> 24) === 255 || c === 0) { for (let yy = y0; yy < y1; yy++) S.px.fill(c, yy * W + x0, yy * W + x1); return }
    for (let yy = y0; yy < y1; yy++) for (let xx = x0; xx < x1; xx++) blend(yy * W + xx, c)
  }
  S.frame = (x, y, w, h, c) => { S.rect(x, y, w, 1, c); S.rect(x, y + h - 1, w, 1, c); S.rect(x, y, 1, h, c); S.rect(x + w - 1, y, 1, h, c) }
  S.dot = (x, y, c) => { x = Math.floor(x); y = Math.floor(y); if (x >= 0 && y >= 0 && x < S.W && y < S.H) blend(y * S.W + x, c) }
  S.ellipse = (cx, cy, rx, ry, c) => {
    for (let y = Math.floor(cy - ry); y <= cy + ry; y++) for (let x = Math.floor(cx - rx); x <= cx + rx; x++) {
      const dx = (x + 0.5 - cx) / rx, dy = (y + 0.5 - cy) / ry
      if (dx * dx + dy * dy <= 1) S.dot(x, y, c)
    }
  }
  S.ring = (cx, cy, r, c, ry = r) => {
    const n = Math.max(12, Math.round(Math.max(r, ry) * 6))
    for (let k = 0; k < n; k++) { const a = k / n * Math.PI * 2; S.dot(cx + Math.cos(a) * r, cy + Math.sin(a) * ry, c) }
  }
  // a line; dash > 0 leaves gaps (a faint dotted warning line)
  S.line = (x0, y0, x1, y1, c, dash = 0, width = 1) => {
    const n = Math.ceil(Math.hypot(x1 - x0, y1 - y0))
    for (let i = 0; i <= n; i++) {
      if (dash && Math.floor(i / dash) % 2) continue
      const x = x0 + (x1 - x0) * i / Math.max(1, n), y = y0 + (y1 - y0) * i / Math.max(1, n)
      if (width > 1) S.rect(x - width / 2, y - width / 2, width, width, c); else S.dot(x, y, c)
    }
  }
  // a sprite frame with its anchor at (x, y). opts: flip, pal (a palette), flash (one colour for every pixel), alpha
  S.sprite = (s, f, x, y, opts) => {
    if (!s) return
    if (opts?.scale > 1) return spriteScaled(s, f, x, y, opts)
    const data = s.frames[(f | 0) % s.frames.length], pal = opts?.pal || art().pal, flip = opts?.flip, flash = opts?.flash
    const alpha = opts?.alpha ?? 255
    const W = S.W, H = S.H, px = S.px
    const sx = Math.round(x - (flip ? s.w - 1 - s.ax : s.ax)), sy = Math.round(y - s.ay), sw = s.w
    const x0 = Math.max(0, -sx), x1 = Math.min(sw, W - sx), y0 = Math.max(0, -sy), y1 = Math.min(s.h, H - sy)
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * sw, dst = (sy + yy) * W + sx
      for (let xx = x0; xx < x1; xx++) {
        const idx = data[row + (flip ? sw - 1 - xx : xx)]
        if (!idx) continue
        const c = (flash || pal[idx]) | OPAQUE
        if (alpha >= 255) px[dst + xx] = c >>> 0; else blend(dst + xx, ((alpha << 24) | (c & 0xffffff)) >>> 0)
      }
    }
  }
  // a sprite drawn `scale` times larger (whole pixels), for big previews
  function spriteScaled(s, f, x, y, opts) {
    const data = s.frames[(f | 0) % s.frames.length], pal = opts.pal || art().pal, k = opts.scale, flip = opts.flip
    const sx = Math.round(x - (flip ? s.w - 1 - s.ax : s.ax) * k), sy = Math.round(y - s.ay * k)
    for (let yy = 0; yy < s.h; yy++) for (let xx = 0; xx < s.w; xx++) {
      const idx = data[yy * s.w + (flip ? s.w - 1 - xx : xx)]
      if (idx) S.rect(sx + xx * k, sy + yy * k, k, k, ((opts.flash || pal[idx]) | 0xff000000) >>> 0)
    }
  }
  // a sprite turned by `angle` (radians) around its anchor, sampled nearest: swords that swing, bows that aim
  S.spriteRot = (s, f, x, y, angle, opts) => {
    if (!s) return
    const data = s.frames[(f | 0) % s.frames.length], pal = opts?.pal || art().pal, flash = opts?.flash, flipY = opts?.flipY, flipX = opts?.flipX
    const ca = Math.cos(angle), sa = Math.sin(angle), r = Math.ceil(Math.hypot(Math.max(s.ax, s.w - s.ax), Math.max(s.ay, s.h - s.ay))) + 1
    const W = S.W, H = S.H, px = S.px
    for (let dy = -r; dy <= r; dy++) {
      const yy = Math.round(y) + dy
      if (yy < 0 || yy >= H) continue
      for (let dx = -r; dx <= r; dx++) {
        const xx = Math.round(x) + dx
        if (xx < 0 || xx >= W) continue
        // back into the sprite: rotate by -angle
        let u = Math.floor(dx * ca + dy * sa + s.ax + 0.5)
        let v = Math.floor(-dx * sa + dy * ca + s.ay + 0.5)
        if (flipX) u = 2 * s.ax - u
        if (flipY) v = 2 * s.ay - v
        if (u < 0 || v < 0 || u >= s.w || v >= s.h) continue
        const idx = data[v * s.w + u]
        if (idx) px[yy * W + xx] = ((flash || pal[idx]) | OPAQUE) >>> 0
      }
    }
  }
  // a tile, opaque, top left at (x, y)
  S.tile = (s, f, x, y) => {
    const data = s.frames[(f | 0) % s.frames.length], pal = art().pal, T = s.w, W = S.W, px = S.px
    const x0 = Math.max(0, -x), x1 = Math.min(T, W - x), y0 = Math.max(0, -y), y1 = Math.min(s.h, S.H - y)
    for (let yy = y0; yy < y1; yy++) {
      const row = yy * T, dst = (y + yy) * W + x
      for (let xx = x0; xx < x1; xx++) { const idx = data[row + xx]; if (idx) px[dst + xx] = (pal[idx] | OPAQUE) >>> 0 }
    }
  }
  S.text = (str, x, y, c = C.white, { scale = 1, align = 'left', shadow = C.ink, mixed = false } = {}) => {
    str = String(str)
    const tw = textWidth(str, scale, mixed)
    let cx = Math.round(align === 'center' ? x - tw / 2 : align === 'right' ? x - tw : x)
    y = Math.round(y)
    for (const ch of str) {
      const g = glyph(ch, mixed), n = g.rows.length
      if (shadow) for (let r = 0; r < n; r++) for (const gx of g.rows[r]) S.rect(cx + gx * scale + 1, y + r * scale + 1, scale, scale, shadow)
      for (let r = 0; r < n; r++) for (const gx of g.rows[r]) S.rect(cx + gx * scale, y + r * scale, scale, scale, c)
      cx += (g.w + 1) * scale
    }
    return tw
  }
  S.wrap = (str, width, scale = 1) => {
    const out = []
    for (const para of String(str).split('\n')) {
      let line = ''
      for (const word of para.split(' ')) {
        const t = line ? line + ' ' + word : word
        if (textWidth(t, scale) > width && line) { out.push(line); line = word } else line = t
      }
      out.push(line)
    }
    return out
  }
  S.textWidth = textWidth
  return S
}

// ------------------------------------------------------------------ the display
const VERT = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`
const FRAG = `
precision highp float;
uniform sampler2D uWorld; uniform sampler2D uUi; uniform sampler2D uLight;
uniform vec2 uWorldSize; uniform vec2 uUiSize; uniform vec2 uScreen; uniform float uLit;
varying vec2 vUv;
// sharp pixels at any scale: nearest inside each texel, a one-screen-pixel blend at its edges
vec4 sharp(sampler2D t, vec2 size, vec2 uv) {
  vec2 texel = uv * size;
  vec2 scale = max(uScreen / size, vec2(1.0));
  vec2 s = fract(texel) - 0.5;                       // from the texel's centre
  vec2 region = 0.5 - 0.5 / scale;                   // the flat middle of the texel
  vec2 f = (s - clamp(s, -region, region)) * scale + 0.5;
  return texture2D(t, (floor(texel) + f) / size);
}
void main() {
  vec2 uv = vec2(vUv.x, 1.0 - vUv.y);
  vec4 w = sharp(uWorld, uWorldSize, uv);
  vec3 col = w.rgb;
  if (uLit > 0.5) {
    vec3 L = texture2D(uLight, uv).rgb * 2.0;
    col *= mix(L, max(L, vec3(1.0)), step(w.a, 0.75));   // glowing pixels (alpha flag) stay bright in the dark
  }
  vec4 ui = sharp(uUi, uUiSize, uv);
  col = mix(col, ui.rgb, ui.a);
  gl_FragColor = vec4(col, 1.0);
}`

export function createDisplay(p0, { short = 448 } = {}) {
  let art = null
  const getArt = () => art
  const world = surface(getArt), ui = surface(getArt, true)
  let wTex = null, uTex = null, lTex = null, lBuf = null, LW = 0, LH = 0, lr = null, lg = null, lb = null, lit = false
  const uniforms = {
    uWorld: { value: null }, uUi: { value: null }, uLight: { value: null },
    uWorldSize: { value: new THREE.Vector2(1, 1) }, uUiSize: { value: new THREE.Vector2(1, 1) }, uScreen: { value: new THREE.Vector2(1, 1) }, uLit: { value: 0 },
  }
  const mat = new THREE.ShaderMaterial({ uniforms, vertexShader: VERT, fragmentShader: FRAG, depthTest: false, depthWrite: false })
  const plane = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), mat)
  plane.frustumCulled = false
  plane.renderOrder = 1
  p0.scene.add(plane)

  const texture = (buf, w, h, linear) => {
    const t = new THREE.DataTexture(buf, w, h, THREE.RGBAFormat)
    t.magFilter = t.minFilter = linear ? THREE.LinearFilter : THREE.NearestFilter
    t.generateMipmaps = false
    t.colorSpace = THREE.NoColorSpace
    t.needsUpdate = true
    return t
  }
  // view: the world layer's short side, the HUD layer's, and the light map's cell (world pixels)
  let view = { short, uiShort: short / 2, cell: 8 }
  const fit = (vw, vh, want, cap) => {
    const k = Math.min(vw, vh) / want
    let w = Math.round(vw / k), h = Math.round(vh / k)
    if (Math.max(w, h) > cap) { const f = cap / Math.max(w, h); w = Math.round(w * f); h = Math.round(h * f) }
    return [w + (w & 1), h + (h & 1)]
  }
  function resize() {
    const vw = Math.max(1, p0.width), vh = Math.max(1, p0.height)
    const [ww, wh] = fit(vw, vh, view.short, 1100), [uw, uh] = fit(vw, vh, view.uiShort, 560)
    if (ww === world.W && wh === world.H && uw === ui.W && uh === ui.H && view.cell === resize.cell) return
    resize.cell = view.cell
    world.resize(ww, wh); ui.resize(uw, uh)
    wTex?.dispose(); uTex?.dispose(); lTex?.dispose()
    wTex = texture(world.buf, ww, wh, true); uTex = texture(ui.buf, uw, uh, true)
    LW = Math.ceil(ww / view.cell) + 1; LH = Math.ceil(wh / view.cell) + 1
    lr = new Float32Array(LW * LH); lg = new Float32Array(LW * LH); lb = new Float32Array(LW * LH)
    lBuf = new Uint8Array(LW * LH * 4); lTex = texture(lBuf, LW, LH, true)
    uniforms.uWorld.value = wTex; uniforms.uUi.value = uTex; uniforms.uLight.value = lTex
    uniforms.uWorldSize.value.set(ww, wh); uniforms.uUiSize.value.set(uw, uh)
  }
  resize()
  p0.on('resize', resize)

  // ---- light: one cell per few world pixels (view.cell); the GPU smooths it over the picture
  function lightBegin(amb, tint) { lit = true; lr.fill(amb * tint[0]); lg.fill(amb * tint[1]); lb.fill(amb * tint[2]) }
  function lightOff() { lit = false }
  function light(x, y, radius, r, g, b, k = 1) {
    const c = view.cell, cx = x / c, cy = y / c, cr = radius / c
    const x0 = Math.max(0, Math.floor(cx - cr)), x1 = Math.min(LW - 1, Math.ceil(cx + cr))
    const y0 = Math.max(0, Math.floor(cy - cr)), y1 = Math.min(LH - 1, Math.ceil(cy + cr))
    const fr = r / 255 * k, fg = g / 255 * k, fb = b / 255 * k
    for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) {
      const d = Math.hypot(xx - cx, yy - cy) / cr
      if (d >= 1) continue
      const f = (1 - d) * (1 - d)
      const i = yy * LW + xx
      lr[i] += fr * f; lg[i] += fg * f; lb[i] += fb * f
    }
  }

  const fwd = new THREE.Vector3()
  function present() {
    const cam = p0.camera
    const d = Math.max(cam.near * 1.5, 0.02)
    const hh = 2 * d * Math.tan(THREE.MathUtils.degToRad(cam.fov) / 2)
    plane.scale.set(hh * cam.aspect, hh, 1)
    cam.getWorldDirection(fwd)
    plane.position.copy(cam.position).addScaledVector(fwd, d)
    plane.quaternion.copy(cam.quaternion)
    uniforms.uScreen.value.set(p0.width * (p0.pixelRatio || 1), p0.height * (p0.pixelRatio || 1))
    uniforms.uLit.value = lit ? 1 : 0
    if (lit) {
      for (let i = 0, n = LW * LH; i < n; i++) {
        lBuf[i * 4] = Math.min(255, lr[i] * 127.5); lBuf[i * 4 + 1] = Math.min(255, lg[i] * 127.5); lBuf[i * 4 + 2] = Math.min(255, lb[i] * 127.5); lBuf[i * 4 + 3] = 255
      }
      lTex.needsUpdate = true
    }
    wTex.needsUpdate = true; uTex.needsUpdate = true
  }

  // a position on the view (CSS pixels from its top left) in ui pixels
  function toUi(x, y) { return { x: x / p0.width * ui.W, y: y / p0.height * ui.H } }

  return {
    world, ui, plane,
    set art(a) { art = a }, get art() { return art },
    lightBegin, lightOff, light, present, toUi,
    setView(v) { view = { ...view, ...v }; resize() },
  }
}
