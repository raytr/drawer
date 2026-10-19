import { useEffect, useRef } from 'react';
import type { BoardController } from '../engine/board-controller';
import { fitBoard, type Fit } from '../engine/geometry';
import { Renderer } from '../engine/renderer';
import { attachStrokeInput } from '../engine/stroke-input';
import type { ToolSettings } from '../state/tool-settings';

/**
 * The drawing surface. React only mounts it; the engine draws on the canvases directly.
 * Pointer input is attached to the stage (not the canvas) because the board offsets in
 * the fit are measured from the stage's corner.
 */
export function CanvasStage({ controller, settings }: { controller: BoardController; settings: ToolSettings }) {
  const stageRef = useRef<HTMLDivElement>(null);
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

    let frameId = 0;
    const loop = () => {
      controller.flush();
      if (controller.store.version !== drawnVersion) {
        renderer.frame();
        drawnVersion = controller.store.version;
      }
      frameId = requestAnimationFrame(loop);
    };
    frameId = requestAnimationFrame(loop);

    return () => {
      cancelAnimationFrame(frameId);
      detach();
      observer.disconnect();
    };
  }, [controller]);

  return (
    <div className="canvas-stage" ref={stageRef}>
      <canvas className="board-canvas" ref={baseRef} />
      <canvas className="board-canvas" ref={liveRef} />
    </div>
  );
}
