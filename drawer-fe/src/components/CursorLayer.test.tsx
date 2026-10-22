import { render, screen } from '@testing-library/react';
import { Presence } from '../engine/presence';
import type { Member } from '../engine/protocol';
import { placeCursors } from '../engine/cursor-placement';
import { CursorLayer } from './CursorLayer';

const fox: Member = { memberId: 'me', name: 'Fox', color: '#1971c2' };
const owl: Member = { memberId: 'owl', name: 'Owl', color: '#e03131' };
const cat: Member = { memberId: 'cat', name: 'Cat', color: 'red;background:url(x)' };

function setup() {
  const presence = new Presence();
  presence.handleWelcome({ seq: 0, you: { memberId: 'me', isOwner: false }, members: [fox, owl, cat], strokes: [] });
  const { container } = render(<CursorLayer presence={presence} />);
  const layer = container.querySelector<HTMLElement>('.cursor-layer')!;
  const el = (id: string) => layer.querySelector<HTMLElement>(`[data-member="${id}"]`);
  return { presence, layer, el };
}

test('one cursor per other member, with the name as text', () => {
  const { el } = setup();
  expect(el('me')).toBeNull();
  expect(el('owl')).toHaveTextContent('Owl');
  expect(el('cat')).toHaveTextContent('Cat');
  expect(el('owl')!.hidden).toBe(true);
  expect(screen.getByText('Owl').closest('.cursor-layer')).not.toBeNull();
});

test('a bad color falls back', () => {
  const { el } = setup();
  expect(el('cat')!.querySelector('.cursor-name')).toHaveStyle({ backgroundColor: '#868e96' });
  expect(el('owl')!.querySelector('.cursor-name')).toHaveStyle({ backgroundColor: '#e03131' });
});

test('placeCursors shows known cursors at the fitted position and hides the rest', () => {
  const { presence, layer, el } = setup();
  presence.handleCursor({ memberId: 'owl', x: 100, y: 50 });
  placeCursors(layer, presence, { scale: 0.5, offsetX: 10, offsetY: 20 });
  expect(el('owl')!.hidden).toBe(false);
  expect(el('owl')!.style.transform).toBe('translate(60px, 45px)');
  expect(el('cat')!.hidden).toBe(true);
  presence.handleCursor({ memberId: 'owl', x: null, y: null });
  placeCursors(layer, presence, { scale: 0.5, offsetX: 10, offsetY: 20 });
  expect(el('owl')!.hidden).toBe(true);
});
