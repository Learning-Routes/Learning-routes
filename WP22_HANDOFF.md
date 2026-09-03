# WP-22 — La lección seguía sin poder terminarse

**Escrito:** 2026-09-03 · **Rama:** `wp22-lesson-completion`, base `main` @ `462f076`
**Árbol limpio. No fusionada, no desplegada.**

---

## 1. §B — qué era, y era mío

**WP-21 rompió el envío de los `check`.**

`block_submission.js` resuelve el endpoint así:

```js
const host = element.closest("[data-block-url-value]")
const url = host?.dataset?.blockUrlValue
if (!url) return null          // falla EN SILENCIO
```

y su propio comentario lo dice: *"The URL lives on the `.lesson-section` wrapper rendered by
`_lesson.html.erb`"*. WP-21 sacó el modal del `check` fuera de ese wrapper para darle tamaño —
correcto, y por dos razones independientes — pero ese wrapper era **el único portador** de
`data-block-url-value`. Desde entonces `closest()` no encontraba nada, `submitBlock` devolvía
`null` sin lanzar nada, y `announceResult` sale temprano con un resultado nulo.

Por eso las secciones 14 y 15 **no produjeron ninguna petición**. No una fallida: ninguna. Y por
eso el servidor rechazaba con `{"blocks_required":true,"sections":[14,15]}` — tenía razón.

**Por qué los tests de WP-21 no lo vieron.** Afirmaban lo que hace el CLIENTE: el modal es
visible, sus opciones son clicables, el pie se desbloquea. El pie se desbloquea con
`_locked = gates && !satisfied && !(isCheck && isAnswered)`, y `isAnswered` se pone localmente en
cuanto se hace clic en una opción. La suite entera estaba verde sobre una lección que el servidor
nunca iba a completar: el cliente se desbloqueaba con una afirmación que el servidor jamás vio.

**El arreglo:** el modal lleva ahora su propio `data-block-url-value`. Es lo que tiene que hacer,
dado que WP-21 lo dejó deliberadamente sin sección ancestro.

**La aserción que ahora falla sin el arreglo**, borrando sólo ese atributo:

```
LessonCompletionTest#test_answering_a_check_records_a_BlockAttempt_on_the_server
answering the check produced NO submission at all — the block never reached /blocks/2,
so the gate can never be satisfied
```

Los tres tests de §B se afirman sobre estado de **servidor** — una fila `BlockAttempt` y
`outstanding_blocks_for` — porque es la única evidencia que el cliente no puede fabricar.

**Nota sobre `completed?` vs `outstanding_blocks_for`.** Todo paso de lección pasa además por una
puerta de mini-quiz (`requires_quiz?` es cierto para `content_type: lesson`), que no es §B y no se
ha tocado. Por eso el test afirma que la puerta de BLOQUES queda limpia, que es exactamente lo que
el 422 nombraba en producción.

---

## 2. §A — la decisión, y que era más grande que el fantasma

El fantasma es real: la plantilla del 422 llevaba `data-controller="interactive-lesson"` en un div
sin secciones. **Pero encontré algo mayor en el mismo camino.**

`completeLesson` manejaba en su rama 422 **sólo** `quiz_required`. El otro rechazo —
`blocks_required` — caía directamente hasta `_showCelebrationScreen(serverData)` con `serverData`
nulo: **al alumno se le felicitaba por una lección que el servidor acababa de rechazar.** Y peor:
`this._completed = true` se pone al principio de `completeLesson` y no se reponía en ese camino,
mientras `nextSection` y `previousSection` salen temprano con `_completed`. Tras el primer rechazo
la lección dejaba de responder del todo — que es literalmente lo que el dueño reportaba.

**La decisión:** **quitar** el `data-controller`, no sustituirlo por un controlador de resaltado.

- Nunca hizo lo que su propio comentario prometía ("Scrolls them back to the first one"):
  `interactive_lesson_controller.js` **jamás** ha leído `data-outstanding-sections`. Verificado
  con `grep`: cero ocurrencias.
- Lo que sí hacía era montar un segundo `interactive-lesson` sin secciones, donde `nextSection`
  calcula `0 + 1 >= 0` y llama a `completeLesson()`.
- La intención se implementa ahora en el controlador que **sí** tiene las secciones:
  `_showOutstandingBlocks` lleva al alumno a la primera sección pendiente — el modal si es un
  `check`, si no una transición más `_announceLocked`, que escribe el mensaje DENTRO de la sección
  a la que se le lleva.

**Defensa en profundidad, y honestidad sobre su fuerza.** Se añade `_inert`, puesto cuando el
controlador conecta con cero secciones y comprobado por `nextSection`, `previousSection` y
`completeLesson`. `connect()` ya salía temprano ahí, pero una salida temprana sólo se salta la
CONFIGURACIÓN: deja todos los métodos de acción invocables.

Elegido frente a "un valor requerido sin default" porque un elemento sin secciones no es un error
de configuración sobre el que gritar en el navegador de un alumno; negarse a actuar es
simplemente lo correcto.

**El test de plantilla falla sin el arreglo. El test de comportamiento del fantasma NO falla**,
porque la salida temprana de `connect()` ya amortigua un fantasma sintético que no tiene
`complete-url-value`. Lo digo explícitamente: la guarda es el cinturón, la plantilla son los
tirantes.

---

## 3. §D1, resuelto de paso

**El rechazo era invisible, y la causa raíz no es sólo dónde se pinta.**
`show_outstanding_blocks.turbo_stream.erb` hace `turbo_stream.replace "step-complete-feedback"`, y
ese id **no existe en ninguna parte de la aplicación** (verificado con `grep` en `app/` y
`engines/`; lo único parecido es `#step_complete_btn`, con guiones bajos, en
`layouts/learning.html.erb:84`). Turbo no encuentra el objetivo y descarta el stream en silencio.

Ahora el 422 se maneja en el cliente desde el JSON que ya venía, y el mensaje aparece dentro de la
sección pendiente vía `_announceLocked`. La plantilla se conserva (la usa el camino
turbo-stream de `_showQuizGate`) pero ya no monta un controlador.

---

## 4. Lo que NO se hizo — §C y §D2

Se priorizó el bloqueante. Estos quedan **sin arreglar**, con lo verificado hasta ahora para que
el siguiente no repita el diagnóstico:

| # | Estado |
|---|---|
| §C1 `hover_controller` | **Confirmado.** `app/views/profiles/show.html.erb:147` declara `data-controller="hover"` y `app/javascript/controllers/hover_controller.js` no existe. Arreglo: crear el controlador o quitar el atributo. |
| §C2 Mermaid | **No diagnosticado.** El `catch` está en `mermaid_diagram_controller.js:63-65` y hace `this._showFallback(el, code)`; falta seguir de dónde sale `code` y confirmar que es el CSS generado. |
| §C3 CSP worker | **Confirmado por lectura.** `config/initializers/content_security_policy.rb:18` declara `script_src` y **no hay `worker_src`**, así que un worker `blob:` cae a `script_src` y se bloquea. Decisión pendiente: `worker_src :self, :blob` o quitar el worker del confeti. |
| §C4 handlers inline | **No localizados.** Requiere buscar `onclick=` en las vistas del paso. |
| §C5 tutor stream 404 | **No diagnosticado.** |
| §D2 "Completar paso" pulsable desde la sección 0 | **No hecho.** `data-outstanding-sections` ya viaja en la respuesta. |

Ninguno es el bloqueante; todos son reales.

---

## 5. Verificación

| Suite | Antes (`462f076`) | Después |
|---|---|---|
| Principal | 554 runs, 2251 aserciones, 0F 0E | **554 runs, 2251 aserciones, 0F 0E** |
| Navegador | 27 runs, 201 aserciones, 0F 0E | **32 runs, 248 aserciones, 0F 0E** |
| Combinada | 910 runs, 3F 1E | **915 runs, 3460 aserciones, 3F 1E** |
| RuboCop | limpio | **539 archivos, sin ofensas** |

La suite principal no se mueve: el defecto vive entre el navegador y el servidor, y ninguna prueba
de Rails lo alcanza. Los cinco tests nuevos son de navegador.

Fallos de la combinada: intersección de 3 ejecuciones en ambos extremos, exactamente los cuatro
conocidos, sin tocar:
`GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`,
`RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`.

---

## 6. Lección para la próxima red

WP-21 escribió 20 tests de navegador y ninguno detectó que la respuesta nunca salía del cliente,
porque todos preguntaban al DOM. La regla que sale de aquí:

> Cuando la corrección mueve un elemento en el DOM, hay que volver a afirmar sobre el
> **servidor**, no sobre la pantalla. Lo que se movió pudo llevarse consigo un contrato que
> dependía de la contención — aquí, `closest("[data-block-url-value]")`.

`test/system/lesson_completion_test.rb` es esa red: afirma filas `BlockAttempt` y
`outstanding_blocks_for`, nunca el estado del botón.
