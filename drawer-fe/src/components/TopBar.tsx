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

export function TopBar({ status, onShare }: { status: BoardStatus; onShare(): void }) {
  return (
    <header className="top-bar">
      <span className="logo">drawer</span>
      <span className={`status-badge ${TONE[status]}`}>{LABEL[status]}</span>
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
