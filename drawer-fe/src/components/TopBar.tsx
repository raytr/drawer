import type { ReactNode } from 'react';
import type { ConnectionStatus } from '../engine/connection';

export type BoardStatus = ConnectionStatus | 'local' | 'creating';

const LABEL: Record<BoardStatus, string> = {
  local: 'Local only',
  creating: 'Creating room',
  connecting: 'Connecting',
  live: 'Live',
  reconnecting: 'Offline, retrying',
  expired: 'Room expired',
};

const TONE: Record<BoardStatus, string> = {
  local: 'status-local',
  creating: 'status-pending',
  connecting: 'status-pending',
  live: 'status-live',
  reconnecting: 'status-pending',
  expired: 'status-local',
};

export function TopBar({
  status,
  onShare,
  people = 0,
  children,
}: {
  status: BoardStatus;
  onShare(): void;
  /** Members in the room, this tab included. Shown on the Live badge. */
  people?: number;
  /** The presence list, shown between the badge and Share. */
  children?: ReactNode;
}) {
  const label = status === 'live' && people > 0 ? `Live · ${people}` : LABEL[status];
  return (
    <header className="top-bar">
      <span className="logo">drawer</span>
      <span className={`status-badge ${TONE[status]}`}>{label}</span>
      {children}
      <button
        type="button"
        className={status === 'local' ? 'share-button primary' : 'share-button'}
        disabled={status === 'creating'}
        onClick={onShare}
      >
        Share
      </button>
    </header>
  );
}
