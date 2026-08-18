import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';
import { CommonModule } from '@angular/common';
import { FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { PageShell } from '../../../shared/page-shell/page-shell';
import { CityAutocomplete } from '../../../shared/city-autocomplete/city-autocomplete';
import { City } from '../../../shared/data/cities';
import { AuthService } from '../../auth/auth.service';
import {
  Pickup,
  PickupPartyRef,
  PickupService,
  TIME_SLOT_OPTIONS,
  WASTE_TYPE_OPTIONS,
  WasteType
} from '../pickup.service';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-schedule-pickup',
  standalone: true,
  imports: [CommonModule, ReactiveFormsModule, PageShell, CityAutocomplete],
  templateUrl: './schedule-pickup.html',
  styleUrl: './schedule-pickup.scss'
})
export class SchedulePickup implements OnInit {
  activeTab: 'schedule' | 'history' = 'schedule';

  // --- Multi-step "Schedule New Pickup" form ---
  currentStep: 1 | 2 = 1;
  form: FormGroup;

  readonly timeSlotOptions = TIME_SLOT_OPTIONS;
  readonly wasteTypeOptions = WASTE_TYPE_OPTIONS;
  readonly minDate = new Date().toISOString().substring(0, 10);

  isSaving = false;
  errorMessage = '';
  successMessage = '';

  // --- "Pickup History" list ---
  pickups: Pickup[] = [];
  isLoadingHistory = true;
  historyError = '';
  cancellingId: string | null = null;

  constructor(
    private fb: FormBuilder,
    private pickupService: PickupService,
    private authService: AuthService,
    private router: Router
  ) {
    this.form = this.fb.group({
      address: ['', [Validators.required, Validators.minLength(5), Validators.maxLength(200)]],
      city: [null, [Validators.required]],
      pickupDate: ['', [Validators.required]],
      timeSlot: ['', [Validators.required]],
      wasteTypes: this.fb.group(
        this.wasteTypeOptions.reduce((acc, option) => {
          acc[option.value] = [false];
          return acc;
        }, {} as Record<string, any>)
      ),
      notes: ['', [Validators.maxLength(500)]]
    });
  }

  ngOnInit(): void {
    // Safety net: only volunteers can access this page (sidebar/nav already hide the link).
    const currentUser = this.authService.getCurrentUser();
    if (currentUser?.role !== 'volunteer') {
      this.router.navigate(['/opportunities']);
      return;
    }

    this.fetchPickups();
  }

  setActiveTab(tab: 'schedule' | 'history'): void {
    this.activeTab = tab;
    this.errorMessage = '';
    this.successMessage = '';
  }

  goToScheduleTab(): void {
    this.setActiveTab('schedule');
  }

  // --- Step navigation ---

  get step1Fields() {
    return ['address', 'city', 'pickupDate', 'timeSlot'];
  }

  goToNextStep(): void {
    let valid = true;
    this.step1Fields.forEach((field) => {
      const control = this.form.get(field);
      control?.markAsTouched();
      if (control?.invalid) {
        valid = false;
      }
    });

    if (!valid) {
      this.errorMessage = 'Please fill in all required fields correctly before continuing.';
      return;
    }

    this.errorMessage = '';
    this.currentStep = 2;
  }

  goToPreviousStep(): void {
    this.errorMessage = '';
    this.currentStep = 1;
  }

  get selectedWasteTypesCount(): number {
    const group = this.form.get('wasteTypes') as FormGroup;
    return Object.values(group.value).filter(Boolean).length;
  }

  // --- Submit ---

  onSubmit(): void {
    const wasteTypesGroup = this.form.get('wasteTypes') as FormGroup;
    const selectedWasteTypes = Object.entries(wasteTypesGroup.value)
      .filter(([, checked]) => checked)
      .map(([key]) => key) as WasteType[];

    if (selectedWasteTypes.length === 0) {
      this.errorMessage = 'Please select at least one waste type.';
      return;
    }

    if (this.form.get('notes')?.invalid) {
      this.form.get('notes')?.markAsTouched();
      this.errorMessage = 'Additional notes must not exceed 500 characters.';
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

    this.pickupService
      .create({
        address: raw.address,
        city: city.name,
        lat: city.lat,
        lng: city.lng,
        pickupDate: raw.pickupDate,
        timeSlot: raw.timeSlot,
        wasteTypes: selectedWasteTypes,
        notes: raw.notes || ''
      })
      .subscribe({
        next: () => {
          this.isSaving = false;
          this.successMessage = 'Your pickup has been scheduled successfully!';
          this.resetForm();
          this.fetchPickups();
          this.setActiveTab('history');
        },
        error: (err: any) => {
          this.isSaving = false;
          this.errorMessage =
            err.error?.message || (err.error?.errors || []).join(', ') || 'Failed to schedule pickup.';
        }
      });
  }

  private resetForm(): void {
    this.form.reset();
    this.currentStep = 1;
    Object.keys((this.form.get('wasteTypes') as FormGroup).controls).forEach((key) => {
      (this.form.get('wasteTypes') as FormGroup).get(key)?.setValue(false);
    });
  }

  // --- History ---

  fetchPickups(): void {
    this.isLoadingHistory = true;
    this.historyError = '';

    this.pickupService.getMine().subscribe({
      next: (response: any) => {
        this.pickups = response.data?.pickups || [];
        this.isLoadingHistory = false;
      },
      error: (err: any) => {
        this.historyError = err.error?.message || 'Could not load your pickup history.';
        this.isLoadingHistory = false;
      }
    });
  }

  cancelPickup(pickup: Pickup): void {
    if (this.cancellingId) {
      return;
    }

    this.cancellingId = pickup._id;

    this.pickupService.cancel(pickup._id).subscribe({
      next: (response: any) => {
        const updated = response.data?.pickup;
        const idx = this.pickups.findIndex((p) => p._id === pickup._id);
        if (idx > -1 && updated) {
          this.pickups[idx] = updated;
        }
        this.cancellingId = null;
      },
      error: (err: any) => {
        this.historyError = err.error?.message || 'Could not cancel this pickup.';
        this.cancellingId = null;
      }
    });
  }

  canCancel(pickup: Pickup): boolean {
    return pickup.status === 'PENDING' || pickup.status === 'IN_PROGRESS';
  }

  ngoName(pickup: Pickup): string {
    const ngo = pickup.ngo as PickupPartyRef | null | undefined;
    return ngo && typeof ngo === 'object' ? ngo.name : '';
  }

  wasteTypeLabel(value: string): string {
    return this.pickupService.wasteTypeLabel(value);
  }

  timeSlotLabel(value: string): string {
    return this.pickupService.timeSlotLabel(value);
  }

  statusClass(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'badge-pending';
      case 'IN_PROGRESS':
        return 'badge-progress';
      case 'COMPLETED':
        return 'badge-completed';
      case 'CANCELLED':
        return 'badge-cancelled';
      default:
        return '';
    }
  }

  statusLabel(status: string): string {
    switch (status) {
      case 'PENDING':
        return 'Pending';
      case 'IN_PROGRESS':
        return 'Accepted';
      case 'COMPLETED':
        return 'Completed';
      case 'CANCELLED':
        return 'Cancelled';
      default:
        return status;
    }
  }

  formatDate(dateStr: string): string {
    const date = new Date(dateStr);
    return date.toLocaleDateString('en-US', { year: 'numeric', month: 'short', day: 'numeric' });
  }
}
