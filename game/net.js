// Co-op: a party of knights on the same floor. Shared state:
//   'pm:<id>' { name, cp, lv, t }      a player waiting in, or playing in, the party
//   'party'   { leader, members, floor, run, phase: 'play' | 'won' }   written by the leader only
// The leader runs the monsters and sends what they do; members send their hits to the leader. Every message
// carries the party's run number (one per floor), so nothing from an older floor is ever applied.
const stateGet = (st, k) => st instanceof Map ? st.get(k) : st?.[k]
const stateEntries = st => st instanceof Map ? [...st.entries()] : Object.entries(st || {})
const same = (a, b) => a != null && b != null && String(a) === String(b)

export function createParty(p0, { palOf }) {
  let joined = false, joinedAt = 0
  const handlers = { start: null, msg: null, won: null }
  const me = () => p0.me.id
  const present = () => new Set(Array.from(p0.room.players ?? p0.players.keys()).map(String))

  function lobby() {
    const here = present()
    return stateEntries(p0.room.state)
      .filter(([k, v]) => k.startsWith('pm:') && v && here.has(k.slice(3)))
      .map(([k, v]) => ({ id: k.slice(3), ...v }))
      .sort((a, b) => a.t - b.t || (a.id < b.id ? -1 : 1))
  }
  const party = () => stateGet(p0.room.state, 'party')
  // the leader: the party's own, while they are here; else whoever has waited longest
  function leaderId() {
    const pt = party(), here = present()
    if (pt && pt.phase === 'play') {
      if (here.has(String(pt.leader))) return String(pt.leader)
      const left = (pt.members || []).map(String).filter(id => here.has(id))
      const pm = lobby().map(e => e.id).filter(id => left.includes(id))
      return pm[0] ?? left[0] ?? null
    }
    return lobby()[0]?.id ?? null
  }
  const isLeader = () => same(leaderId(), me())
  const inParty = () => { const pt = party(); return !!pt && pt.phase === 'play' && (pt.members || []).some(id => same(id, me())) }

  function join(cp, lv) {
    joined = true; joinedAt = Date.now()
    p0.room.set('pm:' + me(), { name: String(p0.me.name || 'KNIGHT').slice(0, 16), cp, lv, t: joinedAt })
  }
  function leave() {
    joined = false
    p0.room.set('pm:' + me(), null)
    if (isLeaderOfRunning()) {
      const pt = party(), rest = (pt.members || []).filter(id => !same(id, me()))
      p0.room.set('party', rest.length ? { ...pt, members: rest, leader: rest[0] } : null)
    }
  }
  const isLeaderOfRunning = () => { const pt = party(); return pt && pt.phase === 'play' && isLeader() }

  // the leader starts the party, moves it down a floor, or back to the checkpoint
  function begin(floor) {
    const members = lobby().map(e => e.id)
    p0.room.set('party', { leader: String(me()), members, floor, arrive: 'start', run: (party()?.run || 0) + 1, phase: 'play' })
  }
  function goTo(floor, arrive = 'start') {
    const pt = party(); if (!pt) return
    const here = present()
    const members = [...new Set([...(pt.members || []).map(String).filter(id => here.has(id)), ...lobby().map(e => e.id)])]
    p0.room.set('party', { ...pt, leader: String(me()), members, floor, arrive, run: pt.run + 1 })
  }
  function won() { const pt = party(); if (pt) p0.room.set('party', { ...pt, phase: 'won' }) }
  function disband() { p0.room.set('party', null) }

  // incoming
  let lastRun = 0
  p0.on('state', (key, value) => {
    if (key !== 'party') return
    if (!value) { lastRun = 0; return }
    if (value.phase === 'won' && joined) { handlers.won?.(); return }
    if (value.phase === 'play' && value.run !== lastRun && (value.members || []).some(id => same(id, me()))) {
      lastRun = value.run
      handlers.start?.(value.floor, value.run, value.arrive === 'stairs' ? 'stairs' : 'start')
    }
  })
  p0.on('message', (msg, from) => {
    if (!msg || msg._run !== lastRun || !inParty()) return
    if (!(party()?.members || []).some(id => same(id, from))) return       // only the party's own knights
    handlers.msg?.(msg, String(from))
  })
  // a member who left: tidy their waiting entry (the leader does it)
  p0.on('leave', p => { const id = String(p?.id ?? p); if (isLeader()) p0.room.set('pm:' + id, null) })

  // what a run uses to talk
  const link = {
    get auth() { return isLeader() },
    send(msg) { msg._run = lastRun; p0.room.send(msg) },
    toLeader(msg) { msg._run = lastRun; const l = leaderId(), id = [...p0.players.keys()].find(k => same(k, l)); if (id != null) p0.room.sendTo(id, msg) },
    nameOf(id) { return String([...p0.players.values()].find(p => same(p.id, id))?.name || 'KNIGHT') },
    palOf(id) { return palOf([...p0.players.values()].find(p => same(p.id, id))?.color) },
  }

  return {
    join, leave, begin, goTo, won, disband, lobby, leaderId, isLeader, inParty, link, handlers,
    get joined() { return joined }, party, present,
    // the floor a new party starts on: the lowest checkpoint anyone in it has reached
    startFloor() { const l = lobby(); return l.length ? Math.min(...l.map(e => e.cp || 1)) : 1 },
    reset() { lastRun = 0; joined = false },
  }
}
