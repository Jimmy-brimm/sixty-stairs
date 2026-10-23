// The room on the website: what room.js needs from Claude's room capability (peers(), presence(), onPeers(),
// onConnection()), built on Trystero: the players' browsers connect to each other directly (WebRTC) and find each
// other through public Nostr relays, so there is no server of our own and no account. Everyone in the same room
// name sees everyone else: 'lobby' by default, or ?party=<name> for a private one.
import { joinRoom, selfId } from './trystero-nostr.js'

export function webRoom(name = 'lobby') {
  const room = joinRoom({ appId: 'sixty-stairs-pixel-dungeon' }, name)
  const [sendPres, getPres] = room.makeAction('pres')
  let mine = {}
  const others = new Map()                 // peer -> presence
  let snap = Object.freeze([]), peerFns = []
  const peer = (id, presence, self) => Object.freeze({ peer: id, by: null, isMe: self, sameTab: self, kind: 'viewer', guest: false, presence: Object.freeze(presence || {}), updatedAt: Date.now() })
  const frozen = new Map()
  const rebuild = () => {
    snap = Object.freeze([peer(selfId, mine, true), ...[...others.keys()].map(id => frozen.get(id))])
    for (const fn of peerFns) try { fn({ peers: snap }) } catch {}
  }
  room.onPeerJoin(id => { others.set(id, {}); frozen.set(id, peer(id, {}, false)); sendPres(mine, id); rebuild() })
  room.onPeerLeave(id => { others.delete(id); frozen.delete(id); rebuild() })
  getPres((data, id) => {
    if (!data || typeof data !== 'object' || Array.isArray(data)) return
    others.set(id, data); frozen.set(id, peer(id, data, false)); rebuild()
  })
  // my state goes out at most twenty times a second, always whole
  let timer = 0, last = 0
  const push = () => { timer = 0; last = Date.now(); sendPres(mine) }
  rebuild()
  return {
    name,
    peers: () => snap,
    connected: () => true,
    onConnection(fn) { setTimeout(() => fn(true), 0); return () => {} },
    onPeers(fn) { peerFns.push(fn); return () => { peerFns = peerFns.filter(f => f !== fn) } },
    async presence(patch) {
      mine = { ...mine, ...patch }
      rebuild()
      if (!timer) timer = setTimeout(push, Math.max(0, 50 - (Date.now() - last)))
    },
    leave: () => room.leave(),
  }
}
