// What is drawn over the game, on the HUD layer (half the world's resolution): the HUD, pages of text, the map.
import { C, rgba } from './display.js'
import { TILE, WALL, HAZ } from './world.js'
import { xpNeed } from './items.js'
import { LANDS, BOSSES } from './lore.js'

const PANEL = rgba(16, 10, 24, 228), EDGE = rgba(120, 90, 160), HILITE = rgba(255, 206, 70, 60)

export function panel(U, x, y, w, h) { U.rect(x, y, w, h, PANEL); U.frame(x, y, w, h, EDGE); U.frame(x + 1, y + 1, w - 2, h - 2, rgba(50, 36, 70)) }

// where the phone buttons are (also what a tap there means)
export function touchButtons(U) {
  const s = 30, m = 6
  return [
    { key: 'attack', x: U.W - s - m - 2, y: U.H - s - m - 14, w: s, h: s, label: 'HIT' },
    { key: 'dash', x: U.W - s * 2 - m * 2 - 6, y: U.H - Math.round(s * 0.75) - m, w: Math.round(s * 0.8), h: Math.round(s * 0.75), label: 'ROLL' },
    { key: 'potion', x: U.W - s - m - 2, y: U.H - s * 2 - m * 2 - 18, w: Math.round(s * 0.8), h: Math.round(s * 0.75), label: '' },
    { key: 'pause', x: 4, y: Math.round(U.H * 0.42), w: 22, h: 16, label: 'II' },
    { key: 'bag', x: 4, y: Math.round(U.H * 0.42) + 20, w: 22, h: 16, label: 'BAG' },
    { key: 'stats', x: 4, y: Math.round(U.H * 0.42) + 40, w: 22, h: 16, label: 'STAT' },
  ]
}

export function drawHud(D, art, run, { top = 3, phone = false, party = null, mapMode = 0, keys = {} }) {
  const U = D.ui, S = art.sprites, h = run.hero, st = run.stats, W = U.W, H = U.H
  const mh = st.maxHp, bw = Math.min(110, Math.round(W * 0.3))
  U.sprite(S.heart, 0, 8, top + 6)
  U.rect(16, top + 2, bw, 8, C.hpBack); U.rect(16, top + 2, Math.ceil(bw * Math.max(0, h.hp) / mh), 8, h.hp < mh * 0.3 ? rgba(255, 60, 60) : C.hp)
  U.rect(16, top + 2, Math.ceil(bw * Math.max(0, h.hp) / mh), 2, rgba(255, 140, 150))
  U.frame(15, top + 1, bw + 2, 10, C.ink)
  U.text(h.hp + '/' + mh, 18 + bw / 2, top + 3, C.white, { align: 'center' })
  U.rect(16, top + 12, bw, 3, rgba(20, 30, 50, 220)); U.rect(16, top + 12, Math.floor(bw * h.xp / xpNeed(h.level)), 3, C.xp)
  U.text('LV ' + h.level, 16 + bw + 5, top + 3, C.gold)
  if (h.points > 0 && Math.floor(run.F.floor * 0 + Date.now() / 500) % 2 === 0) U.text('+' + h.points + ' POINTS (' + (phone ? 'STAT' : keys.stats || 'C') + ')', 16 + bw + 5, top + 12, C.green)
  // the weapon in hand and the potions
  U.sprite(S['i_' + st.kind + st.tier], 0, 8, top + 18)
  U.text(st.dmg, 26, top + 22, C.white)
  const px = 26 + U.textWidth(String(st.dmg)) + 10
  if (!phone) { U.sprite(S.potion, 0, px + 8, top + 33); U.text('x' + h.potions + ' ' + (keys.potion || 'E'), px + 16, top + 22, h.potions ? C.white : C.dim) }

  const land = LANDS[run.li]
  const label = run.label || 'FLOOR ' + run.floor
  U.text(label, 4, H - 20, C.gold)
  if (run.diffName && run.diffName !== 'NORMAL') U.text(run.diffName, 4 + U.textWidth(label) + 8, H - 20, run.diffName === 'NO HIT' ? C.red : C.dim)
  U.text(run.placeName || land.name, 4, H - 10, C.dim)

  drawMinimap(U, run, top, mapMode)

  const b = run.boss
  if (b && !b.dead && run.bossIntro <= 0) {
    const w = Math.min(200, W - 120), x = Math.round(W / 2 - w / 2), y = H - 16
    U.text(run.bossName || BOSSES[run.li].name, W / 2, y - 10, C.red, { align: 'center' })
    U.rect(x, y, w, 6, C.hpBack); U.rect(x, y, Math.ceil(w * b.hp / b.maxHp), 6, b.phase === 2 ? rgba(255, 90, 40) : C.hp); U.frame(x - 1, y - 1, w + 2, 8, C.ink)
  }
  if (party) {
    let y = top + 46
    for (const o of run.others.values()) {
      U.text((o.name || '?').slice(0, 10), 4, y, o.dead ? C.dim : C.white)
      U.rect(4, y + 8, 40, 2, C.hpBack); U.rect(4, y + 8, Math.ceil(40 * Math.max(0, o.hp || 0) / (o.mh || 1)), 2, C.hp)
      if (o.ready || o.readyUp) U.text(o.readyUp ? '^' : '>', 48, y, C.gold)
      y += 13
    }
  }
  if (phone) for (const bt of touchButtons(U)) {
    U.ellipse(bt.x + bt.w / 2, bt.y + bt.h / 2, bt.w / 2, bt.h / 2, rgba(20, 14, 28, 150))
    U.ring(bt.x + bt.w / 2, bt.y + bt.h / 2, bt.w / 2, rgba(200, 180, 230, 160), bt.h / 2)
    if (bt.key === 'potion') { U.sprite(S.potion, 0, bt.x + bt.w / 2, bt.y + bt.h / 2 + 7); U.text(h.potions, bt.x + bt.w - 2, bt.y + bt.h - 6, C.white) }
    else U.text(bt.label, bt.x + bt.w / 2, bt.y + bt.h / 2 - 3, C.white, { align: 'center' })
  }

  if (run.reading) drawPage(U, run.reading[0], run.reading.slice(1), 'SPACE OR TAP TO CLOSE')
  if (run.bossIntro > 0) {
    const k = Math.min(1, run.bossIntro / 0.4, (2.6 - run.bossIntro) / 0.4)
    if (k > 0.3) { U.rect(0, H / 2 - 18, W, 34, rgba(0, 0, 0, 160)); U.text(run.bossName || BOSSES[run.li].name, W / 2, H / 2 - 10, C.red, { scale: W > 330 ? 2 : 1, align: 'center' }) }
  }
  const bn = run.banner
  if (bn) {
    U.text(bn.text, W / 2, Math.round(H * 0.3), bn.color, { align: 'center' })
    if (bn.sub) U.wrap(bn.sub, Math.min(W - 20, 300)).forEach((l, i) => U.text(l, W / 2, Math.round(H * 0.3) + 12 + i * 9, C.white, { align: 'center' }))
  }
}

// mode 0: small in the corner; 1: large in the middle; 2: hidden. Returns where it is (for taps).
export function drawMinimap(U, run, top, mode = 0) {
  if (mode === 2) return null
  const F = run.F
  const maxW = mode === 1 ? U.W - 40 : Math.min(72, Math.round(U.W * 0.22)), maxH = mode === 1 ? U.H - 60 : 56
  const k = Math.max(1, Math.min(mode === 1 ? 4 : 2, Math.floor(Math.min(maxW / F.w, maxH / F.h) * 2) / 2))
  const w = Math.ceil(F.w * k), h = Math.ceil(F.h * k)
  const x0 = mode === 1 ? Math.round(U.W / 2 - w / 2) : U.W - w - 4, y0 = mode === 1 ? Math.round(U.H / 2 - h / 2) : top
  U.rect(x0 - 1, y0 - 1, w + 2, h + 2, rgba(10, 6, 14, mode === 1 ? 210 : 170))
  for (let y = 0; y < F.h; y++) for (let x = 0; x < F.w; x++) {
    const i = F.i(x, y)
    if (!F.seen[i]) continue
    const t = F.tile[i]
    if (t === WALL && !(F.t(x + 1, y) !== WALL || F.t(x - 1, y) !== WALL || F.t(x, y + 1) !== WALL || F.t(x, y - 1) !== WALL)) continue
    const c = t === WALL ? rgba(110, 96, 130, 230) : t === HAZ ? rgba(200, 90, 40, 220) : F.ob[i] ? rgba(70, 60, 80, 220) : rgba(40, 34, 50, 220)
    U.rect(x0 + Math.floor(x * k), y0 + Math.floor(y * k), Math.ceil(k), Math.ceil(k), c)
  }
  const dot = mode === 1 ? 4 : 2
  if (run.stairsOpen && F.seen[F.i(F.stairs.x, F.stairs.y)]) U.rect(x0 + Math.floor(F.stairs.x * k) - 1, y0 + Math.floor(F.stairs.y * k) - 1, dot + 1, dot + 1, C.blue)
  if (F.stone && F.seen[F.i(F.stone.x, F.stone.y)]) U.rect(x0 + Math.floor(F.stone.x * k), y0 + Math.floor(F.stone.y * k), dot, dot, rgba(120, 220, 255))
  if (run.hasUp ?? run.floor > 1) U.rect(x0 + Math.floor(F.start.x * k), y0 + Math.floor(F.start.y * k), dot, dot, rgba(255, 220, 150))
  if (run.waypoint) U.rect(x0 + Math.floor(run.waypoint.x / TILE * k) - 1, y0 + Math.floor(run.waypoint.y / TILE * k) - 1, dot + 1, dot + 1, rgba(110, 200, 255))
  for (const c of F.chests) if (F.seen[F.i(c.x, c.y)]) U.rect(x0 + Math.floor(c.x * k), y0 + Math.floor(c.y * k), dot, dot, rgba(230, 180, 70))
  for (const o of run.others.values()) U.rect(x0 + Math.floor(o.x / TILE * k), y0 + Math.floor(o.y / TILE * k), dot, dot, C.green)
  U.rect(x0 + Math.floor(run.me.x / TILE * k), y0 + Math.floor(run.me.y / TILE * k), dot, dot, C.gold)
  U.frame(x0 - 2, y0 - 2, w + 4, h + 4, EDGE)
  if (mode === 1) U.text('THE MAP', U.W / 2, y0 - 12, C.gold, { align: 'center' })
  return { x: x0 - 2, y: y0 - 2, w: w + 4, h: h + 4 }
}

// keepLines: each entry is its own line (menus); otherwise the lines are prose, joined into paragraphs and re-wrapped
export function drawPage(U, title, lines, foot, { keepLines = false } = {}) {
  const W = U.W, H = U.H
  const pw = Math.min(W - 16, 320)
  const body = keepLines ? lines.flatMap(l => l ? U.wrap(l, pw - 16) : ['']) : U.wrap(lines.join('\n').replace(/\n(?!\n)/g, ' ').replace(/ {2,}/g, ' '), pw - 16)
  const ph = 24 + body.length * 10 + (foot ? 16 : 4), px = Math.round(W / 2 - pw / 2), py = Math.max(4, Math.round(H / 2 - ph / 2))
  panel(U, px, py, pw, ph)
  U.text(title, W / 2, py + 7, C.gold, { align: 'center' })
  body.forEach((l, i) => U.text(l, px + 8, py + 21 + i * 10, C.white))
  if (foot) U.text(foot, W / 2, py + ph - 12, C.dim, { align: 'center' })
  return { px, py, pw, ph }
}

export function drawMenu(U, items, sel, x, y, w) {
  const rects = []
  items.forEach((it, i) => {
    const ry = y + i * 16
    if (i === sel) { U.rect(x, ry - 3, w, 13, HILITE); U.text('>', x + 4, ry, C.gold) }
    U.text(it.label, x + w / 2, ry, it.disabled ? C.dim : i === sel ? C.gold : C.white, { align: 'center' })
    rects.push({ x, y: ry - 3, w, h: 13 })
  })
  return rects
}

export function drawLandCard(U, li, t) {
  const k = Math.min(1, t / 0.5, (4 - t) / 0.8)
  if (k <= 0) return
  const W = U.W, y = Math.round(U.H * 0.24), land = LANDS[li]
  const lines = U.wrap(land.lines.join(' '), W - 16)
  U.rect(0, y - 6, W, 28 + lines.length * 9, rgba(0, 0, 0, Math.round(150 * k)))
  if (k > 0.25) {
    U.text(land.name, W / 2, y, C.gold, { scale: W > 300 ? 2 : 1, align: 'center' })
    lines.forEach((l, i) => U.text(l, W / 2, y + 18 + i * 9, C.white, { align: 'center' }))
  }
}
