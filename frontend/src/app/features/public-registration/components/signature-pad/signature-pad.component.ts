import {
  ChangeDetectionStrategy,
  ChangeDetectorRef,
  Component,
  ElementRef,
  Input,
  ViewChild,
  inject,
  signal,
} from '@angular/core';
import { FormGroup } from '@angular/forms';
import { TranslatePipe } from '@ngx-translate/core';
import { compressImage } from '../../../../core/utils/image-compress';
import { readAsDataUrl } from '../../file-upload';

const CANVAS_WIDTH = 480;
const CANVAS_HEIGHT = 160;
const STROKE_WIDTH = 2.5;
/** A signature is a small drawing; keep the stored data URL light. */
const SIGNATURE_MAX_BYTES = 60_000;
const SIGNATURE_MAX_DIMENSION = 600;

/**
 * Optional signature for the consent step: drawn on a canvas or uploaded as a
 * photo. It is never required; the control has no validators.
 */
@Component({
  selector: 'app-signature-pad',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  imports: [TranslatePipe],
  templateUrl: './signature-pad.component.html',
})
export class SignaturePadComponent {
  @Input({ required: true }) form!: FormGroup;
  @ViewChild('canvas') private canvasRef?: ElementRef<HTMLCanvasElement>;

  readonly width = CANVAS_WIDTH;
  readonly height = CANVAS_HEIGHT;
  readonly hasInk = signal(false);

  private readonly cdr = inject(ChangeDetectorRef);
  private drawing = false;

  get signature(): string {
    return this.form.get('memberSignature')?.value ?? '';
  }

  private context(): CanvasRenderingContext2D | null {
    // jsdom (tests) and very old browsers have no 2d context; drawing is then a no-op.
    try {
      return this.canvasRef?.nativeElement.getContext?.('2d') ?? null;
    } catch {
      return null;
    }
  }

  private point(event: PointerEvent): { x: number; y: number } {
    const canvas = this.canvasRef!.nativeElement;
    const rect = canvas.getBoundingClientRect();
    const scaleX = rect.width ? canvas.width / rect.width : 1;
    const scaleY = rect.height ? canvas.height / rect.height : 1;
    return { x: (event.clientX - rect.left) * scaleX, y: (event.clientY - rect.top) * scaleY };
  }

  startStroke(event: PointerEvent): void {
    const ctx = this.context();
    if (!ctx) return;
    event.preventDefault();
    this.drawing = true;
    const { x, y } = this.point(event);
    ctx.lineWidth = STROKE_WIDTH;
    ctx.lineCap = 'round';
    ctx.strokeStyle = '#111827';
    ctx.beginPath();
    ctx.moveTo(x, y);
    this.canvasRef?.nativeElement.setPointerCapture?.(event.pointerId);
  }

  moveStroke(event: PointerEvent): void {
    const ctx = this.context();
    if (!this.drawing || !ctx) return;
    const { x, y } = this.point(event);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  endStroke(): void {
    if (!this.drawing) return;
    this.drawing = false;
    const canvas = this.canvasRef?.nativeElement;
    if (!canvas) return;
    this.hasInk.set(true);
    this.form.get('memberSignature')?.setValue(canvas.toDataURL('image/png'));
    this.cdr.markForCheck();
  }

  clear(): void {
    const canvas = this.canvasRef?.nativeElement;
    this.context()?.clearRect(0, 0, canvas?.width ?? 0, canvas?.height ?? 0);
    this.hasInk.set(false);
    this.form.get('memberSignature')?.setValue('');
    this.cdr.markForCheck();
  }

  async onUpload(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const file = input.files?.[0];
    input.value = '';
    if (!file || !file.type.startsWith('image/')) return;
    const small = await compressImage(file, {
      maxBytes: SIGNATURE_MAX_BYTES,
      maxDimension: SIGNATURE_MAX_DIMENSION,
    });
    const dataUrl = await readAsDataUrl(small);
    this.context()?.clearRect(0, 0, this.width, this.height);
    this.hasInk.set(false);
    this.form.get('memberSignature')?.setValue(dataUrl);
    this.cdr.markForCheck();
  }
}
