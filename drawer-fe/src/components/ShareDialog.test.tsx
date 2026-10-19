import { fireEvent, render, screen } from '@testing-library/react';
import { ShareDialog } from './ShareDialog';

const URL_ = 'http://example.test/r/' + 'R'.repeat(22);

test('focus starts on Copy link, so the link field shows the start of the link', () => {
  render(<ShareDialog url={URL_} onClose={() => {}} />);
  expect(screen.getByRole('button', { name: 'Copy link' })).toHaveFocus();
  expect(screen.getByLabelText('Board link')).toHaveValue(URL_);
});

test('Escape closes the dialog', () => {
  const onClose = vi.fn();
  render(<ShareDialog url={URL_} onClose={onClose} />);
  fireEvent.keyDown(screen.getByRole('button', { name: 'Copy link' }), { key: 'Escape' });
  expect(onClose).toHaveBeenCalledTimes(1);
});

test('a blocked clipboard selects the link instead', async () => {
  const writeText = vi.fn(async () => {
    throw new Error('blocked');
  });
  vi.stubGlobal('navigator', { ...navigator, clipboard: { writeText } });
  render(<ShareDialog url={URL_} onClose={() => {}} />);
  fireEvent.click(screen.getByRole('button', { name: 'Copy link' }));
  await vi.waitFor(() => expect(screen.getByLabelText('Board link')).toHaveFocus());
  vi.unstubAllGlobals();
});
