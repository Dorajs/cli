const chalk = require('chalk')
const readJson = require('read-package-json')
const fs = require('fs')
const path = require('path')

var ArgumentParser = require('argparse').ArgumentParser;
var parser = new ArgumentParser({
  version: '1.0.0',
  addHelp: true,
  description: '"Command line tool for building Dora addon"'
});

var commandParser = parser.addSubparsers({
  title: 'Command',
  dest: "command"
});

var packCommand = commandParser.addParser('pack', { addHelp: true });
packCommand.addArgument(
  ['-s', '--src'], {
    action: 'store',
    help: 'Source code directory path'
  }
);
packCommand.addArgument(
  ['-d', '--dist'], {
    action: 'store',
    help: 'Destination to store pack file'
  }
);

var repoCommand = commandParser.addParser('repo', { addHelp: true });
repoCommand.addArgument(
  ['-s', '--src'], {
    action: 'store',
    help: 'Source code path'
  }
);
repoCommand.addArgument(
  ['-d', '--dest'], {
    action: 'store',
    help: 'Destination to store repo files'
  }
);
repoCommand.addArgument(
  ['-u', '--url'], {
    action: 'store',
    help: 'The host url prefix that hosting the addon files'
  }
);
var args = parser.parseArgs();
if (args.command == 'pack') {
  pack(args)
} else if (args.command == 'repo') {
  repo(args)
}

async function pack(args) {
  let cwd = process.cwd()
  let src = path.resolve(cwd, args.src || cwd)
  let manifest = await readManifest(src)
  if (!manifest.uuid) {
    throw Error('Must special uuid in package.json')
  }
  let dest = path.resolve(cwd, args.dest || `./dist/${manifest.displayName}-${manifest.version}.dora`)
  let saveDir = path.resolve(dest, '..')
  if (!fs.existsSync(saveDir)) {
    fs.mkdirSync(saveDir, { recursive: true });
  }
  await build(src, dest)
  console.log(chalk.green('\nBUILD SUCCESS'))
}

async function build(src, dest) {
  const { execSync } = require('child_process');
  execSync(`yarn pack --cwd=${src} -f ${dest}`);
  console.log(`\nTarball: ${dest}`)
}

async function readManifest(srcDir) {
  let file = path.resolve(srcDir, "package.json")
  return new Promise(function(resolve, reject) {
    // readJson(filename, [logFunction=noop], [strict=false], cb)
    readJson(file, console.error, false, function(er, data) {
      if (er) {
        console.error(`An error occur when reading ${file}`)
        reject(er)
        return
      }
      resolve(data)
    });
  })
}

function deleteFolderRecursive(path) {
  if (fs.existsSync(path)) {
    fs.readdirSync(path).forEach(function(file, index) {
      var curPath = path + "/" + file;
      if (fs.lstatSync(curPath).isDirectory()) { // recurse
        deleteFolderRecursive(curPath);
      } else { // delete file
        fs.unlinkSync(curPath);
      }
    });
    fs.rmdirSync(path);
  }
}

function getFilesizeInBytes(filename) {
  const stats = fs.statSync(filename);
  const fileSizeInBytes = stats.size;
  return fileSizeInBytes;
}

async function repo(args) {
  let cwd = process.cwd()
  let src = path.resolve(cwd, args.src || cwd)
  let dest = path.resolve(cwd, args.dest || './dist')
  let url = args.url || '.'

  deleteFolderRecursive(dest)
  let promises = fs.readdirSync(src)
    .filter(file => !file.startsWith('.') &&
      file != 'node_modules' &&
      file != '.idea' &&
      file != 'dist' &&
      fs.lstatSync(path.resolve(src, file)).isDirectory())
    .map(async function(file) {
      let addonSrc = path.resolve(src, file)
      let manifest = await readManifest(addonSrc)
      if (!manifest.uuid) {
        throw Error("uuid must not be empty")
      }
      const saveDir = path.resolve(dest, `${manifest.uuid}/${manifest.version}`)
      if (!fs.existsSync(saveDir)) {
        fs.mkdirSync(saveDir, {
          recursive: true
        });
      }
      const tarballPath = path.resolve(saveDir, `${manifest.displayName}.dora`.replace(' ', '-'))
      await build(addonSrc, tarballPath)
      let iconPath = ''
      if (manifest.icon) {
        let iconSrc = path.resolve(addonSrc, manifest.icon)
        iconPath = path.resolve(saveDir, path.basename(iconSrc))
        fs.copyFileSync(iconSrc, iconPath)
      }
      return {
        displayName: manifest.displayName,
        uuid: manifest.uuid,
        description: manifest.description,
        version: manifest.version,
        author: manifest.author,
        size: getFilesizeInBytes(tarballPath),
        url: `${url}/${path.relative(dest, tarballPath)}`,
        icon: manifest.icon ? `${url}/${path.relative(dest, iconPath)}` : null
      }
    });

  return Promise.all(promises).then(function(all) {
    console.log(all)
    let json = JSON.stringify(all, null, '    ')
    const manifestFile = path.resolve(dest, `index.json`)
    fs.writeFileSync(manifestFile, json)
  })
}
