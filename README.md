# The Last Human Signal

An interactive WebGL story. It's the year 2189. Humanity is gone, and one signal is still calling from Earth.

## Run it

Requires Node 18+.

```bash
npm install
npm run dev        # http://localhost:5173
```

Production build:

```bash
npm run build      # outputs to dist/
npm run preview
```

Everything is procedural: geometry, shaders, textures and sound are all generated in code. There are no
image, model or audio files. The only external request is to Google Fonts (Cormorant Garamond, IBM Plex
Mono), and the page falls back to system fonts if it fails.

## The concept

You are ECHO, an archive satellite that has detected one final transmission from a dead Earth. You descend into
an abandoned megacity under a broken moon and find five objects people left behind. Each object holds a memory.

**The remembrance wave.** This is the visual technique the piece is built around. When you recover a memory,
a warm wavefront rolls out through the fog from that spot and switches the city's windows back on, as they once
were. The lights stay on. By the end, the dark city you landed in is lit again, neighbourhood by neighbourhood,
because you remembered it. It's done entirely in the building fragment shader: up to five wave uniforms, each with
a wavefront ring and a persistent lit radius.

**The signal.** The scope in the corner starts as a ring of static that reacts to your movement and to how
close you are to an unfound memory. Every recovered memory adds a harmonic to the ring and a pure tone to the
soundtrack's chord. It also lights one star of a constellation inside the ring. Only once all five are lit does
the constellation become recognisable: the outline of a person.

**The ending** stays hidden until all five memories are found, and it reframes what came before.

## Controls

| Action | Desktop | Touch |
| --- | --- | --- |
| Look | drag | drag |
| Move | `W A S D` / arrow keys / scroll wheel, `Shift` to go faster | tap the ground to drift there |
| Travel to an echo | click its pale column or its on-screen marker; `Tab` cycles through the markers | tap the column or marker |
| Remember | `E` / `Enter` / click **Remember** | tap **Remember** |
| Leave a memory | `Esc` | **leave** |
| Help | `?` / `H` | **?** button |

## Discoveries

| # | Object | Interaction | Memory |
| --- | --- | --- | --- |
| 1 | A kneeling android holding a rose | **Press and hold** (or hold Space) to keep the flower warm until it blooms | *The Gardener*: a robot that kept a promise for 56 years |
| 2 | An abandoned space helmet | **Wipe** the dust off the visor (drag, or press Space repeatedly) | *The Long Way Round*: the astronaut who came home |
| 3 | A flickering holographic family photo | **Tune** the projector frequency (slider, works with arrow keys) until the family resolves | *Attempt 412*: the imperfect photo they kept |
| 4 | Words carved into a ruined transit hall | **Trace** the carved letters with your cursor or finger (or press →) | *The Wall of Names* |
| 5 | A glowing AI core | **Answer** its pulse: tap or press Space as the rings meet, three times | *Directive*: the last instruction humanity gave |

Recovering all five unlocks the **final transmission**: the camera rises above a city with every window lit, the
transmission is decoded line by line, and then the experience traces the signal to its real source.

## Sound

The soundtrack is generated live with the Web Audio API: a breathing low drone, wind made from filtered
noise, a chord that gains one voice per recovered memory, chimes for interactions, heartbeats during the
transmission, and a convolution reverb built at runtime. Nothing is created until you press **Listen**. The
sound toggle stays in the top-right corner the whole time, and the experience works fully with sound off.

## Accessibility and performance

- Respects `prefers-reduced-motion`: no camera bob or drift, a fade instead of the fast dive, slower and calmer
  interactions, and no grain or pulse animations.
- Every interaction has a keyboard path. The echo markers are focusable buttons, and story text is in
  `aria-live` regions.
- Pixel ratio is capped (1.6 on desktop, 1.25 on touch devices). Antialiasing and particle counts are reduced on
  mobile. The city is two instanced draw calls, there is no post-processing pass, and shaders are compiled up front.
- If WebGL is unavailable, the page shows a message instead of breaking.

## Structure

```
src/
  App.tsx                 story state machine: arrival → city → memories → transmission → epilogue
  memories/story.ts       all narrative text (memories + final transmission)
  world/Engine.ts         renderer, camera choreography, controls, collision, focus/ascent
  world/Space.ts          stars, planet + atmosphere shaders, signal light, satellite
  world/City.ts           procedural city, window/remembrance-wave shader, broken-moon sky, fog, beams, dust
  world/MemoryObjects.ts  the five procedural objects, beacons, motes
  audio/AudioEngine.ts    procedural Web Audio soundscape
  ui/                     signal scope, markers, memory chamber, the five interactions
```
