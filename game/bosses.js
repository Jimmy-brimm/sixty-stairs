// The six lords. Each picks moves from its own list; below half health it enters a second, faster phase.
import { hpScale, dmgScale, move } from './actors.js'

export const BOSS = {
  wyrm:       { sprite: 'boss_wyrm', hp: 330, dmg: 10, speed: 30, r: 12, shot: 'shot_crystal', minion: 'bat', moves: ['burrow', 'ring', 'summon', 'aimed'] },
  scarecrow:  { sprite: 'boss_scarecrow', hp: 450, dmg: 13, speed: 28, r: 11, shot: 'shot_dark', minion: 'goblin', moves: ['aimed', 'summon', 'charge', 'ring'] },
  rootmother: { sprite: 'boss_rootmother', hp: 400, dmg: 12, speed: 0, r: 13, shot: 'shot_spore', minion: 'sapling', moves: ['slam', 'ring', 'summon', 'spiral'] },
  sandmaw:    { sprite: 'boss_sandmaw', hp: 480, dmg: 14, speed: 34, r: 12, shot: 'shot_rock', minion: 'scorpion', moves: ['burrow', 'spiral', 'charge', 'aimed'] },
  golem:      { sprite: 'boss_golem', hp: 560, dmg: 15, speed: 24, r: 13, shot: 'shot_fire', minion: 'magma_slime', moves: ['slam', 'ring', 'spiral', 'charge'] },
  demonlord:  { sprite: 'boss_demonlord', sprite2: 'boss_demonlord2', hp: 680, dmg: 16, speed: 30, r: 14, shot: 'shot_dark', minion: 'imp_mage', moves: ['spiral', 'ring', 'charge', 'summon', 'slam', 'aimed'] },
}

export function makeBoss(kind, floor, x, y) {
  const d = BOSS[kind], hp = Math.round(d.hp * 1.1 * hpScale(floor) * (kind === 'demonlord' ? 1.4 : 1))
  return { kind, d, x, y, hp, maxHp: hp, dmg: Math.round(d.dmg * dmgScale(floor)), r: d.r, phase: 1, st: 'wait', t: 0, wait: 1.6,
    queue: [], move: null, flash: 0, anim: 0, face: 1, hidden: false, ang: 0, cdx: 0, cdy: 0, volley: 0, awake: false, dead: false }
}

// ctx: { F, target(), shoot(x, y, angle, speed, dmg, sprite), slam(x, y, r, dmg, delay), summon(kind, x, y), minions(), rand, now, roar() }
export function stepBoss(b, dt, ctx) {
  const d = b.d
  b.anim += dt; b.flash = Math.max(0, b.flash - dt); b.t += dt
  const p = ctx.target()
  if (!p || b.dead) return
  const dx = p.x - b.x, dy = p.y - b.y, dist = Math.hypot(dx, dy) || 1, ux = dx / dist, uy = dy / dist
  if (Math.abs(ux) > 0.2 && b.st !== 'charge') b.face = ux > 0 ? 1 : -1
  if (b.phase === 1 && b.hp < b.maxHp / 2) { b.phase = 2; b.flash = 0.6; ctx.roar?.(b) }
  const fast = b.phase === 2 ? 0.65 : 1
  const sp = d.shot, base = Math.atan2(uy, ux)

  switch (b.st) {
    case 'wait':
      if (d.speed && dist > 40) move(ctx.F, b, ux * d.speed * dt, uy * d.speed * dt, false)
      if (b.t > b.wait * fast) {
        if (!b.queue.length) { b.queue = d.moves.slice(); for (let i = b.queue.length - 1; i > 0; i--) { const j = Math.floor(ctx.rand() * (i + 1)); [b.queue[i], b.queue[j]] = [b.queue[j], b.queue[i]] } }
        b.move = b.queue.pop(); b.st = 'wind'; b.t = 0; b.volley = 0
        if (b.move === 'charge') { b.cdx = ux; b.cdy = uy }
        if (b.move === 'burrow') { b.hidden = true; b.mx = p.x; b.my = p.y }
      }
      break
    case 'wind':   // a short warning before every move
      if (b.move === 'burrow') { b.mx += (p.x - b.mx) * Math.min(1, dt * 2.2); b.my += (p.y - b.my) * Math.min(1, dt * 2.2) }
      if (b.move === 'charge') { b.cdx = ux; b.cdy = uy }
      if (b.t > (b.move === 'burrow' ? 1.4 : b.move === 'charge' ? 0.85 : 0.5)) {
        b.st = b.move; b.t = 0
        if (b.move === 'burrow') ctx.slam(b.mx, b.my, 26, Math.round(b.dmg * 1.4), 0.7)
        if (b.move === 'slam') {
          const n = b.phase === 2 ? 5 : 3
          for (let k = 0; k < n; k++) {
            const ox = k === 0 ? 0 : (ctx.rand() - 0.5) * 90, oy = k === 0 ? 0 : (ctx.rand() - 0.5) * 70
            ctx.slam(p.x + ox, p.y + oy, 22, Math.round(b.dmg * 1.3), 0.95 + k * 0.12)
          }
        }
        if (b.move === 'summon') {
          const have = ctx.minions(), n = Math.min(b.phase === 2 ? 3 : 2, 5 - have)
          for (let k = 0; k < n; k++) { const a = ctx.rand() * Math.PI * 2; ctx.summon(d.minion, b.x + Math.cos(a) * 26, b.y + Math.sin(a) * 20) }
        }
      }
      break
    case 'ring': {
      const n = b.phase === 2 ? 18 : 12
      for (let k = 0; k < n; k++) ctx.shoot(b.x, b.y - 8, base + k / n * Math.PI * 2, 78, b.dmg, sp)
      b.volley++
      b.st = b.volley < (b.phase === 2 ? 2 : 1) ? 'ringgap' : 'done'; b.t = 0
      break
    }
    case 'ringgap': if (b.t > 0.35) { b.st = 'ring'; b.t = 0; b.ang = 0 } break
    case 'aimed':
      if (b.t > 0.32 || b.volley === 0) {
        for (let k = -2; k <= 2; k++) ctx.shoot(b.x, b.y - 8, base + k * 0.18, 105, b.dmg, sp)
        b.volley++; b.t = 0
        if (b.volley >= (b.phase === 2 ? 4 : 3)) b.st = 'done'
      }
      break
    case 'spiral':
      b.ang += dt * 3.2
      if (b.t > b.volley * 0.09) {
        const arms = b.phase === 2 ? 3 : 2
        for (let k = 0; k < arms; k++) ctx.shoot(b.x, b.y - 8, b.ang + k / arms * Math.PI * 2, 72, b.dmg, sp)
        b.volley++
      }
      if (b.t > 2.4) b.st = 'done'
      break
    case 'charge': {
      const hit = move(ctx.F, b, b.cdx * 250 * dt, b.cdy * 250 * dt, false)
      if (hit) { b.st = 'stunned'; b.t = 0; ctx.bump?.(b); ctx.stunned?.(b) }        // into a wall: dazed
      else if (b.t > 1.0) { b.st = 'done'; b.t = 0 }
      break
    }
    case 'stunned': if (b.t > 1.6) { b.st = 'done'; b.t = 0 } break
    case 'burrow':
      if (b.t > 0.7) {
        b.x = b.mx; b.y = b.my; b.hidden = false
        for (let k = 0; k < 8; k++) ctx.shoot(b.x, b.y - 6, k / 8 * Math.PI * 2 + 0.2, 70, b.dmg, sp)
        b.st = 'done'; b.t = 0
      }
      break
    case 'slam': case 'summon': if (b.t > 0.6) { b.st = 'done'; b.t = 0 } break
    case 'done':
      if (b.t > 0.2) { b.st = 'wait'; b.t = 0; b.wait = 1.1 + ctx.rand() * 0.6 }
      break
  }
}

// where the boss can be hurt from, and whether it can be hurt now
export const bossHittable = b => !b.hidden && !b.dead
