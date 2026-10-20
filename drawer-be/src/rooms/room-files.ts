/** data/rooms/<roomId>.json */
export interface RoomMeta {
  createdAt: number;
  firstJoinAt: number | null;
  lastActiveAt: number;
  /** SHA-256 hex of the owner token; the token itself is never stored. */
  ownerHash: string;
}

export interface StoredStroke {
  id: string;
  seq: number;
  /** SHA-256 hex of the author's userKey. */
  author: string;
  tool: 'b' | 'e';
  color: string;
  width: number;
  pts: number[];
  /** Number of stroke.points batches accepted so far. */
  batches: number;
  done: boolean;
  deleted: boolean;
}

/** data/rooms/<roomId>.strokes */
export interface StrokesFile {
  v: 1;
  seq: number;
  strokes: StoredStroke[];
}
