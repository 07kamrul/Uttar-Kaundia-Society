import { inject } from '@angular/core';
import { Router, type CanActivateFn, type UrlTree } from '@angular/router';
import {
  APPLICANT_CHANGE_PASSWORD,
  APPLICANT_HOME,
  AuthService,
} from '../services/auth.service';

export const authGuard: CanActivateFn = (route, state) => {
  const auth = inject(AuthService);
  const router = inject(Router);

  if (!auth.token) {
    return router.createUrlTree(['/login'], { queryParams: { returnUrl: state.url } });
  }

  if (auth.role === 'applicant') {
    return applicantRedirect(auth.mustChangePassword, state.url, router);
  }

  // A member with an admin-issued temporary password must set a new one
  // before reaching any other page. Admin-tier accounts are exempt: the
  // backend has no admin change-password endpoint, so hard-blocking them
  // would lock the account until an email-token reset.
  if (
    auth.mustChangePassword &&
    auth.role === 'member' &&
    state.url !== '/change-password' &&
    route.routeConfig?.path !== 'change-password'
  ) {
    return router.createUrlTree(['/change-password']);
  }

  return true;
};

/**
 * A rejected applicant may only reach their application area; a temporary
 * password must be replaced first, exactly like a member's.
 */
function applicantRedirect(mustChange: boolean, url: string, router: Router): true | UrlTree {
  const path = url.split('?')[0];
  if (mustChange) {
    return path === APPLICANT_CHANGE_PASSWORD ? true : router.createUrlTree([APPLICANT_CHANGE_PASSWORD]);
  }
  return path === APPLICANT_HOME || path.startsWith(`${APPLICANT_HOME}/`)
    ? true
    : router.createUrlTree([APPLICANT_HOME]);
}
