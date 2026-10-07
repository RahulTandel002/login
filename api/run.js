const { chromium } = require('playwright');
// const chromiumBinary = require('@sparticuz/chromium');
const path = require('path');


module.exports = async (req, res) => {
    let browser;
    try {
        // const chromiumBinary = await import('@sparticuz/chromium')
        // const chromiumData = chromiumBinary.default;
        browser = await chromium.launch({
            headless: true,
            // args: chromiumData.args,
            // executablePath: await chromiumData.executablePath(),
        });

        const context = await browser.newContext({
            viewport: {
                width: 1920,
                height: 1080
            }
        });

        const page = await context.newPage();

        await page.goto('https://veenaworld.peoplestrong.com/altLogin.jsf', {waitUntil: 'networkidle'});
        await page.waitForTimeout(5000);

        await page.locator('[id="loginForm:username12"]').click();
        await page.locator('[id="loginForm:username12"]').fill(process.env.USER);

        await page.locator('[id="loginForm:username12"]').press('Tab');

        await page.locator('[id="loginForm:password"]').fill(process.env.PASS);

        await page.getByRole('button', { name: 'Login' }).click();

        await page.waitForTimeout(10000);

        await page.goto('https://veenaworld.peoplestrong.com/oneweb/#/home');

        await page.waitForTimeout(10000);

        console.log('taking screenshot')

        await page.screenshot({path: 'screenshot.png'})
      
        await page.mouse.click(1000, 188);
  
        await page.waitForTimeout(5000);
        console.log('Playwright execution completed successfully');

        await page.screenshot({path: 'result.png'})
        res.statusCode = 200;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            success: true,
            message: 'Playwright execution completed successfully'
        }));

    } catch (error) {
        console.error(error);

        res.statusCode = 404;
        res.setHeader('Content-Type', 'application/json');
        res.end(JSON.stringify({
            error: 'Not found'
        }));

    } finally {
        if (browser) {
            await browser.close();
        }
    }
};
