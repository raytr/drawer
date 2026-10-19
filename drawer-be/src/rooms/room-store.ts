import { Inject, Injectable } from '@nestjs/common';
import {
  mkdir,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from 'node:fs/promises';
import * as path from 'node:path';
import { appConfig, type AppConfig } from '../config/app.config';
import type { RoomMeta, StrokesFile } from './room-files';

/**
 * Room files on disk. Every write goes to a temp file first and then replaces the
 * real file with rename, so a crash never leaves half a file.
 * Writes and deletes of one room run one after another, and reads of that room
 * wait for them: the last call wins, and a read never sees an older file than a
 * write that was already called. Values are serialized when the write is called,
 * so later changes to a live room never leak into a queued write.
 */
@Injectable()
export class RoomStore {
  private readonly dir: string;
  private readonly queues = new Map<string, Promise<void>>();
  private dirReady: Promise<string | undefined> | null = null;
  private tmpCounter = 0;

  constructor(@Inject(appConfig.KEY) cfg: AppConfig) {
    this.dir = path.join(cfg.dataDir, 'rooms');
  }

  writeMeta(id: string, meta: RoomMeta): Promise<void> {
    const text = JSON.stringify(meta);
    return this.enqueue(id, () =>
      this.writeAtomic(this.file(id, 'json'), text),
    );
  }

  async readMeta(id: string): Promise<RoomMeta | null> {
    await this.settled(id);
    return this.readJson<RoomMeta>(this.file(id, 'json'));
  }

  async listMetas(): Promise<Array<{ id: string; meta: RoomMeta }>> {
    let names: string[];
    try {
      names = await readdir(this.dir);
    } catch (error) {
      if (isMissing(error)) return [];
      throw error;
    }
    const rooms: Array<{ id: string; meta: RoomMeta }> = [];
    for (const name of names) {
      if (!name.endsWith('.json')) continue;
      const id = name.slice(0, -'.json'.length);
      const meta = await this.readMeta(id);
      if (meta) rooms.push({ id, meta });
    }
    return rooms;
  }

  writeStrokes(id: string, file: StrokesFile): Promise<void> {
    const text = JSON.stringify(file);
    return this.enqueue(id, () =>
      this.writeAtomic(this.file(id, 'strokes'), text),
    );
  }

  async readStrokes(id: string): Promise<StrokesFile | null> {
    await this.settled(id);
    return this.readJson<StrokesFile>(this.file(id, 'strokes'));
  }

  deleteRoom(id: string): Promise<void> {
    return this.enqueue(id, async () => {
      await rm(this.file(id, 'json'), { force: true });
      await rm(this.file(id, 'strokes'), { force: true });
    });
  }

  private file(id: string, ext: 'json' | 'strokes'): string {
    return path.join(this.dir, `${id}.${ext}`);
  }

  private enqueue(id: string, task: () => Promise<void>): Promise<void> {
    const run = (this.queues.get(id) ?? Promise.resolve()).then(task);
    const tail = run.catch(() => undefined);
    this.queues.set(id, tail);
    void tail.then(() => {
      if (this.queues.get(id) === tail) this.queues.delete(id);
    });
    return run;
  }

  private async settled(id: string): Promise<void> {
    await this.queues.get(id);
  }

  private async writeAtomic(target: string, text: string): Promise<void> {
    this.dirReady ??= mkdir(this.dir, { recursive: true });
    await this.dirReady;
    const tmp = `${target}.${process.pid}.${this.tmpCounter++}.tmp`;
    await writeFile(tmp, text);
    await rename(tmp, target);
  }

  private async readJson<T>(file: string): Promise<T | null> {
    try {
      return JSON.parse(await readFile(file, 'utf8')) as T;
    } catch (error) {
      if (isMissing(error)) return null;
      throw error;
    }
  }
}

function isMissing(error: unknown): boolean {
  return (error as NodeJS.ErrnoException | null)?.code === 'ENOENT';
}
