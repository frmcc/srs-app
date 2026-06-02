const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

content = content.replace(/mb-fluid-12/g, 'mb-6 md:mb-12');
content = content.replace(/gap-fluid-8/g, 'gap-4 md:gap-8');
content = content.replace(/p-fluid-8/g, 'p-4 md:p-8');
content = content.replace(/p-fluid-12-extreme/g, 'p-4 md:p-12');

fs.writeFileSync('src/app/page.tsx', content);
console.log("Reverted bogus fluid classes back to valid Tailwind responsive classes.");
