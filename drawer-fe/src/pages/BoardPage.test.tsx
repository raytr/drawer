import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createRoom } from '../api/rooms';
import { FakeSocket } from '../test/fake-socket';
import { BoardPage } from './BoardPage';

vi.mock('../api/rooms', () => ({ createRoom: vi.fn() }));
const mockCreate = vi.mocked(createRoom);

const ROOM = 'R'.repeat(22);
const ROOM2 = 'Q'.repeat(22);
const TOKEN = 't'.repeat(43);
const FOX = { memberId: 'm', name: 'Fox', color: '#1971c2' };
const OWL = { memberId: 'o', name: 'Owl', color: '#e03131' };
const welcome = { seq: 0, you: { memberId: 'm', isOwner: true }, members: [FOX], strokes: [] };

function pe(type: string, init: Record<string, number | string>) {
  return Object.assign(new Event(type, { bubbles: true }), { pointerId: 1, button: 0, pointerType: 'mouse', clientX: 0, clientY: 0, ...init });
}

function drawOneStroke(container: HTMLElement) {
  const stage = container.querySelector('.canvas-stage')!;
  fireEvent(stage, pe('pointerdown', { clientX: 1, clientY: 1 }));
  fireEvent(stage, pe('pointerup', {}));
}

function badge() {
  return document.querySelector('.status-badge')!.textContent;
}

beforeEach(() => {
  history.replaceState(null, '', '/');
  localStorage.clear();
  sessionStorage.clear();
  FakeSocket.reset();
  vi.stubGlobal('WebSocket', FakeSocket);
  mockCreate.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

test('Share creates a room, moves to /r/<id>, shows the link, and replays the board', async () => {
  mockCreate.mockResolvedValue({ roomId: ROOM, ownerToken: TOKEN });
  const { container } = render(<BoardPage />);
  expect(badge()).toBe('Local only');
  drawOneStroke(container);
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  const dialog = await screen.findByRole('dialog', { name: 'Share this board' });
  expect(mockCreate).toHaveBeenCalledTimes(1);
  expect(location.pathname).toBe('/r/' + ROOM);
  expect(dialog.querySelector('input')!.value).toBe(`${location.origin}/r/${ROOM}`);
  expect(screen.getByText('Anyone with the link can draw')).toBeInTheDocument();
  expect(screen.getByText('Deleted 24 hours after the last visitor')).toBeInTheDocument();
  expect(localStorage.getItem('drawer.owner.' + ROOM)).toBe(TOKEN);
  expect(badge()).toBe('Connecting');

  const socket = FakeSocket.last();
  act(() => socket.open());
  expect(socket.sent[0]).toMatchObject({ event: 'hello', data: { roomId: ROOM, ownerToken: TOKEN } });
  act(() => socket.receive('welcome', welcome));
  expect(badge()).toBe('Live · 1');
  expect(socket.sent.map((m) => m.event)).toEqual(['hello', 'stroke.start', 'stroke.points', 'stroke.end']);

  fireEvent.click(screen.getByRole('button', { name: 'Close' }));
  expect(screen.queryByRole('dialog')).toBeNull();
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  expect(screen.getByRole('dialog', { name: 'Share this board' })).toBeInTheDocument();
  expect(mockCreate).toHaveBeenCalledTimes(1);
});

test('a failed create keeps the local board and shows the message', async () => {
  mockCreate.mockRejectedValue(new Error('create-room-failed'));
  render(<BoardPage />);
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  expect(await screen.findByText('Could not create a room. Try again.')).toBeInTheDocument();
  expect(location.pathname).toBe('/');
  expect(badge()).toBe('Local only');
  expect(FakeSocket.instances).toHaveLength(0);
});

test('the Clear button is hidden in a room', async () => {
  mockCreate.mockResolvedValue({ roomId: ROOM, ownerToken: TOKEN });
  render(<BoardPage />);
  expect(screen.getByRole('button', { name: 'Clear board' })).toBeInTheDocument();
  fireEvent.click(screen.getByRole('button', { name: 'Share' }));
  await screen.findByRole('dialog');
  expect(screen.queryByRole('button', { name: 'Clear board' })).toBeNull();
});

test('a lost connection shows Offline, retrying', async () => {
  history.replaceState(null, '', '/r/' + ROOM);
  render(<BoardPage />);
  const socket = FakeSocket.last();
  expect(socket.url).toBe(`ws://${location.host}/ws`);
  act(() => socket.open());
  act(() => socket.receive('welcome', welcome));
  expect(badge()).toBe('Live · 1');
  act(() => socket.drop());
  expect(badge()).toBe('Offline, retrying');
});

test('an expired room shows the expired page; a new board keeps the drawing', async () => {
  history.replaceState(null, '', '/r/' + ROOM);
  mockCreate.mockResolvedValue({ roomId: ROOM2, ownerToken: TOKEN });
  render(<BoardPage />);
  const old = FakeSocket.last();
  act(() => old.open());
  act(() =>
    old.receive('welcome', {
      ...welcome,
      seq: 1,
      strokes: [{ id: 'S'.repeat(22), seq: 1, tool: 'b', color: '#111111', width: 8, pts: [5, 5], batches: 1, done: true, deleted: false, mine: false }],
    }),
  );
  act(() => old.drop());
  const retry = FakeSocket.last();
  act(() => retry.open());
  act(() => retry.receive('error', { code: 'not-found' }));
  expect(screen.getByRole('heading', { name: 'This board has expired' })).toBeInTheDocument();
  expect(badge()).toBe('Room expired');
  fireEvent.click(screen.getByRole('button', { name: 'Start a new board from this drawing' }));
  await screen.findByRole('dialog', { name: 'Share this board' });
  expect(location.pathname).toBe('/r/' + ROOM2);
  const fresh = FakeSocket.last();
  act(() => fresh.open());
  act(() => fresh.receive('welcome', welcome));
  expect(fresh.sent.map((m) => m.event)).toEqual(['hello', 'stroke.start', 'stroke.points', 'stroke.end']);
  expect(screen.queryByRole('heading', { name: 'This board has expired' })).toBeNull();
});

test('an expired room still lets you draw locally, and a new board keeps that drawing', async () => {
  history.replaceState(null, '', '/r/' + ROOM);
  mockCreate.mockResolvedValue({ roomId: ROOM2, ownerToken: TOKEN });
  const { container } = render(<BoardPage />);
  const socket = FakeSocket.last();
  act(() => socket.open());
  act(() => socket.receive('error', { code: 'not-found' }));
  // A notice, not a modal: the board stays usable (spec 10: drawing yes, local only).
  expect(screen.getByRole('region', { name: 'This board has expired' })).toBeInTheDocument();
  expect(screen.queryByRole('dialog')).toBeNull();
  expect(container.ownerDocument.querySelector('.dialog-backdrop')).toBeNull();
  drawOneStroke(container);
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  fireEvent.click(screen.getByRole('button', { name: 'Start a new board from this drawing' }));
  await screen.findByRole('dialog', { name: 'Share this board' });
  const fresh = FakeSocket.last();
  act(() => fresh.open());
  act(() => fresh.receive('welcome', welcome));
  expect(fresh.sent.map((m) => m.event)).toEqual(['hello', 'stroke.start', 'stroke.points', 'stroke.end']);
});

test('presence shows the people and the Live count', () => {
  history.replaceState(null, '', '/r/' + ROOM);
  render(<BoardPage />);
  const socket = FakeSocket.last();
  act(() => socket.open());
  act(() => socket.receive('welcome', { ...welcome, members: [FOX, OWL] }));
  expect(badge()).toBe('Live · 2');
  const list = screen.getByRole('list', { name: 'People in this room' });
  expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fox (you)', 'Owl']);
  expect(document.querySelector('[data-member="o"]')).not.toBeNull();
  act(() => socket.receive('presence', { members: [FOX] }));
  expect(badge()).toBe('Live · 1');
  expect(within(list).getAllByRole('listitem').map((li) => li.textContent)).toEqual(['Fox (you)']);
  expect(document.querySelector('[data-member="o"]')).toBeNull();
});

test('a lost connection shows the offline toast until live again', async () => {
  history.replaceState(null, '', '/r/' + ROOM);
  render(<BoardPage />);
  const toast = 'Connection lost. Keep drawing: your strokes sync when you are back.';
  const first = FakeSocket.last();
  act(() => first.open());
  act(() => first.receive('welcome', { ...welcome, members: [FOX, OWL] }));
  expect(screen.queryByText(toast)).toBeNull();
  act(() => first.drop());
  expect(screen.getByText(toast)).toHaveAttribute('role', 'status');
  expect(screen.queryByRole('list', { name: 'People in this room' })).toBeNull();
  await waitFor(() => expect(FakeSocket.instances.length).toBe(2), { timeout: 2000 });
  const second = FakeSocket.last();
  act(() => second.open());
  act(() => second.receive('welcome', welcome));
  expect(screen.queryByText(toast)).toBeNull();
  expect(badge()).toBe('Live · 1');
});
