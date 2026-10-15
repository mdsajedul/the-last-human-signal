import { useEffect, useRef, useState } from 'react';
import { audio } from '../audio/AudioEngine';

interface Props {
  hue: string;
  onComplete: () => void;
  reduced: boolean;
}

// ------------------------------------------------------------- 1. bloom (hold)

export function Bloom({ hue, onComplete }: Props) {
  const [p, setP] = useState(0);
  const holding = useRef(false);
  const done = useRef(false);

  useEffect(() => {
    let raf = 0;
    let last = performance.now();
    let tick = 0;
    const loop = (now: number) => {
      const dt = (now - last) / 1000;
      last = now;
      setP((v) => {
        if (done.current) return 1;
        const nv = Math.max(0, Math.min(1, v + (holding.current ? dt * 0.32 : -dt * 0.4)));
        if (holding.current && nv > tick + 0.1) {
          tick = nv;
          audio.tick(400 + nv * 900);
        }
        if (nv < tick - 0.1) tick = nv;
        if (nv >= 1 && !done.current) {
          done.current = true;
          setTimeout(onComplete, 300);
        }
        return nv;
      });
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    const down = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        holding.current = true;
      }
    };
    const up = (e: KeyboardEvent) => {
      if (e.key === ' ' || e.key === 'Enter') holding.current = false;
    };
    addEventListener('keydown', down);
    addEventListener('keyup', up);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', down);
      removeEventListener('keyup', up);
    };
  }, [onComplete]);

  const petals = 9;
  return (
    <button
      className="stage stage-bloom"
      aria-label="Press and hold (or hold Space) to keep the flower warm"
      onPointerDown={(e) => {
        (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
        holding.current = true;
      }}
      onPointerUp={() => (holding.current = false)}
      onPointerCancel={() => (holding.current = false)}
      onPointerLeave={() => (holding.current = false)}
      onContextMenu={(e) => e.preventDefault()}
    >
      <svg viewBox="-100 -100 200 200" width="100%" height="100%">
        <defs>
          <radialGradient id="warmth">
            <stop offset="0" stopColor={hue} stopOpacity={0.55 * p} />
            <stop offset="1" stopColor={hue} stopOpacity="0" />
          </radialGradient>
        </defs>
        <circle r="95" fill="url(#warmth)" />
        <circle r={60 + p * 30} fill="none" stroke={hue} strokeOpacity={0.15 + p * 0.3} strokeDasharray="2 6" />
        <path d="M0 18 C 4 50, -6 70, 0 100" stroke="#3e6a3a" strokeWidth="2.4" fill="none" />
        <path d="M0 55 C 14 45, 26 50, 30 42 C 18 40, 8 44, 0 55" fill="#3e6a3a" opacity={0.4 + p * 0.5} />
        {Array.from({ length: petals }, (_, i) => {
          const a = (i / petals) * 360;
          const open = 8 + p * 46;
          return (
            <ellipse
              key={i}
              cx="0"
              cy={-open * 0.55}
              rx={7 + p * 9}
              ry={open * 0.55 + 6}
              transform={`rotate(${a + p * 20})`}
              fill={p > 0.02 ? hue : '#555a62'}
              fillOpacity={0.25 + p * 0.55}
              stroke={hue}
              strokeOpacity={0.3 + p * 0.5}
            />
          );
        })}
        <circle r={5 + p * 5} fill="#ffe2b8" opacity={0.4 + p * 0.6} />
      </svg>
      <span className="stage-meter" style={{ width: `${p * 100}%`, background: hue }} />
    </button>
  );
}

// ------------------------------------------------------------- 2. wipe (helmet)

export function Wipe({ hue, onComplete }: Props) {
  const base = useRef<HTMLCanvasElement>(null);
  const dust = useRef<HTMLCanvasElement>(null);
  const done = useRef(false);
  const [progress, setProgress] = useState(0);
  const S = 320;

  useEffect(() => {
    const b = base.current!.getContext('2d')!;
    // The visor: a reflection of Earth from orbit, seen one last time.
    const g = b.createRadialGradient(S * 0.4, S * 0.35, 10, S / 2, S / 2, S / 2);
    g.addColorStop(0, '#3a2a12');
    g.addColorStop(1, '#0a0704');
    b.fillStyle = g;
    b.beginPath();
    b.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    b.fill();
    b.save();
    b.beginPath();
    b.arc(S / 2, S / 2, S / 2 - 4, 0, Math.PI * 2);
    b.clip();
    const eg = b.createRadialGradient(S * 0.58, S * 0.6, 4, S * 0.58, S * 0.6, 80);
    eg.addColorStop(0, '#4a7ab8');
    eg.addColorStop(0.7, '#1d3a66');
    eg.addColorStop(1, 'rgba(40,80,140,0)');
    b.fillStyle = eg;
    b.beginPath();
    b.arc(S * 0.58, S * 0.6, 70, 0, Math.PI * 2);
    b.fill();
    for (let i = 0; i < 90; i++) {
      b.fillStyle = `rgba(255,200,120,${Math.random() * 0.9})`;
      b.fillRect(S * 0.58 - 40 + Math.random() * 60, S * 0.6 - 10 + Math.random() * 60, 1.5, 1.5);
    }
    b.fillStyle = hue;
    b.globalAlpha = 0.85;
    b.font = '600 13px "IBM Plex Mono", monospace';
    b.textAlign = 'center';
    b.fillText('WE LOOKED BACK', S / 2, S * 0.3);
    b.globalAlpha = 0.25;
    b.fillStyle = '#fff';
    b.beginPath();
    b.ellipse(S * 0.32, S * 0.28, 60, 22, -0.6, 0, Math.PI * 2);
    b.fill();
    b.restore();

    const d = dust.current!.getContext('2d')!;
    d.fillStyle = '#6e6457';
    d.fillRect(0, 0, S, S);
    for (let i = 0; i < 5000; i++) {
      const v = 80 + Math.random() * 60;
      d.fillStyle = `rgba(${v},${v - 8},${v - 20},${Math.random() * 0.8})`;
      d.fillRect(Math.random() * S, Math.random() * S, 2 + Math.random() * 3, 2 + Math.random() * 3);
    }
  }, [hue]);

  const erase = (x: number, y: number) => {
    if (done.current) return;
    const d = dust.current!.getContext('2d')!;
    d.globalCompositeOperation = 'destination-out';
    const g = d.createRadialGradient(x, y, 0, x, y, 34);
    g.addColorStop(0, 'rgba(0,0,0,0.9)');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    d.fillStyle = g;
    d.beginPath();
    d.arc(x, y, 34, 0, Math.PI * 2);
    d.fill();
    if (Math.random() < 0.3) audio.tick(2200 + Math.random() * 800);
  };

  const measure = () => {
    const d = dust.current!.getContext('2d')!;
    const data = d.getImageData(0, 0, S, S).data;
    let clear = 0;
    let total = 0;
    for (let y = 30; y < S - 30; y += 8)
      for (let x = 30; x < S - 30; x += 8) {
        if (Math.hypot(x - S / 2, y - S / 2) > S / 2 - 30) continue;
        total++;
        if (data[(y * S + x) * 4 + 3] < 90) clear++;
      }
    const p = clear / total;
    setProgress(p);
    if (p > 0.62 && !done.current) {
      done.current = true;
      dust.current!.style.transition = 'opacity 1.5s';
      dust.current!.style.opacity = '0';
      setTimeout(onComplete, 900);
    }
  };

  useEffect(() => {
    // Keyboard: each press sweeps a stroke across the visor.
    let sweep = 0;
    const key = (e: KeyboardEvent) => {
      if (e.key !== ' ' && e.key !== 'Enter') return;
      e.preventDefault();
      const row = 60 + ((sweep * 37) % 200);
      sweep++;
      for (let x = 20; x < S - 20; x += 12) erase(x, row + Math.sin(x * 0.05) * 14);
      measure();
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  const local = (e: React.PointerEvent) => {
    const r = dust.current!.getBoundingClientRect();
    return [((e.clientX - r.left) / r.width) * S, ((e.clientY - r.top) / r.height) * S] as const;
  };
  let n = 0;
  return (
    <div className="stage stage-wipe" role="application" aria-label="Wipe the dust from the visor. Drag across it, or press Space repeatedly.">
      <canvas ref={base} width={S} height={S} />
      <canvas
        ref={dust}
        width={S}
        height={S}
        className="dust"
        onPointerDown={(e) => {
          (e.target as HTMLElement).setPointerCapture?.(e.pointerId);
          erase(...local(e));
        }}
        onPointerMove={(e) => {
          if (e.buttons === 0 && e.pointerType === 'mouse') return;
          erase(...local(e));
          if (++n % 6 === 0) measure();
        }}
        onPointerUp={measure}
      />
      <span className="stage-meter" style={{ width: `${Math.min(1, progress / 0.62) * 100}%`, background: hue }} />
    </div>
  );
}

// ------------------------------------------------------------- 3. tune (hologram)

export function Tune({ hue, onComplete, reduced }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [value, setValue] = useState(0.08);
  const target = useRef(0.25 + Math.random() * 0.55);
  const valueRef = useRef(value);
  valueRef.current = value;
  const done = useRef(false);
  const lockSince = useRef<number | null>(null);

  useEffect(() => {
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const W = c.width;
    const H = c.height;
    const off = document.createElement('canvas');
    off.width = W;
    off.height = H;
    const o = off.getContext('2d')!;
    const person = (x: number, y: number, s: number) => {
      o.beginPath();
      o.arc(x, y - 70 * s, 22 * s, 0, Math.PI * 2);
      o.fill();
      o.beginPath();
      o.moveTo(x - 42 * s, H);
      o.quadraticCurveTo(x - 46 * s, y - 40 * s, x, y - 44 * s);
      o.quadraticCurveTo(x + 46 * s, y - 40 * s, x + 42 * s, H);
      o.fill();
    };
    o.fillStyle = 'rgba(170,235,255,0.9)';
    person(W * 0.33, H * 0.62, 1.1);
    person(W * 0.62, H * 0.64, 1.0);
    o.fillStyle = 'rgba(255,215,165,0.95)';
    person(W * 0.48, H * 0.8, 0.72);
    o.filter = 'blur(5px)';
    o.beginPath();
    o.ellipse(W * 0.8, H * 0.9, 40, 20, -0.2, 0, Math.PI * 2);
    o.fill();
    o.beginPath();
    o.arc(W * 0.86, H * 0.8, 15, 0, Math.PI * 2);
    o.fill();
    o.filter = 'none';

    let raf = 0;
    const loop = (now: number) => {
      const diff = Math.abs(valueRef.current - target.current);
      const err = done.current ? 0 : Math.min(1, diff * 4);
      ctx.clearRect(0, 0, W, H);
      ctx.globalCompositeOperation = 'lighter';
      const bands = 26;
      for (let i = 0; i < bands; i++) {
        const y = (i / bands) * H;
        const h = H / bands + 1;
        const shift = (Math.sin(i * 12.9 + now * 0.013) * 0.5 + (Math.random() - 0.5)) * err * (reduced ? 30 : 90);
        ctx.globalAlpha = 0.25 + (1 - err) * 0.7;
        ctx.drawImage(off, 0, y, W, h, shift, y, W, h);
        if (err > 0.05) {
          ctx.globalAlpha = err * 0.4;
          ctx.drawImage(off, 0, y, W, h, shift + err * 18, y, W, h);
        }
      }
      ctx.globalAlpha = 1;
      ctx.globalCompositeOperation = 'source-over';
      for (let y = 0; y < H; y += 3) {
        ctx.fillStyle = 'rgba(0,0,0,0.3)';
        ctx.fillRect(0, y, W, 1);
      }
      if (!done.current) {
        if (diff < 0.042) {
          lockSince.current ??= now;
          if (now - lockSince.current > 700) {
            done.current = true;
            audio.chime(659, 0.08, 2);
            setTimeout(onComplete, 600);
          }
        } else lockSince.current = null;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [onComplete, reduced]);

  const diff = Math.abs(value - target.current);
  const clarity = Math.max(0, 1 - diff * 4);
  const locking = diff < 0.042;
  return (
    <div className="stage stage-tune">
      <canvas ref={canvas} width={360} height={240} aria-hidden="true" style={{ filter: `drop-shadow(0 0 ${8 + clarity * 18}px ${hue})` }} />
      <label className="tuner">
        <span>projector frequency</span>
        <input
          type="range"
          min={0}
          max={1}
          step={0.005}
          value={value}
          autoFocus
          aria-valuetext={locking ? 'almost clear' : clarity > 0.5 ? 'faces forming' : 'static'}
          onChange={(e) => {
            setValue(+e.target.value);
            audio.tick(300 + clarity * 1200);
          }}
        />
        <span className="tuner-read" style={{ color: hue }}>
          {(88 + value * 20).toFixed(2)} MHz · {locking ? 'LOCKING' : clarity > 0.5 ? 'faces forming' : 'static'}
        </span>
      </label>
    </div>
  );
}

// ------------------------------------------------------------- 4. trace (carving)

const CARVING = 'WE WERE HERE';

export function Trace({ hue, onComplete }: Props) {
  const [lit, setLit] = useState<number[]>(() => CARVING.split('').map((ch) => (ch === ' ' ? 1 : 0)));
  const done = useRef(false);
  const cursor = useRef(0);

  const light = (i: number) => {
    setLit((prev) => {
      if (prev[i] >= 1) return prev;
      const next = [...prev];
      next[i] = 1;
      audio.tick(500 + i * 90);
      if (next.every((v) => v >= 1) && !done.current) {
        done.current = true;
        setTimeout(onComplete, 900);
      }
      return next;
    });
  };

  const hitTest = (x: number, y: number) => {
    const el = document.elementFromPoint(x, y) as HTMLElement | null;
    const idx = el?.dataset?.idx;
    if (idx !== undefined) light(+idx);
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (!['ArrowRight', ' ', 'Enter'].includes(e.key)) return;
      e.preventDefault();
      while (cursor.current < CARVING.length && CARVING[cursor.current] === ' ') cursor.current++;
      if (cursor.current < CARVING.length) light(cursor.current++);
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  });

  return (
    <div
      className="stage stage-trace"
      role="application"
      aria-label="Run your finger or cursor across the carved letters, or press the right arrow key"
      onPointerMove={(e) => hitTest(e.clientX, e.clientY)}
      onPointerDown={(e) => hitTest(e.clientX, e.clientY)}
    >
      <div className="names" aria-hidden="true">
        {Array.from({ length: 70 }, (_, i) => (
          <span key={i} style={{ opacity: done.current ? 0.5 : 0.12 }}>
            {['Ines', 'Nour', 'Teo', 'Mira', 'Kofi', 'A. Okafor', 'Yusuf', 'Lena', 'Ren', 'Priya', 'Sami', 'Eli', 'Ana', 'Hal'][i % 14]}
          </span>
        ))}
      </div>
      <div className="carving">
        {CARVING.split('').map((ch, i) => (
          <span
            key={i}
            data-idx={i}
            className={lit[i] >= 1 && ch !== ' ' ? 'lit' : ''}
            style={lit[i] >= 1 ? { color: hue, textShadow: `0 0 18px ${hue}` } : undefined}
          >
            {ch === ' ' ? ' ' : ch}
          </span>
        ))}
      </div>
    </div>
  );
}

// ------------------------------------------------------------- 5. sync (core)

export function Sync({ hue, onComplete, reduced }: Props) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const [hits, setHits] = useState(0);
  const hitsRef = useRef(0);
  const start = useRef(performance.now());
  const flash = useRef<{ t: number; ok: boolean } | null>(null);
  const period = reduced ? 2.6 : 2.0;

  // phase 0..1: the outer ring contracts, meeting the inner ring at phase 1.
  const phase = () => (((performance.now() - start.current) / 1000) % period) / period;

  const answer = () => {
    if (hitsRef.current >= 3) return;
    const p = phase();
    const ok = p > 0.86 || p < 0.06;
    flash.current = { t: performance.now(), ok };
    if (ok) {
      hitsRef.current++;
      setHits(hitsRef.current);
      audio.chime(493.88 * (1 + hitsRef.current * 0.25), 0.08, 1.6);
      if (hitsRef.current >= 3) setTimeout(onComplete, 900);
    } else {
      audio.tick(180);
    }
  };

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if ((e.key === ' ' || e.key === 'Enter') && !e.repeat) {
        e.preventDefault();
        answer();
      }
    };
    addEventListener('keydown', key);
    const c = canvas.current!;
    const ctx = c.getContext('2d')!;
    const S = c.width;
    let raf = 0;
    const loop = () => {
      const p = phase();
      ctx.clearRect(0, 0, S, S);
      const cx = S / 2;
      const inner = 52;
      const outer = inner + (1 - p) * 110;
      const f = flash.current;
      const fa = f ? Math.max(0, 1 - (performance.now() - f.t) / 600) : 0;
      // core
      const g = ctx.createRadialGradient(cx, cx, 0, cx, cx, inner * 1.8);
      g.addColorStop(0, hue);
      g.addColorStop(1, 'transparent');
      ctx.globalAlpha = 0.35 + hitsRef.current * 0.18 + fa * 0.4;
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.arc(cx, cx, inner * 1.8, 0, Math.PI * 2);
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.lineWidth = 2;
      ctx.strokeStyle = hue;
      ctx.beginPath();
      ctx.arc(cx, cx, inner, 0, Math.PI * 2);
      ctx.stroke();
      ctx.strokeStyle = f && !f.ok && fa > 0 ? `rgba(255,120,120,${0.4 + fa})` : `rgba(220,225,255,${0.25 + p * 0.6})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cx, outer, 0, Math.PI * 2);
      ctx.stroke();
      // three answered pulses orbit the core
      for (let i = 0; i < 3; i++) {
        const a = (i / 3) * Math.PI * 2 + performance.now() / 1500;
        ctx.fillStyle = i < hitsRef.current ? hue : 'rgba(255,255,255,0.15)';
        ctx.beginPath();
        ctx.arc(cx + Math.cos(a) * (inner + 18), cx + Math.sin(a) * (inner + 18), 4, 0, Math.PI * 2);
        ctx.fill();
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => {
      cancelAnimationFrame(raf);
      removeEventListener('keydown', key);
    };
  });

  return (
    <button className="stage stage-sync" onPointerDown={answer} aria-label={`Tap when the rings meet. ${hits} of 3 answered.`}>
      <canvas ref={canvas} width={320} height={320} />
    </button>
  );
}
