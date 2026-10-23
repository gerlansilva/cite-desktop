const { execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..');
const pkg = require(path.join(root, 'package.json'));
const unpacked = path.join(root, 'dist', 'win-unpacked');
const exe = path.join(unpacked, 'Cite.exe');
const icon = path.join(root, 'build', 'icon.ico');
const script = path.join(root, 'scripts', 'windows-installer.nsi');
const output = path.join(root, 'dist', `Cite-Setup-${pkg.version}.exe`);
const npx = process.platform === 'win32' ? 'npx.cmd' : 'npx';

function run(command, args, options = {}) {
  console.log(`\n$ ${command} ${args.join(' ')}`);
  execFileSync(command, args, { cwd: root, stdio: 'inherit', ...options });
}

run(npx, [
  'electron-builder',
  '--win',
  'dir',
  '--x64',
  '-c.win.signAndEditExecutable=false'
]);

if (!fs.existsSync(exe)) throw new Error(`executável não encontrado: ${exe}`);
run(process.execPath, [
  path.join(root, 'scripts', 'set-windows-resources.mjs'),
  exe,
  icon,
  pkg.version
]);

const makensis = process.env.MAKENSIS || 'makensis';
try {
  run(makensis, [
    `-DROOT=${unpacked}`,
    `-DICON=${icon}`,
    `-DOUT=${output}`,
    `-DAPP_VERSION=${pkg.version}`,
    script
  ]);
} catch (error) {
  console.error(
    '\nNão foi possível executar o makensis. No macOS, instale com: brew install makensis'
  );
  throw error;
}

if (!fs.existsSync(output)) throw new Error(`instalador não encontrado: ${output}`);
const size = (fs.statSync(output).size / 1024 / 1024).toFixed(1);
console.log(`\nInstalador Windows: ${output} (${size} MB)`);
