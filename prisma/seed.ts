import { PrismaClient } from "@prisma/client";
const db = new PrismaClient();
async function main() {
  const vendors = await Promise.all(
    [
      ["ACM", "Acme Manufacturing"],
      ["BRT", "Brighton Components"],
      ["NTH", "Northline Supply"],
    ].map(([code, name]) =>
      db.vendor.upsert({
        where: { code },
        create: { code, name, approved: true },
        update: {},
      }),
    ),
  );
  const categories = await Promise.all(
    [
      ["BRK", "Brackets"],
      ["ENC", "Enclosures"],
      ["HRD", "Hardware"],
      ["ELE", "Electronics"],
    ].map(([code, name]) =>
      db.category.upsert({
        where: { code },
        create: { code, name },
        update: {},
      }),
    ),
  );
  const samples = [
    {
      name: "Mounting bracket",
      v: 0,
      c: 0,
      notes: [
        "Initial release.",
        "Updated hole pattern for new tooling.",
        "Reinforced wall thickness to 3mm after field failure.",
      ],
    },
    {
      name: "Controller enclosure",
      v: 0,
      c: 1,
      notes: ["Initial release.", "Added ventilation slots to the rear panel."],
    },
    { name: "Threaded standoff, M4", v: 1, c: 2, notes: ["Initial release."] },
    {
      name: "Sensor mounting plate",
      v: 1,
      c: 0,
      notes: [
        "Initial release.",
        "Moved cable channel 5mm to clear the frame.",
      ],
    },
    {
      name: "Power distribution board",
      v: 2,
      c: 3,
      notes: ["Initial release."],
    },
  ];
  const counts = [0, 0, 0];
  for (const s of samples) {
    const sequence = ++counts[s.v];
    const partNumber = `${vendors[s.v].code}-${String(sequence).padStart(4, "0")}`;
    await db.part.upsert({
      where: { partNumber },
      update: {},
      create: {
        partNumber,
        partName: s.name,
        sequence,
        vendorId: vendors[s.v].id,
        categoryId: categories[s.c].id,
        labelPrinted: s.v === 0,
        revisions: {
          create: s.notes.map((changeNote, i) => ({
            revisionNum: i + 1,
            changeNote,
            loggedBy: i % 2 ? "Dana" : "Sam",
            createdAt: new Date(
              Date.now() - (s.notes.length - i) * 86400000 * 7,
            ),
          })),
        },
      },
    });
  }
  console.log("Seeded 3 vendors, 4 categories, and 5 sample parts.");
}
main().finally(() => db.$disconnect());
