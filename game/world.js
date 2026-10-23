// The sixty floors. Each is made from its number alone, so everyone in a party gets the same floor.
import { STONES } from './lore.js'

export const TILE = 16
export const FLOOR = 0, WALL = 1, HAZ = 2

// what each land is made of. hazard: 'block' (water: you cannot walk in it), 'slow', or 'burn'
export const LANDS = [
  { key: 'cave', ambient: 0.34, tint: [0.8, 0.88, 1.12], hazard: 'block', lantern: 120,
    monsters: ['bat', 'cave_slime', 'skeleton', 'crystal_beetle'], boss: 'wyrm',
    obstacles: [['stalagmite', 6], ['crystal', 2], ['glowshroom', 2]] },
  { key: 'plains', ambient: 1, tint: [1, 1, 1], hazard: 'block', lantern: 0,
    monsters: ['green_slime', 'goblin', 'goblin_archer', 'boar'], boss: 'scarecrow',
    obstacles: [['boulder', 4], ['bush', 5], ['hay', 2]] },
  { key: 'forest', ambient: 0.72, tint: [0.86, 1, 0.86], hazard: 'slow', lantern: 90,
    monsters: ['wolf', 'sporeling', 'sapling', 'spider'], boss: 'rootmother',
    obstacles: [['tree', 6], ['tree2', 4], ['stump', 2], ['redshroom', 1]] },
  { key: 'desert', ambient: 1, tint: [1.05, 1, 0.92], hazard: 'slow', lantern: 0,
    monsters: ['scorpion', 'mummy', 'vulture', 'cobra'], boss: 'sandmaw',
    obstacles: [['cactus', 5], ['ruinpillar', 2], ['boulder_d', 3]] },
  { key: 'volcano', ambient: 0.46, tint: [1.1, 0.82, 0.74], hazard: 'burn', lantern: 105,
    monsters: ['fire_imp', 'magma_slime', 'salamander', 'ember'], boss: 'golem',
    obstacles: [['basalt', 5], ['obsidian', 3], ['vent', 2]] },
  { key: 'castle', ambient: 0.36, tint: [1.08, 0.8, 0.8], hazard: 'burn', lantern: 115,
    monsters: ['demon_knight', 'imp_mage', 'hellhound', 'gargoyle'], boss: 'demonlord',
    obstacles: [['pillar', 3], ['brazier', 3], ['statue', 2]] },
]
export const GLOWS = { crystal: [80, 200, 255, 70], glowshroom: [110, 150, 255, 52], vent: [255, 130, 40, 64], brazier: [255, 150, 60, 90] }

export const landOf = floor => LANDS[Math.min(5, Math.floor((floor - 1) / 10))]
export const landIndex = floor => Math.min(5, Math.floor((floor - 1) / 10))
export const isBossFloor = floor => floor % 10 === 0
export const checkpointOf = floor => Math.floor((floor - 1) / 10) * 10 + 1

// a small seeded random generator (mulberry32)
export function rng(seed) {
  let a = seed >>> 0
  const next = () => {
    a = (a + 0x6D2B79F5) >>> 0
    let t = a
    t = Math.imul(t ^ (t >>> 15), t | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296
  }
  next.int = n => Math.floor(next() * n)
  next.range = (a, b) => a + next() * (b - a)
  next.pick = list => list[Math.floor(next() * list.length)]
  return next
}

// ------------------------------------------------------------------ the floor itself
class Floor {
  constructor(w, h, floor) {
    this.w = w; this.h = h; this.floor = floor
    this.land = landOf(floor); this.landIndex = landIndex(floor)
    this.tile = new Uint8Array(w * h).fill(WALL)
    this.variant = new Uint8Array(w * h)
    this.ob = new Uint8Array(w * h)        // obstacle: 1 + index into land.obstacles
    this.deco = new Uint8Array(w * h)      // decoration: 1 + index, drawn over the floor
    this.seen = new Uint8Array(w * h)      // explored, for the minimap
    this.lights = []                       // [x, y, r, g, b, radius] in pixels
    this.chests = []; this.monsters = []; this.stone = null; this.start = null; this.stairs = null; this.boss = null
  }
  i(x, y) { return y * this.w + x }
  in(x, y) { return x >= 0 && y >= 0 && x < this.w && y < this.h }
  t(x, y) { return this.in(x, y) ? this.tile[y * this.w + x] : WALL }
  set(x, y, v) { if (this.in(x, y)) this.tile[y * this.w + x] = v }
  // can a walker stand on this tile?
  solid(x, y) {
    if (!this.in(x, y)) return true
    const i = y * this.w + x, t = this.tile[i]
    return t === WALL || this.ob[i] > 0 || (t === HAZ && this.land.hazard === 'block')
  }
  // does it stop a flying shot or a flier?
  blocksShot(x, y) { if (!this.in(x, y)) return true; const i = y * this.w + x; return this.tile[i] === WALL || this.ob[i] > 0 }
  hazardAt(px, py) {
    const x = Math.floor(px / TILE), y = Math.floor(py / TILE)
    return this.t(x, y) === HAZ ? this.land.hazard : null
  }
  // safe ground: walkable and does not hurt
  safe(x, y) { return !this.solid(x, y) && !(this.t(x, y) === HAZ && this.land.hazard === 'burn') }

  // breadth-first distances over safe ground (Int16, -1 unreachable)
  distances(sx, sy, through = (x, y) => this.safe(x, y)) {
    const d = new Int16Array(this.w * this.h).fill(-1), q = [sx, sy]
    d[this.i(sx, sy)] = 0
    for (let h = 0; h < q.length; h += 2) {
      const x = q[h], y = q[h + 1], nd = d[this.i(x, y)] + 1
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (!this.in(nx, ny) || d[this.i(nx, ny)] >= 0 || !through(nx, ny)) continue
        d[this.i(nx, ny)] = nd; q.push(nx, ny)
      }
    }
    return d
  }
}

// ------------------------------------------------------------------ the land shapes
function caves(F, r, fill = 0.46) {
  const { w, h } = F
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) F.set(x, y, r() < fill ? WALL : FLOOR)
  for (let k = 0; k < 5; k++) {
    const next = new Uint8Array(F.tile)
    for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
      let n = 0
      for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if ((dx || dy) && F.t(x + dx, y + dy) === WALL) n++
      next[F.i(x, y)] = n >= 5 ? WALL : n <= 3 ? FLOOR : F.t(x, y)
    }
    F.tile.set(next)
  }
}
function blob(F, cx, cy, rad, v, r, only = null) {
  for (let y = Math.floor(cy - rad - 1); y <= cy + rad + 1; y++) for (let x = Math.floor(cx - rad - 1); x <= cx + rad + 1; x++) {
    if (x < 1 || y < 1 || x >= F.w - 1 || y >= F.h - 1) continue
    if (Math.hypot(x - cx, y - cy) <= rad + r.range(-0.6, 0.6) && (only === null || F.t(x, y) === only)) F.set(x, y, v)
  }
}
function walk(F, x, y, steps, width, v, r, turn = 0.3) {
  let a = r() * Math.PI * 2
  for (let s = 0; s < steps; s++) {
    for (let dy = 0; dy < width; dy++) for (let dx = 0; dx < width; dx++) {
      const tx = Math.round(x) + dx, ty = Math.round(y) + dy
      if (tx > 0 && ty > 0 && tx < F.w - 1 && ty < F.h - 1) F.set(tx, ty, v)
    }
    a += r.range(-turn, turn); x += Math.cos(a); y += Math.sin(a)
    if (x < 2 || x > F.w - 3) a = Math.PI - a
    if (y < 2 || y > F.h - 3) a = -a
    x = Math.max(1, Math.min(F.w - 2, x)); y = Math.max(1, Math.min(F.h - 2, y))
  }
}
function rooms(F, r, count, minS, maxS) {
  const list = []
  for (let tries = 0; tries < count * 20 && list.length < count; tries++) {
    const rw = minS + r.int(maxS - minS + 1), rh = minS + r.int(maxS - minS + 1)
    const x = 2 + r.int(F.w - rw - 4), y = 2 + r.int(F.h - rh - 4)
    if (list.some(o => x < o.x + o.w + 2 && x + rw + 2 > o.x && y < o.y + o.h + 2 && y + rh + 2 > o.y)) continue
    list.push({ x, y, w: rw, h: rh, cx: x + (rw >> 1), cy: y + (rh >> 1) })
  }
  for (const o of list) for (let y = o.y; y < o.y + o.h; y++) for (let x = o.x; x < o.x + o.w; x++) F.set(x, y, FLOOR)
  // join each room to the nearest one already joined, then add a couple of loops
  const joined = [list[0]]
  const corridor = (a, b) => {
    let x = a.cx, y = a.cy
    const horizontalFirst = r() < 0.5
    const stepTo = (tx, ty) => {
      while (x !== tx) { x += Math.sign(tx - x); F.set(x, y, FLOOR); F.set(x, y + 1, FLOOR) }
      while (y !== ty) { y += Math.sign(ty - y); F.set(x, y, FLOOR); F.set(x + 1, y, FLOOR) }
    }
    if (horizontalFirst) { stepTo(b.cx, y); stepTo(x, b.cy) } else { stepTo(x, b.cy); stepTo(b.cx, y) }
  }
  for (const o of list.slice(1)) {
    let best = joined[0], bd = 1e9
    for (const j of joined) { const d = Math.abs(j.cx - o.cx) + Math.abs(j.cy - o.cy); if (d < bd) { bd = d; best = j } }
    corridor(best, o); joined.push(o)
  }
  for (let k = 0; k < 2 && list.length > 3; k++) corridor(r.pick(list), r.pick(list))
  return list
}

const SHAPES = {
  cave(F, r) {
    caves(F, r, 0.46)
    for (let k = 0; k < 3; k++) blob(F, r.range(4, F.w - 4), r.range(4, F.h - 4), r.range(1.5, 3), HAZ, r, FLOOR)
  },
  plains(F, r) {
    for (let y = 1; y < F.h - 1; y++) for (let x = 1; x < F.w - 1; x++) F.set(x, y, FLOOR)
    for (let k = 0; k < 9 + r.int(5); k++) walk(F, r.range(3, F.w - 3), r.range(3, F.h - 3), 6 + r.int(12), 2, WALL, r, 0.5)
    for (let k = 0; k < 2 + r.int(2); k++) blob(F, r.range(5, F.w - 5), r.range(5, F.h - 5), r.range(2, 3.5), HAZ, r, FLOOR)
  },
  forest(F, r) {
    const spots = []
    for (let k = 0; k < 11; k++) { const s = [r.range(4, F.w - 4), r.range(4, F.h - 4)]; spots.push(s); blob(F, s[0], s[1], r.range(2.2, 4.5), FLOOR, r) }
    for (let k = 1; k < spots.length; k++) {
      let [x, y] = spots[k - 1]; const [tx, ty] = spots[k]
      while (Math.abs(x - tx) > 1 || Math.abs(y - ty) > 1) {
        x += Math.sign(tx - x) * (r() < 0.7 ? 1 : 0); y += Math.sign(ty - y) * (r() < 0.7 ? 1 : 0)
        for (const [dx, dy] of [[0, 0], [1, 0], [0, 1], [1, 1]]) F.set(Math.round(x) + dx, Math.round(y) + dy, FLOOR)
      }
    }
    for (let k = 0; k < 3; k++) { const s = r.pick(spots); blob(F, s[0] + r.range(-1, 1), s[1] + r.range(-1, 1), r.range(1, 2), HAZ, r, FLOOR) }
  },
  desert(F, r) {
    for (let y = 1; y < F.h - 1; y++) for (let x = 1; x < F.w - 1; x++) F.set(x, y, FLOOR)
    for (let k = 0; k < 6; k++) {      // ruined walls: rectangles with gaps
      const rw = 5 + r.int(6), rh = 4 + r.int(5), x0 = 2 + r.int(F.w - rw - 4), y0 = 2 + r.int(F.h - rh - 4)
      for (let x = x0; x <= x0 + rw; x++) for (const y of [y0, y0 + rh]) if (r() < 0.75) F.set(x, y, WALL)
      for (let y = y0; y <= y0 + rh; y++) for (const x of [x0, x0 + rw]) if (r() < 0.75) F.set(x, y, WALL)
    }
    for (let k = 0; k < 4; k++) blob(F, r.range(4, F.w - 4), r.range(4, F.h - 4), r.range(1.5, 3), HAZ, r, FLOOR)
  },
  volcano(F, r) {
    caves(F, r, 0.42)
    for (let k = 0; k < 2; k++) {      // lava rivers, with a stepping stone now and then
      let x = r.range(3, F.w - 3), y = 2, a = Math.PI / 2 + r.range(-0.5, 0.5), s = 0
      while (y < F.h - 2 && s++ < 200) {
        for (const dx of [0, 1]) if (F.t(Math.round(x) + dx, Math.round(y)) === FLOOR) F.set(Math.round(x) + dx, Math.round(y), s % 7 === 0 ? FLOOR : HAZ)
        a += r.range(-0.35, 0.35); a = Math.max(0.5, Math.min(Math.PI - 0.5, a)); x += Math.cos(a); y += Math.sin(a)
        x = Math.max(2, Math.min(F.w - 3, x))
      }
    }
  },
  castle(F, r) {
    F.rooms = rooms(F, r, 9, 5, 9)
    for (const o of F.rooms) {
      for (let y = o.y + 1; y < o.y + o.h - 1; y++) for (let x = o.x + 1; x < o.x + o.w - 1; x++) F.variant[F.i(x, y)] = 3   // carpet
      if (o.w >= 8 && o.h >= 8 && r() < 0.6) { F.set(o.cx, o.cy, HAZ); F.set(o.cx - 1, o.cy, HAZ); F.set(o.cx, o.cy - 1, HAZ); F.set(o.cx - 1, o.cy - 1, HAZ) }
    }
  },
}

// ------------------------------------------------------------------ making one floor
export function makeFloor(floor) {
  const r = rng(floor * 7919 + 13)
  const land = landOf(floor)
  const boss = isBossFloor(floor)
  const size = 38 + (floor % 10) * 1.2 + landIndex(floor) * 2
  const w = boss ? 26 : Math.round(size + r.int(6)), h = boss ? 22 : Math.round(size * 0.8 + r.int(5))
  const F = new Floor(w, h, floor)
  if (boss) arena(F, r)
  else SHAPES[land.key](F, r)
  for (let x = 0; x < w; x++) { F.set(x, 0, WALL); F.set(x, h - 1, WALL) }
  for (let y = 0; y < h; y++) { F.set(0, y, WALL); F.set(w - 1, y, WALL) }

  // floor looks
  for (let i = 0; i < w * h; i++) if (F.variant[i] !== 3) { const v = r(); F.variant[i] = v < 0.55 ? 0 : v < 0.8 ? 1 : v < 0.93 ? 2 : (land.key === 'castle' ? 2 : 3) }

  // keep the biggest stretch of safe ground; the rest becomes wall (hazards stay where they are)
  let best = null, bestN = 0
  const mark = new Uint8Array(w * h)
  for (let y = 1; y < h - 1; y++) for (let x = 1; x < w - 1; x++) {
    if (mark[F.i(x, y)] || !F.safe(x, y)) continue
    const d = F.distances(x, y); let n = 0
    for (let i = 0; i < d.length; i++) if (d[i] >= 0) { mark[i] = 1; n++ }
    if (n > bestN) { bestN = n; best = d }
  }
  for (let i = 0; i < w * h; i++) if (best[i] < 0 && F.tile[i] === FLOOR) F.tile[i] = WALL

  // the start, and the stairs as far from it as the ground goes
  const cells = []
  for (let i = 0; i < w * h; i++) if (best[i] >= 0) cells.push(i)
  let start
  if (boss) start = F.i(w >> 1, h - 3)
  else {
    // start near an edge: the cell furthest from a random one
    const any = cells[r.int(cells.length)]
    const d0 = F.distances(any % w, Math.floor(any / w))
    start = cells.reduce((a, c) => d0[c] > d0[a] ? c : a, cells[0])
  }
  F.start = { x: start % w, y: Math.floor(start / w) }
  let dist = F.distances(F.start.x, F.start.y)
  if (!boss) {
    const far = cells.reduce((a, c) => dist[c] > dist[a] ? c : a, cells[0])
    F.stairs = { x: far % w, y: Math.floor(far / w) }
  } else F.stairs = { x: w >> 1, y: (h >> 1) - 2, hidden: true }

  // obstacles in open ground, never on the way from the start to the stairs
  const path = pathCells(F, dist, F.stairs)
  const open = cells.filter(c => {
    const x = c % w, y = Math.floor(c / w)
    if (path.has(c) || Math.abs(x - F.start.x) + Math.abs(y - F.start.y) < 4 || Math.abs(x - F.stairs.x) + Math.abs(y - F.stairs.y) < 3) return false
    let n = 0
    for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) if (F.safe(x + dx, y + dy)) n++
    return n >= 8 && F.tile[c] === FLOOR
  })
  const weights = land.obstacles.map(o => o[1]), total = weights.reduce((a, b) => a + b, 0)
  const nOb = boss ? 6 : Math.round(open.length * (land.key === 'forest' ? 0.11 : 0.06))
  for (let k = 0; k < nOb && open.length; k++) {
    const c = open.splice(r.int(open.length), 1)[0]
    let pick = r() * total, idx = 0
    while (pick > weights[idx]) { pick -= weights[idx]; idx++ }
    F.ob[c] = idx + 1
  }
  if (boss) { F.ob.fill(0); for (const [x, y] of [[5, 5], [w - 6, 5], [5, h - 6], [w - 6, h - 6], [8, h >> 1], [w - 9, h >> 1]]) F.ob[F.i(x, y)] = 1 + land.obstacles.findIndex(o => o[0] !== 'tree2') }

  // everything reachable still? where obstacles seal off ground, take away the ones around it
  for (let pass = 0; pass < 8; pass++) {
    dist = F.distances(F.start.x, F.start.y)
    const cut = cells.filter(c => dist[c] < 0 && !F.ob[c])
    if (!cut.length) break
    for (const c of cut) for (let dy = -1; dy <= 1; dy++) for (let dx = -1; dx <= 1; dx++) {
      const n = c + dy * w + dx
      if (n >= 0 && n < w * h) F.ob[n] = 0
    }
  }
  dist = F.distances(F.start.x, F.start.y)
  for (const c of cells) if (dist[c] < 0 && !F.ob[c] && F.tile[c] === FLOOR) F.tile[c] = WALL   // anything still cut off
  const reach = cells.filter(c => dist[c] >= 0 && !F.ob[c])
  F.dist = dist

  // light from glowing things
  for (let i = 0; i < w * h; i++) if (F.ob[i]) {
    const g = GLOWS[land.obstacles[F.ob[i] - 1][0]]
    if (g) F.lights.push([(i % w) * TILE + 8, Math.floor(i / w) * TILE + 6, g[0], g[1], g[2], g[3]])
  }
  // decorations on plain floor
  for (const c of reach) if (F.tile[c] === FLOOR && r() < 0.07) F.deco[c] = 1 + r.int(3)

  if (boss) {
    F.boss = { kind: land.boss, x: (w >> 1) * TILE + 8, y: ((h >> 1) - 2) * TILE + 8 }
    return F
  }

  // chests at the far ends; a lore stone on its floors; monsters away from the start
  const byFar = reach.filter(c => F.tile[c] === FLOOR && dist[c] > 10).sort((a, b) => dist[b] - dist[a])
  const deadEnds = byFar.filter(c => { const x = c % w, y = Math.floor(c / w); let n = 0; for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) if (!F.safe(x + dx, y + dy)) n++; return n >= 2 })
  const nChest = 1 + r.int(2) + (floor % 10 === 9 ? 1 : 0)
  const used = new Set([F.i(F.stairs.x, F.stairs.y)])
  const free = c => !used.has(c) && ![...used].some(u => Math.abs(u % w - c % w) + Math.abs(Math.floor(u / w) - Math.floor(c / w)) < 4)
  for (const c of [...deadEnds, ...byFar]) {
    if (F.chests.length >= nChest) break
    if (!free(c)) continue
    used.add(c); F.chests.push({ x: c % w, y: Math.floor(c / w), id: F.chests.length })
  }
  if (STONES[floor]) {
    const c = byFar.find(c => free(c) && dist[c] < dist[F.i(F.stairs.x, F.stairs.y)] * 0.7) ?? byFar[0]
    used.add(c); F.stone = { x: c % w, y: Math.floor(c / w) }
  }
  const nMon = Math.round(8 + (floor % 10) * 0.7 + landIndex(floor) * 1.5)
  const spawnable = reach.filter(c => dist[c] >= 8 && F.tile[c] === FLOOR && !used.has(c))
  for (let k = 0; k < nMon && spawnable.length; k++) {
    const c = spawnable.splice(r.int(spawnable.length), 1)[0]
    // the land's fourth monster shows up from its fourth floor on
    const kinds = (floor - 1) % 10 < 3 ? land.monsters.slice(0, 3) : land.monsters
    F.monsters.push({ id: k, kind: r.pick(kinds), x: (c % w) * TILE + 8, y: Math.floor(c / w) * TILE + 8 })
    // a little room around each one
    for (let j = spawnable.length - 1; j >= 0; j--) if (Math.abs(spawnable[j] % w - c % w) + Math.abs(Math.floor(spawnable[j] / w) - Math.floor(c / w)) < 3) spawnable.splice(j, 1)
  }
  return F
}

function pathCells(F, dist, to) {
  const out = new Set()
  let x = to.x, y = to.y
  while (dist[F.i(x, y)] > 0) {
    out.add(F.i(x, y))
    for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      const nx = x + dx, ny = y + dy
      if (F.in(nx, ny) && dist[F.i(nx, ny)] === dist[F.i(x, y)] - 1) { x = nx; y = ny; break }
    }
  }
  out.add(F.i(x, y))
  return out
}

function arena(F, r) {
  const { w, h } = F
  for (let y = 2; y < h - 2; y++) for (let x = 2; x < w - 2; x++) {
    const ex = (x - w / 2 + 0.5) / (w / 2 - 2), ey = (y - h / 2 + 0.5) / (h / 2 - 2)
    if (ex * ex + ey * ey < 1.05 || F.land.key === 'castle' || F.land.key === 'desert') F.set(x, y, FLOOR)
  }
  if (F.land.key === 'castle') for (let y = 4; y < h - 4; y++) for (let x = (w >> 1) - 2; x <= (w >> 1) + 1; x++) F.variant[F.i(x, y)] = 3
  if (F.land.hazard === 'burn') for (const [x, y] of [[3, 3], [w - 5, 3], [3, h - 5], [w - 5, h - 5]]) { F.set(x, y, HAZ); F.set(x + 1, y, HAZ); F.set(x, y + 1, HAZ); F.set(x + 1, y + 1, HAZ) }
}
