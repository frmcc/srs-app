import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL,
  authToken: process.env.TURSO_AUTH_TOKEN,
});

async function run() {
  try {
    const res = await client.execute("PRAGMA table_info(AppConfig);");
    console.log("AppConfig columns:");
    console.table(res.rows);
    
    const configs = await client.execute("SELECT * FROM AppConfig;");
    console.log("AppConfigs:");
    console.table(configs.rows);
    
  } catch (e) {
    console.error(e);
  }
}
run();
