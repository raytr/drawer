import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { BoardModule } from './board/board.module';
import { appConfig } from './config/app.config';
import { RoomsModule } from './rooms/rooms.module';

@Module({
  imports: [
    ConfigModule.forRoot({ isGlobal: true, load: [appConfig] }),
    RoomsModule,
    BoardModule,
  ],
})
export class AppModule {}
