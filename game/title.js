// The title screen, after the old adventure-game splash: a warm painted backdrop that darkens toward the Demon
// Lord's keep, the hero large on the left with the lantern raised and its light brushed out behind, the logo top
// right and a quiet menu under it, the selected line marked by a flame.
import { rgba } from './display.js'

const INK = rgba(54, 24, 18), CREAM = rgba(250, 242, 222), DIM = rgba(232, 212, 176), SHADE = rgba(40, 16, 12, 210)
const LANTERN = [55, -95]              // where the lantern is in the portrait, from its feet (portrait pixels)

// the backdrop: parchment on the left to ember brown on the right, darker at the foot; dithered into a few tones.
// On a screen held upright it runs from the top down instead, so the menu at the bottom stands on dark ground.
function backdrop(W, H) {
  const px = new Uint32Array(W * H)
  const stops = [[0, [240, 226, 188]], [0.38, [214, 176, 118]], [0.7, [142, 82, 54]], [1, [62, 26, 28]]]
  const at = t => {
    let i = 0
    while (i < stops.length - 2 && t > stops[i + 1][0]) i++
    const [t0, a] = stops[i], [t1, b] = stops[i + 1], k = Math.min(1, Math.max(0, (t - t0) / (t1 - t0)))
    return a.map((v, j) => v + (b[j] - v) * k)
  }
  const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5]
  for (let y = 0; y < H; y++) {
    const fy = y / H, foot = fy > 0.7 && W >= H ? 1 - (fy - 0.7) * 0.6 : 1
    for (let x = 0; x < W; x++) {
      const fx = x / W, c = at(H > W ? fy * 0.9 + fx * 0.1 : fx * 0.92 + fy * 0.08)
      const glow = Math.max(0, 1 - Math.hypot(fx - (H > W ? 0.45 : 0.3), fy - (H > W ? 0.38 : 0.42)) * 1.6) * 18          // brighter round the hero
      const d = (BAYER[(y & 3) * 4 + (x & 3)] / 16 - 0.5) * 10
      const q = v => Math.max(0, Math.min(255, Math.round((v * foot + glow + d) / 10) * 10))
      px[y * W + x] = rgba(q(c[0]), q(c[1]), q(c[2]))
    }
  }
  return px
}

export function createSplash(art) {
  let cache = null, t = 0
  const motes = []
  const ground = (U, big) => {
    if (!cache || cache.W !== U.W || cache.H !== U.H) cache = { W: U.W, H: U.H, px: backdrop(U.W, U.H) }
    U.px.set(cache.px)
  }
  // the lantern's light: brush strokes, and motes drifting up out of it
  function light(U, dt, lx, ly, big) {
    U.sprite((big ? art.sprites : art.half).title_light, 0, lx, ly)
    if (Math.random() < dt * 9 && motes.length < 40) motes.push({ x: lx + (Math.random() - 0.5) * 16, y: ly + (Math.random() - 0.5) * 10, vx: (Math.random() - 0.5) * 8, vy: -6 - Math.random() * 10, t: 0, life: 2 + Math.random() * 2.5 })
    for (let i = motes.length - 1; i >= 0; i--) {
      const m = motes[i]; m.t += dt; m.x += (m.vx + Math.sin(m.t * 2 + i) * 4) * dt; m.y += m.vy * dt
      if (m.t > m.life) { motes.splice(i, 1); continue }
      const a = Math.round(230 * Math.min(1, m.t * 2, (m.life - m.t) / 0.8))
      U.dot(m.x, m.y, rgba(255, 246, 214, a))
    }
  }

  // the menus behind the title (creator, save files, lore, settings): the backdrop and its light, no hero
  function back(D, dt) {
    t += dt
    D.world.clear(rgba(14, 10, 20)); D.lightOff()
    const U = D.ui, big = U.H >= 200
    ground(U, big)
    light(U, dt, Math.round(U.W * 0.32), Math.round(U.H * 0.42), big)
    U.rect(0, 0, U.W, U.H, rgba(16, 8, 10, 140))
  }

  // the title fades in: up from black, then the logo, then the menu line by line, then the small print
  let intro = 0
  const ease = x => 1 - (1 - x) * (1 - x)
  const phase = (from, len) => ease(Math.max(0, Math.min(1, (intro - from) / len)))
  const faded = (c, a) => ((Math.round((c >>> 24) * a) << 24) | (c & 0xffffff)) >>> 0
  const wrap = (U, str, room) => {
    const lines = []
    let line = ''
    for (const wd of str.split(' ')) { const tl = line ? line + ' ' + wd : wd; if (U.textWidth(tl, 1, true) > room && line) { lines.push(line); line = wd } else line = tl }
    lines.push(line)
    return lines
  }

  // the title itself. items: [{ key, label }]; returns the menu's rects (for the mouse and taps) and the detail line's
  function draw(D, dt, { pal, outfit, head, items, sel, detail, version, hint, top = 12 }) {
    t += dt; intro += dt
    D.world.clear(rgba(14, 10, 20)); D.lightOff()
    const U = D.ui, W = U.W, H = U.H
    const big = H >= 200 && W >= 250, wide = W > H * 1.05, short = H < 200
    if (wide) top = Math.min(top, 20)
    ground(U, big)
    // the hero, and the lantern's light behind them
    const S = big ? art.sprites : art.half, k = big ? 1 : 0.5
    const hx = Math.round(wide ? W * 0.26 : W * 0.42), hy = Math.round(wide ? H - 4 : top + 58 + (big ? 196 : 104))
    light(U, dt, hx + Math.round(LANTERN[0] * k), hy + Math.round(LANTERN[1] * k), big)
    U.sprite(S['t_' + outfit], 0, hx, hy, { pal })
    U.sprite(S['th_' + head], 0, hx, hy, { pal })
    // a soft flicker on the lantern glass
    if (Math.sin(t * 7) + Math.sin(t * 17) > 1.2) U.dot(hx + Math.round(LANTERN[0] * k), hy + Math.round((LANTERN[1] - 1) * k), rgba(255, 255, 240, 200))
    // up from black
    const dark = 1 - phase(0, 0.9)
    if (dark > 0) U.rect(0, 0, W, H, rgba(8, 4, 10, Math.round(255 * dark)))

    // the logo, top right (centred above the menu on a tall screen), drifting down into place
    const logo = (wide && W >= 340) ? art.sprites.logo : art.sprites.logo_s
    const la = phase(0.45, 0.6), drop = Math.round((1 - la) * -4)
    const lx = wide ? W - logo.w - 12 : Math.round(W / 2 - logo.w / 2), ly = top + 10
    const lc = lx + logo.w / 2
    if (la > 0) {
      U.text('PIXEL DUNGEON', lc, top + drop, faded(rgba(255, 226, 150), la), { align: 'center', shadow: faded(INK, la) })
      U.sprite(logo, 0, lx, ly + drop, { alpha: Math.round(255 * la) })
    }
    const sa = phase(0.75, 0.5), subY = ly + logo.h + 3
    if (sa > 0) U.text('The Last Lantern Knight', lc, subY, faded(CREAM, sa), { align: 'center', shadow: faded(INK, sa), mixed: true })

    // the small print, bottom right: the sound hint (not where the screen is short) and the version
    const fine = short ? [version[0]] : [hint, ...version].filter(Boolean)
    const fineTop = H - 10 * fine.length - 2
    const pa = phase(1.5, 0.5)
    fine.forEach((l, i) => U.text(l, W - 8, fineTop + i * 10, faded(l === hint ? rgba(250, 234, 200) : rgba(220, 190, 160), pa), { align: 'right', shadow: faded(SHADE, pa), mixed: true }))

    // the menu and the line saying what the chosen item does, fitted between the logo and the small print
    const mx = wide ? W - 18 : Math.round(W / 2), align = wide ? 'right' : 'center'
    const dLines = detail ? wrap(U, detail, wide ? Math.min(W * 0.62, W - hx - 40 * k - 22) : W - 10) : []
    const dh = dLines.length ? 4 + dLines.length * 10 : 0
    const minY = wide ? subY + 16 : hy + 10, maxEnd = fineTop - 6
    let gap = big ? 15 : 13
    let my = Math.min(wide ? Math.max(minY, Math.round(H * 0.47)) : minY, maxEnd - items.length * gap - dh)
    if (my < minY) { gap = Math.max(10, Math.floor((maxEnd - minY - dh) / items.length)); my = minY }
    const rects = []
    items.forEach((it, i) => {
      const on = i === sel, w = U.textWidth(it.label, 1, true)
      const a = phase(0.95 + i * 0.07, 0.4), slide = Math.round((1 - a) * 8)
      const x = align === 'right' ? mx + slide : mx, x0 = align === 'right' ? x - w : x - w / 2
      if (a > 0) {
        U.text(it.label, x, my, faded(it.off ? rgba(180, 160, 136) : on ? rgba(255, 253, 244) : it.fresh ? rgba(255, 214, 120) : DIM, a), { align, shadow: faded(SHADE, a), mixed: true })      // fresh: not read yet
        if (on) U.sprite(art.sprites.ui_flame, 0, Math.round(x0 - 10), my - 1 + Math.round(Math.sin(t * 5) * 0.6), { alpha: Math.round(255 * a) })
      }
      rects.push({ x: Math.round(x0 - 12), y: my - 3, w: Math.round(w + 16), h: gap - 1 })
      my += gap
    })
    let detailRect = null
    if (dLines.length) {
      const a = phase(1.35, 0.45)
      let w = 0
      dLines.forEach((l, i) => { U.text(l, mx, my + 2 + i * 10, faded(rgba(240, 214, 160), a), { align, shadow: faded(SHADE, a), mixed: true }); w = Math.max(w, U.textWidth(l, 1, true)) })
      detailRect = { x: Math.round(align === 'right' ? mx - w : mx - w / 2) - 6, y: my - 1, w: w + 12, h: 10 * dLines.length + 2 }
    }
    return { rects, detailRect }
  }
  // start the fade again (back from a run), or finish it at once (a key or a tap)
  const restart = () => { intro = 0 }
  const skip = () => { if (intro < 2) intro = 2 }
  return { draw, back, restart, skip, get fading() { return intro < 2 } }
}
