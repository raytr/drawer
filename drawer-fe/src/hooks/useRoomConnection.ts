import { useEffect, useState } from 'react';
import type { BoardController } from '../engine/board-controller';
import { Connection, type ConnectionStatus } from '../engine/connection';
import { getIdentity, loadOwnerToken } from '../engine/identity';
import type { Presence } from '../engine/presence';

/**
 * Connects the controller and the presence to the room while roomId is set; returns the
 * connection status. Presence is emptied whenever the connection is not live.
 */
export function useRoomConnection(
  controller: BoardController,
  presence: Presence,
  roomId: string | null,
): ConnectionStatus | 'local' {
  const [status, setStatus] = useState<ConnectionStatus>('connecting');

  useEffect(() => {
    if (!roomId) return;
    const { userKey, name, color } = getIdentity();
    const ownerToken = loadOwnerToken(roomId) ?? undefined;
    const scheme = location.protocol === 'https:' ? 'wss' : 'ws';
    const connection = new Connection({
      url: `${scheme}://${location.host}/ws`,
      hello: { roomId, userKey, ownerToken, name, color },
    });
    connection.onStatus = (next) => {
      if (next !== 'live') presence.reset();
      setStatus(next);
    };
    connection.onWelcome = (data) => {
      controller.handleWelcome(data);
      presence.handleWelcome(data);
    };
    connection.onOp = (op) => controller.handleOp(op);
    connection.onPresence = (data) => presence.handlePresence(data);
    connection.onCursor = (data) => presence.handleCursor(data);
    const link = { send: (event: string, data: object) => connection.send(event, data) };
    controller.link(link);
    presence.link(link);
    connection.start();
    return () => {
      connection.stop();
      controller.link(null);
      presence.link(null);
      presence.reset();
    };
  }, [controller, presence, roomId]);

  return roomId ? status : 'local';
}
