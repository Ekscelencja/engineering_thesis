import { Injectable } from '@angular/core';

@Injectable({
  providedIn: 'root',
})
export class ThemeService {
  private readonly THEME_KEY = 'app-theme';
  private readonly DARK = 'dark';
  private readonly LIGHT = 'light';

  constructor() {
    this.initTheme();
  }

  private initTheme(): void {
    const savedTheme = localStorage.getItem(this.THEME_KEY);
    if (savedTheme === this.LIGHT || savedTheme === this.DARK) {
      this.setTheme(savedTheme);
    } else {
      this.setTheme(this.DARK); // Default to dark mode
    }
  }

  get currentTheme(): string {
    return document.body.getAttribute('data-theme') || this.DARK;
  }

  toggleTheme(): void {
    const newTheme = this.currentTheme === this.DARK ? this.LIGHT : this.DARK;
    this.setTheme(newTheme);
  }

  setTheme(theme: string): void {
    document.body.style.colorScheme = theme === this.DARK ? 'dark' : 'light';
    document.body.setAttribute('data-theme', theme);
    localStorage.setItem(this.THEME_KEY, theme);
  }
}
