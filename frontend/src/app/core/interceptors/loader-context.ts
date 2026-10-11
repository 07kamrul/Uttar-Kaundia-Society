import { HttpContextToken } from '@angular/common/http';
import type { LoaderMode } from '../services/loader.service';

/** Set on background calls (polling, autosave, live quotes) that must not show the global loader. */
export const SKIP_LOADER = new HttpContextToken<boolean>(() => false);

/** Forces a loader style; by default reads use the bar and writes use the overlay. */
export const LOADER_MODE = new HttpContextToken<LoaderMode | null>(() => null);
