import { Component, ElementRef, EventEmitter, Input, Output, ViewChild } from '@angular/core';
import { CommonModule } from '@angular/common';

@Component({
  selector: 'app-color-picker',
  standalone: true,
  imports: [CommonModule],
  templateUrl: './color-picker.html',
  styleUrls: ['./color-picker.scss']
})
export class ColorPickerComponent {
  @Input() value: string | null = null;
  @Output() valueChange = new EventEmitter<{ hex: string; num: number }>();

  @ViewChild('wheelCanvas', { static: true }) wheelCanvas!: ElementRef<HTMLCanvasElement>;
  @ViewChild('lumCanvas', { static: true }) lumCanvas!: ElementRef<HTMLCanvasElement>;

  private ctx!: CanvasRenderingContext2D;
  private lumCtx!: CanvasRenderingContext2D;

  private size = 180;
  private radius = 90;
  private center = { x: 90, y: 90 };

  private hue = 0;
  private sat = 1;
  private lightness = 0.5;

  ngAfterViewInit() {
    const wc = this.wheelCanvas.nativeElement;
    wc.width = this.size; wc.height = this.size;
    this.ctx = wc.getContext('2d')!;
    this.drawWheel();

    const lc = this.lumCanvas.nativeElement;
    lc.width = this.size; lc.height = 16;
    this.lumCtx = lc.getContext('2d')!;
    this.drawLumBar();

    if (this.value && this.value.startsWith('#') && this.value.length === 7) {
      const r = parseInt(this.value.slice(1, 3), 16);
      const g = parseInt(this.value.slice(3, 5), 16);
      const b = parseInt(this.value.slice(5, 7), 16);
      const { h, s, l } = this.rgbToHsl(r, g, b);
      this.hue = Math.round(h * 360);
      this.sat = s;
      this.lightness = l;
      this.drawWheel();
      this.drawLumBar();
      this.emitColor();
    }

    wc.addEventListener('pointerdown', this.onWheelPointer);
    wc.addEventListener('pointermove', this.onWheelPointer);
    lc.addEventListener('pointerdown', this.onLumPointer);
    lc.addEventListener('pointermove', this.onLumPointer);
  }

  onWheelPointer = (e: PointerEvent) => {
    if (e.buttons === 0 && e.type === 'pointermove') return;
    const rect = this.wheelCanvas.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const dx = x - this.center.x;
    const dy = y - this.center.y;
    const dist = Math.sqrt(dx*dx + dy*dy);
    if (dist > this.radius) return;

    const angle = Math.atan2(dy, dx);
    this.hue = ((angle * 180 / Math.PI) + 360) % 360;
    this.sat = Math.min(1, dist / this.radius);

    this.drawWheel();
    this.drawLumBar();
    this.emitColor();
  };

  onLumPointer = (e: PointerEvent) => {
    if (e.buttons === 0 && e.type === 'pointermove') return;
    const rect = this.lumCanvas.nativeElement.getBoundingClientRect();
    const x = e.clientX - rect.left;
    this.lightness = Math.min(1, Math.max(0, x / rect.width));
    this.drawLumBar();
    this.emitColor();
  };

  private drawWheel() {
    const ctx = this.ctx;
    const img = ctx.createImageData(this.size, this.size);
    const data = img.data;

    for (let y = 0; y < this.size; y++) {
      for (let x = 0; x < this.size; x++) {
        const dx = x - this.center.x;
        const dy = y - this.center.y;
        const dist = Math.sqrt(dx*dx + dy*dy);
        const idx = (y * this.size + x) * 4;

        if (dist <= this.radius) {
          const angle = Math.atan2(dy, dx);
          const hueDeg = ((angle * 180 / Math.PI) + 360) % 360;
          const sat = Math.min(1, dist / this.radius);
          const { r, g, b } = this.hslToRgb(hueDeg/360, sat, 0.5);
          data[idx] = r;
          data[idx + 1] = g;
          data[idx + 2] = b;
          data[idx + 3] = 255;
        } else {
          data[idx + 3] = 0;
        }
      }
    }
    ctx.putImageData(img, 0, 0);

    const rad = this.hue * Math.PI / 180;
    const r = this.radius * this.sat;
    const ix = this.center.x + Math.cos(rad) * r;
    const iy = this.center.y + Math.sin(rad) * r;

    ctx.beginPath();
    ctx.arc(ix, iy, 5, 0, Math.PI * 2);
    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    ctx.fill();
    ctx.stroke();
  }

  private drawLumBar() {
    const ctx = this.lumCtx;
    ctx.clearRect(0, 0, this.size, 16);

    const mid = this.hslToRgb(this.hue/360, this.sat, 0.5);
    const grad = ctx.createLinearGradient(0, 0, this.size, 0);
    grad.addColorStop(0, 'rgb(0,0,0)');
    grad.addColorStop(0.5, `rgb(${mid.r},${mid.g},${mid.b})`);
    grad.addColorStop(1, 'rgb(255,255,255)');

    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, this.size, 16);

    ctx.fillStyle = '#fff';
    ctx.strokeStyle = '#000';
    ctx.lineWidth = 1;
    const x = Math.round(this.lightness * this.size);
    ctx.beginPath();
    ctx.rect(x - 2, 0, 4, 16);
    ctx.fill();
    ctx.stroke();
  }

  private emitColor() {
    const { r, g, b } = this.hslToRgb(this.hue/360, this.sat, this.lightness);
    const hex = '#' + [r, g, b].map(v => v.toString(16).padStart(2, '0')).join('');
    const num = (r << 16) | (g << 8) | b;
    this.valueChange.emit({ hex, num });
  }

  private hslToRgb(h: number, s: number, l: number) {
    let r: number, g: number, b: number;
    if (s === 0) { r = g = b = l * 255; return { r: r|0, g: g|0, b: b|0 }; }
    const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
    const p = 2 * l - q;
    const toRgb = (t: number) => {
      if (t < 0) t += 1;
      if (t > 1) t -= 1;
      if (t < 1/6) return p + (q - p) * 6 * t;
      if (t < 1/2) return q;
      if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
      return p;
    };
    r = toRgb(h + 1/3) * 255;
    g = toRgb(h) * 255;
    b = toRgb(h - 1/3) * 255;
    return { r: r|0, g: g|0, b: b|0 };
  }

  private rgbToHsl(r: number, g: number, b: number) {
    r /= 255; g /= 255; b /= 255;
    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h = 0, s = 0;
    const l = (max + min) / 2;
    if (max !== min) {
      const d = max - min;
      s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
      switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
      }
      h /= 6;
    }
    return { h, s, l };
  }
}