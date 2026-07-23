
## Objetivo
Permitir ao usuário, em toda tela de listagem, escolher **quais colunas exibir** e **em que ordem**, com preferência persistida por usuário/tela.

## Abordagem

Criar um sistema genérico reutilizável, evitando duplicação em cada tela.

### 1. Novo hook `useColumnPreferences`
Arquivo: `src/hooks/use-column-preferences.ts`

- Recebe `tableKey` (ex: `"nfe"`, `"suppliers"`) e definição base de colunas: `{ key, label, alwaysVisible? }`.
- Estado: `{ order: string[], hidden: string[] }`.
- Persistência em `localStorage` (chave `apfiscal:cols:<userId>:<tableKey>`).
- Retorna: `visibleColumns` (ordenado + filtrado), `allColumns`, `setOrder`, `toggleVisible`, `reset`.

### 2. Novo componente `ColumnSettings`
Arquivo: `src/components/common/ColumnSettings.tsx`

- Botão "Colunas" (ícone `Settings2` do lucide) que abre um `Popover`.
- Lista as colunas com:
  - `Checkbox` para visibilidade (desabilitado se `alwaysVisible`).
  - Handles de drag (usando HTML5 drag-and-drop nativo — sem nova dependência) para reordenar.
- Botão "Restaurar padrão".

### 3. Integração nas listagens
Aplicar em cada tela de listagem existente:

- `src/routes/_authenticated/documents.nfe.index.tsx`
- `src/routes/_authenticated/documents.nfse.tsx`
- `src/routes/_authenticated/documents.cte.tsx`
- `src/routes/_authenticated/companies.tsx`
- `src/routes/_authenticated/suppliers.tsx`
- `src/routes/_authenticated/products.tsx`
- `src/routes/_authenticated/classifications.tsx` (3 tabelas: famílias, grupos, subgrupos)
- `src/routes/_authenticated/settings.members.tsx`
- `src/routes/_authenticated/settings.certificates.tsx`
- `src/routes/_authenticated/notifications.tsx`
- `src/routes/_authenticated/monitoring.tsx`

Padrão de refatoração por tela:

```tsx
const COLUMNS = [
  { key: "numero", label: "Número" },
  { key: "data", label: "Data" },
  ...
  { key: "actions", label: "Ações", alwaysVisible: true },
];
const { visibleColumns, ... } = useColumnPreferences("nfe", COLUMNS);

// Header
{visibleColumns.map(c => <TableHead key={c.key} onClick={...}>{c.label}</TableHead>)}

// Body — renderer map
const renderers: Record<string, (row) => ReactNode> = {
  numero: r => r.numero ?? "-",
  data: r => ...,
  actions: r => <Button>...</Button>,
};
{visibleColumns.map(c => <TableCell key={c.key}>{renderers[c.key](row)}</TableCell>)}
```

Botão `<ColumnSettings />` ao lado dos filtros/busca no topo do card.

### 4. Compatibilidade com ordenação (sort) e seleção
- A coluna checkbox de seleção (quando existir) permanece fixa fora do sistema (não configurável).
- O `requestSort` do `useSortableData` continua funcionando; o header só é renderizado se a coluna estiver visível.

## Fora do escopo
- Persistência server-side (fica em localStorage por enquanto).
- Redimensionamento de colunas.
- Alterações de estilo visual das tabelas.

## Entregáveis
1. `src/hooks/use-column-preferences.ts` (novo)
2. `src/components/common/ColumnSettings.tsx` (novo)
3. Refatoração das ~11 telas listadas acima para consumir o hook + componente.
