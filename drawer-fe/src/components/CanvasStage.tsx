import { useEffect, useRef } from 'react';
import type { BoardController } from '../engine/board-controller';
import { attachCursorInput } from '../engine/cursor-input';
import { placeCursors } from '../engine/cursor-placement';
import { fitBoard, type Fit } from '../engine/geometry';
import type { Presence, PresenceSnapshot } from '../engine/presence';
import { Renderer } from '../engine/renderer';
import { attachStrokeInput } from '../engine/stroke-input';
import type { ToolSettings } from '../state/tool-settings';
import { CursorLayer } from './CursorLayer';

/**
 * The drawing surface. React only mounts it; the engine draws on the canvases directly.
 * Pointer input is attached to the stage (not the canvas) because the board offsets in
 * the fit are measured from the stage's corner.
 */
export function CanvasStage({
  controller,
  settings,
  presence = null,
}: {
  controller: BoardController;
  settings: ToolSettings;
  /** Set in a room: shows the other members' cursors and reports this tab's pointer. */
  presence?: Presence | null;
}) {
  const stageRef = useRef<HTMLDivElement>(null);
  const layerRef = useRef<HTMLDivElement>(null);
  const baseRef = useRef<HTMLCanvasElement>(null);
  const liveRef = useRef<HTMLCanvasElement>(null);
  const settingsRef = useRef(settings);

  useEffect(() => {
    settingsRef.current = settings;
  });

  useEffect(() => {
    const stage = stageRef.current;
    const base = baseRef.current;
    const live = liveRef.current;
    if (!stage || !base || !live) return;

    const renderer = new Renderer(base, live, controller.store);
    let fit: Fit = fitBoard(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
    let drawnVersion = -1;

    const resize = () => {
      fit = fitBoard(Math.max(1, stage.clientWidth), Math.max(1, stage.clientHeight));
      renderer.resize(fit, window.devicePixelRatio || 1);
      drawnVersion = controller.store.version;
    };
    const observer = new ResizeObserver(resize);
    observer.observe(stage);
    resize();

    const detach = attachStrokeInput(stage, controller, () => settingsRef.current, () => fit);
    const detachCursor = presence ? attachCursorInput(stage, presence, () => fit) : () => {};
    let placedVersion = -1;
    let placedFit: Fit | null = null;
    let placedMembers: PresenceSnapshot | null = null;

    let frameId = 0;
    const loop = () => {
      const now = performance.now();
      controller.flush(now);
      if (controller.store.version !== drawnVersion) {
        renderer.frame();
        drawnVersion = controller.store.version;
      }
      if (presence) {
        presence.flush(now);
        const layer = layerRef.current;
        const members = presence.getSnapshot();
        if (layer && (presence.cursorVersion !== placedVersion || fit !== placedFit || members !== placedMembers)) {
          placeCursors(layer, presence, fit);
          placedVersion = presence.cursorVersion;
          placedFit = fit;
          placedMembers = members;
        }
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      detach();
      detachCursor();
      observer.disconnect();
    };
  }, [controller, presence]);

  return (
    <div className="canvas-stage" ref={stageRef}>
      <canvas className="board-canvas" ref={baseRef} />
      <canvas className="board-canvas" ref={liveRef} />
      {presence && <CursorLayer presence={presence} layerRef={layerRef} />}
    </div>
  );
}
