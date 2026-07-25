const fs = require('fs');
const path = require('path');

const srcDir = path.join(__dirname, 'frontend/src');

function getAllFiles(dirPath, arrayOfFiles) {
  let files = fs.readdirSync(dirPath);
  arrayOfFiles = arrayOfFiles || [];
  files.forEach(function(file) {
    if (fs.statSync(dirPath + "/" + file).isDirectory()) {
      arrayOfFiles = getAllFiles(dirPath + "/" + file, arrayOfFiles);
    } else {
      if (file.endsWith('.tsx') || file.endsWith('.ts')) {
        arrayOfFiles.push(path.join(dirPath, "/", file));
      }
    }
  });
  return arrayOfFiles;
}

const files = getAllFiles(srcDir);
const keys = new Set();

files.forEach(file => {
  const content = fs.readFileSync(file, 'utf8');
  // Match t("...") or t('...')
  const regex = /t\(['"](.*?)['"]\)/g;
  let match;
  while ((match = regex.exec(content)) !== null) {
    if (match[1]) keys.add(match[1]);
  }
});

const langContext = fs.readFileSync(path.join(srcDir, 'LanguageContext.tsx'), 'utf8');
const dictRegex = /const dictionary: Record<string, string> = {([\s\S]*?)};/;
const dictMatch = dictRegex.exec(langContext);
let existingKeys = new Set();

if (dictMatch) {
  const dictStr = dictMatch[1];
  const keyRegex = /"([^"]+)":/g;
  let keyMatch;
  while ((keyMatch = keyRegex.exec(dictStr)) !== null) {
    existingKeys.add(keyMatch[1]);
  }
}

const missing = [];
for (let key of keys) {
  if (!existingKeys.has(key)) {
    missing.push(key);
  }
}

console.log(JSON.stringify(missing, null, 2));
