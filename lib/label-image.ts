// Download the complete label, including readable text, rather than a bare QR.
export async function labelImage(qrUrl: string, lines: string[]) {
  const response = await fetch(qrUrl, { cache: "no-store" });
  if (!response.ok)
    throw new Error(
      "Could not load this QR label. Please refresh and try again.",
    );
  const bitmap = await createImageBitmap(await response.blob());
  const canvas = document.createElement("canvas");
  const ctx = canvas.getContext("2d");
  if (!ctx) {
    bitmap.close();
    throw new Error("Label download is unavailable. Use Print label instead.");
  }
  canvas.width = 600;
  ctx.font = "24px sans-serif";
  const wrapped: string[] = [];
  for (const text of lines) {
    let line = "";
    for (const char of text) {
      if (ctx.measureText(line + char).width > 530) {
        wrapped.push(line);
        line = "";
      }
      line += char;
    }
    wrapped.push(line);
  }
  canvas.height = 600 + wrapped.length * 34 + 35;
  ctx.fillStyle = "white";
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, 600, 600);
  bitmap.close();
  ctx.fillStyle = "black";
  ctx.font = "24px sans-serif";
  ctx.textAlign = "center";
  wrapped.forEach((line, i) => ctx.fillText(line, 300, 620 + i * 34));
  return new Promise<Blob>((resolve, reject) =>
    canvas.toBlob(
      (blob) =>
        blob
          ? resolve(blob)
          : reject(new Error("Could not prepare the label image.")),
      "image/png",
    ),
  );
}
