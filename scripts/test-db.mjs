import { createClient } from "@libsql/client";

const client = createClient({
  url: process.env.TURSO_DATABASE_URL || "libsql://tutorsrshost-frmcc13.aws-eu-west-1.turso.io",
  authToken: process.env.TURSO_AUTH_TOKEN || "eyJhbGciOiJFZERTQSIsInR5cCI6IkpXVCJ9.eyJhIjoicnciLCJpYXQiOjE3ODAyMzAwODMsImlkIjoiMDE5ZTdkZmEtZjAwMS03YzExLTkxNmYtNTNhYzRlNmEwNGU5IiwicmlkIjoiYjQwYjk1MGYtMjQwYy00NWE0LWFiMGEtNWYwMThkNGIzZTk2In0.tgfoTJP4FPyLzuq2mWXmowMNgVExCotqoiB4cJuLSeKwdeNr4pPjnL7dtBiX0AgBZwlXd8jgP-5-qVYdtMXjCw",
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
