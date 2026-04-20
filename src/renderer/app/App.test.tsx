import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { App } from './App';

describe('App', () => {
  it('shows the default connect heading', () => {
    render(<App />);

    expect(screen.getByRole('heading', { name: 'Connect to Emby' })).toBeInTheDocument();
  });
});
