import { describe, expect, it } from 'vitest';
import type { Route } from '@angular/router';
import { routes } from './app.routes';
import { authGuard } from './core/guards/auth.guard';
import { guestOnlyGuard } from './core/guards/guest-only.guard';

/** The public shell hosts /login among its children; the authenticated
    shell is the one canActivate-guarded by authGuard. */
function findLayouts(): { publicShell: Route; shell: Route } {
  const publicShell = routes.find((r) => r.children?.some((c) => c.path === 'login'));
  const shell = routes.find((r) => (r.canActivate ?? []).includes(authGuard));
  if (!publicShell || !shell) throw new Error('layout routes not found');
  return { publicShell, shell };
}

const CONTENT_PATHS = ['notices', 'notices/:id', 'events', 'events/:id'];

function childPaths(list: Route[] | undefined): string[] {
  return (list ?? []).map((r) => r.path ?? '');
}

describe('published notices/events routing (public vs authenticated layout)', () => {
  it('declares the guest-only copy inside the public shell, guarded by guestOnlyGuard', () => {
    const { publicShell } = findLayouts();
    const guestBranch = publicShell.children?.find(
      (r) => r.path === '' && (r.canMatch ?? []).includes(guestOnlyGuard),
    );
    expect(guestBranch).toBeDefined();
    expect(childPaths(guestBranch?.children)).toEqual(CONTENT_PATHS);
  });

  it('declares the same paths as direct children of the authenticated shell', () => {
    const { shell } = findLayouts();
    const shellPaths = childPaths(shell.children);
    for (const path of CONTENT_PATHS) {
      expect(shellPaths).toContain(path);
    }
  });

  it('keeps the authenticated copy outside the member-area permission branch', () => {
    const { shell } = findLayouts();
    // The member-area branch is the guarded child that owns /profile; the
    // content routes must sit beside it, readable by every signed-in tier.
    const memberBranch = shell.children?.find((r) =>
      childPaths(r.children).includes('profile'),
    );
    expect(memberBranch).toBeDefined();
    const memberPaths = childPaths(memberBranch?.children);
    for (const path of CONTENT_PATHS) {
      expect(memberPaths).not.toContain(path);
    }
  });
});
