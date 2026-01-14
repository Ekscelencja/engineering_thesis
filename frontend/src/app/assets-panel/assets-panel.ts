import { ChangeDetectorRef, Component, OnInit } from '@angular/core';
import { CommonModule, NgFor, NgClass } from '@angular/common';
import { AssetsService, FurnitureAsset, TextureAsset } from '../services/api/assets.service';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatSelectModule } from '@angular/material/select';
import { FormsModule } from '@angular/forms';
import { FurniturePreviewComponent } from '../furniture-preview/furniture-preview';

@Component({
  selector: 'app-assets-panel',
  standalone: true,
  templateUrl: './assets-panel.html',
  styleUrls: ['./assets-panel.scss'],
  imports: [
    CommonModule,
    FormsModule,
    NgFor,
    NgClass,
    MatButtonModule,
    MatIconModule,
    MatFormFieldModule,
    MatSelectModule,
    FurniturePreviewComponent
  ]
})
export class AssetsPanelComponent implements OnInit {
  furnitureAssets: FurnitureAsset[] = [];
  public wallTextures: { name: string, file: string, url: string }[] = [];
  public floorTextures: { name: string, file: string, url: string }[] = [];
  selectedType: '' | 'furniture' | 'wall' | 'floor' = '';
  viewMode: 'grid' | 'list' = 'grid';

  constructor(
    private assetsService: AssetsService,
    private cdr: ChangeDetectorRef
  ) { }

  ngOnInit() {
    this.assetsService.getFurnitureAssets().subscribe(list => {
      this.furnitureAssets = list || [];
      this.cdr.detectChanges();
    });
    this.assetsService.getTextures('wall').subscribe(list => {
      this.wallTextures = list || [];
      this.cdr.detectChanges();
    });
    this.assetsService.getTextures('floor').subscribe(list => {
      this.floorTextures = list || [];
      this.cdr.detectChanges();
    });
  }

  selectType(event: any) {
    this.selectedType = event.value;
  }
}