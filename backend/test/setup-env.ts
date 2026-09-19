/**
 * Environnement des tests d'integration.
 *
 * Charge avant l'application, pour la faire pointer sur une base jetable :
 * les tests creent et suppriment des comptes, ils ne doivent jamais toucher
 * la base de developpement.
 */
process.env.DB_NAME = process.env.TEST_DB_NAME ?? 'teampulse_e2e';
delete process.env.DATABASE_URL;

process.env.DB_HOST = process.env.DB_HOST ?? 'localhost';
process.env.DB_PORT = process.env.DB_PORT ?? '5432';
process.env.DB_USERNAME = process.env.DB_USERNAME ?? 'postgres';
process.env.DB_PASSWORD = process.env.DB_PASSWORD ?? 'postgres';

// Le schema est cree par les migrations, comme en production : c'est aussi
// une facon de verifier qu'elles suffisent a monter une base partant de zero.
process.env.DB_SYNCHRONIZE = 'false';

// Sans cela, la troisieme creation de compte se ferait limiter : le
// limiteur de debit n'est pas l'objet de ces tests.
process.env.THROTTLE_DISABLED = 'true';

process.env.JWT_SECRET = 'secret-de-test-uniquement';
process.env.JWT_EXPIRATION = '1h';

// Neutralise le transport e-mail. On affecte une chaine vide plutot que de
// supprimer les cles : ConfigModule charge `.env` ensuite, et dotenv ne
// remplace que les variables absentes. Sans cela les tests enverraient de
// vrais messages via le SMTP Gmail du poste.
process.env.BREVO_API_KEY = '';
process.env.SENDGRID_API_KEY = '';
process.env.MAIL_HOST = '';
process.env.MAIL_USER = '';
process.env.MAIL_PASS = '';
process.env.REDIS_URL = '';
