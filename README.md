# fatura-split

<p align="center">
  <img src="https://img.shields.io/badge/React-18.x-61DAFB?style=for-the-badge&logo=react&logoColor=black" />
  <img src="https://img.shields.io/badge/TypeScript-5.x-3178C6?style=for-the-badge&logo=typescript&logoColor=white" />
  <img src="https://img.shields.io/badge/Vite-5.x-646CFF?style=for-the-badge&logo=vite&logoColor=white" />
  <img src="https://img.shields.io/badge/Tailwind-3.x-06B6D4?style=for-the-badge&logo=tailwindcss&logoColor=white" />
  <img src="https://img.shields.io/badge/Vitest-1.x-6E9F18?style=for-the-badge&logo=vitest&logoColor=white" />
</p>

> Aplicação web para importar a fatura do cartão Itaú em PDF, listar os lançamentos e dividir cada despesa entre várias pessoas — sem backend, sem cadastro, 100% no navegador.

---

## Índice

- [Sobre](#-sobre)
- [Funcionalidades](#-funcionalidades)
- [Arquitetura](#-arquitetura)
- [Tecnologias](#-tecnologias)
- [Como rodar](#-como-rodar)
- [Deploy](#-deploy)
- [Melhorias futuras](#-melhorias-futuras)
- [Contribuindo](#-contribuindo)
- [Licença](#-licença)

---

## Sobre

Dividir a fatura do cartão entre amigos ou familiares é uma tarefa manual e propensa a erros. O **fatura-split** resolve isso: basta importar o PDF da fatura do Itaú, atribuir cada lançamento às pessoas envolvidas e o app calcula automaticamente o quanto cada um deve pagar — tudo direto no navegador, sem nenhum dado saindo do seu dispositivo.

---

## Funcionalidades

- 📄 Importação e leitura de PDF da fatura direto no navegador
- 👥 Cadastro de pessoas para divisão das despesas
- ✂️ Divisão de cada lançamento por valor entre várias pessoas
- 🔄 Reaproveitamento de compras parceladas da fatura anterior
- ➕ Atribuição automática de valores negativos ao responsável configurado
- 📊 Resumo por pessoa com total acumulado
- 🖨️ Impressão ou geração de PDF do resumo final
- 💾 Persistência local via `localStorage` e `sessionStorage`
- 👤 Separação de dados por perfil local (acesso local ou visitante)
- 🔔 Feedback visual com toasts de sucesso, erro e informação

---

## Arquitetura

O projeto não possui backend. Todo o processamento acontece no navegador:

```
┌─────────────────────────────────────────────┐
│                  Usuário                    │
└─────────────────────┬───────────────────────┘
                      │
┌─────────────────────▼───────────────────────┐
│         React App (Vite + TS)               │
│                                             │
│  ┌─────────────┐   ┌─────────────────────┐  │
│  │ parseFatura │   │   faturaState.ts    │  │
│  │ (pdfjs)     │   │  (regras de negócio)│  │
│  └─────────────┘   └─────────────────────┘  │
│                                             │
│  ┌──────────────────────────────────────┐   │
│  │   localStorage / sessionStorage      │   │
│  │   (persistência local por perfil)    │   │
│  └──────────────────────────────────────┘   │
└─────────────────────────────────────────────┘
```

**Fluxo principal:**
1. Usuário entra com acesso local ou como visitante
2. Importa o PDF da fatura
3. Os lançamentos são extraídos e listados
4. Divide cada despesa entre as pessoas
5. O app soma os valores por pessoa
6. Imprime ou exporta o resumo final

### Perfis locais

| Perfil | Comportamento |
|---|---|
| **Acesso local** | Identificador + código de acesso, nomes predefinidos, dados em `localStorage` próprio |
| **Visitante** | Sem nomes predefinidos, armazenamento separado, não mistura dados com o perfil local |

### Estrutura de pastas

```
src/
├── components/
│   └── ui/
├── constants/
│   └── appProfiles.ts     # configuração dos perfis e persistência
├── lib/
│   ├── parseFatura.ts     # leitura e extração dos dados do PDF
│   └── divisao.ts         # lógica de divisão de despesas
├── pages/
│   ├── Index.tsx          # redirecionamento inicial
│   ├── login/
│   └── home/
└── utils/
    └── faturaState.ts     # regras de negócio do estado da fatura
```

---

## Tecnologias

### Base
| Tecnologia | Uso |
|---|---|
| React 18 | Interface |
| TypeScript | Tipagem estática |
| Vite | Bundler e dev server |

### UI
| Tecnologia | Uso |
|---|---|
| Tailwind CSS | Estilização |
| shadcn/ui + Radix UI | Componentes acessíveis |
| Lucide React | Ícones |
| Sonner | Toasts de feedback |

### Navegação e estado
| Tecnologia | Uso |
|---|---|
| React Router DOM | Roteamento |
| TanStack React Query | Gerenciamento de estado assíncrono |

### PDF e utilitários
| Tecnologia | Uso |
|---|---|
| `pdfjs-dist` | Leitura e parse do PDF |
| `zod` | Validação de dados |
| `clsx` + `tailwind-merge` | Composição de classes |

### Qualidade
| Tecnologia | Uso |
|---|---|
| Vitest + Testing Library | Testes unitários |
| ESLint | Linting |

---

## Como rodar

### Pré-requisitos

- Node.js 18+
- npm

### Instalação

```bash
# Clonar o repositório
git clone https://github.com/dholand4/fatura-split.git

# Entrar na pasta do projeto
cd fatura-split

# Instalar as dependências
npm install

# Iniciar o servidor de desenvolvimento
npm run dev
```

Acesse a URL exibida pelo Vite no terminal, normalmente `http://localhost:5173`.

### Scripts disponíveis

```bash
npm run dev          # servidor de desenvolvimento
npm run build        # build de produção
npm run build:dev    # build em modo development
npm run preview      # preview local do build
npm run lint         # verificação de código
npm run test         # testes
npm run test:watch   # testes em modo watch
```

---

## Melhorias futuras

- [ ] Exportar e importar backup dos dados locais
- [ ] Suporte a faturas de outros bancos
- [ ] Configuração visual dos perfis pela interface
- [ ] Permitir edição do responsável por valores negativos via UI
- [ ] Ampliar cobertura de testes no fluxo de divisão e parceladas

---
