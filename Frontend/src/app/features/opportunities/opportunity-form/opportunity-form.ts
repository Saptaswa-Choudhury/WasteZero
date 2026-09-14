import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PageShell } from '../../../shared/page-shell/page-shell';
import { CityAutocomplete } from '../../../shared/city-autocomplete/city-autocomplete';
import { City } from '../../../shared/data/cities';
import { OpportunityService } from '../opportunity.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-opportunity-form',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, RouterLink, PageShell, CityAutocomplete],
  templateUrl: './opportunity-form.html',
  styleUrl: './opportunity-form.scss'
})
export class OpportunityForm implements OnInit {
  form: FormGroup;

  isEditMode = false;
  opportunityId = '';

  isLoading = false;
  isSaving = false;
  errorMessage = '';

  readonly durationUnits = ['hours', 'days', 'weeks', 'months'];
  readonly statusOptions = ['OPEN', 'IN_PROGRESS', 'CLOSED', 'CANCELLED'];

  // Image upload state
  readonly maxImageSizeMb = 5;
  readonly allowedImageTypes = ['image/png', 'image/jpeg', 'image/webp', 'image/gif'];
  imagePreviewUrl: string | null = null;
  private newImageBase64: string | null = null;
  private imageRemoved = false;
  imageError = '';

  constructor(
    private fb: FormBuilder,
    private route: ActivatedRoute,
    private router: Router,
    private opportunityService: OpportunityService
  ) {
    this.form = this.fb.group({
      title: ['', [Validators.required, Validators.minLength(3), Validators.maxLength(100)]],
      description: ['', [Validators.required, Validators.minLength(10), Validators.maxLength(2000)]],
      city: [null as City | null, [Validators.required]],
      durationValue: [1, [Validators.required, Validators.min(1)]],
      durationUnit: ['hours', [Validators.required]],
      requiredSkills: [''],
      maxVolunteers: [0, [Validators.min(0)]],
      applicationDeadline: [''],
      status: ['OPEN']
    });
  }

  ngOnInit(): void {
    this.opportunityId = this.route.snapshot.paramMap.get('id') || '';
    this.isEditMode = !!this.opportunityId;

    if (this.isEditMode) {
      this.loadOpportunity();
    }
  }

  loadOpportunity(): void {
    this.isLoading = true;

    this.opportunityService.getById(this.opportunityId).subscribe({
      next: (response: any) => {
        const opp = response.data?.opportunity;

        const city: City | null =
          opp.location?.city && opp.location?.state && opp.lat != null && opp.lng != null
            ? { name: opp.location.city, state: opp.location.state, lat: opp.lat, lng: opp.lng }
            : null;

        this.form.patchValue({
          title: opp.title,
          description: opp.description,
          city,
          durationValue: opp.duration?.value,
          durationUnit: opp.duration?.unit,
          requiredSkills: (opp.requiredSkills || []).join(', '),
          maxVolunteers: opp.maxVolunteers || 0,
          applicationDeadline: opp.applicationDeadline ? opp.applicationDeadline.substring(0, 10) : '',
          status: opp.status
        });

        this.imagePreviewUrl = this.opportunityService.resolveImageUrl(opp.image);
        this.newImageBase64 = null;
        this.imageRemoved = false;

        this.isLoading = false;
      },
      error: (err: any) => {
        this.errorMessage = err.error?.message || 'Could not load this opportunity.';
        this.isLoading = false;
      }
    });
  }

  onImageSelected(event: Event): void {
    this.imageError = '';
    const input = event.target as HTMLInputElement;
    const file = input.files && input.files[0];

    if (!file) {
      return;
    }

    if (!this.allowedImageTypes.includes(file.type)) {
      this.imageError = 'Please choose a PNG, JPEG, WEBP, or GIF image.';
      input.value = '';
      return;
    }

    if (file.size > this.maxImageSizeMb * 1024 * 1024) {
      this.imageError = `Image must not exceed ${this.maxImageSizeMb}MB.`;
      input.value = '';
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      this.newImageBase64 = reader.result as string;
      this.imagePreviewUrl = this.newImageBase64;
      this.imageRemoved = false;
    };
    reader.onerror = () => {
      this.imageError = 'Could not read the selected image. Please try another file.';
    };
    reader.readAsDataURL(file);
  }

  removeImage(): void {
    this.imagePreviewUrl = null;
    this.newImageBase64 = null;
    this.imageRemoved = true;
    this.imageError = '';
  }

  onSubmit(): void {
    if (this.form.invalid) {
      this.form.markAllAsTouched();
      this.errorMessage = 'Please fill in all required fields correctly before submitting.';
      return;
    }

    const city: City | null = this.form.get('city')?.value || null;
    if (!city) {
      this.errorMessage = 'Please select a city from the suggestions.';
      return;
    }

    this.isSaving = true;
    this.errorMessage = '';

    const raw = this.form.getRawValue();

    const payload: any = {
      title: raw.title,
      description: raw.description,
      location: { city: city.name, state: city.state },
      lat: city.lat,
      lng: city.lng,
      duration: { value: Number(raw.durationValue), unit: raw.durationUnit },
      requiredSkills: raw.requiredSkills
        ? raw.requiredSkills.split(',').map((s: string) => s.trim()).filter(Boolean)
        : [],
      maxVolunteers: Number(raw.maxVolunteers) || 0
    };

    if (raw.applicationDeadline) {
      payload.applicationDeadline = raw.applicationDeadline;
    }

    if (this.newImageBase64) {
      // A new image was picked - send it for upload (create or replace).
      payload.image = this.newImageBase64;
    } else if (this.isEditMode && this.imageRemoved) {
      // Existing image explicitly cleared - tell the server to remove it.
      payload.image = null;
    }

    if (this.isEditMode) {
      payload.status = raw.status;

      this.opportunityService.update(this.opportunityId, payload).subscribe({
        next: () => this.router.navigate(['/opportunities', this.opportunityId]),
        error: (err: any) => {
          this.errorMessage = err.error?.message || (err.error?.errors || []).join(', ') || 'Failed to update opportunity.';
          this.isSaving = false;
        }
      });
    } else {
      this.opportunityService.create(payload).subscribe({
        next: (response: any) => {
          const newId = response.data?.opportunity?._id;
          this.router.navigate(['/opportunities', newId]);
        },
        error: (err: any) => {
          this.errorMessage = err.error?.message || (err.error?.errors || []).join(', ') || 'Failed to create opportunity.';
          this.isSaving = false;
        }
      });
    }
  }

  cancel(): void {
    if (this.isEditMode) {
      this.router.navigate(['/opportunities', this.opportunityId]);
    } else {
      this.router.navigate(['/opportunities']);
    }
  }
}
