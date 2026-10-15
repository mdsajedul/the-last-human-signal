import { useEffect, useRef } from 'react';
import type { Engine } from '../world/Engine';
import { MEMORIES } from '../memories/story';

/**
 * Echo markers: one per memory, pinned to the world or to the screen
 * edge. They double as keyboard-focusable shortcuts that fly you there.
 */
export function Markers({ engine, found, hidden }: { engine: Engine; found: string[]; hidden: boolean }) {
  const refs = useRef<Record<string, HTMLButtonElement | null>>({});

  useEffect(() => {
    let raf = 0;
    const loop = () => {
      for (const m of engine.markers) {
        const el = refs.current[m.id];
        if (!el) continue;
        el.style.transform = `translate(${m.x}px, ${m.y}px)`;
        el.dataset.edge = m.onScreen ? '0' : '1';
        el.dataset.far = m.dist > 75 ? '1' : '0';
        el.dataset.close = m.dist < 13 ? '1' : '0';
        const arrow = el.querySelector<HTMLElement>('.mk-arrow');
        if (arrow) arrow.style.transform = `rotate(${-m.angle}rad)`;
        const d = el.querySelector<HTMLElement>('.mk-dist');
        if (d) d.textContent = `${Math.round(m.dist)} m`;
      }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return () => cancelAnimationFrame(raf);
  }, [engine]);

  return (
    <div className={`markers ${hidden ? 'is-hidden' : ''}`}>
      {MEMORIES.map((m, i) => {
        const isFound = found.includes(m.id);
        return (
          <button
            key={m.id}
            ref={(el) => (refs.current[m.id] = el)}
            className={`marker ${isFound ? 'found' : ''}`}
            style={{ '--hue': m.hue } as React.CSSProperties}
            tabIndex={hidden ? -1 : 0}
            aria-label={isFound ? `${m.title}, remembered` : `Unknown echo ${i + 1}. Travel there.`}
            onClick={() => !isFound && engine.approach(m.id)}
          >
            <span className="mk-arrow" aria-hidden="true" />
            <span className="mk-dot" aria-hidden="true" />
            <span className="mk-label" aria-hidden="true">
              {isFound ? m.title : `echo ${String(i + 1).padStart(2, '0')}`}
              <span className="mk-dist" />
            </span>
          </button>
        );
      })}
    </div>
  );
}
