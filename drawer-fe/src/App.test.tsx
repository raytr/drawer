import { render, screen } from '@testing-library/react';
import App from './App';

test('shows the app name', () => {
  render(<App />);
  expect(screen.getByText('drawer')).toBeInTheDocument();
});

test('the board page shows the tools and a disabled Share button', () => {
  render(<App />);
  expect(screen.getByRole('button', { name: 'Brush' })).toHaveAttribute('aria-pressed', 'true');
  expect(screen.getByRole('button', { name: 'Share' })).toBeDisabled();
  expect(screen.getByText('Local only')).toBeInTheDocument();
});
