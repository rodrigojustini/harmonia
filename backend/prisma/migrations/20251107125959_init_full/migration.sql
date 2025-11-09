/*
  Warnings:

  - You are about to drop the column `criadoEm` on the `Escala` table. All the data in the column will be lost.
  - Added the required column `updatedAt` to the `Escala` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Escala" (
    "id" INTEGER NOT NULL PRIMARY KEY AUTOINCREMENT,
    "mes" INTEGER NOT NULL,
    "ano" INTEGER NOT NULL,
    "aprovada" BOOLEAN NOT NULL DEFAULT false,
    "criadaPor" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "Escala_criadaPor_fkey" FOREIGN KEY ("criadaPor") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_Escala" ("ano", "aprovada", "criadaPor", "id", "mes") SELECT "ano", "aprovada", "criadaPor", "id", "mes" FROM "Escala";
DROP TABLE "Escala";
ALTER TABLE "new_Escala" RENAME TO "Escala";
CREATE UNIQUE INDEX "Escala_mes_ano_key" ON "Escala"("mes", "ano");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
