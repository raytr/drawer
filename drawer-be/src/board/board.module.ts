import { Module } from '@nestjs/common';
import { RoomsModule } from '../rooms/rooms.module';
import { BoardHub } from './board-hub';
import { BoardGateway } from './board.gateway';
import { SweeperService } from './sweeper.service';

@Module({
  imports: [RoomsModule],
  providers: [BoardHub, BoardGateway, SweeperService],
  exports: [BoardHub],
})
export class BoardModule {}
