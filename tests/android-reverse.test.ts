import { expect, test } from 'bun:test';
import { setupAndroidReverse } from '../scripts/lib/android-reverse';
test('Android cleanup preserves existing forwards and removes only owned mappings', async () => {
  const mappings = new Map([['tcp:3000', 'tcp:3000']]);
  const run = async (args: string[]) => {
    if (args[0] === 'devices') return 'List of devices attached\ntest-device\tdevice\n';
    expect(args.slice(0,2)).toEqual(['-s','test-device']);
    if (args[3] === '--list') return [...mappings].map(([a,b]) => `device ${a} ${b}`).join('\n');
    if (args[3] === '--no-rebind') mappings.set(args[4]!,args[5]!);
    if (args[3] === '--remove') mappings.delete(args[4]!);
    return '';
  };
  const session = await setupAndroidReverse(new AbortController().signal, run, 'test-device');
  expect(mappings.size).toBe(2);
  await session.cleanup();
  expect([...mappings]).toEqual([['tcp:3000','tcp:3000']]);
});
test('Android setup refuses conflicting forwards', async () => {
  const run = async (args: string[]) => args[0] === 'devices' ? 'phone device' : 'phone tcp:3000 tcp:9999';
  await expect(setupAndroidReverse(new AbortController().signal, run, 'phone')).rejects.toThrow('already forwards elsewhere');
});
