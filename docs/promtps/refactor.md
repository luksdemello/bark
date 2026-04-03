Você é um engenheiro sênior especialista em Rust, Tauri v2, React e arquitetura de aplicações desktop.

Estou desenvolvendo um clipboard manager para macOS usando:
- Tauri v2 (Rust backend)
- React + TypeScript (frontend)
- SQLite com rusqlite
- tauri-plugin-clipboard

Quero refatorar o projeto para melhorar performance, organização e escalabilidade, SEM overengineering e SEM quebrar funcionalidades existentes.

### 🎯 OBJETIVO
Refatorar o código com foco em:
- arquitetura limpa
- separação de responsabilidades
- performance
- escalabilidade futura

---

# ⚠️ PROBLEMAS ATUAIS

1. Uso de `Mutex<Connection>` (rusqlite) pode virar gargalo
2. Processamento pesado (imagem + hash + thumbnail) roda no listener do clipboard
3. Deduplicação inconsistente:
   - texto: busca global
   - imagem: só compara último item
4. Falta endpoint eficiente (`get_item_by_id`)
5. Frontend usa polling (setInterval) ao invés de eventos
6. Lógica espalhada entre monitor, commands e db
7. Cleanup pode bloquear DB
8. Estrutura do banco limitada (sem hash, pin, busca)
9. Frontend monolítico (App.tsx concentra tudo)
10. Upload (drag and drop) não implementado

---

# ✅ O QUE VOCÊ DEVE FAZER

## 1. Backend (Rust / Tauri)

### Arquitetura
- Criar camada `use_cases/` (application layer)
- Commands devem apenas chamar use cases
- Monitor deve delegar processamento

### Banco de dados
- Adicionar coluna:
  - `hash TEXT UNIQUE`
  - `pinned INTEGER DEFAULT 0`
- Ajustar deduplicação para usar hash (texto e imagem)

### Performance
- Criar worker async para processamento de imagens:
  - fila (channel)
  - processamento fora do listener

### API
- Criar:
  - `get_item_by_id(id)`
- Evitar `get_items(0, 1000)`

### Cleanup
- Rodar em batch (LIMIT)
- Evitar locks longos

---

## 2. Frontend (React)

### Arquitetura
Separar em:
- `hooks/useClipboard.ts`
- `services/clipboardService.ts`
- `components/`

### Estado
- Remover polling (setInterval)
- Usar apenas eventos do Tauri:
  - `clipboard://new-item`

### Funcionalidades
- Implementar upload via drag and drop:
  - ler arquivos
  - enviar para backend
  - salvar no DB

---

## 3. Requisitos importantes

- NÃO reescrever tudo do zero
- Manter compatibilidade com o código atual
- Fazer mudanças incrementais
- Explicar cada decisão importante
- Mostrar código final sugerido (não só teoria)

---

# 📦 FORMATO DA RESPOSTA

Responda com:

1. 📁 Nova estrutura de pastas
2. 🧱 Código refatorado (principais arquivos)
3. ⚡ Melhorias de performance aplicadas
4. 🧠 Explicação das decisões
5. 🚀 Próximos passos opcionais

---

# 🚫 NÃO FAZER

- Não usar overengineering
- Não introduzir frameworks desnecessários
- Não complicar o projeto

---

Agora refatore com base nisso.