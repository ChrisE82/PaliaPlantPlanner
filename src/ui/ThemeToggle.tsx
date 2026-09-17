import { useEffect, useState, type ReactNode } from 'react';
import { AutoThemeIcon, MoonIcon, SunIcon } from './icons';

export type Theme = 'auto' | 'light' | 'dark';

export const THEME_KEY = 'palia-plant-planner:theme:v1';

export function readStoredTheme(): Theme {
  try {
    const stored = localStorage.getItem(THEME_KEY);
    return stored === 'light' || stored === 'dark' ? stored : 'auto';
  } catch {
    return 'auto';
  }
}

function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  if (theme === 'auto') delete root.dataset.theme;
  else root.dataset.theme = theme;
}

const OPTIONS: { value: Theme; label: string; icon: ReactNode }[] = [
  { value: 'auto', label: 'Match the system theme', icon: <AutoThemeIcon /> },
  { value: 'light', label: 'Light theme', icon: <SunIcon /> },
  { value: 'dark', label: 'Dark theme', icon: <MoonIcon /> },
];

/** Auto / light / dark, remembered in the browser. Auto follows the system setting. */
export default function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>(() => readStoredTheme());

  useEffect(() => {
    applyTheme(theme);
    try {
      localStorage.setItem(THEME_KEY, theme);
    } catch {
      // A browser with storage blocked still gets the theme for this visit.
    }
  }, [theme]);

  return (
    <fieldset className="segmented theme-toggle">
      <legend className="visually-hidden">Theme</legend>
      {OPTIONS.map((option) => (
        <label key={option.value} className="segmented__option">
          <input
            type="radio"
            name="theme"
            value={option.value}
            aria-label={option.label}
            checked={theme === option.value}
            onChange={() => setTheme(option.value)}
          />
          <span className="segmented__label" title={option.label}>
            {option.icon}
          </span>
        </label>
      ))}
    </fieldset>
  );
}
