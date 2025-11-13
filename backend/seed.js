import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
const prisma = new PrismaClient();

async function seed() {
  try {
    const adminHash = await bcrypt.hash('admin123', 10);
    const liderHash = await bcrypt.hash('lider123', 10);
    
    await prisma.user.upsert({
      where: { email: 'admin@harmonia.com' },
      update: {},
      create: {
        nome: 'Administrador',
        email: 'admin@harmonia.com',
        passwordHash: adminHash,
        role: 'leader'
      }
    });
    
    await prisma.user.upsert({
      where: { email: 'lider@harmonia.com' },
      update: {},
      create: {
        nome: 'Líder',
        email: 'lider@harmonia.com',
        passwordHash: liderHash,
        role: 'leader'
      }
    });
    
    console.log('✅ Usuários criados com sucesso!');
  } catch (error) {
    console.error('❌ Erro:', error.message);
  } finally {
    await prisma.$disconnect();
  }
}

seed();
