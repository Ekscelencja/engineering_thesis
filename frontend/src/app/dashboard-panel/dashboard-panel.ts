import { Component, ChangeDetectionStrategy } from '@angular/core';

@Component({
  selector: 'dashboard-panel',
  templateUrl: './dashboard-panel.html',
  styleUrls: ['./dashboard-panel.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DashboardPanel {}
