import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { KosovoToggleView } from './KosovoToggle';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';

afterEach(cleanup);
beforeEach(() => {
  useApp.setState({ settings: { ...useApp.getState().settings, lang: 'en', kosovoShown: true } });
});

describe('KosovoToggle', () => {
  it('shows the note when the info button is clicked', async () => {
    render(<KosovoToggleView />);
    const tip = screen.getByRole('tooltip', { hidden: true });
    expect(tip).not.toHaveClass('open');
    const btn = screen.getByRole('button', { name: /info/i });
    expect(btn).toHaveAttribute('aria-expanded', 'false');
    await userEvent.click(btn);
    expect(btn).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByRole('tooltip')).toHaveClass('open');
    expect(screen.getByRole('tooltip')).toHaveTextContent(t('kosovoNote', 'en'));
    expect(screen.getByRole('checkbox')).toHaveAccessibleDescription(t('kosovoNote', 'en'));
  });

  it('unticking calls setSettings({kosovoShown:false})', async () => {
    render(<KosovoToggleView />);
    await userEvent.click(screen.getByRole('checkbox', { name: 'Show Kosovo' }));
    expect(useApp.getState().settings.kosovoShown).toBe(false);
  });
});
