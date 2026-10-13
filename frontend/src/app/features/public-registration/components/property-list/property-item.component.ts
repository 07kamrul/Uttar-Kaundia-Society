import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  EventEmitter,
  Input,
  OnInit,
  Output,
  inject,
  signal,
} from '@angular/core';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { TranslatePipe, TranslateService } from '@ngx-translate/core';
import {
  ALLOWED_DOC_MIME_TYPES,
  DOCUMENT_OPTIONS,
  MAX_DOC_FILE_BYTES,
  OWNERSHIP_LABEL_KEYS,
  OWNERSHIP_TYPES,
  PROPERTY_TYPE_LABEL_KEYS,
  PROPERTY_TYPES,
} from '../../../../core/models/registration.model';
import { ConfigListService } from '../../../../core/services/config-list.service';
import { buildApplicableDocGroup, applicableDocsArray } from '../../registration-form.builder';
import { AsciiDigitsDirective } from '../../ascii-digits.directive';
import { prepareUpload, readAsDataUrl } from '../../file-upload';
import { hasAtLeastOneProof } from '../../step-rules';
import { NO_UI_FLAGS, type RegistrationUiFlags } from '../../registration-ui-flags';
import { DagHelpSheetComponent } from '../dag-help-sheet/dag-help-sheet.component';

const DIGITS_ONLY_PATTERN = /^\d+$/;

@Component({
  selector: 'app-property-item',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [ReactiveFormsModule, TranslatePipe, AsciiDigitsDirective, DagHelpSheetComponent],
  templateUrl: './property-item.component.html',
})
export class PropertyItemComponent implements OnInit {
  @Input({ required: true }) property!: FormGroup;
  @Input({ required: true }) index = 0;
  @Input() submitAttempted = false;
  @Input() canRemove = false;
  /** Feature flags; all off keeps the original form. */
  @Input() ui: RegistrationUiFlags = NO_UI_FLAGS;
  @Output() removeProperty = new EventEmitter<void>();

  // Seeded with the static defaults so the form renders immediately; replaced
  // by the admin-editable config-list values once ngOnInit's fetch resolves
  // (falls back to these same defaults if that request fails).
  propertyTypes: string[] = PROPERTY_TYPES;
  readonly ownershipTypes = OWNERSHIP_TYPES;

  typeLabel(t: string): string {
    const key = PROPERTY_TYPE_LABEL_KEYS[t];
    return key ? this.translate.instant(`registration.property.typeOptions.${key}`) : t;
  }

  ownershipLabel(t: string): string {
    const key = OWNERSHIP_LABEL_KEYS[t];
    return key ? this.translate.instant(`registration.property.ownershipOptions.${key}`) : t;
  }

  documentOptions: string[] = DOCUMENT_OPTIONS;
  readonly maxDocFileMb = MAX_DOC_FILE_BYTES / (1024 * 1024);
  docFileErrors: Record<string, string> = {};

  private readonly cdr = inject(ChangeDetectorRef);

  constructor(
    private fb: FormBuilder,
    private translate: TranslateService,
    private configListService: ConfigListService,
  ) {}

  readonly dagHelpOpen = signal(false);

  get dagUnknown(): boolean {
    return this.ui.dagUnknown && this.property.get('dagUnknown')?.value === true;
  }

  setDagUnknown(checked: boolean): void {
    this.property.get('dagUnknown')?.setValue(checked);
    this.syncDagState();
  }

  /** "I do not know the dag": the boxes are emptied and locked; the office fills them in later. */
  private syncDagState(): void {
    const dagNo = this.property.get('dagNo');
    if (this.dagUnknown) {
      dagNo?.reset({ cs: '', rs: '' });
      dagNo?.disable();
    } else {
      dagNo?.enable();
    }
  }

  hasProof(): boolean {
    return hasAtLeastOneProof(this.applicableDocs.getRawValue());
  }

  ngOnInit(): void {
    if (this.dagUnknown) this.syncDagState();
    this.configListService.getValues('property_type', PROPERTY_TYPES).subscribe((values) => {
      this.propertyTypes = values;
      this.cdr.markForCheck();
    });
    this.configListService.getValues('document_type', DOCUMENT_OPTIONS).subscribe((values) => {
      this.documentOptions = values;
      this.cdr.markForCheck();
    });
  }

  get applicableDocs(): FormArray {
    return applicableDocsArray(this.property);
  }

  isTypeChecked(type: string): boolean {
    return (this.property.get('propertyType')?.value as string[]).includes(type);
  }

  toggleType(type: string): void {
    const current = this.property.get('propertyType')?.value as string[];
    const next = current.includes(type) ? current.filter((t) => t !== type) : [...current, type];
    this.property.get('propertyType')?.setValue(next);
  }

  setOwnership(ownership: string): void {
    this.property.get('ownership')?.setValue(ownership);
    if (ownership !== 'যৌথ') {
      this.property.get('jointOwnerCount')?.setValue(null);
    }
  }

  findDocEntry(type: string): FormGroup | undefined {
    return this.applicableDocs.controls.find((c) => c.get('type')?.value === type) as
      FormGroup | undefined;
  }

  isDocChecked(type: string): boolean {
    return !!this.findDocEntry(type);
  }

  toggleDoc(type: string): void {
    const existingIndex = this.applicableDocs.controls.findIndex(
      (c) => c.get('type')?.value === type,
    );
    if (existingIndex >= 0) {
      this.applicableDocs.removeAt(existingIndex);
      delete this.docFileErrors[type];
    } else {
      this.applicableDocs.push(buildApplicableDocGroup(this.fb, type));
    }
  }

  async onDocFileChange(type: string, event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const picked = input.files?.[0];
    input.value = '';
    if (!picked) return;

    if (!ALLOWED_DOC_MIME_TYPES.includes(picked.type)) {
      this.setDocError(type, this.translate.instant('registration.property.docFileTypeError'));
      return;
    }
    // Phone photos are shrunk first (simplified UI), so only the result is size-checked.
    const file = await prepareUpload(picked, this.ui.simplified);
    if (file.size > MAX_DOC_FILE_BYTES) {
      this.setDocError(
        type,
        this.translate.instant('registration.property.docFileSizeError', { maxMb: this.maxDocFileMb }),
      );
      return;
    }
    const { [type]: _removed, ...rest } = this.docFileErrors;
    this.docFileErrors = rest;

    const dataUrl = await readAsDataUrl(file);
    // "At least one proof": slots have no tick box, so the entry appears with its first file.
    const group = this.findDocEntry(type) ?? this.addDocEntry(type);
    group.patchValue({ fileName: file.name, fileDataUrl: dataUrl });
    this.cdr.markForCheck();
  }

  private addDocEntry(type: string): FormGroup {
    const group = buildApplicableDocGroup(this.fb, type);
    this.applicableDocs.push(group);
    return group;
  }

  private setDocError(type: string, message: string): void {
    this.docFileErrors = { ...this.docFileErrors, [type]: message };
    this.cdr.markForCheck();
  }

  removeDocFile(type: string): void {
    const group = this.findDocEntry(type);
    group?.patchValue({ fileName: '', fileDataUrl: '' });
  }

  isDocMissing(type: string): boolean {
    const entry = this.findDocEntry(type);
    return this.submitAttempted && !!entry && !entry.get('fileDataUrl')?.value;
  }

  showPropertyTypeError(): boolean {
    const value = this.property.get('propertyType')?.value as string[];
    return this.submitAttempted && (!value || value.length === 0);
  }

  showOwnershipError(): boolean {
    return this.submitAttempted && !this.property.get('ownership')?.value;
  }

  showKhatianNoError(): boolean {
    return this.submitAttempted && !this.property.get('khatianNo')?.value?.trim();
  }

  showDagNoError(controlName: 'cs' | 'rs'): boolean {
    if (this.dagUnknown) return false;
    const control = this.property.get('dagNo')?.get(controlName);
    return this.submitAttempted && !control?.value?.trim();
  }

  showJointOwnerCountError(): boolean {
    const ownership = this.property.get('ownership')?.value;
    const count = this.property.get('jointOwnerCount')?.value;
    return (
      ownership === 'যৌথ' && this.submitAttempted && (count === null || count === 0 || count === '')
    );
  }

  showLandQuantityError(): boolean {
    return this.submitAttempted && !this.property.get('landQuantity')?.value?.trim();
  }

  showLandQuantityNotPositiveError(): boolean {
    return this.property.get('landQuantity')?.hasError('notPositive') ?? false;
  }

  showMyShareQuantityError(): boolean {
    return this.submitAttempted && !this.property.get('myShareQuantity')?.value?.trim();
  }

  showMyShareQuantityNotPositiveError(): boolean {
    return this.property.get('myShareQuantity')?.hasError('notPositive') ?? false;
  }

  showShareExceedsTotalError(): boolean {
    return this.property.hasError('shareExceedsTotal');
  }

  showApplicableDocsError(): boolean {
    return (
      this.submitAttempted &&
      (this.ui.minOneProof ? !this.hasProof() : this.applicableDocs.length === 0)
    );
  }
}
