import { Component, signal, ChangeDetectionStrategy } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { ThemeService } from './core/theme/theme.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-root',
  imports: [RouterOutlet],
  templateUrl: './app.html',
  styleUrl: './app.scss',
})
export class App {
  protected readonly title = signal('wastezero-frontend');

  // Injecting ThemeService here (rather than lazily in individual pages)
  // makes sure the saved theme class is applied to <html> as early as
  // possible, before any page - including the login/registration page -
  // renders.
  constructor(private readonly themeService: ThemeService) {}
}
