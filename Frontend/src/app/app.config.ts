import { ApplicationConfig, provideBrowserGlobalErrorListeners, provideZoneChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { provideHttpClient, withXhr, withInterceptors } from '@angular/common/http'; 
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth.interceptor'; // Import the interceptor

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(), 
    provideZoneChangeDetection(),
    provideRouter(routes),
    // Register the interceptor here
    provideHttpClient(withXhr(), withInterceptors([authInterceptor])) 
  ],
};