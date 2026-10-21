import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const execute = promisify(execFile);
type Run = (args: string[], signal?: AbortSignal) => Promise<string>;
const adb: Run = async (args, signal) => (await execute('adb', args, { signal, timeout: 10_000 })).stdout;

/** Keep pre-existing forwards; clean up only mappings created for this session. */
export async function setupAndroidReverse(signal: AbortSignal, run: Run = adb, requestedSerial = process.env.ANDROID_SERIAL) {
  const devices = (await run(['devices'], signal)).split('\n').map(line => line.trim().split(/\s+/)).filter(parts => parts[1] === 'device').map(parts => parts[0]!);
  const serial = requestedSerial || (devices.length === 1 ? devices[0] : undefined);
  if (!serial || !devices.includes(serial)) throw new Error('Connect one authorized Android device, or set ANDROID_SERIAL to select one.');
  const command = (args: string[], abort?: AbortSignal) => run(['-s', serial, ...args], abort);
  const owned = new Set<string>();
  const mappings = async (abort?: AbortSignal) => (await command(['reverse', '--list'], abort)).split('\n').map(line => line.trim().split(/\s+/));
  const cleanup = async () => {
    for (const local of owned) {
      try {
        if ((await mappings()).some(parts => parts[1] === local && parts[2] === local)) await command(['reverse', '--remove', local]);
      } catch (error) { console.warn(`Could not remove this session's Android mapping ${local}:`, error); }
    }
    owned.clear();
  };
  try {
    for (const port of [3000, 3334]) {
      signal.throwIfAborted();
      const local = `tcp:${port}`;
      const existing = (await mappings(signal)).find(parts => parts[1] === local);
      if (existing) {
        if (existing[2] !== local) throw new Error(`Android ${local} already forwards elsewhere; leave that session intact and remove its mapping first.`);
      } else {
        await command(['reverse', '--no-rebind', local, local], signal);
        owned.add(local);
      }
    }
    return { serial, cleanup };
  } catch (error) { await cleanup(); throw error; }
}
