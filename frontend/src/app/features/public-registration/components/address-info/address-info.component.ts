import { AsyncPipe } from '@angular/common';
import {
  Component,
  DestroyRef,
  inject,
  Input,
  OnInit,
  ChangeDetectionStrategy,
  computed,
  signal,
  type Signal,
} from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { BehaviorSubject, Observable, switchMap } from 'rxjs';
import { listPhoneCountries } from '../../../../shared/phone-input/phone-number';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';
import { SearchableSelectComponent, type SelectOption } from '../searchable-select/searchable-select.component';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  AddressLocationService,
  District,
  Division,
  Upazila,
} from '../../services/address-location.service';

const DEFAULT_DIVISION = 'ঢাকা';
const DEFAULT_DISTRICT = 'ঢাকা';
const DEFAULT_UPAZILA = 'সাভার';

const ADDRESS_FIELD_ERROR_KEYS: Record<string, string> = {
  division: 'registration.addressInfo.divisionRequired',
  district: 'registration.addressInfo.districtRequired',
  upazila: 'registration.addressInfo.upazilaRequired',
  postOffice: 'registration.addressInfo.postOfficeRequired',
  road: 'registration.addressInfo.roadRequired',
  house: 'registration.addressInfo.houseRequired',
};

@Component({
  selector: 'app-address-info',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, AsyncPipe, TranslatePipe, SearchableSelectComponent],
  templateUrl: './address-info.component.html',
})
export class AddressInfoComponent implements OnInit {
  @Input({ required: true }) form!: FormGroup;
  @Input() submitAttempted = false;
  /** Feature flags; all off keeps the original form. */
  @Input() ui: RegistrationUiFlags = NO_UI_FLAGS;

  private readonly destroyRef = inject(DestroyRef);
  private readonly addressLocationService = inject(AddressLocationService);
  private readonly translate = inject(TranslateService);

  sameAsCurrentAddress = new FormControl(false);

  divisions$: Observable<Division[]> = this.addressLocationService.getDivisions();

  private readonly currentDivision$ = new BehaviorSubject<string>('');
  private readonly permanentDivision$ = new BehaviorSubject<string>('');
  private readonly currentDistrict$ = new BehaviorSubject<string>('');
  private readonly permanentDistrict$ = new BehaviorSubject<string>('');

  currentDistricts$: Observable<District[]> = this.currentDivision$.pipe(
    switchMap((divisionName) =>
      this.addressLocationService.getDistrictsByDivisionName(divisionName),
    ),
  );

  permanentDistricts$: Observable<District[]> = this.permanentDivision$.pipe(
    switchMap((divisionName) =>
      this.addressLocationService.getDistrictsByDivisionName(divisionName),
    ),
  );

  currentUpazilas$: Observable<Upazila[]> = this.currentDistrict$.pipe(
    switchMap((districtName) =>
      this.addressLocationService.getUpazilasByDistrictName(districtName),
    ),
  );

  permanentUpazilas$: Observable<Upazila[]> = this.permanentDistrict$.pipe(
    switchMap((districtName) =>
      this.addressLocationService.getUpazilasByDistrictName(districtName),
    ),
  );

  /** Latest list from `source$` as a signal (avoids toSignal, which would pull rxjs-interop into the main bundle). */
  private listSignal<T>(source$: Observable<T[]>): Signal<T[]> {
    const state = signal<T[]>([]);
    source$.pipe(takeUntilDestroyed(this.destroyRef)).subscribe((items) => state.set(items));
    return state.asReadonly();
  }

  // Typeable lists for reg_simplified_ui (the plain selects keep using the async pipes above).
  private readonly divisionList = this.listSignal(this.divisions$);
  private readonly currentDistrictList = this.listSignal(this.currentDistricts$);
  private readonly permanentDistrictList = this.listSignal(this.permanentDistricts$);
  private readonly currentUpazilaList = this.listSignal(this.currentUpazilas$);
  private readonly permanentUpazilaList = this.listSignal(this.permanentUpazilas$);

  readonly divisionOptions = computed(() => this.toOptions(this.divisionList()));
  readonly currentDistrictOptions = computed(() => this.toOptions(this.currentDistrictList()));
  readonly permanentDistrictOptions = computed(() => this.toOptions(this.permanentDistrictList()));
  readonly currentUpazilaOptions = computed(() => this.toOptions(this.currentUpazilaList()));
  readonly permanentUpazilaOptions = computed(() => this.toOptions(this.permanentUpazilaList()));

  /** Countries for "বিদেশে থাকি" (everything except Bangladesh), searchable in both languages. */
  readonly countryOptions = computed<SelectOption[]>(() => {
    const locale = this.translate.currentLang() === 'en' ? 'en' : 'bn';
    return listPhoneCountries(locale)
      .filter((country) => country.code !== 'BD')
      .map((country) => ({ value: country.code, label: country.name, search: country.englishName }));
  });

  private toOptions(items: { name: string; bn_name: string }[]): SelectOption[] {
    const bangla = this.translate.currentLang() !== 'en';
    return items.map((item) => ({ value: item.bn_name, label: bangla ? item.bn_name : item.name }));
  }

  /** reg_abroad_address: true while the member says they live abroad. */
  get abroad(): boolean {
    return this.ui.abroadAddress && this.form.get('currentAddressAbroad')?.value === true;
  }

  get countryControl(): FormControl {
    return this.form.get('currentCountry') as FormControl;
  }

  setAbroad(isAbroad: boolean): void {
    this.form.get('currentAddressAbroad')?.setValue(isAbroad);
    this.syncAbroadState();
  }

  /** Abroad: the permanent address must be filled in separately, so "same as current" is off. */
  private syncAbroadState(): void {
    if (this.abroad) {
      this.sameAsCurrentAddress.setValue(false);
      this.permanentAddressGroup.enable({ emitEvent: false });
    }
  }

  /** reg_simplified_ui: most members live in Savar, so start there; never overwrite entered data. */
  private applySimplifiedDefaults(): void {
    const current = this.currentAddressGroup;
    const geoEmpty = ['division', 'district', 'upazila'].every((f) => !current.get(f)?.value);
    if (geoEmpty) {
      current.get('division')?.setValue(DEFAULT_DIVISION);
      current.get('district')?.setValue(DEFAULT_DISTRICT);
      current.get('upazila')?.setValue(DEFAULT_UPAZILA);
    }
    const permanentEmpty = ['division', 'district', 'upazila', 'house'].every(
      (f) => !this.permanentAddressGroup.get(f)?.value,
    );
    if (permanentEmpty && !this.abroad) this.sameAsCurrentAddress.setValue(true);
  }

  ngOnInit(): void {
    this.sameAsCurrentAddress.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((isSame) => this.applySameAsCurrentAddress(isSame ?? false));

    this.currentAddressGroup.valueChanges
      .pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe(() => {
        if (this.sameAsCurrentAddress.value) {
          this.copyCurrentAddressToPermanent();
        }
      });

    this.currentAddressGroup
      .get('division')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((division) => this.onDivisionChange('currentAddress', division ?? ''));

    this.permanentAddressGroup
      .get('division')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((division) => this.onDivisionChange('permanentAddress', division ?? ''));

    this.currentAddressGroup
      .get('district')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((district) => this.onDistrictChange('currentAddress', district ?? ''));

    this.permanentAddressGroup
      .get('district')!
      .valueChanges.pipe(takeUntilDestroyed(this.destroyRef))
      .subscribe((district) => this.onDistrictChange('permanentAddress', district ?? ''));

    this.syncAbroadState();
    if (this.ui.simplified) this.applySimplifiedDefaults();
  }

  private onDivisionChange(
    groupName: 'currentAddress' | 'permanentAddress',
    divisionName: string,
  ): void {
    const subject =
      groupName === 'currentAddress' ? this.currentDivision$ : this.permanentDivision$;
    if (subject.value === divisionName) {
      return;
    }
    subject.next(divisionName);
    this.form.get(`${groupName}.district`)?.setValue('', { emitEvent: true });
  }

  private onDistrictChange(
    groupName: 'currentAddress' | 'permanentAddress',
    districtName: string,
  ): void {
    const subject =
      groupName === 'currentAddress' ? this.currentDistrict$ : this.permanentDistrict$;
    if (subject.value === districtName) {
      return;
    }
    subject.next(districtName);
    this.form.get(`${groupName}.upazila`)?.setValue('', { emitEvent: false });
  }

  private get currentAddressGroup(): FormGroup {
    return this.form.get('currentAddress') as FormGroup;
  }

  private get permanentAddressGroup(): FormGroup {
    return this.form.get('permanentAddress') as FormGroup;
  }

  private applySameAsCurrentAddress(isSame: boolean): void {
    if (isSame) {
      this.copyCurrentAddressToPermanent();
      this.permanentAddressGroup.disable({ emitEvent: false });
    } else {
      this.permanentAddressGroup.enable({ emitEvent: false });
    }
  }

  private copyCurrentAddressToPermanent(): void {
    const currentValue = this.currentAddressGroup.value;
    this.permanentDivision$.next(currentValue.division ?? '');
    this.permanentDistrict$.next(currentValue.district ?? '');
    this.permanentAddressGroup.patchValue(currentValue, { emitEvent: false });
  }

  showError(groupName: 'currentAddress' | 'permanentAddress', controlName: string): boolean {
    const control = this.form.get(`${groupName}.${controlName}`);
    return !!control && control.invalid && (control.touched || this.submitAttempted);
  }

  errorMessage(controlName: string): string {
    const key = ADDRESS_FIELD_ERROR_KEYS[controlName];
    return key ? this.translate.instant(key) : '';
  }

  localizedName(item: { name: string; bn_name: string }): string {
    return this.translate.currentLang() === 'bn' ? item.bn_name : item.name;
  }
}
