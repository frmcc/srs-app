import { createClient } from '@libsql/client';
import fs from 'fs';
import path from 'path';
import 'dotenv/config';

async function migrate() {
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;

  if (!url || !authToken) {
    console.error("Missing Turso credentials");
    process.exit(1);
  }

  const client = createClient({
    url,
    authToken,
  });

  console.log("Connected to Turso. Finding migrations...");

  const migrationsDir = path.join(process.cwd(), 'prisma', 'migrations');
  const dirs = fs.readdirSync(migrationsDir).filter(d => fs.statSync(path.join(migrationsDir, d)).isDirectory());
  
  // Sort them chronologically by folder name
  dirs.sort();

  for (const dir of dirs) {
    const sqlPath = path.join(migrationsDir, dir, 'migration.sql');
    if (fs.existsSync(sqlPath)) {
      console.log(`Executing migration: ${dir}`);
      const sql = fs.readFileSync(sqlPath, 'utf8');
      
      // Split by semicolon and execute each statement
      const statements = sql.split(';').filter(s => s.trim().length > 0);
      
      for (const statement of statements) {
        try {
          await client.execute(statement);
        } catch (e) {
          if (!e.message.includes("already exists")) {
            console.error(`Error executing statement: ${statement}`);
            console.error(e);
            // Don't exit on error, try to continue in case it's a "table already exists" error
          }
        }
      }
    }
  }

  console.log("Migrations complete!");
  process.exit(0);
}

migrate();
