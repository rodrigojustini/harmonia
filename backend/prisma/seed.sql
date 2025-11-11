-- Inserir usuário administrador padrão
INSERT INTO "User" ("email", "passwordHash", "name", "role", "funcao", "ativo") VALUES 
('admin@harmonia.com', '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', 'Administrador', 'leader', 'Líder de Louvor', 1);

-- Inserir alguns membros de exemplo
INSERT INTO "Membro" ("nome", "voz", "funcao", "aniversario") VALUES 
('João Silva', 'Tenor', 'Cantor', '1990-05-15'),
('Maria Santos', 'Soprano', 'Cantora', '1985-08-22'),
('Pedro Oliveira', '', 'Guitarrista', '1992-12-03'),
('Ana Costa', 'Alto', 'Tecladista', '1988-03-17');

-- Inserir algumas músicas de exemplo
INSERT INTO "Musica" ("titulo", "tomOriginal", "observacoes") VALUES 
('Reckless Love', 'G', 'Música de abertura favorita'),
('Oceans', 'D', 'Para momentos de adoração'),
('Way Maker', 'Bb', 'Música de resposta'),
('Goodness of God', 'C', 'Testemunho'),
('Great Are You Lord', 'G', 'Louvor congregacional');