import { useEffect, useRef } from 'react';
import { MEMORIES } from '../memories/story';

/**
 * The signal: a ring of static that slowly resolves. Inside it, every
 * recovered memory lights one star of a constellation — and the
 * constellation, once complete, is the outline of a person.
 */

// Constellation points (unit space). Which memory lights which limb.
const NODES: Record<string, [number, number][]> = {
  helmet: [[0, -0.72]], // head
  gardener: [[0.62, -0.18]], // the hand that held the rose
  photograph: [[-0.62, -0.18]], // the hand that held the family
  wall: [
    [-0.36, 0.7],
    [0.36, 0.7],
  ], // feet: we were here
  core: [[0, -0.12]], // heart
};
const HEART: [number, number] = [0, -0.12];
const NECK: [number, number] = [0, -0.5];
const HIP: [number, number] = [0, 0.22];

export interface ScopeLive {
  proximity: number;
  activity: number;
}

interface Props {
  found: string[];
  size: number;
  live?: () => ScopeLive;
  /** 0..1, used by the final transmission to resolve into a heartbeat. */
  resolve?: number;
  className?: string;
  label?: boolean;
}

export function SignalScope({ found, size, live, resolve = 0, className, label = true }: Props) {
  const ref = useRef<HTMLCanvasElement>(null);
  const foundRef = useRef(found);
  const resolveRef = useRef(resolve);
  foundRef.current = found;
  resolveRef.current = resolve;

  useEffect(() => {
    const c = ref.current!;
    const dpr = Math.min(devicePixelRatio, 2);
    c.width = size * dpr;
    c.height = size * dpr;
    const ctx = c.getContext('2d')!;
    let raf = 0;
    const reveal: Record<string, number> = {};
    const t0 = performance.now();

    let frame = 0;
    const draw = () => {
      // ~30 fps is plenty for a HUD readout and halves its main-thread cost.
      if (frame++ % 2) {
        raf = requestAnimationFrame(draw);
        return;
      }
      const t = (performance.now() - t0) / 1000;
      const f = foundRef.current;
      const res = resolveRef.current;
      const { proximity, activity } = live ? live() : { proximity: 0, activity: 0 };
      const strength = f.length / MEMORIES.length;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, size, size);
      const cx = size / 2;
      const cy = size / 2;
      const R = size * 0.4;

      // --- the ring of static -> chord
      const noise = (1 - strength) * 0.55 + proximity * 0.6 + activity * 0.4;
      const pts = 220;
      ctx.lineWidth = 1.1;
      for (let layer = 0; layer < 2; layer++) {
        ctx.beginPath();
        for (let i = 0; i <= pts; i++) {
          const a = (i / pts) * Math.PI * 2;
          let r = 0;
          f.forEach((id, k) => {
            const m = MEMORIES.findIndex((mm) => mm.id === id);
            r += Math.sin(a * (3 + m * 2) + t * (0.6 + k * 0.25)) * 0.035;
          });
          const jitter = (Math.random() - 0.5) * noise * 0.14 * (1 - res);
          const beat = res * Math.pow(Math.max(0, Math.sin(t * 5.2)), 12) * 0.08 * Math.max(0, Math.cos(a - Math.PI / 2));
          const rr = R * (1 + r * (1 - res) + jitter + beat + layer * 0.06);
          const x = cx + Math.cos(a) * rr;
          const y = cy + Math.sin(a) * rr;
          i ? ctx.lineTo(x, y) : ctx.moveTo(x, y);
        }
        const warm = Math.min(1, strength + res);
        ctx.strokeStyle =
          layer === 0
            ? `rgba(${180 + 75 * warm},${200 - 20 * warm},${235 - 110 * warm},${0.35 + 0.4 * warm})`
            : `rgba(170,190,230,${0.08 + proximity * 0.2})`;
        ctx.stroke();
      }

      // --- constellation
      const P = ([x, y]: [number, number]) => [cx + x * R * 0.78, cy + y * R * 0.78] as const;
      const glowLine = (a: [number, number], b: [number, number], color: string, alpha: number) => {
        const [x1, y1] = P(a);
        const [x2, y2] = P(b);
        ctx.strokeStyle = color;
        ctx.globalAlpha = alpha;
        ctx.lineWidth = 1.4;
        ctx.beginPath();
        ctx.moveTo(x1, y1);
        ctx.lineTo(x2, y2);
        ctx.stroke();
        ctx.globalAlpha = 1;
      };
      const dot = (p: [number, number], color: string, r: number, alpha: number) => {
        const [x, y] = P(p);
        const g = ctx.createRadialGradient(x, y, 0, x, y, r * 4);
        g.addColorStop(0, color);
        g.addColorStop(1, 'transparent');
        ctx.globalAlpha = alpha;
        ctx.fillStyle = g;
        ctx.beginPath();
        ctx.arc(x, y, r * 4, 0, Math.PI * 2);
        ctx.fill();
        ctx.fillStyle = '#fff';
        ctx.beginPath();
        ctx.arc(x, y, r * 0.6, 0, Math.PI * 2);
        ctx.fill();
        ctx.globalAlpha = 1;
      };

      for (const m of MEMORIES) {
        const isFound = f.includes(m.id);
        reveal[m.id] = (reveal[m.id] ?? 0) + ((isFound ? 1 : 0) - (reveal[m.id] ?? 0)) * 0.03;
        const rv = reveal[m.id];
        for (const p of NODES[m.id]) {
          if (rv > 0.01) {
            const via: [number, number] = m.id === 'wall' ? HIP : m.id === 'helmet' ? NECK : m.id === 'core' ? HEART : NECK;
            if (m.id !== 'core') glowLine(via, p, m.hue, rv * 0.8);
            if (m.id === 'wall') glowLine(HIP, NECK, m.hue, rv * 0.6);
            if (m.id !== 'core' && m.id !== 'wall' && m.id !== 'helmet') glowLine(NECK, HIP, m.hue, rv * 0.25);
            const pulse = m.id === 'core' ? 1 + Math.pow(Math.max(0, Math.sin(t * 2.6)), 8) * 0.8 : 1;
            dot(p, m.hue, 2.6 * pulse, rv);
          }
          // unfound: a faint flicker, brighter as the visitor gets close
          if (rv < 0.99) {
            const flick = 0.15 + proximity * 0.3 * (Math.random() > 0.5 ? 1 : 0.3);
            dot(p, '#9fb4dd', 1.4, (1 - rv) * flick);
          }
        }
      }
      raf = requestAnimationFrame(draw);
    };
    raf = requestAnimationFrame(draw);
    return () => cancelAnimationFrame(raf);
  }, [size, live]);

  const pct = Math.round((found.length / MEMORIES.length) * 100);
  return (
    <div className={className} style={{ width: size }}>
      <canvas ref={ref} style={{ width: size, height: size, display: 'block' }} aria-hidden="true" />
      {label && (
        <div className="scope-label" aria-live="polite">
          <span>SIGNAL</span>
          <span>{pct === 0 ? 'unresolved' : `${pct}% resolved`}</span>
        </div>
      )}
    </div>
  );
}
