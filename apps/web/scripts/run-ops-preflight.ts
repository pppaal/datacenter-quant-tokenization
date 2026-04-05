import { spawn } from 'node:child_process';

function run(command: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const child = spawn(command, args, {
      stdio: 'inherit',
      shell: process.platform === 'win32'
    });

    child.on('exit', (code) => {
      if (code === 0) {
        resolve();
        return;
      }
      reject(new Error(`${command} ${args.join(' ')} failed with exit code ${code ?? 'unknown'}`));
    });
    child.on('error', reject);
  });
}

async function main() {
  const runBrowserListOnly = process.env.OPS_PREFLIGHT_SKIP_E2E !== '1';

  await run('npm', ['run', 'prisma:generate']);
  await run('npm', ['run', 'typecheck']);
  await run('npm', ['test']);
  await run('npm', ['run', 'build']);

  if (runBrowserListOnly) {
    await run('npm', ['run', 'e2e:list']);
  }
}

main().catch((error) => {
  console.error('[ops] preflight failed:', error instanceof Error ? error.message : error);
  process.exit(1);
});
