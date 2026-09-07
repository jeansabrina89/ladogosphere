// Regénère supabase/schema.sql : la structure complète du schéma public,
// sans aucune donnée. Même mode de connexion que la sauvegarde des données.
//
//   $env:SUPABASE_DB_URL = "postgresql://postgres.<ref>:<mot-de-passe>@...pooler.supabase.com:5432/postgres"
//   npm run backup:schema
import pg from "pg";
import { readFileSync, writeFileSync } from "node:fs";

const url = process.env.SUPABASE_DB_URL;
if (!url) {
  console.error(
    "Variable SUPABASE_DB_URL manquante. Definis-la avec la chaine de connexion Session pooler de Supabase (mot de passe inclus), puis relance.",
  );
  process.exit(1);
}

const requete = readFileSync(new URL("./schema-dump.sql", import.meta.url), "utf8");

const client = new pg.Client({ connectionString: url });
await client.connect();
const { rows } = await client.query(requete);
await client.end();

writeFileSync("supabase/schema.sql", rows[0].schema_sql, "utf8");
console.log("Termine : supabase/schema.sql");
