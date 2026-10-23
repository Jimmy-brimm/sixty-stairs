// One floor of the Sixty Stairs: the knight, the monsters, the loot, the light. Solo, the floor is all yours; in a
// party the leader runs the monsters and everyone else follows the leader's word (see net.js).
// World units: a tile is 16; the world layer draws Z pixels per unit: 2 (32-pixel tiles), or 1 on low graphics.
import { makeFloor, TILE, WALL, HAZ, GLOWS, rng, landIndex } from './world.js'
import { makeMonster, stepMonster, stepShots, move, fits, los, MON_KINDS, SHOTS, SHOT_LIGHT } from './actors.js'
import { makeBoss, stepBoss, bossHittable } from './bosses.js'
import { C, rgba, makePalette } from './display.js'
import { STONES, BOSSES } from './lore.js'
import { heroStats, xpNeed, rollItem, itemName, RARITY, TIER_METAL, WEAPON_KINDS, POINTS_PER_LEVEL, DIFFICULTY } from './items.js'

export const MAX_POTIONS = 9
export const BAG = 16
const R = 5               // the knight's radius
const SPEED = 74
const ROLL_T = 0.3       // the roll: how long, and its speed at the start (it slows as it ends)
const ROLL_SPEED = 215
const ROLL_CD = 0.8         // from one roll to the next
const ROLL_FRAMES = 6
const DRAW_T = 0.6          // a bow drawn this long shoots its hardest
// an arrow's damage by how far it flew: x0.75 point-blank, full at 56 units (three and a half tiles), x1.4 by 150
export const reachMul = d => d <= 56 ? 0.75 + 0.25 * Math.max(0, d - 16) / 40 : 1 + 0.4 * Math.min(1, (d - 56) / 94)
const STUN_MUL = 1.25       // a dazed foe takes this much more
const RARITY_RGB = [[220, 220, 230], [110, 230, 110], [90, 160, 255], [200, 110, 255], [255, 170, 40]]

// a knight's look as a palette: skin, hair, cloak and trim as chosen; the armour in its tier's metal
export function knightPalette(art, look, armorTier = 0) {
  return makePalette(art, { skin: look.skin, hair: look.hair, cloak: look.cloak, trim: look.trim, armor: TIER_METAL[armorTier] })
}
// where the hand is, from the feet, for each facing (units)
const HAND = { down: [5, -8], up: [-5, -8], side: [3, -8] }

// arrive: 'start' (the floor's top, by the stairs down from above or a waystone) or 'stairs' (up from the floor below)
// diff: the difficulty's key, or a function giving it (read when a monster is made, and at every hit you take)
export function createRun({ floor, art, D, hero, sfx, net = null, save, events, arrive = 'start', diff = 'normal' }) {
  const D_ = () => DIFFICULTY[typeof diff === 'function' ? diff() : diff] || DIFFICULTY.normal
  const harden = (m, boss = false) => {
    const d = D_(), k = d.hp * (boss ? d.boss : 1)
    m.hp = m.maxHp = Math.max(1, Math.round(m.maxHp * k)); if (m.speed) m.speed *= d.speed
    return m
  }
  const F = makeFloor(floor)
  const land = F.land, li = landIndex(floor)
  const rand = rng(floor * 31 + (net ? 7 : 3) + (save?.deaths || 0) * 101)
  const loot = rng((Math.random() * 4294967296) >>> 0)       // chests and drops: new every visit
  let S = art.sprites, Z = 2, q = 1, fx = 2      // sprites, pixels per unit, q = Z / 2, effects (2 all, 1 fewer)
  const auth = () => !net || net.auth
  let st = heroStats(hero)
  const restat = () => { st = heroStats(hero); hero.hp = Math.min(hero.hp, st.maxHp) }

  const up = arrive === 'stairs'
  const me = { x: (up ? F.stairs.x : F.start.x) * TILE + 8, y: (up ? F.stairs.y : F.start.y) * TILE + 8, kx: 0, ky: 0, dir: 'down', flip: false, anim: 0, moving: false,
    cd: 0, swing: 0, swingT: 0.2, swingA: 0, hitIds: new Set(), dash: 0, dashCd: 0, dx: 0, dy: 1, inv: 1.2, burn: 0, potCd: 0,
    dead: false, ready: false, readyUp: false, aim: Math.PI / 2, roll: 0,
    // stairs and waystones work once you have stepped off them: arriving on one never sends you straight on
    offDown: !up, offUp: up, offWp: true }
  const monsters = F.monsters.map(m => harden(makeMonster(m.kind, floor, m.x, m.y, m.id, rand)))
  let nextId = 1000
  // coming up from below, the lord of this floor is already beaten
  const boss = F.boss && !up ? harden(makeBoss(F.boss.kind, floor, F.boss.x, F.boss.y), true) : null
  // a waystone on the first floor of each land, a step or two from the top of the floor
  let wp = null
  if (floor % 10 === 1) {
    const taken = new Set([...F.chests.map(c => F.i(c.x, c.y)), F.stone ? F.i(F.stone.x, F.stone.y) : -1, F.i(F.stairs.x, F.stairs.y), F.i(F.start.x, F.start.y)])
    for (const want of [2, 3, 1, 4]) {
      for (let i = 0; i < F.w * F.h && !wp; i++) if (F.dist[i] === want && !F.ob[i] && F.tile[i] !== WALL && F.tile[i] !== HAZ && !taken.has(i)) wp = { x: (i % F.w) * TILE + 8, y: Math.floor(i / F.w) * TILE + 8 }
      if (wp) break
    }
  }
  const shots = [], myShots = [], effects = [], texts = [], drops = [], marks = [], parts = []
  const opened = new Set()
  let stoneRead = false, stairsOpen = !F.stairs.hidden || up, reading = null, bossIntro = boss ? 2.6 : 0, banner = null
  let flow = new Int16Array(F.w * F.h).fill(-1), flowT = 0, flowKey = ''
  const others = new Map()
  let time = 0, shake = 0
  const camera = { x: me.x, y: me.y }
  const pals = new Map()       // look key -> palette
  const palFor = (look, tier) => {
    const key = JSON.stringify(look) + tier
    if (!pals.has(key)) pals.set(key, knightPalette(art, look, tier))
    return pals.get(key)
  }
  const bossPal2 = boss && boss.kind === 'demonlord' ? makePalette(art, { demonskin: '#5a1c78' }) : null

  // ---- helpers
  const say = (x, y, text, color = C.white, life = 0.9) => texts.push({ x, y, text: String(text), color, t: 0, life })
  const effect = (name, x, y, dur = 0.3, opts = {}) => effects.push({ s: S[name], x, y, t: 0, dur, ...opts })
  const burst = (x, y, color, n = 8, speed = 50, glow = false) => {
    if (fx < 2) n = Math.ceil(n / 2)
    for (let k = 0; k < n; k++) {
      const a = Math.random() * Math.PI * 2, v = speed * (0.4 + Math.random() * 0.8)
      parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 20, g: 120, life: 0.35 + Math.random() * 0.3, t: 0, c: color, glow, size: 2 })
    }
  }
  const alivePlayers = () => {
    const out = []
    if (!me.dead) out.push(me)
    for (const o of others.values()) if (!o.dead) out.push(o)
    return out
  }
  const nearest = (x, y) => {
    let best = null, bd = 1e9
    for (const p of alivePlayers()) { const d = Math.hypot(p.x - x, p.y - y); if (d < bd) { bd = d; best = p } }
    return best
  }

  function updateFlow() {
    const ps = alivePlayers()
    const key = ps.map(p => Math.floor(p.x / TILE) + ',' + Math.floor(p.y / TILE)).join('|')
    if (key === flowKey) return
    flowKey = key
    flow.fill(-1)
    const q = []
    for (const p of ps) { const x = Math.floor(p.x / TILE), y = Math.floor(p.y / TILE); if (F.in(x, y)) { flow[F.i(x, y)] = 0; q.push(x, y) } }
    for (let h = 0; h < q.length; h += 2) {
      const x = q[h], y = q[h + 1], nd = flow[F.i(x, y)] + 1
      if (nd > 40) continue
      for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const nx = x + dx, ny = y + dy
        if (!F.in(nx, ny) || flow[F.i(nx, ny)] >= 0 || !F.safe(nx, ny)) continue
        flow[F.i(nx, ny)] = nd; q.push(nx, ny)
      }
    }
  }

  const outbox = { shots: [], marks: [], kills: [] }
  function shoot(x, y, a, speed, dmg, sprite, age = 0) {
    shots.push({ x: x + Math.cos(a) * speed * age, y: y + Math.sin(a) * speed * age, vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, dmg, spr: sprite, life: 4 - age })
    if (net && auth()) outbox.shots.push([Math.round(x), Math.round(y), Math.round(a * 100) / 100, speed, dmg, SHOTS.indexOf(sprite)])
  }
  function slam(x, y, r, dmg, delay) {
    marks.push({ x, y, r, dmg, t: delay, d0: delay })
    if (net && auth()) outbox.marks.push([Math.round(x), Math.round(y), r, dmg, delay])
  }
  function summon(kind, x, y) {
    if (!fits(F, x, y, 6, false)) { x = boss.x; y = boss.y + 16 }
    const m = harden(makeMonster(kind, floor, x, y, nextId++, rand)); m.awake = true
    monsters.push(m); effect('poof', x, y, 0.4)
  }
  const stunned = o => { say(o.x, o.y - (o.r || 6) * 2 - 10, 'STUNNED', C.gold, 1.2); burst(o.x, o.y - 6, rgba(255, 230, 150), 10, 60, true); sfx('hit', 0.6); shake = Math.max(shake, 0.2) }
  const monCtx = {
    stunned,
    F, get flow() { return flow }, target: m => nearest(m.x, m.y), shoot, slam, rand, get now() { return time }, crowd: monsters,
    bump: () => { shake = 0.15 },
  }
  const bossCtx = {
    stunned,
    F, target: () => nearest(boss.x, boss.y), shoot, slam, summon, rand, get now() { return time },
    minions: () => monsters.filter(m => !m.dead).length,
    roar: () => { shake = 0.4; sfx('roar', 0.9); banner = { text: 'IT GROWS ANGRY', t: 0, life: 1.8, color: C.red } },
    bump: () => { shake = 0.3 },
  }

  // ---- hurting things
  function hurtMonster(m, dmg, kx, ky, crit, knock = 1) {
    if (m.dead) return
    if (m.st === 3 && m.d.ai === 'charger') dmg = Math.round(dmg * STUN_MUL)
    m.hp -= dmg; m.flash = 0.12; m.awake = true
    const heavy = m.d.ai === 'tank' ? 0.35 : 1
    m.kx += kx * 105 * heavy * knock; m.ky += ky * 105 * heavy * knock
    say(m.x, m.y - 14, dmg, crit ? C.gold : C.white)
    burst(m.x, m.y - 4, crit ? rgba(255, 220, 120) : rgba(255, 255, 255), crit ? 10 : 5, 60, crit)
    if (m.hp <= 0) killMonster(m)
  }
  function killMonster(m, quiet = false) {
    if (m.dead) return
    m.dead = true
    if (net && auth()) outbox.kills.push(m.id)
    effect('poof', m.x, m.y - 2, 0.4)
    burst(m.x, m.y - 4, rgba(200, 190, 210), 10, 70)
    if (!quiet) sfx('kill', 0.5)
    reward(m.xp, m.x, m.y)
    const r = loot()
    if (r < 0.08) drops.push({ kind: 'heart', x: m.x, y: m.y, t: 0 })
    else if (r < 0.11) drops.push({ kind: 'potion', x: m.x, y: m.y, t: 0 })
    else if (r < 0.14) drops.push({ kind: 'item', item: rollItem(loot, { tier: li, luck: floor / 60 }), x: m.x, y: m.y, t: 0 })
  }
  function hurtBoss(dmg, crit) {
    if (!boss || !bossHittable(boss)) return
    if (boss.st === 'stunned') dmg = Math.round(dmg * STUN_MUL)
    boss.hp -= dmg; boss.flash = 0.1
    say(boss.x, boss.y - boss.r * 2 - 4, dmg, crit ? C.gold : C.white)
    burst(boss.x + (rand() - 0.5) * 16, boss.y - 10, rgba(255, 240, 200), crit ? 10 : 5, 70, crit)
    if (boss.hp <= 0) killBoss()
  }
  function killBoss() {
    if (boss.dead) return
    boss.dead = true
    if (net && auth()) outbox.kills.push('boss')
    for (let k = 0; k < 6; k++) effect('poof', boss.x + (rand() - 0.5) * 30, boss.y - rand() * 24, 0.6)
    burst(boss.x, boss.y - 16, rgba(255, 200, 120), 40, 120, true)
    shake = 0.6; sfx('bossdown', 1)
    for (const m of monsters) if (!m.dead) killMonster(m, true)
    shots.length = 0; marks.length = 0
    reward(Math.round(80 * (1 + 0.1 * (floor - 1))), boss.x, boss.y)
    // the lord's treasure: a weapon of your kind and an armour, of the next tier, rare or better (once; again, one thing)
    const tier = Math.min(5, li + 1), first = !save?.bosses?.includes(li)
    const got = first ? [rollItem(loot, { kind: hero.weapon?.k || 'sword', tier, luck: 0.6, minRarity: 2 }), rollItem(loot, { kind: 'armor', tier, luck: 0.6, minRarity: 2 })]
      : [rollItem(loot, { tier: li, luck: 0.5, minRarity: 1 })]
    for (const it of got) drops.push({ kind: 'item', item: it, x: boss.x + (rand() - 0.5) * 20, y: boss.y + 12, t: 0 })
    hero.hp = st.maxHp
    hero.potions = Math.min(MAX_POTIONS, hero.potions + 2)
    events.bossDown?.(li, got.map(itemName))
    stairsOpen = true
    banner = { text: BOSSES[li].name + ' FALLS', t: 0, life: 3, color: C.gold, sub: BOSSES[li].fall }
  }
  function reward(xp, x, y) {
    xp = Math.round(xp * st.xpMul)
    hero.xp += xp
    say(x, y - 22, '+' + xp + ' XP', C.xp, 0.8)
    while (hero.xp >= xpNeed(hero.level)) {
      hero.xp -= xpNeed(hero.level); hero.level++; hero.points += POINTS_PER_LEVEL
      restat()
      hero.hp = Math.min(st.maxHp, hero.hp + Math.round(st.maxHp * 0.3))
      say(me.x, me.y - 28, 'LEVEL UP! +' + POINTS_PER_LEVEL + ' POINTS', C.gold, 2); sfx('level', 0.8)
      events.changed?.()
    }
  }
  function hurtMe(dmg, fromX, fromY) {
    if (me.dead || me.inv > 0) return
    const d = D_()
    const taken = d.noHit ? hero.hp : Math.max(1, Math.round(dmg * d.dmg * 100 / (100 + st.def * 3.5)))      // No Hit: any hit fells you
    hero.hp -= taken; me.inv = 0.75
    const dx = me.x - fromX, dy = me.y - fromY, l = Math.hypot(dx, dy) || 1
    me.kx = dx / l * 90; me.ky = dy / l * 90
    say(me.x, me.y - 18, taken, C.red); sfx('hurt', 0.7); shake = Math.max(shake, 0.12)
    burst(me.x, me.y - 8, rgba(255, 90, 90), 6, 50)
    if (hero.hp <= 0) { hero.hp = 0; me.dead = true; effect('poof', me.x, me.y, 0.5); sfx('die', 0.9); events.died?.() }
  }
  function heal(n) { const h = Math.min(st.maxHp - hero.hp, n); if (h > 0) { hero.hp += h; say(me.x, me.y - 22, '+' + h, C.green) } }

  // ---- the weapon
  let swingNo = 0
  function roll() { const crit = Math.random() < st.crit; return [Math.max(1, Math.round(st.dmg * (0.9 + Math.random() * 0.2) * (crit ? st.critMul : 1))), crit] }
  // charge: how far a bow was drawn (0..1); a full draw hits half as hard again and flies faster
  function attack(a, charge = 0) {
    const k = st.k
    me.cd = st.cd; me.swingA = a; me.hitIds.clear(); swingNo++
    if (k.shot) {
      // bows and staves: something that flies
      let [dmg, crit] = roll()
      dmg = Math.round(dmg * (1 + 0.5 * charge))
      const sp = k.speed * (1 + 0.35 * charge)
      const hx = me.x + Math.cos(a) * 8, hy = me.y - 7 + Math.sin(a) * 8
      const shot = { ox: me.x, oy: me.y, x: hx, y: hy, vx: Math.cos(a) * sp, vy: Math.sin(a) * sp, dmg, crit, spr: k.shot, life: 1.1, homing: !!k.homing, pierce: k.pierce || 0, hit: new Set() }
      // point blank: a foe already on top of you is hit at once (the shot starts past it and would fly through)
      const close = (x, y, r) => { const dx = x - me.x, dy = y - me.y, d = Math.hypot(dx, dy); let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da)); return d < r + 4 || (d < r + 12 && Math.abs(da) < 1.3) }
      for (const m of monsters) {
        if (m.dead || !close(m.x, m.y, m.r)) continue
        hitTarget(m, false, [k.shot === 'arrow' ? Math.max(1, Math.round(dmg * reachMul(Math.hypot(m.x - me.x, m.y - me.y)))) : dmg, crit], a); shot.hit.add(m.id)
        if (shot.pierce-- <= 0) { shot.life = 0; break }
      }
      if (shot.life > 0 && boss && bossHittable(boss) && close(boss.x, boss.y, boss.r)) { hitTarget(boss, true, [k.shot === 'arrow' ? Math.max(1, Math.round(dmg * reachMul(Math.hypot(boss.x - me.x, boss.y - me.y)))) : dmg, crit], a); shot.life = 0 }
      if (shot.life > 0) myShots.push(shot)
      else burst(hx, hy, k.shot === 'marrow' ? rgba(170, 160, 255) : rgba(220, 200, 160), 5, 40, k.shot === 'marrow')
      me.swing = me.swingT = k.shot === 'arrow' ? 0.15 : 0.28
      sfx(k.shot === 'arrow' ? 'swing' : 'potion', 0.35)
      if (net) me.sentShot = [Math.round(hx), Math.round(hy), Math.round(a * 100) / 100, k.shot === 'arrow' ? 0 : 1]
      return
    }
    me.swing = k.swing; me.swingT = k.swing
    if (!k.thrust) effect('slash', me.x + Math.cos(a) * 9, me.y - 6 + Math.sin(a) * 9, k.swing, { frames: 3, angle: a, rot: true })
    sfx('swing', 0.45)
  }
  function hitTarget(target, isBoss, dmgRoll, a) {
    const [dmg, crit] = dmgRoll
    if (st.leech) heal(Math.round(dmg * st.leech))
    if (isBoss) {
      if (auth()) hurtBoss(dmg, crit)
      else { boss.flash = 0.1; say(boss.x, boss.y - boss.r * 2 - 4, dmg, crit ? C.gold : C.white); net.toLeader({ k: 'hit', id: 'boss', d: dmg }) }
    } else if (auth()) hurtMonster(target, dmg, Math.cos(a), Math.sin(a), crit, st.k.knock || 0.5)
    else {
      target.flash = 0.12; say(target.x, target.y - 14, dmg, crit ? C.gold : C.white)
      net.toLeader({ k: 'hit', id: target.id, d: dmg, kx: Math.round(Math.cos(a) * 100) / 100, ky: Math.round(Math.sin(a) * 100) / 100 })
    }
    sfx('hit', 0.5)
  }
  function meleeHits() {
    if (me.swing <= 0 || st.k.shot) return
    const k = st.k, a = me.swingA, ox = me.x, oy = me.y - 4
    const inReach = (tx, ty, r) => {
      const dx = tx - ox, dy = ty - oy, d = Math.hypot(dx, dy)
      if (k.thrust) {                       // a line: along the aim, a little to either side
        const along = dx * Math.cos(a) + dy * Math.sin(a), side = Math.abs(-dx * Math.sin(a) + dy * Math.cos(a))
        return along > -2 && along < k.reach + r && side < 5 + r
      }
      if (d > k.reach + r) return false
      let da = Math.atan2(dy, dx) - a; da = Math.atan2(Math.sin(da), Math.cos(da))
      return Math.abs(da) < k.arc || d < r + 4
    }
    for (const m of monsters) {
      if (m.dead || me.hitIds.has(m.id) || !inReach(m.x, m.y - 2, m.r)) continue
      me.hitIds.add(m.id); hitTarget(m, false, roll(), a)
    }
    if (boss && !me.hitIds.has('boss') && bossHittable(boss) && inReach(boss.x, boss.y - 8, boss.r)) { me.hitIds.add('boss'); hitTarget(boss, true, roll(), a) }
  }
  function stepMyShots(dt) {
    for (let i = myShots.length - 1; i >= 0; i--) {
      const s = myShots[i]
      if (s.homing) {
        // turn a little toward the nearest foe ahead
        let best = null, bd = 70
        for (const m of monsters) { if (m.dead) continue; const d = Math.hypot(m.x - s.x, m.y - s.y); if (d < bd) { bd = d; best = m } }
        if (boss && bossHittable(boss) && Math.hypot(boss.x - s.x, boss.y - s.y) < 90) best = boss
        if (best) {
          const want = Math.atan2(best.y - 6 - s.y, best.x - s.x), cur = Math.atan2(s.vy, s.vx)
          let d = want - cur; d = Math.atan2(Math.sin(d), Math.cos(d))
          const na = cur + Math.max(-4 * dt, Math.min(4 * dt, d)), sp = Math.hypot(s.vx, s.vy)
          s.vx = Math.cos(na) * sp; s.vy = Math.sin(na) * sp
        }
      }
      s.x += s.vx * dt; s.y += s.vy * dt; s.life -= dt
      let gone = s.life <= 0 || F.blocksShot(Math.floor(s.x / TILE), Math.floor((s.y + 3) / TILE))
      if (!gone && !s.ghost) {
        for (const m of monsters) {
          if (m.dead || s.hit.has(m.id) || Math.hypot(m.x - s.x, m.y - 4 - s.y) > m.r + 3) continue
          const far = s.spr === 'arrow' ? reachMul(Math.hypot(s.x - s.ox, s.y - s.oy)) : 1
          hitTarget(m, false, [Math.max(1, Math.round(s.dmg * far)), s.crit], Math.atan2(s.vy, s.vx)); s.hit.add(m.id)
          if (s.pierce-- <= 0) gone = true
          break
        }
        if (!gone && boss && bossHittable(boss) && Math.hypot(boss.x - s.x, boss.y - 10 - s.y) < boss.r + 4) {
          const far = s.spr === 'arrow' ? reachMul(Math.hypot(s.x - s.ox, s.y - s.oy)) : 1
          hitTarget(boss, true, [Math.max(1, Math.round(s.dmg * far)), s.crit], 0); gone = true
        }
      }
      if (s.spr === 'marrow' && fx === 2 && Math.random() < 0.7) parts.push({ x: s.x - s.vx * 0.02, y: s.y - s.vy * 0.02, vx: (Math.random() - 0.5) * 10, vy: (Math.random() - 0.5) * 10, g: 0, life: 0.25, t: 0, c: Math.random() < 0.5 ? rgba(180, 150, 255) : rgba(140, 210, 255), glow: true, size: 1 })
      if (gone) { burst(s.x, s.y, s.spr === 'marrow' ? rgba(170, 160, 255) : rgba(220, 200, 160), s.spr === 'marrow' ? 7 : 4, 40, s.spr === 'marrow'); myShots.splice(i, 1) }
    }
  }

  // ---- chests, the stone, loot
  function openChest(c) {
    opened.add(c.id); sfx('chest', 0.7)
    const x = c.x * TILE + 8, y = c.y * TILE + 8
    const r = loot(), sure = floor % 10 === 9 && c.id === 0
    burst(x, y - 6, rgba(255, 220, 120), 14, 60, true)
    if (sure || r < 0.6) drops.push({ kind: 'item', item: rollItem(loot, { tier: li, luck: floor / 60 + (sure ? 0.4 : 0), minRarity: sure ? 1 : 0 }), x, y: y + 10, t: 0 })
    else drops.push({ kind: 'potion', x, y: y + 10, t: 0 })
    if (r > 0.8) drops.push({ kind: 'potion', x: x + 8, y: y + 10, t: 0 })
    events.changed?.()
  }
  function pickUp(d) {
    if (d.kind === 'heart') { heal(Math.round(st.maxHp * 0.15)); return true }
    if (d.kind === 'potion') {
      if (hero.potions >= MAX_POTIONS) return false
      hero.potions++; say(me.x, me.y - 20, 'POTION', C.red); return true
    }
    if (hero.bag.length >= BAG) { if (!d.warned) { say(me.x, me.y - 20, 'YOUR BAG IS FULL', C.dim, 1.4); d.warned = true } return false }
    hero.bag.push(d.item)
    say(me.x, me.y - 24, itemName(d.item), rgba(...RARITY_RGB[d.item.r]), 2.2)
    events.changed?.(); events.loot?.(d.item)
    return true
  }

  // ---- the leader's word (party play)
  function snapshot() {
    const m = []
    for (const o of monsters) if (o.awake || o.dead) {
      const v = [o.id, Math.round(o.x), Math.round(o.y), Math.max(0, o.hp), o.st, o.face, MON_KINDS.indexOf(o.kind), o.maxHp]
      if (o.st === 1 && o.tl) v.push(Math.round(o.cdx * 100), Math.round(o.cdy * 100), Math.round(o.tl))
      m.push(v)
    }
    const msg = { k: 's', m, s: outbox.shots, mk: outbox.marks, x: outbox.kills }
    if (boss) msg.b = [Math.round(boss.x), Math.round(boss.y), Math.max(0, boss.hp), boss.hidden ? 1 : 0, boss.phase, boss.face, Math.round(boss.mx || 0), Math.round(boss.my || 0), boss.st === 'wind' && boss.move === 'charge' ? 1 : 0, boss.st === 'stunned' ? 1 : 0]
    outbox.shots = []; outbox.marks = []; outbox.kills = []
    return msg
  }
  function applySnapshot(s) {
    const byId = new Map(monsters.map(o => [o.id, o]))
    for (const v of s.m || []) {
      let o = byId.get(v[0])
      if (!o) { o = makeMonster(MON_KINDS[v[6]] || 'bat', floor, v[1], v[2], v[0], rand); monsters.push(o); effect('poof', v[1], v[2], 0.4) }
      o.tx = v[1]; o.ty = v[2]; o.hp = v[3]; o.st = v[4]; o.face = v[5]; o.awake = true; o.maxHp = v[7] || o.maxHp
      if (v.length > 8) { o.cdx = v[8] / 100; o.cdy = v[9] / 100; o.tl = v[10] }
    }
    for (const v of s.s || []) {
      const s2 = { x: v[0], y: v[1], vx: Math.cos(v[2]) * v[3], vy: Math.sin(v[2]) * v[3], dmg: v[4], spr: SHOTS[v[5]] || 'shot_rock', life: 4 }
      s2.x += s2.vx * 0.06; s2.y += s2.vy * 0.06
      shots.push(s2)
    }
    for (const v of s.mk || []) marks.push({ x: v[0], y: v[1], r: v[2], dmg: v[3], t: v[4], d0: v[4] })
    for (const id of s.x || []) {
      if (id === 'boss') { if (boss) { boss.hp = 0; killBoss() } continue }
      const o = byId.get(id); if (o) killMonster(o)
    }
    if (boss && s.b) {
      boss.tx = s.b[0]; boss.ty = s.b[1]; boss.hp = s.b[2]; boss.hidden = !!s.b[3]; boss.face = s.b[5]; boss.mx = s.b[6]; boss.my = s.b[7]
      boss.telegraph = !!s.b[8]; boss.dazed = !!s.b[9]; boss.awake = true
      if (boss.phase === 1 && s.b[4] === 2) { boss.phase = 2; bossCtx.roar() }
    }
  }
  function onNet(msg, from) {
    if (msg.k === 's' && !auth()) applySnapshot(msg)
    else if (msg.k === 'hit' && auth()) {
      if (msg.id === 'boss') hurtBoss(msg.d, false)
      else { const m = monsters.find(o => o.id === msg.id); if (m) hurtMonster(m, msg.d, msg.kx || 0, msg.ky || 0, false) }
    } else if (msg.k === 'me') {
      let o = others.get(from)
      if (!o) { o = { x: msg.x, y: msg.y, anim: 0, name: net.nameOf(from), look: null }; others.set(from, o) }
      if (msg.rl && !(o.roll > 0)) { o.roll = msg.rl[0] / 100; o.rollDx = msg.rl[1] / 100; o.rollDy = msg.rl[2] / 100 }
      Object.assign(o, { tx: msg.x, ty: msg.y, dir: msg.d, flip: !!msg.f, hp: msg.hp, mh: msg.mh, dead: !!msg.dead, ready: !!msg.r, readyUp: !!msg.u, moving: !!msg.mv, aim: msg.a ?? 0, wk: msg.wk, wt: msg.wt })
      if (msg.look) { o.look = msg.look; o.at = msg.at || 0 }
      if (msg.sw && msg.sw !== o.lastSwing) {
        o.lastSwing = msg.sw; o.swing = 0.22; o.swingA = msg.a ?? 0
        if (msg.sh) myShots.push({ x: msg.sh[0], y: msg.sh[1], vx: Math.cos(msg.sh[2]) * 200, vy: Math.sin(msg.sh[2]) * 200, spr: msg.sh[3] ? 'marrow' : 'arrow', life: 1, ghost: true })
      }
    }
  }
  function forget(id) { others.delete(id) }

  // ---- every frame
  let sent = 0, lookSent = -9
  function update(dt, input) {
    time += dt
    shake = Math.max(0, shake - dt)
    for (const t of texts) { t.t += dt; t.y -= dt * 14 }
    for (let i = texts.length - 1; i >= 0; i--) if (texts[i].t > texts[i].life) texts.splice(i, 1)
    for (const e of effects) e.t += dt
    for (let i = effects.length - 1; i >= 0; i--) if (effects[i].t > effects[i].dur) effects.splice(i, 1)
    if (banner) { banner.t += dt; if (banner.t > banner.life) banner = null }
    stepParticles(dt)

    if (reading) {
      if (input.confirm || input.attackPressed || input.tap) { reading = null; sfx('ui', 0.5) }
      if (!net) return
    }
    if (bossIntro > 0) { bossIntro -= dt; if (!net) { me.inv = 0.5; camera.x += (boss.x - camera.x) * Math.min(1, dt * 3); camera.y += (boss.y - camera.y) * Math.min(1, dt * 3) } }

    // the knight
    me.cd -= dt; me.swing -= dt; me.dash -= dt; me.dashCd -= dt; me.inv -= dt; me.potCd -= dt
    const fade = Math.exp(-10 * dt); me.kx *= fade; me.ky *= fade
    if (!me.dead) {
      let mx = input.moveX, my = input.moveY
      const ml = Math.hypot(mx, my)
      if (ml > 1) { mx /= ml; my /= ml }
      me.moving = ml > 0.15
      if (me.moving) { me.dx = mx; me.dy = my }
      if (input.aim !== null && input.aim !== undefined) me.aim = input.aim
      else if (me.moving) me.aim = Math.atan2(my, mx)
      if (input.dashPressed && me.dashCd <= 0) {
        me.dash = ROLL_T; me.dashCd = ROLL_CD; me.inv = Math.max(me.inv, ROLL_T + 0.05); me.drawing = false; me.draw = 0
        if (!me.moving) { me.dx = Math.cos(me.aim); me.dy = Math.sin(me.aim) }     // standing still: roll the way you face
        sfx('dash', 0.4); burst(me.x, me.y, rgba(200, 190, 180), 6, 30)
      }
      let sp = SPEED
      if (me.drawing) sp *= 0.55                 // a drawn bow: slow steps
      const hz = F.hazardAt(me.x, me.y + 2)
      if (hz === 'slow') sp *= 0.55
      let vx = mx * sp, vy = my * sp
      if (me.dash > 0) {
        const l = Math.hypot(me.dx, me.dy) || 1, v = ROLL_SPEED * (1 - 0.45 * (1 - me.dash / ROLL_T))
        vx = me.dx / l * v; vy = me.dy / l * v
        if (fx === 2 && Math.random() < 0.5) parts.push({ x: me.x + (Math.random() - 0.5) * 6, y: me.y + 2, vx: -vx * 0.1, vy: -12, g: 30, life: 0.3, t: 0, c: rgba(190, 180, 170, 200), size: 2 })
      }
      const steps = Math.max(1, Math.ceil(Math.hypot(vx + me.kx, vy + me.ky) * dt / 4))
      for (let k = 0; k < steps; k++) move(F, me, (vx + me.kx) * dt / steps, (vy + me.ky) * dt / steps, 'hero', R)
      if (hz === 'burn') { me.burn -= dt; if (me.burn <= 0) { me.burn = 0.5; const was = me.inv; me.inv = 0; hurtMe(Math.max(3, Math.round(st.maxHp * 0.06)), me.x, me.y - 1); me.inv = Math.max(was, 0.2); me.kx = me.ky = 0 } }
      else me.burn = 0
      if (me.moving) me.anim += dt * 8
      const a = me.aim, ax = Math.cos(a), ay = Math.sin(a)
      if (Math.abs(ay) > Math.abs(ax) * 0.9) me.dir = ay > 0 ? 'down' : 'up'
      else { me.dir = 'side'; me.flip = ax < 0 }
      const pressing = (input.attackPressed || input.attackHeld) && !reading && me.dash <= 0
      if (st.k.shot === 'arrow') {
        // the bow: held, it draws (and aims); let go, it shoots, harder the longer it was drawn
        if (pressing && me.cd <= 0) { me.drawing = true; me.draw = Math.min(DRAW_T, (me.draw || 0) + dt) }
        else if (me.drawing) { attack(me.aim, me.draw / DRAW_T); me.drawing = false; me.draw = 0 }
      } else if (pressing && me.cd <= 0) attack(input.aim ?? me.aim)
      meleeHits()
      if (input.potionPressed && hero.potions > 0 && me.potCd <= 0) {
        if (hero.hp < st.maxHp) { hero.potions--; me.potCd = 1; heal(Math.round(st.maxHp * st.heal)); sfx('potion', 0.7); burst(me.x, me.y - 8, rgba(255, 90, 120), 10, 40, true); events.changed?.() }
        else say(me.x, me.y - 20, 'FULL HEALTH', C.dim, 0.8)
      }
      for (const c of F.chests) if (!opened.has(c.id) && Math.hypot(c.x * TILE + 8 - me.x, c.y * TILE + 10 - me.y) < 12) openChest(c)
      if (F.stone && !stoneRead && Math.hypot(F.stone.x * TILE + 8 - me.x, F.stone.y * TILE + 12 - me.y) < 12) {
        stoneRead = true; reading = STONES[floor]; sfx('lore', 0.6); events.lore?.(floor)
      }
      for (let i = drops.length - 1; i >= 0; i--) {
        const d = drops[i]; d.t += dt
        if (Math.hypot(d.x - me.x, d.y - me.y) > 11 || d.t < 0.4) continue
        if (pickUp(d)) { sfx('pickup', 0.6); drops.splice(i, 1) }
      }
      const tx = Math.floor(me.x / TILE), ty = Math.floor(me.y / TILE)
      const onDown = tx === F.stairs.x && ty === F.stairs.y, onUp = floor > 1 && tx === F.start.x && ty === F.start.y
      const onWp = !!wp && Math.hypot(wp.x - me.x, wp.y - me.y) < 9
      if (!onDown) me.offDown = true
      if (!onUp) me.offUp = true
      if (!onWp) me.offWp = true
      me.ready = stairsOpen && onDown && me.offDown
      me.readyUp = onUp && me.offUp
      if (!net && me.ready) { me.offDown = false; events.descend?.(); return }
      if (!net && me.readyUp) { me.offUp = false; events.ascend?.(); return }
      if (onWp && me.offWp) { me.offWp = false; events.waypoint?.() }
    }
    stepMyShots(dt)
    const px = Math.floor(me.x / TILE), py = Math.floor(me.y / TILE)
    for (let y = py - 7; y <= py + 7; y++) for (let x = px - 9; x <= px + 9; x++) if (F.in(x, y)) F.seen[F.i(x, y)] = 1

    if (auth()) {
      flowT -= dt
      if (flowT <= 0) { flowT = 0.2; updateFlow() }
      for (const m of monsters) if (!m.dead) stepMonster(m, dt, monCtx)
      if (boss && !boss.dead && bossIntro <= 0) stepBoss(boss, dt, bossCtx)
    } else {
      const k = Math.min(1, dt * 12)
      for (const m of monsters) {
        m.anim += dt; m.flash = Math.max(0, m.flash - dt); m.t += dt
        if (m.tx !== undefined) { if (Math.abs(m.tx - m.x) > 0.5) m.face = m.tx > m.x ? 1 : -1; m.x += (m.tx - m.x) * k; m.y += (m.ty - m.y) * k }
      }
      if (boss && boss.tx !== undefined) { boss.anim += dt; boss.flash = Math.max(0, boss.flash - dt); boss.x += (boss.tx - boss.x) * k; boss.y += (boss.ty - boss.y) * k }
    }
    for (const o of others.values()) {
      const k = Math.min(1, dt * 12)
      if (o.tx !== undefined) { o.x += (o.tx - o.x) * k; o.y += (o.ty - o.y) * k }
      if (o.moving) o.anim += dt * 8
      o.swing = (o.swing || 0) - dt; o.roll = (o.roll || 0) - dt
    }

    if (!me.dead) {
      for (const m of monsters) {
        if (m.dead || m.st === 3 || !m.awake) continue
        const fast = m.st === 2 && (m.d.ai === 'charger' || m.d.swoop)
        if (Math.hypot(m.x - me.x, m.y - me.y) < m.r + R) hurtMe(fast ? Math.round(m.dmg * 1.5) : m.dmg, m.x, m.y)
      }
      if (boss && !boss.dead && !boss.hidden && boss.st !== 'stunned' && !boss.dazed && Math.hypot(boss.x - me.x, boss.y - 6 - me.y) < boss.r + R) hurtMe(boss.st === 'charge' ? Math.round(boss.dmg * 1.6) : boss.dmg, boss.x, boss.y)
    }
    stepShots(F, shots, dt, s => burst(s.x, s.y, rgba(255, 220, 160), 4, 30))
    for (let i = shots.length - 1; i >= 0; i--) {
      const s = shots[i]
      if (!me.dead && Math.hypot(s.x - me.x, s.y - (me.y - 4)) < 7) { hurtMe(s.dmg, s.x - s.vx, s.y - s.vy); shots.splice(i, 1) }
    }
    for (let i = marks.length - 1; i >= 0; i--) {
      const m = marks[i]; m.t -= dt
      if (m.t <= 0) {
        effect('poof', m.x, m.y, 0.35); shake = Math.max(shake, 0.1); burst(m.x, m.y, rgba(255, 140, 90), 12, 80, true)
        if (!me.dead && Math.hypot(m.x - me.x, m.y - me.y) < m.r + R) hurtMe(m.dmg, m.x, m.y)
        marks.splice(i, 1)
      }
    }
    if (net) {
      sent -= dt
      if (sent <= 0) {
        sent = 0.1
        const msg = { k: 'me', x: Math.round(me.x), y: Math.round(me.y), d: me.dir, f: me.flip ? 1 : 0, hp: hero.hp, mh: st.maxHp, dead: me.dead ? 1 : 0, r: me.ready ? 1 : 0, u: me.readyUp ? 1 : 0, mv: me.moving ? 1 : 0, sw: swingNo, a: Math.round(me.aim * 100) / 100, wk: WEAPON_KINDS.indexOf(st.kind), wt: st.tier }
        if (me.sentShot) { msg.sh = me.sentShot; me.sentShot = null }
        if (me.dash > 0) { const l = Math.hypot(me.dx, me.dy) || 1; msg.rl = [Math.round(me.dash * 100), Math.round(me.dx / l * 100), Math.round(me.dy / l * 100)] }
        if (time - lookSent > 2) { lookSent = time; msg.look = hero.look; msg.at = hero.armor?.t || 0 }
        net.send(msg)
        if (auth()) {
          const snap = snapshot(), text = JSON.stringify(snap)
          if (text.length < 950) net.send(snap)
          else { const { s, mk, ...rest } = snap; net.send(rest); for (let k = 0; k < s.length; k += 18) net.send({ k: 's', s: s.slice(k, k + 18), mk: k === 0 ? mk : [] }) }
        }
      }
    }
  }

  // ---- the air of each land: motes, pollen, leaves, sand, embers, ash
  function stepParticles(dt) {
    const want = { cave: 7, plains: 4, forest: 6, desert: 12, volcano: 12, castle: 7 }[land.key]
    if (fx === 2 && Math.random() < want * dt && parts.length < 160) {
      const x = camera.x + (Math.random() - 0.5) * 260, y = camera.y + (Math.random() - 0.5) * 170
      const p = { x, y, t: 0, g: 0, size: 1 }
      switch (land.key) {
        case 'cave': Object.assign(p, { vx: (Math.random() - 0.5) * 6, vy: -3 - Math.random() * 4, life: 4, c: rgba(150, 210, 255), glow: true }); break
        case 'plains': Object.assign(p, { vx: 8 + Math.random() * 6, vy: (Math.random() - 0.5) * 4, life: 4, c: rgba(255, 246, 170) }); break
        case 'forest': Object.assign(p, { vx: 6 + Math.random() * 8, vy: 10 + Math.random() * 6, life: 5, c: Math.random() < 0.5 ? rgba(200, 130, 50) : rgba(110, 170, 70), size: 2, sway: true }); break
        case 'desert': Object.assign(p, { vx: 70 + Math.random() * 40, vy: (Math.random() - 0.5) * 6, life: 2.5, c: rgba(240, 220, 170, 180), size: 2, streak: true }); break
        case 'volcano': Object.assign(p, { vx: (Math.random() - 0.5) * 10, vy: -16 - Math.random() * 14, life: 3, c: rgba(255, 150, 50), glow: true }); break
        case 'castle': Object.assign(p, Math.random() < 0.3 ? { vx: (Math.random() - 0.5) * 8, vy: -12, life: 3, c: rgba(255, 110, 60), glow: true } : { vx: 3, vy: 7, life: 5, c: rgba(150, 140, 150) }); break
      }
      parts.push(p)
    }
    for (let i = parts.length - 1; i >= 0; i--) {
      const p = parts[i]
      p.t += dt; p.vy += p.g * dt
      p.x += (p.vx + (p.sway ? Math.sin(p.t * 3) * 8 : 0)) * dt; p.y += p.vy * dt
      if (p.t > p.life) parts.splice(i, 1)
    }
  }

  // ---- drawing
  let tileSet, obSprites
  const bind = () => {
    tileSet = { floor: S[land.key + '_floor'], top: S[land.key + '_top'], face: S[land.key + '_face'], haz: S[land.key + '_haz'], deco: S[land.key + '_deco'] }
    obSprites = land.obstacles.map(o => S['p_' + o[0]])
  }
  bind()
  // 'high': 32-pixel art and every effect; 'medium': the same art, fewer effects; 'low': half-size art, fewer effects
  function setQuality(level) {
    Z = level === 'low' ? 1 : 2; q = Z / 2; fx = level === 'high' ? 2 : 1
    S = level === 'low' ? art.half : art.sprites
    bind()
    if (fx < 2) parts.length = 0
  }
  const SHADOW = rgba(0, 0, 0, 80), EDGE = rgba(8, 4, 12, 210)

  function drawKnight(W, p, x, y, look, armorTier, mine) {
    const facing = p.dir === 'side' ? 'right' : p.dir || 'down'
    const fr = p.moving ? Math.floor(p.anim) % 4 : 0
    const pal = palFor(look, armorTier)
    const flip = p.dir === 'side' && p.flip
    const blink = mine && me.inv > 0 && me.dash <= 0 && Math.floor(me.inv * 16) % 2
    if (blink) return
    const rollLeft = mine ? me.dash : p.roll || 0
    if (rollLeft > 0) {
      // a roll: tucked up and turning head over heels the way they go (rendered frames), the weapon put away
      const dx = mine ? me.dx : p.rollDx || 0, dy = mine ? me.dy : p.rollDy || 0, side = Math.abs(dx) > Math.abs(dy) * 0.7
      const face = side ? 'right' : dy < 0 ? 'up' : 'down', left = side && dx < 0
      const prog = 1 - Math.min(1, rollLeft / ROLL_T), f = Math.min(ROLL_FRAMES - 1, Math.floor(prog * ROLL_FRAMES))
      W.sprite(S['kr_' + look.outfit + '_' + face], f, x, y, { pal, flip: left })
      W.sprite(S['hr_' + look.head + '_' + face], f, x, y, { pal, flip: left })
      return
    }
    const body = S['k_' + look.outfit + '_' + facing], head = S['h_' + look.head + '_' + facing]
    const wk = mine ? st.kind : WEAPON_KINDS[p.wk] || 'sword', wt = mine ? st.tier : p.wt || 0
    const behind = p.dir === 'up'
    if (behind) drawWeapon(W, p, x, y, wk, wt, mine)
    W.sprite(body, fr, x, y, { pal, flip })
    W.sprite(head, fr, x, y, { pal, flip })
    if (!behind) drawWeapon(W, p, x, y, wk, wt, mine)
  }
  function drawWeapon(W, p, x, y, wk, wt, mine) {
    const hand = HAND[p.dir || 'down']
    const hx = x + (p.dir === 'side' && p.flip ? -hand[0] : hand[0]) * Z, hy = y + hand[1] * Z
    const aim = mine ? me.aim : p.aim || 0
    const k = { sword: 1, spear: 1, axe: 1 }[wk]
    const swingLeft = mine ? me.swing : p.swing || 0, swingT = mine ? me.swingT : 0.22
    const swingA = mine ? me.swingA : p.swingA ?? aim
    let a, ox = 0, oy = 0
    if (wk === 'bow') a = aim
    else if (wk === 'staff') {
      // held upright, leaning a little the way they face; a cast tips it toward the target and back
      const rest = -Math.PI / 2 + (p.dir === 'side' ? (p.flip ? -0.22 : 0.22) : p.dir === 'up' ? -0.15 : 0.15)
      a = rest
      if (swingLeft > 0) { let d = swingA - rest; d = Math.atan2(Math.sin(d), Math.cos(d)); a = rest + d * 0.8 * Math.sin((1 - swingLeft / swingT) * Math.PI) }
    }
    else if (swingLeft > 0) {
      const prog = 1 - swingLeft / swingT
      if (wk === 'spear') { a = swingA; const push = Math.sin(prog * Math.PI) * 10 * Z; ox = Math.cos(a) * push; oy = Math.sin(a) * push }
      else { const arc = wk === 'axe' ? 1.7 : 1.15; a = swingA - arc + 2 * arc * prog }
    } else a = Math.cos(aim) >= 0 ? aim + 0.9 : aim - 0.9      // resting, the blade low
    W.spriteRot(S['w_' + wk + wt], 0, hx + ox, hy + oy, a, { flipY: Math.cos(a) < 0 })
    if (wk === 'bow' && mine && me.drawing) {
      const pull = (2 + 6 * me.draw / DRAW_T) * Z
      W.spriteRot(S.arrow, 0, hx - Math.cos(a) * pull + Math.cos(a) * 4 * Z, hy - Math.sin(a) * pull + Math.sin(a) * 4 * Z, a)
    }
  }

  function draw(D) {
    const W = D.world, U = D.ui
    const tx = me.x, ty = me.y - 6
    if (bossIntro <= 0 || net) { camera.x += (tx - camera.x) * 0.18; camera.y += (ty - camera.y) * 0.18 }
    const vw = W.W / Z, vh = W.H / Z
    const mapW = F.w * TILE, mapH = F.h * TILE
    let cx = camera.x - vw / 2, cy = camera.y - vh / 2
    cx = mapW <= vw ? (mapW - vw) / 2 : Math.max(0, Math.min(mapW - vw, cx))
    cy = mapH <= vh ? (mapH - vh) / 2 : Math.max(0, Math.min(mapH - vh, cy))
    if (shake > 0) { cx += (Math.random() - 0.5) * 3; cy += (Math.random() - 0.5) * 3 }
    cx = Math.round(cx * Z) / Z; cy = Math.round(cy * Z) / Z
    const X = wx => Math.round((wx - cx) * Z), Y = wy => Math.round((wy - cy) * Z)
    W.clear(C.dark)

    // tiles
    const x0 = Math.floor(cx / TILE), y0 = Math.floor(cy / TILE), x1 = Math.ceil((cx + vw) / TILE), y1 = Math.ceil((cy + vh) / TILE)
    const hf = Math.floor(time * 3)
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      if (!F.in(x, y)) continue
      const i = F.i(x, y), sx = X(x * TILE), sy = Y(y * TILE), t = F.tile[i], T2 = TILE * Z
      if (t === WALL) {
        const faceUp = F.t(x, y + 1) !== WALL
        W.tile(faceUp ? tileSet.face : tileSet.top, (x * 7 + y * 3) & 1, sx, sy)
        if (!faceUp) {
          if (F.t(x - 1, y) !== WALL) W.rect(sx, sy, Z, T2, EDGE)
          if (F.t(x + 1, y) !== WALL) W.rect(sx + T2 - Z, sy, Z, T2, EDGE)
          if (F.t(x, y - 1) !== WALL) W.rect(sx, sy, T2, Z, EDGE)
        } else if (F.t(x, y - 1) !== WALL) W.rect(sx, sy, T2, Z, EDGE)
      } else if (t === HAZ) {
        W.tile(tileSet.haz, hf + x + y, sx, sy)
        // a darker lip where the hazard meets solid ground
        if (F.t(x, y - 1) !== HAZ) W.rect(sx, sy, T2, Math.ceil(3 * q), rgba(0, 0, 0, 90))
      } else {
        W.tile(tileSet.floor, F.variant[i], sx, sy)
        if (F.deco[i]) W.sprite(tileSet.deco, F.deco[i] - 1, sx, sy)
        if (F.t(x, y - 1) === WALL) { W.rect(sx, sy, T2, 6 * q, rgba(0, 0, 0, 70)); W.rect(sx, sy, T2, Math.ceil(3 * q), rgba(0, 0, 0, 50)) }
      }
    }
    if (stairsOpen) W.sprite(S.stairs, 0, X(F.stairs.x * TILE), Y(F.stairs.y * TILE))
    if (floor > 1) W.sprite(S.stairs_up, 0, X(F.start.x * TILE), Y(F.start.y * TILE))
    if (wp) W.sprite(S.waypoint, Math.floor(time * 2) % 2, X(wp.x), Y(wp.y))

    // slams to come: red rings on the ground
    for (const m of marks) {
      const k = 1 - Math.max(0, m.t) / m.d0
      W.ellipse(X(m.x), Y(m.y), m.r * Z * k, m.r * Z * k * 0.7, rgba(255, 60, 40, 60))
      W.ring(X(m.x), Y(m.y), m.r * Z, rgba(255, 70, 50, 210), m.r * Z * 0.7)
    }
    // the warning lines: where a charger or a swooper is about to go
    const warn = (o, len) => W.line(X(o.x), Y(o.y - 3), X(o.x + o.cdx * len), Y(o.y - 3 + o.cdy * len), rgba(255, 60, 50, 110 + Math.round(Math.sin(time * 12) * 30)), 3, 2)
    for (const m of monsters) if (!m.dead && m.st === 1 && m.tl && (m.d.ai === 'charger' || m.d.swoop)) warn(m, m.tl)
    if (boss && !boss.dead && (boss.st === 'wind' && boss.move === 'charge' || boss.telegraph)) {
      const p = nearest(boss.x, boss.y)
      if (p) { const dx = p.x - boss.x, dy = p.y - boss.y, l = Math.hypot(dx, dy) || 1; warn({ x: boss.x, y: boss.y, cdx: dx / l, cdy: dy / l }, 250) }
    }

    // everything standing up, back to front
    const list = []
    for (let y = y0 - 1; y <= y1 + 3; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!F.in(x, y)) continue
      const o = F.ob[F.i(x, y)]
      if (o) list.push([y * TILE + 15, 0, obSprites[o - 1], x * TILE + 8, y * TILE + 14, Math.floor(time * 4 + x)])
    }
    for (const c of F.chests) list.push([c.y * TILE + 14, 0, S.p_chest, c.x * TILE + 8, c.y * TILE + 13, opened.has(c.id) ? 1 : 0])
    if (F.stone) list.push([F.stone.y * TILE + 15, 0, S.p_lorestone, F.stone.x * TILE + 8, F.stone.y * TILE + 14, 0])
    for (const d of drops) list.push([d.y, 1, d])
    for (const m of monsters) if (!m.dead) list.push([m.y, 2, m])
    if (boss && !boss.dead && !boss.hidden) list.push([boss.y, 3, boss])
    for (const [id, o] of others) list.push([o.y, 4, o])
    if (!me.dead) list.push([me.y, 5, me])
    list.sort((a, b) => a[0] - b[0])
    for (const it of list) {
      if (it[1] === 0) { W.sprite(it[2], it[5], X(it[3]), Y(it[4])); continue }
      if (it[1] === 1) {
        const d = it[2], bob = Math.round(Math.abs(Math.sin(d.t * 4)) * 4)
        if (d.kind === 'item') {
          const c = RARITY_RGB[d.item.r]
          W.ellipse(X(d.x), Y(d.y) + 2 * q, 7 * q, 3 * q, rgba(c[0], c[1], c[2], 70))
          W.sprite(S['i_' + d.item.k + d.item.t], 0, X(d.x) - 8 * q, Y(d.y) - (14 + bob) * q)
          if (d.item.r >= 2 && Math.floor(time * 3 + d.x) % 4 === 0) W.dot(X(d.x) + 6 * q, Y(d.y) - (14 + bob) * q, rgba(255, 255, 255))
        } else W.sprite(d.kind === 'heart' ? S.heart : S.potion, 0, X(d.x), Y(d.y) - (4 + bob) * q)
        continue
      }
      if (it[1] === 2) {
        const m = it[2], s = S['m_' + m.kind]
        W.ellipse(X(m.x), Y(m.y + 3), m.r * Z, 4 * q, SHADOW)
        const flash = m.flash > 0 ? C.white : m.st === 1 && Math.floor(m.t * 12) % 2 ? rgba(255, 140, 140) : 0
        W.sprite(s, Math.floor(m.anim * (m.d.ai === 'flier' ? 10 : 6)), X(m.x), Y(m.y + 3), { flip: m.face < 0, flash })
        if (m.hp < m.maxHp) { const bw = 28 * q, bx = X(m.x) - bw / 2, by = Y(m.y) - (s ? s.ay - 4 * q : 30 * q); W.rect(bx, by, bw, Math.ceil(3 * q), C.hpBack); W.rect(bx, by, Math.ceil(bw * m.hp / m.maxHp), Math.ceil(3 * q), C.hp) }
        continue
      }
      if (it[1] === 3) {
        const b = it[2], s = S['b_' + b.kind]
        W.ellipse(X(b.x), Y(b.y + 3), (b.r + 6) * Z, 8 * q, SHADOW)
        const flash = b.flash > 0 ? C.white : (b.st === 'wind' || b.telegraph) && Math.floor(time * 10) % 2 ? rgba(255, 170, 170) : 0
        W.sprite(s, Math.floor(b.anim * 4), X(b.x), Y(b.y + 4), { flip: b.face < 0, flash, pal: b.phase === 2 && bossPal2 ? bossPal2 : undefined })
        continue
      }
      const p = it[2], mine = it[1] === 5
      if (p.dead) { W.ellipse(X(p.x), Y(p.y), 6 * q, 3 * q, rgba(180, 200, 255, 80)); W.ring(X(p.x), Y(p.y - 8), (6 + Math.sin(time * 4) * 2) * q, rgba(200, 220, 255, 150)); continue }
      W.ellipse(X(p.x), Y(p.y + 3), 9 * q, 4 * q, SHADOW)
      if (mine) {
        if (me.drawing) {
          // a faint line where the arrow will go, longer and brighter as the bow bends
          const k = me.draw / DRAW_T, a = me.aim, hx = me.x + Math.cos(a) * 8, hy = me.y - 7 + Math.sin(a) * 8
          W.line(X(hx), Y(hy), X(hx + Math.cos(a) * (26 + 70 * k)), Y(hy + Math.sin(a) * (26 + 70 * k)), rgba(255, 244, 214, Math.round(60 + 110 * k)), 3)
        }
        drawKnight(W, me, X(me.x), Y(me.y + 3), hero.look, hero.armor?.t || 0, true)
        if (me.dashCd > 0) {
          // the roll coming back: a light grey bar under the feet, gone when it is ready
          const w = 14 * Z, bx = X(me.x) - w / 2, by = Y(me.y + 7)
          W.rect(bx - 1, by - 1, w + 2, Z + 2, rgba(20, 18, 26, 150))
          W.rect(bx, by, Math.round(w * (1 - me.dashCd / ROLL_CD)), Z, rgba(208, 208, 214, 230))
        }
      }
      else if (p.look) drawKnight(W, p, X(p.x), Y(p.y + 3), p.look, p.at || 0, false)
    }
    // stars circling the dazed
    const stars = (o, top) => { for (let k = 0; k < 3; k++) { const a = time * 6 + k * 2.1; W.rect(X(o.x + Math.cos(a) * 7) - q, Y(o.y - top + Math.sin(a) * 2.5) - q, Z, Z, rgba(255, 236, 120)) } }
    for (const m of monsters) if (!m.dead && m.st === 3 && m.d.ai === 'charger') stars(m, 20)
    if (boss && !boss.dead && !boss.hidden && (boss.st === 'stunned' || boss.dazed)) stars(boss, boss.r * 2 + 18)
    // shots on top
    for (const s of shots) W.sprite(S[s.spr], 0, X(s.x), Y(s.y))
    for (const s of myShots) {
      if (S[s.spr]) W.spriteRot(S[s.spr], 0, X(s.x), Y(s.y), Math.atan2(s.vy, s.vx))
    }
    if (boss && boss.hidden && !boss.dead) { W.ellipse(X(boss.mx), Y(boss.my), 20 * q, 8 * q, rgba(120, 90, 60, 160)); W.ring(X(boss.mx), Y(boss.my), (24 + Math.sin(time * 10) * 4) * q, rgba(255, 220, 140, 160), 12 * q) }
    for (const e of effects) {
      const f = e.frames ? Math.min(e.frames - 1, Math.floor(e.t / e.dur * e.frames)) : Math.min(e.s.frames.length - 1, Math.floor(e.t / e.dur * e.s.frames.length))
      if (e.rot) W.spriteRot(e.s, f, X(e.x), Y(e.y), e.angle)
      else W.sprite(e.s, f, X(e.x), Y(e.y))
    }
    for (const p of parts) {
      const a = 1 - p.t / p.life
      const c = p.glow ? ((p.c & 0xffffff) | 0x80000000) >>> 0 : p.c
      if (p.streak) W.rect(X(p.x), Y(p.y), 6 * q, 1, c)
      else if (p.size > 1) W.rect(X(p.x), Y(p.y), Z, Z, c)
      else W.dot(X(p.x), Y(p.y), a > 0.3 ? c : rgba((c & 255), (c >> 8) & 255, (c >> 16) & 255, 120))
    }

    // light
    if (land.ambient < 1) {
      D.lightBegin(land.ambient, land.tint)
      const fl = 1 + Math.sin(time * 9) * 0.04 + Math.sin(time * 23) * 0.03
      for (const p of alivePlayers()) D.light(X(p.x), Y(p.y - 6), land.lantern * Z * fl, 255, 226, 170, 1.45)
      for (const l of F.lights) { const lx = X(l[0]), ly = Y(l[1]); if (lx > -200 && ly > -200 && lx < W.W + 200 && ly < W.H + 200) D.light(lx, ly, l[5] * Z, l[2], l[3], l[4], 1) }
      if (land.hazard === 'burn') for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (F.t(x, y) === HAZ && (x + y) % 2 === 0) D.light(X(x * TILE + 8), Y(y * TILE + 8), 34 * Z, 255, 110, 40, 0.8)
      if (stairsOpen) D.light(X(F.stairs.x * TILE + 8), Y(F.stairs.y * TILE + 8), 30 * Z, 160, 200, 255, 0.6)
      if (floor > 1) D.light(X(F.start.x * TILE + 8), Y(F.start.y * TILE + 8), 26 * Z, 255, 220, 150, 0.5)
      if (wp) D.light(X(wp.x), Y(wp.y), 40 * Z, 110, 200, 255, 0.9)
      if (F.stone && !stoneRead) D.light(X(F.stone.x * TILE + 8), Y(F.stone.y * TILE + 6), 36 * Z, 120, 220, 255, 0.8)
      if (fx === 2) {
        for (const s of shots) { const c = SHOT_LIGHT[s.spr]; if (c) D.light(X(s.x), Y(s.y), 22 * Z, c[0], c[1], c[2], 0.7) }
        for (const s of myShots) if (s.spr === 'marrow') D.light(X(s.x), Y(s.y), 24 * Z, 170, 160, 255, 0.8)
        for (const d of drops) if (d.kind === 'item' && d.item.r >= 2) { const c = RARITY_RGB[d.item.r]; D.light(X(d.x), Y(d.y - 4), 18 * Z, c[0], c[1], c[2], 0.5) }
      }
      if (boss && !boss.dead && !boss.hidden) D.light(X(boss.x), Y(boss.y - 12), 60 * Z, 255, 140, 120, 0.5)
    } else D.lightOff()

    // numbers float on the HUD layer
    const k = U.W / W.W                              // world pixels to HUD pixels
    for (const t of texts) U.text(t.text, X(t.x) * k, Math.round(Y(t.y) * k), t.color, { align: 'center' })
    return { cx, cy, Z }
  }

  return {
    F, me, hero, monsters, shots, marks, drops, get boss() { return boss }, others, floor, land, li, waypoint: wp, get diffName() { return D_().name },
    update, draw, onNet, forget, snapshot, restat, setQuality, get stats() { return st },
    get reading() { return reading }, get banner() { return banner }, get bossIntro() { return bossIntro }, get stairsOpen() { return stairsOpen },
    revive() { if (me.dead) { me.dead = false; hero.hp = Math.round(st.maxHp * 0.5); me.inv = 2 } },
  }
}
