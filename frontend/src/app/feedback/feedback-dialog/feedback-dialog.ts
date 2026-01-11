import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormsModule } from '@angular/forms';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatInputModule } from '@angular/material/input';
import { MatFormFieldModule } from '@angular/material/form-field';

export interface FeedbackDialogData {
  elementType: 'room' | 'wall' | 'furniture';
  elementId: string;
  position: { x: number; y: number; z: number };
}

export interface FeedbackDialogResult {
  message: string;
}

@Component({
  selector: 'app-feedback-dialog',
  standalone: true,
  imports: [
    CommonModule,
    FormsModule,
    MatDialogModule,
    MatButtonModule,
    MatInputModule,
    MatFormFieldModule
  ],
  templateUrl: './feedback-dialog.html',
  styleUrls: ['./feedback-dialog.scss']
})
export class FeedbackDialogComponent {
  message = '';

  constructor(
    public dialogRef: MatDialogRef<FeedbackDialogComponent>,
    @Inject(MAT_DIALOG_DATA) public data: FeedbackDialogData
  ) {}

  onCancel(): void {
    this.dialogRef.close();
  }

  onSubmit(): void {
    if (this.message.trim()) {
      this.dialogRef.close({ message: this.message.trim() });
    }
  }
}