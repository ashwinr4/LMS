import pg from 'pg';

const passwords = ['postgres', 'root', 'admin', 'password', '123456', 'Postgres@123', ''];

async function testConnections() {
  for (const pw of passwords) {
    const connStr = `postgresql://postgres:${pw}@localhost:5432/postgres`;
    const client = new pg.Client({ connectionString: connStr });
    try {
      await client.connect();
      console.log(`SUCCESS: Connected to PostgreSQL with password: "${pw}"`);
      await client.end();
      return pw;
    } catch (e) {
      console.log(`Failed with password "${pw}": ${e.message}`);
    }
  }
}

testConnections();
