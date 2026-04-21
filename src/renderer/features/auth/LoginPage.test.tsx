import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('renders a stacked form layout for sign-in fields', () => {
    render(<LoginPage onSubmit={vi.fn()} />);

    const form = screen.getByRole('button', { name: 'Sign in' }).closest('form');
    const serverUrlInput = screen.getByLabelText('Server URL');
    const usernameInput = screen.getByLabelText('Username');
    const passwordInput = screen.getByLabelText('Password');

    expect(form).toHaveClass('login-form');
    expect(serverUrlInput).toHaveClass('field-input');
    expect(usernameInput).toHaveClass('field-input');
    expect(passwordInput).toHaveClass('field-input');
  });

  it('submits the entered server url, username, and password', () => {
    const onSubmit = vi.fn();

    render(<LoginPage onSubmit={onSubmit} />);

    fireEvent.change(screen.getByLabelText('Server URL'), {
      target: { value: 'demo.emby.local' },
    });
    fireEvent.change(screen.getByLabelText('Username'), {
      target: { value: 'alice' },
    });
    fireEvent.change(screen.getByLabelText('Password'), {
      target: { value: 'secret' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Sign in' }));

    expect(onSubmit).toHaveBeenCalledWith({
      serverUrl: 'demo.emby.local',
      userName: 'alice',
      password: 'secret',
    });
  });
});
