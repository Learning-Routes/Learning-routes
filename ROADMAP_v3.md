# Learning Routes — Roadmap v3

> Reescrito el 2 de septiembre de 2026, después de una auditoría en seis frentes sobre 497
> archivos Ruby, 163 vistas y 65 controladores de JS, más una prueba de la página en vivo.
> Sustituye a `ROADMAP_v2.md`, que se escribió cuando el producto todavía no cobraba.

---

## Lo que cambia respecto a v2

v2 ordenaba el trabajo por *lo que faltaba construir*. Esta versión lo ordena por **lo que está
costando dinero ahora mismo**, porque la auditoría encontró cuatro fugas de gasto activas en
producción, ninguna de ellas relacionada con el comercio.

El otro cambio: WP-18 (compras con Lemon Squeezy) está construido, auditado dos veces y sin
desplegar. Deja de ser "lo siguiente" y pasa a ser "lo que se despliega en cuanto se cierren las
fugas".

---

## Estado real

**Rama activa:** `wp18-route-purchases`, base `main` @ `4145290`. No fusionada, no desplegada.
**Producción:** va por detrás de `main`. Arrastra sin desplegar todo desde WP-15.
**Suite:** 522 runs verdes en el camino principal, 858 combinados con los cuatro fallos de
engine ya conocidos y deliberadamente no arreglados.
**Cabeceras de seguridad en vivo:** CSP aplicada con nonces, HSTS a dos años, `X-Frame-Options`,
`nosniff`, referrer y permissions policy. Esta parte está bien y no necesita trabajo.

---

## 1 · Cerrar las cuatro fugas de gasto `PRIMERO`

Las cuatro gastan en OpenAI y ElevenLabs hoy, sin que nadie haya pagado y sin WP-18 desplegado.
Ninguna necesita una decisión de producto. Detalle completo en `AUDITORIA_2026_09.md`.

### 1a · El sondeo de 3 s vuelve a encolar la generación

`steps_controller.rb:224`, `_step_content_frame.html.erb:9`, `content_pipeline_job.rb:22`.

`request_content_generation!` decide si encolar leyendo `metadata["content_generating"]`, una
bandera que solo se escribe **cuando el job arranca**. El marco se sondea cada 3 s. Con la cola
llena al crear la ruta, cada sondeo dentro de la ventana encola otro pipeline para el mismo paso,
y `ContentPipelineJob` solo se guarda contra `content_ready`.

El comentario en `steps_controller.rb:150-160` describe esta carrera y anuncia el arreglo —
que existe, pero en `ContentPrefetcher`, sirviendo al otro camino. **Aplicar el mismo claim
atómico a este camino.**

**Coste:** 2,33¢ por duplicado, 3,16¢ máximo, hasta ~10 duplicados por paso.

### 1b · Los pasos de refuerzo caen en el módulo gratis

`adaptive_difficulty.rb:161`, `route_step.rb:146`, `results_controller.rb:68`.

`adjust!` corre en cada envío de evaluación, fuera de la comprobación de gasto. Con nota < 60
inserta pasos con `create!` sin pasar `route_module:`, y `assign_preview_module` los mete en
**preview** — gratis para todos, y justo el filtro por el que el prefetcher decide qué generar.
Sin tope: `AssessmentsController#start` crea un resultado nuevo cuando el anterior tiene nota.

Decidir dos cosas y justificarlas: a qué módulo pertenece un paso de refuerzo insertado en una
ruta pagada, y si `adjust!` debe pasar por la política de gasto.

**Coste:** ≈4,66¢ por vuelta, sin límite. Y el módulo gratis crece mientras el precio no.

### 1c · Todo el gasto de voz esquiva el techo de coste

`model_router.rb:50-51`, `audio_generator.rb:118`, `section_audio_generator.rb:175`.

`check_cost_limit!` y `check_rate_limit!` viven solo dentro de `ModelRouter#execute`. Los dos
caminos de TTS construyen `AiClient` directamente. Los topes de 5.000¢/día y 500¢ por usuario/día
y el límite de 20 rpm nunca se consultan para ningún audio.

### 1d · El prefetch de medios pisa lo ya pagado

`media_prefetch_job.rb:18 → :189 → :242`, sin un solo `reload` en el archivo.

Carga `@step`, pasa minutos generando en seis hilos, y reescribe el blob `metadata` entero desde
la copia inicial. Se pierden `image_url`, `step_quiz_generated` y `audio_sections` escritos entre
medias. El archivo sigue en almacenamiento; su URL no. El alumno regenera y vuelves a pagar.

**Coste:** 4,26¢ por imagen perdida, 3,07¢ por narración.

---

## 2 · Fusionar y desplegar `wp18-route-purchases`

Auditado dos veces y verificado contra el código. Arrastra además todo lo pendiente desde WP-15.

Después del despliegue, verificar en el sitio y no en un test: crear una ruta, emparejar mal a
propósito en un bloque EMPAREJA y comprobar que no deja pasar; generar una imagen; abrir en móvil.

---

## 3 · Task 8 — generación de módulos pagados

Es lo que hace que WP-18 sirva de algo. `PaidModuleGenerationJob` sigue con el cuerpo vacío.

**Lo que ya está puesto para protegerte:** `content_prefetcher_scope_test.rb` falla si alguien
ensancha el filtro de preview sin traer al mismo tiempo la comprobación de entitlement. Ese test
es la razón por la que este paquete no reabre el agujero de reembolsos.

---

## 4 · Task 9 — reembolsos

`mark_refunded!` no tiene ningún llamador en producción, así que ninguna compra puede llegar a
`refunded` y toda la protección de gasto post-reembolso es decorativa hoy.

Aquí entran también:

- `LessonsController` y `ExercisesController`, que gastan y siguen usando la política de lectura.
- Un pedido `pending` que consume su propia identidad y nunca se puede procesar al capturarse
  (`order_processor.rb:170` + `lemon_squeezy.rb:90`): la identidad es `event_name:order_id` y el
  id del pedido no cambia, así que la re-entrega llega como `duplicate_event` para siempre.
- El webhook no mira `expires_at` ni `superseded_at`, así que un enlace viejo paga al precio
  retirado.
- El CHECK de la base tiene `299` literal: cambiar una constante de precio rompe todas las
  cotizaciones hasta que se despliegue una migración.

---

## 5 · La red de seguridad

Lleva pendiente desde WP-4 y cada semana que pasa cuesta más.

1. **Un test que recorra controladores y jobs y falle si alguno traversa asociaciones sin
   `includes`.** El defecto tiene **72 instancias**. `RouteProgressTracker` es la peor: se
   instancia con una ruta sin precargar en casi todas las páginas del flujo, y una sola llamada
   a completar paso genera cuatro violaciones. En producción solo se registra.
2. **Un test que cargue la página en un navegador de verdad** y falle si un controlador de
   Stimulus no arranca. Hoy `data-controller="hover"` en `profiles/show.html.erb:147` apunta a un
   archivo que no existe y nadie se entera.
3. **Tests para el motor de sesiones.** `Core::SessionsController`, `RegistrationsController`,
   `PasswordsController`, `OmniauthCallbacksController`, `EmailVerificationsController` y
   `OnboardingController` **no tienen ni un archivo de test**. Y `redirect_if_signed_in`
   (`sessions_controller.rb:8`) sigue haciendo que un segundo `post "/sign_in"` no cambie de
   usuario — hoy ningún test lo explota, pero tampoco hay nada que lo proteja.
4. **Activar `raise_on_missing_translations` en test.** Está comentado en
   `config/environments/test.rb:53`, y por eso varios tests comparan `I18n.t(clave)` contra
   `I18n.t(misma clave)`: si borras la traducción, ambos lados devuelven el mismo
   `"translation missing: …"` y el test pasa mientras el alumno lee esa cadena.

---

## 6 · La portada

La única pantalla que ve alguien que todavía no es usuario.

- **5,4 s hasta interactiva** (`domContentLoaded` 5.386 ms, `load` 5.788 ms) para 13 KB de HTML
  y 504 KB en 76 peticiones.
- **Abre en inglés.** `config.i18n.default_locale = :en` y nada negocia `Accept-Language` en las
  peticiones normales — solo el callback de OAuth lo lee. Un visitante hispanohablante nuevo
  recibe todo en inglés y su único remedio es un botón «ES» de 0,65 rem apagado en la barra.

---

## 7 · Lo que queda roto y no cuesta dinero

- **Clonar una ruta compartida devuelve 500 siempre.** `route_sharer.rb:38` arrastra el
  `route_module_id` original y la validación lo rechaza. La única palanca de crecimiento orgánico
  del producto no ha funcionado nunca.
- **La respuesta del tutor se paga y se pierde.** `tutor_reply_job.rb:76`, un `rescue` pelado
  después de gastar; el chat se queda colgado y `tutor_reply` no se cachea.
- **`AiRequestJob#attempts_remaining?` lanza `NoMethodError`** (`:72,:103`) llamando a un método
  de instancia privado sobre la clase. Hoy es código muerto; está listo para engañar al primero
  que use `async: true`.
- **Los gaps nunca se resuelven.** `KnowledgeGap#resolve!` no se llama desde ningún sitio, y
  `ReinforcementJob` paga una llamada por cada gap sin resolver en cada envío: escala con lo mucho
  que le cueste al alumno.
- **Textos sin traducir en los dos sentidos**: `route_wizard_controller.js:627` fuerza
  `"Create my route ✨"` en inglés para todos ignorando la traducción que ya le llega, y
  `_audio.html.erb:84` deja los estados de carga en español fijo.

---

## 8 · Deuda de seguridad, sin cerrar desde v2

- Claves de OpenAI y ElevenLabs: públicas en `origin/main` desde el 13 de febrero. Árbol limpio e
  historia reescrita; **falta confirmar la revocación** y pedir a GitHub la purga.
- `gilberga/learning_routes` sigue público en Docker Hub con `COPY . .` en el Dockerfile.
- Contraseña de Postgres y token de Docker Hub pegados en el chat, sin rotar.
- La cuenta admin sembrada: neutralizada, no borrada.
- `/cable` sin autenticar, `forget!` sin llamar en el reset de contraseña, `html_safe` sin
  sanitizar en `tutor_chats/_message.html.erb:8`, y sin índice único para el replay de XP.
- `.env.deploy.bak` es un duplicado obsoleto con credenciales vivas. Bórralo.

---

## Cómo se trabaja cada paquete

Sin cambios respecto a v2, porque funciona:

1. Se escribe un `PROMPT_XX.md` con contexto medido, restricciones duras y fases.
2. Se dispara en Claude Code desde la carpeta del proyecto.
3. **El reporte se verifica contra el código antes de creérselo.** Tres reportes en este proyecto
   han afirmado cosas que no eran ciertas, y una de esas veces fui yo dando una cifra de gasto que
   no había medido.
4. Tests verdes, commit, `source .env.deploy && kamal deploy`.
5. Se verifica en el sitio. **El cronómetro y la pantalla mandan sobre el test.**

Dos reglas que siguen vigentes:

- `env -u RAILS_MASTER_KEY` delante de cada `bin/rails test`.
- Una sola suite por proceso: dos `bin/rails test` a la vez comparten base de datos y producen
  un 18% de fallos falsos.
