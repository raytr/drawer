import type { PresenceSnapshot } from '../engine/presence';
import { safeColor } from '../engine/render-rules';

const MAX_CHIPS = 5;

/** The people in the room as chips. Names come from other users and render as text only. */
export function PresenceList({ snapshot }: { snapshot: PresenceSnapshot }) {
  const { me, members } = snapshot;
  const shown = members.slice(0, MAX_CHIPS);
  const rest = members.length - shown.length;
  return (
    <ul className="presence-list" aria-label="People in this room">
      {shown.map((m) => (
        <li key={m.memberId} className="presence-chip">
          <span className="presence-dot" style={{ backgroundColor: safeColor(m.color) }} />
          {m.name}
          {m.memberId === me && ' (you)'}
        </li>
      ))}
      {rest > 0 && (
        <li className="presence-chip" title={members.slice(MAX_CHIPS).map((m) => m.name).join(', ')}>
          +{rest}
        </li>
      )}
    </ul>
  );
}
