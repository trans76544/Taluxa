import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AppTitleBar } from './AppTitleBar';

function LocationProbe() {
  const location = useLocation();

  return <output aria-label="location">{`${location.pathname}${location.search}`}</output>;
}

describe('AppTitleBar', () => {
  beforeEach(() => {
    window.embyDesktop = {
      ...window.embyDesktop,
      windowControls: {
        minimize: vi.fn(),
        maximize: vi.fn(),
        close: vi.fn(),
      },
    } as Window['embyDesktop'];
  });

  it('navigates to search results when a query is submitted', () => {
    render(
      <MemoryRouter initialEntries={['/libraries']}>
        <AppTitleBar title="Taluxa" />
        <Routes>
          <Route path="*" element={<LocationProbe />} />
        </Routes>
      </MemoryRouter>
    );

    fireEvent.change(screen.getByRole('searchbox', { name: '搜索' }), {
      target: { value: '红楼梦' },
    });
    fireEvent.submit(screen.getByRole('search', { name: '全局搜索' }));

    expect(screen.getByLabelText('location')).toHaveTextContent(
      '/search?q=%E7%BA%A2%E6%A5%BC%E6%A2%A6'
    );
  });

  it('uses the desktop window controls exposed by preload', () => {
    render(
      <MemoryRouter>
        <AppTitleBar title="Taluxa" />
      </MemoryRouter>
    );

    fireEvent.click(screen.getByRole('button', { name: '最小化' }));
    fireEvent.click(screen.getByRole('button', { name: '最大化' }));
    fireEvent.click(screen.getByRole('button', { name: '关闭' }));

    expect(window.embyDesktop.windowControls.minimize).toHaveBeenCalledTimes(1);
    expect(window.embyDesktop.windowControls.maximize).toHaveBeenCalledTimes(1);
    expect(window.embyDesktop.windowControls.close).toHaveBeenCalledTimes(1);
  });
});
