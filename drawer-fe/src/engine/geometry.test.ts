import { fitBoard, toBoardPoint, toBoardPointInside } from './geometry';

test('fitBoard letterboxes a tall view', () => {
  expect(fitBoard(960, 1080)).toEqual({ scale: 0.5, offsetX: 0, offsetY: 270 });
});

test('toBoardPoint maps, rounds, and clamps', () => {
  const fit = { scale: 0.5, offsetX: 0, offsetY: 270 };
  const rect = { left: 10, top: 20 };
  expect(toBoardPoint(10 + 100.2, 20 + 270 + 50, rect, fit)).toEqual([200, 100]);
  expect(toBoardPoint(-50, -50, rect, fit)).toEqual([0, 0]);
  expect(toBoardPoint(5000, 5000, rect, fit)).toEqual([1919, 1079]);
});

test('toBoardPointInside is null outside the board', () => {
  const fit = { scale: 0.5, offsetX: 10, offsetY: 20 };
  const rect = { left: 0, top: 0 };
  expect(toBoardPointInside(10, 20, rect, fit)).toEqual([0, 0]);
  expect(toBoardPointInside(10 + 959.9, 20 + 539.9, rect, fit)).toEqual([1919, 1079]);
  expect(toBoardPointInside(9, 20, rect, fit)).toBeNull();
  expect(toBoardPointInside(10, 19, rect, fit)).toBeNull();
  expect(toBoardPointInside(10 + 960, 20, rect, fit)).toBeNull();
  expect(toBoardPointInside(10, 20 + 540, rect, fit)).toBeNull();
});
