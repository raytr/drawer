import { fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { initialToolSettings } from '../state/tool-settings';
import { ToolPanel } from './ToolPanel';

const snap = { canUndo: false, canRedo: false, hasVisible: true, drawing: false };

function setup(over = {}) {
  const p = { settings: initialToolSettings, dispatch: vi.fn(), snapshot: snap, onUndo: vi.fn(), onRedo: vi.fn(), onClear: vi.fn(), ...over };
  render(<ToolPanel {...p} />);
  return p;
}

test('tool, color, and width dispatch actions', async () => {
  const p = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Eraser' }));
  await userEvent.click(screen.getByRole('button', { name: 'Color #e03131' }));
  fireEvent.change(screen.getByLabelText('Width'), { target: { value: '20' } });
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'tool', tool: 'e' });
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'color', color: '#e03131' });
  expect(p.dispatch).toHaveBeenCalledWith({ type: 'width', width: 20 });
});

test('undo and redo follow the snapshot', () => {
  setup({ snapshot: { ...snap, canUndo: true } });
  expect(screen.getByRole('button', { name: 'Undo' })).toBeEnabled();
  expect(screen.getByRole('button', { name: 'Redo' })).toBeDisabled();
});

test('clear needs a confirmation inside the page', async () => {
  const p = setup();
  await userEvent.click(screen.getByRole('button', { name: 'Clear board' }));
  await userEvent.click(screen.getByRole('button', { name: 'Cancel' }));
  expect(p.onClear).not.toHaveBeenCalled();
  await userEvent.click(screen.getByRole('button', { name: 'Clear board' }));
  expect(screen.getByText('Clear the whole board?')).toBeInTheDocument();
  await userEvent.click(screen.getByRole('button', { name: 'Clear' }));
  expect(p.onClear).toHaveBeenCalledTimes(1);
});
