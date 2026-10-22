import {
  Inject,
  Injectable,
  Logger,
  type BeforeApplicationShutdown,
} from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { WebSocket } from 'ws';
import { appConfig, type AppConfig } from '../config/app.config';
import { hashKey, sameHash } from '../rooms/ids';
import { RoomStore } from '../rooms/room-store';
import { RoomsService } from '../rooms/rooms.service';
import { BoardRoom, type RoomOp } from './board-room';
import {
  HelloDto,
  parseMessage,
  StrokePointsDto,
  StrokeRefDto,
  StrokeStartDto,
} from './messages';
import type { ErrorCode, MemberView, OpEvent, OpKind } from './protocol';

interface Member {
  roomId: string;
  memberId: string;
  /** hashKey(userKey): the author of this member's strokes. */
  author: string;
  name: string;
  color: string;
}

interface LoadedRoom {
  id: string;
  room: BoardRoom;
  sockets: Set<WebSocket>;
  debounce: NodeJS.Timeout | null;
  maxDelay: NodeJS.Timeout | null;
  /** Abandoned-stroke timers by author. */
  abandoned: Map<string, NodeJS.Timeout>;
  /** Retry of an unload whose write failed. */
  retry: NodeJS.Timeout | null;
}

/** Close codes for temporary conditions: the client reconnects. */
const CLOSE_SERVER_ERROR = 1011;
const CLOSE_RESTARTING = 1012;

const DTO_FOR: Record<
  OpKind,
  new () => StrokeStartDto | StrokePointsDto | StrokeRefDto
> = {
  'stroke.start': StrokeStartDto,
  'stroke.points': StrokePointsDto,
  'stroke.end': StrokeRefDto,
  'stroke.undo': StrokeRefDto,
  'stroke.redo': StrokeRefDto,
};

/**
 * Owns the rooms in memory and the sockets in them (spec 8.2-8.4, 8.6).
 * Op handling is synchronous; disk work happens only in snapshots and loads.
 */
@Injectable()
export class BoardHub implements BeforeApplicationShutdown {
  private readonly log = new Logger(BoardHub.name);
  private readonly members = new Map<WebSocket, Member>();
  private readonly joining = new Set<WebSocket>();
  private readonly loaded = new Map<string, LoadedRoom>();
  private readonly loading = new Map<string, Promise<LoadedRoom>>();
  private shuttingDown = false;

  constructor(
    private readonly rooms: RoomsService,
    private readonly store: RoomStore,
    @Inject(appConfig.KEY) private readonly cfg: AppConfig,
  ) {}

  /** True once the socket sent a hello that is being or was accepted. */
  isJoined(socket: WebSocket): boolean {
    return this.members.has(socket) || this.joining.has(socket);
  }

  isLoaded(roomId: string): boolean {
    return this.loaded.has(roomId) || this.loading.has(roomId);
  }

  async join(socket: WebSocket, data: unknown): Promise<void> {
    if (this.isJoined(socket)) return this.sendError(socket, 'bad-op');
    const hello = parseMessage(HelloDto, data);
    if (!hello) return this.sendError(socket, 'bad-op');
    // Temporary conditions close without not-found, so the client keeps retrying (spec 8.6).
    if (this.shuttingDown) return socket.close(CLOSE_RESTARTING);
    const meta = this.rooms.meta(hello.roomId);
    if (!meta) {
      this.sendError(socket, 'not-found');
      socket.close();
      return;
    }

    this.joining.add(socket);
    let lr: LoadedRoom;
    try {
      // A room can be unloaded by another socket's leave while this one waits; load it again then.
      do lr = await this.load(hello.roomId);
      while (this.loaded.get(hello.roomId) !== lr);
    } catch (error) {
      this.log.error(`load ${hello.roomId} failed`, error as Error);
      socket.close(CLOSE_SERVER_ERROR);
      return;
    } finally {
      this.joining.delete(socket);
    }
    if (socket.readyState !== socket.OPEN) {
      if (lr.sockets.size === 0) await this.unload(lr);
      return;
    }

    const author = hashKey(hello.userKey);
    const member: Member = {
      roomId: lr.id,
      memberId: randomBytes(6).toString('base64url'),
      author,
      name: hello.name,
      color: hello.color,
    };
    this.members.set(socket, member);
    lr.sockets.add(socket);
    const timer = lr.abandoned.get(author);
    if (timer) {
      clearTimeout(timer);
      lr.abandoned.delete(author);
    }
    this.rooms
      .markJoined(lr.id, Date.now())
      .catch((error: Error) => this.log.error('markJoined failed', error));
    const isOwner =
      hello.ownerToken !== undefined &&
      sameHash(hashKey(hello.ownerToken), meta.ownerHash);
    this.send(socket, 'welcome', {
      seq: lr.room.seq,
      you: { memberId: member.memberId, isOwner },
      members: this.memberViews(lr),
      strokes: lr.room.welcomeFor(author),
    });
    this.sendPresence(lr, socket);
  }

  op(socket: WebSocket, kind: OpKind, data: unknown): void {
    const member = this.members.get(socket);
    const lr = member && this.loaded.get(member.roomId);
    if (!member || !lr) return this.sendError(socket, 'not-joined');
    const dto = parseMessage(DTO_FOR[kind], data);
    if (!dto) return this.sendError(socket, 'bad-op');
    const result = lr.room.apply(member.author, kind, dto);
    if (result.kind === 'error')
      return this.sendError(socket, result.code, result.ref);
    if (result.kind === 'ignore') return;
    this.broadcast(lr, result.op, member.memberId, result.echo ? null : socket);
    this.scheduleSnapshot(lr);
  }

  async leave(socket: WebSocket): Promise<void> {
    const member = this.members.get(socket);
    if (!member) return;
    this.members.delete(socket);
    const lr = this.loaded.get(member.roomId);
    if (!lr || this.shuttingDown) return;
    lr.sockets.delete(socket);
    if (lr.sockets.size === 0) return this.unload(lr);
    this.sendPresence(lr, null);
    const authorStays = [...lr.sockets].some(
      (s) => this.members.get(s)?.author === member.author,
    );
    if (!authorStays) this.startAbandonTimer(lr, member.author);
  }

  /** Writes every loaded room before Nest closes the sockets, so a restart loses nothing. */
  async beforeApplicationShutdown(): Promise<void> {
    this.shuttingDown = true;
    const writes: Promise<void>[] = [];
    for (const lr of this.loaded.values()) {
      this.clearTimers(lr);
      writes.push(this.store.writeStrokes(lr.id, lr.room.toFile(false)));
      for (const socket of lr.sockets) socket.close(1001);
    }
    await Promise.allSettled(writes);
  }

  private load(id: string): Promise<LoadedRoom> {
    const ready = this.loaded.get(id);
    if (ready) return Promise.resolve(ready);
    let pending = this.loading.get(id);
    if (!pending) {
      pending = this.store
        .readStrokes(id)
        .then((file) => {
          const lr: LoadedRoom = {
            id,
            room: new BoardRoom(file ?? undefined),
            sockets: new Set(),
            debounce: null,
            maxDelay: null,
            abandoned: new Map(),
            retry: null,
          };
          this.loaded.set(id, lr);
          // Open strokes from the file get the same 30 s grace as after a leave (spec 8.3).
          for (const author of lr.room.openAuthors())
            this.startAbandonTimer(lr, author);
          return lr;
        })
        .finally(() => this.loading.delete(id));
      this.loading.set(id, pending);
    }
    return pending;
  }

  /**
   * Last socket left: write a compacted snapshot and drop the room from memory.
   * Open strokes stay open; the next load restarts their 30 s grace.
   */
  private async unload(lr: LoadedRoom): Promise<void> {
    // The room stays in memory until its file is written (spec 11: keep it loaded on failure).
    this.clearSnapshotTimers(lr);
    const seq = lr.room.seq;
    try {
      await Promise.all([
        this.store.writeStrokes(lr.id, lr.room.toFile(true)),
        this.rooms.markIdle(lr.id, Date.now()),
      ]);
    } catch (error) {
      this.log.error(`unload ${lr.id} failed`, error as Error);
      if (!lr.retry) {
        lr.retry = setTimeout(() => {
          lr.retry = null;
          if (lr.sockets.size === 0 && this.loaded.get(lr.id) === lr)
            void this.unload(lr);
        }, this.cfg.snapshotMaxDelayMs);
        lr.retry.unref();
      }
      return;
    }
    if (
      lr.sockets.size > 0 ||
      this.loaded.get(lr.id) !== lr ||
      this.shuttingDown
    )
      return;
    // Something changed while writing (an abandoned stroke ended): write again.
    if (lr.room.seq !== seq) return this.unload(lr);
    this.clearTimers(lr);
    this.loaded.delete(lr.id);
  }

  private startAbandonTimer(lr: LoadedRoom, author: string): void {
    if (lr.abandoned.has(author)) return;
    const timer = setTimeout(
      () => this.endAbandoned(lr, author),
      this.cfg.abandonedStrokeMs,
    );
    timer.unref();
    lr.abandoned.set(author, timer);
  }

  private endAbandoned(lr: LoadedRoom, author: string): void {
    lr.abandoned.delete(author);
    if (this.loaded.get(lr.id) !== lr) return;
    const ops = lr.room.endAllUnfinished(author);
    for (const op of ops) this.broadcast(lr, op, null, null);
    if (ops.length > 0) this.scheduleSnapshot(lr);
  }

  /** Writes 2 s after the last change, but never later than 10 s after the first unsaved one. */
  private scheduleSnapshot(lr: LoadedRoom): void {
    if (lr.debounce) clearTimeout(lr.debounce);
    lr.debounce = setTimeout(
      () => this.snapshot(lr),
      this.cfg.snapshotDebounceMs,
    );
    lr.debounce.unref();
    if (!lr.maxDelay) {
      lr.maxDelay = setTimeout(
        () => this.snapshot(lr),
        this.cfg.snapshotMaxDelayMs,
      );
      lr.maxDelay.unref();
    }
  }

  private snapshot(lr: LoadedRoom): void {
    if (lr.debounce) clearTimeout(lr.debounce);
    if (lr.maxDelay) clearTimeout(lr.maxDelay);
    lr.debounce = null;
    lr.maxDelay = null;
    if (!lr.room.dirty || this.loaded.get(lr.id) !== lr) return;
    lr.room.markClean();
    this.store
      .writeStrokes(lr.id, lr.room.toFile(false))
      .catch((error: Error) => {
        this.log.error(`snapshot ${lr.id} failed`, error);
        if (this.loaded.get(lr.id) !== lr) return;
        lr.room.markDirty();
        this.scheduleSnapshot(lr);
      });
  }

  private clearSnapshotTimers(lr: LoadedRoom): void {
    if (lr.debounce) clearTimeout(lr.debounce);
    if (lr.maxDelay) clearTimeout(lr.maxDelay);
    lr.debounce = null;
    lr.maxDelay = null;
  }

  private clearTimers(lr: LoadedRoom): void {
    this.clearSnapshotTimers(lr);
    if (lr.retry) clearTimeout(lr.retry);
    lr.retry = null;
    for (const timer of lr.abandoned.values()) clearTimeout(timer);
    lr.abandoned.clear();
  }

  private broadcast(
    lr: LoadedRoom,
    op: RoomOp,
    by: string | null,
    except: WebSocket | null,
  ): void {
    const event: OpEvent = { ...op, by };
    const text = JSON.stringify({ event: 'op', data: event });
    for (const socket of lr.sockets) {
      if (socket !== except && socket.readyState === socket.OPEN)
        socket.send(text);
    }
  }

  /** The members of a room in join order (spec 6.3 `members`). */
  private memberViews(lr: LoadedRoom): MemberView[] {
    const views: MemberView[] = [];
    for (const socket of lr.sockets) {
      const m = this.members.get(socket);
      if (m) views.push({ memberId: m.memberId, name: m.name, color: m.color });
    }
    return views;
  }

  /** `presence { members }` to every open socket in the room except `except`. */
  private sendPresence(lr: LoadedRoom, except: WebSocket | null): void {
    const text = JSON.stringify({
      event: 'presence',
      data: { members: this.memberViews(lr) },
    });
    for (const socket of lr.sockets) {
      if (socket !== except && socket.readyState === socket.OPEN)
        socket.send(text);
    }
  }

  private sendError(socket: WebSocket, code: ErrorCode, ref?: string): void {
    this.send(socket, 'error', ref === undefined ? { code } : { code, ref });
  }

  private send(socket: WebSocket, event: string, data: unknown): void {
    if (socket.readyState === socket.OPEN)
      socket.send(JSON.stringify({ event, data }));
  }
}
