import { useEffect, useState } from 'react';
import type { BoardController } from '../engine/board-controller';
import { Connection, type ConnectionStatus } from '../engine/connection';
import { getIdentity, loadOwnerToken } from '../engine/identity';

/** Connects the controller to the room while roomId is set; returns the connection status. */
export function useRoomConnection(controller: BoardController, roomId: string | null): ConnectionStatus | 'local' {
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
    connection.onStatus = setStatus;
    connection.onWelcome = (data) => controller.handleWelcome(data);
    connection.onOp = (op) => controller.handleOp(op);
    controller.link({ send: (event, data) => connection.send(event, data) });
    connection.start();
    return () => {
      connection.stop();
      controller.link(null);
    };
  }, [controller, roomId]);

  return roomId ? status : 'local';
}
