import { Component, inject, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';
import { SessionService } from '../services/api/session.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { IconsService } from '../services/icons.service';
import { ThemeService } from '../services/theme.service';

@Component({
  selector: 'app-navbar-panel',
  standalone: true,
  imports: [CommonModule, RouterModule, MatButtonModule, MatIconModule],
  templateUrl: './navbar-panel.html',
  styleUrls: ['./navbar-panel.scss']
})
export class NavbarPanel {
  expanded = signal<boolean>(false);
  icons = inject(IconsService);

  constructor(private router: Router, private sessionService: SessionService, public themeService: ThemeService) {}

  navLinks = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Projects', route: '/projects', icon: 'projects' },
    { label: 'Feedback', route: '/feedback', icon: 'feedback' },
    { label: 'Assets', route: '/assets', icon: 'assets' }
  ];

  isAuthenticated() {
    return this.sessionService.isAuthenticated();
  }

  toggle() {
    this.expanded.update(v => !v);
  }

  logout() {
    this.sessionService.clearSession();
    this.router.navigate(['/auth']);
  }

  toggleTheme() {
    this.themeService.toggleTheme();
  }
}
