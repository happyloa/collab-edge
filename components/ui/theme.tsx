'use client';
import { Moon, Sun } from 'lucide-react';
import { useState } from 'react';
export function ThemeToggle() {
  const [dark, setDark] = useState(false);
  return (
    <button
      className="icon-button"
      aria-label="Toggle color theme"
      onClick={() => {
        document.documentElement.dataset.theme = dark ? 'light' : 'dark';
        setDark(!dark);
      }}
    >
      {dark ? <Sun size={18} /> : <Moon size={18} />}
    </button>
  );
}
