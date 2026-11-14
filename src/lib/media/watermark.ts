import sharp from "sharp";

const MAX_BYTES = 5 * 1024 * 1024;
const ALLOWED = new Set(["image/jpeg", "image/png", "image/webp"]);

export function assertImageUpload(file: {
  size: number;
  type: string;
}) {
  if (!ALLOWED.has(file.type)) {
    throw new Error("Only JPEG, PNG, or WebP images are allowed.");
  }
  if (file.size > MAX_BYTES) {
    throw new Error("Each image must be 5 MB or smaller.");
  }
}

/**
 * Apply a semi-transparent TrustLayer watermark (bottom-right).
 * Requires `sharp` (already installed in your project).
 */
export async function applyTrustLayerWatermark(
  input: Buffer
): Promise<Buffer> {
  const image = sharp(input).rotate();
  const meta = await image.metadata();
  const width = meta.width ?? 800;
  const height = meta.height ?? 600;

  const fontSize = Math.max(14, Math.floor(width / 28));
  const pad = Math.max(8, Math.floor(width / 80));
  const svgWidth = Math.min(width, Math.floor(width * 0.55));
  const svgHeight = fontSize + pad * 2;

  const svg = `
    <svg width="${svgWidth}" height="${svgHeight}" xmlns="http://www.w3.org/2000/svg">
      <rect x="0" y="0" width="100%" height="100%" rx="6" fill="rgba(0,0,0,0.45)"/>
      <text
        x="${pad}"
        y="${fontSize + pad - 2}"
        font-family="Arial, Helvetica, sans-serif"
        font-size="${fontSize}"
        font-weight="600"
        fill="rgba(255,255,255,0.92)"
      >TrustLayer deal evidence</text>
    </svg>
  `;

  return image
    .composite([
      {
        input: Buffer.from(svg),
        gravity: "southeast",
      },
    ])
    .jpeg({ quality: 88 })
    .toBuffer();
}
