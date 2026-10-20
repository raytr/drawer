export interface CreatedRoom {
  roomId: string;
  ownerToken: string;
}

/** POST /api/rooms. Any failure (network, status, body) throws Error('create-room-failed'). */
export async function createRoom(fetchImpl: typeof fetch = fetch): Promise<CreatedRoom> {
  let res: Response;
  try {
    res = await fetchImpl('/api/rooms', { method: 'POST' });
  } catch {
    throw new Error('create-room-failed');
  }
  if (res.status !== 201) throw new Error('create-room-failed');
  const body = (await res.json().catch(() => null)) as Partial<CreatedRoom> | null;
  if (typeof body?.roomId !== 'string' || typeof body.ownerToken !== 'string') {
    throw new Error('create-room-failed');
  }
  return { roomId: body.roomId, ownerToken: body.ownerToken };
}
