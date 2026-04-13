# BarberFlow - Claude Code Guidelines

## Regra de Ouro: Toda implementação DEVE ser testada

**Antes de considerar qualquer feature concluída:**
1. Criar testes Python para a funcionalidade (backend, API, frontend conforme aplicável)
2. Adicionar os testes na pasta `tests/` na subpasta correta
3. Rodar `python3 -m pytest tests/ -v --tb=short` e garantir que TODOS os testes passam
4. Se algum teste existente quebrar, corrigir antes de prosseguir

## Estrutura de Testes

```
tests/
  backend/    → Testes de banco (Supabase REST direto)
  api/        → Testes de rotas API (Next.js /api/*)
  frontend/   → Testes Selenium (renderização, elementos, forms)
  integration/→ Testes end-to-end (fluxos completos)
```

## Stack
- Next.js 14 (App Router) + TypeScript + Tailwind + shadcn/ui
- Supabase (Auth, Postgres, Realtime, Storage)
- uazapi (WhatsApp) + Asaas (pagamentos)
- Testes: Python pytest + requests + selenium

## Idioma
- Todo o app em **pt-BR**
- Código e commits em inglês

## Design System
- "Polished Artisan": minimalista, rounded, amber #F59E0B accent
- Sidebar light (#f3f4f3), navy text (#0F172A)
- Radius: cards 20px, buttons 14px, inputs 12px
- Font: Inter, shadows soft

## Convenções
- Server actions em `src/lib/actions/`
- Validações Zod em `src/lib/validations/`
- Hooks em `src/hooks/`
- State global via Zustand em `src/stores/`
- Supabase project ref: vpvsrqkptvphkivwqxoy
