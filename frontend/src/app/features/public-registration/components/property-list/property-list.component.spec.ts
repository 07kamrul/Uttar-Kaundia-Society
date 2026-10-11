import { TestBed, ComponentFixture } from '@angular/core/testing';
import { provideTranslateService } from '@ngx-translate/core';
import { of } from 'rxjs';
import { FormArray, FormBuilder, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { vi } from 'vitest';
import { ConfigListService } from '../../../../core/services/config-list.service';
import { MAX_PROPERTY_COUNT } from '../../../../core/models/registration.model';
import { buildPropertyGroup } from '../../registration-form.builder';
import { PropertyListComponent, hasEnteredData } from './property-list.component';

describe('PropertyListComponent (Add / Remove Property)', () => {
  let form: FormGroup;
  let fb: FormBuilder;

  const properties = (): FormArray => form.get('properties') as FormArray;
  const count = (): number => form.get('propertyCount')?.value;

  function create(initialProperties = 0): ComponentFixture<PropertyListComponent> {
    fb = new FormBuilder();
    form = fb.group({
      propertyCount: [null],
      properties: fb.array(Array.from({ length: initialProperties }, () => buildPropertyGroup(fb))),
    });
    TestBed.configureTestingModule({
      imports: [ReactiveFormsModule],
      providers: [
        provideTranslateService(),
        { provide: ConfigListService, useValue: { getValues: (_: string, d: string[]) => of(d) } },
      ],
    });
    const fixture = TestBed.createComponent(PropertyListComponent);
    fixture.componentRef.setInput('form', form);
    fixture.componentRef.setInput('properties', properties());
    fixture.detectChanges();
    return fixture;
  }

  const button = (f: ComponentFixture<PropertyListComponent>, id: string): HTMLButtonElement =>
    f.nativeElement.querySelector(`[data-testid="${id}"]`);

  afterEach(() => vi.restoreAllMocks());

  it('seeds one property and sets the count to 1 on a fresh form', () => {
    create();
    expect(properties().length).toBe(1);
    expect(count()).toBe(1);
  });

  it('keeps restored draft properties untouched', () => {
    create(3);
    expect(properties().length).toBe(3);
    expect(count()).toBe(3);
  });

  it('Add Property adds a card and updates the count', () => {
    const f = create();
    button(f, 'add-property').click();
    f.detectChanges();
    expect(properties().length).toBe(2);
    expect(count()).toBe(2);
    expect(f.nativeElement.querySelectorAll('app-property-item').length).toBe(2);
  });

  it('disables Add Property at the maximum', () => {
    const f = create(MAX_PROPERTY_COUNT);
    expect(button(f, 'add-property').disabled).toBe(true);
    f.componentInstance.addProperty();
    expect(properties().length).toBe(MAX_PROPERTY_COUNT);
  });

  it('never removes the last remaining property', () => {
    const f = create();
    expect(button(f, 'remove-property').disabled).toBe(true);
    f.componentInstance.removeProperty(0);
    expect(properties().length).toBe(1);
  });

  it('removes the targeted card without confirmation when it is empty', () => {
    const f = create(3);
    const confirm = vi.spyOn(window, 'confirm');
    const middle = properties().at(1);
    f.componentInstance.removeProperty(1);
    expect(confirm).not.toHaveBeenCalled();
    expect(properties().controls).not.toContain(middle);
    expect(count()).toBe(2);
  });

  it('asks before removing a card with data and respects cancel', () => {
    const f = create(2);
    properties().at(1).get('khatianNo')?.setValue('123');
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false);
    f.componentInstance.removeProperty(1);
    expect(confirm).toHaveBeenCalled();
    expect(properties().length).toBe(2);

    confirm.mockReturnValue(true);
    f.componentInstance.removeProperty(1);
    expect(properties().length).toBe(1);
    expect(count()).toBe(1);
  });

  it('hasEnteredData detects nested values and ignores blanks', () => {
    const group = buildPropertyGroup(new FormBuilder());
    expect(hasEnteredData(group)).toBe(false);
    group.get('propertyType')?.setValue(['জমি']);
    expect(hasEnteredData(group)).toBe(true);
  });
});
