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

  await page.evaluateOnNewDocument(() => {
    window.addEventListener('error', e => {
      console.log('UNCAUGHT ERROR:', e.message, e.filename, e.lineno);
    });
    window.addEventListener('unhandledrejection', e => {
      console.log('UNHANDLED REJECTION:', e.reason);
    });
  });

  await page.goto('http://localhost:3001/youtube', { waitUntil: 'networkidle2' });
  
  // Wait a bit just in case
  await new Promise(r => setTimeout(r, 2000));
  
  await browser.close();
})();
