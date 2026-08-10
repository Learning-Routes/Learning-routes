# Learning Routes — Roadmap

**Fecha:** 3 de agosto de 2026 · **HEAD:** `d18b31a` · **Producción:** imagen `b82338d` del 28-abr
**Base:** `AUDIT.md` (655 líneas, 29 ítems: 6 P0 · 9 P1 · 7 P2 · 7 P3)

---

## Dónde estamos, en una frase

El código está mucho mejor de lo que la web sugiere: hay tres meses de arreglos de seguridad,
tutor, FSRS y assessments **commiteados en `main` y nunca desplegados**. Producción corre una
imagen del 28 de abril. El wizard está roto tanto en la imagen vieja como en HEAD, así que
desplegar no lo arregla — hay que escribir el fix.

---

## Decisiones tomadas

| Tema | Decisión | Consecuencia |
|---|---|---|
| **strict_loading** | `:log` en producción · `:raise` + `:n_plus_one_only` en dev/test | Producción deja de caerse por las 101 asociaciones restantes; los N+1 nuevos explotan en desarrollo, que es donde deben explotar |
| **Pedagogía, esta ronda** | Contrato único de vocabulario de bloques, con test que falle al desincronizarse | Barato y hace visible de golpe lo que la IA ya escribe. Construir los 11 bloques muertos es fase propia (WP-10) |
| **Checkouts** | Uno solo: `~/Documents/Learning-routes` | La copia de `LEARNING ROUTES DASHBOARD LANDING PAGE ` se archiva. `09bd58c` ya está contenido en `d18b31a` — cero commits que rescatar |
| **Stack** | Ruby por defecto, otros lenguajes donde ganen de verdad | Pyodide para ejecución de código, ElevenLabs Scribe para pronunciación, el pipeline Python de english-unlimited como generador de assets — no como dependencia en runtime |

---

## PAQUETE 0 — Hoy, sin desplegar nada (30 minutos)

Esto no necesita Claude Code ni un deploy. Son comandos.

### 0.1 · Lo único urgente de verdad

La imagen desplegada contiene un `db/seeds.rb` **sin guarda de entorno** que crea
`admin@learning-routes.com` / `password123` con `role: :admin`, y `bin/docker-entrypoint`
corre `db:prepare` en cada arranque. HEAD ya lo arregla, pero HEAD no está desplegado.

```bash
# ¿Existe la cuenta? — consúltala, NO intentes entrar
kamal app exec --reuse 'bin/rails runner "u=Core::User.find_by(email: %q(admin@learning-routes.com)); puts u ? \"EXISTE role=#{u.role} creada=#{u.created_at}\" : \"no existe\""'
```

Si existe: bórrala o cámbiale la contraseña **ahora**, antes que cualquier otra cosa de este
roadmap. Es una web pública con una credencial de administrador adivinable.

### 0.2 · Confirmar que ninguna imagen publicada filtró claves

La auditoría verificó `latest` y está limpia. Faltan las otras 17 etiquetas del registro
público:

```bash
for t in $(curl -s "https://hub.docker.com/v2/repositories/gilberga/learning_routes/tags?page_size=100" | jq -r '.results[].name'); do
  echo "== $t"; docker run --rm --entrypoint sh gilberga/learning_routes:$t -c 'ls config/credentials config/master.key 2>&1' || true
done
```

Si alguna contiene la clave → rotar OpenAI, ElevenLabs, Brevo y Google OAuth. Si ninguna →
**no hace falta rotar nada**, y nos ahorramos ese trabajo. No rotes por si acaso; comprueba.

### 0.3 · Cerrar las incógnitas de la auditoría

```bash
kamal app version
kamal app exec --reuse 'bin/rails runner "puts ActiveRecord::Base.connection.migration_context.needs_migration?"'
kamal app exec --reuse 'bin/rails runner "puts RouteRequest.group(:status).count.inspect"'
kamal app logs | grep -c StrictLoadingViolationError
kamal app exec --reuse --role web 'ps aux | grep -c solid'
```

La tercera dice cuántos usuarios están bloqueados por P0-4 ahora mismo. La cuarta te da la
frecuencia real del 500. La segunda es la que decide si el deploy de WP-3 es tranquilo o
delicado.

---

## Los paquetes

Cada uno es una sesión de Claude Code. La columna «Bloquea a» es lo que no puede empezar antes.

| # | Paquete | Ítems | Esfuerzo | Bloquea a |
|---|---|---|---|---|
| **WP-1** | Higiene de deploy | P2-1, P3-6, P3-3, P3-7, P0-6 | ~1 h | todo deploy |
| **WP-2** | Desatascar el wizard | P0-1, P0-2, P0-3, P0-4, P0-5 | 1 sesión | — |
| **WP-3** | **Desplegar** los 36 commits + WP-1 + WP-2 | — | 1 h + vigilancia | WP-4→10 |
| **WP-4** | Apagar los 14 rojos + ensanchar CI | P3-1 + 14 nuevas | 1 sesión larga | WP-5, WP-8, WP-9 |
| **WP-5** | Rutas que dejen de ser genéricas | P1-1, P1-3, P1-4 | 1 sesión | WP-6 |
| **WP-6** | Contrato prompt ↔ parser ↔ renderer | P1-2, P1-5, P1-8 | 1 sesión | WP-10 |
| **WP-7** | Dinero y saturación | P1-6, P1-7, P2-7 | 1 sesión | — (paralelo) |
| **WP-8** | Seguridad restante | P2-3, P2-4, P2-5, P2-6 | 1 sesión | — |
| **WP-9** | Borrar código muerto | P3-2, P3-4 | 1 sesión | — |
| **WP-10** | Construir los 11 bloques + corrección en servidor | P1-9 + tabla §8 | fase propia | — |

**Cambio respecto a la secuencia del `AUDIT.md`:** la auditoría propone desplegar (su WP-2) antes
de arreglar el wizard (su WP-3). Lo invierto y los junto en un solo deploy. Razón: desplegar los
36 commits **no arregla el wizard** — P0-1 y P0-2 están igual de presentes en HEAD. Serían dos
big-bang deploys en vez de uno, y el primero dejaría la web con el mismo 500 que tiene hoy. Los
cinco arreglos del wizard son cuatro «S» y una «M»; caben de sobra en el mismo PR.

---

### WP-1 · Higiene de deploy (~1 hora)

Va primero porque **el próximo `kamal deploy` es el que publicaría tu clave de producción** en un
registro público con 1541 pulls.

- **P2-1** `config/master.key` y `config/credentials/*.key` a `.dockerignore`. `Dockerfile:61` es
  `COPY . .` y `config/credentials/production.key` está en disco desde el 7 de julio. La clave no
  hace falta en build — `Dockerfile:67` ya usa `SECRET_KEY_BASE_DUMMY=1`.
- **P3-6** `config/puma.rb:49` → `if ENV["SOLID_QUEUE_IN_PUMA"] == "true"`. Hoy la cadena `"false"`
  es truthy en Ruby y corre un supervisor de colas dentro del contenedor web de 512 MB.
- **P3-3** `volumes:` a nivel raíz en `deploy.yml` (`kamal-2.11.0/lib/kamal/configuration.rb:220`
  confirma que no existe la clave a nivel de rol). Sin esto el audio que genera `job` no lo ve
  `web`, y `storage/` se borra en cada deploy.
- **P3-7** `.kamal/secrets` con passthrough de ENV, para que un deploy desde Actions no mande una
  master key vacía.
- **P0-6** quitar el `|| echo` de `bin/docker-entrypoint:11`. Convierte una corrupción silenciosa
  en un deploy fallido ruidoso — que es el objetivo. **Ojo:** actívalo sabiendo la respuesta de
  0.3 sobre `needs_migration?`.

**Terminado cuando:** `docker run --rm --entrypoint sh <imagen> -c 'ls /rails/config/credentials/'`
no encuentra nada, y la imagen se construye sin la clave.

---

### WP-2 · Desatascar el wizard (1 sesión)

- **P0-1** — dos partes. Config: `:log` en producción, `strict_loading_by_default = true` en
  dev/test. Y el call site: `route_wizard_controller.rb:18` pasa a
  `LearningRoutesEngine::LearningProfile.find_by(user_id: current_user.id)`, que es exactamente
  el patrón que `curriculum_brain.rb:38` ya usa por esta misma razón.
  **Corrección importante de la auditoría:** la línea 8 (`route_requests.pending_or_generating`)
  **no** revienta — una cadena de scope sobre `has_many` emite su propia consulta. Solo la 18.
  Tocar la 8 sería trabajo perdido.
- **P0-2** — `route_wizard_controller.rb:61`, `tag.div` → `helpers.content_tag`.
- **P0-3** — `t("flash.rate_limited")` no existe en ningún locale. Usar `flash.too_many_requests`
  o añadir la clave a ambos.
- **P0-4** — `#new` y `#create` usan predicados distintos: uno mira `generating?`, el otro
  `pending_or_generating`. Igualarlos, acotar por ventana temporal, y añadir un job que barra
  peticiones zombis a `config/recurring.yml`.
- **P0-5** — `content_for(:hide_navbar) { true }` → `{ "1" }`.

**Terminado cuando:** un test de controlador con `as: :turbo_stream` y parámetros inválidos pasa
en verde, y `GET /routes/create` responde 200 con `strict_loading_by_default = true` en test.

---

### WP-3 · Desplegar (1 hora + vigilancia)

El primero en tres meses y con 36 commits detrás. Merece una lista, no un `kamal deploy` a pelo.

**Antes:** correr la suite completa localmente (`bin/rails test test engines/*/test` → 378
tests, verdes según la auditoría). Verificar la imagen sin claves. Anotar `b82338d` como destino
de rollback. Confirmar el estado de migraciones de 0.3.

**Después:** ver `DEPLOY_CHECKLIST.md`. **Corrección:** la instrucción original de este roadmap
(«grep `StrictLoadingViolationError`») era incorrecta. Rails emite ese evento a nivel `debug`
(`log_subscriber.rb:7-13`, `subscribe_log_level :strict_loading_violation, :debug`) y producción
corre a `info`, así que `:log` habría significado `:ignore` en silencio. El initializer
`strict_loading_notification.rb` lo re-emite a WARN. **La verificación correcta es al revés:**
`StrictLoadingViolationError` debe devolver **cero**, y `[StrictLoading]` debe devolver entradas.

**Esto también deja vivo de golpe:** rack-attack, CSP, el arreglo del tutor, la inversión de
FSRS, el oracle de respuestas de assessments, el IDOR del tutor, el pre-hijacking de OAuth y los
parches de CVE de gemas. Es el mayor valor por minuto de todo el roadmap.

**Y despierta tres jobs que llevaban muertos en silencio.** Al pasar de `:raise` a `:log`,
`GapAnalysisJob`, `ReinforcementJob` y `AssessmentGenerationJob` dejan de reventar por dentro y
empiezan a hacer su trabajo de verdad. Es una buena noticia — son funciones que creías rotas — pero
implica gasto de OpenAI en rutas que hasta ahora costaban ~$0. Se disparan por acción del usuario
(terminar un assessment), no por cron, así que escala con uso real y no de golpe. Aun así: los
precios de `cost_tracker.rb` son de febrero y ElevenLabs está tarifado a cero (P1-6, P1-7). **Eso
sube WP-7 de «cuando se pueda» a «la semana siguiente al deploy».**

---

### WP-4 · Apagar los 14 rojos, y solo entonces ensanchar CI (1 sesión larga)

**Redefinido después de WP-2.** Encender el guard en `test.rb` destapó **14 violaciones reales**
(5F 9E) que llevaban invisibles desde siempre. Ya no se puede «arreglar CI» sin arreglarlas antes:
`deploy.yml` despliega con el verde de CI, así que ensanchar CI estando rojo **bloquearía todo
deploy futuro**. El orden dentro del paquete es obligatorio: primero apagar, luego ensanchar.

No son 14 unidades de trabajo. Son cinco:

| Trabajo | Cubre |
|---|---|
| El chequeo de propiedad en los controladores de audio (`step.learning_route`) | **8 de los 9 errores** — una sola causa |
| `RouteGeneratorTest` — `LearningRoute#route_steps` | 1 error |
| `GapAnalysisJob`, `ReinforcementJob`, `AssessmentGenerationJob` | 3 fallos, y son los que importan |
| `RouteGenerationJobTest`, `ContentGenerationJobTest` | 2 fallos — sobre código que WP-9 borra. **Comprobar antes si el test se borra con la clase** en vez de arreglarlo |

Los tres jobs vivos son el hallazgo serio del paquete: **rescatan de forma amplia y convierten la
violación en una ejecución que falla en silencio reportando éxito**. Con `:raise` vivo en
producción desde siempre, eso significa que el análisis de lagunas, los refuerzos y la generación
de assessments **llevan meses sin funcionar en producción, sin que ningún log lo dijera.**

Solo después: correr los engine tests en CI, borrar el job `system-test` que pasa en vacío contra
un directorio inexistente, quitar el `fixtures :all` sin fixtures, y añadir la aserción
`ROUTING_TABLE.keys - TASK_TYPES == []`.

Además de arreglar la ruta: borrar el job `system-test` que corre contra un `test/system/`
inexistente y pasa en vacío, quitar el `fixtures :all` sin fixtures, y añadir tres tests que
habrían cazado lo de esta ronda — regresión de P0-1, regresión de P0-2, y
`ROUTING_TABLE.keys - TASK_TYPES == []`.

Va antes de WP-5 y WP-9 a propósito: es lo que hace seguro tocar el pipeline de IA y borrar 650
líneas.

---

### WP-5 · Rutas que dejen de ser genéricas (1 sesión)

- **P1-1** — `curriculum_design` y `content_agent` a `AiModelConfig::TASK_TYPES`. Una constante.
  Hoy `AiInteraction.create!` revienta con `RecordInvalid`, `CurriculumBrain` se lo traga y
  devuelve `nil`, y **el 100% de las rutas cae a la plantilla fija de 8 pasos**. Los 242 renglones
  de `curriculum_design.yml` y la validación estructural de `curriculum_brain.rb:124-192` están
  listos y esperando.
- **P1-3** — `chat.with_schema(...)`. `ruby_llm 1.11.0` ya lo trae (`chat.rb:95`) y
  `ruby_llm-schema 0.2.5` ya está instalado. Cero call sites lo usan, y `ai_client.rb:39` hace
  `.except(:response_format)`, así que las 12 plantillas que declaran JSON son ignoradas.
- **P1-4** — se resuelve solo con lo anterior: `with_schema` devuelve un Hash y saca el extractor
  del camino caliente. El extractor falla hoy cuando la lección contiene un bloque de código con
  ``` — que es casi siempre.

**Terminado cuando:** dos rutas de temas distintos (portugués y cálculo) producen currículos
distintos, y un test lo asegura.

---

### WP-6 · Contrato prompt ↔ parser ↔ renderer (1 sesión)

Este es el paquete que elegiste. El dato que lo justifica: el prompt pide 12 tipos de ejercicio,
el parser entiende 13 tipos, y **la intersección es exactamente uno** (`flashcards`). El parser
degrada lo desconocido a `concept` y el renderer escupe `:::tap_pairs` literal a la cara del
alumno.

- Corto plazo: acotar los prompts a lo que el parser soporta. Deja de romper hoy.
- El contrato: una sola fuente de verdad del vocabulario, y un test que falle si el prompt, el
  parser, el renderer, los partials o los controladores Stimulus se desincronizan. Sin ese test
  el problema vuelve en tres meses.
- **P1-5** — solo 3 de 17 plantillas llevan `{{language_directive}}`, y `prompt_builder.rb:71`
  usa `gsub!`, que es un no-op cuando el token no está. Por eso un alumno hispanohablante recibe
  quizzes en inglés. Arreglo: añadir la directiva cuando falte el token, no solo sustituirla.
- **P1-8** — `content_error` se escribe y nadie lo lee, así que cada refresh re-encola el pipeline
  fallido y vuelve a pagar.

---

### WP-7 · Dinero y saturación (1 sesión, puede ir en paralelo)

- **P1-6** — ElevenLabs está tarifado a `flat: 0`. El precio real es **$0.10 por 1.000
  caracteres**; una ruta con ~30k caracteres son ~$3 invisibles para todos los topes y alertas.
  Tarifar por carácter y pasar el TTS por `ModelRouter` (hoy lo esquiva, así que el límite de 20
  rpm es config muerta).
- **P1-7** — `gpt-5.2` y `gpt-4.1-mini` ya no están en el catálogo (ago-2026: GPT-5.5 / 5.5 Pro /
  5.4 Standard / Mini / Nano). Los precios de `cost_tracker.rb` son de febrero. Y los tres
  `claude-*` están tarifados pero no enrutados. Todo esto debería vivir en config, no hardcodeado.
- **P2-7** — `get_hint`, `submit_answer` y `answers#create` llaman a la IA **en el hilo de la
  petición**, y el throttle de rack-attack no cubre esas rutas. Con el healthcheck de Kamal en 60s,
  un pico satura Puma, `/up` falla y el deploy se revierte solo.

---

### WP-8 · Seguridad restante (1 sesión)

P2-3 (el reset de contraseña no revoca la cookie *remember me*, y los tokens son reutilizables
durante su ventana) · P2-4 (`/cable` sin `ApplicationCable::Connection`) · P2-5 (`html_safe`
sobre salida del LLM en el chat del tutor) · P2-6 (XP re-jugable; el índice único ya existe como
patrón en `user_answers`, se copia).

---

### WP-9 · Borrar código muerto (1 sesión)

~650 líneas de Ruby más 4 controladores Stimulus. Lo importante: `RouteGenerationPlaceholderJob`
**se sigue encolando en cada onboarding** — hay que borrar la llamada, no solo la clase. Y
`Orchestrate.run_agent` es el origen de la dependencia circular `ai_orchestrator ↔ content_engine`.

Corrección de mi auditoría previa: `lesson_nav` **no** está muerto, tiene 2 referencias.

---

### WP-10 · Los 11 bloques muertos + corrección en servidor (fase propia)

La tabla §8 del `AUDIT.md` es el plano: 4 tipos completamente cableados (todos pasivos), 9
inertes o huérfanos, **11 muertos**, y **cero** corregidos en servidor.

Regla de oro para esta fase: **cada bloque que se construya nace con corrección en servidor.**
Construir 11 bloques más sin ella multiplica el problema que ya existe — los ejercicios viven y
mueren en el DOM, así que FSRS (que está bien implementado y probado) sigue sin comer datos, y el
análisis de lagunas sigue viendo solo opción múltiple.

Tecnología, cuando lleguemos: Pyodide dentro del iframe que ya existe para
`code_challenge`/`bug_fix`/`output_prediction`/`terminal_exercise` — $0 marginal y el límite de
aislamiento ya está construido; ElevenLabs Scribe ($0.22/hora, ya contratado) para pronunciación
en vez del `webkitSpeechRecognition` que solo va en Chrome; y el pipeline de english-unlimited
como generador de assets para `listen_and_type` y clips de input comprensible — escribiendo a
almacenamiento compartido, nunca como dependencia en runtime del Rails.

---

## Lo que NO vamos a hacer ahora, y por qué

| Tentación | Por qué no |
|---|---|
| Arreglar las 101 asociaciones restantes de strict_loading | Semanas, y bloquea todo. `:log` en prod + `:raise` en dev las convierte en telemetría y caza las nuevas |
| Migrar a S3/R2 | Un volumen Docker con nombre es la cantidad correcta de maquinaria para un solo host. R2 cuando haya segundo host |
| Romper las dependencias circulares entre engines | Real, pero no duele hoy. WP-9 elimina una gratis al borrar `run_agent` |
| Rotar todas las credenciales «por si acaso» | La imagen viva está limpia. Comprueba las 17 etiquetas (0.2) y rota solo si aparece algo |
| Construir los 11 bloques ya | Sin contrato (WP-6) ni corrección en servidor, serían 11 juguetes más que no miden nada |

---

## Riesgo principal, y su mitigación

El deploy de WP-3 mueve producción tres meses de golpe, con 36 commits que CI nunca ejecutó
completos. Mitigación: correr los 378 tests a mano antes, desplegar en horario tranquilo, y tener
`b82338d` anotado como rollback. Después de WP-4, este riesgo desaparece para siempre.

---

## Siguiente paso

`PROMPT_02_SHIP_READY.md` cubre **WP-1 + WP-2** en un solo PR desplegable. No despliega desde
dentro: el deploy es un paso humano con la lista de WP-3.
