import type { StoredStroke } from '../rooms/room-files';

/** Board ops a client can send after hello (spec section 6.2). */
export type OpKind =
  | 'stroke.start'
  | 'stroke.points'
  | 'stroke.end'
  | 'stroke.undo'
  | 'stroke.redo';

/** The data of a server `op` event. `by` is the member id, or null for ops the server makes itself. */
export interface OpEvent {
  seq: number;
  by: string | null;
  kind: OpKind;
  strokeId: string;
  tool?: 'b' | 'e';
  color?: string;
  width?: number;
  n?: number;
  pts?: number[];
}

/** One stroke in `welcome`: the stored stroke without its author hash, plus whether it belongs to this user. */
export type WelcomeStroke = Omit<StoredStroke, 'author'> & { mine: boolean };

/** One member of a room as clients see it. One member per socket. */
export interface MemberView {
  memberId: string;
  name: string;
  color: string;
}

export type ErrorCode = 'not-found' | 'not-yours' | 'bad-op' | 'not-joined';
