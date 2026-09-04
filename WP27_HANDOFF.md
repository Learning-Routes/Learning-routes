# WP-27 — El examen no registraba nada, y no se podía repetir

**Escrito:** 2026-09-04 · **Rama:** `wp27-exam-answers`, base `main` @ `6a0d276`
(merge de WP-26) · **Árbol limpio. No fusionada, no desplegada, migración NO ejecutada en
producción.**

---

## 1. El 0.0% era la causa

`submitted?` preguntaba *"¿este USUARIO ha sido puntuado alguna vez en esta evaluación?"* y lo
respondía con `where.not(score: nil).exists?`. **`score: 0.0` no es nil** — y 0.0 es exactamente lo
que producía el flujo roto anterior. Así que **un** intento puntuado rechazaba con 422 toda
respuesta futura, de forma permanente, para ese usuario y esa evaluación. Y el rechazo recreaba el
estado que lo causaba: nada guardado → `submit` cuenta cero → otro resultado 0.0.

El alumno no veía nada de eso porque `saveAnswer` no tenía `else` (§3).

---

## 2. El defecto de fondo: una respuesta no podía pertenecer a un intento

`assessments_user_answers` no tenía `assessment_result_id`, y el índice único era
`(user_id, question_id)`. Una respuesta pertenecía a un **usuario** y una **pregunta**, para toda
la vida de la cuenta. Por eso `find_by(user:, question:)` cortocircuitaba en cada repetición y
`results#submit` contaba las mismas filas siempre. **Repetir era imposible por modelo de datos, no
por política.**

### La intención anti-trampa era correcta; el alcance estaba mal

> *Answers are FINAL once given. Previously an answer could be updated in place and re-graded
> unlimited times, so a student could click each option until it showed "correct" and guarantee
> 100%.*

Eso se conserva **con la misma fuerza**. Lo que estaba mal es que "final" se implementó como final
**para siempre y globalmente** en vez de final **dentro de este intento**. El test B se escribió
**antes** de la migración y pasa a **ambos lados** de ella: ésa es la prueba de que la garantía no
se debilitó.

---

## 3. La migración — QUÉ TOCA, y no se ha ejecutado en producción

`db/migrate/20260904000001_scope_user_answers_to_an_attempt.rb`

1. Añade `assessment_result_id` (uuid, FK a `assessments_assessment_results`, indexado, **nullable**).
2. **Backfill**: cada respuesta existente se atribuye al resultado **más antiguo** de ese usuario
   para la evaluación de esa pregunta.
3. Sustituye `idx_user_answers_on_user_and_question` por
   `idx_user_answers_on_result_and_question` (único).

**Filas afectadas: no puedo darlas.** La base de desarrollo local tiene **0 filas** en
`assessments_user_answers` y **0** en `assessments_assessment_results`, y no tengo acceso a la de
producción. En vez de inventar un número, la consulta para ejecutar **antes** de migrar:

```sql
SELECT
  (SELECT COUNT(*) FROM assessments_user_answers)                     AS answers_total,
  (SELECT COUNT(*) FROM assessments_assessment_results)               AS results_total,
  (SELECT COUNT(*) FROM assessments_user_answers ua
     WHERE EXISTS (
       SELECT 1 FROM assessments_assessment_results r
       WHERE r.user_id = ua.user_id
         AND r.assessment_id = (SELECT q.assessment_id
                                  FROM assessments_questions q WHERE q.id = ua.question_id)
     ))                                                               AS will_be_backfilled,
  (SELECT COUNT(*) FROM assessments_user_answers ua
     WHERE NOT EXISTS (
       SELECT 1 FROM assessments_assessment_results r
       WHERE r.user_id = ua.user_id
         AND r.assessment_id = (SELECT q.assessment_id
                                  FROM assessments_questions q WHERE q.id = ua.question_id)
     ))                                                               AS will_stay_null;
```

`will_be_backfilled` recibe un `assessment_result_id`. `will_stay_null` son **filas legacy**: no
pertenecen a ningún intento, `results#submit` no las cuenta nunca (lee `@result.user_answers`), y
no bloquean ninguna respuesta nueva, porque PostgreSQL trata los NULL como distintos en un índice
único. Es deliberado: inventarle un intento a una respuesta que no podemos ubicar sería fabricar
historial.

**El índice se puede cambiar sin riesgo de colisión**: el índice viejo garantizaba como máximo una
respuesta por `(user, question)`, y el backfill mapea todas las respuestas de un usuario para una
evaluación al mismo resultado, así que `(assessment_result_id, question_id)` no puede duplicarse.

**`down` se niega en vez de borrar.** Una vez que dos intentos tengan respuestas a la misma
pregunta — que es lo que *es* una repetición — restaurar el índice viejo exigiría borrar una de
ellas. La migración lanza `IrreversibleMigration` con el recuento en el mensaje en lugar de
destruir trabajo de un alumno en silencio.

---

## 4. §3 — el `else` que nunca existió

Un 422 es una promesa **resuelta** con `ok: false`. El `if (response.ok)` simplemente se saltaba:
nada se añadía a `answeredSet`, el botón nunca decía "Guardado", `catch` no se ejecutaba y no se
registraba nada. **La consola estaba limpia mientras cada respuesta se tiraba a la basura.**

Ahora hay tres mensajes distintos para tres cosas distintas — intento cerrado (422 con la razón que
manda el servidor), prohibido (403), y fallo de red — en `en` y `es`, con el patrón del grabador de
voz de WP-25 §2, que es el que hizo diagnosticable esto.

**Cuarto paquete seguido** cuyo defecto es el cliente sin decirle al alumno que el servidor dijo que
no: WP-24 §1, WP-25 §2, WP-26 §1, y éste.

---

## 5. Verificación

| Suite | Antes (`6a0d276`) | Después |
|---|---|---|
| Principal | 586 runs, 2345 aserciones, 0F 0E | **591 runs, 2360 aserciones, 0F 0E** |
| Navegador | 46 runs, 347 aserciones, 0F 0E | **47 runs, 352 aserciones, 0F 0E** |
| Combinada | 961 runs, 3F 1E | **968 runs, 3675 aserciones, 3F 1E** |
| RuboCop | limpio | **549 archivos, sin ofensas** |

Principal y navegador: tres ejecuciones cada una, idénticas. Combinada: intersección de tres,
exactamente los cuatro fallos de engine conocidos.

Un quinto fallo apareció y **no era conocido**: `UserAnswerTest#test_DB_unique_index_blocks_...`
afirmaba el índice viejo. Es la garantía anti-trampa **a nivel de base de datos**, así que se
reapuntó al índice nuevo en vez de borrarse, y se le añadió la otra mitad: un intento **distinto**
sí puede responder la misma pregunta. Sin esa segunda mitad, la regla anti-trampa y la repetición
no pueden ser ciertas a la vez.

### En rojo antes del arreglo

```
RetakeTest#test_a_scored_attempt_does_not_lock_answering_forever
`submitted?` asked whether this USER has ever been scored, and score 0.0 is not nil —
so one scored attempt refused every future answer, forever.
Expected 422 to not be equal to 422.

RetakeTest#test_each_attempt_keeps_its_own_answers
Expected: [0.0, 100.0]   Actual: [0.0, 0.0]

RetakeTest#test_a_second_attempt_can_score_differently_from_the_first
Expected: 100.0   Actual: 0.0

ExamStartTest#test_a_refused_answer_save_puts_a_visible_message_on_the_page
expected to find visible css "[data-question-nav-target='saveError']" but there were no matches
```

**Y el test B en verde antes de migrar**, que es la parte que importa: los dos tests anti-trampa
pasaban con el índice viejo y siguen pasando con el nuevo.

---

## 6. Lo que NO se hizo

- **No se ejecutó la migración en producción.** Despliega el dueño. Antes conviene correr la
  consulta de §3 para saber qué toca.
- **No hay verificación en el sitio en vivo.** Es lo único que cierra esto: hacer el examen,
  responder bien, ver la nota correcta, repetir y ver una nota distinta. Necesita despliegue.
- **`structure.sql` se regeneró con `pg_dump` 17**, no con el 14.20 que está primero en el PATH
  por defecto. Si alguien regenera sin `PATH="/opt/homebrew/opt/postgresql@17/bin:$PATH"`, el dump
  falla en silencio y el esquema queda obsoleto. (Ya estaba anotado en el handoff de WP-18.)
- **CI sigue en rojo** por `scan_ruby` y `scan_js`; el auto-despliegue no se dispara.
- **Fuera de este paquete, como pedía el brief:** WP-24 §2 (el parser de escenario sin terminador,
  el bug de más valor que queda), WP-23, WP-20, Task 8, Task 9, y el trabajo de profundidad de
  contenido, que es decisión de producto.
