import { useSyncExternalStore, type Ref } from 'react';
import type { Presence } from '../engine/presence';
import { safeColor } from '../engine/render-rules';

/**
 * One label per other member over the board. React renders the labels when members change;
 * the stage's animation loop moves them with placeCursors (engine/cursor-placement.ts), so cursor moves never re-render.
 */
export function CursorLayer({ presence, layerRef }: { presence: Presence; layerRef?: Ref<HTMLDivElement> }) {
  const { me, members } = useSyncExternalStore(presence.subscribe, presence.getSnapshot);
  return (
    <div className="cursor-layer" ref={layerRef} aria-hidden="true">
      {members
        .filter((m) => m.memberId !== me)
        .map((m) => (
          <div key={m.memberId} className="remote-cursor" data-member={m.memberId} hidden>
            <span className="cursor-dot" style={{ backgroundColor: safeColor(m.color) }} />
            <span className="cursor-name" style={{ backgroundColor: safeColor(m.color) }}>
              {m.name}
            </span>
          </div>
        ))}
    </div>
  );
}
