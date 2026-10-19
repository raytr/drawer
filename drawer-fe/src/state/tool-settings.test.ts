import { WIDTH_STEP, initialToolSettings, toolReducer } from './tool-settings';

test('width is clamped and steps by 2', () => {
  let s = toolReducer(initialToolSettings, { type: 'width', width: 99 });
  expect(s.width).toBe(64);
  s = toolReducer({ ...s, width: 1 }, { type: 'widthStep', delta: -WIDTH_STEP });
  expect(s.width).toBe(1);
});

test('a palette color selects the brush; other colors are ignored', () => {
  const er = { ...initialToolSettings, tool: 'e' as const };
  expect(toolReducer(er, { type: 'color', color: '#e03131' })).toMatchObject({ tool: 'b', color: '#e03131' });
  expect(toolReducer(er, { type: 'color', color: '#123456' })).toBe(er);
});
