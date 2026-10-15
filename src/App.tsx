import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Engine } from './world/Engine';
import { audio } from './audio/AudioEngine';
import { FINAL_TRANSMISSION, MEMORIES } from './memories/story';
import { MemoryChamber } from './ui/MemoryChamber';
import { SignalScope } from './ui/SignalScope';
import { Markers } from './ui/Hud';

type Phase = 'loading' | 'arrival' | 'diving' | 'city' | 'memory' | 'ascending' | 'transmission' | 'epilogue' | 'error';

const reducedQuery = typeof matchMedia !== 'undefined' ? matchMedia('(prefers-reduced-motion: reduce)') : null;
const isTouch = typeof matchMedia !== 'undefined' && matchMedia('(pointer: coarse)').matches;

export default function App() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [engine, setEngine] = useState<Engine | null>(null);
  const [phase, setPhase] = useState<Phase>('loading');
  const [found, setFound] = useState<string[]>([]);
  const [nearId, setNearId] = useState<string | null>(null);
  const [active, setActive] = useState<string | null>(null);
  const [sound, setSound] = useState(true);
  const [veil, setVeil] = useState<'none' | 'white' | 'black'>('black');
  const [captions, setCaptions] = useState<string[]>([]);
  const [help, setHelp] = useState(false);
  const [skipped, setSkipped] = useState(false);
  const reduced = useMemo(() => !!reducedQuery?.matches, []);
  const complete = found.length === MEMORIES.length;

  // ------------------------------------------------------------ boot
  useEffect(() => {
    let eng: Engine | null = null;
    // Give the browser a frame to paint the loading state first.
    const id = setTimeout(() => {
      try {
        eng = new Engine(canvasRef.current!, reduced);
        if (import.meta.env.DEV) (window as unknown as { __engine: Engine }).__engine = eng;
        setEngine(eng);
        setPhase('arrival');
        setVeil('none');
      } catch (err) {
        console.error(err);
        setPhase('error');
      }
    }, 60);
    return () => {
      clearTimeout(id);
      eng?.dispose();
    };
  }, [reduced]);

  useEffect(() => {
    if (!engine) return;
    engine.events = {
      onDiveDone: () => {
        setVeil('white');
        setTimeout(() => {
          engine.enterCity();
          setPhase('city');
          setVeil('none');
          playCaptions(
            ['SURFACE · EARTH · 2189', 'Atmosphere: breathable. Life signs: none.', 'Signal source: somewhere below. Five echoes detected.'],
            3200,
          );
          setTimeout(() => setHelp(true), 7000);
          setTimeout(() => setHelp(false), 19000);
        }, reduced ? 300 : 900);
      },
      onNear: (id) => setNearId(id),
      onArrive: (id) => openMemory(id),
      onAscentDone: () => {
        setVeil('black');
        setPhase('transmission');
      },
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engine]);

  const captionTimers = useRef<number[]>([]);
  const playCaptions = (lines: string[], every: number) => {
    captionTimers.current.forEach(clearTimeout);
    captionTimers.current = [];
    setCaptions([]);
    lines.forEach((_, i) => {
      captionTimers.current.push(window.setTimeout(() => setCaptions(lines.slice(0, i + 1)), 600 + i * every));
    });
    captionTimers.current.push(window.setTimeout(() => setCaptions([]), 600 + lines.length * every + 3500));
  };

  // ------------------------------------------------------------ actions
  const begin = () => {
    if (!engine || phase !== 'arrival') return;
    if (sound) {
      audio.start();
      audio.swell(reduced ? 2 : 5);
    }
    engine.dive();
    setPhase('diving');
  };

  const toggleSound = () => {
    const next = !sound;
    setSound(next);
    if (next && phase !== 'arrival' && phase !== 'loading') {
      const fresh = !audio.isStarted;
      audio.start();
      // Restore the voices of memories found while the sound was off.
      if (fresh) found.forEach((id) => audio.addSignalVoice(MEMORIES.find((m) => m.id === id)!.tone));
    }
    audio.setEnabled(next);
  };

  const openMemory = useCallback(
    (id: string) => {
      if (!engine) return;
      engine.focus(id);
      setActive(id);
      setPhase('memory');
      setHelp(false);
      audio.chime(330, 0.05, 3);
    },
    [engine],
  );

  const remembered = useCallback(
    (id: string) => {
      const m = MEMORIES.find((mm) => mm.id === id)!;
      engine?.remember(id);
      audio.chime(m.tone * 2, 0.12, 4);
      audio.addSignalVoice(m.tone);
      setFound((f) => (f.includes(id) ? f : [...f, id]));
    },
    [engine],
  );

  const closeMemory = useCallback(() => {
    engine?.release();
    setActive(null);
    setPhase('city');
  }, [engine]);

  useEffect(() => {
    if (phase === 'city' && complete) {
      playCaptions(['Every echo has answered.', 'The signal is whole.'], 2200);
    } else if (phase === 'city' && found.length > 0) {
      const left = MEMORIES.length - found.length;
      playCaptions([`Signal ${Math.round((found.length / MEMORIES.length) * 100)}% resolved. ${left} echo${left > 1 ? 'es' : ''} remain.`], 1);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [found.length, phase === 'city']);

  const receive = () => {
    if (!engine) return;
    audio.finale();
    audio.swell(10, 55);
    engine.ascend();
    setPhase('ascending');
    playCaptions(['Rising.', 'They lit the city for you, once.', 'Decoding final transmission…'], 4200);
  };

  // E to remember when near an echo.
  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (phase === 'arrival' && (e.key === 'Enter' || e.key === ' ')) {
        if ((e.target as HTMLElement).tagName === 'BUTTON') return;
        e.preventDefault();
        skipped ? begin() : skip();
      }
      if (phase === 'city' && nearId && (e.key === 'e' || e.key === 'E' || e.key === 'Enter')) {
        if ((e.target as HTMLElement).tagName === 'BUTTON' && e.key === 'Enter') return;
        openMemory(nearId);
      }
      if (e.key === '?' || e.key === 'h') setHelp((h) => !h);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const skip = () => {
    if (phase !== 'arrival' || skipped) return;
    setSkipped(true);
    engine?.skipArrival();
  };

  const activeMemory = MEMORIES.find((m) => m.id === active) ?? null;
  const nearMemory = MEMORIES.find((m) => m.id === nearId) ?? null;
  const live = useMemo(
    () => () => ({ proximity: engine?.proximity ?? 0, activity: engine?.activity ?? 0 }),
    [engine],
  );

  // Feed proximity to the audio, gently.
  useEffect(() => {
    if (!engine) return;
    const id = setInterval(() => audio.setProximity(engine.proximity), 250);
    return () => clearInterval(id);
  }, [engine]);

  const inCity = phase === 'city' || phase === 'memory';

  return (
    <div className={`app phase-${phase} ${reduced ? 'reduced' : ''}`}>
      <canvas ref={canvasRef} className="world" aria-label="The abandoned city. Drag to look around." />
      <div className="vignette" aria-hidden="true" />
      <div className="grain" aria-hidden="true" />

      {phase === 'loading' && (
        <div className="loading" role="status">
          <span className="blink">▮</span> establishing link
        </div>
      )}

      {phase === 'error' && (
        <div className="loading" role="alert">
          This world needs WebGL, and the link could not be established on this device.
          <br />
          Try a recent desktop or mobile browser with hardware acceleration enabled.
        </div>
      )}

      {/* ---------------------------------------------------- Act I */}
      {(phase === 'arrival' || phase === 'diving') && (
        <section className={`arrival ${skipped ? 'skipped' : ''} ${phase === 'diving' ? 'leaving' : ''}`} onClick={skip}>
          <div className="arrival-meta">ECHO · archive satellite · orbit 412 km · year 2189</div>
          <h1 className="title" aria-label="The Last Human Signal">
            {['THE', 'LAST', 'HUMAN', 'SIGNAL'].map((word, w, words) => {
              const offset = words.slice(0, w).join(' ').length + (w ? 1 : 0);
              return (
                <span key={w} className="word">
                  {word.split('').map((ch, i) => (
                    <span key={i} style={{ animationDelay: `${(skipped ? 0 : 8) + (offset + i) * 0.07}s` }}>
                      {ch}
                    </span>
                  ))}
                </span>
              );
            })}
          </h1>
          <p className="subtitle">Somewhere, something is still calling.</p>
          <button
            className="begin"
            onClick={(e) => {
              e.stopPropagation();
              begin();
            }}
          >
            <span className="begin-ring" aria-hidden="true" />
            Listen
          </button>
          <p className="arrival-note">{sound ? 'best with sound · headphones recommended' : 'sound is off'}</p>
        </section>
      )}

      {/* ---------------------------------------------------- Act II */}
      {engine && inCity && <Markers engine={engine} found={found} hidden={phase === 'memory'} />}

      {(inCity || phase === 'ascending') && (
        <>
          <div className="hud-tl" aria-hidden={phase === 'memory'}>
            <div>ECHO // SURFACE LINK</div>
            <div className="dim">
              memories recovered{' '}
              <span className="count">
                {found.length}/{MEMORIES.length}
              </span>
            </div>
          </div>
          <SignalScope className="hud-scope" found={found} size={isTouch ? 104 : 150} live={live} />
        </>
      )}

      <div className="captions" aria-live="polite">
        {captions.map((c, i) => (
          <p key={c + i}>{c}</p>
        ))}
      </div>

      {phase === 'city' && nearMemory && !found.includes(nearMemory.id) && (
        <div className="near" style={{ '--hue': nearMemory.hue } as React.CSSProperties}>
          <p className="near-object">{nearMemory.object}</p>
          <p className="near-prompt">{nearMemory.prompt}</p>
          <button className="ghost-btn" onClick={() => openMemory(nearMemory.id)}>
            Remember <kbd>E</kbd>
          </button>
        </div>
      )}

      {phase === 'city' && complete && !nearMemory && (
        <div className="near final-call">
          <p className="near-prompt">The signal is whole. It is waiting for you.</p>
          <button className="ghost-btn warm" onClick={receive} autoFocus>
            Receive the final transmission
          </button>
        </div>
      )}

      {help && phase === 'city' && !nearMemory && (
        <div className="help" role="note">
          {isTouch ? (
            <>
              <p>drag to look</p>
              <p>tap the ground to drift there</p>
              <p>tap a pale echo to follow it</p>
            </>
          ) : (
            <>
              <p>
                <kbd>drag</kbd> look around
              </p>
              <p>
                <kbd>W A S D</kbd> <kbd>↑ ↓</kbd> <kbd>scroll</kbd> move · <kbd>shift</kbd> faster
              </p>
              <p>
                <kbd>click</kbd> the ground to drift · <kbd>tab</kbd> through echoes
              </p>
            </>
          )}
          <p className="dim">follow the pale columns of light</p>
        </div>
      )}

      {phase === 'memory' && activeMemory && (
        <MemoryChamber
          key={activeMemory.id}
          memory={activeMemory}
          alreadyFound={found.includes(activeMemory.id)}
          reduced={reduced}
          onRemembered={remembered}
          onClose={closeMemory}
        />
      )}

      {/* ---------------------------------------------------- Act III */}
      {phase === 'transmission' && (
        <Transmission
          reduced={reduced}
          onDone={() => {
            engine?.startEpilogue();
            setVeil('none');
            setPhase('epilogue');
          }}
        />
      )}

      {phase === 'epilogue' && engine && <Epilogue engine={engine} />}

      <div className={`veil veil-${veil}`} aria-hidden="true" />

      {phase !== 'loading' && phase !== 'error' && (
        <div className="hud-tr">
          {inCity && (
            <button className="icon-btn" onClick={() => setHelp((h) => !h)} aria-label="Show controls" aria-pressed={help}>
              ?
            </button>
          )}
          <button className="icon-btn sound" onClick={toggleSound} aria-pressed={sound} aria-label={sound ? 'Mute sound' : 'Enable sound'}>
            <span className={`bars ${sound ? 'on' : ''}`} aria-hidden="true">
              <i />
              <i />
              <i />
              <i />
            </span>
            <span className="sound-label">{sound ? 'sound on' : 'sound off'}</span>
          </button>
        </div>
      )}
    </div>
  );
}

// ------------------------------------------------------------ the transmission

function Transmission({ onDone, reduced }: { onDone: () => void; reduced: boolean }) {
  const [i, setI] = useState(-1);
  const [resolve, setResolve] = useState(0);
  const all = useMemo(() => MEMORIES.map((m) => m.id), []);
  const finished = i >= FINAL_TRANSMISSION.length;

  useEffect(() => {
    const id = setTimeout(
      () => setI((v) => v + 1),
      i === -1 ? 3500 : finished ? 999999 : 2600 + FINAL_TRANSMISSION[i].length * 42,
    );
    return () => clearTimeout(id);
  }, [i, finished]);

  useEffect(() => {
    let raf = 0;
    const s = performance.now();
    const loop = () => {
      setResolve(Math.min(1, (performance.now() - s) / 4000));
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const beat = setInterval(() => audio.heartbeat(), 1208);
    return () => {
      cancelAnimationFrame(raf);
      clearInterval(beat);
    };
  }, []);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'ArrowRight') && !finished) {
        e.preventDefault();
        setI((v) => v + 1);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [finished]);

  return (
    <section className="transmission" onClick={() => !finished && setI((v) => Math.max(v, 0) + 1)}>
      <div className="tx-head">FINAL TRANSMISSION · decoded · origin: unknown</div>
      <SignalScope found={all} size={reduced ? 200 : 240} resolve={resolve} label={false} className="tx-scope" />
      <div className="tx-lines" aria-live="polite">
        {FINAL_TRANSMISSION.map((line, k) => (
          <p key={k} className={k === i ? 'now' : k < i ? 'past' : ''} aria-hidden={k > i}>
            {line}
          </p>
        ))}
      </div>
      {finished ? (
        <button
          className="ghost-btn warm tx-next"
          autoFocus
          onClick={(e) => {
            e.stopPropagation();
            audio.swell(6, 82.4);
            onDone();
          }}
        >
          Trace the source
        </button>
      ) : (
        <p className="tx-skip">click or press space to continue</p>
      )}
    </section>
  );
}

// ------------------------------------------------------------ the epilogue

const EPILOGUE_CUES: [number, string][] = [
  [2.5, 'SIGNAL ORIGIN TRACED'],
  [5, 'Not the planet.'],
  [8, 'ECHO · archive satellite · orbit 412 km'],
  [11, 'You.'],
];

function Epilogue({ engine }: { engine: Engine }) {
  const [t, setT] = useState(0);
  const [answered, setAnswered] = useState(0);

  useEffect(() => {
    const s = performance.now();
    const id = setInterval(() => setT((performance.now() - s) / 1000), 200);
    return () => clearInterval(id);
  }, []);

  const answer = () => {
    engine.pulse();
    const chord = [220, 277.18, 329.63, 415.3, 493.88];
    audio.chime(chord[answered % chord.length] * 2, 0.1, 5);
    setAnswered((a) => a + 1);
  };

  return (
    <section className="epilogue">
      <div className="ep-cues">
        {EPILOGUE_CUES.map(([at, text], k) => (
          <p key={k} className={`cue cue-${k} ${t > at ? 'on' : ''} ${t > 15 ? 'gone' : ''}`}>
            {text}
          </p>
        ))}
      </div>
      <div className={`ep-final ${t > 15.5 ? 'on' : ''}`}>
        <h2 className="ep-title">THE LAST HUMAN SIGNAL</h2>
        <p className="ep-sub">{answered === 0 ? 'The universe is mostly a very large silence.' : 'Somewhere, something is still calling.'}</p>
        {t > 18 && (
          <button className="ghost-btn warm" onClick={answer} autoFocus>
            {answered === 0 ? 'Say something into it' : 'Keep calling'}
          </button>
        )}
        {answered > 0 && (
          <p className="ep-after">
            It's you now.
            <button className="link-btn" onClick={() => location.reload()}>
              begin again
            </button>
          </p>
        )}
      </div>
    </section>
  );
}
