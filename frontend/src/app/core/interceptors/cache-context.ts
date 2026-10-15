import { HttpContextToken } from '@angular/common/http';

/** Set on GETs whose data must always be fresh from the server (live votes, payment status),
 * or that keep their own longer-lived cache (land map layers). */
export const NO_CACHE = new HttpContextToken<boolean>(() => false);
