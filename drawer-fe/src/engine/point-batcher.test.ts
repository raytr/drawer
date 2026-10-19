import { PointBatcher } from './point-batcher';

test('rounds, skips repeats, and caps a batch at 64 points', () => {
  const b = new PointBatcher();
  b.add(1.4, 2.6); b.add(1.2, 3.4); // same integer point twice
  expect(b.take()).toEqual([1, 3]);
  for (let i = 0; i < 70; i++) b.add(i, 0);
  expect(b.take().length).toBe(128);
  expect(b.take().length).toBe(12);
  expect(b.hasPending()).toBe(false);
});
