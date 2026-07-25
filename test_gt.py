import asyncio
from playwright.async_api import async_playwright

async def main():
    async with async_playwright() as p:
        browser = await p.chromium.launch(headless=True)
        page = await browser.new_page()
        await page.goto("http://localhost:5173") # Assuming dev server is on 5173
        await page.wait_for_timeout(3000)
        
        # Check if goog-te-combo exists
        combo = await page.locator('select.goog-te-combo').count()
        print(f"goog-te-combo count: {combo}")
        
        await browser.close()

asyncio.run(main())
