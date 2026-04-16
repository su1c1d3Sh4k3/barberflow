Design a complete web SaaS dashboard for a barbershop management system called "BarberFlow" (or similar). The entire product communicates with end-customers via WhatsApp, so the web app is only for the barbershop owner/staff.

## GLOBAL DESIGN SYSTEM

**Style:** Minimalist, modern, highly rounded, clean and intuitive. Prioritize whitespace, clarity, and hierarchy. Think Linear + Notion + Trinks, but more playful and friendly.

**Color palette:**
- Primary: deep navy #0F172A (or charcoal) for text and sidebar
- Accent: warm amber/gold #F59E0B (barbershop vibe, evokes classic pole) OR emerald #10B981 if preferred — pick ONE accent
- Background: off-white #FAFAF9
- Surface/cards: pure white #FFFFFF
- Success: #10B981, Warning: #F59E0B, Error: #EF4444, Info: #3B82F6
- Muted text: #64748B, borders: #E2E8F0

**Shapes & radius:** Heavy use of rounded corners — cards 20px, buttons 14px, inputs 12px, pills/badges fully rounded (9999px). Avoid sharp edges entirely.

**Typography:** Inter or Geist. Headings bold 600-700, body 400-500. Generous line-height (1.6).

**Spacing:** Airy. 24-32px padding inside cards, 16-24px gaps between elements.

**Shadows:** Very soft (shadow-sm), never harsh. Subtle borders instead of heavy shadows.

**Icons:** Lucide icons, 20px, stroke 1.5.

**Layout:** Persistent left sidebar (240px, collapsible to 72px) + top bar (64px with search, notifications, unit selector, user avatar) + main content area with max-width 1440px.

**Sidebar navigation items (in order):** Dashboard, Agenda, Contatos, Empresa, Profissionais, Serviços, Definições, Definições da IA, Conexão WhatsApp. At the bottom: user profile card with plan badge (Essencial/IA).

**Language:** All UI text in Brazilian Portuguese.

---

## SCREEN 1 — LOGIN

Split screen. Left side (60%): clean white form centered, max 400px wide. Logo at top (barbershop pole icon + wordmark). Heading "Bem-vindo de volta 👋". Subtitle "Entre na sua conta para gerenciar sua barbearia". Two rounded inputs (email, senha with eye toggle). "Esqueci minha senha" link right-aligned. Large primary button "Entrar" full width. Divider "ou". Google login button outlined. Footer: "Não tem conta? Cadastre-se grátis". Right side (40%): solid amber gradient background with a stylized illustration of a barber chair and scissors, plus testimonial card floating: "Reduzi 50% das faltas no primeiro mês" — João, Barbearia Corte Fino.

## SCREEN 2 — CADASTRO

Same split layout. Form with fields stacked: Nome completo, Nome da barbearia, Telefone (with Brazil flag mask), Email, CNPJ (optional, with tooltip "Opcional para MEI"), Senha (with strength meter bar showing weak/medium/strong in color), Confirmar senha. Checkbox "Li e aceito os Termos de Uso e Política de Privacidade" (LGPD). Large button "Criar minha conta grátis". Small text "14 dias grátis, sem cartão de crédito".

## SCREEN 3 — DASHBOARD

Top: Greeting "Olá, Carlos 👋" + subtitle with today's date. Period filter as pill-shaped segmented control top-right: Hoje | 7 dias | 30 dias | Personalizado.

**Row 1 — KPI cards (4 cards in grid):** Each card has icon in colored rounded square (48px), label, big number, and trend indicator (↑ 12% vs período anterior in green). Cards: (1) Contatos totais, (2) Agendamentos realizados, (3) Taxa de conversão, (4) Faturamento previsto R$ 8.450.

**Row 2 — Status cards (5 smaller pill cards in a row):** Confirmados (green dot), Concluídos (blue), Cancelados (red), Reagendados (amber), Em follow-up (purple). Each shows count + mini progress bar.

**Row 3 — Two columns:**
- Left (60%): Large card "Agendamentos por dia da semana" with rounded bar chart (amber bars, very rounded tops, Seg-Dom on X-axis).
- Right (40%): Card "Status da conexão WhatsApp" — large green dot pulsing, "Conectado", number +55 11 9xxxx-xxxx, last sync timestamp, button "Ver detalhes".

**Row 4 — Two columns:**
- Left: "Faturamento por profissional" — horizontal bar chart with avatar + name + value + commission.
- Right: "Próximos agendamentos" list — 5 items with avatar, client name, service, time, professional badge.

## SCREEN 4 — AGENDA/CALENDÁRIO (inspired by Trinks)

THE CORE SCREEN. Full-width calendar.

**Top bar of the screen:** Left — date navigator (< Today >) with current date "Quinta, 11 de Abril" in large bold. Center — view toggle pills: Dia | Semana | Mês | Lista. Right — filters (Profissional dropdown, Serviço dropdown) + primary button "+ Novo agendamento".

**Main calendar area (Day view — default):**
Layout is a **grid with professionals as COLUMNS** (Trinks style). Leftmost narrow column shows time slots (08:00, 08:30, 09:00... every 30min, sticky). Then each barber has their own column with avatar + name + small availability indicator at the top sticky header.

Each appointment is a rounded card (radius 12px) inside its column, colored by service category (pastel backgrounds: soft amber, soft blue, soft rose, soft mint). Card shows: client name bold, service name smaller, duration. Small colored left border (4px) indicating status: green=confirmado, amber=pendente, gray=concluído, red=cancelado.

Empty slots are subtle dashed areas that turn amber on hover with a "+ " icon to quick-add.

Lunch breaks shown as diagonal striped gray zones labeled "Intervalo".

Current time shown as a horizontal amber line across all columns with a small dot.

**Right side panel (collapsible, 320px):** When clicking an appointment, slides in from right. Shows client photo, name, phone (with WhatsApp button), service, professional, time, value, status dropdown, notes textarea, action buttons: Confirmar / Reagendar / Cancelar / Marcar como concluído / Enviar mensagem.

**Week view:** 7-day grid with professional selector at top (one barber at a time or "Todos" tiled smaller).

**Bottom-right floating:** Quick legend pill showing status colors.

## SCREEN 5 — CONTATOS

Top: search bar (large rounded, placeholder "Buscar por nome ou telefone..."), filters as pills (Todos, Respondidos, Pendentes, Follow-up, Agendados, Bloqueados), button "+ Novo contato" right.

Below: Table in card format. Columns: Checkbox | Avatar+Nome | Telefone | Status (colored pill) | Último agendamento | Última mensagem | Switch IA (on/off toggle) | Ações (3-dot menu). Rows with hover state and soft alternating background.

Clicking a row opens side drawer with: big avatar, name editable, phone, birthday date picker, custom tags (add/remove chips), full conversation history preview, history of appointments (timeline), LTV value, notes field, action buttons.

## SCREEN 6 — EMPRESA

Tabs at top: Dados gerais | Unidades | Horários | Marca. Top-right button "+ Nova unidade" (for multi-unit users).

**Dados gerais tab:** Card with logo upload area (rounded 120px dashed dropzone), fields: Nome fantasia, Razão social, CNPJ, Descrição (textarea), Telefone, Email, Endereço (CEP with autocomplete, rua, número, bairro, cidade, estado). Google Maps preview embedded card. Social media inputs (Instagram, Facebook).

**Horários tab:** List of 7 days with toggle on/off per day, time range pickers (abertura/fechamento), "+ Adicionar intervalo" per day. Feriados section with calendar picker.

## SCREEN 7 — PROFISSIONAIS

Grid of professional cards (3-4 per row). Each card: large rounded avatar (96px), name, role, rating stars, services count badge, commission %, "Ver detalhes" button. "+ Adicionar profissional" card as dashed outline at end.

**Add/Edit modal (centered, rounded 24px, max 600px):** Avatar upload, Nome, Telefone, Email, Bio (textarea), Serviços (multi-select chips from services list), Comissão (% slider), Dias trabalhados (7 day toggle pills Dom-Sáb), Horário de trabalho (início/fim time pickers), Intervalo (início/fim), Meta mensal de faturamento. Save button.

## SCREEN 8 — SERVIÇOS

Two-panel layout. Left (30%): list of categories as rounded cards, each with name, description, service count, edit icon. "+ Nova categoria" button at top. Selected category highlighted with amber left border.

Right (70%): services of selected category as card grid. Each service card: Name, description, time badge (⏱ 30min), price big and bold (R$ 45), promotion toggle (if on, shows strikethrough price + new price + discount %), edit/delete icons. "+ Novo serviço" as dashed card.

## SCREEN 9 — DEFINIÇÕES

Left vertical tabs: Follow-up | Aniversário | Cupons | Boas-vindas | Pagamento.

**Follow-up tab:** Cards for Follow-up 1, 2, 3. Each with: toggle on/off, delay input (horas/dias after last interaction), message textarea with variable picker ($nome, $primeiro_nome, $barbearia — clickable chips that insert into text), preview bubble showing how the WhatsApp message will look (green chat bubble style). "+ Adicionar follow-up" button (max 3).

**Aniversário tab:** Toggle, message textarea with variables + $cupom chip, send time picker, preview bubble.

**Cupons tab:** Table of coupons with columns (Nome, Desconto, Validade, Usos, Status, Ações) + "+ Criar cupom" button. Create modal: nome, duração, % desconto, info box explaining auto-format "CUPOM_1025".

**Pagamento tab:** Pix key input + copy button, payment link input, QR code preview.

## SCREEN 10 — DEFINIÇÕES DA IA (plano IA)

Badge top-right "Plano IA ✨". 

Row 1 — Mini dashboard: Tokens consumidos (big number + progress bar to limit), Custo estimado (R$ X.XX), Data do último pagamento, button "Ver histórico".

Row 2 — IA Master toggle card: large switch "IA ativada" with status text.

Row 3 — Configuration card: Tom de voz (4 pill options with icons: Formal 🎩, Bem humorado 😄, Educado 🙏, Simpático 😊 — single select), Observações textarea (large, "Instruções específicas para a IA"), Base de conhecimento file upload area.

Row 4 — Modo teste card: Toggle "Apenas números de teste". When on, shows input field with pill chips of added phone numbers and "+ Adicionar número" button.

Row 5 — Handoff card: toggle "Transferir para humano quando a IA não souber responder" + keyword inputs.

## SCREEN 11 — CONEXÃO WHATSAPP

Large centered card. When disconnected: QR code area (256x256 rounded), instructions numbered list (1. Abra o WhatsApp, 2. Toque em Menu > Dispositivos conectados, 3. Escaneie o código), button "Atualizar QR".

When connected: Big green pulsing dot, "Conectado" bold, connected number, device info, last activity, session duration, button "Desconectar" (red outline), logs table below with timestamp, direction (in/out), message preview.

---

## INTERACTION NOTES
- All buttons have subtle hover lift (translateY -1px) and soft shadow
- Inputs have focus state with amber ring
- Toggles are rounded pill switches with smooth animation
- Empty states have friendly illustrations + helpful CTA
- Loading states use skeleton screens, never spinners
- Toasts appear bottom-right, rounded, with colored left border
- Modals have backdrop blur
- Mobile responsive: sidebar becomes bottom nav, tables become cards

Generate all 11 screens in desktop view (1440px width), maintaining perfect visual consistency across all of them.

## SCREEN 11 - Planos e Checkout | Minha Assinatura — CONEXÃO WHATSAPP
banner de trial com countdown, toggle de ciclo (Mensal/Recorrência/Semestral/Anual) com badges de desconto, 2 cards lado a lado (Essencial outline + IA featured com gradient amber e badge "Mais popular"), seletor de método de pagamento, formulário de cartão com juros dinâmicos, sticky order summary com total, e estado alternativo "já assinante" com histórico de invoices.

# TELAS DO LINK PUBLICO:
Design a complete public booking widget for a barbershop SaaS called BarberFlow. This is the CONSUMER-facing flow accessed via a unique URL like barberflow.com.br/b/{slug}. End customers (the barbershop's clients) book appointments here without ever creating an account. 90% of traffic comes from a WhatsApp link, so MOBILE-FIRST is non-negotiable — design for 390px width primarily, then show desktop variant.

## DESIGN SYSTEM (must match the SaaS admin)

- **Vibe:** premium, friction-free, friendly, trustworthy. Think Cal.com meets Notion meets a high-end barbershop.
- **Colors:** primary navy `#0F172A` for text, accent amber `#F59E0B` for CTAs and selection states, off-white `#FAFAF9` background, white `#FFFFFF` cards, muted `#64748B` for secondary text, borders `#E2E8F0`. Success green `#10B981`, error red `#EF4444`, warning amber.
- **Radius:** very rounded — cards 24px, buttons 16px, inputs 14px, chips/pills fully rounded 9999px.
- **Typography:** Inter. H1 32px/700, H2 24px/600, body 16px/400, line-height 1.6. Generous letter-spacing on small caps labels.
- **Spacing:** airy. 24px page padding mobile, 16-20px gaps between cards.
- **Shadows:** super soft, almost just borders. No harsh drop shadows.
- **Icons:** Lucide, 20-24px, stroke 1.5.
- **Buttons:** primary = solid amber bg + white text + 16px radius + 56px tall + bold. Secondary = white bg + amber border 1.5px + amber text. All buttons have subtle press animation.
- **Inputs:** 56px tall, 14px radius, soft border, focus = amber ring 3px.
- **Language:** all UI in Brazilian Portuguese.

## GLOBAL STRUCTURE (every step shares this)

- **Sticky header** (64px): on left, barbershop logo (40px circle) + name in bold + small star rating below ("4.9 ★ · 234 avaliações"). On right, a small back arrow icon ("← Voltar") that returns to previous step. Subtle bottom border.
- **Progress bar** below header: thin rounded amber bar, width animates from 0 to 100% across steps. Above the bar, small text "Passo 3 de 8 · Escolha o serviço".
- **Main content area:** single column max-w-[480px] centered, 24px padding.
- **Footer** (every step, below content): card with barbershop info — small logo, address with map pin, phone, working hours, social icons. Tiny "Powered by BarberFlow ✂️" at very bottom.

Generate ALL 9 screens below, in this exact order, mobile view (390px) primary plus desktop variant (1024px) where indicated.

---

## SCREEN 0 — Landing / Identification

**Hero card** (large, centered, soft white card 24px radius):
- Cover image at top (rounded top corners) showing barbershop interior
- Big circular logo overlapping the cover (-40px margin, 96px size, white border)
- Below logo: barbershop name H1 bold centered
- Tagline subtitle muted: "Agende seu horário em segundos, sem complicação"
- Small row of trust signals: ⭐ 4.9 · 📍 Centro · ⏰ Aberto agora (green dot)

**Form below hero:**
- Label "Como podemos te chamar?"
- Input "Nome completo" (large, rounded)
- Label "Seu WhatsApp"
- Input phone with BR flag prefix (+55) and mask (11) 9XXXX-XXXX
- Helper text small: "Vamos enviar a confirmação por aqui"
- Big primary amber button "Continuar →" full width 56px tall
- Tiny LGPD text below: "Ao continuar você concorda com os Termos e Política de Privacidade"

**Below form:** small card "Já tem agendamento?" with link "Clique aqui para gerenciar"

---

## SCREEN 1 — Select Unit (only shown if multi-unit)

**Heading:** "Em qual unidade você quer ser atendido?" H2.

**Subtitle:** muted "Escolha a barbearia mais perto de você"

**Cards stacked vertically**, each unit:
- Cover photo (16:9, rounded top 24px)
- Card body padding 20px
- Unit name bold + green "Aberto" pill or red "Fechado" pill
- Address with 📍 icon
- Distance badge if geolocation allowed: "📍 1.2 km de você"
- Working hours of today: "Hoje: 09:00 - 20:00"
- Phone with click-to-call icon
- Bottom: outline button "Selecionar esta unidade →"
- Subtle tap state with amber border on touch

---

## SCREEN 2 — Select Category

**Heading:** "O que você quer fazer hoje?" H2

**Subtitle:** "Escolha uma categoria de serviço"

**Grid 2 columns** of category cards (1 column on very narrow screens):
- Each card: square aspect ratio, soft pastel background (rotate colors: soft amber, soft mint, soft rose, soft sky, soft lavender)
- Big emoji or icon centered (✂️ 🧔 💆 ✨)
- Category name bold below
- Tiny text "X serviços" muted
- Tap state: amber border 2px + slight scale animation

---

## SCREEN 3 — Select Service

**Heading:** "Escolha seu serviço" H2

**Subtitle:** "Você pode selecionar mais de um"

**List of service cards** (vertical stack):
- White card 20px radius, padding 20px, soft border
- Left side: service name bold + description small muted (2 lines max truncated) + duration pill "⏱ 30min"
- Right side: price BIG amber bold "R$ 45" with strikethrough above if promo "R$ 55"
- Promo tag if applicable: amber pill "-18%" top right
- Checkbox circle on the far right (not square — circle for friendliness), checked state filled amber with white check
- Selected card has amber border 2px + soft amber bg tint

**Sticky bottom bar** (fixed bottom, 80px tall, white with top shadow):
- Left: "2 serviços · 50min" small muted text + "R$ 75,00" big bold
- Right: primary button "Continuar →"
- Hidden until at least 1 service selected

---

## SCREEN 4 — Select Date

**Heading:** "Para qual data?" H2

**Subtitle:** "Escolha o dia do agendamento"

**Quick chips row** (horizontal scroll): "Hoje" / "Amanhã" / "Esta semana" / "Próxima semana"

**Inline calendar** (large, takes most of screen):
- Month name + year H3 with prev/next month arrows
- Weekday labels Dom-Sáb tiny muted
- 6 rows of 7 day cells, each cell 44x44 minimum (touch target)
- States:
  - Past days: very muted, not clickable
  - Unavailable (closed/full): light gray, slash through
  - Available: white with amber number
  - Low availability: white with amber dot indicator below number
  - Today: outlined amber circle around number
  - Selected: solid amber filled circle, white number
- Smooth tap animation

**Below calendar:** small legend with colored dots: "Disponível · Poucos horários · Indisponível"

---

## SCREEN 5 — Select Professional

**Heading:** "Quem vai te atender?" H2

**Subtitle:** "Escolha um profissional ou deixe que escolhamos por você"

**First card — "Sem preferência"** (special, featured):
- Soft amber gradient background 24px radius
- Team icon (multiple avatars overlapping) on left
- "Sem preferência ✨" bold
- Subtitle "Te encaixamos com qualquer profissional disponível"
- Right arrow

**Below — Professional cards** (stacked):
- White card padding 20px
- Left: circular avatar 72px
- Middle: name bold + ⭐ 4.9 small + specialty chips ("Corte" "Barba" "Degradê") wrapping
- Right: chevron arrow
- Tap state: amber border 2px

If only ONE professional, skip this screen entirely.

---

## SCREEN 6 — Select Time Slot (THE DIFFERENTIATOR)

**Heading:** "Escolha o horário" H2

**Subtitle:** "Quarta, 16 de abril · com João"

**View toggle pills** at top: [ Timeline ] [ Lista ] (default Timeline)

### Timeline view (DEFAULT — premium feel)
- Horizontal scrollable container, full screen width
- Time labels on top: 08:00, 09:00, 10:00... up to 20:00, evenly spaced
- Below labels: a SINGLE horizontal track 80px tall, rounded 16px
- Inside the track, blocks rendered in chronological order:
  - **Busy blocks:** soft gray fill, diagonal stripes pattern, label "Ocupado" only if wide enough, NOT clickable
  - **Lunch break:** amber stripes, label "Intervalo"
  - **Available blocks:** white with amber border 2px dashed, time label inside ("14:00"), clickable. On hover/tap: fills amber solid + white text
- Selected block: solid amber + white text + slight glow
- "Now" indicator: vertical amber line if today, with dot at top
- Pinch to zoom (or "+/-" buttons)
- Auto-scrolls to first available slot on load

### List view (fallback / accessibility)
- Grid 3 columns of time chips: "08:30" "09:00" "09:30"...
- Available = white with amber border, selected = solid amber
- Grouped by period: "Manhã", "Tarde", "Noite" with small section headers

**Below either view:** if no slots, show empty state — friendly illustration + "Nenhum horário disponível neste dia 😕" + button "Ver próximos dias livres"

**Sticky bottom bar:** appears after selection, shows "Selecionado: 14:00" + "Continuar →" button

---

## SCREEN 7 — Confirmation

**Heading:** "Confirme seu agendamento" H2

**Subtitle:** "Revise os detalhes antes de finalizar"

**Big summary card** (white, 24px radius, padding 24px):

Each row has a small label muted on left + value bold on right + tiny edit pencil icon (taps back to that step):

- 💈 Serviço(s): "Corte + Barba" → 2 lines if multiple
- 👤 Profissional: avatar mini + "João Silva"
- 📅 Data: "Quarta, 16 de abril de 2026"
- ⏰ Horário: "14:00 — 15:00"
- 📍 Local: "Unidade Centro"

**Divider**

**Total row:** "Total" muted left, "R$ 75,00" HUGE amber bold right.

**Below card:** small info banner soft blue with ℹ️ icon: "Você receberá a confirmação no WhatsApp e um lembrete 1h antes do horário."

**Primary button** full-width gigantic amber: "Confirmar agendamento ✓"
Below: text link centered "Cancelar e voltar"

---

## SCREEN 8 — Success

**Centered, no card, full-screen feel:**
- Animated green check inside circle (Lottie-like, scale + draw)
- H1 "Tudo certo! 🎉"
- Subtitle "Seu agendamento foi confirmado"

**Recap mini-card** white rounded 24px:
- All booking details in compact format
- Booking ID small muted at bottom

**Two buttons stacked:**
- Outline: "📅 Adicionar à minha agenda" (generates .ics)
- Outline: "📤 Compartilhar"

**Divider with text "ou"**

**Big amber card with question:**
- "Quer agendar outro serviço?" bold centered
- Two buttons side by side: amber "Sim, agendar" + outline "Não, finalizar"

**Below everything:** WhatsApp click-to-chat card "💬 Falar com a barbearia" with phone number.

---

## ALTERNATE SCREEN — Manage existing booking
(triggered from Screen 0 "Já tem agendamento?")

**Phone input** to identify, then:
- Card with current appointment details
- Three big buttons stacked: "Reagendar" / "Cancelar" / "Voltar ao menu"
- If reagendar → goes to Screen 4 (date)
- If cancelar → modal asking reason (textarea) + confirm

---

## INTERACTION & ANIMATION NOTES

- All transitions between steps: slide right-to-left 300ms ease-out
- Loading states: skeleton screens (never spinners) with subtle amber pulse
- Empty states: friendly minimalist illustration + helpful CTA
- Errors: soft red toast bottom, rounded, auto-dismiss 5s
- All taps have haptic-feeling press state (scale 0.98)
- Calendar and timeline snap to nearest valid option
- Form validation inline, real-time, friendly messages

## DESKTOP VARIANT (1024px+)

- Same flow but max-w-[640px] centered
- Calendar can be wider, two months side by side
- Timeline view scales naturally
- Footer becomes 3-column layout
- Header stays compact

Generate all 9 screens (0-8 + Manage) in mobile view (390px), and Screens 0, 4, 6, 7 also in desktop view (1024px) since those benefit most from extra space.

Make it feel like the kind of booking experience someone would screenshot and send to friends saying "olha que legal essa barbearia". Premium, friendly, fast.