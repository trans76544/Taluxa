const fs = require('fs');
let content = fs.readFileSync('src/shared/api/emby/library.ts', 'utf8');

content = content.replace(
  "IncludeItemTypes: 'Movie,Episode',",
  "IncludeItemTypes: 'Movie,Series',"
);

fs.writeFileSync('src/shared/api/emby/library.ts', content);
