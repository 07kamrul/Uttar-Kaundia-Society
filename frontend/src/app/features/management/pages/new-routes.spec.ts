import { describe, expect, it } from 'vitest';
import { MANAGEMENT_ROUTES } from '../../../management.routes';

describe('Batch 5/6 management routes', () => {
  it.each([
    ['applications', ['membership.review', 'membership_application.manage']],
    ['notices-events', ['manage_notices']],
    ['phone-fixes', ['member.manage']],
    ['advanced/cache', ['manage_system_config']],
    ['advanced/login-readiness', ['manage_system_config']],
  ])('routes /%s lazily behind its permission guard', (path, _perms) => {
    const route = MANAGEMENT_ROUTES.find((r) => r.path === path);
    expect(route, path).toBeDefined();
    expect(route?.canActivate?.length).toBe(1);
    expect(typeof route?.loadComponent).toBe('function');
  });
});
