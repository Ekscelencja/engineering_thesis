import { Injectable } from '@angular/core';
import { DomSanitizer, SafeResourceUrl } from '@angular/platform-browser';
import { MatIconRegistry } from '@angular/material/icon';

@Injectable({ providedIn: 'root' })
export class IconsService {
  private iconList = [
    'dashboard',
    'projects',
    'settings',
    'logout',
    'feedback',
    'assets',
    'dark-mode',
    'light-mode',
    'archive',
    'edit',
    'delete',
    'view',
    'window',
    'door',
    'save',
    'close',
    'chevron',
    'check',
    'open_in_new'
  ];

  constructor(private iconRegistry: MatIconRegistry, private sanitizer: DomSanitizer) {
    this.registerIcons();
  }

  private registerIcons() {
    this.iconList.forEach(icon => {
      this.iconRegistry.addSvgIcon(
        icon,
        this.sanitizer.bypassSecurityTrustResourceUrl(`assets/icons/${icon}.svg`)
      );
    });
  }

  /**
   * Register a new icon at runtime (if needed)
   */
  registerIcon(name: string, path?: string) {
    this.iconRegistry.addSvgIcon(
      name,
      this.sanitizer.bypassSecurityTrustResourceUrl(path || `assets/icons/${name}.svg`)
    );
  }
}
