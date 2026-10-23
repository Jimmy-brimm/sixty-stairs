// The story of the Sixty Stairs. Every line is drawn in the HUD's pixel font: keep them under about 46 characters.

export const TITLE = 'PIXEL DUNGEON'
export const SUBTITLE = 'THE SIXTY STAIRS'

export const PROLOGUE = [
  'Long ago the demon lord VORGRATH could not',
  'conquer the world above, so he stole it.',
  '',
  'He tore five lands from their roots and',
  'stacked them under the earth, one beneath',
  'another, sixty floors deep. His castle sits',
  'at the bottom. The people of those lands',
  'became his beasts.',
  '',
  'You are the last of the Lantern Knights.',
  'Your lantern can still find the way down.',
]

// one for each land, shown on its first floor
export const LANDS = [
  { name: 'THE GLIMMER CAVES', lines: ['The first stair. Miners once sang here;', 'now only the crystals hum.'] },
  { name: 'THE WHEATWIND PLAINS', lines: ['A whole countryside, sky and all, folded', 'under the stone. Its sun is a stolen lamp.'] },
  { name: 'THE ELDERWOOD', lines: ['The oldest forest in the world, still', 'angry about being moved.'] },
  { name: 'THE SUNSCAR DESERT', lines: ['Sand from a kingdom of tombs. Its kings', 'did not stay buried.'] },
  { name: 'THE ASHEN PEAKS', lines: ['The old dwarves\' forge, now the furnace', 'that keeps the Demon Lord warm.'] },
  { name: 'VORGRATH\'S KEEP', lines: ['Red brick laid by stolen hands.', 'The Demon Lord waits on the sixtieth floor.'] },
]

// the stones you find on the way: floor -> page
export const STONES = {
  3: ['LANTERN KNIGHT\'S LOG, DAY ONE', 'The stair goes on and on. A miner told me', 'the Demon Lord took his whole mountain', 'in a single night.'],
  6: ['A MINER\'S SCRATCHINGS', 'The crystals are the tears of the mountain', 'spirit. Gemmaw the wyrm eats them,', 'and grows.'],
  9: ['LANTERN KNIGHT\'S LOG', 'My lantern flickers near the tenth stair.', 'Something huge is burrowing beneath it.'],
  13: ['A HARVEST SONG, CARVED IN WOOD', 'This field fed the city of Harrowmere.', 'The farmers are goblins now. They still', 'hum the harvest songs.'],
  16: ['A CROW-KEEPER\'S NOTE', 'The Scarecrow King was a kind guardian', 'of crows, until Vorgrath set a demon\'s', 'ember in his chest.'],
  19: ['LANTERN KNIGHT\'S LOG', 'Beyond the hedges the stair falls into', 'green dark. Keep your lantern high.'],
  23: ['WORDS GROWN INTO THE BARK', 'The Elderwood remembers the sky. Its trees', 'still lean toward a sun that is gone.'],
  26: ['A DRUID\'S WARNING', 'Rootmother bore every tree in this wood.', 'Vorgrath chained her roots to his castle;', 'her pain holds up his walls.'],
  29: ['LANTERN KNIGHT\'S LOG', 'A knight came this far before me. I found', 'her lantern on a branch, still warm.'],
  33: ['A TOMB INSCRIPTION', 'Sunscar was a kingdom of patient kings.', 'They wrapped themselves in linen and', 'waited for a better age.'],
  36: ['A GRAVE-ROBBER\'S LAST WORDS', 'Sandmaw swallowed the royal tombs whole.', 'It sleeps under the dunes and wakes', 'at the sound of footsteps.'],
  39: ['LANTERN KNIGHT\'S LOG', 'The sand grows warm. Below me the stone', 'glows red.'],
  43: ['A DWARVEN FORGE-MARK', 'Our blades were forged here, before the', 'Peaks were stolen. Ignarok kept the forge.'],
  46: ['A SMITH\'S PRAYER', 'Ignarok was a forge-golem, not a monster.', 'Vorgrath filled him with molten hate.', 'Cool him, and he may rest.'],
  49: ['LANTERN KNIGHT\'S LOG', 'I can hear castle bells through the rock.', 'Ten more stairs.'],
  53: ['WHISPERS IN THE WALL', 'Every red brick is a promise Vorgrath', 'broke. The walls murmur the names of', 'the stolen.'],
  56: ['A TORN PAGE', 'The Demon Lord fears one thing: a lantern', 'carried all the way down. That is why he', 'took our order first.'],
  59: ['THE LAST LANTERN KNIGHT\'S LOG', 'If you are reading this, you are the last', 'of us. Light the way home.'],
}

// the lord of each land, on its tenth floor
export const BOSSES = [
  { name: 'GEMMAW, THE CRYSTAL WYRM', fall: 'The wyrm shatters into glittering dust. The crystals stop crying.' },
  { name: 'THE SCARECROW KING', fall: 'The ember gutters out. A flock of crows settles on his shoulders.' },
  { name: 'ROOTMOTHER', fall: 'Her chains snap. Somewhere far below, a castle wall cracks.' },
  { name: 'SANDMAW, THE TOMB-EATER', fall: 'The serpent sinks. The kings\' tombs are quiet again.' },
  { name: 'IGNAROK, THE MOLTEN FORGE', fall: 'The golem cools to stone and kneels, as if to rest.' },
  { name: 'VORGRATH, THE DEMON LORD', fall: '' },
]

export const ENDING = [
  'Vorgrath falls, and his castle with him.',
  '',
  'One by one the stolen lands rise toward',
  'the sky they remember: the peaks, the',
  'desert, the old wood, the plains, the caves.',
  '',
  'The last Lantern Knight climbs sixty stairs',
  'home, and the lantern is never needed',
  'again.',
  '',
  'THANK YOU FOR PLAYING.',
]

// the ending for a Keep cleared without a single hit (No Hit, floors 51 to 60)
export const ENDING_NOHIT = [
  'Vorgrath falls, and not once did he touch you.',
  '',
  'Sixty stairs of claws and fire, and your',
  'lantern never so much as flickered. The',
  'Demon Lord dies not knowing your face.',
  '',
  'The stolen lands rise, and the people of',
  'the five lands wake as people again. They',
  'tell of a knight they never saw clearly:',
  'only a light that moved through the dark',
  'and was never caught.',
  '',
  'They hang a lantern over every door, unlit,',
  'for the one who did not need it.',
  '',
  'THE UNTOUCHED LANTERN. THANK YOU FOR PLAYING.',
]

export const WEAPONS = ['RUSTED BLADE', 'PLAINSTEEL SWORD', 'THORNWOOD SABER', 'SUNFORGED SCIMITAR', 'MAGMASTEEL BLADE', 'LANTERN BRAND']
export const ARMORS = ['PADDED TUNIC', 'CHAINMAIL', 'BARKPLATE', 'SANDSCALE MAIL', 'OBSIDIAN PLATE', 'LANTERN AEGIS']

// what changed, newest first: the title's What's New pages (drawn in mixed case)
export const CHANGELOG = [
  { v: '3.5.2', name: 'Carried Lanterns', items: [
    'Move your save between the Claude page and the website: press ?, then Copy my save on one, and Load a save on the other.',
  ] },
  { v: '3.5.1', name: 'Open Doors', items: [
    'Play Together on the Claude page no longer gives up when the connection is slow: it lights up as soon as the others can be reached.',
    'Where it cannot connect, the title says why, and how many others have the game open when it can.',
  ] },
  { v: '3.5', name: 'Long Shots', items: [
    'Arrows hit harder the farther they fly: three quarters of their damage point-blank, full from about four tiles, and up to 1.4 times from far off.',
    'Chargers that ram a wall are stunned for a moment, with stars round their heads, and take extra damage while dazed. Lords that charge into a wall are stunned too.',
  ] },
  { v: '3.4', name: 'Five Roads Down', items: [
    'Difficulty in the settings, kept for each save file: Story, Normal, Hard, Nightmare and No Hit.',
    'Normal is harder than before: monsters have more health, and they and the lords hit harder.',
    "No Hit: one hit and you fall. Clear all of the Keep, floors 51 to 60, without a hit and Vorgrath's end is told another way.",
    "The difficulty shows by the floor's name when it is not Normal.",
    'Fourteen new music tracks: a second theme for the deeper floors of every land, a theme for each lord, the party lobby and the ending.',
  ] },
  { v: '3.3', name: 'Steady Hands', items: [
    'The bow draws while you hold attack and shoots when you let go: the longer the draw, the harder and faster the arrow. A faint line shows where it will fly.',
    'The bow is held the right way round.',
    'A new roll: tucked up, head over heels. A small grey bar under you fills while the next roll comes back.',
    'Attacks no longer turn to the nearest foe by themselves; Aim at Nearest Foe in the settings turns that back on.',
    'Less knockback, for you and for what you hit.',
    'Chests and drops are new every time, not the same on every visit.',
    'Levels give 3 points again, and heroes start with less health.',
    'Play Together shows for everyone, and says how to join where the page cannot connect you.',
  ] },
  { v: '3.2', name: 'Two Lanterns', items: [
    'Play Together on the Claude page: everyone who has the game open at the same time can join one party.',
    'Your friend needs the page shared with them and must be signed in to Claude.',
    'Party members show by their Claude names.',
  ] },
  { v: '3.1.1', name: 'A Gentler Start', items: [
    'The title fades in: up from black, then the logo, then the menu one line at a time. A key or a tap skips it.',
    'Fixed: on some screens the last line of the menu ran into the version number.',
  ] },
  { v: '3.1', name: 'The Painted Title', items: [
    'A new title screen: your own hero, lantern raised, in their colours and with their class weapon.',
    'A new logo, and a quieter menu that says what each choice does.',
    'This page: What\'s New.',
  ] },
  { v: '3.0', name: 'Both Ways Down', items: [
    'Stairs up at the top of every floor: you can climb back as well as go down.',
    'Waystones on floors 1, 11, 21, 31, 41 and 51 take you to any of them you have reached.',
    'The game saves at the start of every floor; a fall sends you back to the top of that floor.',
    'The dash is now a roll, head over heels, and nothing can hit you mid-roll.',
    'A stats menu of its own: C, the STAT button on phones, or the pause menu.',
    'Levels come slower but give 5 points each, and 6 health.',
    'The mage holds the staff upright and casts magic arrows.',
    'Fixed: arrows and magic arrows flew through a foe standing right on top of you.',
    'A lord\'s rare treasure drops only the first time you beat it.',
  ] },
  { v: '2.1', name: 'Three Lanterns', items: [
    'Three save files, for solo and co-op.',
    'A graphics setting (auto, high, medium, low) for smoother play on slower machines.',
  ] },
  { v: '2.0', name: 'Steel and Spells', items: [
    'Make your hero: knight, ranger or mage, with a head, skin, hair and colours of your own.',
    'Real weapons: swords, spears, axes, bows and staves, from common to legendary.',
    'Levels and stat points to spend, and a sheet for your gear and bag.',
    'Sharper art, made in 3D and drawn back into pixels, with light and shadow.',
    'A faint red line warns you before a bat or a boar dashes at you.',
    'Keys you can change, a map that folds away, and a pause menu.',
  ] },
  { v: '1.0', name: 'The First Descent', items: [
    'Sixty floors through six stolen lands, down to Vorgrath\'s keep.',
    'Real-time fights, a lord on every tenth floor, and lore stones along the way.',
    'Play alone, or as a party in co-op.',
  ] },
]
