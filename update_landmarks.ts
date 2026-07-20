import postgres from 'postgres';
import dotenv from 'dotenv';

dotenv.config({ override: true });

async function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function main() {
  // Connect using environment variables from .env
  const sql = postgres({
    host: process.env.DB_HOST,
    port: parseInt(process.env.DB_PORT || '6543', 10),
    database: process.env.DB_NAME,
    username: process.env.DB_USER,
    password: process.env.DB_PASSWORD,
    ssl: 'require',
  });

  const BATCH_SIZE = 50; // Fetch in small batches to be memory efficient
  const SLEEP_MS = 1200;  // Pause duration (1.2 seconds) to respect Nominatim's 1 request/second limit

  try {
    console.log('Connecting to database...');
    console.log('Starting landmark update process...');
    
    let totalProcessed = 0;
    
    while (true) {
      // 1. Fetch a batch of rows where landmark is NULL
      // Ordering by casemasterid ensures consistent processing order
      const rows = await sql`
        SELECT casemasterid, latitude, longitude 
        FROM public.casemaster 
        WHERE landmark IS NULL 
          AND latitude IS NOT NULL 
          AND longitude IS NOT NULL
        ORDER BY casemasterid ASC
        LIMIT ${BATCH_SIZE}
      `;

      if (rows.length === 0) {
        console.log('\nSuccess: No more rows to update!');
        break;
      }

      console.log(`\n--- Fetched next batch of ${rows.length} rows ---`);

      // 2. Process each row in the batch one-by-one
      for (const r of rows) {
        totalProcessed++;
        console.log(`[#${totalProcessed}] Updating casemasterid ${r.casemasterid} (lat: ${r.latitude}, lon: ${r.longitude})...`);
        
        try {
          // Update the row (which triggers public.update_landmark_fn() via set_landmark_trigger)
          await sql`
            UPDATE public.casemaster
            SET latitude = ${r.latitude}, longitude = ${r.longitude}
            WHERE casemasterid = ${r.casemasterid}
          `;
          console.log(`   -> Success`);
        } catch (updateErr: any) {
          console.error(`   -> Failed to update casemasterid ${r.casemasterid}:`, updateErr.message || updateErr);
        }

        // 3. Sleep to respect Nominatim rate limits
        await sleep(SLEEP_MS);
      }
    }
  } catch (err) {
    console.error('Fatal error during execution:', err);
  } finally {
    await sql.end();
    console.log('Database connection closed.');
  }
}

main();
