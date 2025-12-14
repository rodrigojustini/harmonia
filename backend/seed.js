import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function seed() {
  try {
    // Criar igrejas
    const igrejaVerbo = await prisma.igreja.upsert({
      where: { slug: 'verbo' },
      update: {},
      create: {
        nome: 'Igreja Verbo da Vida',
        slug: 'verbo',
        ativa: true,
        email: 'contato@verbo.com'
      }
    });

    const igrejaBatista = await prisma.igreja.upsert({
      where: { slug: 'batista' },
      update: {},
      create: {
        nome: 'Igreja Batista Central',
        slug: 'batista',
        ativa: true,
        email: 'contato@batista.com'
      }
    });

    const igrejaAssembleia = await prisma.igreja.upsert({
      where: { slug: 'assembleia' },
      update: {},
      create: {
        nome: 'Assembleia de Deus',
        slug: 'assembleia',
        ativa: true,
        email: 'contato@assembleia.com'
      }
    });

    console.log('✅ Igrejas criadas!');

    // Criar usuários admin para cada igreja
    const adminHash = await bcrypt.hash('admin123', 10);
    
    await prisma.user.upsert({
      where: { email: 'admin@verbo.com' },
      update: {},
      create: {
        name: 'Admin Verbo',
        email: 'admin@verbo.com',
        passwordHash: adminHash,
        role: 'leader',
        igrejaId: igrejaVerbo.id
      }
    });

    await prisma.user.upsert({
      where: { email: 'admin@batista.com' },
      update: {},
      create: {
        name: 'Admin Batista',
        email: 'admin@batista.com',
        passwordHash: adminHash,
        role: 'leader',
        igrejaId: igrejaBatista.id
      }
    });

    await prisma.user.upsert({
      where: { email: 'admin@assembleia.com' },
      update: {},
      create: {
        name: 'Admin Assembleia',
        email: 'admin@assembleia.com',
        passwordHash: adminHash,
        role: 'leader',
        igrejaId: igrejaAssembleia.id
      }
    });
    
    console.log('✅ Usuários admin criados com sucesso!');
    console.log('\n📋 Credenciais de acesso:');
    console.log('Igreja Verbo: admin@verbo.com / admin123');
    console.log('Igreja Batista: admin@batista.com / admin123');
    console.log('Assembleia de Deus: admin@assembleia.com / admin123');
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
