import { chromium } from 'playwright';
import * as fs from 'fs';
import * as path from 'path';

(async () => {
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1280, height: 800 },
  });
  const page = await context.newPage();
  
  // Navigate to local dev server. Assuming port 3000
  await page.goto('http://localhost:3000');
  
  // Ensure directory exists
  const dir = path.join(process.cwd(), 'docs/screenshots');
  if (!fs.existsSync(dir)){
      fs.mkdirSync(dir, { recursive: true });
  }

  // Take screenshot
  await page.screenshot({ path: path.join(dir, 'home-desktop-dark.png') });
  
  await browser.close();
  console.log('Screenshot captured successfully.');
})();
