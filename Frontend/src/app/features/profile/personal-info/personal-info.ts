import { Component, EventEmitter, Output, OnInit, ChangeDetectorRef, ChangeDetectionStrategy } from '@angular/core';
import { ReactiveFormsModule, FormGroup, FormControl } from '@angular/forms';
import { CommonModule } from '@angular/common';
import { Router } from '@angular/router';
import { AuthService } from '../../auth/auth.service';
import { CityAutocomplete } from '../../../shared/city-autocomplete/city-autocomplete';
import { City } from '../../../shared/data/cities';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-personal-info',
  standalone: true,
  imports: [ReactiveFormsModule, CommonModule, CityAutocomplete],
  templateUrl: './personal-info.html',
  styleUrls: ['./personal-info.scss']
})
export class PersonalInfoComponent implements OnInit {
  @Output() infoUpdate = new EventEmitter<any>();

  profileForm = new FormGroup({
    fullName: new FormControl(''),
    email: new FormControl({ value: '', disabled: true }),
    city: new FormControl<City | null>(null),
    skills: new FormControl(''),
    bio: new FormControl('')
  });

  isLoading = true;
  isSaving = false;
  successMessage = '';
  errorMessage = '';
  isNgo = false;

  constructor(
    private authService: AuthService,
    private cdr: ChangeDetectorRef,
    private router: Router
  ) {}

  ngOnInit(): void {
    console.log('[PersonalInfo] Component initialized. Fetching data...');
    this.isNgo = this.authService.getCurrentUser()?.role === 'ngo';
    this.fetchProfileData();
  }

  fetchProfileData(): void {
    this.authService.getProfile().subscribe({
      next: (response: any) => {
        console.log('[PersonalInfo] Data received successfully:', response);
        
        const user = response.data?.user || {};
        
        this.profileForm.patchValue({
          fullName: user.name || '',
          email: user.email || '',
          city: user.city?.name ? user.city : null,
          skills: Array.isArray(user.skills) ? user.skills.join(', ') : (user.skills || ''),
          bio: user.bio || ''
        });

        this.isLoading = false;
        this.cdr.detectChanges(); 
      },
      error: (err: any) => {
        console.error('[PersonalInfo] Backend Error:', err);
        this.errorMessage = err.error?.message || 'Could not load profile data.';
        this.isLoading = false;
        this.cdr.detectChanges(); 
      }
    });
  }

  onSubmit() {
    if (this.profileForm.invalid) return;
    
    this.isSaving = true;
    this.successMessage = '';
    this.errorMessage = '';
    this.cdr.detectChanges(); 

    const formData = this.profileForm.getRawValue();
    
    const payload = {
      name: formData.fullName,
      city: formData.city,
      skills: formData.skills ? formData.skills.split(',').map((s: string) => s.trim()) : [],
      bio: formData.bio
    };

    this.authService.updateProfile(payload).subscribe({
      next: (response: any) => {
        this.successMessage = 'Profile updated successfully!';
        this.isSaving = false;
        this.infoUpdate.emit(payload); 
        this.cdr.detectChanges(); 
      },
      error: (err: any) => {
        this.errorMessage = err.error?.message || 'Failed to update profile.';
        this.isSaving = false;
        this.cdr.detectChanges(); 
      }
    });
  }

  deleteAccount(): void {
    const confirmDelete = window.confirm('Are you sure you want to delete your account? This action cannot be undone.');
    
    if (confirmDelete) {
      this.authService.deleteAccount().subscribe({
        next: () => {
          localStorage.removeItem('wastezero_token');
          localStorage.removeItem('wastezero_user');
          this.router.navigate(['/auth']);
        },
        error: (err: any) => {
          this.errorMessage = err.error?.message || 'Failed to delete account.';
          this.cdr.detectChanges();
        }
      });
    }
  }
}
