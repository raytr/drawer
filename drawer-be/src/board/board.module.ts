import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { BoardHub } from './board-hub';
import { BoardGateway } from './board.gateway';

@Module({
  imports: [RoomsModule],
  providers: [BoardHub, BoardGateway],
  exports: [BoardHub],
})
export class BoardModule {}
