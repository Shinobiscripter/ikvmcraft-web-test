import { opfsInvalidate } from './opfs';

interface PersonalBundle {
  version: string;
  fabric: string;
  urls: Record<string, string>;
  mods: { filename: string; url: string; sha256: string }[];
}
let bundle: PersonalBundle | null = null;
export async function loadPersonalBundle(): Promise<void> {
  const response = await fetch('/private-bundle/manifest.json');
  if (response.status === 404) return;
  if (!response.ok) throw new Error(`Private game bundle unavailable (${response.status})`);
  bundle = await response.json();
}
export function bundledUrl(url: string): string {
  return bundle?.urls[url] ?? url;
}

// Seed once, retaining subsequent user removals/replacements and drag-and-drop mods.
export async function installDefaultMods(version: string, fabric: string): Promise<void> {
  if (!bundle || bundle.version !== version || bundle.fabric !== fabric) return;
  const root = await navigator.storage.getDirectory();
  const game = await root.getDirectoryHandle('minecraft', { create: true });
  const marker = `.personal-mods-${version}-${fabric}.json`;
  try { await game.getFileHandle(marker); return; }
  catch (error) { if (!(error instanceof DOMException) || error.name !== 'NotFoundError') throw error; }
  const mods = await game.getDirectoryHandle('mods', { create: true });
  // Existing custom packs take precedence over automatic installation.
  for await (const name of (mods as any).keys()) {
    if (String(name).endsWith('.jar')) {
      const handle = await game.getFileHandle(marker, {create:true});
      const stream = await handle.createWritable();
      await stream.write('{"skipped":"existing mods"}');
      await stream.close();
      return;
    }
  }
  // Validate all downloads before writing any mod, so a failed fetch is retryable.
  const files = await Promise.all(bundle.mods.map(async mod => {
    if (!/^[^/\\]+\.jar$/.test(mod.filename)) throw new Error('Invalid bundled mod filename');
    const response = await fetch(mod.url);
    if (!response.ok) throw new Error(`Unable to load ${mod.filename}`);
    const data = await response.arrayBuffer();
    const hash = Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',data)), n=>n.toString(16).padStart(2,'0')).join('');
    if (hash !== mod.sha256) throw new Error(`Checksum failed: ${mod.filename}`);
    return { ...mod, data };
  }));
  for (const file of files) {
    const handle = await mods.getFileHandle(file.filename, {create:true});
    const stream = await handle.createWritable();
    await stream.write(file.data);
    await stream.close();
  }
  const handle = await game.getFileHandle(marker, {create:true});
  const stream = await handle.createWritable();
  await stream.write(JSON.stringify(files.map(x=>x.filename)));
  await stream.close();
  opfsInvalidate();
}
