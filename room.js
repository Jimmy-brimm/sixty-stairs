// Co-op on the Claude page: Project 0's room (shared keys, messages to all or to one) built on the room
// capability's presence, which everyone with the page open can set and everyone receives (no send rights needed).
//
// My presence: { pm, party: { n, v }, me: [seq, msg], ms: [[seq, to, msg], ...], cls }
//   pm     my lobby entry ('pm:<my id>' in the shared state)
//   party  the party, as its last writer left it; n is a counter one past the highest seen, so the newest write wins
//   me     my latest 'me' message (where I am): only the newest matters
//   ms     my recent other messages (the leader's snapshots, hits for the leader), numbered, the oldest dropped to
//          keep the whole presence under its 4 KiB; a reader takes those past the last number it saw
// A player's id is their peer label (one per open page). Names come from the user capability, never from presence.
const LIMIT = 3800             // bytes of presence JSON (the platform's cap is 4096)
const KEEP_MS = 700            // how long a message stays in the queue

export function attachRoom(p0, room, { user = null, fire }) {
  const myId = room.peers().find(p => p.sameTab).peer
  p0.me.id = myId
  const mine = { pm: null, party: null, me: null, ms: [] }
  const sentAt = []            // when each queued message went in (local only)
  let seq = 0, dirty = true
  let state = {}, ids = [myId], lastPeers = null
  const lastSeq = new Map(), lastMe = new Map(), names = new Map(), asked = new Set()

  const viewers = peers => peers.filter(p => p.kind === 'viewer')
  const partyOf = pres => pres?.party && typeof pres.party.n === 'number' ? pres.party : null
  function topParty(peers) {
    let best = partyOf(mine)
    for (const p of peers) if (!p.sameTab) { const q = partyOf(p.presence); if (q && (!best || q.n > best.n)) best = q }
    return best
  }
  function mergedState(peers) {
    const out = {}
    if (mine.pm) out['pm:' + myId] = mine.pm
    for (const p of peers) if (!p.sameTab && p.presence?.pm) out['pm:' + p.peer] = p.presence.pm
    const pt = topParty(peers)
    if (pt?.v) out.party = pt.v
    return out
  }
  // the shared state changed (by me or by someone): tell the game which keys
  function restate(peers) {
    const next = mergedState(peers), prev = state
    state = next                                   // first, so the game reads the new state when told
    for (const k of new Set([...Object.keys(prev), ...Object.keys(next)])) {
      if (JSON.stringify(prev[k] ?? null) !== JSON.stringify(next[k] ?? null)) fire('state', k, next[k] ?? null)
    }
  }

  // a Claude name where there is one; else the class and two letters of the peer label, so two knights differ
  function nameOf(p) { return (p.by && names.get(p.by)) || (p.presence?.cls ? String(p.presence.cls) : 'KNIGHT') + ' ' + String(p.peer).slice(0, 2).toUpperCase() }
  function resolveNames(peers) {
    if (!user?.profiles) return
    const want = peers.map(p => p.by).filter(by => by && !asked.has(by))
    if (!want.length) return
    want.forEach(by => asked.add(by))
    user.profiles(want).then(ps => { for (const by of want) { const n = ps?.[by]?.name; if (n) names.set(by, String(n).slice(0, 16).toUpperCase()) } refreshPlayers(lastPeers || []) }).catch(() => {})
  }
  function refreshPlayers(peers) {
    p0.players.clear()
    for (const p of viewers(peers)) p0.players.set(p.peer, { id: p.peer, name: p.sameTab ? (p0.me.name || nameOf(p)) : nameOf(p), color: null })
    if (!p0.players.has(myId)) p0.players.set(myId, p0.me)
  }

  // ---- reading: once a frame, if the room changed
  function receive() {
    const peers = viewers(room.peers())
    if (peers === lastPeers || (lastPeers && peers.length === lastPeers.length && peers.every((p, i) => p === lastPeers[i]))) return
    lastPeers = peers
    const now = peers.map(p => p.peer)
    if (!now.includes(myId)) now.push(myId)
    const left = ids.filter(id => !now.includes(id))
    ids = now
    resolveNames(peers)
    refreshPlayers(peers)
    restate(peers)
    for (const p of peers) {
      if (p.sameTab) continue
      const pres = p.presence || {}
      if (Array.isArray(pres.me) && pres.me[0] !== lastMe.get(p.peer)) { lastMe.set(p.peer, pres.me[0]); fire('message', pres.me[1], p.peer) }
      const ms = Array.isArray(pres.ms) ? pres.ms : []
      if (!lastSeq.has(p.peer)) { lastSeq.set(p.peer, ms.length ? ms[ms.length - 1][0] : 0); continue }     // first sight: no replays
      let last = lastSeq.get(p.peer)
      for (const e of ms) {
        if (!Array.isArray(e) || e[0] <= last) continue
        last = e[0]
        if (e[1] === null || e[1] === myId) fire('message', e[2], p.peer)
      }
      lastSeq.set(p.peer, last)
    }
    for (const id of left) { lastSeq.delete(id); lastMe.delete(id); fire('leave', { id }) }
  }

  // ---- writing: everything goes into my presence, sent once a frame
  function queue(to, msg) {
    mine.ms.push([++seq, to, msg]); sentAt.push(Date.now()); dirty = true
  }
  function flush() {
    const t = Date.now()
    while (sentAt.length && t - sentAt[0] > KEEP_MS) { sentAt.shift(); mine.ms.shift(); dirty = true }
    if (!dirty) return
    let text = JSON.stringify(mine)
    while (text.length > LIMIT && mine.ms.length) { mine.ms.shift(); sentAt.shift(); text = JSON.stringify(mine) }
    if (text.length > LIMIT) { mine.me = null; text = JSON.stringify(mine) }
    dirty = false
    room.presence({ ...mine }).catch(() => {})
  }

  p0.room = {
    get players() { return ids },
    get state() { return state },
    isHost: true,
    set(key, value) {
      if (key === 'pm:' + myId) mine.pm = value ?? null
      else if (key === 'party') {
        let n = 0
        for (const p of lastPeers || []) { const q = partyOf(p.presence); if (q) n = Math.max(n, q.n) }
        n = Math.max(n, partyOf(mine)?.n || 0) + 1
        mine.party = { n, v: value ?? null }
      } else return                                  // others' entries leave with them
      dirty = true
      restate(lastPeers || [])
    },
    send(msg) { if (msg?.k === 'me') { mine.me = [++seq, msg]; dirty = true } else queue(null, msg) },
    sendTo(id, msg) { if (String(id) !== myId) queue(String(id), msg) },
  }
  p0.setClass = cls => { if (mine.cls !== cls) { mine.cls = cls; dirty = true } }
  refreshPlayers(viewers(room.peers()))
  return { receive, flush }
}
