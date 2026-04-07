import type { AuthorizedAdminActor } from '@/lib/security/admin-auth';
import { getAdminSsoConfig } from '@/lib/security/admin-sso';

type IdentityLookupDb = {
  user: {
    findMany(args: {
      take: number;
      orderBy: Array<{ role: 'asc' | 'desc' } | { name: 'asc' | 'desc' }>;
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
      };
    }): Promise<Array<{ id: string; name: string; email: string; role: string }>>;
    findFirst(args: {
      where: {
        isActive?: true;
        OR: Array<{ email: string } | { name: string }>;
      };
      select: {
        id: true;
      };
    }): Promise<{ id: string } | null>;
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        isActive?: true;
      };
    }): Promise<{ id: string; isActive?: boolean } | null>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        role?: 'ADMIN' | 'ANALYST' | 'VIEWER';
        isActive?: boolean;
      };
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
        isActive: true;
      };
    }): Promise<{ id: string; name: string; email: string; role: string; isActive: boolean }>;
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
    update(args: {
      where: {
        id: string;
      };
      data: {
        userId: string | null;
      };
      select: {
        id: true;
        provider: true;
        subject: true;
        userId: true;
        emailSnapshot: true;
        identifierSnapshot: true;
        lastSeenAt: true;
      };
    }): Promise<AdminIdentityBindingPreview>;
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
  id: string;
  provider: string;
  subject: string;
  userId: string | null;
  emailSnapshot: string | null;
  identifierSnapshot: string;
  lastSeenAt: Date;
};

export type AdminIdentityUserCandidate = {
  id: string;
  name: string;
  email: string;
  role: string;
};

export type AdminOperatorSeat = {
  id: string;
  name: string;
  email: string;
  role: string;
  isActive: boolean;
  sessionVersion?: number;
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
      const boundUser = await db.user.findUnique({
        where: {
          id: binding.userId
        },
        select: {
          id: true,
          isActive: true
        }
      });

      if (boundUser?.isActive !== false) {
        return binding.userId;
      }
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
      isActive: true,
      OR: matchClauses
    },
    select: {
      id: true
    }
  });

  return user?.id ?? null;
}

export async function resolveAdminActorSeat(
  actor: AuthorizedAdminActor | null | undefined,
  db: {
    user: {
      findFirst(args: {
        where: {
          OR: Array<{ email: string } | { name: string }>;
        };
        select: {
          id: true;
          isActive: true;
          sessionVersion?: true;
        };
      }): Promise<{ id: string; isActive: boolean; sessionVersion?: number } | null>;
      findUnique(args: {
        where: {
          id: string;
        };
        select: {
          id: true;
          isActive: true;
          sessionVersion?: true;
        };
      }): Promise<{ id: string; isActive: boolean; sessionVersion?: number } | null>;
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
    };
  }
) {
  if (!actor) {
    return null;
  }

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
      return db.user.findUnique({
        where: {
          id: binding.userId
        },
        select: {
          id: true,
          isActive: true,
          sessionVersion: true
        }
      });
    }
  }

  const matchCandidates = [actor.email, actor.identifier].filter(
    (value): value is string => typeof value === 'string' && value.trim().length > 0
  );

  if (matchCandidates.length === 0) {
    return null;
  }

  return db.user.findFirst({
    where: {
      OR: [
        ...matchCandidates.map((value) => ({
          email: value
        })),
        ...matchCandidates.map((value) => ({
          name: value
        }))
      ]
    },
    select: {
      id: true,
      isActive: true,
      sessionVersion: true
    }
  });
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
          id: true;
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
      id: true,
      provider: true,
      subject: true,
      userId: true,
      emailSnapshot: true,
      identifierSnapshot: true,
      lastSeenAt: true
    }
  });
}

export async function listAdminIdentityUserCandidates(
  db: {
    user: {
      findMany(args: {
        take: number;
        orderBy: Array<{ role: 'asc' | 'desc' } | { name: 'asc' | 'desc' }>;
        select: {
          id: true;
          name: true;
          email: true;
          role: true;
        };
      }): Promise<Array<{ id: string; name: string; email: string; role: string }>>;
    };
  },
  options?: {
    limit?: number;
  }
): Promise<AdminIdentityUserCandidate[]> {
  return db.user.findMany({
    take: options?.limit ?? 24,
    orderBy: [
      {
        role: 'asc'
      },
      {
        name: 'asc'
      }
    ],
    select: {
      id: true,
      name: true,
      email: true,
      role: true
    }
  });
}

export async function listAdminOperatorSeats(
  db: {
    user: {
      findMany(args: {
        take: number;
        orderBy: Array<{ isActive: 'asc' | 'desc' } | { role: 'asc' | 'desc' } | { name: 'asc' | 'desc' }>;
        select: {
          id: true;
          name: true;
          email: true;
          role: true;
          isActive: true;
          sessionVersion?: true;
        };
      }): Promise<AdminOperatorSeat[]>;
    };
  },
  options?: {
    limit?: number;
  }
): Promise<AdminOperatorSeat[]> {
  return db.user.findMany({
    take: options?.limit ?? 50,
    orderBy: [
      {
        isActive: 'desc'
      },
      {
        role: 'asc'
      },
      {
        name: 'asc'
      }
    ],
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      sessionVersion: true
    }
  });
}

export async function updateAdminOperatorSeat(
  input: {
    userId: string;
    role?: 'ADMIN' | 'ANALYST' | 'VIEWER';
    isActive?: boolean;
    actingUserId?: string | null;
  },
  db: {
    user: {
      findUnique(args: {
        where: {
          id: string;
        };
        select: {
          id: true;
          role: true;
          isActive: true;
          sessionVersion?: true;
        };
      }): Promise<{ id: string; role: 'ADMIN' | 'ANALYST' | 'VIEWER'; isActive: boolean; sessionVersion?: number } | null>;
      count(args: {
        where: {
          role: 'ADMIN';
          isActive: true;
          id?: {
            not: string;
          };
        };
      }): Promise<number>;
      update(args: {
        where: {
          id: string;
        };
        data: {
          role?: 'ADMIN' | 'ANALYST' | 'VIEWER';
          isActive?: boolean;
          sessionVersion?: {
            increment: number;
          };
        };
        select: {
          id: true;
          name: true;
          email: true;
          role: true;
          isActive: true;
          sessionVersion?: true;
        };
      }): Promise<AdminOperatorSeat>;
    };
  }
): Promise<AdminOperatorSeat> {
  if (!input.role && typeof input.isActive !== 'boolean') {
    throw new Error('Either role or isActive must be provided.');
  }

  const currentSeat = await db.user.findUnique({
    where: {
      id: input.userId
    },
    select: {
      id: true,
      role: true,
      isActive: true
    }
  });

  if (!currentSeat) {
    throw new Error('Operator seat not found.');
  }

  const nextRole = input.role ?? currentSeat.role;
  const nextIsActive = typeof input.isActive === 'boolean' ? input.isActive : currentSeat.isActive;
  const removingAdminCoverage = currentSeat.role === 'ADMIN' && currentSeat.isActive && (nextRole !== 'ADMIN' || nextIsActive === false);

  if (removingAdminCoverage) {
    const otherActiveAdminCount = await db.user.count({
      where: {
        role: 'ADMIN',
        isActive: true,
        id: {
          not: currentSeat.id
        }
      }
    });

    if (otherActiveAdminCount === 0) {
      throw new Error('At least one active ADMIN seat must remain assigned.');
    }
  }

  if (input.actingUserId && input.actingUserId === currentSeat.id && (nextRole !== currentSeat.role || nextIsActive !== currentSeat.isActive)) {
    throw new Error('Update another operator to change your own seat, role, or active status.');
  }

  return db.user.update({
    where: {
      id: input.userId
    },
    data: {
      role: input.role,
      isActive: typeof input.isActive === 'boolean' ? input.isActive : undefined,
      sessionVersion: {
        increment: 1
      }
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      sessionVersion: true
    }
  });
}

export async function rotateAdminOperatorSessionVersion(
  input: {
    userId: string;
  },
  db: {
    user: {
      update(args: {
        where: {
          id: string;
        };
        data: {
          sessionVersion: {
            increment: number;
          };
        };
        select: {
          id: true;
          name: true;
          email: true;
          role: true;
          isActive: true;
          sessionVersion: true;
        };
      }): Promise<AdminOperatorSeat>;
    };
  }
) {
  return db.user.update({
    where: {
      id: input.userId
    },
    data: {
      sessionVersion: {
        increment: 1
      }
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true,
      sessionVersion: true
    }
  });
}

export async function updateAdminIdentityBindingUser(
  input: {
    bindingId: string;
    userId: string | null;
  },
  db: Pick<IdentityLookupDb, 'adminIdentityBinding' | 'user'>
): Promise<AdminIdentityBindingPreview | null> {
  if (!db.adminIdentityBinding) {
    return null;
  }

  if (input.userId) {
    const user = await db.user.findUnique({
      where: {
        id: input.userId
      },
      select: {
        id: true
      }
    });

    if (!user) {
      throw new Error('Selected operator could not be found.');
    }
  }

  return db.adminIdentityBinding.update({
    where: {
      id: input.bindingId
    },
    data: {
      userId: input.userId
    },
    select: {
      id: true,
      provider: true,
      subject: true,
      userId: true,
      emailSnapshot: true,
      identifierSnapshot: true,
      lastSeenAt: true
    }
  });
}
