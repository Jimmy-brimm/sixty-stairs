// Pixel Dungeon: The Sixty Stairs. A top-down crawler through sixty floors of stolen lands, solo or as a party.
import * as THREE from 'three'
import { createDisplay, loadArt, C, rgba } from './display.js'
import { createRun, knightPalette, MAX_POTIONS } from './play.js'
import { createParty } from './net.js'
import { drawHud, drawMenu, drawPage, drawLandCard, touchButtons, panel, drawMinimap } from './ui.js'
import { createCreator, drawPauseMenu, drawSheet, drawStats, drawWaystone, drawSettings, DEFAULT_KEYS, keyName } from './menus.js'
import { checkpointOf, landIndex, TILE, makeFloor, makeArena, LANDS as WORLD_LANDS } from './world.js'
import { newHero, heroStats, makeItem, CLASSES, HEADS, SKINS, HAIRS, CLOTHS, autoSpend, DIFFICULTY, DIFF_ORDER } from './items.js'
import { TITLE, SUBTITLE, PROLOGUE, LANDS, STONES, BOSSES, ENDING, ENDING_NOHIT, CHANGELOG, HIDDEN } from './lore.js'
import { createSplash } from './title.js'
import { encodeSlot, decodeSlot, cleanCode } from './transfer.js'

const HUD_TEXT = 'W A S D move · mouse aims · click or Space strikes · Shift roll · E potion · C stats · I gear · M map · P pause\n' +
  'Phone: stick moves, tap to strike. Keys can be changed in Settings.'

export default async function start(p0) {
  p0.controls.mode = 'none'
  p0.controls.vertical = false
  p0.bodies.visible = false
  p0.camera.position.set(0, 6, 0)
  p0.camera.rotation.set(0, 0, 0)
  p0.camera.fov = 60; p0.camera.near = 0.05; p0.camera.far = 50
  p0.camera.updateProjectionMatrix()
  p0.scene.background = new THREE.Color(0x0e0a14)
  p0.scene.fog = null

  const narrow = () => Math.min(p0.width, p0.height) < 520
  const D = createDisplay(p0, { short: narrow() ? 352 : 448 })
  const art = loadArt(await fetch(p0.asset('assets/art.json')).then(r => r.json()))
  D.art = art
  const splash = createSplash(art)
  let soundOn = false
  const sfx = (name, volume = 1) => { if (soundOn) try { p0.sound.play('assets/sfx/' + name + '.wav', { volume }) } catch {} }

  // ---- the save: three slots (each a hero and their progress) and the settings they share (version 3).
  // Version 1 and 2 saves become slot 1.
  // diff: this file's difficulty; nohitSince: the floor from which it has been on No Hit without a break (null: not)
  const freshSlot = () => ({ hero: null, cp: 1, deepest: 1, lore: [], lands: [], bosses: [], won: false, deaths: 0, map: 0, diff: 'normal', nohitSince: null, wonNoHit: false, hidden: [], tower: 1, towerBest: 0, waveBest: 0 })
  const num = (v, d, lo, hi) => Number.isFinite(v) ? Math.max(lo, Math.min(hi, Math.round(v))) : d
  function cleanSlot(s, version) {
    if (!s || typeof s !== 'object') return null
    const out = { ...freshSlot(), ...s }
    out.deepest = num(s.deepest, 1, 1, 60)
    out.cp = num(s.cp, 1, 1, out.deepest)              // the floor to carry on from (saved at the top of every floor)
    out.lore = Array.isArray(s.lore) ? s.lore.filter(Number.isFinite) : []
    out.lands = Array.isArray(s.lands) ? s.lands : []; out.bosses = Array.isArray(s.bosses) ? s.bosses : []
    delete out.keys; delete out.musicOff; delete out.v
    out.diff = DIFFICULTY[s.diff] ? s.diff : 'normal'
    out.nohitSince = out.diff === 'nohit' && Number.isFinite(s.nohitSince) ? num(s.nohitSince, 1, 1, 60) : null
    out.wonNoHit = !!s.wonNoHit
    out.tower = num(s.tower, 1, 1, 99999); out.towerBest = num(s.towerBest, 0, 0, 99999); out.waveBest = num(s.waveBest, 0, 0, 99999)
    out.hidden = Array.isArray(s.hidden) ? s.hidden.filter(n => Number.isInteger(n) && n >= 0 && n < 6) : []      // the Fallen Knights freed
    if (version === 1 && s.hero) {
      // a first-edition knight: same level and checkpoint, the old tiers become items, every level's points to spend
      const o = s.hero, h = newHero('knight')
      h.level = num(o.level, 1, 1, 99); h.points = (h.level - 1) * 3; h.xp = num(o.xp, 0, 0, 1e6); h.potions = num(o.potions, 2, 0, MAX_POTIONS)
      h.weapon = makeItem('sword', num(o.wt, 0, 0, 5), num(o.wp, 0, 0, 3)); h.armor = makeItem('armor', num(o.at, 0, 0, 5), num(o.ap, 0, 0, 3))
      out.hero = h; out.migrated = true
    } else if (s.hero) {
      const h = s.hero, base = newHero(CLASSES[h.cls] ? h.cls : 'knight')
      const okItem = it => it && typeof it.k === 'string' && Number.isFinite(it.t) && Number.isFinite(it.r) && Array.isArray(it.a)
      out.hero = {
        ...base, cls: base.cls, level: num(h.level, 1, 1, 99), xp: num(h.xp, 0, 0, 1e7), points: num(h.points, 0, 0, 999), potions: num(h.potions, 2, 0, MAX_POTIONS),
        str: num(h.str, base.str, 0, 999), dex: num(h.dex, base.dex, 0, 999), vit: num(h.vit, base.vit, 0, 999), int: num(h.int, base.int, 0, 999),
        hp: num(h.hp, 1, 1, 1e5), look: { ...base.look, ...(h.look || {}) },
        weapon: okItem(h.weapon) ? h.weapon : base.weapon, armor: okItem(h.armor) ? h.armor : base.armor,
        bag: Array.isArray(h.bag) ? h.bag.filter(okItem).slice(0, 16) : [],
      }
    } else out.hero = null
    return out.hero ? out : null
  }
  function loadStore() {
    const s = p0.saved, store = { v: 3, slot: 0, slots: [null, null, null], keys: { ...DEFAULT_KEYS }, gfx: 'auto', musicOff: false, seen: '', assist: false }
    if (!s || !s.v) return store
    store.keys = { ...DEFAULT_KEYS, ...(s.keys || {}) }
    // a key added since (stats): left unbound if the player already gave its default to something else
    for (const k of Object.keys(DEFAULT_KEYS)) if (!s.keys?.[k] && Object.keys(store.keys).some(o => o !== k && store.keys[o] === store.keys[k])) store.keys[k] = ''
    store.musicOff = !!s.musicOff
    store.assist = !!s.assist                     // attacks without a mouse turn to the nearest foe (off: they go where you face)
    store.seen = typeof s.seen === 'string' ? s.seen.slice(0, 12) : ''       // the newest What's New page opened
    if (s.v >= 3) {
      store.slots = [0, 1, 2].map(i => cleanSlot(s.slots?.[i], 2))
      store.slot = num(s.slot, 0, 0, 2)
      store.gfx = ['auto', 'high', 'medium', 'low'].includes(s.gfx) ? s.gfx : 'auto'
    } else store.slots[0] = cleanSlot(s, s.v)
    return store
  }
  const store = loadStore()
  let save = store.slots[store.slot] || freshSlot()
  let hero = save.hero
  const persist = () => {
    save.hero = hero
    if (hero) store.slots[store.slot] = save
    try { p0.save(store) } catch {}
  }
  function useSlot(i) {
    store.slot = i; save = store.slots[i] || freshSlot(); hero = save.hero
    startCp = save.cp; persist(); makeTitle()
  }

  // ---- graphics: high (32-pixel art, every effect), medium (fewer effects), low (half-size art); auto steps down
  let gfxNow = store.gfx === 'auto' ? 'high' : store.gfx, avgDt = 1 / 60, slowT = 0
  function applyView() {
    const base = narrow() ? 352 : 448
    D.setView({ short: gfxNow === 'low' ? base / 2 : base, uiShort: narrow() ? 176 : 224, cell: gfxNow === 'low' ? 4 : 8 })
    run?.setQuality(gfxNow); title?.setQuality(gfxNow)
  }
  p0.on('resize', () => applyView())
  function watchSpeed(rawDt) {
    avgDt += (Math.min(rawDt, 0.2) - avgDt) * 0.05
    if (store.gfx !== 'auto' || gfxNow === 'low') return
    slowT = avgDt > 1 / 30 ? slowT + rawDt : Math.max(0, slowT - rawDt)
    if (slowT > 3) {
      gfxNow = gfxNow === 'high' ? 'medium' : 'low'; slowT = -4; avgDt = 1 / 60; applyView()
      note = { text: 'GRAPHICS SET TO ' + gfxNow.toUpperCase() + ' FOR SPEED (SETTINGS)', t: 0 }
    }
  }
  const gfxLabel = () => store.gfx === 'auto' ? 'AUTO (' + gfxNow.toUpperCase() + ')' : store.gfx.toUpperCase()
  function cycleGfx() {
    const order = ['auto', 'high', 'medium', 'low']
    store.gfx = order[(order.indexOf(store.gfx) + 1) % order.length]
    gfxNow = store.gfx === 'auto' ? 'high' : store.gfx; slowT = 0
    applyView(); persist()
  }

  // ---- input
  const pressed = new Set()
  let taps = [], mouseAt = null, mouseT = -99, lastTouch = -99, lastKey = null
  p0.on('keydown', e => { soundOn = true; if (!e.repeat) { pressed.add(e.code); lastKey = e.code } })
  p0.on('pointerdown', e => { soundOn = true; if (e.touch) lastTouch = p0.time; taps.push({ ...D.toUi(e.x, e.y), touch: !!e.touch }) })
  p0.on('pointermove', e => { if (!e.touch) { mouseAt = D.toUi(e.x, e.y); mouseT = p0.time } })
  const down = code => p0.input.isDown(code)
  const was = (...codes) => codes.some(c => pressed.has(c))
  const K = store.keys
  const phone = () => p0.time - lastTouch < 30 || p0.width < 520
  const menuInput = tap => ({
    up: was(K.up, 'ArrowUp', 'KeyW'), down: was(K.down, 'ArrowDown', 'KeyS'), left: was(K.left, 'ArrowLeft', 'KeyA'), right: was(K.right, 'ArrowRight', 'KeyD'),
    confirm: was('Space', 'KeyE', K.attack), back: was('KeyQ', 'Backspace'), drop: was('KeyX', 'Delete'),
    tap, mouse: p0.time - mouseT < 0.15 ? mouseAt : null, key: lastKey,
  })

  // ---- music: two loops for each land (the second on its deeper floors, 6 to 9), one for each lord, the title,
  // the party lobby and the ending
  function trackNow(boss) {
    if (screen === 'lobby') return 'party'
    if (screen !== 'play') return 'title'
    if (victoryT > 0) return 'ending'
    if (boss && !boss.dead) { const k = WORLD_LANDS.findIndex(l => l.boss === boss.kind); return 'lord' + (k >= 0 ? k : Math.min(5, run.li)) }
    if (run.mode === 'waves') return 'arena'
    if (run.mode === 'tower') return run.towerN % 10 >= 5 ? 'tower2' : 'tower'
    return run.land.key + ((run.floor - 1) % 10 >= 5 ? '2' : '')
  }
  let track = null
  function music(name) {
    if (!soundOn || store.musicOff) name = null
    if (name === track) return
    track = name
    try { if (name) p0.music.play('assets/music/' + name + '.wav', { volume: 0.35, loop: true }); else p0.music.stop() } catch {}
  }

  const party = createParty(p0, { palOf: () => null })

  // ---- screens
  let screen = 'title', sel = 0, startCp = save.cp, loreSel = 0, landT = 9, deadT = 0, fadeT = 0, victoryT = 0, note = null
  let fadeTo = 1, fadeArrive = 'start', fadeMode = 'story', wayState = {}, statsState = {}, noHitWin = false
  const WAYSTONES = [1, 11, 21, 31, 41, 51]
  const goFloor = (floor, arrive = 'start', mode = 'story') => { fadeTo = floor; fadeArrive = arrive; fadeMode = mode; fadeT = 0.01 }
  let run = null, coop = false, title = null, titlePath = null, titleT = 0, lastCam = { cx: 0, cy: 0, Z: 2 }
  let overlay = null, pauseState = { sel: 0 }, sheetState = {}, settingsState = {}, creator = null, prologue = false
  const events = {
    changed: () => persist(),
    lore: f => { if (!save.lore.includes(f)) { save.lore.push(f); persist() } },
    died: () => { deadT = 0; save.deaths++; persist() },
    descend: () => { sfx('stairs', 0.7); if (run.mode === 'tower') goFloor(run.towerN + 1, 'start', 'tower'); else goFloor(run.floor + 1) },
    modeLord: (li, got) => { if (got.length) note = { text: 'THE LORD DROPPED ' + got.join(' AND '), t: 0 }; persist() },
    waveCleared: n => { if (n > (save.waveBest || 0)) { save.waveBest = n; note = { text: 'A NEW BEST: WAVE ' + n, t: 0 } } persist() },
    ascend: () => { sfx('stairs', 0.7); goFloor(run.floor - 1, 'stairs') },
    waypoint: () => {
      if (coop && !party.isLeader()) { note = { text: 'THE WAYSTONE ANSWERS ONLY THE PARTY LEADER', t: 0 }; return }
      overlay = 'waystone'; wayState = {}; sfx('lore', 0.5)
    },
    loot: () => persist(),
    hiddenDown: (li, got) => {
      if (!save.hidden.includes(li)) save.hidden.push(li)
      note = { text: HIDDEN[li].name + ' LEFT ' + got, t: 0 }
      sfx('victory', 0.6); persist()
    },
    bossDown: (li, got) => {
      if (!save.bosses.includes(li)) save.bosses.push(li)
      if (got.length) note = { text: 'THE LORD DROPPED ' + got.join(' AND '), t: 0 }
      if (li === 5 && save.diff === 'nohit' && save.nohitSince != null && save.nohitSince <= 51) save.wonNoHit = noHitWin = true
      if (li === 5) { save.won = true; try { p0.win() } catch {}; victoryT = 0.01; setTimeout(() => sfx('victory', 0.8), 2500); if (coop && party.isLeader()) party.won() }
      persist()
    },
  }

  // mode: 'story' (floor: the story's floor), 'tower' (floor: the tower's floor), 'waves' (floor unused)
  function begin(floor, net = null, arrive = 'start', mode = 'story') {
    coop = !!net; overlay = null
    if (mode !== 'story') {
      // the Endless Tower and Wave Mode: after the story, solo; the tower's monsters are a little past floor sixty and climb
      const world = mode === 'tower' ? makeFloor(floor, { tower: floor }) : makeArena()
      run = createRun({ floor: mode === 'tower' ? 55 + floor : 30, art, D, hero, sfx, save, events, diff: () => save.diff, mode, world, towerN: mode === 'tower' ? floor : 0 })
      run.setQuality(gfxNow)
      screen = 'play'; fadeT = 0; deadT = 0; landT = mode === 'waves' || floor === 1 ? 0 : 9
      if (mode === 'tower') { save.tower = floor; save.towerBest = Math.max(save.towerBest || 0, floor) }
      persist()
      return
    }
    if (save.diff === 'nohit' && save.nohitSince == null) save.nohitSince = floor
    run = createRun({ floor, art, D, hero, sfx, net, save, events, arrive, diff: () => save.diff })
    run.setQuality(gfxNow)
    screen = 'play'; fadeT = 0; deadT = 0
    landT = (floor - 1) % 10 === 0 && arrive === 'start' ? 0 : 9
    const li = landIndex(floor)
    if (!save.lands.includes(li)) save.lands.push(li)
    if (floor > save.deepest) { save.deepest = floor; try { p0.score(floor) } catch {} }
    save.cp = floor                                        // the save: the top of this floor
    if (floor === 1 && !save.prologue && !net) { prologue = true; save.prologue = true }
    persist()
  }
  function backToTitle() {
    if (coop) party.leave()
    run = null; coop = false; overlay = null; screen = 'title'; sel = 0; startCp = save.cp; makeTitle(); splash.restart()
  }
  // a hero first: the creator, then whatever was chosen
  function needHero(then) {
    if (hero) return then()
    creator = createCreator(art, (cls, look) => { hero = newHero(cls, look); hero.hp = heroStats(hero).maxHp; persist(); screen = 'title'; then() })
    screen = 'creator'
  }

  function makeTitle() { titleT = 0 }
  makeTitle()
  applyView()

  party.handlers.start = (floor, runNo, arrive) => {
    if (!party.joined) return
    if (run?.me.dead || hero.hp <= 0) hero.hp = Math.round(heroStats(hero).maxHp * 0.5)
    begin(floor, party.link, arrive)
  }
  party.handlers.msg = (msg, from) => { if (run && coop) run.onNet(msg, from) }
  party.handlers.won = () => { if (screen === 'play' && victoryT === 0) { victoryT = 0.01; setTimeout(() => sfx('victory', 0.8), 2500) } }
  p0.on('leave', p => run?.forget(String(p?.id ?? p)))
  p0.on('reconnect', () => { party.reset(); if (coop) backToTitle() })
  p0.hud(HUD_TEXT)
  p0.exposeForTests?.({ get run() { return run }, get hero() { return hero }, get screen() { return screen }, events, goFloor, party, begin, get save() { return save } })      // the Claude page, with ?test only

  // ---- the frame
  p0.loop((dt) => {
    watchSpeed(dt)
    dt = Math.min(dt, 0.05)
    const tap = taps.shift() || null; if (taps.length > 4) taps = []
    D.ui.clear(0)
    if (screen === 'title') titleScreen(dt, tap)
    else if (screen === 'creator') { drawBackdrop(dt); creator(D, dt, menuInput(tap), sfx) }
    else if (screen === 'lore') loreScreen(dt, tap)
    else if (screen === 'news') newsScreen(dt, tap)
    else if (screen === 'transfer') transferScreen(dt, tap)
    else if (screen === 'lobby') lobbyScreen(dt, tap)
    else if (screen === 'slots') slotsScreen(dt, tap)
    else if (screen === 'settings') { drawBackdrop(dt); if (drawSettings(D, K, settingsState, menuInput(tap), sfx, settingsOpts())) screen = 'title' }
    else if (screen === 'play') playScreen(dt, tap)
    const boss = run?.boss
    music(trackNow(boss))
    pressed.clear(); lastKey = null
    if (run) { p0.me.position.x = (run.me.x / (run.F.w * TILE) - 0.5) * 10; p0.me.position.z = (run.me.y / (run.F.h * TILE) - 0.5) * 16; p0.me.position.y = 1.6 }
    D.present()
  })

  // behind the other menus: the title's painted backdrop
  const drawBackdrop = dt => splash.back(D, dt)

  // ---- the title
  const inside = (p, r) => p && p.x >= r.x && p.y >= r.y && p.x < r.x + r.w && p.y < r.y + r.h
  const nice = str => String(str).toLowerCase().replace(/(^|\s)\S/g, m => m.toUpperCase())     // 'THE ELDERWOOD' -> 'The Elderwood'
  const othersHere = () => Math.max(0, (p0.room?.players?.length ?? p0.players?.size ?? 1) - 1)      // the others with the game open
  const DEMO = newHero('knight')                     // who stands on the title before there is a hero
  const titlePals = new Map()
  function titleScreen(dt, tap) {
    const U = D.ui
    const cps = [...new Set([...WAYSTONES.filter(c => c <= save.deepest), save.cp])].sort((a, b) => a - b)
    if (!cps.includes(startCp)) startCp = save.cp
    const items = [
      { key: 'solo', label: hero ? 'Continue' : 'New Game' },
      ...(hero ? [{ key: 'tower', label: 'Endless Tower', off: !save.won }, { key: 'waves', label: 'Wave Mode', off: !save.won }] : []),
      ...(p0.soloOnly && !p0.coopWhy ? [] : [{ key: 'coop', label: 'Play Together', off: p0.soloOnly }]),      // off: this page cannot reach the others
      { key: 'slots', label: 'Save Files' },
      ...(hero ? [{ key: 'hero', label: 'Your Hero' }] : []),
      { key: 'lore', label: 'Lore Book' },
      { key: 'news', label: "What's New", fresh: store.seen !== CHANGELOG[0].v },
      { key: 'settings', label: 'Options' },
    ]
    sel = Math.min(sel, items.length - 1)
    const cur = items[sel].key, many = !!hero && cps.length > 1
    const sl = store.slots[store.slot]
    const detail = {
      tower: save.won ? 'Tower floor ' + (save.tower || 1) + (save.towerBest > 1 ? ', highest ' + save.towerBest : '') : 'Beat Vorgrath to open the tower',
      waves: save.won ? (save.waveBest ? 'Best: wave ' + save.waveBest : 'Hold the arena, wave after wave') : 'Beat Vorgrath to open the arena',
      solo: hero ? (many ? '< ' : '') + 'Floor ' + startCp + ', ' + nice(LANDS[landIndex(startCp)].name) + (many ? ' >' : '') : 'Make your hero and take the first stair',
      coop: p0.soloOnly ? p0.coopWhy : othersHere() ? 'Go down together: ' + othersHere() + (othersHere() === 1 ? ' other player' : ' other players') + ' here now' : 'Go down together: nobody else has the game open right now',
      slots: 'File ' + (store.slot + 1) + (sl?.hero ? ': level ' + sl.hero.level + ' ' + nice(CLASSES[sl.hero.cls].name) + ', floor ' + sl.deepest + ', ' + nice(DIFFICULTY[sl.diff || 'normal'].name) + (sl.wonNoHit ? ', untouched' : '') : ': empty'),
      hero: hero ? 'Level ' + hero.level + ' ' + nice(CLASSES[hero.cls].name) + (hero.points ? ', ' + hero.points + ' points to spend' : '') : '',
      lore: save.lore.length + ' of ' + Object.keys(STONES).length + ' lore stones found',
      news: (store.seen !== CHANGELOG[0].v ? 'New in ' : 'Ver. ') + CHANGELOG[0].v + ': ' + CHANGELOG[0].name,
      settings: 'Keys, graphics and music',
    }[cur]
    const look = hero?.look || DEMO.look, tier = hero ? hero.armor?.t || 0 : 1, pk = JSON.stringify(look) + tier
    if (!titlePals.has(pk)) titlePals.set(pk, knightPalette(art, look, tier))
    const hint = hero && save.migrated ? 'Your knight was carried over: ' + hero.points + ' points to spend'
      : !soundOn ? 'Click or press a key for sound' : null
    const { rects, detailRect } = splash.draw(D, dt, {
      pal: titlePals.get(pk), outfit: look.outfit, head: look.head, items, sel, detail, hint,
      version: ['Ver. ' + CHANGELOG[0].v, p0.edition || 'Project 0, lot 945'], top: phone() ? 60 : 12,
    })

    const inp = menuInput(tap)
    // while it fades in, a key or a tap only finishes the fade
    if (splash.fading && (tap || inp.up || inp.down || inp.left || inp.right || inp.confirm)) { splash.skip(); return }
    if (inp.up) { sel = (sel + items.length - 1) % items.length; sfx('uimove', 0.5) }
    if (inp.down) { sel = (sel + 1) % items.length; sfx('uimove', 0.5) }
    const ci = cps.indexOf(startCp)
    const step = d => { startCp = cps[Math.max(0, Math.min(cps.length - 1, ci + d))]; sfx('uimove', 0.5) }
    if (cur === 'solo' && many) { if (inp.left) step(-1); if (inp.right) step(1) }
    if (inp.mouse) rects.forEach((r, i) => { if (inside(inp.mouse, r)) sel = i })
    let pick = inp.confirm ? sel : -1
    if (tap) {
      rects.forEach((r, i) => { if (inside(tap, r)) pick = i })
      if (pick < 0 && cur === 'solo' && many && detailRect && inside(tap, detailRect)) step(tap.x < detailRect.x + detailRect.w / 2 ? -1 : 1)
    }
    if (pick < 0) return
    sel = pick
    sfx('ui', 0.6)
    const key = items[pick].key
    if (key === 'solo') needHero(() => { hero.hp = heroStats(hero).maxHp; begin(startCp) })
    else if ((key === 'tower' || key === 'waves') && !save.won) sfx('hurt', 0.3)
    else if (key === 'tower') { hero.hp = heroStats(hero).maxHp; begin(save.tower || 1, null, 'start', 'tower') }
    else if (key === 'waves') { hero.hp = heroStats(hero).maxHp; begin(1, null, 'start', 'waves') }
    else if (key === 'coop' && p0.soloOnly) sfx('hurt', 0.3)
    else if (key === 'coop') needHero(() => { p0.setClass?.(CLASSES[hero.cls].name); party.join(save.cp, hero.level); screen = 'lobby' })
    else if (key === 'slots') { screen = 'slots'; slotSel = store.slot; erase = -1 }
    else if (key === 'settings') { screen = 'settings'; settingsState = {} }
    else if (key === 'news') { screen = 'news'; newsSel = 0; newsScroll = 0; if (store.seen !== CHANGELOG[0].v) { store.seen = CHANGELOG[0].v; persist() } }
    else if (key === 'hero') {
      creator = createCreator(art, (cls, look) => {
        if (!hero) { hero = newHero(cls, look); hero.hp = heroStats(hero).maxHp } else hero.look = { ...look, outfit: CLASSES[hero.cls].outfit }
        persist(); makeTitle(); screen = 'title'
      }, hero, { lockClass: !!hero })
      screen = 'creator'
    } else { screen = 'lore'; loreSel = 0 }
  }

  // ---- the three save slots: pick one, start a new hero in an empty one, or erase one (X twice)
  let slotSel = 0, erase = -1
  function slotsScreen(dt, tap) {
    drawBackdrop(dt)
    const U = D.ui, W = U.W, H = U.H
    const pw = Math.min(W - 12, 280), ph = 44 + 3 * 30 + 14, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
    panel(U, px, py, pw, ph)
    U.text('SAVE SLOTS', W / 2, py + 7, C.gold, { align: 'center' })
    const inp = menuInput(tap)
    let pick = -1
    for (let i = 0; i < 3; i++) {
      const sl = store.slots[i], y = py + 24 + i * 30, r = { x: px + 8, y, w: pw - 16, h: 26 }
      if (inside(inp.mouse, r)) slotSel = i
      U.rect(r.x, r.y, r.w, r.h, slotSel === i ? rgba(255, 206, 70, 55) : rgba(30, 22, 40, 200))
      U.frame(r.x, r.y, r.w, r.h, i === store.slot ? C.gold : rgba(90, 70, 120))
      if (sl?.hero) {
        // the hero, small, in their own colours
        const pal = knightPalette(art, sl.hero.look, sl.hero.armor?.t || 0)
        U.sprite(art.half['k_' + sl.hero.look.outfit + '_down'], 0, r.x + 14, r.y + 25, { pal })
        U.sprite(art.half['h_' + sl.hero.look.head + '_down'], 0, r.x + 14, r.y + 25, { pal })
        U.text('SLOT ' + (i + 1) + '  LV ' + sl.hero.level + ' ' + CLASSES[sl.hero.cls].name, r.x + 30, r.y + 5, C.white)
        U.text('DEEPEST FLOOR ' + sl.deepest + '   LORE ' + sl.lore.length + '/' + Object.keys(STONES).length + (sl.won ? '   VORGRATH FELL' : ''), r.x + 30, r.y + 15, C.dim)
        if (erase === i) U.text('X AGAIN TO ERASE', r.x + r.w - 6, r.y + 5, C.red, { align: 'right' })
      } else U.text('SLOT ' + (i + 1) + '   EMPTY: A NEW HERO', r.x + 30, r.y + 9, C.dim)
      if (i === store.slot) U.text('IN USE', r.x + r.w - 6, r.y + 15, C.gold, { align: 'right' })
      if (inside(tap, r)) { if (slotSel === i || !store.slots[i]) pick = i; slotSel = i }
    }
    U.text('SPACE: CHOOSE   X: ERASE   T: TRANSFER CODE   Q: BACK', W / 2, py + ph - 12, C.dim, { align: 'center' })
    if (inp.up) { slotSel = (slotSel + 2) % 3; erase = -1; sfx('uimove', 0.5) }
    if (inp.down) { slotSel = (slotSel + 1) % 3; erase = -1; sfx('uimove', 0.5) }
    if (inp.confirm) pick = slotSel
    if (inp.drop && store.slots[slotSel]) {
      if (erase === slotSel) {
        store.slots[slotSel] = null; erase = -1; sfx('hurt', 0.4)
        if (slotSel === store.slot) useSlot(slotSel); else persist()
      } else { erase = slotSel; sfx('ui', 0.5) }
    }
    // the transfer code: by T, or a tap on the line that says so
    if (was('KeyT') || (tap && tap.y > py + ph - 16 && inside(tap, { x: px, y: py, w: pw, h: ph }))) { screen = 'transfer'; xfer = { mode: 'menu', sel: 0, code: '', msg: '' }; sfx('ui', 0.5); return }
    if (inp.back) { screen = 'title'; sfx('ui', 0.5); return }
    if (pick < 0) return
    sfx('ui', 0.6); useSlot(pick)
    if (!hero) needHero(() => { makeTitle(); screen = 'title' })
    else screen = 'title'
  }

  // a file's difficulty: changed any time; No Hit counts from the next floor begun on it
  function setDiff(key) {
    if (key === save.diff) return
    save.diff = key
    save.nohitSince = key === 'nohit' && run && screen === 'play' ? run.floor + 1 : null
    persist()
  }
  function settingsOpts() {
    return { musicOff: store.musicOff, onMusic: () => { store.musicOff = !store.musicOff; persist() }, onChange: persist, gfx: gfxLabel(), onGfx: cycleGfx,
      assist: store.assist, onAssist: () => { store.assist = !store.assist; persist() },
      diff: DIFFICULTY[save.diff] || DIFFICULTY.normal, onDiff: () => setDiff(DIFF_ORDER[(DIFF_ORDER.indexOf(save.diff) + 1) % DIFF_ORDER.length]) }
  }

  // ---- the lore book
  function lorePages() {
    const pages = [{ title: 'THE SIXTY STAIRS', lines: PROLOGUE }]
    LANDS.forEach((l, i) => {
      if (!save.lands.includes(i)) return
      pages.push({ title: l.name, lines: l.lines })
      for (const f of Object.keys(STONES).map(Number).filter(f => landIndex(f) === i && save.lore.includes(f))) pages.push({ title: STONES[f][0], lines: STONES[f].slice(1) })
      if (save.hidden?.includes(i)) pages.push({ title: HIDDEN[i].name, lines: ['A Lantern Knight before you, behind a cracked wall on floor ' + (i * 10 + 5) + '.', '', HIDDEN[i].fall] })
      if (save.bosses.includes(i) && BOSSES[i].fall) pages.push({ title: BOSSES[i].name, lines: [BOSSES[i].fall] })
    })
    if (save.won) pages.push({ title: 'THE END', lines: ENDING })
    return pages
  }
  function loreScreen(dt, tap) {
    drawBackdrop(dt)
    const U = D.ui, pages = lorePages(), n = pages.length
    loreSel = Math.max(0, Math.min(n - 1, loreSel))
    const p = pages[loreSel]
    const box = drawPage(U, p.title, p.lines, (loreSel + 1) + ' / ' + n + '   A D: TURN   Q: BACK')
    U.text('STONES FOUND ' + save.lore.length + ' / ' + Object.keys(STONES).length, U.W / 2, box.py + box.ph + 6, C.dim, { align: 'center' })
    const inp = menuInput(tap)
    if (inp.left) { loreSel--; sfx('uimove', 0.5) }
    if (inp.right) { loreSel++; sfx('uimove', 0.5) }
    if (tap) { if (tap.x < U.W / 3) loreSel--; else if (tap.x > U.W * 2 / 3) loreSel++; else { screen = 'title'; sfx('ui', 0.5) } }
    if (inp.back || inp.confirm) { screen = 'title'; sfx('ui', 0.5) }
  }

  // ---- what's new: a page for each version, newest first; long pages scroll
  let newsSel = 0, newsScroll = 0
  function newsScreen(dt, tap) {
    drawBackdrop(dt)
    const U = D.ui, W = U.W, H = U.H, n = CHANGELOG.length
    newsSel = Math.max(0, Math.min(n - 1, newsSel))
    const page = CHANGELOG[newsSel], mixed = { mixed: true }
    const pw = Math.min(W - 12, 340), px = Math.round(W / 2 - pw / 2), tw = pw - 40      // room on the right for the scroll marks
    // each change a flame and a paragraph, wrapped with a hanging indent
    const rows = []
    let y = 0
    for (const item of page.items) {
      let line = '', first = true
      for (const word of item.split(' ')) {
        const t = line ? line + ' ' + word : word
        if (U.textWidth(t, 1, true) > tw && line) { rows.push({ text: line, y, bullet: first }); first = false; line = word; y += 10 } else line = t
      }
      rows.push({ text: line, y, bullet: first }); y += 14
    }
    const content = y - 4, head = 34, foot = 20
    const ph = Math.min(H - 12, head + content + foot), py = Math.round(H / 2 - ph / 2), view = ph - head - foot
    const most = Math.max(0, content - view)
    newsScroll = Math.max(0, Math.min(most, newsScroll))
    panel(U, px, py, pw, ph)
    U.text('What\'s New', W / 2, py + 7, C.dim, { align: 'center', ...mixed })
    U.text('Ver. ' + page.v + '  ' + page.name, W / 2, py + 19, C.gold, { align: 'center', ...mixed })
    for (const r of rows) {
      const ry = py + head + r.y - newsScroll
      if (ry < py + head - 2 || ry > py + head + view - 8) continue
      if (r.bullet) U.sprite(art.sprites.ui_flame, 0, px + 9, ry - 1)
      U.text(r.text, px + 20, ry, C.white, mixed)
    }
    if (newsScroll > 0) U.text('^', px + pw - 10, py + head - 2, C.gold)
    if (newsScroll < most) U.text('v', px + pw - 10, py + head + view - 8, C.gold, mixed)
    const foot2 = pw < 300 ? '   tap the sides to turn' : (newsSel ? '   A D: turn' : '   D: older') + (most ? '   W S: scroll' : '') + '   Q: back'
    U.text((newsSel + 1) + ' / ' + n + foot2, W / 2, py + ph - 13, C.dim, { align: 'center', ...mixed })
    const inp = menuInput(tap)
    const turn = d => { const to = Math.max(0, Math.min(n - 1, newsSel + d)); if (to !== newsSel) { newsSel = to; newsScroll = 0; sfx('uimove', 0.5) } }
    if (inp.left) turn(-1)
    if (inp.right) turn(1)
    if (inp.up) newsScroll -= 20
    if (inp.down) newsScroll += 20
    if (tap) {
      if (tap.x < W / 3) turn(-1)
      else if (tap.x > W * 2 / 3) turn(1)
      else if (most && newsScroll < most) newsScroll += view - 10        // a tap in the middle reads on, then goes back
      else { screen = 'title'; sfx('ui', 0.5) }
    }
    if (inp.back || inp.confirm) { screen = 'title'; sfx('ui', 0.5) }
  }

  // ---- the transfer code: one save file as a short code to type in elsewhere (Project 0 has no clipboard)
  let xfer = { mode: 'menu', sel: 0, code: '', msg: '' }
  const keyChar = code => /^Key[A-Z]$/.test(code) ? code.slice(3) : /^(Digit|Numpad)[0-9]$/.test(code) ? code.slice(-1) : null
  function transferScreen(dt, tap) {
    drawBackdrop(dt)
    const U = D.ui, W = U.W, H = U.H, sl = store.slots[store.slot]
    const pw = Math.min(W - 8, 320), ph = Math.min(H - 8, 168), px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
    panel(U, px, py, pw, ph)
    U.text('TRANSFER CODE: FILE ' + (store.slot + 1), W / 2, py + 7, C.gold, { align: 'center' })
    const body = (lines, y, c = C.white) => U.wrap(lines, pw - 16).forEach((l, i) => U.text(l, W / 2, y + i * 9, c, { align: 'center' }))
    // the code in groups, large where there is room
    const drawCode = (text, y, cursor) => {
      const groups = text.match(/.{1,5}/g) || [], big = pw >= 260, per = big ? 3 : 4, sc = big ? 2 : 1
      const rows = Math.max(1, Math.ceil((groups.length + (cursor ? 1 : 0)) / per))
      for (let r = 0; r < rows; r++) U.text(groups.slice(r * per, r * per + per).join(' '), W / 2, y + r * (sc * 9 + 3), C.gold, { align: 'center', scale: sc })
      return y + rows * (sc * 9 + 3)
    }
    if (xfer.mode === 'menu') {
      body('A CODE CARRIES ONE SAVE FILE BETWEEN PROJECT 0, THE CLAUDE PAGE AND THE WEBSITE: THE HERO, THE GEAR IN HAND AND THE STORY SO FAR. THE BAG STAYS BEHIND.', py + 22, C.dim)
      const items = [{ k: 'show', l: 'SHOW THIS FILE\'S CODE' }, { k: 'enter', l: 'TYPE IN A CODE' }, { k: 'back', l: 'BACK' }]
      const inp = menuInput(tap)
      let pick = null
      items.forEach((it, i) => {
        const y = py + 72 + i * 16, r = { x: px + 30, y: y - 4, w: pw - 60, h: 14 }
        if (inside(inp.mouse, r)) xfer.sel = i
        if (xfer.sel === i) U.rect(r.x, r.y, r.w, r.h, rgba(255, 206, 70, 50))
        U.text(it.l, W / 2, y, xfer.sel === i ? C.gold : C.white, { align: 'center' })
        if (inside(tap, r)) pick = it.k
      })
      if (inp.up) { xfer.sel = (xfer.sel + 2) % 3; sfx('uimove', 0.5) }
      if (inp.down) { xfer.sel = (xfer.sel + 1) % 3; sfx('uimove', 0.5) }
      if (inp.confirm) pick = items[xfer.sel].k
      if (inp.back || pick === 'back') { screen = 'slots'; sfx('ui', 0.5); return }
      if (pick === 'show') { xfer.mode = 'show'; sfx('ui', 0.6) }
      if (pick === 'enter') { xfer.mode = 'enter'; xfer.code = ''; xfer.msg = ''; sfx('ui', 0.6) }
      return
    }
    if (xfer.mode === 'show') {
      const code = encodeSlot(sl)
      if (!code) body('THIS FILE IS EMPTY: NOTHING TO CARRY.', py + 50)
      else {
        const end = drawCode(code.replace(/-/g, ''), py + 26)
        body('ON THE OTHER PAGE: SAVE FILES, T, TYPE IN A CODE. LETTERS AND NUMBERS ONLY; NO I, L, O OR U.', end + 6, C.dim)
      }
      U.text('SPACE OR Q: BACK', W / 2, py + ph - 12, C.dim, { align: 'center' })
      const inp = menuInput(tap)
      if (inp.confirm || inp.back || tap) { xfer.mode = 'menu'; sfx('ui', 0.5) }
      return
    }
    if (xfer.mode === 'enter') {
      // letters and numbers from the keyboard (Q is a letter here); Backspace takes one back, Space reads it
      const ch = keyChar(lastKey)
      if (ch && xfer.code.length < 70) { xfer.code = cleanCode(xfer.code + ch); xfer.msg = ''; sfx('uimove', 0.3) }
      if (was('Backspace', 'Delete')) { if (!xfer.code) { xfer.mode = 'menu'; sfx('ui', 0.5); return } xfer.code = xfer.code.slice(0, -1) }
      const end = drawCode(xfer.code + (Math.floor(titleT * 3) % 2 ? '_' : ' '), py + 26, true)
      if (xfer.msg) body(xfer.msg, end + 6, C.red)
      else body(phone() ? 'TYPING NEEDS A KEYBOARD.' : 'TYPE THE CODE. BACKSPACE: UNDO (ON AN EMPTY CODE, BACK). SPACE: READ IT.', end + 6, C.dim)
      titleT += dt
      if (was('Space') || (tap && tap.y > py + ph - 18)) {
        const got = decodeSlot(xfer.code)
        if (got.error) { xfer.msg = got.error; sfx('hurt', 0.4) }
        else { const s2 = cleanSlot(got.slot, 2); if (s2) { xfer.slot = s2; xfer.mode = 'confirm'; sfx('ui', 0.6) } else { xfer.msg = 'THAT CODE HOLDS NO HERO'; sfx('hurt', 0.4) } }
      }
      U.text('SPACE: READ THE CODE', W / 2, py + ph - 12, C.dim, { align: 'center' })
      return
    }
    // confirm: the code is good; this file becomes what it holds
    const h = xfer.slot.hero
    body('THE CODE HOLDS: LEVEL ' + h.level + ' ' + CLASSES[h.cls].name + ', DEEPEST FLOOR ' + xfer.slot.deepest + ', ' + DIFFICULTY[xfer.slot.diff].name + '.', py + 34)
    body(sl?.hero ? 'IT REPLACES FILE ' + (store.slot + 1) + ' (LEVEL ' + sl.hero.level + ' ' + CLASSES[sl.hero.cls].name + ').' : 'IT GOES INTO FILE ' + (store.slot + 1) + ', NOW EMPTY.', py + 62, sl?.hero ? C.red : C.dim)
    U.text('SPACE: LOAD IT   Q: NO', W / 2, py + ph - 12, C.dim, { align: 'center' })
    const inp = menuInput(tap)
    if (inp.confirm || (tap && tap.x < W / 2)) {
      store.slots[store.slot] = xfer.slot; useSlot(store.slot)
      note = { text: 'FILE ' + (store.slot + 1) + ' LOADED FROM ITS CODE', t: 0 }
      screen = 'title'; sel = 0; sfx('level', 0.6); splash.restart()
    } else if (inp.back || tap) { xfer.mode = 'enter'; sfx('ui', 0.5) }
  }

  // ---- the co-op lobby
  function lobbyScreen(dt, tap) {
    drawBackdrop(dt)
    const U = D.ui, W = U.W, H = U.H, list = party.lobby(), lead = party.leaderId(), pt = party.party()
    const pw = Math.min(W - 16, 260), ph = 60 + list.length * 11, px = Math.round(W / 2 - pw / 2), py = Math.round(H / 2 - ph / 2)
    panel(U, px, py, pw, ph)
    U.text('THE PARTY', W / 2, py + 7, C.gold, { align: 'center' })
    list.forEach((e, i) => {
      const y = py + 22 + i * 11
      U.text((String(e.id) === String(lead) ? '* ' : '  ') + String(party.link.nameOf(e.id) || e.name).slice(0, 14), px + 8, y, String(e.id) === String(p0.me.id) ? C.gold : C.white)
      U.text('LV ' + e.lv + '  F' + e.cp, px + pw - 8, y, C.dim, { align: 'right' })
    })
    const running = pt && pt.phase === 'play' && !(pt.members || []).some(id => String(id) === String(p0.me.id))
    let foot
    if (running) foot = 'A PARTY IS ON FLOOR ' + pt.floor + '. YOU JOIN AT ITS NEXT STAIRS.'
    else if (party.isLeader()) foot = 'SPACE OR TAP: START AT FLOOR ' + party.startFloor()
    else foot = 'WAITING FOR ' + String(list.find(e => String(e.id) === String(lead))?.name || 'THE LEADER').slice(0, 12) + ' TO START'
    U.wrap(foot, pw - 12).forEach((l, i) => U.text(l, W / 2, py + ph - 30 + i * 9, C.white, { align: 'center' }))
    U.text('Q: BACK', W / 2, py + ph - 11, C.dim, { align: 'center' })
    const inp = menuInput(tap)
    if (!running && party.isLeader() && (inp.confirm || (tap && inside(tap, { x: px, y: py, w: pw, h: ph - 14 })))) { sfx('ui', 0.6); hero.hp = heroStats(hero).maxHp; party.begin(party.startFloor()) }
    if (inp.back || (tap && tap.y > py + ph - 14 && inside(tap, { x: px, y: py, w: pw, h: ph }))) { party.leave(); screen = 'title'; sfx('ui', 0.5) }
  }

  // ---- playing
  let wipeT = 0
  const idle = { moveX: 0, moveY: 0, aim: null, attackPressed: false, attackHeld: false, dashPressed: false, potionPressed: false, confirm: false, tap: null }
  function playScreen(dt, tap) {
    const U = D.ui
    const busy = prologue || victoryT > 0 || fadeT > 0 || (run.me.dead && !coop)
    let minimapRect = null
    // phone buttons that open things
    if (tap && tap.touch && phone() && !overlay) {
      const bt = touchButtons(U).find(b => inside(tap, b))
      if (bt?.key === 'pause' && !busy) { overlay = 'pause'; pauseState = { sel: 0 }; tap = null; sfx('ui', 0.5) }
      else if (bt?.key === 'bag' && !busy) { overlay = 'sheet'; sheetState = {}; tap = null; sfx('ui', 0.5) }
      else if (bt?.key === 'stats' && !busy) { overlay = 'stats'; statsState = {}; tap = null; sfx('ui', 0.5) }
    }
    if (!busy && !overlay) {
      if (was(K.pause, 'Backspace')) { overlay = 'pause'; pauseState = { sel: 0 }; sfx('ui', 0.5) }
      else if (was(K.bag)) { overlay = 'sheet'; sheetState = {}; sfx('ui', 0.5) }
      else if (K.stats && was(K.stats)) { overlay = 'stats'; statsState = {}; sfx('ui', 0.5) }
      else if (was(K.map)) save.map = ((save.map || 0) + 1) % 3
    } else if ((overlay === 'sheet' && was(K.bag)) || (overlay === 'stats' && K.stats && was(K.stats))) { overlay = null; sfx('ui', 0.5) }
    if (busy) overlay = null

    const input = overlay ? idle : readInput(tap)
    const frozen = overlay && !coop
    if (frozen) { /* the world waits */ }
    else if (fadeT > 0) { fadeT += dt; if (fadeT > 0.45) { if (!coop) begin(fadeTo, null, fadeArrive, fadeMode); fadeT = 0 } }
    else if (prologue) { if (was('Space', 'KeyE') || tap) { prologue = false; sfx('ui', 0.5); landT = 0 } }
    else if (victoryT === 0 && !(run.me.dead && !coop)) run.update(dt, overlay ? idle : input)
    else if (run.me.dead && !coop) deadT += dt
    if (!frozen) { landT += dt; if (note) { note.t += dt; if (note.t > 5) note = null } }

    lastCam = run.draw(D)
    const top = phone() ? Math.ceil(58 * U.H / Math.max(1, p0.height)) : 3
    drawHud(D, art, run, { top, phone: phone(), party: coop, mapMode: save.map || 0, keys: { bag: keyName(K.bag), potion: keyName(K.potion), stats: keyName(K.stats) } })
    if (prologue) { U.rect(0, 0, U.W, U.H, rgba(6, 3, 10, 170)); drawPage(U, 'THE SIXTY STAIRS', PROLOGUE, 'SPACE OR TAP TO BEGIN'); landT = 0 }
    else if (landT < 4) drawLandCard(U, run.li, landT)
    if (note) U.wrap(note.text, U.W - 40).forEach((l, i) => U.text(l, U.W / 2, Math.round(U.H * 0.42) + i * 9, C.gold, { align: 'center' }))
    if (fadeT > 0) U.rect(0, 0, U.W, U.H, rgba(0, 0, 0, Math.min(255, Math.round(fadeT / 0.45 * 255))))
    // a tap on the corner map opens it large; a tap on the large one folds it away
    if (tap && !overlay && phone()) {
      const r = drawMinimap({ rect() {}, frame() {}, text() {}, W: U.W, H: U.H }, run, top, save.map || 0)
      if (r && inside(tap, r)) save.map = ((save.map || 0) + 1) % 3
    }

    if (coop && party.isLeader() && victoryT === 0) {
      const pt = party.party(), here = party.present()
      const members = (pt?.members || []).map(String).filter(id => here.has(id) && id !== String(p0.me.id))
      const others = members.map(id => run.others.get(id))
      const alive = [run.me, ...others.filter(Boolean)].filter(p => !p.dead)
      if (run.stairsOpen && alive.length && alive.every(p => p.ready) && others.every(Boolean)) { sfx('stairs', 0.7); party.goTo(run.floor + 1) }
      else if (run.floor > 1 && alive.length && alive.every(p => p.readyUp) && others.every(Boolean)) { sfx('stairs', 0.7); party.goTo(run.floor - 1, 'stairs') }
      if (!alive.length) { wipeT += dt; if (wipeT > 2.5) { wipeT = 0; party.goTo(run.floor) } } else wipeT = 0
    }
    if (coop && run.me.dead) {
      U.text('YOU HAVE FALLEN. YOUR PARTY FIGHTS ON.', U.W / 2, Math.round(U.H * 0.62), C.red, { align: 'center' })
      U.text('YOU RISE AGAIN ON THE NEXT FLOOR.', U.W / 2, Math.round(U.H * 0.62) + 10, C.dim, { align: 'center' })
    }
    if (coop && (run.me.ready || run.me.readyUp) && !run.me.dead) U.text('WAITING FOR THE PARTY AT THE STAIRS', U.W / 2, Math.round(U.H * 0.7), C.gold, { align: 'center' })

    if (!coop && run.me.dead && deadT > 0.8) {
      const cp = run.floor
      U.rect(0, 0, U.W, U.H, rgba(30, 0, 8, Math.min(170, Math.round(deadT * 120))))
      if (run.mode === 'waves') {
        // the arena keeps no checkpoint: the run ends, the best stays
        drawPage(U, 'THE ARENA TAKES YOU', ['You fell in wave ' + run.wave + '.', '', 'Your best: ' + (save.waveBest ? 'wave ' + save.waveBest + ' cleared.' : 'no wave cleared yet.'), 'You keep your level and your gear.'], 'SPACE OR TAP: BACK TO THE TITLE')
        if (deadT > 1.4 && (was('Space', 'KeyE') || tap)) { hero.hp = heroStats(hero).maxHp; hero.potions = Math.max(1, hero.potions); sfx('ui', 0.6); backToTitle() }
      } else {
        const where = run.mode === 'tower' ? 'On floor ' + run.towerN + ' of the Endless Tower.' : 'On floor ' + run.floor + ' of the Sixty Stairs.'
        drawPage(U, 'YOU HAVE FALLEN', [where, '', ...(save.diff === 'nohit' ? ['No Hit: one hit is all it takes.', ''] : []), 'Your lantern relights at the top of this floor. You keep your level and your gear.'], 'SPACE OR TAP: RISE AGAIN')
        if (deadT > 1.4 && (was('Space', 'KeyE') || tap)) { hero.hp = heroStats(hero).maxHp; hero.potions = Math.max(1, hero.potions); sfx('ui', 0.6); if (run.mode === 'tower') begin(run.towerN, null, 'start', 'tower'); else begin(cp) }
      }
    }
    if (victoryT > 0) {
      victoryT += dt
      if (victoryT > 3) {
        U.rect(0, 0, U.W, U.H, rgba(10, 6, 16, Math.min(220, Math.round((victoryT - 3) * 150))))
        if (noHitWin) drawPage(U, 'THE UNTOUCHED LANTERN', ENDING_NOHIT, victoryT > 5 ? 'SPACE OR TAP: RETURN' : '')
        else drawPage(U, 'VORGRATH IS DEFEATED', save.diff === 'nohit' ? [...ENDING, '', 'NO HIT: CLEAR ALL OF THE KEEP, FLOORS 51 TO 60, WITHOUT A HIT FOR ANOTHER ENDING.'] : ENDING, victoryT > 5 ? 'SPACE OR TAP: RETURN' : '')
        if (victoryT > 5 && (was('Space', 'KeyE') || tap)) { victoryT = 0; noHitWin = false; sfx('ui', 0.6); if (coop && party.isLeader()) party.disband(); backToTitle() }
      }
    }

    // the overlays
    if (overlay === 'pause') {
      const pick = drawPauseMenu(D, pauseState, menuInput(tap), sfx, { coop })
      if (pick === 'resume') overlay = null
      else if (pick === 'sheet') { overlay = 'sheet'; sheetState = {} }
      else if (pick === 'stats') { overlay = 'stats'; statsState = {} }
      else if (pick === 'settings') { overlay = 'settings'; settingsState = {} }
      else if (pick === 'quit') backToTitle()
    } else if (overlay === 'sheet') {
      if (drawSheet(D, art, hero, sheetState, menuInput(tap), sfx, () => { run.restat(); persist() })) { overlay = null; sfx('ui', 0.5) }
    } else if (overlay === 'stats') {
      if (drawStats(D, art, hero, statsState, menuInput(tap), sfx, () => { run.restat(); persist() })) { overlay = null; sfx('ui', 0.5) }
    } else if (overlay === 'waystone') {
      const to = drawWaystone(D, wayState, menuInput(tap), sfx, { floors: WAYSTONES.filter(f => f <= save.deepest), here: run.floor, lands: LANDS })
      if (to !== null) {
        overlay = null
        if (to) { sfx('lore', 0.7); if (coop) { if (party.isLeader()) party.goTo(to) } else goFloor(to) }
      }
    } else if (overlay === 'settings') {
      if (drawSettings(D, K, settingsState, menuInput(tap), sfx, settingsOpts())) { overlay = 'pause' }
    }
  }

  // one frame's worth of what the player wants
  function readInput(tap) {
    let mx = (down(K.right) || down('ArrowRight') ? 1 : 0) - (down(K.left) || down('ArrowLeft') ? 1 : 0)
    let my = (down(K.down) || down('ArrowDown') ? 1 : 0) - (down(K.up) || down('ArrowUp') ? 1 : 0)
    const pad = p0.input.gamepad
    if (pad?.axes && Math.hypot(pad.axes[0] || 0, pad.axes[1] || 0) > 0.2) { mx = pad.axes[0]; my = pad.axes[1] }
    // the phone's stick and a controller press W A S D: those move too, whatever the bindings
    if (!mx && !my) { mx = (down('KeyD') ? 1 : 0) - (down('KeyA') ? 1 : 0); my = (down('KeyS') ? 1 : 0) - (down('KeyW') ? 1 : 0) }
    const input = {
      moveX: mx, moveY: my, aim: null,
      attackPressed: was(K.attack), attackHeld: down(K.attack) || (!!(p0.input.pointer.buttons & 1) && p0.time - lastTouch > 1),
      dashPressed: was(K.dash, 'ShiftLeft'), potionPressed: was(K.potion), confirm: was('Space', 'KeyE'), tap: null,
    }
    const Z = lastCam.Z || 2, k = D.ui.W / D.world.W
    const sx = (run.me.x - lastCam.cx) * Z * k, sy = (run.me.y - 6 - lastCam.cy) * Z * k      // the knight, in HUD pixels
    if (tap) {
      if (tap.touch) {
        const bt = touchButtons(D.ui).find(b => inside(tap, b))
        if (bt?.key === 'dash') input.dashPressed = true
        else if (bt?.key === 'potion') input.potionPressed = true
        else if (bt?.key === 'attack') input.attackPressed = true
        else if (!bt) { input.attackPressed = true; input.aim = Math.atan2(tap.y - sy, tap.x - sx) }
      } else { input.attackPressed = true; input.aim = Math.atan2(tap.y - sy, tap.x - sx) }
      input.tap = tap
    }
    if (pad?.axes && Math.hypot(pad.axes[2] || 0, pad.axes[3] || 0) > 0.3) input.aim = Math.atan2(pad.axes[3], pad.axes[2])
    if (input.aim === null && mouseAt && p0.time - mouseT < 3 && p0.time - lastTouch > 3) input.aim = Math.atan2(mouseAt.y - sy, mouseAt.x - sx)
    if (input.aim === null && store.assist && (input.attackPressed || input.attackHeld)) {
      // no mouse, and aim assist on (Settings): aim at the nearest foe in reach (further for bows and staves)
      const reach = run.stats.k.shot ? 140 : 64
      let best = null, bd = reach
      for (const m of run.monsters) { if (m.dead) continue; const d = Math.hypot(m.x - run.me.x, m.y - run.me.y); if (d < bd) { bd = d; best = m } }
      const b = run.boss
      if (b && !b.dead && !b.hidden && Math.hypot(b.x - run.me.x, b.y - run.me.y) < reach + 20) best = b
      if (best) input.aim = Math.atan2(best.y - 6 - run.me.y, best.x - run.me.x)
    }
    return input
  }
}
