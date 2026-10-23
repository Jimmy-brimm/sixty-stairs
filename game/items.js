// Gear and stats. Five kinds of weapon that fight differently, armour, five rarities with random bonuses, and the
// four stats a knight spends points on (three every level).

export const KIND = {
  sword: { mult: 1.0, cd: 0.34, reach: 15, arc: 1.15, stat: 'str', knock: 1.0, swing: 0.22, desc: 'A FAST ARC IN FRONT OF YOU' },
  spear: { mult: 1.05, cd: 0.44, reach: 30, arc: 0.22, stat: 'strdex', knock: 0.8, swing: 0.2, thrust: true, desc: 'A LONG, NARROW THRUST' },
  axe:   { mult: 1.55, cd: 0.64, reach: 17, arc: 1.7, stat: 'str', knock: 1.8, swing: 0.3, desc: 'A WIDE, SLOW, HEAVY SWEEP' },
  bow:   { mult: 1.2, cd: 0.44, speed: 250, stat: 'dex', shot: 'arrow', desc: 'ARROWS, FROM AFAR' },
  staff: { mult: 1.3, cd: 0.56, speed: 190, stat: 'int', shot: 'marrow', homing: true, pierce: 1, desc: 'MAGIC ARROWS THAT SEEK AND PIERCE' },
}
export const WEAPON_KINDS = ['sword', 'spear', 'axe', 'bow', 'staff']
export const TIER_DMG = [9, 20, 36, 56, 80, 110]
export const TIER_DEF = [2, 6, 11, 17, 24, 32]
export const RARITY = ['COMMON', 'UNCOMMON', 'RARE', 'EPIC', 'LEGENDARY']
export const RARITY_MULT = [1, 1.12, 1.26, 1.42, 1.62]
const TIER_NAME = ['RUSTED', 'PLAINSTEEL', 'THORNWOOD', 'SUNFORGED', 'MAGMASTEEL', 'LANTERN']
const ARMOR_NAME = ['TUNIC', 'CHAINMAIL', 'BARKPLATE', 'SANDSCALE', 'OBSIDIAN PLATE', 'AEGIS']
export const TIER_METAL = ['#aa6e46', '#b0b4c4', '#78ac52', '#f0c85a', '#604078', '#ecf0ff']

// bonuses: [prefix for the name, low, high, what it says]
export const AFFIX = {
  dmg:   ['BRUTAL', 5, 15, '% DAMAGE'],
  spd:   ['SWIFT', 4, 12, '% ATTACK SPEED'],
  crit:  ['KEEN', 3, 8, '% CRIT CHANCE'],
  cdmg:  ['SAVAGE', 15, 40, '% CRIT DAMAGE'],
  leech: ['VAMPIRIC', 1, 3, '% LIFE STEAL'],
  hp:    ['HEARTY', 8, 20, ' MAX HEALTH'],      // times (tier + 1)
  xp:    ['WISE', 5, 15, '% XP'],
}
const WEAPON_AFFIX = ['dmg', 'spd', 'crit', 'cdmg', 'leech', 'xp']
const ARMOR_AFFIX = ['hp', 'hp', 'dmg', 'spd', 'crit', 'xp']

export const CLASSES = {
  knight: { name: 'KNIGHT', stats: { str: 6, dex: 3, vit: 6, int: 2 }, weapon: 'sword', outfit: 'plate', head: 'visor', desc: 'SWORD AND PLATE. TOUGH AND STEADY.' },
  ranger: { name: 'RANGER', stats: { str: 3, dex: 7, vit: 4, int: 3 }, weapon: 'bow', outfit: 'leather', head: 'hood', desc: 'BOW AND LEATHER. QUICK, AND DEADLY FROM AFAR.' },
  mage:   { name: 'MAGE', stats: { str: 2, dex: 3, vit: 4, int: 8 }, weapon: 'staff', outfit: 'robe', head: 'hat', desc: 'STAFF AND ROBE. MAGIC ARROWS THAT FIND THEIR MARK.' },
}
export const HEADS = ['short', 'long', 'pony', 'visor', 'horned', 'hood', 'hat']
export const SKINS = ['#f2c8a0', '#e8b488', '#c98e62', '#a06a44', '#6e4630', '#8cb070']
export const HAIRS = ['#704226', '#3a2a22', '#e6c062', '#b0442c', '#e8e4dc', '#5c6c8c', '#a04cb0', '#2e6a44']
export const CLOTHS = ['#ba2a34', '#3a58aa', '#3c7a3c', '#6c3c96', '#d08a28', '#2a8a8a', '#d8d4cc', '#2a2430', '#b84a86', '#8a6a44']
export const STAT_INFO = {
  str: 'STRENGTH: SWORD, AXE AND SPEAR DAMAGE',
  dex: 'DEXTERITY: BOW DAMAGE, ATTACK SPEED, CRITS',
  vit: 'VITALITY: MAX HEALTH',
  int: 'INTELLECT: STAFF DAMAGE, POTION HEALING',
}

let nextId = Date.now() % 1e6
export function makeItem(k, t, r, affixes = []) { return { k, t, r, a: affixes, id: nextId++ } }

// a random piece of loot: kind (or any), tier, and how lucky (deeper floors find better things)
export function rollItem(rand, { kind = null, tier = 0, luck = 0, minRarity = 0 } = {}) {
  const k = kind || (rand() < 0.3 ? 'armor' : WEAPON_KINDS[Math.floor(rand() * WEAPON_KINDS.length)])
  const w = [60 - 30 * luck, 25, 10 + 10 * luck, 4 + 8 * luck, 1 + 4 * luck]
  let roll = rand() * w.reduce((a, b) => a + b, 0), r = 0
  while (roll > w[r] && r < 4) { roll -= w[r]; r++ }
  r = Math.max(r, minRarity)
  const pool = k === 'armor' ? ARMOR_AFFIX : WEAPON_AFFIX, a = [], used = new Set()
  for (let i = 0; i < r; i++) {
    let key = pool[Math.floor(rand() * pool.length)]
    if (used.has(key)) key = pool.find(p => !used.has(p)) || key
    used.add(key)
    const [, lo, hi] = AFFIX[key]
    let v = Math.round(lo + rand() * (hi - lo))
    if (key === 'hp') v *= tier + 1
    a.push([key, v])
  }
  return makeItem(k, tier, r, a)
}

export function itemName(it) {
  if (!it) return ''
  const best = it.a.slice().sort((x, y) => AFFIX[y[0]][2] - AFFIX[x[0]][2])[0]
  const pre = best ? AFFIX[best[0]][0] + ' ' : ''
  const noun = it.k === 'armor' ? ARMOR_NAME[it.t] : TIER_NAME[it.t] + ' ' + it.k.toUpperCase()
  return pre + noun + (it.r === 4 ? ' OF THE LANTERN' : '')
}
export function itemLines(it) {
  if (!it) return []
  const out = [RARITY[it.r] + (it.k === 'armor' ? ' ARMOUR' : ' ' + it.k.toUpperCase())]
  if (it.k === 'armor') out.push(Math.round(TIER_DEF[it.t] * RARITY_MULT[it.r]) + ' DEFENCE')
  else out.push(Math.round(TIER_DMG[it.t] * RARITY_MULT[it.r] * KIND[it.k].mult) + ' BASE DAMAGE  ' + KIND[it.k].desc)
  for (const [key, v] of it.a) out.push('+' + v + AFFIX[key][3])
  return out
}
// how good, roughly, to compare at a glance
export function itemPower(it) {
  if (!it) return 0
  const base = it.k === 'armor' ? TIER_DEF[it.t] * 3 : TIER_DMG[it.t] * KIND[it.k].mult
  return base * RARITY_MULT[it.r] + it.a.reduce((s, [k, v]) => s + (k === 'hp' ? v / 4 : v / 2), 0)
}

// ---- the knight's numbers, all from the level, the four stats and the gear
// slower than it was (22 + 14 per level)
export const xpNeed = level => Math.round(50 + 25 * level + 0.6 * level * level)
export const POINTS_PER_LEVEL = 3

// how hard the way down is: monsters' health (hp), the damage you take (dmg), how fast they move, the lords'
// health on top (boss). No Hit: any hit fells you; the Keep (51-60) all on No Hit earns its own ending.
export const DIFFICULTY = {
  story:     { name: 'STORY',     hp: 0.7,  dmg: 0.55, speed: 0.92, boss: 0.8,  desc: 'FOR THE TALE: GENTLE FOES.' },
  normal:    { name: 'NORMAL',    hp: 1.15, dmg: 1.1,  speed: 1,    boss: 0.9,  desc: 'THE WAY DOWN AS IT WAS MEANT.' },
  hard:      { name: 'HARD',      hp: 1.3,  dmg: 1.35, speed: 1.06, boss: 0.9,  desc: 'TOUGHER, FASTER, CRUELLER FOES.' },
  nightmare: { name: 'NIGHTMARE', hp: 1.6,  dmg: 1.7,  speed: 1.12, boss: 1,    desc: 'FOR THOSE WHO KNOW EVERY STAIR.' },
  nohit:     { name: 'NO HIT',    hp: 1.15, dmg: 1.1,  speed: 1,    boss: 0.9,  noHit: true, desc: 'ONE HIT AND YOU FALL. CLEAR THE KEEP UNTOUCHED FOR ANOTHER ENDING.' },
}
export const DIFF_ORDER = ['story', 'normal', 'hard', 'nightmare', 'nohit']
export function newHero(cls = 'knight', look = null) {
  const c = CLASSES[cls]
  return {
    v: 2, cls, level: 1, xp: 0, points: 0, potions: 2, ...c.stats, hp: 1,
    look: look || { outfit: c.outfit, head: c.head, skin: SKINS[1], hair: HAIRS[0], cloak: CLOTHS[0], trim: CLOTHS[1] },
    weapon: makeItem(c.weapon, 0, 0), armor: makeItem('armor', 0, 0), bag: [],
  }
}
export function heroStats(h) {
  const aff = { dmg: 0, spd: 0, crit: 0, cdmg: 0, leech: 0, hp: 0, xp: 0 }
  for (const it of [h.weapon, h.armor]) if (it) for (const [k, v] of it.a) aff[k] += v
  const w = h.weapon || makeItem('sword', 0, 0), kd = KIND[w.k]
  const sv = kd.stat === 'str' ? h.str : kd.stat === 'dex' ? h.dex : kd.stat === 'int' ? h.int : (h.str + h.dex) / 2
  const base = TIER_DMG[w.t] * RARITY_MULT[w.r] * kd.mult
  return {
    maxHp: Math.round(35 + h.vit * 12 + h.level * 8 + aff.hp),
    def: h.armor ? Math.round(TIER_DEF[h.armor.t] * RARITY_MULT[h.armor.r]) : 0,
    dmg: Math.max(1, Math.round(base * (1 + sv * 0.03) * (1 + aff.dmg / 100))),
    cd: kd.cd / (1 + h.dex * 0.006 + aff.spd / 100),
    crit: Math.min(0.6, 0.05 + h.dex * 0.004 + aff.crit / 100),
    critMul: 1.6 + aff.cdmg / 100,
    leech: aff.leech / 100, xpMul: 1 + aff.xp / 100,
    heal: Math.min(0.6, 0.3 + h.int * 0.008),
    kind: w.k, k: kd, tier: w.t,
  }
}
// spend the points a bot (or "auto") would: by the class's leaning
export function autoSpend(h) {
  const lean = { knight: ['str', 'vit', 'str', 'dex'], ranger: ['dex', 'dex', 'vit', 'str'], mage: ['int', 'int', 'vit', 'dex'] }[h.cls] || ['str', 'vit', 'dex']
  let i = 0
  while (h.points > 0) { h[lean[i++ % lean.length]]++; h.points-- }
}
