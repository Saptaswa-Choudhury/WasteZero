import { Component, ChangeDetectionStrategy, forwardRef } from '@angular/core';
import { CommonModule } from '@angular/common';
import { ControlValueAccessor, FormsModule, NG_VALUE_ACCESSOR } from '@angular/forms';
import { CITIES, City } from '../data/cities';

@Component({
  changeDetection: ChangeDetectionStrategy.Eager,
  selector: 'app-city-autocomplete',
  standalone: true,
  imports: [CommonModule, FormsModule],
  templateUrl: './city-autocomplete.html',
  styleUrl: './city-autocomplete.scss',
  providers: [
    {
      provide: NG_VALUE_ACCESSOR,
      useExisting: forwardRef(() => CityAutocomplete),
      multi: true
    }
  ]
})
export class CityAutocomplete implements ControlValueAccessor {
  query = '';
  isOpen = false;
  suggestions: City[] = [];
  selected: City | null = null;
  disabled = false;

  private onChange: (value: City | null) => void = () => {};
  private onTouched: () => void = () => {};

  writeValue(value: City | null): void {
    this.selected = value;
    this.query = value?.name || '';
  }

  registerOnChange(fn: (value: City | null) => void): void {
    this.onChange = fn;
  }

  registerOnTouched(fn: () => void): void {
    this.onTouched = fn;
  }

  setDisabledState(isDisabled: boolean): void {
    this.disabled = isDisabled;
  }

  onInput(value: string): void {
    this.query = value;
    this.selected = null;
    this.onChange(null);

    const term = value.trim().toLowerCase();
    this.suggestions = term
      ? CITIES.filter((c) => c.name.toLowerCase().startsWith(term)).slice(0, 8)
      : [];
    this.isOpen = this.suggestions.length > 0;
  }

  onFocus(): void {
    if (this.query.trim()) {
      this.onInput(this.query);
    }
  }

  onBlur(): void {
    setTimeout(() => {
      this.isOpen = false;
      this.onTouched();
    }, 150);
  }

  selectCity(city: City): void {
    this.selected = city;
    this.query = city.name;
    this.isOpen = false;
    this.onChange(city);
  }
}
