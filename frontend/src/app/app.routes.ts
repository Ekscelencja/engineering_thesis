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
  {
    path: 'projects',
    loadComponent: () => import('./projects-panel/projects-panel').then(m => m.ProjectsPanelComponent)
  },
  {
    path: 'feedback',
    loadComponent: () => import('./feedback-panel/feedback-panel').then(m => m.FeedbackPanelComponent)
  },
  {
    path: 'assets',
    loadComponent: () => import('./assets-panel/assets-panel').then(m => m.AssetsPanelComponent)
  },
  { path: '', pathMatch: 'full', redirectTo: 'auth' },
  { path: '**', redirectTo: 'auth' }
];
