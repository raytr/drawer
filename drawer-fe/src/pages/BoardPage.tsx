import { useReducer, useState } from 'react';
import { flushSync } from 'react-dom';
import { createRoom } from '../api/rooms';
import { goTo } from '../app/route';
import { CanvasStage } from '../components/CanvasStage';
import { PresenceList } from '../components/PresenceList';
import { ShareDialog } from '../components/ShareDialog';
import { ToolPanel } from '../components/ToolPanel';
import { TopBar, type BoardStatus } from '../components/TopBar';
import { BoardController } from '../engine/board-controller';
import { saveOwnerToken } from '../engine/identity';
import { Presence } from '../engine/presence';
import { useBoard } from '../hooks/useBoard';
import { usePresence } from '../hooks/usePresence';
import { useRoomConnection } from '../hooks/useRoomConnection';
import { useRoute } from '../hooks/useRoute';
import { useShortcuts } from '../hooks/useShortcuts';
import { WIDTH_STEP, initialToolSettings, toolReducer } from '../state/tool-settings';
import { ExpiredPage } from './ExpiredPage';

/** One board session: a room (or the local board) with its own controller and presence. */
function newSession(roomId: string | null) {
  return { roomId, controller: new BoardController(), presence: new Presence() };
}

export function BoardPage() {
  const route = useRoute();
  const routeRoom = route.kind === 'room' ? route.roomId : null;
  /** Set by Share just before it changes the URL, so that one switch keeps the board. */
  const [shareTarget, setShareTarget] = useState<string | null>(null);
  const [session, setSession] = useState(() => newSession(routeRoom));
  if (session.roomId !== routeRoom) {
    const keep = routeRoom !== null && shareTarget === routeRoom;
    setSession(keep ? { ...session, roomId: routeRoom } : newSession(routeRoom));
    if (shareTarget !== null) setShareTarget(null);
  }
  const { controller, presence, roomId } = session;

  const [settings, dispatch] = useReducer(toolReducer, initialToolSettings);
  const snapshot = useBoard(controller);
  const connection = useRoomConnection(controller, presence, roomId);
  const people = usePresence(presence);
  const [creating, setCreating] = useState(false);
  const [shareError, setShareError] = useState<string | null>(null);
  const [dialogOpen, setDialogOpen] = useState(false);
  const status: BoardStatus = creating ? 'creating' : connection;

  useShortcuts({
    brush: () => dispatch({ type: 'tool', tool: 'b' }),
    eraser: () => dispatch({ type: 'tool', tool: 'e' }),
    widthDown: () => dispatch({ type: 'widthStep', delta: -WIDTH_STEP }),
    widthUp: () => dispatch({ type: 'widthStep', delta: WIDTH_STEP }),
    undo: () => controller.undo(),
    redo: () => controller.redo(),
  });

  async function createAndShare() {
    setCreating(true);
    setShareError(null);
    try {
      const room = await createRoom();
      saveOwnerToken(room.roomId, room.ownerToken);
      // Commit the target first: goTo makes a sync update that could render before a normal one.
      flushSync(() => setShareTarget(room.roomId));
      goTo(`/r/${room.roomId}`);
      setDialogOpen(true);
    } catch {
      setShareError('Could not create a room. Try again.');
    } finally {
      setCreating(false);
    }
  }

  function startFromExpired() {
    controller.store.adoptAllAsLocal();
    void createAndShare();
  }

  function share() {
    if (creating) return;
    if (connection === 'expired') startFromExpired();
    else if (roomId) setDialogOpen(true);
    else void createAndShare();
  }

  return (
    <div className="board-page">
      <TopBar status={status} onShare={share} people={people.members.length}>
        {roomId && people.members.length > 0 && <PresenceList snapshot={people} />}
      </TopBar>
      <main className="board-main">
        <CanvasStage controller={controller} settings={settings} presence={roomId ? presence : null} />
        <ToolPanel
          settings={settings}
          dispatch={dispatch}
          snapshot={snapshot}
          onUndo={() => controller.undo()}
          onRedo={() => controller.redo()}
          onClear={() => controller.clear()}
          canClear={roomId === null}
        />
      </main>
      {shareError && (
        <p className="share-error" role="alert">
          {shareError}
        </p>
      )}
      {dialogOpen && roomId && <ShareDialog url={`${location.origin}/r/${roomId}`} onClose={() => setDialogOpen(false)} />}
      {status === 'reconnecting' && (
        <p className="toast" role="status">
          Connection lost. Keep drawing: your strokes sync when you are back.
        </p>
      )}
      {status === 'expired' && <ExpiredPage onNewBoard={startFromExpired} />}
    </div>
  );
}
