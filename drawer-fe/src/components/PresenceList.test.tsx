import { render, screen, within } from '@testing-library/react';
import type { Member } from '../engine/protocol';
import { PresenceList } from './PresenceList';

const member = (memberId: string, name: string, color = '#1971c2'): Member => ({ memberId, name, color });

test('chips with (you), at most 5, then +N', () => {
  const members = ['Fox', 'Owl', 'Cat', 'Bear', 'Otter', 'Lynx', 'Crane'].map((n, i) => member(`m${i}`, n));
  render(<PresenceList snapshot={{ me: 'm1', members }} />);
  const list = screen.getByRole('list', { name: 'People in this room' });
  const items = within(list).getAllByRole('listitem').map((li) => li.textContent);
  expect(items).toEqual(['Fox', 'Owl (you)', 'Cat', 'Bear', 'Otter', '+2']);
});

test('a hostile name renders as text', () => {
  const name = '<img src=x onerror=alert(1)>';
  const { container } = render(<PresenceList snapshot={{ me: null, members: [member('x', name, 'red;x:y')] }} />);
  expect(container.querySelector('img')).toBeNull();
  expect(screen.getByText(name)).toBeInTheDocument();
});
