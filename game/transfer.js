// A save file as a short code a player can type: for Project 0, whose sandbox has no clipboard and no text box.
// It holds one save file's hero (class, level, xp, stats, points, potions, looks, the weapon and armour in hand)
// and progress (floors, lore, lords, ending, difficulty), packed into bits and written in Crockford's base 32
// (no I, L, O or U), with a check so a mistyped code is caught. The bag is left behind: it would not fit.
import { HEADS, SKINS, HAIRS, CLOTHS, CLASSES, DIFF_ORDER, makeItem } from './items.js'
import { STONES } from './lore.js'

const ABC = '0123456789ABCDEFGHJKMNPQRSTVWXYZ'
const CLS = Object.keys(CLASSES)
const KINDS = ['sword', 'spear', 'axe', 'bow', 'staff', 'armor']
const AFF = ['dmg', 'spd', 'crit', 'cdmg', 'leech', 'hp', 'xp']
const STONE_FLOORS = Object.keys(STONES).map(Number).sort((a, b) => a - b)
const VERSION = 1

function writer() {
  const bits = []
  const put = (v, n) => { v = Math.max(0, Math.min((1 << n) - 1, Math.round(v) || 0)); for (let i = n - 1; i >= 0; i--) bits.push((v >> i) & 1) }
  return { put, bits }
}
function reader(bits) {
  let at = 0
  return { get(n) { let v = 0; for (let i = 0; i < n; i++) v = v * 2 + (bits[at++] || 0); return v }, get left() { return bits.length - at } }
}
const check = bits => { let a = 7, b = 3; for (const x of bits) { a = (a * 31 + x + 1) % 1021; b = (b + a) % 1021 } return (a ^ b) & 1023 }   // 10 bits

const putItem = (w, it, armor) => {
  const k = armor ? 5 : Math.max(0, KINDS.indexOf(it?.k))
  w.put(k, 3); w.put(it?.t || 0, 3); w.put(it?.r || 0, 3)
  const a = (it?.a || []).slice(0, 4)
  w.put(a.length, 3)
  for (const [key, v] of a) { w.put(Math.max(0, AFF.indexOf(key)), 3); w.put(v, 8) }
}
const getItem = r => {
  const k = KINDS[r.get(3)] || 'sword', t = Math.min(5, r.get(3)), rar = Math.min(4, r.get(3)), n = Math.min(4, r.get(3)), a = []
  for (let i = 0; i < n; i++) { const key = AFF[r.get(3)] || 'dmg'; a.push([key, r.get(8)]) }
  return makeItem(k, t, rar, a)
}
const idx = (list, v) => { const i = list.indexOf(v); return i < 0 ? 15 : i }

// a save file -> its code, in groups of five
export function encodeSlot(sl) {
  const h = sl?.hero
  if (!h) return null
  const w = writer()
  w.put(VERSION, 3)
  w.put(Math.max(0, CLS.indexOf(h.cls)), 2); w.put(h.level - 1, 7); w.put(h.xp, 14); w.put(h.points, 9)
  for (const s of ['str', 'dex', 'vit', 'int']) w.put(h[s], 9)
  w.put(h.potions, 4)
  w.put(idx(HEADS, h.look?.head), 4); w.put(idx(SKINS, h.look?.skin), 4); w.put(idx(HAIRS, h.look?.hair), 4)
  w.put(idx(CLOTHS, h.look?.cloak), 4); w.put(idx(CLOTHS, h.look?.trim), 4)
  putItem(w, h.weapon, false); putItem(w, h.armor, true)
  w.put(sl.cp, 6); w.put(sl.deepest, 6)
  for (const f of STONE_FLOORS) w.put(sl.lore?.includes(f) ? 1 : 0, 1)
  for (let i = 0; i < 6; i++) w.put(sl.bosses?.includes(i) ? 1 : 0, 1)
  for (let i = 0; i < 6; i++) w.put(sl.lands?.includes(i) ? 1 : 0, 1)
  w.put(sl.won ? 1 : 0, 1); w.put(sl.wonNoHit ? 1 : 0, 1); w.put(sl.prologue ? 1 : 0, 1)
  w.put(Math.max(0, DIFF_ORDER.indexOf(sl.diff || 'normal')), 3); w.put(sl.nohitSince || 0, 6)
  while (w.bits.length % 5) w.bits.push(0)
  const c = check(w.bits)
  for (let i = 9; i >= 0; i--) w.bits.push((c >> i) & 1)
  let out = ''
  for (let i = 0; i < w.bits.length; i += 5) out += ABC[parseInt(w.bits.slice(i, i + 5).join(''), 2)]
  return out.match(/.{1,5}/g).join('-')
}

// a typed code -> { slot } or { error }; forgiving about case, dashes, spaces, and O/0, I/L/1
export const cleanCode = text => String(text || '').toUpperCase().replace(/[O]/g, '0').replace(/[IL]/g, '1').replace(/[^0-9A-Z]/g, '')
export function decodeSlot(text) {
  const t = cleanCode(text)
  if (t.length < 20) return { error: 'TOO SHORT' }
  const bits = []
  for (const ch of t) { const v = ABC.indexOf(ch); if (v < 0) return { error: 'NOT A CODE: ' + ch }; for (let i = 4; i >= 0; i--) bits.push((v >> i) & 1) }
  const body = bits.slice(0, -10), sum = bits.slice(-10).reduce((a, b) => a * 2 + b, 0)
  if (check(body) !== sum) return { error: 'A LETTER IS WRONG: CHECK THE CODE' }
  const r = reader(body)
  if (r.get(3) !== VERSION) return { error: 'A CODE FROM ANOTHER VERSION' }
  const cls = CLS[r.get(2)] || 'knight', c = CLASSES[cls]
  const hero = { v: 2, cls, level: r.get(7) + 1, xp: r.get(14), points: r.get(9), hp: 1 }
  for (const s of ['str', 'dex', 'vit', 'int']) hero[s] = r.get(9)
  hero.potions = r.get(4)
  const pick = (list, i, d) => list[i] ?? d
  hero.look = { outfit: c.outfit, head: pick(HEADS, r.get(4), c.head), skin: pick(SKINS, r.get(4), SKINS[1]), hair: pick(HAIRS, r.get(4), HAIRS[0]), cloak: pick(CLOTHS, r.get(4), CLOTHS[0]), trim: pick(CLOTHS, r.get(4), CLOTHS[1]) }
  hero.weapon = getItem(r); hero.armor = getItem(r); hero.bag = []
  if (hero.armor.k !== 'armor') hero.armor = makeItem('armor', hero.armor.t, hero.armor.r, hero.armor.a)
  const slot = { hero, cp: Math.max(1, r.get(6)), deepest: Math.max(1, r.get(6)), lore: [], bosses: [], lands: [], deaths: 0, map: 0 }
  for (const f of STONE_FLOORS) if (r.get(1)) slot.lore.push(f)
  for (let i = 0; i < 6; i++) if (r.get(1)) slot.bosses.push(i)
  for (let i = 0; i < 6; i++) if (r.get(1)) slot.lands.push(i)
  slot.won = !!r.get(1); slot.wonNoHit = !!r.get(1); slot.prologue = !!r.get(1)
  slot.diff = DIFF_ORDER[r.get(3)] || 'normal'
  const since = r.get(6); slot.nohitSince = slot.diff === 'nohit' && since ? since : null
  if (r.left < 0) return { error: 'TOO SHORT' }
  return { slot }
}
