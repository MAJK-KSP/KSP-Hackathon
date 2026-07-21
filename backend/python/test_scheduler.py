import asyncio
import sys
import os

# Add backend/python to sys.path so we can import services
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from services.scheduler_service import automate_morning_briefing

async def main():
    print("Testing automate_morning_briefing...")
    await automate_morning_briefing()
    print("Test complete.")

if __name__ == "__main__":
    asyncio.run(main())
