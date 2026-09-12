# Agenda de Pagamentos 2.0

Este repositório está sendo construído como um monorepo para um sistema financeiro com arquitetura moderna: web, mobile e API compartilhando o mesmo banco de dados central.

A ideia é desenvolver um projeto realista e estudável, começando por um MVP funcional de controle financeiro, com foco em clareza didática e evolução gradual.

## Objetivo do projeto

Construir uma aplicação para controlar:
- receitas;
- despesas;
- categorias;
- saldo geral;
- histórico de movimentações;
- dashboard simples.

A arquitetura pensada é:

- App mobile: acesso rápido e prático para o usuário no celular.
- Web: painel administrativo e dashboard para acompanhamento.
- API: centraliza regras de negócio e acesso ao banco.
- Banco de dados: armazena todas as informações de forma única.

## Arquitetura proposta

```text
[ App Mobile ] ---> [ API REST ] ---> [ Banco de Dados ]
      ^                  ^
      |                  |
[ Web App ] -----------/
```

Essa é a arquitetura de um sistema multiplataforma moderno, onde mobile e web enxergam os mesmos dados por meio da mesma API.

## Tecnologias usadas

- React + Vite para a web
- React Native + Expo para o mobile
- Node.js + Express para a API
- TypeScript em todo o projeto
- PostgreSQL como banco de dados em uma próxima etapa
- Prisma como ORM em uma etapa posterior

## Estrutura do monorepo

```text
A-new-project/
├── apps/
│   ├── api/
│   │   ├── src/
│   │   ├── package.json
│   │   └── tsconfig.json
│   ├── mobile/
│   │   ├── App.tsx
│   │   ├── app.json
│   │   ├── package.json
│   │   └── tsconfig.json
│   └── web/
│       ├── src/
│       ├── index.html
│       ├── package.json
│       ├── tsconfig.json
│       └── vite.config.ts
├── packages/
│   └── shared/
│       ├── src/
│       ├── package.json
│       └── tsconfig.json
├── .gitignore
├── package.json
├── README.md
└── node_modules/
```

## Como o sistema funciona hoje

A estrutura atual já contempla:
- servidor API em Express;
- web app com dashboard financeiro simples;
- mobile app com tela inicial de demonstração;
- pacote compartilhado com tipos centrais;
- comunicação da web com a API usando proxy do Vite.

### Fluxo de funcionamento

1. O usuário acessa a web ou o mobile.
2. A interface envia dados para a API.
3. A API recebe, valida e salva a movimentação.
4. O sistema calcula receitas, despesas e saldo.
5. O dashboard atualiza a tela com os valores.

## Como rodar o projeto

Na raiz do projeto:

```bash
npm install
npm run dev:api
```

Em outro terminal:

```bash
npm run dev:web
```

Para o mobile:

```bash
npm run dev:mobile
```

Se estiver usando o Expo no Ubuntu, você pode abrir no app Expo Go no seu celular conectado na mesma rede Wi‑Fi.

## Verificação de build

A validação já foi feita com sucesso:

```bash
npm run build
```

Resultado verificado: a web compilou corretamente e a API compilou sem erros.

## MVP atual

A aplicação já inclui um MVP funcional de controle financeiro com:
- cadastro de transações;
- classificação por tipo (receita/despesa);
- cálculo de saldo;
- lista de movimentações;
- painel resumido.

## Etapa 1: autenticação de usuários

A primeira etapa do desenvolvimento foi a implementação de autenticação básica com token JWT.

### O que foi adicionado

- rota de registro em `/api/auth/register`;
- rota de login em `/api/auth/login`;
- middleware de autenticação para proteger rotas sensíveis;
- armazenamento do token no navegador web;
- tela de login e registro na interface web;
- proteção das rotas de transações e resumo financeiro.

### Como funciona internamente

1. O usuário envia e-mail e senha para a API.
2. A API valida as credenciais.
3. A API gera um token JWT com os dados do usuário.
4. O frontend salva esse token no `localStorage`.
5. Cada requisição posterior inclui o token no header `Authorization`.
6. O backend valida o token e permite ou nega o acesso.

### Importante

Esse é um passo essencial porque, sem autenticação, qualquer pessoa poderia acessar e alterar os dados financeiros.

### Credenciais de teste

Para a etapa atual, o login usa um usuário demo:
- e-mail: `demo@financapp.com`
- senha: `123456`

## Etapa 2: persistência real em banco local

A segunda etapa do desenvolvimento foi trocar o armazenamento em memória por um banco de dados real.

### O que foi adicionado

- banco SQLite local em `apps/api/data/finance.db`;
- tabela `users` para armazenar usuários autenticados;
- tabela `transactions` para salvar receitas e despesas;
- criação automática do esquema na inicialização da API;
- login e registro com credenciais validadas contra o banco;
- leitura e cálculo de resumo usando dados persistidos.

### Como funciona internamente

1. A API inicia e cria as tabelas necessárias se ainda não existirem.
2. O registro usa uma senha convertida em hash SHA-256 antes de salvar.
3. O login compara o hash da senha informada com o valor salvo no banco.
4. Cada transação nova é persistida associada ao usuário autenticado.
5. O dashboard lê as movimentações diretamente do banco em vez de arrays temporários.

### Vantagem desta etapa

Agora a aplicação deixa de depender de dados efêmeros em memória. Isso é o primeiro passo concreto para:

- sincronização entre web e mobile;
- reutilização dos mesmos dados entre clientes;
- manutenção do histórico real do usuário;
- evolução para PostgreSQL/Prisma em uma etapa futura.

## Etapa 3: mobile com sincronização real

A terceira etapa do desenvolvimento foi conectar o app mobile à mesma API que a web usa, mantendo o mesmo fluxo de autenticação e compartilhando os mesmos dados do backend.

### O que foi adicionado

- autenticação no app mobile usando e-mail e senha;
- armazenamento do token em `AsyncStorage`;
- carregamento do dashboard móvel pela API REST;
- listagem de transações diretamente do banco central;
- botão de logout e manutenção da sessão local;
- base para sincronização real entre web e mobile.

### Como funciona internamente

1. O app mobile salva o token recebido pela API.
2. Em seguida, faz requisições para `/api/me`, `/api/transactions` e `/api/summary`.
3. O backend valida o token e responde com os dados do usuário e do banco.
4. A interface mobile atualiza o saldo e o histórico em tempo real.
5. Qualquer transação feita pelo web ou mobile passa pela mesma API, então a lógica fica centralizada.

### Como testar no iPhone

No ambiente de desenvolvimento local, use o Expo Go no celular com a mesma rede Wi‑Fi do computador.

1. inicie a API:
   ```bash
   npm run dev:api
   ```
2. inicie o app mobile:
   ```bash
   npm run dev:mobile
   ```
3. no Expo Go, escaneie o QR code.
4. se o celular não conseguir acessar `localhost`, substitua a constante `API_BASE_URL` em `apps/mobile/App.tsx` pelo IP da máquina no exemplo:
   ```ts
   const API_BASE_URL = 'http://192.168.0.15:3001';
   ```
5. o mesmo esquema vale para testes em iPhone real, usando a mesma rede wi‑fi.

### Importante sobre iOS

Para publicação na App Store, o build oficial de iOS ainda exige macOS + Xcode. Mas para desenvolvimento e testes reais, o fluxo com Expo Go em iPhone funciona bem em rede local.

## Próximos passos do projeto

A evolução planejada é:

1. autenticação de usuários;
2. persistência em banco PostgreSQL ou SQLite local;
3. CRUD completo de categorias;
4. relatórios mensais;
5. filtro por período;
6. dashboard com gráficos;
7. exportação de dados;
8. sincronização mobile + web;
9. deploy em produção.

## Aprendizado recomendado

Se você está começando, a sequência ideal é:

1. HTML, CSS e JavaScript
2. TypeScript
3. React
4. Node.js e API REST
5. React Native + Expo
6. Banco de dados
7. Deploy e autenticação

## Observações importantes

Este projeto foi montado para ser didático. A lógica foi estruturada de forma clara para que você possa estudar cada parte separadamente.

A ideia não é apenas criar um app rápido, mas construir uma base sólida para aprender arquitetura de software real, com organização, manutenção e evolução.

## Como prosseguir

Nos próximos passos, vamos continuar o projeto em etapas:

- etapa 1: autenticação de usuários;
- etapa 2: PostgreSQL e Prisma;
- etapa 3: relatórios e dashboard avançado;
- etapa 4: mobile com sincronização real;
- etapa 5: deploy e produção.

Este README servirá como guia de estudo e documentação da evolução do projeto.

## Acesso administrativo

Na tela inicial da web, selecione **Acesso administrador**. As credenciais iniciais são:

```text
E-mail: admin@financeapp.local
Senha: admin123456
```

Troque-as antes de expor a aplicação. O arquivo local [apps/api/admin.local.json](apps/api/admin.local.json) controla essas credenciais e não é enviado ao Git. Edite os campos `email` e `password`, salve e reinicie a API para aplicar a alteração.

O administrador pode consultar todos os usuários e transações e alterar o e-mail ou a senha de qualquer usuário no painel administrativo. Usuários comuns não possuem acesso a essa base de dados.

## Acesso fora da rede local

O app pode ser usado tanto na rede local quanto fora de casa pelo 5G. Com o computador ligado, a API precisa ter uma URL HTTPS pública para o modo externo. A alternativa prática para manter o servidor nesta máquina é o Cloudflare Tunnel, que não requer abrir portas no roteador.

### Modo local

O arquivo [apps/mobile/.env](apps/mobile/.env) já está configurado para a rede local. Inicie a API e o Expo normalmente:

```bash
npm run dev:api
npm run dev:mobile
```

O telefone deve estar no mesmo Wi-Fi que o computador.

### Modo remoto pelo 5G

1. Instale e autentique o `cloudflared` na máquina do servidor.
2. Com a API em execução na porta `3001`, abra o túnel: `npm run dev:api:tunnel`.
3. Copie a URL HTTPS exibida, como `https://exemplo.trycloudflare.com`.
4. Troque `EXPO_PUBLIC_API_URL` em [apps/mobile/.env](apps/mobile/.env) pela URL do túnel.
5. Inicie o Expo em modo remoto: `npm run dev:mobile:tunnel`.

```env
EXPO_PUBLIC_API_URL=https://exemplo.trycloudflare.com
```

Para uso contínuo, prefira uma URL fixa configurada no Cloudflare Tunnel ou publique API e banco em um provedor. O túnel rápido muda de endereço quando é reiniciado. Não exponha diretamente a porta `3001` na internet: use HTTPS, um domínio/túnel e um `JWT_SECRET` forte.

