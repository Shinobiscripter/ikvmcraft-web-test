// Run locally with Node 22+: node scripts/personal-bundle.mjs /path/to/PrismLauncher
// Output contains personal game binaries. Never commit it to a public repository.
import fs from 'node:fs/promises';
import path from 'node:path';
import { createHash } from 'node:crypto';
const prism = process.argv[2];
if (!prism) throw new Error('Pass the PrismLauncher data directory');
const out = path.resolve('frontend/public/private-bundle');
await fs.mkdir(out, { recursive: true });
const manifest = { version: '26.3', fabric: '0.19.5', urls: {}, mods: [] };
async function put(data) {
  const hash = createHash('sha256').update(data).digest('hex');
  await fs.writeFile(path.join(out, hash), data);
  return { url: `/private-bundle/${hash}`, sha256: hash };
}
async function mirror(url, local) {
  try { manifest.urls[url] = (await put(await fs.readFile(local))).url; }
  catch (e) { if (e.code !== 'ENOENT') throw e; }
}
function maven(name) {
  const [group, artifact, version, classifier] = name.split(':');
  return `${group.replaceAll('.', '/')}/${artifact}/${version}/${artifact}-${version}${classifier ? `-${classifier}` : ''}.jar`;
}
for (const [pkg, version] of [['net.minecraft',manifest.version],['net.fabricmc.fabric-loader',manifest.fabric],['net.fabricmc.intermediary',manifest.version]]) {
  const file = path.join(prism, 'meta', pkg, `${version}.json`);
  const meta = JSON.parse(await fs.readFile(file, 'utf8'));
  await mirror(`https://meta.prismlauncher.org/v1/${pkg}/${version}.json`, file);
  await mirror(`https://meta.prismlauncher.org/v1/${pkg}/index.json`, path.join(prism,'meta',pkg,'index.json'));
  for (const lib of [...(meta.libraries ?? []), ...(meta.mainJar ? [meta.mainJar] : [])]) {
    const artifact = lib.downloads?.artifact;
    const relative = artifact?.path ?? maven(lib.name);
    const url = artifact?.url ?? `${(lib.url ?? 'https://libraries.minecraft.net').replace(/\/$/,'')}/${relative}`;
    await mirror(url, path.join(prism,'libraries',relative));
  }
  if (meta.assetIndex) {
    const indexFile = path.join(prism,'assets','indexes',`${meta.assetIndex.id}.json`);
    await mirror(meta.assetIndex.url,indexFile);
    const index = JSON.parse(await fs.readFile(indexFile,'utf8'));
    for (const hash of new Set(Object.values(index.objects).map(x=>x.hash))) {
      const relative = `${hash.slice(0,2)}/${hash}`;
      await mirror(`https://resources.download.minecraft.net/${relative}`, path.join(prism,'assets','objects',relative));
    }
  }
}
async function api(route) {
  const response = await fetch(`https://api.modrinth.com/v2/${route}`, {headers:{'User-Agent':'ikvmcraft-personal-bundle/1.0'}});
  if (!response.ok) throw new Error(`Modrinth: ${response.status}`);
  return response.json();
}
const included = new Set();
async function addMod(version) {
  if (included.has(version.project_id)) return;
  included.add(version.project_id);
  for (const dep of version.dependencies.filter(x=>x.dependency_type==='required')) {
    if (dep.version_id) await addMod(await api(`version/${dep.version_id}`));
    else await selectMod(dep.project_id);
  }
  const file = version.files.find(x=>x.primary) ?? version.files[0];
  const response = await fetch(file.url);
  if (!response.ok) throw new Error(`Mod download: ${response.status}`);
  const data = Buffer.from(await response.arrayBuffer());
  if (createHash('sha512').update(data).digest('hex') !== file.hashes.sha512) throw new Error(`Checksum failed: ${file.filename}`);
  manifest.mods.push({name:version.name, filename:file.filename, project:version.project_id, ...await put(data)});
}
async function selectMod(project) {
  const query = new URLSearchParams({game_versions:JSON.stringify([manifest.version]),loaders:'["fabric"]'});
  const versions = await api(`project/${project}/version?${query}`);
  const version = versions.find(x=>x.version_type==='release') ?? versions[0];
  if (!version) throw new Error(`No compatible version for ${project}`);
  await addMod(version);
}
for (const mod of ['sodium','lithium','ferrite-core']) await selectMod(mod);
await fs.writeFile(path.join(out,'manifest.json'), JSON.stringify(manifest,null,2));
console.log(`Bundled ${Object.keys(manifest.urls).length} local game files and ${manifest.mods.length} mods.`);
console.log(manifest.mods.map(x=>x.name).join('\n'));
