import type { PrismaClient } from '@prisma/client';
import { NotificationSeverity, NotificationType } from '@prisma/client';
import { prisma } from '@/lib/db/prisma';

export { NotificationSeverity, NotificationType };

type NotificationDb = Pick<PrismaClient, 'notification'>;

export type CreateNotificationInput = {
  type: NotificationType;
  severity?: NotificationSeverity;
  title: string;
  body?: string | null;
  entityType?: string | null;
  entityId?: string | null;
  audienceRole?: string | null;
};

export type NotificationRecord = {
  id: string;
  type: NotificationType;
  severity: NotificationSeverity;
  title: string;
  body: string | null;
  entityType: string | null;
  entityId: string | null;
  audienceRole: string | null;
  readAt: Date | null;
  createdAt: Date;
};

export async function createNotification(
  input: CreateNotificationInput,
  db: NotificationDb = prisma
): Promise<NotificationRecord> {
  return db.notification.create({
    data: {
      type: input.type,
      severity: input.severity ?? NotificationSeverity.INFO,
      title: input.title,
      body: input.body ?? null,
      entityType: input.entityType ?? null,
      entityId: input.entityId ?? null,
      audienceRole: input.audienceRole ?? null
    }
  });
}

export async function listRecentNotifications(
  limit = 20,
  db: NotificationDb = prisma
): Promise<NotificationRecord[]> {
  return db.notification.findMany({
    take: limit,
    orderBy: {
      createdAt: 'desc'
    }
  });
}

export async function markNotificationRead(
  id: string,
  db: NotificationDb = prisma
): Promise<NotificationRecord> {
  return db.notification.update({
    where: { id },
    data: {
      readAt: new Date()
    }
  });
}

export async function markAllNotificationsRead(db: NotificationDb = prisma): Promise<number> {
  const result = await db.notification.updateMany({
    where: {
      readAt: null
    },
    data: {
      readAt: new Date()
    }
  });
  return result.count;
}

export async function countUnreadNotifications(db: NotificationDb = prisma): Promise<number> {
  return db.notification.count({
    where: {
      readAt: null
    }
  });
}
