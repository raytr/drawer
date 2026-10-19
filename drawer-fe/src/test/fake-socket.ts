import type { SocketLike } from '../engine/connection';

/** A WebSocket stand-in for tests: records what was sent and lets the test drive the events. */
export class FakeSocket implements SocketLike {
  static instances: FakeSocket[] = [];

  static last(): FakeSocket {
    return FakeSocket.instances[FakeSocket.instances.length - 1];
  }

  static reset(): void {
    FakeSocket.instances = [];
  }

  readonly url: string;
  readyState = 0;
  sent: Array<{ event: string; data: unknown }> = [];
  onopen: (() => void) | null = null;
  onmessage: ((e: { data: string }) => void) | null = null;
  onclose: (() => void) | null = null;

  constructor(url: string) {
    this.url = url;
    FakeSocket.instances.push(this);
  }

  send(text: string): void {
    this.sent.push(JSON.parse(text));
  }

  close(): void {
    this.drop();
  }

  open(): void {
    this.readyState = 1;
    this.onopen?.();
  }

  receive(event: string, data: unknown): void {
    this.onmessage?.({ data: JSON.stringify({ event, data }) });
  }

  drop(): void {
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.();
  }
}
