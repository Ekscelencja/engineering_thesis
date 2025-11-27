import { Component, signal } from '@angular/core';
import { Router, RouterModule } from '@angular/router';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-navbar-panel',
  standalone: true,
  imports: [CommonModule, RouterModule],
  templateUrl: './navbar-panel.html',
  styleUrls: ['./navbar-panel.scss']
})
export class NavbarPanel {
  expanded = signal(false);

  navLinks = [
    { label: 'Dashboard', route: '/dashboard', icon: 'dashboard' },
    { label: 'Projects', route: '/projects', icon: 'folder' },
    { label: 'Feedback', route: '/feedback', icon: 'feedback' },
    { label: 'Assets', route: '/assets', icon: 'inventory' }
  ];

  constructor(public router: Router) {}

  toggle() {
    this.expanded.update(v => !v);
  }

  logout() {
    localStorage.removeItem('token');
    localStorage.removeItem('user');
    this.router.navigate(['/auth']);
  }
}
