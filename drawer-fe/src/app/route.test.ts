import { goTo, parseRoute } from './route';

test('parses room and local routes', () => {
  expect(parseRoute('/')).toEqual({ kind: 'local' });
  expect(parseRoute('/r/' + 'A'.repeat(22))).toEqual({ kind: 'room', roomId: 'A'.repeat(22) });
  expect(parseRoute('/r/' + 'a-_'.repeat(7) + 'Z/')).toEqual({ kind: 'room', roomId: 'a-_'.repeat(7) + 'Z' });
  expect(parseRoute('/r/short')).toEqual({ kind: 'local' });
  expect(parseRoute('/r/' + 'A'.repeat(22) + '/x')).toEqual({ kind: 'local' });
  expect(parseRoute('/elsewhere')).toEqual({ kind: 'local' });
});

test('goTo replaces the URL and tells listeners', () => {
  const seen: string[] = [];
  const listener = () => seen.push(location.pathname);
  window.addEventListener('drawer:navigate', listener);
  const length = history.length;
  goTo('/r/' + 'B'.repeat(22));
  expect(location.pathname).toBe('/r/' + 'B'.repeat(22));
  expect(history.length).toBe(length);
  expect(seen).toEqual(['/r/' + 'B'.repeat(22)]);
  window.removeEventListener('drawer:navigate', listener);
  goTo('/');
});
