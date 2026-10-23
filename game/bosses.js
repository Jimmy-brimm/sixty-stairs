// The six lords and the hidden Fallen Knights. Each picks moves from its own list, its own signature among them
// (Gemmaw's crystal spikes, the Scarecrow King's crows, Rootmother's roots, Sandmaw's quicksand, Ignarok's lava,
// Vorgrath's meteors and blinks); below 60% health it enters a second, faster phase.
import { hpScale, dmgScale, move } from './actors.js'

export const BOSS = {
  wyrm:       { sprite: 'boss_wyrm', hp: 330, dmg: 10, speed: 30, r: 12, shot: 'shot_crystal', minion: 'bat', moves: ['burrow', 'spikes', 'summon', 'spikes', 'ring'] },
  scarecrow:  { sprite: 'boss_scarecrow', hp: 450, dmg: 13, speed: 28, r: 11, shot: 'shot_dark', minion: 'goblin', moves: ['crows', 'charge', 'summon', 'crows', 'aimed'] },
  rootmother: { sprite: 'boss_rootmother', hp: 400, dmg: 12, speed: 0, r: 13, shot: 'shot_spore', minion: 'sapling', moves: ['roots', 'slam', 'roots', 'spiral', 'summon'] },
  sandmaw:    { sprite: 'boss_sandmaw', hp: 480, dmg: 14, speed: 34, r: 12, shot: 'shot_rock', minion: 'scorpion', moves: ['quicksand', 'burrow', 'charge', 'quicksand', 'spiral'] },
  golem:      { sprite: 'boss_golem', hp: 560, dmg: 15, speed: 24, r: 13, shot: 'shot_fire', minion: 'magma_slime', moves: ['lava', 'slam', 'ring', 'lava', 'charge'] },
  demonlord:  { sprite: 'boss_demonlord', sprite2: 'boss_demonlord2', hp: 680, dmg: 16, speed: 30, r: 14, shot: 'shot_dark', minion: 'imp_mage', moves: ['meteor', 'teleport', 'spiral', 'charge', 'summon', 'meteor', 'ring', 'teleport'] },
  // the Fallen Knights: Lantern Knights before you, hidden on the fifth floor of each land; each fights with its own weapon
  fallen0:    { knight: { outfit: 'plate', head: 'visor', weapon: 'sword' }, hp: 260, dmg: 12, speed: 46, r: 9, shot: 'shot_crystal', minion: 'bat', moves: ['lunge', 'slashwave', 'charge', 'lunge'] },
  fallen1:    { knight: { outfit: 'plate', head: 'horned', weapon: 'spear' }, hp: 300, dmg: 13, speed: 48, r: 9, shot: 'shot_rock', minion: 'goblin', moves: ['lunge', 'spikes', 'lunge', 'aimed'] },
  fallen2:    { knight: { outfit: 'leather', head: 'hood', weapon: 'axe' }, hp: 340, dmg: 14, speed: 44, r: 9, shot: 'shot_spore', minion: 'wolf', moves: ['whirl', 'charge', 'slam', 'whirl'] },
  fallen3:    { knight: { outfit: 'leather', head: 'long', weapon: 'bow' }, hp: 320, dmg: 14, speed: 50, r: 9, shot: 'shot_rock', minion: 'scorpion', moves: ['aimed', 'blink', 'spiral', 'slashwave'] },
  fallen4:    { knight: { outfit: 'robe', head: 'hat', weapon: 'staff' }, hp: 360, dmg: 15, speed: 40, r: 9, shot: 'shot_fire', minion: 'ember', moves: ['blink', 'meteor', 'ring', 'lava'] },
  fallen5:    { knight: { outfit: 'plate', head: 'horned', weapon: 'sword' }, hp: 420, dmg: 16, speed: 50, r: 9, shot: 'shot_dark', minion: 'imp_mage', moves: ['blink', 'slashwave', 'whirl', 'lunge', 'meteor'] },
}

export function makeBoss(kind, floor, x, y) {
  const d = BOSS[kind], hp = Math.round(d.hp * (kind === 'wyrm' ? 1.05 : 1.3) * hpScale(floor) * (kind === 'demonlord' ? 1.4 : 1))      // the first lord a little gentler
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
  if (b.phase === 1 && b.hp < b.maxHp * 0.6) { b.phase = 2; b.flash = 0.6; ctx.roar?.(b) }
  const fast = b.phase === 2 ? 0.55 : 1, two = b.phase === 2
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
      if (b.t > (WIND[b.move] ?? 0.5) * (two ? 0.8 : 1)) {
        b.st = b.move; b.t = 0
        signature(b, p, ux, uy, base, two, ctx)
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
    case 'lunge': {                                        // a short, fast charge that ends in a slam
      const hit = move(ctx.F, b, b.cdx * 330 * dt, b.cdy * 330 * dt, false)
      if (hit) { b.st = 'stunned'; b.t = 0; ctx.bump?.(b); ctx.stunned?.(b) }
      else if (b.t > 0.42) { ctx.slam(b.x, b.y, 24, Math.round(b.dmg * 1.3), 0.25); b.volley++; b.st = b.volley < (two ? 2 : 1) ? 'wind' : 'done'; b.t = 0; b.move = 'lunge'; b.cdx = ux; b.cdy = uy }
      break
    }
    case 'whirl':                                          // spins toward you, throwing a turning ring
      move(ctx.F, b, ux * 62 * dt, uy * 62 * dt, false); b.ang += dt * 7
      if (b.t > b.volley * 0.16) { for (let k = 0; k < 4; k++) ctx.shoot(b.x, b.y - 8, b.ang + k * Math.PI / 2, 88, b.dmg, sp); b.volley++ }
      if (b.t > (two ? 1.5 : 1.1)) b.st = 'done'
      break
    case 'teleport': case 'blink':                         // gone a moment, then behind you
      if (b.t > 0.45 && b.hidden) {
        const back = Math.atan2(-uy, -ux) + (ctx.rand() - 0.5) * 1.2, rr = b.move === 'blink' ? 34 : 52
        for (let tries = 0; tries < 8; tries++) {
          const nx = p.x + Math.cos(back + tries * 0.8) * rr, ny = p.y + Math.sin(back + tries * 0.8) * rr
          if (!ctx.F.solid(Math.floor(nx / 16), Math.floor(ny / 16))) { b.x = nx; b.y = ny; break }
        }
        b.hidden = false
        if (b.move === 'blink') ctx.slam(b.x, b.y, 26, Math.round(b.dmg * 1.2), 0.3)
        else for (let k = 0; k < (two ? 14 : 10); k++) ctx.shoot(b.x, b.y - 8, k / (two ? 14 : 10) * Math.PI * 2, 80, b.dmg, sp)
      }
      if (b.t > 0.9) b.st = 'done'
      break
    case 'spikes': case 'crows': case 'roots': case 'lava': case 'meteor': case 'slashwave': if (b.t > 0.7) { b.st = 'done'; b.t = 0 } break
    case 'quicksand': if (b.t > 1.9) { b.st = 'done'; b.t = 0 } break
    case 'burrow':
      if (b.t > 0.7) {
        b.x = b.mx; b.y = b.my; b.hidden = false
        for (let k = 0; k < 8; k++) ctx.shoot(b.x, b.y - 6, k / 8 * Math.PI * 2 + 0.2, 70, b.dmg, sp)
        b.st = 'done'; b.t = 0
      }
      break
    case 'slam': case 'summon': if (b.t > 0.6) { b.st = 'done'; b.t = 0 } break
    case 'done':
      if (b.t > 0.2) { b.st = 'wait'; b.t = 0; b.wait = 0.85 + ctx.rand() * 0.5; b.volley = 0 }
      break
  }
}

// how long each move winds up (its warning)
const WIND = { burrow: 1.4, charge: 0.85, lunge: 0.45, spikes: 0.6, crows: 0.7, roots: 0.6, quicksand: 0.5, lava: 0.6,
  meteor: 0.6, teleport: 0.3, blink: 0.3, whirl: 0.5, slashwave: 0.45 }

// the signature moves: they set their marks and shots the moment the wind-up ends
function signature(b, p, ux, uy, base, two, ctx) {
  const d = b.d, sp = d.shot
  switch (b.move) {
    case 'spikes': {        // Gemmaw: lines of crystal spikes burst from the floor toward you, one after another
      const lines = two ? 3 : b.kind === 'wyrm' ? 1 : 2           // the first lord's first phase: one line, to learn it on
      for (let l = 0; l < lines; l++) {
        const a = base + (l - (lines - 1) / 2) * 0.45
        for (let k = 1; k <= 9; k++) ctx.slam(b.x + Math.cos(a) * k * 15, b.y + Math.sin(a) * k * 15, 11, Math.round(b.dmg * 1.2), 0.3 + k * 0.08)
      }
      break
    }
    case 'crows': {         // the Scarecrow King: his crows come at you from every side
      const n = two ? 12 : 8
      for (let k = 0; k < n; k++) {
        const a = k / n * Math.PI * 2 + ctx.rand() * 0.3, x = p.x + Math.cos(a) * 112, y = p.y + Math.sin(a) * 112
        if (ctx.F.blocksShot(Math.floor(x / 16), Math.floor((y + 3) / 16))) continue
        ctx.shoot(x, y, a + Math.PI, 92, b.dmg, 'shot_dark')
      }
      break
    }
    case 'roots': {         // Rootmother: roots creep under the floor toward you, breaking out as they come
      const n = two ? 4 : 3
      for (let l = 0; l < n; l++) {
        let x = b.x, y = b.y, a = base + (l - (n - 1) / 2) * 0.5
        for (let k = 1; k <= 10; k++) {
          const want = Math.atan2(p.y - y, p.x - x); let da = want - a; da = Math.atan2(Math.sin(da), Math.cos(da))
          a += da * 0.35 + (ctx.rand() - 0.5) * 0.5; x += Math.cos(a) * 14; y += Math.sin(a) * 14
          ctx.slam(x, y, 10, Math.round(b.dmg * 1.1), 0.3 + k * 0.1)
        }
      }
      break
    }
    case 'quicksand':       // Sandmaw: the sand under you starts to pull you in; roll or walk out before it closes
      ctx.slam(p.x, p.y, 30, Math.round(b.dmg * 1.5), 1.7, 46)
      break
    case 'lava': {          // Ignarok: burning pools that stay a while
      const pools = two ? 5 : 3
      for (let k = 0; k < pools; k++) {
        const x = p.x + (k ? (ctx.rand() - 0.5) * 110 : 0), y = p.y + (k ? (ctx.rand() - 0.5) * 80 : 0)
        for (let t = 0; t < 6; t++) ctx.slam(x, y, 15, Math.round(b.dmg * 0.6), 0.8 + t * 0.5)
      }
      break
    }
    case 'meteor': {        // Vorgrath: fire falls round you, here and there
      const n = two ? 13 : 9
      for (let k = 0; k < n; k++) ctx.slam(p.x + (ctx.rand() - 0.5) * 140, p.y + (ctx.rand() - 0.5) * 110, 18, Math.round(b.dmg * 1.5), 0.6 + k * 0.15)
      break
    }
    case 'slashwave': {     // a Fallen Knight's swing that flies: a fan of fast cuts
      for (let w = 0; w < (two ? 2 : 1); w++) for (let k = -3; k <= 3; k++) ctx.shoot(b.x, b.y - 8, base + k * 0.15, 130 - w * 30, b.dmg, sp)
      break
    }
    case 'teleport': case 'blink': b.hidden = true; break
    case 'lunge': b.cdx = ux; b.cdy = uy; break
  }
}

// where the boss can be hurt from, and whether it can be hurt now
export const bossHittable = b => !b.hidden && !b.dead
