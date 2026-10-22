import type {
  CursorData,
  ErrorData,
  HelloData,
  OpEvent,
  PresenceData,
  ServerMessage,
  WelcomeData,
} from './protocol';

export type ConnectionStatus = 'connecting' | 'live' | 'reconnecting' | 'expired';

/** The part of WebSocket that Connection uses, so tests can pass a fake. */
export interface SocketLike {
  readyState: number;
  send(text: string): void;
  close(): void;
  onopen: (() => void) | null;
  onmessage: ((e: { data: string }) => void) | null;
  onclose: (() => void) | null;
}

export interface ConnectionOptions {
  url: string;
  hello: HelloData;
  createSocket?: (url: string) => SocketLike;
  random?: () => number;
}

const OPEN = 1;
const MAX_BACKOFF_MS = 30_000;

/**
 * The room WebSocket (spec 9.6): sends hello on every open, is live from the welcome on, and
 * reconnects with backoff 1 s doubling to 30 s with jitter. not-found is final.
 * It keeps no outbox: after each welcome the controller resends what the server lacks.
 */
export class Connection {
  onWelcome: (data: WelcomeData) => void = () => {};
  onOp: (op: OpEvent) => void = () => {};
  onPresence: (data: PresenceData) => void = () => {};
  onCursor: (data: CursorData) => void = () => {};
  onError: (data: ErrorData) => void = () => {};
  onStatus: (status: ConnectionStatus) => void = () => {};

  private readonly url: string;
  private readonly hello: HelloData;
  private readonly createSocket: (url: string) => SocketLike;
  private readonly random: () => number;
  private socket: SocketLike | null = null;
  private _status: ConnectionStatus = 'connecting';
  private live = false;
  private attempt = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private stopped = true;

  constructor(opts: ConnectionOptions) {
    this.url = opts.url;
    this.hello = opts.hello;
    this.createSocket = opts.createSocket ?? ((url) => new WebSocket(url) as unknown as SocketLike);
    this.random = opts.random ?? Math.random;
  }

  get status(): ConnectionStatus {
    return this._status;
  }

  start(): void {
    if (!this.stopped) return;
    this.stopped = false;
    this._status = 'connecting';
    this.onStatus('connecting');
    this.open();
  }

  stop(): void {
    this.stopped = true;
    this.live = false;
    if (this.timer) clearTimeout(this.timer);
    this.timer = null;
    this.closeSocket();
  }

  /** Sends one message while live. Returns false (and sends nothing) otherwise. */
  send(event: string, data: object): boolean {
    const socket = this.socket;
    if (!this.live || !socket || socket.readyState !== OPEN) return false;
    socket.send(JSON.stringify({ event, data }));
    return true;
  }

  private open(): void {
    const socket = this.createSocket(this.url);
    this.socket = socket;
    this.live = false;
    socket.onopen = () => socket.send(JSON.stringify({ event: 'hello', data: this.hello }));
    socket.onmessage = (e) => this.receive(e.data);
    socket.onclose = () => this.closed(socket);
  }

  private receive(text: string): void {
    let msg: ServerMessage;
    try {
      msg = JSON.parse(text) as ServerMessage;
    } catch {
      return;
    }
    if (!msg || typeof msg !== 'object') return;
    if (msg.event === 'welcome') {
      this.live = true;
      this.attempt = 0;
      this.setStatus('live');
      this.onWelcome(msg.data);
    } else if (msg.event === 'op') {
      if (this.live) this.onOp(msg.data);
    } else if (msg.event === 'presence') {
      if (this.live) this.onPresence(msg.data);
    } else if (msg.event === 'cursor') {
      if (this.live) this.onCursor(msg.data);
    } else if (msg.event === 'error') {
      if (msg.data?.code === 'not-found') this.expire();
      else this.onError(msg.data);
    }
  }

  private expire(): void {
    this.stop();
    this.setStatus('expired');
  }

  private closed(socket: SocketLike): void {
    if (socket !== this.socket) return;
    this.socket = null;
    this.live = false;
    if (this.stopped) return;
    this.setStatus('reconnecting');
    const delay = Math.min(MAX_BACKOFF_MS, 1000 * 2 ** this.attempt) * (0.75 + 0.5 * this.random());
    this.attempt++;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (!this.stopped) this.open();
    }, delay);
  }

  private closeSocket(): void {
    const socket = this.socket;
    this.socket = null;
    if (!socket) return;
    socket.onopen = null;
    socket.onmessage = null;
    socket.onclose = null;
    socket.close();
  }

  private setStatus(status: ConnectionStatus): void {
    if (this._status === status) return;
    this._status = status;
    this.onStatus(status);
  }
}
