# Bark

<img src="src-tauri/icons/128x128@2x.png" alt="Bark icon" width="128" />

Um gerenciador de clipboard para macOS. Fica na barra de menus, monitora o que você copia e guarda um histórico pesquisável de textos e imagens. Também permite arrastar arquivos para fazer upload no Supabase e compartilhar via link.

## Funcionalidades

- Histórico de textos e imagens copiados
- Busca full-text no histórico
- Fixar itens importantes no topo
- Upload de arquivos via drag-and-drop com geração de link compartilhável
- Deduplicação por hash SHA256
- Limpeza automática de itens não usados em 24h
- Mascote animado com orelhas que reagem às ações
- Atalhos de teclado: `⌘K` (buscar), `⌘1-9` (copiar item), `↑↓` (navegar), `Enter` (copiar)

## Stack

- **Frontend:** React 19 + TypeScript + Vite
- **Desktop:** Tauri 2 (Rust)
- **Banco de dados:** SQLite (via rusqlite, armazenado localmente)
- **Storage:** Supabase (upload de arquivos)
- **Runtime:** Bun

## Pré-requisitos

- [Rust](https://www.rust-lang.org/tools/install)
- [Bun](https://bun.sh/)
- [Tauri CLI v2](https://tauri.app/start/prerequisites/)
- Conta no [Supabase](https://supabase.com/) (para upload de arquivos)

No macOS, instale as dependências do Xcode Command Line Tools se ainda não tiver:

```bash
xcode-select --install
```

## Configuração

**1. Clone o repositório:**

```bash
git clone <repo-url>
cd clipboard_widget
```

**2. Instale as dependências JavaScript:**

```bash
bun install
```

**3. Configure as variáveis de ambiente:**

```bash
cp .env.example .env
```

Edite o `.env` com suas credenciais do Supabase:

```env
VITE_SUPABASE_URL=https://seu-projeto.supabase.co
VITE_SUPABASE_ANON_KEY=sua-anon-key
```

**4. Configure o Supabase:**

No painel do Supabase, crie:
- Um bucket de storage chamado `bark-files`
- Uma tabela `files` com as colunas: `id`, `name`, `path`, `size`, `mime_type`, `expires_at`, `created_at`

## Rodando localmente

```bash
bun run tauri dev
```

Isso sobe o servidor Vite na porta 1420 e abre a janela do Tauri com hot-reload.

## Build

```bash
bun run tauri build
```

Gera o `.app` em `src-tauri/target/release/bundle/macos/`.

## Testes

```bash
bun run test
```

## Armazenamento local

Os dados ficam em:

- **Banco de dados:** `~/.config/bark/clipboard.db`
- **Imagens:** `~/.config/bark/images/`

## Estrutura do projeto

```
├── src/                  # Frontend React/TypeScript
│   ├── components/       # Componentes (Item, DropZone, Icons)
│   ├── hooks/            # Hooks (useClipboard, useSearch, useEars, useUpload)
│   ├── services/         # Wrappers dos comandos Tauri e integração Supabase
│   └── lib/              # Cliente Supabase
└── src-tauri/            # Backend Rust
    └── src/
        ├── db.rs         # Camada SQLite
        ├── commands.rs   # Comandos expostos ao frontend
        ├── monitor.rs    # Monitor de clipboard
        └── use_cases.rs  # Lógica de negócio
```
