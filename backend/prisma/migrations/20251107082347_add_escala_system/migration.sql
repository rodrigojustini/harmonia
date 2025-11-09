-- CreateTable
CREATE TABLE "Escala" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "aprovada" BOOLEAN NOT NULL DEFAULT false,
    "criadaPor" INTEGER NOT NULL,
    "criadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Escala_criadaPor_fkey" FOREIGN KEY ("criadaPor") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EscalaMembro" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "escalaId" INTEGER NOT NULL,
    "userId" INTEGER NOT NULL,
    "data" DATETIME NOT NULL,
    "funcao" TEXT NOT NULL,
    CONSTRAINT "EscalaMembro_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "Escala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EscalaMembro_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "EscalaMusica" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "escalaId" INTEGER NOT NULL,
    "data" DATETIME NOT NULL,
    "titulo" TEXT NOT NULL,
    "tom" TEXT,
    "link" TEXT,
    "ordem" INTEGER NOT NULL DEFAULT 1,
    "adicionadoPor" INTEGER NOT NULL,
    "adicionadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EscalaMusica_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "Escala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "EscalaMusica_adicionadoPor_fkey" FOREIGN KEY ("adicionadoPor") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "TrocaEscala" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "escalaId" INTEGER NOT NULL,
    "solicitanteId" INTEGER NOT NULL,
    "receptorId" INTEGER NOT NULL,
    "data" DATETIME NOT NULL,
    "funcao" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pendente',
    "observacao" TEXT,
    "solicitadoEm" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "aceitoEm" DATETIME,
    "aprovadoEm" DATETIME,
    "aprovadoPor" INTEGER,
    CONSTRAINT "TrocaEscala_escalaId_fkey" FOREIGN KEY ("escalaId") REFERENCES "Escala" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrocaEscala_solicitanteId_fkey" FOREIGN KEY ("solicitanteId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrocaEscala_receptorId_fkey" FOREIGN KEY ("receptorId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
    CONSTRAINT "TrocaEscala_aprovadoPor_fkey" FOREIGN KEY ("aprovadoPor") REFERENCES "User" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "Historico" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "userId" INTEGER NOT NULL,
    "acao" TEXT NOT NULL,
    "detalhes" TEXT NOT NULL,
    "data" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Historico_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_User" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "role" TEXT NOT NULL DEFAULT 'member',
    "funcao" TEXT,
    "ativo" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_User" ("createdAt", "email", "id", "name", "passwordHash", "updatedAt") SELECT "createdAt", "email", "id", "name", "passwordHash", "updatedAt" FROM "User";
DROP TABLE "User";
ALTER TABLE "new_User" RENAME TO "User";
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE UNIQUE INDEX "Escala_mes_ano_key" ON "Escala"("mes", "ano");

-- CreateIndex
CREATE UNIQUE INDEX "EscalaMembro_escalaId_data_funcao_key" ON "EscalaMembro"("escalaId", "data", "funcao");
