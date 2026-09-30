import { db } from "./db";
import { AppError } from "./domain";
import { retry } from "./parts";
import type { Prisma, SampleStatus } from "@prisma/client";
import { createHash } from "node:crypto";

async function checkRevision(
  tx: Prisma.TransactionClient,
  partId: string,
  revisionNum: number | null,
) {
  if (revisionNum === null) return;
  const revision = await tx.revision.findUnique({
    where: { partId_revisionNum: { partId, revisionNum } },
  });
  if (!revision || revision.voided)
    throw new AppError("Choose an existing, non-voided version of this part.");
}

export async function updateSample(
  id: string,
  input: {
    updatedAt: string;
    status?: SampleStatus;
    note?: string;
    revisionNum?: number | null;
    receivedOn?: string | null;
  },
  user: { name: string },
) {
  return db.$transaction(async (tx) => {
    const sample = await tx.sample.findUnique({
      where: { id },
      include: { part: true },
    });
    if (!sample) throw new AppError("This sample could not be found.", 404);
    if (sample.part.archivedAt)
      throw new AppError("Restore this part before editing samples.", 409);
    if (
      input.revisionNum !== undefined &&
      input.revisionNum !== sample.revisionNum
    )
      await checkRevision(tx, sample.partId, input.revisionNum);
    const after = {
      status: input.status ?? sample.status,
      note: input.note === undefined ? sample.note : input.note || null,
      revisionNum:
        input.revisionNum === undefined
          ? sample.revisionNum
          : input.revisionNum,
      receivedOn:
        input.receivedOn === undefined
          ? sample.receivedOn
          : input.receivedOn
            ? new Date(input.receivedOn)
            : null,
    };
    const changed = await tx.sample.updateMany({
      where: { id, updatedAt: new Date(input.updatedAt) },
      data: {
        ...after,
        ...(after.revisionNum !== sample.revisionNum
          ? { labelPrinted: false }
          : {}),
      },
    });
    if (!changed.count)
      throw new AppError(
        "This sample changed in another window. Refresh before saving.",
        409,
      );
    await tx.sampleEvent.create({
      data: {
        sampleId: id,
        status: after.status,
        note: after.note,
        revisionNum: after.revisionNum,
        loggedBy: user.name,
        details: {
          action: "Sample updated",
          before: {
            status: sample.status,
            note: sample.note,
            revisionNum: sample.revisionNum,
            receivedOn: sample.receivedOn?.toISOString().slice(0, 10) ?? null,
          },
          after: {
            ...after,
            receivedOn: after.receivedOn?.toISOString().slice(0, 10) ?? null,
          },
        },
      },
    });
    return tx.sample.findUniqueOrThrow({
      where: { id },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
  });
}

export async function markSamplePrinted(id: string, updatedAt: string) {
  return db.$transaction(async (tx) => {
    const result = await tx.sample.updateMany({
      where: { id, updatedAt: new Date(updatedAt), part: { archivedAt: null } },
      data: { labelPrinted: true },
    });
    if (!result.count)
      throw new AppError(
        "This sample changed. Refresh its label before marking it printed.",
        409,
      );
    return tx.sample.findUniqueOrThrow({
      where: { id },
      include: { events: { orderBy: { createdAt: "desc" } } },
    });
  });
}

export type ReceiptInput = {
  requestId: string;
  receivedOn: string;
  lines: {
    partId: string;
    revisionNum: number | null;
    count: number;
    note?: string;
  }[];
};
export type ReceiptResult = {
  samples: {
    id: string;
    partNumber: string;
    partName: string;
    revisionNum: number | null;
    sampleNumber: number;
  }[];
};
export async function receiveDelivery(
  input: ReceiptInput,
  user: { name: string },
) {
  const fingerprint = createHash("sha256")
    .update(
      JSON.stringify({ receivedOn: input.receivedOn, lines: input.lines }),
    )
    .digest("hex");
  return retry(() =>
    db.$transaction(
      async (tx) => {
        const prior = await tx.receipt.findUnique({
          where: { id: input.requestId },
        });
        if (prior) {
          if (prior.fingerprint !== fingerprint)
            throw new AppError(
              "This delivery was already saved with different details. Start another delivery.",
              409,
            );
          return prior.result as ReceiptResult;
        }
        const result: ReceiptResult = { samples: [] };
        for (const line of [...input.lines].sort((a, b) =>
          a.partId.localeCompare(b.partId),
        )) {
          const part = await tx.part.findUnique({ where: { id: line.partId } });
          if (!part || part.archivedAt)
            throw new AppError(
              "A selected part is missing or in Trash. Refresh the delivery before saving.",
              409,
            );
          await checkRevision(tx, part.id, line.revisionNum);
          const max = await tx.sample.aggregate({
            where: { partId: part.id },
            _max: { sampleNumber: true },
          });
          for (let i = 0; i < line.count; i++) {
            const sample = await tx.sample.create({
              data: {
                partId: part.id,
                sampleNumber: (max._max.sampleNumber ?? 0) + 1 + i,
                revisionNum: line.revisionNum,
                receivedOn: new Date(input.receivedOn),
                note: line.note || null,
                events: {
                  create: {
                    status: "IN_HOUSE",
                    revisionNum: line.revisionNum,
                    note: line.note || null,
                    loggedBy: user.name,
                    details: {
                      action: "Received sample",
                      receivedOn: input.receivedOn,
                      receiptId: input.requestId,
                    },
                  },
                },
              },
            });
            result.samples.push({
              id: sample.id,
              partNumber: part.partNumber,
              partName: part.partName,
              revisionNum: sample.revisionNum,
              sampleNumber: sample.sampleNumber,
            });
          }
        }
        await tx.receipt.create({
          data: { id: input.requestId, fingerprint, result },
        });
        return result;
      },
      { timeout: 20000 },
    ),
  );
}
