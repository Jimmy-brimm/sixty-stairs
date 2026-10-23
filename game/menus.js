// The screens over the game: the character creator, the pause menu, the character sheet (stats and gear), the
// settings (keys and music). Each works with the keyboard (the bound keys or the arrows), the mouse and taps.
// in: { up, down, left, right, confirm, back, drop, tap: {x, y} | null, mouse: {x, y} | null, key: code | null }
import { C, rgba, RARITY_COLORS } from './display.js'
import { panel } from './ui.js'
import { CLASSES, HEADS, SKINS, HAIRS, CLOTHS, STAT_INFO, RARITY, itemName, itemLines, itemPower, heroStats, newHero, xpNeed, POINTS_PER_LEVEL } from './items.js'
import { knightPalette } from './play.js'

const inside = (p, r) => p && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h
const HILITE = rgba(255, 206, 70, 55)

// ------------------------------------------------------------------ the character creator
export function createCreator(art, onDone, start = null, { lockClass = false } = {}) {
  const s = { cls: 'knight', head: 3, skin: 1, hair: 0, cloak: 0, trim: 1, sel: 0, t: 0 }
  if (start) {
    s.cls = start.cls || 'knight'; const L = start.look || {}
    s.head = Math.max(0, HEADS.indexOf(L.head)); s.skin = Math.max(0, SKINS.indexOf(L.skin)); s.hair = Math.max(0, HAIRS.indexOf(L.hair))
    s.cloak = Math.max(0, CLOTHS.indexOf(L.cloak)); s.trim = Math.max(0, CLOTHS.indexOf(L.trim))
  }
  const classes = Object.keys(CLASSES)
  const rows = [
    { label: 'CLASS', get: () => CLASSES[s.cls].name + (lockClass ? ' (KEPT)' : ''), step: d => { if (lockClass) return; s.cls = classes[(classes.indexOf(s.cls) + d + 3) % 3]; s.head = HEADS.indexOf(CLASSES[s.cls].head) } },
    { label: 'HEAD', get: () => HEADS[s.head].toUpperCase(), step: d => { s.head = (s.head + d + HEADS.length) % HEADS.length } },
    { label: 'SKIN', swatch: () => SKINS[s.skin], step: d => { s.skin = (s.skin + d + SKINS.length) % SKINS.length } },
    { label: 'HAIR', swatch: () => HAIRS[s.hair], step: d => { s.hair = (s.hair + d + HAIRS.length) % HAIRS.length } },
    { label: 'CLOAK', swatch: () => CLOTHS[s.cloak], step: d => { s.cloak = (s.cloak + d + CLOTHS.length) % CLOTHS.length } },
    { label: 'TRIM', swatch: () => CLOTHS[s.trim], step: d => { s.trim = (s.trim + d + CLOTHS.length) % CLOTHS.length } },
    { label: lockClass ? 'DONE' : 'BEGIN', begin: true },
  ]
  const look = () => ({ outfit: CLASSES[s.cls].outfit, head: HEADS[s.head], skin: SKINS[s.skin], hair: HAIRS[s.hair], cloak: CLOTHS[s.cloak], trim: CLOTHS[s.trim] })
  return function frame(D, dt, inp, sfx) {
    const U = D.ui, W = U.W, H = U.H, S = art.sprites
    s.t += dt
    const pw = Math.min(W - 12, 300), ph = Math.min(H - 12, 200), px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
    panel(U, px, py, pw, ph)
    U.text('YOUR LANTERN KNIGHT', W / 2, py + 7, C.gold, { align: 'center' })
    // the preview: big, walking, turning
    const facing = ['down', 'right', 'up', 'right'][Math.floor(s.t / 1.6) % 4], flip = Math.floor(s.t / 1.6) % 4 === 3
    const L = look(), pal = knightPalette(art, L, 0), fr = Math.floor(s.t * 6) % 4
    const pvx = px + 62, pvy = py + 124
    U.ellipse(pvx, pvy - 2, 26, 6, rgba(0, 0, 0, 90))
    U.sprite(S['k_' + L.outfit + '_' + facing], fr, pvx, pvy, { pal, flip, scale: 2 })
    U.sprite(S['h_' + L.head + '_' + facing], fr, pvx, pvy, { pal, flip, scale: 2 })
    U.wrap(CLASSES[s.cls].desc, 110).forEach((l, i) => U.text(l, pvx, py + 134 + i * 9, C.dim, { align: 'center' }))
    const st = CLASSES[s.cls].stats
    U.text('STR ' + st.str + '  DEX ' + st.dex, pvx, py + 162, C.white, { align: 'center' })
    U.text('VIT ' + st.vit + '  INT ' + st.int, pvx, py + 172, C.white, { align: 'center' })
    // the choices
    const rx = px + 130, rw = pw - 140, rects = []
    rows.forEach((r, i) => {
      const y = py + 26 + i * 22
      const rect = { x: rx, y: y - 4, w: rw, h: 18 }
      rects.push(rect)
      if (inside(inp.mouse, rect)) s.sel = i
      if (i === s.sel) U.rect(rect.x, rect.y, rect.w, rect.h, HILITE)
      if (r.begin) { U.text(lockClass ? 'DONE' : 'BEGIN THE DESCENT', rx + rw / 2, y + 1, i === s.sel ? C.gold : C.white, { align: 'center' }); return }
      U.text(r.label, rx + 4, y + 1, C.dim)
      U.text('<', rx + 50, y + 1, C.gold); U.text('>', rx + rw - 10, y + 1, C.gold)
      if (r.swatch) { U.rect(rx + 70, y - 1, rw - 90, 10, rgbaHex(r.swatch())); U.frame(rx + 70, y - 1, rw - 90, 10, C.ink) }
      else U.text(r.get(), rx + 50 + (rw - 60) / 2, y + 1, C.white, { align: 'center' })
    })
    if (inp.up) { s.sel = (s.sel + rows.length - 1) % rows.length; sfx('uimove', 0.5) }
    if (inp.down) { s.sel = (s.sel + 1) % rows.length; sfx('uimove', 0.5) }
    const r = rows[s.sel]
    if (r.step && inp.left) { r.step(-1); sfx('uimove', 0.5) }
    if (r.step && (inp.right || inp.confirm)) { r.step(1); sfx('uimove', 0.5) }
    if (inp.tap) rects.forEach((rect, i) => {
      if (!inside(inp.tap, rect)) return
      s.sel = i
      if (rows[i].begin) { sfx('ui', 0.7); onDone(s.cls, look()) }
      else { rows[i].step(inp.tap.x < rect.x + rect.w / 2 ? -1 : 1); sfx('uimove', 0.5) }
    })
    if (r.begin && inp.confirm) { sfx('ui', 0.7); onDone(s.cls, look()) }
  }
}
function rgbaHex(hex) { const n = parseInt(hex.slice(1), 16); return rgba((n >> 16) & 255, (n >> 8) & 255, n & 255) }

// ------------------------------------------------------------------ the pause menu
export function drawPauseMenu(D, state, inp, sfx, { coop, musicOff }) {
  const U = D.ui, W = U.W, H = U.H
  const items = [
    { key: 'resume', label: 'CARRY ON' }, { key: 'stats', label: 'STATS' }, { key: 'sheet', label: 'GEAR & BAG' }, { key: 'settings', label: 'SETTINGS' },
    { key: 'quit', label: coop ? 'LEAVE THE PARTY' : 'BACK TO THE TITLE' },
  ]
  U.rect(0, 0, W, H, rgba(6, 3, 10, 150))
  const pw = 170, ph = 30 + items.length * 18, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
  panel(U, px, py, pw, ph)
  U.text(coop ? 'PAUSED (THE PARTY FIGHTS ON)' : 'PAUSED', W / 2, py + 7, C.gold, { align: 'center' })
  let pick = null
  items.forEach((it, i) => {
    const y = py + 24 + i * 18, rect = { x: px + 8, y: y - 4, w: pw - 16, h: 16 }
    if (inside(inp.mouse, rect)) state.sel = i
    if (state.sel === i) U.rect(rect.x, rect.y, rect.w, rect.h, HILITE)
    U.text(it.label, W / 2, y + 1, state.sel === i ? C.gold : C.white, { align: 'center' })
    if (inside(inp.tap, rect)) pick = it.key
  })
  if (inp.up) { state.sel = (state.sel + items.length - 1) % items.length; sfx('uimove', 0.5) }
  if (inp.down) { state.sel = (state.sel + 1) % items.length; sfx('uimove', 0.5) }
  if (inp.confirm) pick = items[state.sel].key
  if (inp.back) pick = 'resume'
  if (pick) sfx('ui', 0.6)
  return pick
}

// ------------------------------------------------------------------ the character sheet: stats and gear
export function drawSheet(D, art, hero, state, inp, sfx, onChange) {
  const U = D.ui, W = U.W, H = U.H, S = art.sprites
  const st = heroStats(hero)
  U.rect(0, 0, W, H, rgba(6, 3, 10, 170))
  const pw = Math.min(W - 8, 380), ph = Math.min(H - 8, 220), px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
  panel(U, px, py, pw, ph)
  U.text(CLASSES[hero.cls]?.name + '  LEVEL ' + hero.level, px + 8, py + 7, C.gold)
  U.text('XP ' + hero.xp + '/' + xpNeed(hero.level), px + pw - 8, py + 7, C.xp, { align: 'right' })
  // the slots, in focus order: four stats, weapon, armour, the bag
  const slots = []
  const stats = ['str', 'dex', 'vit', 'int']
  stats.forEach((k, i) => slots.push({ kind: 'stat', stat: k, x: px + 8, y: py + 24 + i * 16, w: 120, h: 14 }))
  const gx = px + 140
  slots.push({ kind: 'weapon', x: gx, y: py + 22, w: 20, h: 20 }, { kind: 'armor', x: gx + 26, y: py + 22, w: 20, h: 20 })
  const bagX = gx, bagY = py + 58, cell = 21, cols = pw - 150 >= 8 * cell ? 8 : 4
  for (let i = 0; i < 16; i++) slots.push({ kind: 'bag', i, x: bagX + (i % cols) * cell, y: bagY + Math.floor(i / cols) * cell, w: 20, h: 20 })
  state.sel = Math.max(0, Math.min(slots.length - 1, state.sel ?? 4))
  slots.forEach((sl, i) => { if (inside(inp.mouse, sl)) state.sel = i })

  // stats
  U.text('POINTS TO SPEND: ' + hero.points, px + 8, py + 90, hero.points ? C.green : C.dim)
  stats.forEach((k, i) => {
    const sl = slots[i], on = state.sel === i
    if (on) U.rect(sl.x - 2, sl.y - 3, sl.w + 4, sl.h, rgba(255, 206, 70, 45))
    U.sprite(S['st_' + k], 0, sl.x, sl.y - 1)
    U.text(k.toUpperCase() + ' ' + hero[k], sl.x + 13, sl.y, C.white)
    if (hero.points > 0) U.text('+', sl.x + sl.w - 10, sl.y, on ? C.gold : C.green)
  })
  const lines = [
    'HEALTH ' + hero.hp + '/' + st.maxHp, 'DAMAGE ' + st.dmg + '  (' + st.kind.toUpperCase() + ')', 'ATTACKS ' + (1 / st.cd).toFixed(1) + ' A SECOND',
    'CRIT ' + Math.round(st.crit * 100) + '%  X' + st.critMul.toFixed(1), 'DEFENCE ' + st.def, 'POTIONS HEAL ' + Math.round(st.heal * 100) + '%',
  ]
  if (st.leech) lines.push('LIFE STEAL ' + Math.round(st.leech * 100) + '%')
  if (st.xpMul > 1) lines.push('XP +' + Math.round((st.xpMul - 1) * 100) + '%')
  lines.forEach((l, i) => U.text(l, px + 8, py + 104 + i * 10, C.dim))

  // gear
  U.text('IN HAND', gx + 54, py + 24, C.dim); U.text('BAG ' + hero.bag.length + '/16', gx + 54, py + 34, C.dim)
  const drawItem = (it, sl, on) => {
    U.rect(sl.x, sl.y, sl.w, sl.h, rgba(30, 22, 40, 230))
    U.frame(sl.x, sl.y, sl.w, sl.h, it ? RARITY_COLORS[it.r] : rgba(70, 56, 90))
    if (on) U.frame(sl.x - 1, sl.y - 1, sl.w + 2, sl.h + 2, C.gold)
    if (it) U.sprite(S['i_' + it.k + it.t], 0, sl.x + 2, sl.y + 2)
  }
  slots.forEach((sl, i) => {
    if (sl.kind === 'weapon') drawItem(hero.weapon, sl, state.sel === i)
    else if (sl.kind === 'armor') drawItem(hero.armor, sl, state.sel === i)
    else if (sl.kind === 'bag') drawItem(hero.bag[sl.i], sl, state.sel === i)
  })
  // what the chosen slot holds, and how it compares
  const cur = slots[state.sel]
  const it = cur.kind === 'weapon' ? hero.weapon : cur.kind === 'armor' ? hero.armor : cur.kind === 'bag' ? hero.bag[cur.i] : null
  const ty = bagY + Math.ceil(16 / cols) * cell + 4
  if (cur.kind === 'stat') U.wrap(STAT_INFO[cur.stat], pw - 150).forEach((l, i) => U.text(l, gx, ty + i * 9, C.white))
  else if (it) {
    const tw = px + pw - 8 - gx
    const lines = [[itemName(it), RARITY_COLORS[it.r]], ...itemLines(it).flatMap((l, i) => U.wrap(l, tw).map(w => [w, i === 0 ? C.dim : C.white]))]
    if (cur.kind === 'bag') {
      const worn = it.k === 'armor' ? hero.armor : hero.weapon
      const d = Math.round(itemPower(it) - itemPower(worn))
      lines.push([d > 0 ? 'BETTER THAN YOURS (+' + d + ')' : d < 0 ? 'WEAKER THAN YOURS (' + d + ')' : 'AS GOOD AS YOURS', d > 0 ? C.green : d < 0 ? C.red : C.dim])
    }
    lines.forEach(([l, c], i) => U.text(l, gx, ty + i * 9, c))
  }
  U.text(cur.kind === 'bag' && it ? 'SPACE: EQUIP   X: DROP   Q: BACK' : cur.kind === 'stat' ? 'SPACE: SPEND A POINT   Q: BACK' : 'Q: BACK', W / 2, py + ph - 11, C.dim, { align: 'center' })

  // moving about: up/down/left/right walk the slots
  const move = d => { state.sel = (state.sel + d + slots.length) % slots.length; sfx('uimove', 0.4) }
  if (inp.up) move(cur.kind === 'bag' && cur.i >= cols ? -cols : -1)
  if (inp.down) move(cur.kind === 'bag' && cur.i + cols < 16 ? cols : 1)
  if (inp.left) move(-1)
  if (inp.right) move(1)
  let act = inp.confirm ? state.sel : -1
  if (inp.tap) slots.forEach((sl, i) => { if (inside(inp.tap, sl)) { if (state.sel === i || sl.kind === 'stat') act = i; state.sel = i } })
  if (act >= 0) {
    const sl = slots[act]
    if (sl.kind === 'stat' && hero.points > 0) { hero[sl.stat]++; hero.points--; sfx('pickup', 0.5); onChange() }
    else if (sl.kind === 'bag' && hero.bag[sl.i]) {
      const it = hero.bag[sl.i], slot = it.k === 'armor' ? 'armor' : 'weapon'
      hero.bag[sl.i] = hero[slot]; hero[slot] = it
      if (!hero.bag[sl.i]) hero.bag.splice(sl.i, 1)
      sfx('chest', 0.5); onChange()
    }
  }
  if (inp.drop && cur.kind === 'bag' && hero.bag[cur.i]) { hero.bag.splice(cur.i, 1); sfx('ui', 0.5); onChange() }
  return inp.back
}

// ------------------------------------------------------------------ the stats: four of them, the points to spend, what they make
export function drawStats(D, art, hero, state, inp, sfx, onChange) {
  const U = D.ui, W = U.W, H = U.H, S = art.sprites
  const st = heroStats(hero), stats = ['str', 'dex', 'vit', 'int']
  U.rect(0, 0, W, H, rgba(6, 3, 10, 170))
  const narrow = W < 300
  const pw = Math.min(W - 8, 330), ph = narrow ? 222 : 170, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
  panel(U, px, py, pw, ph)
  U.text('STATS', px + 8, py + 7, C.gold)
  U.text(CLASSES[hero.cls]?.name + '  LEVEL ' + hero.level, px + pw - 8, py + 7, C.white, { align: 'right' })
  // the experience bar to the next level
  const bx = px + 8, bw = pw - 16, need = xpNeed(hero.level)
  U.rect(bx, py + 19, bw, 4, rgba(20, 30, 50, 220)); U.rect(bx, py + 19, Math.floor(bw * Math.min(1, hero.xp / need)), 4, C.xp)
  U.text('XP ' + hero.xp + ' / ' + need + '   (+' + POINTS_PER_LEVEL + ' POINTS A LEVEL)', bx, py + 26, C.dim)
  U.text(hero.points ? 'POINTS TO SPEND: ' + hero.points : 'NO POINTS TO SPEND', bx, py + 38, hero.points ? C.green : C.dim)
  state.sel = Math.max(0, Math.min(3, state.sel ?? 0))
  const rows = stats.map((k, i) => ({ k, x: bx, y: py + 52 + i * 18, w: narrow ? bw : 150, h: 16 }))
  rows.forEach((r, i) => { if (inside(inp.mouse, r)) state.sel = i })
  rows.forEach((r, i) => {
    const on = state.sel === i
    U.rect(r.x, r.y, r.w, r.h, on ? rgba(255, 206, 70, 50) : rgba(30, 22, 40, 200))
    if (on) U.frame(r.x, r.y, r.w, r.h, C.gold)
    U.sprite(S['st_' + r.k], 0, r.x + 4, r.y + 3)
    U.text(r.k.toUpperCase(), r.x + 17, r.y + 5, on ? C.gold : C.white)
    U.text(String(hero[r.k]), r.x + r.w - 26, r.y + 5, C.white, { align: 'right' })
    if (hero.points > 0) { U.frame(r.x + r.w - 16, r.y + 2, 12, 12, on ? C.gold : C.green); U.text('+', r.x + r.w - 10, r.y + 5, on ? C.gold : C.green, { align: 'center' }) }
  })
  // what the chosen stat does, and what all of them make
  const ix = narrow ? bx : bx + 160, iw = narrow ? bw : pw - 176, iy = narrow ? py + 128 : py + 52
  const info = U.wrap(STAT_INFO[stats[state.sel]], iw)
  info.forEach((l, i) => U.text(l, ix, iy + i * 9, C.white))
  const lines = [
    'HEALTH ' + hero.hp + '/' + st.maxHp, 'DAMAGE ' + st.dmg + '  ' + (1 / st.cd).toFixed(1) + '/S', 'CRIT ' + Math.round(st.crit * 100) + '%  X' + st.critMul.toFixed(1),
    'DEFENCE ' + st.def, 'POTIONS HEAL ' + Math.round(st.heal * 100) + '%',
  ]
  if (st.leech) lines.push('LIFE STEAL ' + Math.round(st.leech * 100) + '%')
  if (st.xpMul > 1) lines.push('XP +' + Math.round((st.xpMul - 1) * 100) + '%')
  const ly = iy + info.length * 9 + 6
  lines.forEach((l, i) => U.text(l, ix, ly + i * 9, C.dim))
  U.text(hero.points ? 'SPACE OR +: SPEND A POINT   Q: BACK' : 'Q: BACK', W / 2, py + ph - 11, C.dim, { align: 'center' })

  if (inp.up) { state.sel = (state.sel + 3) % 4; sfx('uimove', 0.4) }
  if (inp.down) { state.sel = (state.sel + 1) % 4; sfx('uimove', 0.4) }
  let act = inp.confirm || inp.right ? state.sel : -1
  if (inp.tap) rows.forEach((r, i) => { if (inside(inp.tap, r)) { state.sel = i; if (inp.tap.x > r.x + r.w - 20 || inp.tap.touch) act = i } })
  if (act >= 0 && hero.points > 0) { hero[stats[act]]++; hero.points--; sfx('pickup', 0.5); onChange() }
  if (inp.tap && !inside(inp.tap, { x: px, y: py, w: pw, h: ph })) return true
  return inp.back
}

// ------------------------------------------------------------------ the waystone: a jump to the top of any land reached
export function drawWaystone(D, state, inp, sfx, { floors, here, lands }) {
  const U = D.ui, W = U.W, H = U.H
  U.rect(0, 0, W, H, rgba(6, 3, 10, 150))
  const items = [...floors.map(f => ({ f, label: 'FLOOR ' + f + '   ' + lands[Math.floor((f - 1) / 10)].name + (f === here ? '   (HERE)' : '') })), { f: 0, label: 'STAY HERE' }]
  const pw = Math.min(W - 8, 260), ph = 40 + items.length * 15, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
  panel(U, px, py, pw, ph)
  U.text('THE WAYSTONE', W / 2, py + 7, C.blue, { align: 'center' })
  U.text('IT HUMS. WHERE TO?', W / 2, py + 18, C.dim, { align: 'center' })
  state.sel = Math.max(0, Math.min(items.length - 1, state.sel ?? items.length - 1))
  let pick = null
  items.forEach((it, i) => {
    const y = py + 32 + i * 15, rect = { x: px + 8, y: y - 4, w: pw - 16, h: 14 }
    if (inside(inp.mouse, rect)) state.sel = i
    if (state.sel === i) U.rect(rect.x, rect.y, rect.w, rect.h, HILITE)
    U.text(it.label, W / 2, y, it.f === here ? C.dim : state.sel === i ? C.gold : C.white, { align: 'center' })
    if (inside(inp.tap, rect)) pick = i
  })
  if (inp.up) { state.sel = (state.sel + items.length - 1) % items.length; sfx('uimove', 0.4) }
  if (inp.down) { state.sel = (state.sel + 1) % items.length; sfx('uimove', 0.4) }
  if (inp.confirm) pick = state.sel
  if (inp.back) return 0
  if (pick === null) return null
  sfx('ui', 0.6)
  return items[pick].f === here ? 0 : items[pick].f
}

// ------------------------------------------------------------------ settings: keys and music
export const ACTIONS = [
  ['up', 'MOVE UP'], ['down', 'MOVE DOWN'], ['left', 'MOVE LEFT'], ['right', 'MOVE RIGHT'], ['attack', 'ATTACK'], ['dash', 'ROLL'],
  ['potion', 'POTION'], ['stats', 'STATS'], ['bag', 'GEAR & BAG'], ['map', 'MAP'], ['pause', 'PAUSE'],
]
export const DEFAULT_KEYS = { up: 'KeyW', down: 'KeyS', left: 'KeyA', right: 'KeyD', attack: 'Space', dash: 'ShiftLeft', potion: 'KeyE', stats: 'KeyC', bag: 'KeyI', map: 'KeyM', pause: 'KeyP' }
export const keyName = code => !code ? '-' : code.replace(/^Key/, '').replace(/^Digit/, '').replace('ShiftLeft', 'SHIFT').replace('ShiftRight', 'R-SHIFT').replace('ControlLeft', 'CTRL').replace('Arrow', '').replace('Space', 'SPACE').toUpperCase()

export function drawSettings(D, keys, state, inp, sfx, { musicOff, onMusic, onChange, gfx = 'HIGH', onGfx = () => {}, assist = false, onAssist = () => {}, diff = null, onDiff = () => {} }) {
  const U = D.ui, W = U.W, H = U.H
  U.rect(0, 0, W, H, rgba(6, 3, 10, 170))
  const rows = [...(diff ? [{ k: 'diff', l: 'DIFFICULTY' }] : []), { k: 'graphics', l: 'GRAPHICS' }, { k: 'assist', l: 'AIM AT NEAREST FOE' }, ...ACTIONS.map(([k, l]) => ({ k, l })), { k: 'music', l: 'MUSIC' }, { k: 'reset', l: 'DEFAULT KEYS' }, { k: 'back', l: 'BACK' }]
  const rh = Math.max(10, Math.min(13, Math.floor((H - 46) / rows.length)))       // rows close up to fit a short screen
  state.sel = state.sel ?? 0
  const pw = Math.min(W - 8, 240), diffRow = rows[state.sel]?.k === 'diff'
  const foot = U.wrap(diffRow ? diff.desc : 'ESC AND ENTER BELONG TO THE CITY', pw - 12)       // the difficulty's own words when it is chosen
  const ph = 22 + rows.length * rh + foot.length * 10, px = Math.round(W / 2 - pw / 2), py = Math.max(2, Math.round(H / 2 - ph / 2))
  panel(U, px, py, pw, ph)
  U.text(state.waiting ? 'PRESS A KEY FOR ' + ACTIONS.find(a => a[0] === state.waiting)[1] : 'SETTINGS', W / 2, py + 7, C.gold, { align: 'center' })
  state.sel = state.sel ?? 0
  let pick = null
  rows.forEach((r, i) => {
    const y = py + 22 + i * rh, rect = { x: px + 6, y: y - 2, w: pw - 12, h: rh - 1 }
    if (!state.waiting && inside(inp.mouse, rect)) state.sel = i
    if (state.sel === i) U.rect(rect.x, rect.y, rect.w, rect.h, HILITE)
    U.text(r.l, px + 12, y, state.sel === i ? C.gold : C.white)
    const val = r.k === 'diff' ? diff.name : r.k === 'graphics' ? gfx : r.k === 'assist' ? (assist ? 'ON' : 'OFF') : r.k === 'music' ? (musicOff ? 'OFF' : 'ON') : keys[r.k] !== undefined ? (state.waiting === r.k ? '...' : keyName(keys[r.k])) : ''
    U.text(val, px + pw - 12, y, C.white, { align: 'right' })
    if (inside(inp.tap, rect)) pick = i
  })
  foot.forEach((l, i) => U.text(l, W / 2, py + ph - 10 * (foot.length - i), diffRow ? (diff.noHit ? C.red : C.gold) : C.dim, { align: 'center' }))
  if (state.waiting) {
    if (inp.key && inp.key !== 'Escape' && inp.key !== 'Enter') {
      // a key already in use moves to the action that just gave its own up
      const other = Object.keys(keys).find(k => keys[k] === inp.key && k !== state.waiting)
      if (other) keys[other] = keys[state.waiting]
      keys[state.waiting] = inp.key; state.waiting = null; sfx('ui', 0.6); onChange()
    }
    return false
  }
  if (inp.up) { state.sel = (state.sel + rows.length - 1) % rows.length; sfx('uimove', 0.4) }
  if (inp.down) { state.sel = (state.sel + 1) % rows.length; sfx('uimove', 0.4) }
  if (inp.confirm) pick = state.sel
  if (pick !== null) {
    const r = rows[pick]; state.sel = pick; sfx('ui', 0.6)
    if (r.k === 'back') return true
    if (r.k === 'diff') onDiff()
    else if (r.k === 'graphics') onGfx()
    else if (r.k === 'assist') onAssist()
    else if (r.k === 'music') onMusic()
    else if (r.k === 'reset') { Object.assign(keys, DEFAULT_KEYS); onChange() }
    else state.waiting = r.k
  }
  return inp.back
}
