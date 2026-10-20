import { createRoom } from './rooms';

test('createRoom posts and returns the ids', async () => {
  const ok = vi.fn(async () => new Response(JSON.stringify({ roomId: 'r', ownerToken: 't' }), { status: 201 }));
  expect(await createRoom(ok as unknown as typeof fetch)).toEqual({ roomId: 'r', ownerToken: 't' });
  expect(ok).toHaveBeenCalledWith('/api/rooms', { method: 'POST' });
});

test('createRoom throws create-room-failed on a bad status or a network error', async () => {
  const bad = vi.fn(async () => new Response('', { status: 503 }));
  await expect(createRoom(bad as unknown as typeof fetch)).rejects.toThrow('create-room-failed');
  const down = vi.fn(async () => {
    throw new TypeError('Failed to fetch');
  });
  await expect(createRoom(down as unknown as typeof fetch)).rejects.toThrow('create-room-failed');
});
