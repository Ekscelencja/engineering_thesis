import { Routes } from '@angular/router';

export const routes: Routes = [
  {
    path: 'auth',
    loadComponent: () => import('./auth-panel/auth-panel').then(m => m.AuthPanel)
  },
  {
    path: 'dashboard',
    loadComponent: () => import('./dashboard-panel/dashboard-panel').then(m => m.DashboardPanel)
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
  { path: '**', redirectTo: 'auth' }
];
