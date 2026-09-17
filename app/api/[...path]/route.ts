import { NextResponse, after } from "next/server";
import { Prisma } from "@prisma/client";
import { z } from "zod";
import QRCode from "qrcode";
import JSZip from "jszip";
import { createHash } from "node:crypto";
import { db } from "@/lib/db";
import {
  checkCode,
  checkOrigin,
  getUser,
  requireUser,
  signIn,
  signOut,
} from "@/lib/auth";
import { AppError, csvCell } from "@/lib/domain";
import {
  createPart,
  findPart,
  logRevision,
  partInclude,
  present,
  voidRevision,
} from "@/lib/parts";
import { deliverNotifications } from "@/lib/notifications";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
const text = z.string().trim().min(1).max(200);
const note = z.string().trim().min(1, "Tell us what changed.").max(4000);
const email = z.union([z.email().max(254), z.literal("")]).optional();
const partFields = { partName: text, vendorId: text, categoryId: text };
async function body(req: Request) {
  const raw = await req.text();
  if (raw.length > 65536) throw new AppError("This request is too large.", 413);
  try {
    return JSON.parse(raw);
  } catch {
    throw new AppError("Please check the submitted fields.");
  }
}
async function handle(
  req: Request,
  ctx: { params: Promise<{ path: string[] }> },
) {
  try {
    const { path } = await ctx.params,
      method = req.method,
      route = path.join("/");
    const url = new URL(req.url);
    if (method !== "GET") checkOrigin(req);
    if (route === "health" && method === "GET") {
      await db.$queryRaw`SELECT 1`;
      return NextResponse.json({ ok: true });
    }
    if (path[0] === "vendors" && path.length === 2 && method === "DELETE") {
      const vendor = await db.vendor.findUnique({ where: { id: path[1] }, include: { _count: { select: { parts: true } } } });
      if (!vendor) throw new AppError("This vendor could not be found.", 404);
      if (vendor._count.parts > 0) throw new AppError("This vendor has parts attached. Merge it into another vendor instead so their IDs and history stay valid.", 409);
      await db.vendor.delete({ where: { id: vendor.id } });
      return NextResponse.json({ ok: true });
    }
    if (route === "auth" && method === "POST") {
      const input = z
        .object({ code: z.string().min(1).max(500), name: text, email })
        .strict()
        .parse(await body(req));
      const ip =
        req.headers.get("x-forwarded-for")?.split(",")[0].trim() || "local";
      const key = createHash("sha256").update(ip).digest("hex");
      await db.loginAttempt.deleteMany({
        where: { startedAt: { lt: new Date(Date.now() - 15 * 60 * 1000) } },
      });
      const attempt = await db.loginAttempt.upsert({
        where: { key },
        create: { key },
        update: { count: { increment: 1 } },
      });
      if (attempt.count > 20)
        throw new AppError(
          "Too many sign-in attempts. Try again in 15 minutes.",
          429,
        );
      if (!checkCode(input.code))
        throw new AppError("That access code did not match. Try again.", 401);
      // Do not reattach a session by display name: names are not authentication credentials.
      const user = await db.user.create({
        data: { name: input.name, email: input.email || null },
      });
      await signIn(user.id);
      await db.loginAttempt.deleteMany({ where: { key } });
      return NextResponse.json({
        id: user.id,
        name: user.name,
        email: user.email,
      });
    }
    if (route === "session" && method === "GET") {
      const user = await getUser();
      return NextResponse.json({
        user: user
          ? {
              id: user.id,
              name: user.name,
              email: user.email,
              hasPush: !!user.pushSub,
            }
          : null,
        vapidPublicKey: process.env.VAPID_PUBLIC_KEY || null,
        emailConfigured: !!(
          process.env.RESEND_API_KEY && process.env.RESEND_FROM
        ),
      });
    }
    if (
      route === "notifications/retry" &&
      method === "POST" &&
      process.env.CRON_SECRET &&
      req.headers.get("authorization") === `Bearer ${process.env.CRON_SECRET}`
    ) {
      await deliverNotifications();
      return NextResponse.json({ ok: true });
    }
    const user = await requireUser();
    if (route === "auth" && method === "DELETE") {
      await signOut();
      return NextResponse.json({ ok: true });
    }
    if (route === "profile" && method === "PATCH") {
      const input = z
        .object({ email })
        .strict()
        .parse(await body(req));
      await db.user.update({
        where: { id: user.id },
        data: { email: input.email || null },
      });
      after(deliverNotifications);
      return NextResponse.json({ ok: true });
    }
    if (route === "stats" && method === "GET") {
      const [parts, labels, pending, changes] = await Promise.all([
        db.part.count({ where: { archivedAt: null } }),
        db.part.count({ where: { labelPrinted: false, archivedAt: null } }),
        db.vendor.count({ where: { approved: false } }),
        db.revision.count({
          where: {
            voided: false,
            createdAt: { gte: new Date(Date.now() - 7 * 86400000) },
          },
        }),
      ]);
      return NextResponse.json({ parts, labels, pending, changes });
    }
    if (route === "parts" && method === "GET") {
      const q = (url.searchParams.get("q") || "").trim();
      const where: Prisma.PartWhereInput = {
        archivedAt:
          url.searchParams.get("archived") === "true" ? { not: null } : null,
        AND: [
          q
            ? {
                OR: [
                  { partName: { contains: q, mode: "insensitive" } },
                  {
                    partNumber: {
                      contains: q.toUpperCase().replace(/-V\d+$/, ""),
                      mode: "insensitive",
                    },
                  },
                ],
              }
            : {},
          url.searchParams.get("vendor")
            ? { vendorId: url.searchParams.get("vendor")! }
            : {},
          url.searchParams.get("category")
            ? { categoryId: url.searchParams.get("category")! }
            : {},
          url.searchParams.get("unprinted") === "true"
            ? { labelPrinted: false }
            : {},
        ],
      };
      const page = Math.max(1, Number(url.searchParams.get("page")) || 1);
      const [rows, total] = await Promise.all([
        db.part.findMany({
          where,
          include: partInclude,
          orderBy: { createdAt: "desc" },
          skip: (page - 1) * 100,
          take: 100,
        }),
        db.part.count({ where }),
      ]);
      return NextResponse.json({
        parts: rows.map(present),
        total,
        page,
        pages: Math.ceil(total / 100),
      });
    }
    if (route === "parts" && method === "POST") {
      const input = z
        .object({
          ...partFields,
          changeNote: note.optional(),
          sampleCount: z.coerce.number().int().min(1).max(100).default(1),
        })
        .strict()
        .parse(await body(req));
      return NextResponse.json(await createPart(input, user), { status: 201 });
    }
    if (path[0] === "samples" && path.length === 2 && method === "PATCH") {
      const input = z
        .object({
          status: z.enum([
            "IN_HOUSE",
            "SENT_OUT",
            "PASSED",
            "FAILED",
            "SENT_BACK",
          ]),
          note: z.string().trim().max(4000).optional(),
        })
        .strict()
        .parse(await body(req));
      const result = await db.$transaction(async (tx) => {
        const sample = await tx.sample.findUnique({
          where: { id: path[1] },
          include: { part: { include: { revisions: true } } },
        });
        if (!sample) throw new AppError("This sample could not be found.", 404);
        const current =
          sample.part.revisions
            .filter((r) => !r.voided)
            .sort((a, b) => b.revisionNum - a.revisionNum)[0]?.revisionNum ??
          null;
        await tx.sample.update({
          where: { id: sample.id },
          data: { status: input.status, note: input.note || null },
        });
        await tx.sampleEvent.create({
          data: {
            sampleId: sample.id,
            status: input.status,
            note: input.note || null,
            revisionNum: current,
            loggedBy: user.name,
          },
        });
        return tx.sample.findUniqueOrThrow({ where: { id: sample.id }, include: { events: { orderBy: { createdAt: "desc" } } } });
      });
      return NextResponse.json(result);
    }
    if (path[0] === "parts" && path.length === 2 && method === "GET")
      return NextResponse.json(await findPart(path[1]));
    if (path[0] === "parts" && path.length === 2 && method === "PATCH") {
      const { updatedAt, ...input } = z
        .object({ ...partFields, updatedAt: z.iso.datetime() })
        .strict()
        .parse(await body(req));
      const result = await db.$transaction(async (tx) => {
        const old = await tx.part.findUnique({
          where: { id: path[1] },
          include: { vendor: true, category: true },
        });
        if (!old) throw new AppError("This part could not be found.", 404);
        const changed = await tx.part.updateMany({
          where: {
            id: path[1],
            updatedAt: new Date(updatedAt),
            archivedAt: null,
          },
          data: input,
        });
        if (!changed.count)
          throw new AppError(
            "Someone updated this part, or it is in Trash. Refresh before saving.",
            409,
          );
        await tx.partChange.create({
          data: {
            partId: old.id,
            before: {
              partName: old.partName,
              vendorId: old.vendorId,
              categoryId: old.categoryId,
              vendorName: old.vendor.name,
              categoryName: old.category.name,
            },
            after: input,
            loggedBy: user.name,
            action: "Edited",
          },
        });
        return present(
          await tx.part.findUniqueOrThrow({
            where: { id: path[1] },
            include: partInclude,
          }),
        );
      });
      return NextResponse.json(result);
    }
    if (
      path[0] === "parts" &&
      path.length === 3 &&
      ["archive", "restore", "restore-edit"].includes(path[2]) &&
      method === "POST"
    ) {
      const input = z
        .object({ updatedAt: z.iso.datetime(), changeId: text.optional() })
        .strict()
        .parse(await body(req));
      const result = await db.$transaction(async (tx) => {
        const old = await tx.part.findUnique({
          where: { id: path[1] },
          include: { vendor: true, category: true },
        });
        if (!old) throw new AppError("This part could not be found.", 404);
        let data: Prisma.PartUncheckedUpdateManyInput =
          path[2] === "archive"
            ? { archivedAt: new Date() }
            : { archivedAt: null };
        if (path[2] === "restore-edit") {
          if (old.archivedAt)
            throw new AppError("Restore this part from Trash first.");
          const change = await tx.partChange.findFirst({
            where: { id: input.changeId || "", partId: old.id },
          });
          if (!change || !["Edited", "Restored edit"].includes(change.action))
            throw new AppError("Choose an earlier edit.");
          const previous = change.before as {
            partName: string;
            vendorId: string;
            categoryId: string;
          };
          if (
            !(await tx.vendor.findUnique({ where: { id: previous.vendorId } }))
          )
            throw new AppError(
              "The previous vendor has been merged. Edit this part and choose its current vendor instead.",
            );
          data = {
            partName: previous.partName,
            vendorId: previous.vendorId,
            categoryId: previous.categoryId,
          };
        }
        const updated = await tx.part.updateMany({
          where: { id: old.id, updatedAt: new Date(input.updatedAt) },
          data,
        });
        if (!updated.count)
          throw new AppError(
            "Someone updated this part. Refresh before continuing.",
            409,
          );
        const part = await tx.part.findUniqueOrThrow({
          where: { id: old.id },
          include: partInclude,
        });
        await tx.partChange.create({
          data: {
            partId: old.id,
            before: {
              partName: old.partName,
              vendorId: old.vendorId,
              categoryId: old.categoryId,
              vendorName: old.vendor.name,
              categoryName: old.category.name,
            },
            after: {
              partName: part.partName,
              vendorId: part.vendorId,
              categoryId: part.categoryId,
            },
            loggedBy: user.name,
            action:
              path[2] === "archive"
                ? "Moved to Trash"
                : path[2] === "restore"
                  ? "Restored from Trash"
                  : "Restored edit",
          },
        });
        return present(part);
      });
      return NextResponse.json(result);
    }

    if (
      path[0] === "parts" &&
      path[2] === "revisions" &&
      path.length === 3 &&
      method === "POST"
    ) {
      const input = z
        .object({ changeNote: note })
        .strict()
        .parse(await body(req));
      const result = await logRevision(path[1], input.changeNote, user);
      after(deliverNotifications);
      return NextResponse.json(result, { status: 201 });
    }
    if (
      path[0] === "parts" &&
      path[2] === "qr" &&
      path.length === 3 &&
      method === "GET"
    ) {
      const part = await findPart(path[1]);
      if (url.searchParams.get("format") === "svg")
        return new Response(
          await QRCode.toString(part.partNumber, {
            type: "svg",
            margin: 4,
            errorCorrectionLevel: "M",
          }),
          {
            headers: {
              "Content-Type": "image/svg+xml",
              "Cache-Control": "private, max-age=3600",
            },
          },
        );
      return new Response(
        new Uint8Array(
          await QRCode.toBuffer(part.partNumber, {
            width: 600,
            margin: 4,
            errorCorrectionLevel: "M",
          }),
        ),
        {
          headers: {
            "Content-Type": "image/png",
            "Cache-Control": "private, max-age=3600",
          },
        },
      );
    }
    if (
      path[0] === "revisions" &&
      path[2] === "void" &&
      path.length === 3 &&
      method === "POST"
    ) {
      const input = z
        .object({ reason: note, undo: z.boolean().optional() })
        .strict()
        .parse(await body(req));
      return NextResponse.json(
        await voidRevision(path[1], input.reason, user.id, input.undo),
      );
    }
    if (route === "vendors" && method === "GET")
      return NextResponse.json(
        await db.vendor.findMany({
          orderBy: { name: "asc" },
          include: { _count: { select: { parts: true } } },
        }),
      );
    if (route === "vendors" && method === "POST") {
      const input = z
        .object({
          code: z.string().regex(/^[A-Z]{3,4}$/, "Use 3–4 uppercase letters."),
          name: text,
          contact: z.string().trim().max(300).optional(),
        })
        .strict()
        .parse(await body(req));
      return NextResponse.json(await db.vendor.create({ data: input }), {
        status: 201,
      });
    }
    if (
      path[0] === "vendors" &&
      path[2] === "approve" &&
      path.length === 3 &&
      method === "POST"
    )
      return NextResponse.json(
        await db.vendor.update({
          where: { id: path[1] },
          data: { approved: true },
        }),
      );
    if (
      path[0] === "vendors" &&
      path[2] === "merge" &&
      path.length === 3 &&
      method === "POST"
    ) {
      const { targetId } = z
        .object({ targetId: text })
        .strict()
        .parse(await body(req));
      if (targetId === path[1])
        throw new AppError("Choose a different vendor to merge into.");
      await db.$transaction(async (tx) => {
        const source = await tx.vendor.findUnique({ where: { id: path[1] } });
        if (!source || source.approved)
          throw new AppError("Only pending vendors can be merged.");
        if (!(await tx.vendor.findUnique({ where: { id: targetId } })))
          throw new AppError("Choose an existing vendor.");
        await tx.part.updateMany({
          where: { vendorId: path[1] },
          data: { vendorId: targetId },
        });
        await tx.vendor.delete({ where: { id: path[1] } });
      });
      return NextResponse.json({ ok: true });
    }
    if (route === "categories" && method === "GET")
      return NextResponse.json(
        await db.category.findMany({ orderBy: { name: "asc" } }),
      );
    if (route === "categories" && method === "POST") {
      const input = z
        .object({ name: text })
        .strict()
        .parse(await body(req));
      const code = `CAT${Date.now().toString(36).toUpperCase()}${Math.random().toString(36).slice(2, 6).toUpperCase()}`;
      return NextResponse.json(
        await db.category.create({ data: { name: input.name, code } }),
        { status: 201 },
      );
    }
    if (
      path[0] === "export" &&
      ["csv", "qr", "printed"].includes(path[1]) &&
      path.length === 2 &&
      method === "POST"
    ) {
      const { ids } = z
        .object({
          ids: z.array(text).min(1, "Select at least one part.").max(500),
        })
        .strict()
        .parse(await body(req));
      const parts = await db.part.findMany({
        where: { id: { in: [...new Set(ids)] }, archivedAt: null },
        include: { vendor: true, category: true },
        orderBy: { partNumber: "asc" },
      });
      if (parts.length !== new Set(ids).size)
        throw new AppError(
          "Some selected parts could not be found. Refresh the list.",
        );
      let data: string | Uint8Array = "",
        type = "application/json",
        filename = "";
      if (path[1] === "csv") {
        data =
          "\uFEFF" +
          [
            ["Part Number", "Part Name", "Vendor", "Category"],
            ...parts.map((p) => [
              p.partNumber,
              p.partName,
              p.vendor.name,
              p.category.name,
            ]),
          ]
            .map((r) => r.map(csvCell).join(","))
            .join("\r\n");
        type = "text/csv; charset=utf-8";
        filename = "partbook-labels.csv";
      }
      if (path[1] === "qr") {
        const zip = new JSZip();
        for (const part of parts)
          zip.file(
            `${part.partNumber}.png`,
            await QRCode.toBuffer(part.partNumber, {
              width: 600,
              margin: 4,
              errorCorrectionLevel: "M",
            }),
          );
        data = new Uint8Array(await zip.generateAsync({ type: "nodebuffer" }));
        type = "application/zip";
        filename = "partbook-qr-labels.zip";
      }
      await db.part.updateMany({
        where: { id: { in: parts.map((p) => p.id) } },
        data: { labelPrinted: true },
      });
      if (path[1] === "printed") return NextResponse.json({ ok: true });
      return new Response(data as BodyInit, {
        headers: {
          "Content-Type": type,
          "Content-Disposition": `attachment; filename="${filename}"`,
          "Cache-Control": "no-store",
        },
      });
    }
    if (route === "push/subscribe" && method === "POST") {
      const input = z
        .object({
          endpoint: z.url().max(4096),
          keys: z.object({
            p256dh: z.string().min(20).max(300),
            auth: z.string().min(8).max(100),
          }),
          expirationTime: z.number().nullable().optional(),
        })
        .strict()
        .parse(await body(req));
      const endpoint = new URL(input.endpoint);
      const allowed = [
        "fcm.googleapis.com",
        "updates.push.services.mozilla.com",
        "web.push.apple.com",
        "notify.windows.com",
      ];
      if (
        endpoint.protocol !== "https:" ||
        endpoint.port ||
        endpoint.username ||
        endpoint.password ||
        !allowed.some(
          (h) => endpoint.hostname === h || endpoint.hostname.endsWith(`.${h}`),
        )
      )
        throw new AppError(
          "This push service is not supported. Add an email address for notifications instead.",
        );
      await db.user.update({
        where: { id: user.id },
        data: { pushSub: JSON.stringify(input) },
      });
      after(deliverNotifications);
      return NextResponse.json({ ok: true });
    }
    if (route === "notifications" && method === "GET") {
      return NextResponse.json({
        pending: await db.notification.count({
          where: { userId: user.id, deliveredAt: null },
        }),
      });
    }
    if (route === "notifications/retry" && method === "POST") {
      after(deliverNotifications);
      return NextResponse.json({ ok: true });
    }
    throw new AppError("This page could not be found.", 404);
  } catch (e) {
    if (e instanceof z.ZodError)
      return NextResponse.json(
        { message: e.issues[0]?.message || "Please check the fields." },
        { status: 400 },
      );
    if (e instanceof AppError)
      return NextResponse.json({ message: e.message }, { status: e.status });
    if (e instanceof Prisma.PrismaClientKnownRequestError) {
      if (e.code === "P2002")
        return NextResponse.json(
          { message: "That value was just taken. Refresh and try again." },
          { status: 409 },
        );
      if (["P2003", "P2025"].includes(e.code))
        return NextResponse.json(
          {
            message:
              "This item changed or could not be found. Refresh and try again.",
          },
          { status: 409 },
        );
    }
    console.error(
      "Request failed:",
      e instanceof Error ? e.message : "Unknown failure",
    );
    return NextResponse.json(
      {
        message: "We could not save or load this right now. Please try again.",
      },
      { status: 500 },
    );
  }
}
export { handle as GET, handle as POST, handle as PATCH, handle as DELETE };
