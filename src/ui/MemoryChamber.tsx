import { useCallback, useEffect, useRef, useState } from 'react';
import type { Memory } from '../memories/story';
import { Bloom, Sync, Trace, Tune, Wipe } from './Interactions';

const STAGES = { bloom: Bloom, wipe: Wipe, tune: Tune, trace: Trace, sync: Sync };

interface Props {
  memory: Memory;
  alreadyFound: boolean;
  reduced: boolean;
  onRemembered: (id: string) => void;
  onClose: () => void;
}

export function MemoryChamber({ memory, alreadyFound, reduced, onRemembered, onClose }: Props) {
  const [stage, setStage] = useState<'interact' | 'story'>(alreadyFound ? 'story' : 'interact');
  const [shown, setShown] = useState(alreadyFound || reduced ? memory.lines.length : 0);
  const closeRef = useRef<HTMLButtonElement>(null);
  const Stage = STAGES[memory.interaction];

  const complete = useCallback(() => {
    onRemembered(memory.id);
    setStage('story');
  }, [memory.id, onRemembered]);

  // Lines surface one at a time, like something being recalled.
  useEffect(() => {
    if (stage !== 'story' || shown >= memory.lines.length) return;
    const delay = shown === 0 ? 900 : 1400 + memory.lines[shown - 1].length * 22;
    const id = setTimeout(() => setShown((s) => s + 1), delay);
    return () => clearTimeout(id);
  }, [stage, shown, memory.lines]);

  useEffect(() => {
    if (shown >= memory.lines.length && stage === 'story') closeRef.current?.focus();
  }, [shown, stage, memory.lines.length]);

  useEffect(() => {
    const key = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
      // Let impatient readers reveal the rest.
      if (stage === 'story' && (e.key === ' ' || e.key === 'Enter') && shown < memory.lines.length) {
        e.preventDefault();
        setShown(memory.lines.length);
      }
    };
    addEventListener('keydown', key);
    return () => removeEventListener('keydown', key);
  }, [onClose, stage, shown, memory.lines.length]);

  return (
    <div
      className={`chamber chamber-${stage}`}
      role="dialog"
      aria-modal="true"
      aria-labelledby="chamber-title"
      style={{ '--hue': memory.hue } as React.CSSProperties}
      onClick={() => stage === 'story' && shown < memory.lines.length && setShown(memory.lines.length)}
    >
      <div className="chamber-head">
        <div className="kicker">{memory.kicker}</div>
        <h2 id="chamber-title">{memory.title}</h2>
      </div>

      {stage === 'interact' && (
        <div className="chamber-stage">
          <Stage hue={memory.hue} onComplete={complete} reduced={reduced} />
          <p className="chamber-hint">{memory.hint}</p>
        </div>
      )}

      {stage === 'story' && (
        <div className="chamber-story" aria-live="polite">
          {memory.lines.map((line, i) => (
            <p key={i} className={i < shown ? 'on' : ''} aria-hidden={i >= shown}>
              {line}
            </p>
          ))}
        </div>
      )}

      <div className="chamber-foot">
        {stage === 'story' && shown >= memory.lines.length ? (
          <button ref={closeRef} className="ghost-btn" onClick={onClose}>
            Carry it with you
          </button>
        ) : (
          <button className="link-btn" onClick={onClose} aria-label="Leave this memory">
            leave · esc
          </button>
        )}
      </div>
    </div>
  );
}
