import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';
import { getAdminSsoConfig } from '@/lib/security/admin-sso';

type IdentityLookupDb = {
  user: {
    findFirst(args: {
      where: {
        OR: Array<{ email: string } | { name: string }>;
      };
      select: {
        id: true;
      };
    }): Promise<{ id: string } | null>;
  };
  adminIdentityBinding?: {
    findUnique(args: {
      where: {
        provider_subject: {
          provider: string;
          subject: string;
        };
      };
      select: {
        userId: true;
      };
    }): Promise<{ userId: string | null } | null>;
    upsert(args: {
      where: {
        provider_subject: {
          provider: string;
          subject: string;
        };
      };
      update: {
        userId: string | null;
        emailSnapshot: string | null;
        identifierSnapshot: string;
        lastSeenAt: Date;
      };
      create: {
        provider: string;
        subject: string;
        userId: string | null;
        emailSnapshot: string | null;
        identifierSnapshot: string;
        lastSeenAt: Date;
      };
    }): Promise<{ id?: string; userId: string | null } | null>;
    count(args?: { where?: { userId?: { not: null } } }): Promise<number>;
    findFirst(args: {
      orderBy: {
        lastSeenAt: 'desc';
      };
      select: {
        lastSeenAt: true;
      };
    }): Promise<{ lastSeenAt: Date } | null>;
  };
};

export type AdminReviewerAttributionSummary = {
  authMode: 'shared_credentials' | 'session_only' | 'oidc_ready';
  reviewerAttributionMode: 'identifier_only' | 'email_match' | 'subject_mapping_live';
  canResolveUserBoundReviewer: boolean;
  detail: string;
};

export type AdminIdentityBindingSummary = {
  totalBindings: number;
  mappedBindings: number;
  unmappedBindings: number;
  latestSeenAt: Date | null;
};

export type AdminIdentityBindingPreview = {
  provider: string;
  subject: string;
  userId: string | null;
  emailSnapshot: string | null;
  identifierSnapshot: string;
  lastSeenAt: Date;
};

export function getAdminReviewerAttributionSummary(
  env: NodeJS.ProcessEnv = process.env
): AdminReviewerAttributionSummary {
  const ssoConfig = getAdminSsoConfig(env);

  if (ssoConfig.mode === 'configured') {
    return {
      authMode: 'oidc_ready',
      reviewerAttributionMode: 'subject_mapping_live',
      canResolveUserBoundReviewer: true,
      detail:
        'OIDC is configured. Reviewer attribution resolves through persisted provider-subject bindings and falls back to email/identifier matching when needed.'
    };
  }

  if (env.ADMIN_SESSION_SECRET?.trim()) {
    return {
      authMode: 'session_only',
      reviewerAttributionMode: 'email_match',
      canResolveUserBoundReviewer: true,
      detail:
        'Signed sessions are enabled. Reviewer attribution currently resolves through email/identifier matching and should move to persisted identity binding before multi-seat production use.'
    };
  }

  return {
    authMode: 'shared_credentials',
    reviewerAttributionMode: 'identifier_only',
    canResolveUserBoundReviewer: false,
    detail:
      'Shared credentials are still active. Reviewer attribution is not yet user-bound and should move to OIDC plus persisted identity binding before wider institutional deployment.'
  };
}

export async function resolveAdminReviewerUserId(
  actor: AuthorizedAdminActor | null | undefined,
  db: IdentityLookupDb
) {
  if (!actor) return null;

  if (actor.provider === 'oidc' && actor.subject && db.adminIdentityBinding) {
    const binding = await db.adminIdentityBinding.findUnique({
      where: {
        provider_subject: {
          provider: actor.provider,
          subject: actor.subject
        }
      },
      select: {
        userId: true
      }
    });

    if (binding?.userId) {
      return binding.userId;
    }
  }

  const matchCandidates = [actor.email, actor.identifier].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  if (matchCandidates.length === 0) {
    return null;
  }

  const matchClauses: Array<{ email: string } | { name: string }> = [
    ...matchCandidates.map((value) => ({
      email: value
    })),
    ...matchCandidates.map((value) => ({
      name: value
    }))
  ];

  const user = await db.user.findFirst({
    where: {
      OR: matchClauses
    },
    select: {
      id: true
    }
  });

  return user?.id ?? null;
}

export async function upsertAdminIdentityBindingForActor(
  actor: AuthorizedAdminActor | null | undefined,
  db: IdentityLookupDb
) {
  if (!actor?.provider || actor.provider === 'basic' || !actor.subject) {
    return null;
  }

  if (!db.adminIdentityBinding) {
    return null;
  }

  const resolvedUserId = await resolveAdminReviewerUserId(
    {
      ...actor,
      provider: 'session',
      subject: null
    },
    db
  );

  return db.adminIdentityBinding.upsert({
    where: {
      provider_subject: {
        provider: actor.provider,
        subject: actor.subject
      }
    },
    update: {
      userId: resolvedUserId,
      emailSnapshot: actor.email ?? null,
      identifierSnapshot: actor.identifier,
      lastSeenAt: new Date()
    },
    create: {
      provider: actor.provider,
      subject: actor.subject,
      userId: resolvedUserId,
      emailSnapshot: actor.email ?? null,
      identifierSnapshot: actor.identifier,
      lastSeenAt: new Date()
    }
  });
}

export async function getAdminIdentityBindingSummary(
  db: {
    adminIdentityBinding?: {
      count(args?: { where?: { userId?: { not: null } } }): Promise<number>;
      findFirst(args: {
        orderBy: {
          lastSeenAt: 'desc';
        };
        select: {
          lastSeenAt: true;
        };
      }): Promise<{ lastSeenAt: Date } | null>;
    };
  }
): Promise<AdminIdentityBindingSummary> {
  if (!db.adminIdentityBinding) {
    return {
      totalBindings: 0,
      mappedBindings: 0,
      unmappedBindings: 0,
      latestSeenAt: null
    };
  }

  const [totalBindings, mappedBindings, latestBinding] = await Promise.all([
    db.adminIdentityBinding.count(),
    db.adminIdentityBinding.count({
      where: {
        userId: {
          not: null
        }
      }
    }),
    db.adminIdentityBinding.findFirst({
      orderBy: {
        lastSeenAt: 'desc'
      },
      select: {
        lastSeenAt: true
      }
    })
  ]);

  return {
    totalBindings,
    mappedBindings,
    unmappedBindings: Math.max(0, totalBindings - mappedBindings),
    latestSeenAt: latestBinding?.lastSeenAt ?? null
  };
}

export async function listRecentAdminIdentityBindings(
  db: {
    adminIdentityBinding?: {
      findMany(args: {
        take: number;
        where?: {
          userId?: null;
        };
        orderBy: {
          lastSeenAt: 'desc';
        };
        select: {
          provider: true;
          subject: true;
          userId: true;
          emailSnapshot: true;
          identifierSnapshot: true;
          lastSeenAt: true;
        };
      }): Promise<AdminIdentityBindingPreview[]>;
    };
  },
  options?: {
    onlyUnmapped?: boolean;
    limit?: number;
  }
): Promise<AdminIdentityBindingPreview[]> {
  if (!db.adminIdentityBinding) {
    return [];
  }

  return db.adminIdentityBinding.findMany({
    take: options?.limit ?? 6,
    where: options?.onlyUnmapped
      ? {
          userId: null
        }
      : undefined,
    orderBy: {
      lastSeenAt: 'desc'
    },
    select: {
      provider: true,
      subject: true,
      userId: true,
      emailSnapshot: true,
      identifierSnapshot: true,
      lastSeenAt: true
    }
  });
}
