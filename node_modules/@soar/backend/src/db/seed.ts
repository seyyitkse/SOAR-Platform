import bcrypt from 'bcryptjs';
import { getPool } from './pool';

async function seed(): Promise<void> {
  const pool = getPool();
  const client = await pool.connect();

  try {
    // super_admin rolünün id'sini al
    const { rows: roles } = await client.query(
      "SELECT id FROM roles WHERE name = 'super_admin'"
    );
    if (roles.length === 0) {
      throw new Error('Roller bulunamadı. Önce migration çalıştırın.');
    }
    const superAdminRoleId = roles[0].id;

    // Admin kullanıcısını oluştur (zaten varsa atla)
    const passwordHash = await bcrypt.hash('Admin@2024!', 12);

    await client.query(`
      INSERT INTO users (username, email, password_hash, role_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['admin', 'admin@soar.local', passwordHash, superAdminRoleId]);

    // c_level rolünde örnek kullanıcı
    const { rows: cLevelRoles } = await client.query(
      "SELECT id FROM roles WHERE name = 'c_level'"
    );
    const cLevelPasswordHash = await bcrypt.hash('Manager@2024!', 12);
    await client.query(`
      INSERT INTO users (username, email, password_hash, role_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['mehmet.bey', 'mehmet@soar.local', cLevelPasswordHash, cLevelRoles[0].id]);

    // analyst rolünde örnek kullanıcı
    const { rows: analystRoles } = await client.query(
      "SELECT id FROM roles WHERE name = 'analyst'"
    );
    const analystPasswordHash = await bcrypt.hash('Analyst@2024!', 12);
    await client.query(`
      INSERT INTO users (username, email, password_hash, role_id)
      VALUES ($1, $2, $3, $4)
      ON CONFLICT (email) DO NOTHING
    `, ['analyst1', 'analyst@soar.local', analystPasswordHash, analystRoles[0].id]);

    console.log('✅ Seed tamamlandı!');
    console.log('\n📋 Varsayılan kullanıcılar:');
    console.log('   admin / Admin@2024! (Super Admin)');
    console.log('   mehmet.bey / Manager@2024! (C-Level)');
    console.log('   analyst1 / Analyst@2024! (Analist)');
    console.log('\n⚠️  Üretim ortamında bu şifreleri değiştirin!');
  } finally {
    client.release();
    await pool.end();
  }
}

seed().catch(err => {
  console.error('❌ Seed hatası:', err);
  process.exit(1);
});
