import { inject } from '@angular/core';
import { type CanMatchFn } from '@angular/router';
import { AuthService } from '../services/auth.service';

/**
 * Matches only for signed-out visitors. Used on the public shell's
 * notices/events sub-routes so the same URLs can also live inside the
 * authenticated ShellComponent layout (both layouts declare the shared
 * PUBLIC_CONTENT_ROUTES; a logged-in user falls through to the shell's
 * copy and gets the app header/sidebar).
 */
export const guestOnlyGuard: CanMatchFn = () => {
  return !inject(AuthService).isAuthenticated();
};
