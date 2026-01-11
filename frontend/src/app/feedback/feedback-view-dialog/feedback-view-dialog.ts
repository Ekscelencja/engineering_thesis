import { Component, Inject } from '@angular/core';
import { CommonModule } from '@angular/common';
import { MatDialogRef, MAT_DIALOG_DATA, MatDialogModule } from '@angular/material/dialog';
import { MatButtonModule } from '@angular/material/button';
import { MatIconModule } from '@angular/material/icon';
import { Feedback } from '../../services/api/notification.service';

@Component({
    selector: 'app-feedback-view-dialog',
    standalone: true,
    imports: [
        CommonModule,
        MatDialogModule,
        MatButtonModule,
        MatIconModule
    ],
    templateUrl: './feedback-view-dialog.html',
    styleUrls: ['./feedback-view-dialog.scss']
})
export class FeedbackViewDialogComponent {
    constructor(
        public dialogRef: MatDialogRef<FeedbackViewDialogComponent>,
        @Inject(MAT_DIALOG_DATA) public data: { feedback: Feedback; canResolve: boolean }
    ) { }

    getAuthorName(): string {
        if (typeof this.data.feedback.author === 'object') {
            return this.data.feedback.author.name || this.data.feedback.author.email;
        }
        return 'Unknown';
    }

    onClose(): void {
        this.dialogRef.close();
    }

    onResolve(): void {
        this.dialogRef.close({ resolve: true });
    }
}