# AGENTS.md — APFiscal

## Objetivo do projeto

APFiscal é um sistema fiscal em produção/desenvolvimento avançado. O código existente contém regras de negócio importantes e deve ser tratado como sistema legado funcional durante a modernização.

## Regra principal

Preserve comportamento existente.

Nunca remova ou simplifique uma funcionalidade apenas para facilitar uma refatoração.

Antes de alterar qualquer regra de NF-e, XML, vínculo de produto, rateio, aprovação, manifestação ou integração ERP/TOTVS, leia a implementação atual e preserve seus casos de negócio.

## Git Safety

O working tree atual é a fonte da verdade.

É proibido executar operações destrutivas como:

```bash
git reset --hard
git checkout .
git clean -fd
git clean -fdx
```

Não descarte mudanças existentes.

Não reescreva histórico.

Não force push.

## Arquitetura alvo

```text
apps/web = Next.js App Router
apps/api = NestJS
packages/shared = tipos/contratos compartilháveis
Supabase = autenticação, banco e storage
schema de domínio = apfiscal
```

O frontend público deve ficar em:

```text
https://apfiscal.aptechinfo.com.br:75
```

A API não possui domínio público próprio.

Chamadas do browser:

```text
/backend/*
```

Next encaminha internamente para:

```text
apfiscal-api:3001
```

## Supabase

`auth.users` pertence ao Supabase Auth e não deve ser alterado ou substituído.

A aplicação utiliza:

```text
apfiscal.users
```

como tabela de usuários de domínio, ligada 1:1 ao Auth.

Não usar metadata editável pelo usuário para autorização.

Nunca expor service role, secret key, database password ou chave de criptografia no frontend.

## Autorização

Permissões devem ser verificadas no frontend E backend.

Esconder menu não constitui segurança.

Toda operação protegida precisa de autorização server-side.

Respeitar:

```text
organization
company
access profile
permission
```

## NF-e

Providers:

```text
NFeWizard = padrão
API APFiscal = fallback
```

Todo provider deve alimentar o MESMO modelo canônico de documento fiscal.

Nunca criar domínios independentes para notas APFiscal e NFeWizard.

## Distribuição DF-e

Uma empresa/CNPJ só pode possuir uma sincronização ativa por vez.

Providers compartilham:

```text
last_nsu
cooldown
lock
estado da distribuição
```

Nunca consultar APFiscal e NFeWizard simultaneamente para o mesmo CNPJ.

Tratar explicitamente respostas SEFAZ como `137` e `656`.

Não transformar erro fiscal em retry infinito.

## Regras críticas que não podem regredir

Preservar:

```text
importação XML
fiscal_documents
fiscal_document_items
fornecedor
produtos
produtos_fornecedores
sugestão de vínculos
vínculo manual
criação de produto durante vínculo
classificação
rateio por centro de custo
plano de contas
local de estoque
tipo de compra
aprovação
status da NF-e
histórico
manifestação
integração TOTVS
bloqueio após integração TOTVS
monitoramento
notificações
```

Em particular, nunca substituir o sistema atual de sugestão/vínculo de produtos por um simples seletor.

## Certificados

PFX e senha são secrets.

Nunca:

```text
logar
retornar ao browser
armazenar senha plaintext
commitar em Git
colocar em NEXT_PUBLIC_*
```

Arquivos temporários de certificado devem ser eliminados em `finally`.

## Mudanças de banco

Antes de migration:

1. inspecionar banco real;
2. comparar com migrations;
3. identificar drift;
4. preservar dados;
5. preservar FK/index/function/trigger/policy.

Nunca executar DROP destrutivo baseado somente no estado do repositório.

## Qualidade

Antes de encerrar uma tarefa relevante, executar o máximo aplicável de:

```text
typecheck
lint
tests
web build
api build
docker build
```

Se algum teste não puder ser executado, informar claramente.

Nunca declarar que algo está funcionando sem verificar.

## Refatoração

Prefira refatoração incremental.

Código existente pode ser movido e reorganizado, mas seu comportamento deve permanecer.

Não realize abstrações gigantes sem necessidade.

Não recrie a interface visual do zero.

Não altere UX existente sem motivo relacionado à tarefa.

## Regra de decisão

Quando houver conflito entre:

```text
"arquitetura mais elegante"
```

e:

```text
"manter uma regra de negócio existente funcionando"
```

priorize a regra de negócio.
