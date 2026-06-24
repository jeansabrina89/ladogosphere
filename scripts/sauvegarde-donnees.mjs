import pg from "pg";
import { to as copyTo } from "pg-copy-streams";
import { createWriteStream, mkdirSync } from "node:fs";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error("Variable SUPABASE_DB_URL manquante. Definis-la avec la chaine de connexion Session pooler de Supabase (mot de passe inclus), puis relance.");
  process.exit(1);
}

const ts = new Date().toISOString().slice(0, 16).replace(/[-:T]/g, "").replace(/(\d{8})(\d{4})/, "$1-$2");
mkdirSync("backups", { recursive: true });
const fichier = `backups/donnees-${ts}.sql`;
const out = createWriteStream(fichier);

const client = new pg.Client({ connectionString: url });
await client.connect();
out.write("-- Sauvegarde des donnees (data-only) - " + new Date().toISOString() + "\n");
out.write("SET session_replication_role = replica;\n");

const { rows: tables } = await client.query(
  "select tablename from pg_tables where schemaname = 'public' order by tablename"
);
for (const { tablename } of tables) {
  out.write(`\n-- ${tablename}\n`);
  out.write(`COPY public."${tablename}" FROM stdin;\n`);
  await new Promise((resolve, reject) => {
    const stream = client.query(copyTo(`COPY public."${tablename}" TO STDOUT`));
    stream.on("error", reject);
    stream.on("end", resolve);
    stream.pipe(out, { end: false });
  });
  out.write("\\.\n");
}
out.write("\nSET session_replication_role = DEFAULT;\n");
out.end();
await client.end();
console.log("Termine : " + fichier);
