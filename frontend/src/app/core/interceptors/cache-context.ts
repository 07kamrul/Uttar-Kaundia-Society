import { HttpContextToken } from '@angular/common/http';

/** Set on GETs whose data must always be fresh from the server (live votes, payment status). */
export const NO_CACHE = new HttpContextToken<boolean>(() => false);
