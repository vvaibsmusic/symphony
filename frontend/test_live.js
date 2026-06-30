const puppeteer = require('puppeteer');

(async () => {
  const browser = await puppeteer.launch();
  const page = await browser.newPage();
  
  page.on('pageerror', err => {
    console.log('PAGE ERROR:', err.toString());
  });
  
  page.on('console', msg => {
    console.log('CONSOLE:', msg.text());
  });

  await page.goto('https://vvaibsmusic-symphony.hf.space', { waitUntil: 'networkidle2' });
  await new Promise(r => setTimeout(r, 3000));
  await browser.close();
})();
