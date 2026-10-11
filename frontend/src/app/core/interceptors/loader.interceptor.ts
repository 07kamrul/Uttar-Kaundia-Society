import { inject } from '@angular/core';
import type { HttpInterceptorFn } from '@angular/common/http';
import { finalize } from 'rxjs';
import { LoaderService, type LoaderMode } from '../services/loader.service';
import { LOADER_MODE, SKIP_LOADER } from './loader-context';

const READ_METHODS = new Set(['GET', 'HEAD', 'OPTIONS']);

export const loaderInterceptor: HttpInterceptorFn = (req, next) => {
  if (req.context.get(SKIP_LOADER)) return next(req);

  const mode: LoaderMode =
    req.context.get(LOADER_MODE) ?? (READ_METHODS.has(req.method) ? 'bar' : 'overlay');
  const end = inject(LoaderService).begin(mode);

  // finalize covers success, error and cancellation (unsubscribe) alike.
  return next(req).pipe(finalize(end));
};
