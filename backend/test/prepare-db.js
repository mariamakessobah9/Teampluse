/**
 * Recree la base de test avant chaque campagne.
 *
 * En JavaScript et non en TypeScript : ce script tourne avant ts-jest, sans
 * la chaine de compilation. Il ne cree que la base ; le schema est ensuite
 * pose par les migrations au demarrage de l'application, ce qui verifie au
 * passage qu'elles suffisent a partir de zero.
 */
require('dotenv/config');
const { Client } = require('pg');

const DB_NAME = process.env.TEST_DB_NAME || 'teampulse_e2e';

async function main() {
  const client = new Client({
    host: process.env.DB_HOST || 'localhost',
    port: Number(process.env.DB_PORT || 5432),
    user: process.env.DB_USERNAME || 'postgres',
    password: process.env.DB_PASSWORD || 'postgres',
    // On se connecte a `postgres` : impossible de supprimer une base depuis
    // une connexion ouverte sur elle-meme.
    database: 'postgres',
  });

  await client.connect();
  // Coupe les connexions restantes d'un precedent echec, sans quoi le DROP
  // reste bloque indefiniment.
  await client.query(
    `SELECT pg_terminate_backend(pid) FROM pg_stat_activity
     WHERE datname = $1 AND pid <> pg_backend_pid()`,
    [DB_NAME],
  );
  await client.query(`DROP DATABASE IF EXISTS "${DB_NAME}"`);
  await client.query(`CREATE DATABASE "${DB_NAME}"`);
  await client.end();

  console.log(`Base de test « ${DB_NAME} » recreee.`);
}

main().catch((err) => {
  console.error(
    `Preparation de la base de test impossible : ${err.message}\n` +
      'Verifiez que PostgreSQL tourne et que DB_USERNAME / DB_PASSWORD sont corrects.',
  );
  process.exit(1);
});
