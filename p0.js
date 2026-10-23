// A stand-in for Project 0's runtime (the p0 object), so the same game runs as a plain web page:
//   three.js draws on one canvas; keys, mouse, touch and controllers come from the browser (a touch stick
//   bottom left); sounds and music play through Web Audio; the save goes to the viewer's own db document when
//   the page can reach one, and always to this browser as well. Co-op runs on the room capability (room.js):
//   everyone with the page open at the same time can join a party; without a room, solo only.
import * as THREE from 'three'

const sleep = ms => new Promise(r => setTimeout(r, ms))
const within = (promise, ms) => Promise.race([promise, sleep(ms).then(() => null)])

// controller buttons press the game's default keys
const PAD_KEYS = { 0: 'Space', 1: 'ShiftLeft', 2: 'KeyE', 3: 'KeyI', 8: 'KeyM', 9: 'KeyP', 12: 'ArrowUp', 13: 'ArrowDown', 14: 'ArrowLeft', 15: 'ArrowRight' }
const PAGE_KEYS = new Set(['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight', 'Tab', 'Backspace'])

export async function createP0({ canvas, stick, base = '', saveKey = 'save' }) {
  const handlers = {}
  const fire = (name, ...args) => { for (const fn of handlers[name] || []) try { fn(...args) } catch (e) { console.error(e) } }

  // ---- the view
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' })
  const scene = new THREE.Scene(), camera = new THREE.PerspectiveCamera(60, 1, 0.05, 50)
  const me = { id: 'me', name: 'KNIGHT', color: null, position: new THREE.Vector3() }
  const p0 = {
    THREE, renderer, scene, camera, me, width: 1, height: 1, pixelRatio: 1, time: 0, soloOnly: true,
    edition: window.SIXTY_SITE ? 'Web edition' : 'Claude edition',
    controls: { mode: 'none', vertical: false }, bodies: { visible: false },
    players: new Map([[me.id, me]]),
    on(name, fn) { (handlers[name] ||= []).push(fn) },
    asset: path => base + path,
    log: (...a) => console.log(...a),
    score() {}, win() {},
  }
  if (/[?&]test\b/.test(location.search)) p0.exposeForTests = o => { p0.test = o }
  function fitView() {
    const w = Math.max(1, canvas.clientWidth || innerWidth), h = Math.max(1, canvas.clientHeight || innerHeight)
    p0.pixelRatio = Math.min(devicePixelRatio || 1, 2)
    renderer.setPixelRatio(p0.pixelRatio); renderer.setSize(w, h, false)
    camera.aspect = w / h; camera.updateProjectionMatrix()
    p0.width = w; p0.height = h
  }
  fitView()
  addEventListener('resize', () => { fitView(); fire('resize') })

  // ---- sound: decoded once, played on demand; nothing plays before the first key or tap
  let audio = null, musicGain = null, musicSrc = null, musicWant = null
  const buffers = new Map()
  function wake() {
    if (!audio) try { audio = new AudioContext(); musicGain = audio.createGain(); musicGain.connect(audio.destination) } catch { return }
    if (audio.state === 'suspended') audio.resume().catch(() => {})
  }
  const buffer = path => {
    if (!buffers.has(path)) buffers.set(path, fetch(base + path).then(r => r.arrayBuffer()).then(b => audio.decodeAudioData(b)).catch(() => null))
    return buffers.get(path)
  }
  p0.sound = {
    play(path, { volume = 1 } = {}) {
      if (!audio) return
      buffer(path).then(buf => {
        if (!buf) return
        const src = audio.createBufferSource(), g = audio.createGain()
        g.gain.value = volume; src.buffer = buf; src.connect(g).connect(audio.destination); src.start()
      })
    },
  }
  p0.music = {
    play(path, { volume = 0.35, loop = true } = {}) {
      if (!audio) return
      musicWant = path
      buffer(path).then(buf => {
        if (!buf || musicWant !== path) return
        musicSrc?.stop()
        musicSrc = audio.createBufferSource(); musicSrc.buffer = buf; musicSrc.loop = loop
        musicGain.gain.value = volume; musicSrc.connect(musicGain); musicSrc.start()
      })
    },
    stop() { musicWant = null; try { musicSrc?.stop() } catch {} musicSrc = null },
  }

  // ---- keys
  const held = new Set()
  const press = (code, repeat = false) => { wake(); held.add(code); fire('keydown', { code, key: code, repeat }) }
  const release = code => { held.delete(code); fire('keyup', { code, key: code }) }
  addEventListener('keydown', e => {
    if (e.target instanceof HTMLElement && e.target.closest('input, textarea, button')) return
    if (PAGE_KEYS.has(e.code)) e.preventDefault()
    if (e.ctrlKey || e.metaKey) return
    press(e.code, e.repeat)
  })
  addEventListener('keyup', e => release(e.code))
  addEventListener('blur', () => { for (const c of [...held]) release(c) })

  // ---- pointer: positions in CSS pixels from the canvas's top left
  const pointer = { x: 0, y: 0, buttons: 0, touch: false }
  const at = e => { const r = canvas.getBoundingClientRect(); return { x: e.clientX - r.left, y: e.clientY - r.top } }
  const pev = (e, extra) => ({ ...at(e), button: e.button, buttons: e.buttons, touch: e.pointerType === 'touch', ...extra })
  canvas.addEventListener('pointerdown', e => {
    wake(); canvas.focus({ preventScroll: true })
    try { canvas.setPointerCapture(e.pointerId) } catch {}
    Object.assign(pointer, at(e), { buttons: e.buttons || 1, touch: e.pointerType === 'touch' })
    fire('pointerdown', pev(e))
  })
  canvas.addEventListener('pointermove', e => { Object.assign(pointer, at(e), { buttons: e.buttons, touch: e.pointerType === 'touch' }); fire('pointermove', pev(e)) })
  const up = e => { pointer.buttons = e.buttons || 0; fire('pointerup', pev(e)) }
  canvas.addEventListener('pointerup', up); canvas.addEventListener('pointercancel', up)
  canvas.addEventListener('contextmenu', e => e.preventDefault())

  // ---- the touch stick: an analogue stick read as a controller's left stick
  const knob = stick?.firstElementChild
  let stickId = null, stickX = 0, stickY = 0
  function stickAt(e) {
    const r = stick.getBoundingClientRect(), rad = r.width / 2
    let dx = (e.clientX - r.left - rad) / rad, dy = (e.clientY - r.top - rad) / rad
    const len = Math.hypot(dx, dy); if (len > 1) { dx /= len; dy /= len }
    stickX = dx; stickY = dy
    if (knob) knob.style.transform = `translate(${dx * rad * 0.55}px, ${dy * rad * 0.55}px)`
  }
  if (stick) {
    stick.addEventListener('pointerdown', e => { wake(); stickId = e.pointerId; try { stick.setPointerCapture(e.pointerId) } catch {}; stickAt(e); e.preventDefault() })
    stick.addEventListener('pointermove', e => { if (e.pointerId === stickId) stickAt(e) })
    const end = e => { if (e.pointerId !== stickId) return; stickId = null; stickX = stickY = 0; if (knob) knob.style.transform = '' }
    stick.addEventListener('pointerup', end); stick.addEventListener('pointercancel', end)
    // shown once the device is touched
    addEventListener('pointerdown', e => { if (e.pointerType === 'touch') stick.hidden = false }, { capture: true })
  }

  // ---- controllers: the first one connected; its buttons press keys, its sticks are read directly
  let pad = null
  const padDown = new Set()
  function pollPad() {
    const real = [...(navigator.getGamepads?.() || [])].find(g => g && g.connected)
    if (real) {
      real.buttons.forEach((b, i) => {
        const code = PAD_KEYS[i]; if (!code) return
        if (b.pressed && !padDown.has(i)) { padDown.add(i); press(code) }
        else if (!b.pressed && padDown.has(i)) { padDown.delete(i); release(code) }
      })
    }
    if (stickId !== null) pad = { axes: [stickX, stickY, real?.axes[2] || 0, real?.axes[3] || 0], buttons: [] }
    else pad = real ? { axes: [...real.axes], buttons: real.buttons } : null
  }
  p0.input = {
    isDown: code => held.has(code),
    get pointer() { return pointer },
    get gamepad() { return pad },
    lockPointer() {}, unlockPointer() {},
  }

  // ---- one player, alone: the room is local
  const state = {}
  p0.room = {
    players: [me.id], state, isHost: true,
    set(key, value) { if (value === null || value === undefined) delete state[key]; else state[key] = value; fire('state', key, value ?? null) },
    send() {}, sendTo() {},
  }

  // ---- the help line (Project 0 shows it under the view)
  p0.hud = text => fire('hud', text)

  // ---- the save: this browser at once, and the viewer's own db document a moment later when there is one
  const readLocal = () => { try { return JSON.parse(localStorage.getItem(saveKey) || 'null') } catch { return null } }
  const writeLocal = data => { try { localStorage.setItem(saveKey, JSON.stringify(data)) } catch {} }
  let doc = null, userCap = null
  try {
    if (window.claude?.use) {
      const [db, user] = (await within(Promise.all([window.claude.use('db'), window.claude.use('user')]), 5000)) || []
      userCap = user || null
      const id = db && user ? await within(user.id(), 3000) : null
      if (id) doc = db.doc('data/users/' + id + '/save')
    }
  } catch { doc = null }
  let remote = null
  if (doc) {
    // one string field: the save holds nested arrays (item bonuses), which a document store may not keep as such
    try { const snap = await within(doc.get(), 5000); const body = snap?.exists ? snap.data() : null; remote = typeof body?.json === 'string' ? JSON.parse(body.json) : null }
    catch { doc = null }
  }
  const local = readLocal()
  const newer = (a, b) => ((a?._at || 0) >= (b?._at || 0) ? a : b)
  p0.saved = structuredClone(newer(remote, local) || null)
  p0.saveWhere = doc ? 'account' : 'browser'

  // ---- co-op: the room capability, everyone with the page open now (?fakeroom: the other tabs of this browser).
  // It never holds up the start: the game begins solo and Play Together lights up whenever the room answers, however
  // long that takes. Until then, and if it never can, p0.coopWhy says why on the title.
  let link = null, roomRef = null
  p0.soloOnly = true; p0.coop = false
  p0.coopWhy = 'Connecting to the other players...'
  if (window.SIXTY_SITE) p0.coopWhy = 'Looking for other players...'
  const WHY = {
    none: 'Play Together needs this page open in Claude, signed in, and shared with you by email',
    not_granted: 'Claude does not connect this visit to the others: the page must be shared with you by email (a link alone is not enough)',
    revoked: 'Your access to this page changed: open it again to play together',
  }
  const noRoom = code => { if (!link) { p0.coopWhy = WHY[code] || WHY.none; p0.coopCode = code } }
  async function attach() {
    if (link || !roomRef || !roomRef.peers().some(p => p.sameTab)) return
    const room = roomRef
    roomRef = null                                     // once
    try {
      if (userCap?.name) p0.me.name = String((await within(userCap.name(), 2000)) || '').slice(0, 16).toUpperCase()
      link = (await import('./room.js')).attachRoom(p0, room, { user: userCap, fire })
      p0.soloOnly = false; p0.coop = true; p0.coopWhy = null; p0.coopCode = 'on'
    } catch (e) { console.warn('no co-op:', e); noRoom('none') }
  }
  ;(async () => {
    try {
      const fake = /[?&]fakeroom(&|$)/.test(location.search)
      // the website (index sets SIXTY_SITE): the players' browsers find each other themselves (webroom.js)
      const party = (new URLSearchParams(location.search).get('party') || 'lobby').toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 32) || 'lobby'
      const room = fake ? (await import('./fakeroom.js')).fakeRoom()
        : window.SIXTY_SITE ? (await import('./webroom.js')).webRoom(party)
        : window.claude?.use ? await window.claude.use('room') : null
      p0.party = window.SIXTY_SITE ? party : null
      if (!room) return noRoom('none')
      // a refusal comes as an error on the listeners; joining waits for the first word about who is here
      try { room.onConnection?.(() => attach(), e => noRoom(e?.code)) } catch {}
      try { room.onPeers?.(() => attach(), e => noRoom(e?.code)) } catch {}
      roomRef = room
      attach()
      const t0 = Date.now()
      const poll = setInterval(() => { if (link || p0.coopCode === 'not_granted') return clearInterval(poll); attach(); if (Date.now() - t0 > 20000 && !link) p0.coopWhy = WHY.none + ' (no answer yet: still trying)' }, 500)
    } catch (e) { console.warn('no co-op:', e); noRoom('none') }
  })()

  let pending = null, writing = false, timer = 0
  async function flush() {
    clearTimeout(timer); timer = 0
    if (!doc || writing || !pending) return
    const data = pending; pending = null; writing = true
    try { await doc.set({ json: JSON.stringify(data), at: data._at }) }
    catch (e) {
      if (e?.code === 'unavailable') pending ||= data                       // once more, later
      else { doc = null; p0.saveWhere = 'browser' }                        // read-only here: this browser only
    }
    writing = false
    if (pending) timer = setTimeout(flush, 2000)
  }
  p0.save = data => {
    const copy = { ...JSON.parse(JSON.stringify(data)), _at: Date.now() }
    writeLocal(copy)
    if (!doc) return
    pending = copy
    if (!timer && !writing) timer = setTimeout(flush, 1500)
  }
  addEventListener('visibilitychange', () => { if (document.hidden) flush() })
  addEventListener('pagehide', () => flush())

  // ---- the frame
  let frameFns = [], last = 0, running = false
  p0.loop = fn => {
    frameFns.push(fn)
    if (running) return
    running = true
    const tick = now => {
      const dt = last ? Math.min(0.25, (now - last) / 1000) : 1 / 60
      last = now; p0.time += dt
      pollPad()
      try { link?.receive() } catch (e) { console.error(e) }
      for (const f of frameFns) try { f(dt) } catch (e) { console.error(e); fire('error', e) }
      try { link?.flush() } catch (e) { console.error(e) }
      renderer.render(scene, camera)
      requestAnimationFrame(tick)
    }
    requestAnimationFrame(tick)
  }

  return p0
}
