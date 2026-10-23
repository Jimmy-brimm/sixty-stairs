// Monsters, shots and moving things. Six ways to behave: chaser, hopper, flier, shooter, charger, tank.
import { TILE } from './world.js'

export const MON = {
  bat:            { ai: 'flier',   hp: 14, dmg: 6,  speed: 50, r: 5, xp: 3, swoop: true },
  cave_slime:     { ai: 'hopper',  hp: 24, dmg: 7,  speed: 62, r: 6, xp: 3 },
  skeleton:       { ai: 'chaser',  hp: 30, dmg: 9,  speed: 30, r: 5, xp: 4 },
  crystal_beetle: { ai: 'shooter', hp: 26, dmg: 8,  speed: 22, r: 6, xp: 5, shot: 'shot_crystal', rate: 2.0, shotSpeed: 80, count: 1 },
  green_slime:    { ai: 'hopper',  hp: 26, dmg: 8,  speed: 64, r: 6, xp: 3 },
  goblin:         { ai: 'chaser',  hp: 32, dmg: 10, speed: 38, r: 5, xp: 4 },
  goblin_archer:  { ai: 'shooter', hp: 26, dmg: 9,  speed: 30, r: 5, xp: 5, shot: 'shot_rock', rate: 1.8, shotSpeed: 105, count: 1 },
  boar:           { ai: 'charger', hp: 42, dmg: 12, speed: 32, r: 6, xp: 6 },
  wolf:           { ai: 'chaser',  hp: 34, dmg: 10, speed: 50, r: 6, xp: 5 },
  sporeling:      { ai: 'shooter', hp: 30, dmg: 9,  speed: 0,  r: 6, xp: 5, shot: 'shot_spore', rate: 2.3, shotSpeed: 68, count: 3, spread: 0.35 },
  sapling:        { ai: 'tank',    hp: 72, dmg: 14, speed: 20, r: 6, xp: 8 },
  spider:         { ai: 'chaser',  hp: 26, dmg: 9,  speed: 56, r: 5, xp: 5 },
  scorpion:       { ai: 'chaser',  hp: 36, dmg: 11, speed: 42, r: 6, xp: 5 },
  mummy:          { ai: 'tank',    hp: 82, dmg: 15, speed: 19, r: 6, xp: 9 },
  vulture:        { ai: 'flier',   hp: 26, dmg: 10, speed: 54, r: 5, xp: 5, swoop: true },
  cobra:          { ai: 'shooter', hp: 32, dmg: 10, speed: 18, r: 5, xp: 6, shot: 'shot_venom', rate: 1.9, shotSpeed: 96, count: 2, spread: 0.22 },
  fire_imp:       { ai: 'flier',   hp: 28, dmg: 10, speed: 44, r: 5, xp: 6, shot: 'shot_fire', rate: 2.6, shotSpeed: 88, count: 1 },
  magma_slime:    { ai: 'hopper',  hp: 40, dmg: 12, speed: 64, r: 6, xp: 6 },
  salamander:     { ai: 'charger', hp: 44, dmg: 13, speed: 36, r: 6, xp: 7 },
  ember:          { ai: 'shooter', hp: 30, dmg: 11, speed: 24, r: 5, xp: 7, shot: 'shot_fire', rate: 2.8, shotSpeed: 70, count: 6, ring: true },
  demon_knight:   { ai: 'tank',    hp: 92, dmg: 16, speed: 25, r: 6, xp: 10 },
  imp_mage:       { ai: 'shooter', hp: 34, dmg: 12, speed: 28, r: 5, xp: 8, shot: 'shot_dark', rate: 2.0, shotSpeed: 92, count: 3, spread: 0.3 },
  hellhound:      { ai: 'charger', hp: 52, dmg: 14, speed: 44, r: 6, xp: 8 },
  gargoyle:       { ai: 'flier',   hp: 46, dmg: 13, speed: 46, r: 6, xp: 8, swoop: true },
}
export const MON_KINDS = Object.keys(MON)
export const SHOTS = ['shot_crystal', 'shot_rock', 'shot_spore', 'shot_venom', 'shot_fire', 'shot_dark']
export const SHOT_LIGHT = { shot_crystal: [90, 200, 255], shot_fire: [255, 140, 40], shot_dark: [255, 60, 110], shot_spore: [190, 100, 230] }

export const hpScale = f => 1 + 0.18 * (f - 1) + 0.003 * Math.max(0, f - 25) ** 2     // tougher faster past the forest
export const dmgScale = f => 1 + 0.11 * (f - 1) + 0.002 * Math.max(0, f - 25) ** 2

export function makeMonster(kind, floor, x, y, id, rand = Math.random) {
  const d = MON[kind]
  const hp = Math.round(d.hp * hpScale(floor))
  return {
    id, kind, d, x, y, hx: x, hy: y, kx: 0, ky: 0, vx: 0, vy: 0, hp, maxHp: hp,
    dmg: Math.round(d.dmg * dmgScale(floor)), speed: d.speed * (1 + 0.004 * (floor - 1)), r: d.r,
    xp: Math.round(d.xp * (1 + 0.085 * (floor - 1))),
    awake: false, st: 0, t: 0, cool: 0.5 + rand() * 1.5, face: 1, flash: 0, anim: rand() * 10, dead: false,
    side: rand() < 0.5 ? 1 : -1, cdx: 0, cdy: 0,
  }
}
// st: 0 walking, 1 winding up (flashes), 2 the big move (hop, charge, slam), 3 stunned
export const STUN = 1.8              // how long a charger that rammed a wall stays dazed

// can something of radius r stand at (x, y)?
export function fits(F, x, y, r, fly) {
  const k = r * 0.8
  for (const [px, py] of [[x - k, y - k], [x + k, y - k], [x - k, y + k], [x + k, y + k]]) {
    const tx = Math.floor(px / TILE), ty = Math.floor(py / TILE)
    // fliers pass over water and lava; the knight may blunder into lava; walking monsters keep to safe ground
    if (fly === true ? F.blocksShot(tx, ty) : fly === 'hero' ? F.solid(tx, ty) : !F.safe(tx, ty)) return false
  }
  return true
}
export function move(F, a, dx, dy, fly, r = a.r) {
  let hit = false
  if (dx) { if (fits(F, a.x + dx, a.y, r, fly)) a.x += dx; else hit = true }
  if (dy) { if (fits(F, a.x, a.y + dy, r, fly)) a.y += dy; else hit = true }
  return hit
}

// is the way between two points clear of walls?
export function los(F, ax, ay, bx, by) {
  const d = Math.hypot(bx - ax, by - ay), n = Math.ceil(d / 6)
  for (let i = 1; i < n; i++) {
    const x = ax + (bx - ax) * i / n, y = ay + (by - ay) * i / n
    if (F.blocksShot(Math.floor(x / TILE), Math.floor(y / TILE))) return false
  }
  return true
}

// the way to the nearest player along the flow field (distances from the players, per tile)
function flowDir(F, flow, m, tx, ty) {
  const cx = Math.floor(m.x / TILE), cy = Math.floor(m.y / TILE)
  const here = flow[F.i(cx, cy)]
  let best = null, bd = here < 0 ? 1e9 : here
  for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]]) {
    const nx = cx + dx, ny = cy + dy
    if (!F.in(nx, ny)) continue
    const v = flow[F.i(nx, ny)]
    if (v < 0 || v >= bd) continue
    if (dx && dy && (flow[F.i(cx + dx, cy)] < 0 || flow[F.i(cx, cy + dy)] < 0)) continue   // no cutting corners
    bd = v; best = [nx * TILE + 8 - m.x, ny * TILE + 8 - m.y]
  }
  if (!best || here <= 1) best = [tx - m.x, ty - m.y]
  const l = Math.hypot(best[0], best[1]) || 1
  return [best[0] / l, best[1] / l]
}

// ctx: { F, flow, target(m) -> player | null, shoot(x, y, angle, speed, dmg, sprite), slam(x, y, r, dmg, delay), now, rand }
export function stepMonster(m, dt, ctx) {
  const { F } = ctx, d = m.d
  m.anim += dt; m.flash = Math.max(0, m.flash - dt); m.t += dt; m.cool -= dt
  const fade = Math.exp(-9 * dt); m.kx *= fade; m.ky *= fade
  const p = ctx.target(m)
  const fly = d.ai === 'flier'
  if (!p) { m.st = 0; move(F, m, m.kx * dt, m.ky * dt, fly); return }
  const dx = p.x - m.x, dy = p.y - m.y, dist = Math.hypot(dx, dy) || 1
  const ux = dx / dist, uy = dy / dist
  if (!m.awake) {
    if (dist < 60 || (dist < 150 && los(F, m.x, m.y, p.x, p.y))) { m.awake = true; m.cool = Math.max(m.cool, 0.4) }
    else { move(F, m, m.kx * dt, m.ky * dt, fly); return }
  }
  if (Math.abs(ux) > 0.2) m.face = ux > 0 ? 1 : -1
  const sight = () => dist < 170 && los(F, m.x, m.y, p.x, p.y)
  let vx = 0, vy = 0
  const walkTo = (sp) => { const [fx, fy] = flowDir(F, ctx.flow, m, p.x, p.y); vx = fx * sp; vy = fy * sp }

  switch (d.ai) {
    case 'chaser': walkTo(m.speed); break
    case 'hopper':
      if (m.st === 2) { vx = m.cdx; vy = m.cdy; if (m.t > 0.32) { m.st = 0; m.t = 0; m.cool = 0.55 + ctx.rand() * 0.5 } }
      else if (m.cool <= 0) {
        const [fx, fy] = dist < 40 ? [ux, uy] : flowDir(F, ctx.flow, m, p.x, p.y)
        m.st = 2; m.t = 0; m.cdx = fx * m.speed * 2.6; m.cdy = fy * m.speed * 2.6
      }
      break
    case 'flier': {
      // swoopers: hover a moment (a faint red line shows the way), then dive along it
      if (d.swoop && m.st === 1) { if (m.t > 0.6) { m.st = 2; m.t = 0 } break }
      if (d.swoop && m.st === 2) {
        const hit = move(F, m, m.cdx * m.speed * 4 * dt, m.cdy * m.speed * 4 * dt, true)
        if (hit || m.t > 0.45) { m.st = 0; m.t = 0; m.cool = 1.4 + ctx.rand() * 1.2 }
        return
      }
      if (d.swoop && m.cool <= 0 && dist < 84 && sight()) { m.st = 1; m.t = 0; m.cdx = ux; m.cdy = uy; m.tl = m.speed * 4 * 0.45; break }
      const w = Math.sin(ctx.now * 3 + m.id) * 0.7
      vx = (ux - uy * w * m.side) * m.speed; vy = (uy + ux * w * m.side) * m.speed
      if (d.shot && m.cool <= 0 && sight()) { fire(m, ctx, ux, uy); m.cool = d.rate * (0.8 + ctx.rand() * 0.4) }
      break
    }
    case 'shooter':
      if (m.speed > 0) {
        if (dist < 56) { vx = -ux * m.speed; vy = -uy * m.speed }
        else if (dist > 104 || !sight()) walkTo(m.speed)
        else { vx = -uy * m.side * m.speed * 0.7; vy = ux * m.side * m.speed * 0.7; if (ctx.rand() < dt * 0.4) m.side = -m.side }
      }
      if (m.st === 1) { vx = vy = 0; if (m.t > 0.35) { fire(m, ctx, ux, uy); m.st = 0; m.cool = d.rate * (0.8 + ctx.rand() * 0.4) } }
      else if (m.cool <= 0 && sight()) { m.st = 1; m.t = 0 }
      break
    case 'charger':
      if (m.st === 0) {
        walkTo(m.speed)
        if (m.cool <= 0 && dist < 96 && sight()) { m.st = 1; m.t = 0; m.cdx = ux; m.cdy = uy; m.tl = m.speed * 4.6 * 0.7 }
      } else if (m.st === 1) { if (m.t > 0.6) { m.st = 2; m.t = 0 } }
      else if (m.st === 2) {
        const hit = move(F, m, m.cdx * m.speed * 4.6 * dt, m.cdy * m.speed * 4.6 * dt, false)
        if (hit) { m.st = 3; m.t = 0; ctx.bump?.(m); ctx.stunned?.(m) } else if (m.t > 0.7) { m.st = 0; m.t = 0; m.cool = 1.4 + ctx.rand() }
      } else if (m.t > STUN) { m.st = 0; m.t = 0; m.cool = 1.2 }      // into a wall: dazed, open to blows
      break
    case 'tank':
      if (m.st === 0) {
        walkTo(m.speed)
        if (m.cool <= 0 && dist < 26) { m.st = 1; m.t = 0 }
      } else if (m.st === 1) { if (m.t > 0.55) { m.st = 2; m.t = 0; ctx.slam(m.x, m.y, 30, Math.round(m.dmg * 1.5), 0) } }
      else if (m.t > 0.35) { m.st = 0; m.t = 0; m.cool = 1.6 }
      break
  }
  // keep a little apart from each other
  if (ctx.crowd) for (const o of ctx.crowd) {
    if (o === m || o.dead) continue
    const ox = m.x - o.x, oy = m.y - o.y, od = Math.hypot(ox, oy)
    if (od > 0 && od < m.r + o.r) { vx += ox / od * 30; vy += oy / od * 30 }
  }
  move(F, m, (vx + m.kx) * dt, (vy + m.ky) * dt, fly)
}

function fire(m, ctx, ux, uy) {
  const d = m.d, a0 = Math.atan2(uy, ux)
  if (d.ring) { for (let k = 0; k < d.count; k++) ctx.shoot(m.x, m.y - 4, a0 + k / d.count * Math.PI * 2, d.shotSpeed, m.dmg, d.shot) }
  else for (let k = 0; k < d.count; k++) {
    const a = a0 + (k - (d.count - 1) / 2) * (d.spread || 0)
    ctx.shoot(m.x, m.y - 4, a, d.shotSpeed, m.dmg, d.shot)
  }
}

// shots: straight lines, stopped by walls and obstacles (not by water or lava)
export function stepShots(F, shots, dt, onWall) {
  for (let i = shots.length - 1; i >= 0; i--) {
    const s = shots[i]
    s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt
    if (s.life <= 0 || F.blocksShot(Math.floor(s.x / TILE), Math.floor((s.y + 3) / TILE))) { onWall?.(s); shots.splice(i, 1) }
  }
}
