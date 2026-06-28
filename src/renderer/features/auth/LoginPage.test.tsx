import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import { LoginPage } from './LoginPage';

describe('LoginPage', () => {
  it('renders the Taluxa product name', () => {
    render(<LoginPage onSubmit={vi.fn()} />);

    expect(screen.getByText('Taluxa')).toBeInTheDocument();
  });

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

  it('switches the supporting copy when adding another remembered account', () => {
    render(<LoginPage onSubmit={vi.fn()} hasRememberedAccounts />);

    expect(
      screen.getByText('Add another account from this or another server.')
    ).toBeInTheDocument();
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

  it('toggles password visibility without changing the password value', () => {
    render(<LoginPage onSubmit={vi.fn()} />);

    const passwordInput = screen.getByLabelText('Password');
    const toggleButton = screen.getByRole('button', { name: 'Show password' });

    fireEvent.change(passwordInput, {
      target: { value: 'secret' },
    });

    expect(passwordInput).toHaveAttribute('type', 'password');

    fireEvent.click(toggleButton);

    expect(passwordInput).toHaveAttribute('type', 'text');
    expect(passwordInput).toHaveValue('secret');
    expect(screen.getByRole('button', { name: 'Hide password' })).toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Hide password' }));

    expect(passwordInput).toHaveAttribute('type', 'password');
    expect(passwordInput).toHaveValue('secret');
  });
});
