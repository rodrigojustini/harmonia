import { PrismaClient } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function main() {
  console.log('🌱 Iniciando seed do banco de dados...')

  // Criar usuário administrador
  const adminPassword = await bcrypt.hash('123456', 10)
  
  const admin = await prisma.user.upsert({
    where: { email: 'admin@harmonia.com' },
    update: {},
    create: {
      email: 'admin@harmonia.com',
      passwordHash: adminPassword,
      name: 'Administrador',
      role: 'leader',
      funcao: 'Líder de Louvor',
      ativo: true,
    },
  })

  // Criar usuário membro de exemplo
  const memberPassword = await bcrypt.hash('123456', 10)
  
  const member = await prisma.user.upsert({
    where: { email: 'membro@harmonia.com' },
    update: {},
    create: {
      email: 'membro@harmonia.com',
      passwordHash: memberPassword,
      name: 'João Silva',
      role: 'member',
      funcao: 'Cantor',
      ativo: true,
    },
  })

  // Criar membros de exemplo
  const membros = [
    {
      nome: 'Maria Santos',
      voz: 'Soprano',
      funcao: 'Cantora',
      aniversario: new Date('1985-08-22'),
    },
    {
      nome: 'Pedro Oliveira',
      voz: null,
      funcao: 'Guitarrista',
      aniversario: new Date('1992-12-03'),
    },
    {
      nome: 'Ana Costa',
      voz: 'Alto',
      funcao: 'Tecladista',
      aniversario: new Date('1988-03-17'),
    },
  ]

  for (const membro of membros) {
    await prisma.membro.create({
      data: membro,
    }).catch(() => {
      console.log(`Membro ${membro.nome} já existe`)
    })
  }

  // Criar músicas de exemplo
  const musicas = [
    {
      titulo: 'Reckless Love',
      tomOriginal: 'G',
      observacoes: 'Música de abertura favorita',
    },
    {
      titulo: 'Oceans',
      tomOriginal: 'D',
      observacoes: 'Para momentos de adoração',
    },
    {
      titulo: 'Way Maker',
      tomOriginal: 'Bb',
      observacoes: 'Música de resposta',
    },
    {
      titulo: 'Goodness of God',
      tomOriginal: 'C',
      observacoes: 'Testemunho',
    },
    {
      titulo: 'Great Are You Lord',
      tomOriginal: 'G',
      observacoes: 'Louvor congregacional',
    },
  ]

  for (const musica of musicas) {
    await prisma.musica.create({
      data: musica,
    }).catch(() => {
      console.log(`Música ${musica.titulo} já existe`)
    })
  }

  console.log('✅ Seed concluído!')
  console.log(`👑 Admin criado: ${admin.email}`)
  console.log(`👤 Membro criado: ${member.email}`)
  console.log(`🎵 ${musicas.length} músicas criadas`)
  console.log(`👥 ${membros.length} membros criados`)
  console.log('🔑 Senha padrão para todos: 123456')
}

main()
  .then(async () => {
    await prisma.$disconnect()
  })
  .catch(async (e) => {
    console.error(e)
    await prisma.$disconnect()
    process.exit(1)
  })