import { AdminAccessScopeType, UserRole } from '@prisma/client';

export type ScimProvisionedGrantInput = {
  scopeType: AdminAccessScopeType;
  scopeId: string;
};

export type ScimProvisionedUserInput = {
  provider?: string;
  externalId: string;
  email: string;
  name: string;
  role?: UserRole;
  isActive?: boolean;
  grants?: ScimProvisionedGrantInput[];
};

type ScimDb = {
  user: {
    findUnique(args: {
      where: {
        id: string;
      };
      select: {
        id: true;
        email: true;
      };
    }): Promise<{ id: string; email: string } | null>;
    findFirst(args: {
      where: {
        email: string;
      };
      select: {
        id: true;
        email: true;
      };
    }): Promise<{ id: string; email: string } | null>;
    create(args: {
      data: {
        email: string;
        name: string;
        role: UserRole;
        isActive: boolean;
      };
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
        isActive: true;
      };
    }): Promise<{ id: string; name: string; email: string; role: UserRole; isActive: boolean }>;
    update(args: {
      where: {
        id: string;
      };
      data: {
        email?: string;
        name?: string;
        role?: UserRole;
        isActive?: boolean;
      };
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
        isActive: true;
      };
    }): Promise<{ id: string; name: string; email: string; role: UserRole; isActive: boolean }>;
    findMany(args: {
      take: number;
      orderBy: {
        updatedAt: 'desc';
      };
      select: {
        id: true;
        name: true;
        email: true;
        role: true;
        isActive: true;
      };
    }): Promise<Array<{ id: string; name: string; email: string; role: UserRole; isActive: boolean }>>;
  };
  adminProvisioningBinding: {
    findUnique(args: {
      where: {
        provider_externalId: {
          provider: string;
          externalId: string;
        };
      };
      select: {
        id: true;
        userId: true;
      };
    }): Promise<{ id: string; userId: string } | null>;
    upsert(args: {
      where: {
        provider_externalId: {
          provider: string;
          externalId: string;
        };
      };
      update: {
        userId: string;
        emailSnapshot: string;
        nameSnapshot: string;
      };
      create: {
        provider: string;
        externalId: string;
        userId: string;
        emailSnapshot: string;
        nameSnapshot: string;
      };
    }): Promise<{ id: string; userId: string }>;
    findMany(args: {
      where:
        | {
            userId: string;
          }
        | {
            provider: string;
          };
      select: {
        id: true;
        provider: true;
        externalId: true;
        userId?: true;
      };
    }): Promise<Array<{ id: string; provider: string; externalId: string; userId?: string }>>;
    deleteMany(args: {
      where: {
        userId: string;
      };
    }): Promise<{ count: number }>;
  };
  adminAccessGrant: {
    deleteMany(args: {
      where: {
        userId: string;
      };
    }): Promise<{ count: number }>;
    createMany(args: {
      data: Array<{
        userId: string;
        scopeType: AdminAccessScopeType;
        scopeId: string;
      }>;
      skipDuplicates?: boolean;
    }): Promise<{ count: number }>;
    findMany(args: {
      where: {
        userId: string;
      };
      select: {
        scopeType: true;
        scopeId: true;
      };
    }): Promise<Array<{ scopeType: AdminAccessScopeType; scopeId: string }>>;
  };
  adminSession?: {
    updateMany(args: {
      where: {
        userId?: string;
        revokedAt?: null;
      };
      data: {
        revokedAt: Date;
      };
    }): Promise<{ count: number }>;
  };
};

export function getAdminScimConfig(env: NodeJS.ProcessEnv = process.env) {
  const token = env.ADMIN_SCIM_TOKEN?.trim() ?? '';
  const provider = env.ADMIN_SCIM_PROVIDER?.trim() || 'scim';
  return {
    enabled: token.length > 0,
    token,
    provider
  };
}

export function authorizeAdminScimRequest(request: Request, env: NodeJS.ProcessEnv = process.env) {
  const config = getAdminScimConfig(env);
  if (!config.enabled) {
    return false;
  }

  const bearer = request.headers.get('authorization')?.replace(/^Bearer\s+/i, '').trim() ?? '';
  return bearer === config.token;
}

export async function upsertProvisionedAdminUser(input: ScimProvisionedUserInput, db: ScimDb) {
  const provider = input.provider?.trim() || 'scim';
  const existingBinding = await db.adminProvisioningBinding.findUnique({
    where: {
      provider_externalId: {
        provider,
        externalId: input.externalId
      }
    },
    select: {
      id: true,
      userId: true
    }
  });

  const matchedUser =
    (existingBinding?.userId
      ? await db.user.findUnique({
          where: {
            id: existingBinding.userId
          },
          select: {
            id: true,
            email: true
          }
        })
      : null) ??
    (await db.user.findFirst({
      where: {
        email: input.email
      },
      select: {
        id: true,
        email: true
      }
    }));

  const user = matchedUser
    ? await db.user.update({
        where: {
          id: matchedUser.id
        },
        data: {
          email: input.email,
          name: input.name,
          role: input.role ?? UserRole.ANALYST,
          isActive: input.isActive ?? true
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true
        }
      })
    : await db.user.create({
        data: {
          email: input.email,
          name: input.name,
          role: input.role ?? UserRole.ANALYST,
          isActive: input.isActive ?? true
        },
        select: {
          id: true,
          name: true,
          email: true,
          role: true,
          isActive: true
        }
      });

  await db.adminProvisioningBinding.upsert({
    where: {
      provider_externalId: {
        provider,
        externalId: input.externalId
      }
    },
    update: {
      userId: user.id,
      emailSnapshot: input.email,
      nameSnapshot: input.name
    },
    create: {
      provider,
      externalId: input.externalId,
      userId: user.id,
      emailSnapshot: input.email,
      nameSnapshot: input.name
    }
  });

  if (input.grants) {
    await db.adminAccessGrant.deleteMany({
      where: {
        userId: user.id
      }
    });

    if (input.grants.length > 0) {
      await db.adminAccessGrant.createMany({
        data: input.grants.map((grant) => ({
          userId: user.id,
          scopeType: grant.scopeType,
          scopeId: grant.scopeId
        })),
        skipDuplicates: true
      });
    }
  }

  const grants = await db.adminAccessGrant.findMany({
    where: {
      userId: user.id
    },
    select: {
      scopeType: true,
      scopeId: true
    }
  });

  return {
    ...user,
    provider,
    externalId: input.externalId,
    grants
  };
}

export async function listProvisionedAdminUsers(db: ScimDb, options?: { limit?: number }) {
  return db.user.findMany({
    take: options?.limit ?? 50,
    orderBy: {
      updatedAt: 'desc'
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  });
}

export async function deprovisionAdminUser(
  input: {
    userId: string;
  },
  db: ScimDb
) {
  const user = await db.user.findUnique({
    where: {
      id: input.userId
    },
    select: {
      id: true,
      email: true
    }
  });

  if (!user) {
    throw new Error('Provisioned user was not found.');
  }

  await db.adminAccessGrant.deleteMany({
    where: {
      userId: user.id
    }
  });

  await db.adminProvisioningBinding.deleteMany({
    where: {
      userId: user.id
    }
  });

  if (db.adminSession) {
    await db.adminSession.updateMany({
      where: {
        userId: user.id,
        revokedAt: null
      },
      data: {
        revokedAt: new Date()
      }
    });
  }

  return db.user.update({
    where: {
      id: user.id
    },
    data: {
      isActive: false
    },
    select: {
      id: true,
      name: true,
      email: true,
      role: true,
      isActive: true
    }
  });
}

export async function reconcileProvisionedAdminUsers(
  input: {
    provider?: string;
    users: ScimProvisionedUserInput[];
    deprovisionMissing?: boolean;
  },
  db: ScimDb
) {
  const provider = input.provider?.trim() || 'scim';
  const seenExternalIds = new Set<string>();
  const upsertedUsers = [];

  for (const user of input.users) {
    const externalId = user.externalId.trim();
    if (!externalId || seenExternalIds.has(externalId)) continue;
    seenExternalIds.add(externalId);
    upsertedUsers.push(
      await upsertProvisionedAdminUser(
        {
          ...user,
          provider
        },
        db
      )
    );
  }

  const deprovisionedUsers = [];
  if (input.deprovisionMissing !== false) {
    const providerBindings = await db.adminProvisioningBinding.findMany({
      where: {
        provider
      },
      select: {
        id: true,
        provider: true,
        externalId: true,
        userId: true
      }
    });

    for (const binding of providerBindings) {
      if (!seenExternalIds.has(binding.externalId) && binding.userId) {
        deprovisionedUsers.push(
          await deprovisionAdminUser(
            {
              userId: binding.userId
            },
            db
          )
        );
      }
    }
  }

  return {
    provider,
    upsertedUsers,
    deprovisionedUsers
  };
}
