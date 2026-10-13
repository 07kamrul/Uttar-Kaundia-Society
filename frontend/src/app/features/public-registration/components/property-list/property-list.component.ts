import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  Input,
  OnChanges,
  SimpleChanges,
  inject,
} from '@angular/core';
import { AbstractControl, FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import { MAX_PROPERTY_COUNT } from '../../../../core/models/registration.model';
import { buildPropertyGroup } from '../../registration-form.builder';
import { PropertyItemComponent } from './property-item.component';
import { BnNumberPipe } from '../../../../shared/pipes/bn-pipes';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';

/** True when any leaf control under `control` holds a user-entered value. */
export function hasEnteredData(control: AbstractControl): boolean {
  if (control instanceof FormGroup || control instanceof FormArray) {
    return Object.values(control.controls).some((c) => hasEnteredData(c));
  }
  const value: unknown = control.value;
  if (Array.isArray(value)) return value.length > 0;
  // An untouched checkbox (false) is not something the member typed.
  if (typeof value === 'boolean') return value;
  return value !== null && value !== undefined && String(value).trim() !== '';
}

@Component({
  selector: 'app-property-list',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, PropertyItemComponent, BnNumberPipe, TranslatePipe],
  templateUrl: './property-list.component.html',
  styleUrl: './property-list.component.scss',
})
export class PropertyListComponent implements OnChanges {
  @Input({ required: true }) form!: FormGroup;
  @Input({ required: true }) properties!: FormArray;
  @Input() submitAttempted = false;
  /** Feature flags; all off keeps the count toolbar. */
  @Input() ui: RegistrationUiFlags = NO_UI_FLAGS;

  readonly maxCount = MAX_PROPERTY_COUNT;
  liveMessage = '';

  private readonly fb = inject(FormBuilder);
  private readonly translate = inject(TranslateService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  ngOnChanges(changes: SimpleChanges): void {
    // A fresh (or discarded-and-rebuilt) form starts with no properties; seed
    // one card so the member never faces an empty step. Restored drafts keep
    // their saved cards untouched.
    if (!(changes['properties'] || changes['form']) || !this.properties || !this.form) return;
    if (this.properties.length === 0) {
      this.properties.push(buildPropertyGroup(this.fb));
    }
    this.syncCount();
  }

  get count(): number {
    return this.properties.length;
  }

  get canAdd(): boolean {
    return this.count < this.maxCount;
  }

  get canRemove(): boolean {
    return this.count > 1;
  }

  addProperty(): void {
    if (!this.canAdd) return;
    this.properties.push(buildPropertyGroup(this.fb));
    this.syncCount();
    const index = this.count - 1;
    this.announce('registration.property.added', index + 1);
    setTimeout(() => this.focusProperty(index));
  }

  removeProperty(index: number): void {
    if (!this.canRemove) return;
    const group = this.properties.at(index);
    if (!group) return;
    const needsConfirm = hasEnteredData(group);
    if (
      needsConfirm &&
      !window.confirm(this.translate.instant('registration.property.removeConfirm', { n: index + 1 }))
    ) {
      return;
    }
    this.properties.removeAt(index);
    this.syncCount();
    this.announce('registration.property.removed', index + 1);
  }

  propertyGroup(i: number): FormGroup {
    return this.properties.at(i) as FormGroup;
  }

  private syncCount(): void {
    this.form.get('propertyCount')?.setValue(this.count);
  }

  private announce(key: string, n: number): void {
    this.liveMessage = this.translate.instant(key, { n });
  }

  private focusProperty(index: number): void {
    const card = this.host.nativeElement.querySelector<HTMLElement>(`#property-card-${index}`);
    card?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    card?.querySelector<HTMLElement>('input, select, textarea')?.focus({ preventScroll: true });
  }
}
