import { Controller, Post } from '@nestjs/common';
import { RoomsService } from './rooms.service';

@Controller('rooms')
export class RoomsController {
  constructor(private readonly rooms: RoomsService) {}

  /** POST /api/rooms -> 201 { roomId, ownerToken } */
  @Post()
  create(): Promise<{ roomId: string; ownerToken: string }> {
    return this.rooms.create();
  }
}
