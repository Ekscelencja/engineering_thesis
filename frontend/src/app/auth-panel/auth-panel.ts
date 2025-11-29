import { Component, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ReactiveFormsModule } from '@angular/forms';
import { input } from '@angular/core';
import { FormBuilder, FormGroup, Validators } from '@angular/forms';
import { AuthService } from '../services/api/auth.service';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { SessionService } from '../services/api/session.service';

@Component({
  selector: 'auth-panel',
  templateUrl: './auth-panel.html',
  styleUrls: ['./auth-panel.scss'],
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [CommonModule, ReactiveFormsModule]
})
export class AuthPanel {
  mode = signal<'login' | 'register'>('login');
  error = signal<string>('');
  form: FormGroup;

  constructor(private fb: FormBuilder, private auth: AuthService, private router: Router, private session: SessionService) {
    this.form = this.fb.group({
      email: ['', [Validators.required, Validators.email]],
      password: ['', Validators.required],
      name: [''],
      role: ['architect']
    });
  }

  isLogin() {
    return this.mode() === 'login';
  }

  toggleMode() {
    this.mode.set(this.isLogin() ? 'register' : 'login');
    this.error.set('');
  }

  onSubmit() {
  if (this.form.invalid) return;
  this.error.set('');
  if (this.isLogin()) {
    this.auth.login(this.form.value).subscribe({
      next: (res) => {
        // Assuming res contains { token, user }
        this.session.setSession(res.token, res.user);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => this.error.set(err.error?.message || 'Login failed')
    });
  } else {
    this.auth.register(this.form.value).subscribe({
      next: (res) => {
        this.session.setSession(res.token, res.user);
        this.router.navigate(['/dashboard']);
      },
      error: (err) => this.error.set(err.error?.message || 'Registration failed')
    });
  }
}
}
