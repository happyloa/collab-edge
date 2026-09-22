'use client';
import { Moon, Sun } from 'lucide-react';
import { useSyncExternalStore } from 'react';

const subscribe = () => () => {};
const clientReady = () => true;
const serverReady = () => false;

export function ThemeToggle() {
  const ready = useSyncExternalStore(subscribe, clientReady, serverReady);
  return (
    <button
      className="icon-button"
      aria-label="Toggle color theme"
      disabled={!ready}
      onClick={() => {
        const root = document.documentElement;
        const dark = getComputedStyle(root).colorScheme === 'dark';
        root.dataset.theme = dark ? 'light' : 'dark';
      }}
    >
      <Sun size={18} className="theme-icon-light" />
      <Moon size={18} className="theme-icon-dark" />
    </button>
  );
}
