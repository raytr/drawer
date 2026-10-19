import { FakeSocket } from '../test/fake-socket';
import { Connection } from './connection';
import type { HelloData } from './protocol';

const hello: HelloData = { roomId: 'R'.repeat(22), userKey: 'U'.repeat(22), name: 'Fox', color: '#1971c2' };
const welcome = { seq: 0, you: { memberId: 'm', isOwner: false }, strokes: [] };

function makeConnection() {
  const c = new Connection({
    url: 'ws://test/ws',
    hello,
    createSocket: (url) => new FakeSocket(url),
    random: () => 0.5,
  });
  const statuses: string[] = [];
  c.onStatus = (s) => statuses.push(s);
  return { c, statuses };
}

beforeEach(() => {
  FakeSocket.reset();
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

test('sends hello on open and goes live on welcome, before onWelcome runs', () => {
  const { c, statuses } = makeConnection();
  let sentFromWelcome = false;
  c.onWelcome = () => {
    sentFromWelcome = c.send('stroke.end', { strokeId: 'x' });
  };
  c.start();
  expect(FakeSocket.last().url).toBe('ws://test/ws');
  FakeSocket.last().open();
  expect(FakeSocket.last().sent).toEqual([{ event: 'hello', data: hello }]);
  FakeSocket.last().receive('welcome', welcome);
  expect(c.status).toBe('live');
  expect(sentFromWelcome).toBe(true);
  expect(statuses).toEqual(['connecting', 'live']);
});

test('passes ops and errors on', () => {
  const { c } = makeConnection();
  const ops: unknown[] = [];
  const errors: unknown[] = [];
  c.onOp = (op) => ops.push(op);
  c.onError = (e) => errors.push(e);
  c.start();
  FakeSocket.last().open();
  FakeSocket.last().receive('welcome', welcome);
  FakeSocket.last().receive('op', { seq: 1, kind: 'stroke.start', strokeId: 'x' });
  FakeSocket.last().receive('error', { code: 'not-yours', ref: 'x' });
  FakeSocket.last().onmessage?.({ data: 'not json' });
  expect(ops).toEqual([{ seq: 1, kind: 'stroke.start', strokeId: 'x' }]);
  expect(errors).toEqual([{ code: 'not-yours', ref: 'x' }]);
});

test('reconnects with backoff 1 s, then 2 s, and resets it after a welcome', () => {
  const { c, statuses } = makeConnection();
  c.start();
  FakeSocket.last().open();
  FakeSocket.last().receive('welcome', welcome);
  FakeSocket.last().drop();
  expect(c.status).toBe('reconnecting');
  expect(c.send('stroke.end', { strokeId: 'x' })).toBe(false);
  vi.advanceTimersByTime(999);
  expect(FakeSocket.instances).toHaveLength(1);
  vi.advanceTimersByTime(1);
  expect(FakeSocket.instances).toHaveLength(2);
  FakeSocket.last().drop();
  vi.advanceTimersByTime(1999);
  expect(FakeSocket.instances).toHaveLength(2);
  vi.advanceTimersByTime(1);
  expect(FakeSocket.instances).toHaveLength(3);
  FakeSocket.last().open();
  FakeSocket.last().receive('welcome', welcome);
  FakeSocket.last().drop();
  vi.advanceTimersByTime(1000);
  expect(FakeSocket.instances).toHaveLength(4);
  expect(statuses).toEqual(['connecting', 'live', 'reconnecting', 'live', 'reconnecting']);
});

test('backoff stops growing at 30 s and has jitter', () => {
  const c = new Connection({ url: 'ws://t', hello, createSocket: (u) => new FakeSocket(u), random: () => 0 });
  c.start();
  for (let i = 0; i < 8; i++) {
    FakeSocket.last().drop();
    vi.advanceTimersByTime(30_000);
  }
  const before = FakeSocket.instances.length;
  FakeSocket.last().drop();
  vi.advanceTimersByTime(22_499);
  expect(FakeSocket.instances).toHaveLength(before);
  vi.advanceTimersByTime(1);
  expect(FakeSocket.instances).toHaveLength(before + 1);
});

test('not-found stops reconnecting', () => {
  const { c, statuses } = makeConnection();
  c.start();
  FakeSocket.last().open();
  FakeSocket.last().receive('error', { code: 'not-found' });
  FakeSocket.last().drop();
  vi.advanceTimersByTime(60_000);
  expect(c.status).toBe('expired');
  expect(FakeSocket.instances).toHaveLength(1);
  expect(statuses).toEqual(['connecting', 'expired']);
});

test('send works only while live', () => {
  const { c } = makeConnection();
  c.start();
  FakeSocket.last().open();
  expect(c.send('stroke.end', { strokeId: 'x' })).toBe(false);
  FakeSocket.last().receive('welcome', welcome);
  expect(c.send('stroke.end', { strokeId: 'x' })).toBe(true);
  expect(FakeSocket.last().sent.at(-1)).toEqual({ event: 'stroke.end', data: { strokeId: 'x' } });
});

test('stop closes the socket and never reconnects', () => {
  const { c } = makeConnection();
  c.start();
  FakeSocket.last().open();
  c.stop();
  expect(FakeSocket.last().readyState).toBe(3);
  vi.advanceTimersByTime(60_000);
  expect(FakeSocket.instances).toHaveLength(1);
});
