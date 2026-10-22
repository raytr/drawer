import { Presence } from './presence';
import type { Member, WelcomeData } from './protocol';

const fox: Member = { memberId: 'me', name: 'Fox', color: '#1971c2' };
const owl: Member = { memberId: 'owl', name: 'Owl', color: '#e03131' };
const cat: Member = { memberId: 'cat', name: 'Cat', color: '#2f9e44' };
const welcome = (members: Member[]): WelcomeData => ({ seq: 0, you: { memberId: 'me', isOwner: false }, members, strokes: [] });

function recorder() {
  const sent: Array<{ x: number | null; y: number | null }> = [];
  let up = true;
  return {
    sent,
    setUp(v: boolean) {
      up = v;
    },
    link: {
      send(event: string, data: object) {
        if (!up || event !== 'cursor') return false;
        sent.push(data as { x: number | null; y: number | null });
        return true;
      },
    },
  };
}

test('welcome replaces members and clears cursors', () => {
  const p = new Presence();
  p.handleWelcome(welcome([fox, owl]));
  p.handleCursor({ memberId: 'owl', x: 5, y: 6 });
  expect(p.getSnapshot()).toEqual({ me: 'me', members: [fox, owl] });
  expect(p.cursorOf('owl')).toEqual({ x: 5, y: 6 });
  p.handleWelcome(welcome([fox, cat]));
  expect(p.getSnapshot().members).toEqual([fox, cat]);
  expect(p.cursorOf('owl')).toBeUndefined();
});

test('presence drops the cursors of members who left', () => {
  const p = new Presence();
  p.handleWelcome(welcome([fox, owl, cat]));
  p.handleCursor({ memberId: 'owl', x: 1, y: 1 });
  p.handleCursor({ memberId: 'cat', x: 2, y: 2 });
  const v = p.cursorVersion;
  p.handlePresence({ members: [fox, cat] });
  expect(p.cursorOf('owl')).toBeUndefined();
  expect(p.cursorOf('cat')).toEqual({ x: 2, y: 2 });
  expect(p.cursorVersion).toBeGreaterThan(v);
});

test('cursor of me or of an unknown member is ignored; null deletes', () => {
  const p = new Presence();
  p.handleWelcome(welcome([fox, owl]));
  p.handleCursor({ memberId: 'me', x: 1, y: 1 });
  p.handleCursor({ memberId: 'ghost', x: 1, y: 1 });
  expect(p.cursorOf('me')).toBeUndefined();
  expect(p.cursorOf('ghost')).toBeUndefined();
  p.handleCursor({ memberId: 'owl', x: 3, y: 4 });
  p.handleCursor({ memberId: 'owl', x: null, y: null });
  expect(p.cursorOf('owl')).toBeUndefined();
});

test('getSnapshot keeps its identity until members change', () => {
  const p = new Presence();
  const listener = vi.fn();
  p.subscribe(listener);
  p.handleWelcome(welcome([fox, owl]));
  const a = p.getSnapshot();
  p.handleCursor({ memberId: 'owl', x: 3, y: 4 });
  expect(p.getSnapshot()).toBe(a);
  expect(listener).toHaveBeenCalledTimes(1);
  p.handlePresence({ members: [fox] });
  expect(p.getSnapshot()).not.toBe(a);
  expect(listener).toHaveBeenCalledTimes(2);
});

test('pointer sends at most every 100 ms, latest wins', () => {
  const r = recorder();
  const p = new Presence();
  p.link(r.link);
  p.pointer([1, 1], 0);
  p.pointer([2, 2], 30);
  p.pointer([3, 3], 60);
  p.flush(90);
  expect(r.sent).toEqual([{ x: 1, y: 1 }]);
  p.flush(100);
  p.flush(150);
  expect(r.sent).toEqual([
    { x: 1, y: 1 },
    { x: 3, y: 3 },
  ]);
});

test('leaving the board sends null once and drops the pending point', () => {
  const r = recorder();
  const p = new Presence();
  p.link(r.link);
  p.pointer([1, 1], 0);
  p.pointer([2, 2], 10);
  p.pointer(null, 20);
  p.pointer(null, 30);
  p.flush(500);
  expect(r.sent).toEqual([
    { x: 1, y: 1 },
    { x: null, y: null },
  ]);
});

test('sends the link refuses are not counted', () => {
  const r = recorder();
  const p = new Presence();
  p.link(r.link);
  r.setUp(false);
  p.pointer([1, 1], 0);
  r.setUp(true);
  p.pointer([2, 2], 10);
  expect(r.sent).toEqual([{ x: 2, y: 2 }]);
  p.pointer(null, 20);
  expect(r.sent.at(-1)).toEqual({ x: null, y: null });
});

test('reset clears everything', () => {
  const p = new Presence();
  p.handleWelcome(welcome([fox, owl]));
  p.handleCursor({ memberId: 'owl', x: 1, y: 1 });
  p.reset();
  expect(p.getSnapshot()).toEqual({ me: null, members: [] });
  expect(p.cursorOf('owl')).toBeUndefined();
});
