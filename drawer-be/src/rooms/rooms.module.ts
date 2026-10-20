import { Module } from '@nestjs/common';
import { RoomStore } from './room-store';
import { RoomsController } from './rooms.controller';
import { RoomsService } from './rooms.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomStore, RoomsService],
  exports: [RoomStore, RoomsService],
})
export class RoomsModule {}
