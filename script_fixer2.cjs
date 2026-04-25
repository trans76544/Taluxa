const fs = require('fs');
let content = fs.readFileSync('src/renderer/app/router.tsx', 'utf8');

// fix imports
content = content.replace(
  "import { PlayerPage } from '@renderer/features/player/PlayerPage';",
  "import { PlayerPage } from '@renderer/features/player/PlayerPage';\nimport { ItemDetailsPage } from '@renderer/features/library/ItemDetailsPage';"
);

// fix typescript errors
content = content.replace(/currentSession\.userId/g, "currentSession!.userId");
content = content.replace(/currentSession\.accessToken/g, "currentSession!.accessToken");

fs.writeFileSync('src/renderer/app/router.tsx', content);
