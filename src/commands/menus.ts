// Builds the menus made from the command list (src/commands/registry.ts) into the page. Imported
// first by main.ts, so they are there before anything looks for their items.

import { INSERT_MENU, renderMenu } from './registry';

const insert = document.getElementById('insert-menu');
if (insert && !insert.querySelector('[data-cmd]')) renderMenu(insert, INSERT_MENU);
