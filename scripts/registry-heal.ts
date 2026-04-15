import { readRegistry, writeRegistry } from '../src/core/telegramStorage.ts';
import { repairRegistry } from '../src/core/registryRepair.ts';

async function main() {
  const before = await readRegistry();
  const after = repairRegistry(before);

  await writeRegistry(after);

  const beforeFolders = Object.values(before).filter((v: any) => v?._type === 'folder').length;
  const afterFolders = Object.values(after).filter((v: any) => v?._type === 'folder').length;
  const beforeFiles = Object.values(before).filter((v: any) => !v?._type).length;
  const afterFiles = Object.values(after).filter((v: any) => !v?._type).length;

  console.log(JSON.stringify({
    beforeFolders,
    afterFolders,
    beforeFiles,
    afterFiles
  }, null, 2));
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
