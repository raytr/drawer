import {
  Inject,
  Injectable,
  Logger,
  type OnModuleDestroy,
  type OnModuleInit,
} from '@nestjs/common';
import { appConfig, type AppConfig } from '../config/app.config';
import { RoomsService } from '../rooms/rooms.service';
import { BoardHub } from './board-hub';

/** Deletes rooms nobody joined within 10 minutes and rooms idle for 24 hours (spec 8.4). */
@Injectable()
export class SweeperService implements OnModuleInit, OnModuleDestroy {
  private readonly log = new Logger(SweeperService.name);
  private timer: NodeJS.Timeout | null = null;

  constructor(
    private readonly rooms: RoomsService,
    private readonly hub: BoardHub,
    @Inject(appConfig.KEY) private readonly cfg: AppConfig,
  ) {}

  onModuleInit(): void {
    this.timer = setInterval(() => {
      this.sweep(Date.now()).catch((error: Error) =>
        this.log.error('sweep failed', error),
      );
    }, this.cfg.sweepIntervalMs);
    this.timer.unref();
  }

  onModuleDestroy(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  /** Returns the ids of the deleted rooms. Rooms in memory are never deleted. */
  async sweep(now: number): Promise<string[]> {
    const expired = this.rooms
      .all()
      .filter(([id, meta]) => {
        if (this.hub.isLoaded(id)) return false;
        if (meta.firstJoinAt === null)
          return now - meta.createdAt > this.cfg.unjoinedRoomTtlMs;
        return now - meta.lastActiveAt > this.cfg.idleRoomTtlMs;
      })
      .map(([id]) => id);
    for (const id of expired) await this.rooms.delete(id);
    return expired;
  }
}
