import { Injectable, type OnModuleInit } from '@nestjs/common';
import { hashKey, newOwnerKey, newRoomId } from './ids';
import type { RoomMeta } from './room-files';
import { RoomStore } from './room-store';

/** Keeps the metadata of every room in memory and on disk. */
@Injectable()
export class RoomsService implements OnModuleInit {
  private readonly rooms = new Map<string, RoomMeta>();

  constructor(private readonly store: RoomStore) {}

  async onModuleInit(): Promise<void> {
    for (const { id, meta } of await this.store.listMetas())
      this.rooms.set(id, meta);
  }

  async create(
    now = Date.now(),
  ): Promise<{ roomId: string; ownerToken: string }> {
    const roomId = newRoomId();
    const ownerToken = newOwnerKey();
    const meta: RoomMeta = {
      createdAt: now,
      firstJoinAt: null,
      lastActiveAt: now,
      ownerHash: hashKey(ownerToken),
    };
    this.rooms.set(roomId, meta);
    await this.store.writeMeta(roomId, meta);
    return { roomId, ownerToken };
  }

  exists(id: string): boolean {
    return this.rooms.has(id);
  }

  meta(id: string): RoomMeta | undefined {
    return this.rooms.get(id);
  }

  async markJoined(id: string, now: number): Promise<void> {
    const meta = this.rooms.get(id);
    if (!meta || meta.firstJoinAt !== null) return;
    meta.firstJoinAt = now;
    await this.store.writeMeta(id, { ...meta });
  }

  async markIdle(id: string, now: number): Promise<void> {
    const meta = this.rooms.get(id);
    if (!meta) return;
    meta.lastActiveAt = now;
    await this.store.writeMeta(id, { ...meta });
  }

  async delete(id: string): Promise<void> {
    this.rooms.delete(id);
    await this.store.deleteRoom(id);
  }

  all(): Array<[string, RoomMeta]> {
    return [...this.rooms];
  }
}
