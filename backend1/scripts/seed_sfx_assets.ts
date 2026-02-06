import fs from 'fs';
import path from 'path';

// Resolve backend root (parent of scripts/)
const backendRoot = path.resolve(__dirname, '..');

type SfxJsonEntry = {
  fileName: string;
  description: string;
  duration?: string;
};

function parseDurationSeconds(text?: string): number | null {
  if (!text) return null;
  const match = text.match(/([\d.]+)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

async function main() {
  process.chdir(backendRoot);
  const dbPath = path.join(backendRoot, 'prisma', 'dev.db').replace(/\\/g, '/');
  const datasourceUrl = `file:${dbPath}`;
  const { PrismaClient } = await import('../src/generated/prisma');
  const prisma = new PrismaClient({ datasourceUrl });
  const jsonPath = path.join(backendRoot, 'storage', 'audio_assets', 'sfx', 'sfx.json');
  if (!fs.existsSync(jsonPath)) {
    throw new Error(`sfx.json not found at ${jsonPath}`);
  }

  const raw = fs.readFileSync(jsonPath, 'utf8');
  const entries = JSON.parse(raw) as SfxJsonEntry[];
  if (!Array.isArray(entries)) {
    throw new Error('sfx.json must be an array');
  }

  let upserted = 0;
  for (const entry of entries) {
    if (!entry.fileName || !entry.description) continue;
    const durationSeconds = parseDurationSeconds(entry.duration);
    const filePath = path.join('audio_assets', 'sfx', entry.fileName).replace(/\\/g, '/');

    await prisma.sfxAsset.upsert({
      where: { filename: entry.fileName },
      update: {
        description: entry.description,
        durationText: entry.duration ?? null,
        durationSeconds,
        filePath,
      },
      create: {
        filename: entry.fileName,
        description: entry.description,
        durationText: entry.duration ?? null,
        durationSeconds,
        filePath,
      },
    });
    upserted += 1;
  }

  await prisma.$disconnect();
  console.log(`[seed_sfx_assets] Upserted ${upserted} sfx assets.`);
}

main().catch((err) => {
  console.error('[seed_sfx_assets] Failed:', err);
  process.exit(1);
});
