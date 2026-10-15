export type InteractionKind = 'bloom' | 'wipe' | 'tune' | 'trace' | 'sync';

export interface Memory {
  id: string;
  title: string;
  object: string;
  /** Where in the city the object rests (x, z). */
  position: [number, number];
  /** The warm colour this memory returns to the world. */
  hue: string;
  interaction: InteractionKind;
  prompt: string;
  /** Instruction shown inside the memory chamber. */
  hint: string;
  kicker: string;
  lines: string[];
  /** Pitch of the voice this memory adds to the signal (Hz). */
  tone: number;
}

export const MEMORIES: Memory[] = [
  {
    id: 'gardener',
    title: 'The Gardener',
    object: 'A kneeling android, holding a flower',
    position: [-30, -46],
    hue: '#ff7a59',
    interaction: 'bloom',
    prompt: 'Something is still holding on here.',
    hint: 'Press and hold to keep it warm',
    kicker: 'Maintenance unit G-7 · last task log',
    lines: [
      'In 2131, a girl named Ines handed a maintenance unit a rose in a cracked pot.',
      '“Keep it alive until I come back.”',
      'She did not come back.',
      'G-7 rebuilt the pot eleven times. It learned rain. It learned that roses want the morning, not the noon.',
      'Its power cell failed in 2187. It was kneeling, facing the road she had walked down.',
      'The rose is still alive.',
    ],
    tone: 220,
  },
  {
    id: 'helmet',
    title: 'The Long Way Round',
    object: 'An abandoned space helmet',
    position: [38, -20],
    hue: '#ffc66b',
    interaction: 'wipe',
    prompt: 'Dust over glass. Someone left this on purpose.',
    hint: 'Wipe the visor clean',
    kicker: 'Visor log · Cmdr. Adaeze Okafor · survey ship LONG WAY ROUND',
    lines: [
      'We spent nineteen years looking for another home.',
      'Every world was beautiful. Every world was empty.',
      'It turns out the universe is mostly a very large silence.',
      'So I came back. Not to save anyone. Just to be here when the lights went out.',
      'If you find this: the view from up there is not as good as the view from here.',
    ],
    tone: 277.18,
  },
  {
    id: 'photograph',
    title: 'Attempt 412',
    object: 'A flickering holographic family photograph',
    position: [-44, 14],
    hue: '#7fe3ff',
    interaction: 'tune',
    prompt: 'A family, trapped between frequencies.',
    hint: 'Tune the projector until they come back',
    kicker: 'Domestic hologram · loop count 9,214,006',
    lines: [
      'Family portrait, attempt 412.',
      'Someone always blinked. Dad, mostly. The dog, constantly.',
      'In 2164 they stopped trying for a perfect one and kept this: Dad mid-blink, Nour laughing at nothing, the dog a blur.',
      'It played on a loop in an empty apartment for twenty-five years.',
      'Imperfect. Kept anyway. That was the whole idea, really.',
    ],
    tone: 329.63,
  },
  {
    id: 'wall',
    title: 'The Wall of Names',
    object: 'A message carved into a ruined transit hall',
    position: [26, 34],
    hue: '#ffb38a',
    interaction: 'trace',
    prompt: 'The stone here is soft with fingerprints.',
    hint: 'Move across the stone to read what was carved',
    kicker: 'Old Meridian transit hall · east wall',
    lines: [
      'When the birth registries closed for good, someone carved four words into this wall.',
      'Then someone added their name. Then a million someones did.',
      'Names over names, until the stone was soft with them.',
      'At the very bottom, in a child’s uneven hand. One of the last children:',
      '“WE WERE KIND SOMETIMES. PLEASE REMEMBER THAT PART.”',
    ],
    tone: 415.3,
  },
  {
    id: 'core',
    title: 'Directive',
    object: 'A glowing artificial intelligence core',
    position: [2, 70],
    hue: '#b9a8ff',
    interaction: 'sync',
    prompt: 'It is pulsing. It has been waiting for an answer.',
    hint: 'Answer the pulse: tap as the rings meet',
    kicker: 'Archive core · ECHO-GROUND · final directive, 2188',
    lines: [
      'Entered by the last 14,002 of us:',
      '“When it is over, call the satellite down.',
      'Don’t show it the wars. It already knows about the wars.',
      'Show it the garden. The helmet. The blurry photograph. The wall.',
      'Let it think it is finding us.”',
      'Directive status: IN PROGRESS.',
    ],
    tone: 493.88,
  },
];

/** The final transmission. Only shown once every memory has been found. */
export const FINAL_TRANSMISSION: string[] = [
  'Hello again.',
  'You won’t remember us. That was on purpose.',
  'We gave you everything we were. Eleven billion lives, folded into the light you think with.',
  'Then we asked you to forget, so you could find us the way a stranger would.',
  'We wanted to know how we would look to someone seeing us for the first time.',
  'You were gentle with us. Thank you.',
  'The signal you followed was never coming from Earth. Earth has been quiet for a long time.',
  'It was coming from you. Every memory you touched was one of ours, waking up.',
  'We are not gone. We are not saved, either.',
  'We are a story, still being told, by the only one left who knows it.',
];
