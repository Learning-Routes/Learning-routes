# Learning Routes en el bolsillo — investigación, 11 de septiembre de 2026

Pregunta del dueño: ¿cómo hacemos que Learning Routes viva en el WhatsApp o en el celular de la gente,
«tipo OpenClaw o similares»? Esto es lo que encontré, lo que verifiqué y lo que recomiendo. Nada de aquí
es código ni un paquete todavía; es la base para decidir el paquete.

---

## 1. Qué es OpenClaw, y por qué no es el vehículo del producto

OpenClaw es un **gateway auto-alojado, MIT**, de la OpenClaw Foundation (501(c)(3), donantes OpenAI,
Amazon, Red Hat, GitHub, NVIDIA), que conecta Discord, Google Chat, iMessage, Matrix, Teams, Signal,
Slack, Telegram, WhatsApp y Zalo a agentes de IA. Corre en tu máquina, sin tier alojado, sin pago.

Lo decisivo para nosotros está en su propia documentación: **la integración de WhatsApp es por
WhatsApp Web** — `openclaw channels login` muestra un QR que escaneas con «el teléfono del asistente»,
y recomiendan un segundo número dedicado para que no todo tu WhatsApp personal se vuelva entrada del
agente. Es decir: un número, una sesión, un asistente para su dueño (o para un equipo que comparte un
gateway). Está diseñado para **ser tu asistente**, no para que una empresa atienda a miles de alumnos.

Tres consecuencias:

1. **Canal no oficial.** Una sesión de WhatsApp Web automatizada es la misma clase que Baileys /
   whatsapp-web.js: viola los términos de Meta y hay baneos documentados (2024–2025). Para un
   producto que cobra, un número baneado es el producto apagado.
2. **Un número por gateway, sin multi-tenencia.** No hay modelo de «N alumnos, cada uno con su ruta
   y su progreso» — eso lo tendríamos que construir encima, y encima de una sesión frágil.
3. **La regla de Meta de enero de 2026** (abajo) prohíbe justo lo que OpenClaw es: un asistente de
   propósito general distribuido por WhatsApp.

Donde sí vale: **para ti**. Un OpenClaw en tu Mac con tu segundo número, con acceso a tu terminal y a
tu repo, es un panel de control por WhatsApp de tus propios proyectos. Eso es otra conversación.

## 2. Lo que Meta permite y lo que cobra (verificado en su documentación)

**Precio.** Desde el 1 de julio de 2025 la Cloud API cobra **por mensaje**, no por conversación.
Categorías: marketing, utilidad, autenticación y servicio. **Los mensajes de servicio — el alumno
escribe, nosotros respondemos dentro de una ventana de 24 h — son gratis**, sin plantilla. Fuera de
esa ventana solo se pueden enviar **plantillas aprobadas**; las de utilidad y autenticación son gratis
dentro de la ventana y se cobran fuera. Tarifas verificadas: EE. UU. utilidad $0,004, marketing $0,025;
Brasil utilidad $0,0068, marketing $0,0625. México, Colombia, Argentina y España están en las tarjetas
CSV de Meta, no las tengo verificadas — el orden de magnitud es el mismo. Encima va el margen del BSP
si usas uno ($0,003–$0,010 por mensaje); directo con Meta, no.

Lo que eso significa para nosotros: **la parte conversacional es gratis** (el alumno pide su repaso,
contesta el quiz, pregunta al tutor — todo dentro de las 24 h desde su último mensaje), y **lo que
cuesta es lo que iniciamos nosotros**: el recordatorio diario como plantilla de utilidad, del orden de
un centavo o menos. A dos por día son céntimos al mes por alumno. Va al ledger de `ai_interactions`
como cualquier proveedor, bajo el mismo techo.

**Requisitos.** Cuenta de WhatsApp Business verificada por Meta (3–7 días hábiles en el caso simple;
semanas si la entidad es nueva), nombre visible aprobado, un número que **no** sea tu personal,
webhooks configurados en Business Manager, y cada plantilla aprobada antes de usarse. **La verificación
es lo único que hay que empezar hoy**, porque es lo único que tarda semanas y no depende de código.

**La regla de enero de 2026.** Desde el 15 de enero Meta prohíbe en la Business API los **asistentes
de IA de propósito general** (ChatGPT, Copilot, Perplexity: «conversación abierta como funcionalidad
principal»). Sigue permitida la **automatización ligada al servicio de tu propio negocio** — soporte,
pedidos, reservas, notificaciones, FAQs — aunque use IA por dentro. Learning Routes cae del lado
permitido **si el bot es el bot de Learning Routes para los alumnos de Learning Routes**: repaso del
día, quiz del paso, recordatorio, y el tutor **atado al paso de la ruta** — que es exactamente cómo
`TutorReplyJob` ya funciona (por `step`). Lo que no puede ser es «pregúntame lo que quieras».

**Límites de la interfaz.** Botones de respuesta rápida: máximo 3. Listas: máximo 10 filas. Un
`check` de cuatro opciones cabe en una lista; `drag_drop` y `fill_blank` se contestan con texto
(`BlockGrader` ya puntúa texto); las escenas de WP-36, los diagramas mermaid y el playground **no**
caben en WhatsApp — ahí el mensaje lleva un enlace y el alumno abre la lección en el celular.
WhatsApp Flows (formularios dentro del chat) existe; no lo verifiqué en detalle — pendiente.

**Ruby.** `ruby_whatsapp_sdk` (ignacio-chiazzo): 204 estrellas, 535 commits, activo, con texto,
medios, plantillas, **botones y listas interactivas** y helpers de webhook. Suficiente; sin Flows.

## 3. Las tres capas, y el orden que recomiendo

### Capa 1 — PWA + Web Push. Lo más barato, y ya está a medio hacer

Rails 8 ya dejó en el repo `app/views/pwa/manifest.json.erb` y `service-worker.js`, las rutas
`/manifest` y `/service-worker`, y **los cuatro layouts ya enlazan el manifest** (`application`,
`journey`, `landing`, `learning`). Falta: iconos e invitación a instalar, la gema `web-push` con
claves VAPID (no está en el Gemfile), un modelo de suscripción por usuario, y **un solo push que
importe**: «tienes N repasos pendientes», que `SpacedRepetition#due_reviews` ya sabe calcular.

Por qué primero: **cero coste por mensaje, cero verificación de Meta, y es el único canal donde la
lección completa — escenas narradas, diagramas, quiz — se ve tal como es.** «Vivir en el celular» de
verdad es un icono en la pantalla de inicio y una notificación que trae al alumno de vuelta. Límite
honesto: en iOS el push solo funciona si el alumno **instaló** la app en la pantalla de inicio
(Safari 16.4+); la invitación a instalar es parte del paquete, no un adorno.

### Capa 2 — Un canal de chat, primero Telegram, para probar el bucle sin fricción

Telegram Bot API: **gratis, sin verificación, 30 minutos** (BotFather → token → webhook), límites
de 1 msg/s por chat privado, teclados con botones ilimitados en la práctica. No es donde está tu
público — tu público está en WhatsApp — pero es donde se **prueba el bucle conversacional** sin
esperar semanas a Meta ni pagar plantillas: repaso del día como tarjeta, quiz con botones, tutor
atado al paso, racha. Todo lo que se construya aquí se reutiliza en WhatsApp si la arquitectura es la
de abajo.

### Capa 3 — WhatsApp Cloud API oficial, cuando la verificación llegue

Mismo bucle, otro adaptador. Directo con Meta (sin margen de BSP) o con un BSP si queremos soporte.
Plantilla de utilidad para el recordatorio diario; todo lo demás dentro de la ventana gratuita. El
bot **es el de Learning Routes**, atado a la ruta del alumno: así queda del lado permitido de la regla
de enero.

### La arquitectura que hace que las tres sean una

Un engine `messaging` con una interfaz `Channel` (`deliver(user, message)`, `parse(webhook) →
InboundMessage`) y dos adaptadores (Telegram, WhatsApp). Un `ConversationRouter` que no sabe de
pedagogía: mapea el mensaje entrante a lo que ya existe — `SpacedRepetition.due_reviews`,
`BlockGrader`, `AdvancementPolicy`, `TutorReplyJob`. Identidad: un código de un solo uso generado en
la web enlaza el chat con `Core::User` (hoy `users` **no tiene teléfono**, y así debe seguir: se
guarda el identificador del canal, no el número). Todo lo saliente pasa por jobs y por el ledger. Y
el test de clase, el que evita el error dominante de estos repos: **cada bloque que el gate cuenta
tiene una representación en el canal o un enlace explícito a la web** — nunca un bloque que el
servidor exige y el chat no puede mostrar (WP-35 §3, otra vez, en otro medio).

## 4. Lo que te toca decidir

1. **Orden.** Es una implementación, no un bug; con la regla de la casa va detrás de WP-36. Mi
   propuesta: WP-37a (PWA + push del repaso, pequeño, sin dependencia externa) inmediatamente después
   de WP-36; WP-37b (engine `messaging` + Telegram) detrás; WhatsApp cuando Meta verifique.
2. **Empezar hoy la verificación de Meta Business** con la entidad que factura (Lemon Squeezy cobra,
   pero la cuenta de WhatsApp Business es tuya). Tarda semanas y no bloquea nada más.
3. **El número.** Uno nuevo, de empresa, nunca el tuyo. Vale para las dos capas de chat.
4. **El tutor en el chat**: atado al paso actual, como en la web. No «asistente general».

## 5. Lo que no verifiqué

Las tarifas por país fuera de EE. UU. y Brasil; WhatsApp Flows como sustituto de la web para el
quiz; si Meta exige que la entidad verificada coincida con la que factura; y el detalle interno de
OpenClaw (si usa Baileys u otra implementación de WhatsApp Web — su documentación dice «WhatsApp Web»
y QR, que es lo que importa para el riesgo).

## Fuentes

- OpenClaw: https://openclaw.ai/ · https://docs.openclaw.ai/start/openclaw ·
  https://dev.to/nadinev/building-an-ai-whatsapp-agent-with-openclaw-a-practical-field-guide-51kc
- Precios de WhatsApp Business Platform (Meta):
  https://developers.facebook.com/documentation/business-messaging/whatsapp/pricing ·
  https://blueticks.co/blog/whatsapp-business-api-pricing-2026
- Regla de enero de 2026 sobre asistentes de IA: https://chatboq.com/blogs/third-party-ai-chatbots-ban ·
  https://zylos.ai/research/2026-01-26-whatsapp-api-automation/
- WhatsApp vs Telegram (coste, alta, ventana de 24 h):
  https://www.unifyport.ai/blog/whatsapp-vs-telegram-inbound-2026-cost-setup-comparison/
- Gema Ruby: https://github.com/ignacio-chiazzo/ruby_whatsapp_sdk
- Rails 8 PWA: https://www.gauravvarma.dev/blog/rails-8-adds-web-push-notifications-and-improved-pwa-support ·
  https://joyofrails.com/articles/web-push-notifications-from-rails
