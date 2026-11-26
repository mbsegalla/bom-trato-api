import { describe, expect, it } from 'vitest';

import { OrganizationTeamPolicy } from './organizationTeam.policy.js';
import type { OrganizationTeamContext } from './organizationTeam.policy.js';

const owner: OrganizationTeamContext = {
  ownerId: 'owner', actorId: 'owner', actorRole: 'OWNER', actorDisabled: false, actorEmailVerified: true,
};
const limits = { hasAccess: true, teamManagementEnabled: true, memberLimit: 3 };

describe('OrganizationTeamPolicy', () => {
  it('requires actual ownership, not only a role label', () => {
    expect(() => new OrganizationTeamPolicy(owner).assertOwner()).not.toThrow();
    expect(() => new OrganizationTeamPolicy({ ...owner, actorId: 'other' }).assertOwner()).toThrow('OWNER_REQUIRED');
    expect(() => new OrganizationTeamPolicy({ ...owner, actorRole: 'MEMBER' }).assertOwner()).toThrow('OWNER_REQUIRED');
  });

  it('protects owner removal and rejects outsiders', () => {
    const policy = new OrganizationTeamPolicy(owner);
    expect(() => policy.assertCanRemove('owner', 'OWNER')).toThrow('OWNER_REMOVAL_FORBIDDEN');
    expect(() => policy.assertCanRemove('member', 'MEMBER')).not.toThrow();
    expect(() => new OrganizationTeamPolicy({ ...owner, actorRole: null }).assertMember()).toThrow('MEMBER_REQUIRED');
  });

  it('enforces active access, team feature, and member limit independently', () => {
    const policy = new OrganizationTeamPolicy(owner);
    expect(() => policy.assertCanAdd(limits, 2)).not.toThrow();
    expect(() => policy.assertCanAdd(limits, 3)).toThrow('MEMBER_LIMIT_REACHED');
    expect(() => policy.assertCanAdd({ ...limits, hasAccess: false }, 0)).toThrow('SUBSCRIPTION_REQUIRED');
    expect(() => policy.assertCanAdd({ ...limits, teamManagementEnabled: false }, 0)).toThrow('TEAM_MANAGEMENT_REQUIRED');
  });
});
