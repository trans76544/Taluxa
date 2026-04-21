import { render, screen } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { HashRouter } from 'react-router-dom';
import { App } from './App';

describe('App', () => {
  it('shows the sign in page by default', async () => {
    render(
      <HashRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
        <App />
      </HashRouter>
    );

    expect(await screen.findByRole('button', { name: 'Sign in' })).toBeInTheDocument();
  });
});
