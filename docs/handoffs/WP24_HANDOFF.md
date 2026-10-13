# WP-24 — La lección imposible de terminar

**Escrito:** 2026-09-03 · **Rama:** `wp24-unfinishable-lesson`, base `main` @ `612e133`
(que ya lleva WP-22 fusionada) · **Árbol limpio. No fusionada, no desplegada.**

---

## 1. §1 — el bloqueante

Confirmado exactamente como venía descrito. La rama del temporizador en
`lesson_quiz_controller.js` terminaba el bloque **entero del lado del cliente**: `_answered = true`
(que alimenta el `isAnswered` local del cierre de navegación), `pointerEvents: none` en todas las
opciones, y `quiz:completed` despachado. Nunca enviaba nada.

El único emisor de un `check` es `lesson-check#select`, que se dispara con un **clic** que esa
misma rama acababa de hacer imposible. Sin `BlockAttempt`, `outstanding_blocks_for` no limpiaba
nunca, `complete` rechazaba con `blocks_required`, y el `_showOutstandingBlocks` de WP-22 devolvía
fielmente al alumno a esa misma pregunta muerta. Sin salida.

Es la misma separación cliente-cree/servidor-no-sabe que causó la regresión de WP-21 y que WP-22
arregló en su primera instancia. Ésta era la segunda.

**El arreglo:** el temporizador avisa a `lesson-check`, que registra. **Un solo emisor por
bloque**, que es para lo que `block_submission.js` fue diseñado — `lesson-quiz` es dueño del
temporizador, el XP y los corazones, y no hace POST jamás. `_submitted` protege ambos caminos.

### CORRECCIÓN AL BRIEF — verificada en el código

El brief afirmaba:

> `BlockGrader#grade_check` already handles this correctly — `return graded(false, 0) if
> chosen.nil?` — so a timeout grades as wrong, scores zero, and **satisfies the gate**.

**No satisface la puerta.** En `block_attempt_recorder.rb:58` y `:71-74`, `completed_at` — que es
lo que leen `BlockAttempt.satisfied` y por tanto `outstanding_blocks_for` — se pone **sólo** cuando
la respuesta es correcta, o tras `RELEASE_AFTER` fallos. Un timeout graduado como incorrecto cuenta
**un intento** y no satisface nada.

Registrarlo era necesario pero **no suficiente**. Los dos controladores hijos se quedan
enganchados (`_activated` en lesson-quiz, `_answered`/`_submitted` en lesson-check) y las opciones
quedan muertas, así que un `check` al que se devuelve al alumno presentaba una pregunta
inrespondible — y el contador de intentos nunca podía llegar a la liberación que lo desatasca.

Por eso `_showQuizModal` ahora **resetea** ambos controladores cuando la sección todavía no está
satisfecha, antes de activarlos. Tres timeouts llegan a `RELEASE_AFTER` y limpian la puerta: es la
política de WP-10 **aplicada**, no esquivada. No se cambió ninguna regla de graduación.

---

## 2. §3 — la pregunta inrespondible

`BlockGrader` ya llevaba escrito el instinto correcto — *"Fail OPEN on data quality: a section we
cannot grade must never trap a student behind our own generation bug"* — pero eso aplica al
**graduar**, que ocurre por envío. La **puerta** se decide antes de que exista ningún envío, así
que nunca lo consultaba.

`BlockGrader.answerable?` responde la pregunta de la puerta: un `check` sin enunciado, sin opciones
o sin ninguna marcada como correcta es inrespondible, igual que cualquier bloque de puerta vacío.
`outstanding_blocks_for` los omite.

**El cierre del cliente se renderiza con su propia expresión**, así que `data-gating` consulta
`answerable?` también. Sin eso el servidor dejaría pasar al alumno mientras el botón Continuar
seguiría negándose — exactamente la misma separación cliente/servidor de §1.

**Lo que este commit NO hace:** arreglar **dónde se pierde el enunciado**. Detiene la trampa; no
hace la pregunta respondible. Los tres candidatos del brief siguen sin investigar:
`parse_heading_check` (`lesson_section_parser.rb:261`), `inject_metadata_checks` (`:536`), y el
prompt generador (`lesson_content.yml`). Quien lo retome: el arreglo va en la capa donde el dato
se pierde, y la guarda de la puerta ya está puesta debajo.

---

## 3. Lo que NO se hizo

**§2 completo — el terminador de `parse_heading_scenario`.** No empezado. Es un cambio de parser
más un fichero de tests nuevo (`section_parser_boundaries_test.rb`) que debe cubrir **todos** los
`parse_heading_*`, más la decisión de producto sobre "Try Again" y las cadenas en inglés de
`_scenario.html.erb`. Se priorizó §1 (bloqueante) y §3 (reparte preguntas que cuestan corazones),
que es el orden que el propio brief pedía. §2 sigue siendo WP-23 §6.

**La verificación en el sitio en vivo.** No es posible desde aquí y hay que decirlo claro: el
arreglo **no está desplegado**, así que visitar
`/learning/routes/60452d4b…/steps/3700fee4…` hoy ejercitaría el código viejo y no probaría nada.
Además CI está en rojo desde WP-17 (`db/structure.sql` usa `transaction_timeout`, de PostgreSQL 17,
y CI corre `postgres:16-alpine`), así que el auto-despliegue no se dispara. **Un humano despliega**,
y la verificación en vivo — dejar expirar un temporizador a propósito y terminar la lección — sigue
pendiente para después de ese despliegue. Es el paso que confirma §1 de verdad.

**No tocado, deliberadamente:** `BlockGrader`, `BlockAttemptRecorder` y la política de gating de
WP-10; WP-21 (los modales siguen fuera de las secciones); los cuatro fallos de engine conocidos.

**Anotado y no arreglado**, como pedía el brief: la imagen generada del paso muestra texto falso
ilegible (`IMCLER PAGA PRINCTPAINTIDS`). Decisión ya tomada — prohibir texto en imágenes generadas
y poner las etiquetas en HTML — y tiene su propio hueco en la hoja de ruta.

---

## 4. Verificación

| Suite | Antes (`612e133`) | Después |
|---|---|---|
| Principal | 554 runs, 2251 aserciones, 0F 0E | **564 runs, 2276 aserciones, 0F 0E** |
| Navegador | 32 runs, 248 aserciones, 0F 0E | **39 runs, 317 aserciones, 0F 0E** |
| Combinada | 915 runs, 3F 1E | **932 runs, 3554 aserciones, 3F 1E** |
| RuboCop | limpio | **541 archivos, sin ofensas** |

Principal y navegador: **tres ejecuciones cada una, idénticas**. Combinada: intersección de tres,
exactamente los cuatro fallos de engine conocidos, sin tocar:
`GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`,
`RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`.

Las cifras "antes" se midieron sobre el árbol de `wp22-lesson-completion`, que es idéntico al de
`612e133` (la fusión fue un avance limpio).

### Los dos tests, en rojo antes del arreglo

**§1**, quitando sólo el despacho del temporizador:

```
BlockTerminalStatesTest#test_a_timed-out_check_reaches_the_server_and_counts_one_attempt
the timer expired and the server was never told: no BlockAttempt, so
outstanding_blocks_for can never clear this check and the step is unfinishable

BlockTerminalStatesTest#test_repeated_timeouts_reach_RELEASE_AFTER_and_clear_the_blocks_gate
timeout #1 did not record; the student can never reach the release
```

**§3**, quitando sólo la guarda de `outstanding_blocks_for`:

```
LearningRoutesEngine::UnanswerableGateTest#test_a_check_with_no_stem_does_not_gate_the_step
a check with no question is unanswerable except by guessing; it must not trap.
Expected [{:section_index=>0, :block_type=>"check"}] to be empty.
```

### Un fallo del test que merece registrarse

Los primeros intentos de `block_terminal_states_test.rb` fallaban con el arreglo puesto. La causa
no era la aplicación: `wait_for_attempt` era un bucle cerrado sin `sleep`, y en un test de sistema
**Puma corre en un hilo de este mismo proceso**, así que el bucle mataba de hambre al servidor que
el navegador estaba esperando. La fila nunca podía aparecer. Ahora lleva `sleep 0.1` y el comentario
explica por qué no es cortesía.

---

## 5. Sobre la clase de test

`block_terminal_states_test.rb` cubre **el `check` conducido de verdad** en sus tres finales
(correcto, incorrecto, expirado) más el reintento, todo con aserciones de **base de datos**.

Para los otros cuatro tipos de puerta **no** conduce la matriz completa por el navegador, y decirlo
es mejor que fingirlo. Lo que sí fija barato es la precondición que todos necesitan: un controlador
que no puede alcanzar `submitBlock` no puede avisar al servidor de nada. Si se añade un tipo de
puerta nuevo, el test falla hasta que se le dé fila y controlador.
