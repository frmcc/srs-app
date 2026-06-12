const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// Mapping for odd values to nearest 8px multiples (units of 2)
// 1 unit = 4px
const mapping = {
  '0.5': '0', // 2px -> 0px
  '1': '2',   // 4px -> 8px
  '1.5': '2', // 6px -> 8px
  '2.5': '2', // 10px -> 8px
  '3': '4',   // 12px -> 16px
  '3.5': '4', // 14px -> 16px
  '5': '6',   // 20px -> 24px
  '7': '8',   // 28px -> 32px
  '9': '8',   // 36px -> 32px
  '10': '12', // 40px -> 48px
  '11': '12', // 44px -> 48px
  '14': '16', // 56px -> 64px
};

const prefixes = ['p', 'px', 'py', 'pt', 'pb', 'pl', 'pr', 'm', 'mx', 'my', 'mt', 'mb', 'ml', 'mr', 'gap', 'w', 'h', 'top', 'bottom', 'left', 'right'];

let replaceCount = 0;

// Regex to find className attributes and extract the string
// It will match className="..." or className={`...`}
// We'll replace the full string and then do regex inside the replacements.

const updatedContent = content.replace(/(className\s*=\s*["'])(.*?)(["'])/g, (match, prefix, classStr, suffix) => {
  let newClassStr = classStr;
  
  Object.keys(mapping).forEach(oldVal => {
    const newVal = mapping[oldVal];
    prefixes.forEach(p => {
      // Create regex to match standalone classes like "p-3" or "mb-5"
      // \b doesn't work well with hyphens.
      // We look for (space or start) + prefix + '-' + oldVal + (space or end)
      const regex = new RegExp(`(^|\\s)${p}-${oldVal}(?=\\s|$)`, 'g');
      if (regex.test(newClassStr)) {
        newClassStr = newClassStr.replace(regex, `$1${p}-${newVal}`);
      }
    });
  });
  
  if (newClassStr !== classStr) {
    replaceCount++;
  }
  return `${prefix}${newClassStr}${suffix}`;
});

let finalContent = updatedContent.replace(/(className\s*=\s*\{`)(.*?)(`\})/gs, (match, prefix, classStr, suffix) => {
  let newClassStr = classStr;
  
  Object.keys(mapping).forEach(oldVal => {
    const newVal = mapping[oldVal];
    prefixes.forEach(p => {
      const regex = new RegExp(`(^|\\s)${p}-${oldVal}(?=\\s|$)`, 'g');
      if (regex.test(newClassStr)) {
        newClassStr = newClassStr.replace(regex, `$1${p}-${newVal}`);
      }
    });
  });
  
  if (newClassStr !== classStr) {
    replaceCount++;
  }
  return `${prefix}${newClassStr}${suffix}`;
});


fs.writeFileSync('src/app/page.tsx', finalContent);
console.log(`Updated grid spacing in ${replaceCount} className strings.`);
