import fs from 'node:fs';
import path from 'node:path';
import * as ResEdit from 'resedit';

const [exePath, iconPath, version = '0.2.0'] = process.argv.slice(2);
if (!exePath || !iconPath) {
  console.error('uso: node scripts/set-windows-resources.mjs <exe> <ico> [versao]');
  process.exit(1);
}

const parts = version.split('.').map((part) => Number.parseInt(part, 10) || 0);
while (parts.length < 4) parts.push(0);

const executable = ResEdit.NtExecutable.from(fs.readFileSync(exePath), { ignoreCert: true });
const resources = ResEdit.NtExecutableResource.from(executable);
const iconFile = ResEdit.Data.IconFile.from(fs.readFileSync(iconPath));
const iconGroups = ResEdit.Resource.IconGroupEntry.fromEntries(resources.entries);
const iconGroupId = iconGroups[0]?.id ?? 1;

ResEdit.Resource.IconGroupEntry.replaceIconsForResource(
  resources.entries,
  iconGroupId,
  1033,
  iconFile.icons.map((icon) => icon.data)
);

const versionInfos = ResEdit.Resource.VersionInfo.fromEntries(resources.entries);
if (versionInfos.length > 0) {
  const info = versionInfos[0];
  info.setFileVersion(parts[0], parts[1], parts[2], parts[3], 1033);
  info.setProductVersion(parts[0], parts[1], parts[2], parts[3], 1033);
  info.setStringValues(
    { lang: 1033, codepage: 1200 },
    {
      FileDescription: 'Gerenciador de referências Cite',
      ProductName: 'Cite',
      CompanyName: 'Cite',
      LegalCopyright: `Copyright © ${new Date().getFullYear()} Cite`,
      FileVersion: version,
      ProductVersion: version,
      InternalName: 'Cite',
      OriginalFilename: 'Cite.exe'
    }
  );
  info.outputToResourceEntries(resources.entries);
}

resources.outputResource(executable);
const output = Buffer.from(executable.generate());
const tempPath = path.join(path.dirname(exePath), `${path.basename(exePath)}.resedit.tmp`);
fs.writeFileSync(tempPath, output);
fs.renameSync(tempPath, exePath);
console.log(`recursos do Windows atualizados: ${exePath}`);
