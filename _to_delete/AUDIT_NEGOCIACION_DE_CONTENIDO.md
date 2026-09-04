# Auditoría: negociación de contenido y respuestas invisibles

Fecha: 2026-09-04 · Rama: `fix/assessment-start-406` · Base: `99f6279`

Todo lo que sigue está verificado. Donde no pude verificar, lo digo.

---

## A. ARREGLADO — el 406 de "Iniciar examen"

### La cadena, eslabón por eslabón

1. Los dos botones son `button_to ... method: :post`
   (`assessments/assessments/show.html.erb:56`, `learning_routes_engine/steps/_assessment.html.erb:72`).
   Turbo 8 (`turbo-rails 2.0.23`) añade `text/vnd.turbo-stream.html` al `Accept`
   de todo submit no-seguro (`form_submission.js`, `requestAcceptsTurboStreamResponse`).
2. `AssessmentsController#start` declaraba `format.turbo_stream`.
3. `assessments/assessments/start.turbo_stream.erb` **no existía**.
   En todo el repo hay 18 plantillas `.turbo_stream.erb`; ninguna era esa.
4. Rails 8.1.3.1, `implicit_render.rb#default_render`: no hay plantilla del
   formato pedido **pero sí hay otra del mismo action** (`start.html.erb`) →
   `raise ActionController::UnknownFormat`.
5. `exception_wrapper.rb`: `"ActionController::UnknownFormat" => :not_acceptable` → **406**.
6. Turbo no puede renderizar un 406 de 0 bytes. La pantalla no se mueve.

### Prueba de fuego en producción (learningroutes.com, sesión real)

Mismo endpoint, dos `Accept` distintos:

| `Accept` enviado | Status | Bytes |
|---|---|---|
| `text/vnd.turbo-stream.html, text/html, ...` (lo que manda `button_to`) | **406** | **0** |
| `text/html` | **200** | **41.924** |

Y el clic real sobre el botón, capturado en red y consola:

```
POST .../start → 406
[error] Failed to load resource: the server responded with a status of 406
```
URL sin cambiar. Pantalla congelada.

**La plantilla nunca fue el problema. El problema fue la negociación.**

### La trampa que casi me como

Borrar `format.turbo_stream` **no lo arreglaba**. `navigator.js` construye
`new FormSubmission(this, form, submitter, true)` — ese `true` es `mustRedirect` —
y `form_submission.js` convierte un `statusCode == 200 && !redirected` en
`Error("Form responses must redirect to another location")`. Mismo síntoma,
otra causa.

### Lo aplicado (`145c7f9`)

- `POST :start` conserva las mutaciones y termina en `redirect_to exam_assessment_path, status: :see_other`.
- Nuevo `GET :exam` renderiza el examen; sin resultado abierto, devuelve a la portada.
- `start.html.erb` → `exam.html.erb` (`git mv`).

Cierra además un agujero que nadie había reportado: **el examen no tenía URL propia**.
Su temporizador llega a 3600 s (`(@questions.count * 120).clamp(300, 3600)`) y un
refresh a mitad no tenía dónde aterrizar.

**Falta desplegar para confirmar en producción.** La prueba de arriba es del código viejo.

---

## B. Tres armas cargadas de la misma clase

Barrido automático de **todos** los `respond_to` de los 7 engines contra la
existencia real de la plantilla (`sweep_formats.rb`). Tres casos vivos:

### B1 · `CommunityEngine::SharedRoutesController#create`
`format.turbo_stream` declarado, sin plantilla y sin bloque inline.
Hoy el único llamador (`share_controller.js:105`) manda `Accept: application/json`,
así que la rama es inalcanzable. El día que alguien ponga un `button_to` ahí: 406 mudo.

### B2 · `LearningRoutesEngine::BlockAttemptsController#create`
Igual. Ese controlador **no tiene directorio de vistas**.
`block_submission.js:41` manda JSON, así que hoy no explota.

### B3 · `ContentEngine::LessonsController#interact` — el peor
`agent_interact` termina en `respond_to { format.turbo_stream }`, y Rails busca la
plantilla por **`action_name`**, que es `interact`. Las cuatro acciones legacy
(`explain_differently`, `give_example`, `simplify`, `deepen`) sí tienen la suya;
el endpoint "unificado" no tiene ninguna.

Y aquí Rails **no lanza excepción**: como no existe *ninguna* plantilla
`interact.*`, `any_templates?` es falso, `interactive_browser_request?` también
(`request.get? && format == html && !xhr?` — es un POST xhr), así que cae en
`basic_implicit_render.rb#default_render` → **`head :no_content`** → **204**.

Del lado del cliente, `ai_interaction_controller.js:39`:
```js
if (response.ok) { const html = await response.text(); Turbo.renderStreamMessage(html) }
```
204 **es** `ok`. `text()` devuelve `""`. `renderStreamMessage("")` no hace nada.
**Sin error en consola, sin línea en el log, sin nada.** Hoy está latente porque
`#interact` solo se llama con JSON, pero es el más peligroso de los tres:
falla sin dejar rastro.

---

## C. Lo que barrí y salió limpio

- **Rutas que apuntan a nada:** el script marcó 4; las 4 eran falsos positivos
  míos (`namespace :commerce`, y `core/omniauth_callbacks` que vive en el engine
  `core`). Verificadas una por una. **Cero rutas rotas.**
- **Acciones públicas que no responden nada:** una sola, y es B3.
- **`format.turbo_stream` con `render turbo_stream:` inline** en `likes`, `follows`,
  `ratings`, `notes`, `tutor_chats`: correctos, no necesitan plantilla.
- **JS que pide turbo-stream** (`star_rating`, `tutor_chat`, `code_editor`,
  `theme_toggle`, `follow`, `note_taking`, `question_nav`, `interactive_lesson`):
  todos apuntan a acciones que sí producen turbo-stream.

---

## D. Voz: la arquitectura está bien, el reporte de errores no

Lo que **sí** está en su sitio (lo verifiqué todo):

- `turbo_stream_from "step_content_#{step.id}"` existe (`_recorder.html.erb:4`).
- El div `voice-interaction-<step.id>` existe (`_audio_lesson.html.erb:85`).
- `_evaluation_result` y `_evaluation_failed` existen.
- `VoiceEvaluator#evaluate!` escribe `status: "completed"`, que es exactamente lo
  que el JS espera en `pollEvaluation`.
- El volumen compartido `web`↔`job` ya está resuelto y documentado en `config/deploy.yml:72-90`.

Lo que **no** está bien:

**Todo camino de fallo termina igual: `showState("idle")` y un `console.error`.**
Un 403 de `ModuleAccessPolicy.generation_allowed?`, un fallo de Scribe, un audio
rechazado por tamaño o tipo — los cuatro se ven idénticos para el usuario:
*no pasó nada*. Es el espejo exacto de la regla de WP-24 ("un bloque que gatea
nunca debe llegar a un estado terminal sin decírselo al servidor"): aquí el
servidor sí se entera, y el que nunca se entera es el usuario.

**Dato de la prueba en vivo:** la página de evaluación tiene **0 grabadores de voz**
(`[data-controller~="voice-recorder"]` → 0). El grabador solo se renderiza dentro
de `_audio_lesson`, o sea en pasos de tipo audio. Si lo probaste desde la
evaluación, no había nada que responder.

**No pude reproducir el fallo de voz en producción** — requiere micrófono real.
Esto es análisis estático, no una prueba.

---

## E. Idiomas: el asistente de creación de rutas está partido en dos

`app/views/route_wizard/_wizard_card.html.erb`, la primera pantalla de un usuario nuevo:

- Títulos en inglés, hardcodeados: `"What do you want to learn?"`, `"Choose your pace"`.
- Los 12 temas en español, hardcodeados: `"Programación"`, `"Ciencia de Datos"`, `"Salud y Bienestar"`…
- Los 3 ritmos en inglés, hardcodeados: `"Relaxed" / "Take it easy, no pressure"`.

Ni un `t()` en esos bloques. Un usuario en inglés ve "Ciencia de Datos"; uno en
español ve "Take it easy, no pressure". En un producto de idiomas.

Otros cuatro literales sin traducir:
- `steps/lesson_sections/_example.html.erb:31` — "Dame otro ejemplo"
- `steps/lesson_sections/_summary.html.erb:13,16` — "Lo que aprendiste", "Conceptos clave de esta lección"
- `steps/lesson_sections/_audio.html.erb:32` y `_audio_explainer.html.erb:36` — "Generar explicación en audio con IA"

---

## F. El engine `assessments` no tiene una sola prueba de controlador

`engines/assessments/test/` contiene:
- `assessments_test.rb` → `assert Assessments::VERSION`
- `integration/navigation_test.rb` → un test comentado
- tres tests de modelo

**Ninguna prueba tocaba `#start`.** El 406 no podía ser detectado por la suite,
por definición. Un test que hiciera `post start_assessment_path(a),
as: :turbo_stream` y esperara un redirect lo habría fijado en su sitio.

---

## G. CSP: no es tuyo

No existe **ni un solo** manejador inline (`onclick=`, `javascript:`) en `app/`
ni en los engines. En el panel del navegador limpio, sin extensiones, la consola
del clic real trajo únicamente el 406 y un warning de `Feature-Policy`.
Los errores de CSP que veías son ruido de extensión.

---

## H. Nota suelta

El commit `000eb28` lleva como mensaje el texto de ayuda del editor de git
(`# Please enter a commit message...`). Cosmético, pero queda en el historial.

---

## Lo que no pude hacer

- **Correr la suite.** El VM del puente no tiene `bundle`, y tu Rails local no
  arranca (`ActiveSupport::MessageEncryptor::InvalidMessage` en
  `config/environments/development.rb:48`: la master key no descifra las credenciales).
  El arreglo está verificado por lectura de fuentes de Rails y Turbo y por prueba
  en producción del defecto, **no por tests**.
- **Verificar el arreglo desplegado.** Falta el deploy.
