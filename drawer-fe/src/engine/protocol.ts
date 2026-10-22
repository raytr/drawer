/** Client copy of the server message shapes (spec section 6; drawer-be src/board/protocol.ts). */

export type OpKind = 'stroke.start' | 'stroke.points' | 'stroke.end' | 'stroke.undo' | 'stroke.redo';

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

export interface WelcomeStroke {
  id: string;
  seq: number;
  tool: 'b' | 'e';
  color: string;
  width: number;
  pts: number[];
  /** Number of stroke.points batches the server has. */
  batches: number;
  done: boolean;
  deleted: boolean;
  mine: boolean;
}

/** One member of the room. One member per socket, so two tabs are two members. */
export interface Member {
  memberId: string;
  name: string;
  color: string;
}

export interface WelcomeData {
  seq: number;
  you: { memberId: string; isOwner: boolean };
  /** Everyone in the room, this tab included, in join order. */
  members: Member[];
  strokes: WelcomeStroke[];
}

export interface PresenceData {
  members: Member[];
}

/** Another member's cursor in board pixels; null when it left the board. */
export interface CursorData {
  memberId: string;
  x: number | null;
  y: number | null;
}

export interface ErrorData {
  code: string;
  ref?: string;
}

export interface HelloData {
  roomId: string;
  userKey: string;
  ownerToken?: string;
  name: string;
  color: string;
}

export type ServerMessage =
  | { event: 'welcome'; data: WelcomeData }
  | { event: 'op'; data: OpEvent }
  | { event: 'error'; data: ErrorData }
  | { event: 'presence'; data: PresenceData }
  | { event: 'cursor'; data: CursorData };
