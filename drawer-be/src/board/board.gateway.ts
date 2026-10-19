import { Inject, Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  SubscribeMessage,
  WebSocketGateway,
  type OnGatewayConnection,
  type OnGatewayDisconnect,
} from '@nestjs/websockets';
import type { WebSocket } from 'ws';
import { appConfig, type AppConfig } from '../config/app.config';
import { BoardHub } from './board-hub';

/** Policy violation: the socket sent no hello in time. */
const CLOSE_NO_HELLO = 1008;

/** WebSocket /ws on the REST port. Messages are JSON { event, data } (spec 6.1). */
@WebSocketGateway({ path: '/ws', maxPayload: 65536 })
export class BoardGateway implements OnGatewayConnection, OnGatewayDisconnect {
  private readonly log = new Logger(BoardGateway.name);

  constructor(
    private readonly hub: BoardHub,
    @Inject(appConfig.KEY) private readonly cfg: AppConfig,
  ) {}

  handleConnection(socket: WebSocket): void {
    const timer = setTimeout(() => {
      if (!this.hub.isJoined(socket)) socket.close(CLOSE_NO_HELLO);
    }, this.cfg.helloTimeoutMs);
    timer.unref();
    socket.once('close', () => clearTimeout(timer));
  }

  handleDisconnect(socket: WebSocket): void {
    this.hub
      .leave(socket)
      .catch((error: Error) => this.log.error('leave failed', error));
  }

  @SubscribeMessage('hello')
  hello(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() data: unknown,
  ): void {
    this.hub
      .join(socket, data)
      .catch((error: Error) => this.log.error('hello failed', error));
  }

  @SubscribeMessage('stroke.start')
  start(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() data: unknown,
  ): void {
    this.hub.op(socket, 'stroke.start', data);
  }

  @SubscribeMessage('stroke.points')
  points(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() data: unknown,
  ): void {
    this.hub.op(socket, 'stroke.points', data);
  }

  @SubscribeMessage('stroke.end')
  end(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() data: unknown,
  ): void {
    this.hub.op(socket, 'stroke.end', data);
  }

  @SubscribeMessage('stroke.undo')
  undo(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() data: unknown,
  ): void {
    this.hub.op(socket, 'stroke.undo', data);
  }

  @SubscribeMessage('stroke.redo')
  redo(
    @ConnectedSocket() socket: WebSocket,
    @MessageBody() data: unknown,
  ): void {
    this.hub.op(socket, 'stroke.redo', data);
  }
}
