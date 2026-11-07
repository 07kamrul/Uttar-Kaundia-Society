import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it, vi } from 'vitest';
import { DialogDirective } from './dialog.directive';

@Component({
  imports: [DialogDirective],
  template: `
    <button type="button" id="trigger">open</button>
    @if (open()) {
      <div class="modal-card" appDialog (dismiss)="dismissed()">
        <h3>Title</h3>
        <p>Body</p>
      </div>
    }
  `,
})
class Host {
  readonly open = signal(false);
  dismissed = vi.fn();
}

async function setup() {
  TestBed.configureTestingModule({ imports: [Host] });
  const fixture = TestBed.createComponent(Host);
  document.body.appendChild(fixture.nativeElement);
  fixture.detectChanges();
  const el = fixture.nativeElement as HTMLElement;
  const trigger = el.querySelector<HTMLButtonElement>('#trigger')!;
  trigger.focus();
  fixture.componentInstance.open.set(true);
  fixture.detectChanges();
  await fixture.whenStable();
  const card = () => el.querySelector<HTMLElement>('.modal-card');
  return { fixture, el, trigger, card };
}

describe('DialogDirective', () => {
  it('marks the element as a modal dialog labelled by its first heading', async () => {
    const { card } = await setup();
    const dialog = card()!;
    expect(dialog.getAttribute('role')).toBe('dialog');
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    const labelId = dialog.getAttribute('aria-labelledby')!;
    expect(document.getElementById(labelId)?.textContent).toBe('Title');
  });

  it('moves focus into the dialog when it opens', async () => {
    const { card } = await setup();
    expect(document.activeElement).toBe(card());
  });

  it('emits dismiss on Escape', async () => {
    const { fixture } = await setup();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(fixture.componentInstance.dismissed).toHaveBeenCalledTimes(1);
  });

  it('returns focus to the trigger when it closes', async () => {
    const { fixture, trigger } = await setup();
    fixture.componentInstance.open.set(false);
    fixture.detectChanges();
    expect(document.activeElement).toBe(trigger);
  });
});
