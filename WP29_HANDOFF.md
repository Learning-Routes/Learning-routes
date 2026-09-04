# WP-29 — La evaluación no califica, no guarda, no bloquea y se multiplica

**Escrito:** 2026-09-04 · **Rama:** `wp29-exam-grading-and-gating`, base `main` @ `3e547fe` (WP-28)
**Árbol limpio. No fusionada, no desplegada. Nada ejecutado contra producción.**

Los cuatro hallazgos venían de conducir el sitio en vivo, no de leer código. Los cuatro eran
reales. Ninguno era visible desde el servidor: en los cuatro el servidor respondía 200.

---

## §1 — ninguna respuesta de opción múltiple ha calificado bien nunca

Había **dos calificadores para un solo vocabulario**, y sólo uno normalizaba:

```ruby
step_quizzes_controller.rb   normalize_answer(a) == normalize_answer(b)   ✅
answers_controller.rb        a.strip.downcase == b.strip.downcase         ❌
```

El value del radio es la opción literal (`"A) Subject + Verb + Object"`) y el generador guarda
`"correct_answer": "A"`. Así que la comparación era `"a) subject + verb + object" == "a"` —
**falsa siempre**. Alguien encontró esto en la ruta del step-quiz, lo arregló ahí, y dejó el otro
calificador intacto. Sexta aparición de la clase "dos copias de un vocabulario" en este repo.

Y hay una trampa encima: **los dos prompts del generador no se ponen de acuerdo entre ellos.**

```
assessment_questions.yml:29   "correct_answer": "A"
exam_questions.yml:29         "correct_answer": "The correct answer"
```

Los **dos** formatos existen en producción. El `normalize_answer` viejo sólo manejaba el primero
(mapeaba `"a) subject…"` a `"a"`, que nunca es igual a `"subject…"`), así que copiarlo al otro
calificador habría dejado fallando todos los exámenes del segundo formato, por otro motivo.

`Assessments::AnswerNormalizer` es ahora **el único sitio** donde una respuesta se compara con
`correct_answer`, y entiende los dos formatos. Hay un test de barrido que falla si alguien vuelve
a comparar `correct_answer` a mano en cualquier archivo.

---

## §2 — seleccionar no guardaba nada, y enviar no recogía nada

El único enlace con la ruta de guardado era el botón "Guardar respuesta"; `change->markAnswered`
sólo toca estado del cliente. Un alumno que seleccionaba las cuatro opciones y pulsaba "Enviar
evaluación" mandaba cuatro radios marcados y **cero peticiones** a `/answers`. El examen puntuaba
0% con cuatro "sin responder" — un examen que había contestado bien.

**Enviar ahora entrega lo que está seleccionado, por la MISMA ruta `_save` que usa el botón** (un
solo remitente, no una copia), y puntúa sólo cuando todos los guardados han llegado. Si alguno
falla, **no se envía**: se dice qué pregunta y se deja reintentar, porque enviar tras un guardado
parcial puntúa un examen entero con la mitad de sus respuestas. El botón no se puede pulsar dos
veces mientras la recogida está en vuelo.

**Deliberadamente NO se guarda en `change`.** WP-27 hizo que una respuesta sea definitiva una vez
dada, así que guardar al primer clic haría definitivo el primer clic y quitaría el derecho a
cambiar de idea; y relajar esa regla reabre el agujero de "haz clic en todas las opciones" que
WP-27 cerró. "Entregado para calificar" es el momento que un alumno ya entiende como definitivo.

### El contador, que el brief mandaba investigar de paso

`data-controller="exam-timer question-nav"` estaba en `.flex-1`, y **la barra lateral es hermana de
ese div**. `navItem` y `currentIndicator` quedaban fuera del alcance del controlador: por eso
`hasCurrentIndicatorTarget` era `false`, `updateDisplay` no hacía nada, y el contador decía "0 de 4
respondidas" pasara lo que pasara. Los cuadraditos nunca se ponían verdes y **los botones numerados
de la barra estaban muertos**, porque `goToQuestion` no se disparaba nunca. El controlador ahora
envuelve las dos columnas.

---

## §3 — suspender completaba el paso

`submit` llamaba a `complete_step!` **incondicionalmente**. La evaluación era decoración: se
guardaba una nota, se ponía `passed`, y **nadie leía ninguna de las dos**. Se podía sacar un 0% y
avanzar igual que con un 100 — y encima te felicitaban:

```
-"Obtuviste 0.0%. Necesitas 70% para continuar. Inténtalo otra vez..."
+"¡Evaluación enviada! Puntuación: 0.0%"
```

Bloquear sólo con `passed?` habría cambiado un resultado roto por otro peor: un alumno atrapado
para siempre detrás de una pregunta con la clave mal — que es justo lo que este repo ya ha
desplegado dos veces (§1 de este mismo paquete). `Assessments::AdvancementPolicy` da tres salidas,
y **sólo la primera es aprobar**:

| salida | qué significa | avanza |
|---|---|---|
| `passed` | se lo ganó | sí |
| `released` | falló `RELEASE_AFTER` veces; dejamos de bloquearle | sí, **marcado como no superado** |
| `unanswerable` | el examen no lo puede aprobar nadie | sí, **marcado como no superado** |
| `blocked` | puede volver a intentarlo | no |

Las dos del medio escriben `advanced_without_passing` y el motivo en el `metadata` del paso, para
que nada río abajo confunda una válvula de escape con un aprobado. `RELEASE_AFTER` se **referencia**
desde `BlockAttempt`, no se redeclara, para que no puedan separarse.

**"Imposible de aprobar" es una regla exacta, no un presentimiento.** Una pregunta de opción
múltiple cuyo `correct_answer` no coincide con ninguna opción limita la nota máxima alcanzable; el
examen es imposible sólo cuando ese techo queda por debajo de `passing_score`. Una pregunta rota de
cuatro deja un 75% contra un corte del 70%, así que **la barrera sigue funcionando** — hay un test
exactamente de eso, porque la versión floja de esta regla habría desactivado la barrera en todo el
producto.

---

## §4 — el refuerzo inundaba la ruta

`AdaptiveDifficulty#adjust!` insertaba tres pasos de refuerzo por cada envío flojo, sin mirar si ya
había refuerzo sin terminar. Ahora se inserta **como mucho un bloque pendiente por ruta**: si queda
refuerzo `locked`/`available` sin tocar, no se inserta nada y se registra por qué. Los títulos y
descripciones pasan por I18n en los dos idiomas (estaban en español fijo en el código).

---

## Verificación

| Suite | Antes (`3e547fe`) | Después |
|---|---|---|
| Principal | 619 runs, 2418 aserciones, 0F 0E | **625 runs, 2434 aserciones, 0F 0E** |
| Navegador | 47 runs, 352 aserciones, 0F 0E | **50 runs, 371 aserciones, 0F 0E** |
| Combinada (con engines) | 978 runs, 3697 aserciones, **3F 1E** | **1005 runs, 3766 aserciones, 3F 1E** |
| RuboCop | limpio | **559 archivos, sin ofensas** |

Principal, navegador y combinada: **tres ejecuciones cada una, idénticas**. La intersección de las
tres combinadas son exactamente los cuatro fallos de engine conocidos, los mismos cuatro que en la
línea base — `GapAnalysisJobTest`, `ReinforcementJobTest`, `RouteGenerationJobTest`,
`RouteGeneratorTest`. **No los toqué.**

### En rojo antes del arreglo (todos verificados)

```
§2, en un navegador de verdad
ExamSubmitGathersTest#test_selecting_every_answer_and_pressing_send_records_every_answer_and_scores_100
submit did not gather: the form posts the score with no answers attached.
Expected: 4
  Actual: 0

§2, el contador
ExamSubmitGathersTest#test_the_sidebar_counts_the_answers_as_they_are_selected
Expected: "4 de 4 respondidas"
  Actual: "0 de 4 respondidas"

§3
FailingDoesNotAdvanceTest#test_failing_the_exam_leaves_the_step_incomplete
failing the exam completed the step: complete_step! ran unconditionally

FailingDoesNotAdvanceTest#test_the_student_is_told_why,_in_their_own_locale
Expected: "Obtuviste 0.0%. Necesitas 70% para continuar..."
  Actual: "¡Evaluación enviada! Puntuación: 0.0%"

FailingDoesNotAdvanceTest#test_an_unanswerable_exam_does_not_gate,_on_the_very_first_attempt
Expected: "unanswerable"
  Actual: nil
```

### Un fallo intermitente que era MÍO, no del test

La tercera ejecución combinada tumbó mi propio test de §2. No era escamoteo del navegador: durante
la recogida **cada guardado rechazado escribía el mismo banner**, así que el alumno veía pasar
hasta cuatro mensajes y quedaba el de la petición que terminara la última. Lo arreglé en el
código (`announce: false` durante la recogida; el resumen escribe el banner una sola vez), no en el
test. Fallaba ~40% de las veces; seis ejecuciones seguidas limpias después.

---

## El censo — NO lo tengo, y no me lo voy a inventar

No hay acceso a producción desde aquí (`kamal` no es utilizable en este entorno; el Postgres es
un accesorio en la red interna de Docker del box de Hetzner). Las consultas están escritas contra
el esquema real, con los nombres de tabla y los valores de enum verificados en `db/structure.sql`.
`kamal pg-shell`:

```sql
-- §1. Respuestas de opción múltiple marcadas MAL que en realidad eran correctas
--     (el formato "correct_answer": "A" contra un value "A) ...").
--     question_type 0 = multiple_choice.
SELECT count(*) AS respuestas_mal_calificadas,
       count(DISTINCT ua.assessment_result_id) AS resultados_afectados
FROM assessments_user_answers ua
JOIN assessments_questions q ON q.id = ua.question_id
WHERE ua.correct = false
  AND q.question_type = 0
  AND lower(btrim(q.correct_answer)) ~ '^[a-z]$'
  AND lower(btrim(ua.answer)) ~ ('^' || lower(btrim(q.correct_answer)) || '[).:]');

-- §3. Pasos completados por una evaluación SUSPENDIDA y nunca aprobada.
--     status 3 = completed.
SELECT count(DISTINCT rs.id) AS pasos_abiertos_por_un_suspenso
FROM learning_routes_engine_route_steps rs
JOIN assessments_assessments a ON a.route_step_id = rs.id
WHERE rs.status = 3
  AND EXISTS (SELECT 1 FROM assessments_assessment_results r
              WHERE r.assessment_id = a.id AND r.score IS NOT NULL AND r.passed = false)
  AND NOT EXISTS (SELECT 1 FROM assessments_assessment_results r2
                  WHERE r2.assessment_id = a.id AND r2.passed = true);

-- §3 bis. Exámenes que HOY nadie puede aprobar (el techo alcanzable < nota de corte).
SELECT count(*) FROM (
  SELECT a.id
  FROM assessments_assessments a
  JOIN assessments_questions q ON q.assessment_id = a.id
  GROUP BY a.id, a.passing_score
  HAVING 100.0 * count(*) FILTER (
           WHERE q.question_type <> 0
              OR EXISTS (SELECT 1 FROM jsonb_array_elements_text(q.options) o
                         WHERE lower(btrim(o.value)) = lower(btrim(q.correct_answer))
                            OR (lower(btrim(q.correct_answer)) ~ '^[a-z]$'
                                AND lower(btrim(o.value)) ~ ('^' || lower(btrim(q.correct_answer)) || '[).:]')))
         ) / count(*) < a.passing_score
) imposibles;

-- §4. Pasos de refuerzo, y cuántos ha tocado de verdad un alumno.
SELECT count(*) FILTER (WHERE status IN (0,1)) AS sin_tocar_borrables,
       count(*) FILTER (WHERE status IN (2,3)) AS tocados_NUNCA_borrar,
       count(DISTINCT learning_route_id)       AS rutas_afectadas
FROM learning_routes_engine_route_steps
WHERE metadata->>'reinforcement' = 'true';
```

Las cuatro consultas **se ejecutaron contra la base de datos de desarrollo** antes de escribirlas
aquí: corren y devuelven columnas (ahí salen ceros porque esa base no tiene esos datos). Lo que
está verificado es que el SQL es válido, no las cifras — las cifras sólo salen en producción.

El §4 también está como tarea: `bin/rails wp29:census` (sólo lectura) y `bin/rails wp29:cleanup`
(destructiva). **Es una tarea rake y no una migración a propósito:** `bin/docker-entrypoint:16`
ejecuta `db:prepare` en **cada arranque**, así que una migración destructiva borraría filas de
producción sola en el próximo despliegue, antes de que nadie viera el censo. `cleanup` **no borra
ningún paso que un alumno haya abierto** — eso es su trabajo, por basura que sea su origen — y
recuenta `total_steps` en las rutas afectadas. No tiene deshacer.

---

## Lo que NO hice

- **No conté nada en producción.** Sin acceso; el SQL está arriba, verificado contra el esquema.
- **No ejecuté `wp29:cleanup`.** Es destructivo y el censo va primero. Lo decide el dueño.
- **No recalifiqué las respuestas ya guardadas mal por §1.** Hay filas en producción con
  `correct = false` que eran correctas, y resultados con la nota que salió de contarlas. Reescribir
  notas históricas es una decisión de producto, no de este paquete: cambia el expediente de gente
  que ya lo vio. La consulta que las cuenta está arriba; si se decide recalificar, es un paquete
  aparte con su propia tarea rake y su propio aviso al alumno.
- **No revisé los pasos ya completados por un suspenso.** Mismo motivo: quitarle a alguien un paso
  que ya tiene abierto es peor que dejarlo. La barrera nueva sólo aplica de aquí en adelante.
- **No toqué** `BlockGrader`, `BlockAttemptRecorder`, la política de WP-10, ni WP-21.
- **No arreglé los cuatro fallos de engine conocidos**, como pedía el brief.
- **No hay verificación en vivo**, que es lo único que cierra esto de verdad. Necesita despliegue,
  y **CI sigue en rojo** desde WP-17 por `scan_ruby` (brakeman sale con 5 por el aviso conocido de
  `permit!`) y `scan_js` (6 avisos de DOMPurify/Mermaid). Mientras siga así, el auto-despliegue no
  se dispara.
- **Sigue pendiente WP-24 §2**, el parser de escenario sin terminador — repetidamente señalado como
  el bug de más valor que queda.
- **Sigo debiendo la investigación de prompts** que pediste hace varios paquetes.
