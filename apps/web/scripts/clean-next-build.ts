import { rm } from 'node:fs/promises';
import path from 'node:path';

async function main() {
  const buildDir = path.join(process.cwd(), 'build');
  await rm(buildDir, { recursive: true, force: true });
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
