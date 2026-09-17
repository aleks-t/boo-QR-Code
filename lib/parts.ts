import { Prisma } from "@prisma/client";
import { db } from "./db";
import { AppError, currentRevision, resolveCode } from "./domain";
export const partInclude = {
  samples: {
    include: { events: { orderBy: { createdAt: "desc" as const } } },
    orderBy: { sampleNumber: "asc" as const },
  },
  changes: { orderBy: { createdAt: "desc" as const } },
  vendor: true,
  category: true,
  revisions: { orderBy: { revisionNum: "desc" as const } },
};
export type FullPart = Prisma.PartGetPayload<{ include: typeof partInclude }>;
export function present(part: FullPart) {
  const current = currentRevision(part.revisions);
  return {
    ...part,
    current,
    displayId: current
      ? `${part.partNumber}-V${current.revisionNum}`
      : part.partNumber,
    nextRevision: Math.max(0, ...part.revisions.map((r) => r.revisionNum)) + 1,
  };
}
export async function retry<T>(work: () => Promise<T>): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await work();
    } catch (e) {
      if (
        attempt === 0 &&
        e instanceof Prisma.PrismaClientKnownRequestError &&
        ["P2002", "P2034"].includes(e.code)
      )
        continue;
      throw e;
    }
  }
}
export async function findPart(number: string) {
  const part = await db.part.findUnique({
    where: { partNumber: resolveCode(number) },
    include: partInclude,
  });
  if (!part) throw new AppError(`No part matches ${resolveCode(number)}.`, 404);
  return present(part);
}
export async function createPart(
  input: {
    partName: string;
    vendorId: string;
    categoryId: string;
    changeNote?: string;
    sampleCount?: number;
  },
  user: { id: string; name: string },
) {
  return retry(() =>
    db.$transaction(async (tx) => {
      const vendor = await tx.vendor.findUnique({
        where: { id: input.vendorId },
      });
      if (!vendor) throw new AppError("Choose an existing vendor.");
      // Sequence belongs to the immutable identifier prefix, NOT the editable current vendor.
      // Otherwise a merge or second-sourcing can make MAX(sequence) go backwards.
      const max = await tx.part.aggregate({
        where: { partNumber: { startsWith: `${vendor.code}-` } },
        _max: { sequence: true },
      });
      const sequence = (max._max.sequence ?? 0) + 1;
      if (sequence > 9999)
        throw new AppError("This vendor has used all four-digit part numbers.");
      return present(
        await tx.part.create({
          data: {
            partName: input.partName,
            vendorId: vendor.id,
            categoryId: input.categoryId,
            sequence,
            partNumber: `${vendor.code}-${String(sequence).padStart(4, "0")}`,
            samples: {
              create: Array.from(
                { length: input.sampleCount ?? 1 },
                (_, i) => ({
                  sampleNumber: i + 1,
                  events: {
                    create: {
                      status: "IN_HOUSE",
                      loggedBy: user.name,
                      note: "Sample created.",
                    },
                  },
                }),
              ),
            },
            revisions: {
              create: {
                revisionNum: 1,
                changeNote: input.changeNote || "Initial release.",
                loggedBy: user.name,
                loggedById: user.id,
              },
            },
          },
          include: partInclude,
        }),
      );
    }),
  );
}
export async function logRevision(
  partId: string,
  changeNote: string,
  user: { id: string; name: string },
) {
  return retry(() =>
    db.$transaction(async (tx) => {
      const part = await tx.part.findUnique({ where: { id: partId } });
      if (!part) throw new AppError("This part could not be found.", 404);
      if (part.archivedAt)
        throw new AppError(
          "Restore this part from Trash before logging a revision.",
          409,
        );
      const max = await tx.revision.aggregate({
        where: { partId },
        _max: { revisionNum: true },
      });
      const previous = await tx.revision.findFirst({
        where: { partId, voided: false },
        orderBy: { revisionNum: "desc" },
      });
      const revision = await tx.revision.create({
        data: {
          partId,
          revisionNum: (max._max.revisionNum ?? 0) + 1,
          changeNote,
          loggedBy: user.name,
          loggedById: user.id,
        },
      });
      const users = await tx.user.findMany({
        where: { id: { not: user.id } },
        select: { id: true },
      });
      if (users.length)
        await tx.notification.createMany({
          data: users.map((u) => ({
            userId: u.id,
            revisionId: revision.id,
            title: `${part.partName} is now V${revision.revisionNum}, logged by ${user.name}.`,
            url: `/parts/${part.partNumber}`,
          })),
        });
      return {
        revision,
        previous,
        partNumber: part.partNumber,
        partName: part.partName,
      };
    }),
  );
}
export async function voidRevision(
  id: string,
  reason: string,
  userId: string,
  undo = false,
) {
  const revision = await db.revision.findUnique({ where: { id } });
  if (!revision) throw new AppError("This revision could not be found.", 404);
  if (
    undo &&
    (revision.loggedById !== userId ||
      Date.now() - revision.createdAt.getTime() > 60_000)
  )
    throw new AppError(
      "Open revision history to void this entry with a reason.",
    );
  const changed = await db.revision.updateMany({
    where: { id, voided: false },
    data: { voided: true, voidReason: reason },
  });
  if (!changed.count)
    throw new AppError("This revision has already been voided.", 409);
  const part = await db.part.findUniqueOrThrow({
    where: { id: revision.partId },
    include: partInclude,
  });
  return present(part);
}
