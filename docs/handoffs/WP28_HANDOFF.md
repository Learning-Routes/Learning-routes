# WP-28 — El examen puntúa, y luego tira la respuesta

**Escrito:** 2026-09-04 · **Rama:** `wp28-submit-side-effects`, base `main` @ `02ff9c6` (WP-27)
**Árbol limpio. No fusionada, no desplegada. Migración NO ejecutada en producción.**

---

## 1. §1 — la validación derrotaba a su propio guardián

`take_snapshot!` usa `create_or_find_by!`, que está definido como *"intenta `create!`, rescata
`ActiveRecord::RecordNotUnique`"* — el error de la **base de datos**, el que lanza
`idx_progress_snapshots_unique`. El modelo declaraba además:

```ruby
validates :snapshot_date, uniqueness: { scope: [:user_id, :learning_route_id] }
```

Una validación de modelo corre **antes** del INSERT. Así que `create!` lanzaba `RecordInvalid`,
que `create_or_find_by!` **no** rescata, y la petición devolvía 422. **El segundo envío del día en
una ruta fallaba siempre, para todos.**

**Decisión: quitar la validación y quedarse con el índice.** Es lo que el método requiere, y el
índice es el único guardián que de verdad es seguro ante concurrencia — una validación de modelo no
puede impedir dos INSERT simultáneos, sólo perder la carrera con educación. Si algún día se quiere
un mensaje amable de formulario, `take_snapshot!` tiene que dejar de usar `create_or_find_by!` y
gestionar la colisión él mismo. **No dejar las dos.**

---

## 2. §2 — cada envío fallido gastaba dinero

`submit` ejecuta siete efectos secundarios **después** de que la nota ya está comprometida, fuera
de toda transacción, ninguno idempotente, con el job **de pago** en el paso 4 de 6. Cada fallo en
el paso 6 ya había escrito una métrica, ajustado la dificultad, quizá insertado pasos de refuerzo,
completado el paso y **comprado el análisis** — y luego tiraba la respuesta.

Y como WP-27 hizo que cada reintento sea un intento nuevo de verdad, el alumno que vuelve a
empezar **vuelve a comprarlo todo**. Las dos peticiones del log capturado están a cuatro segundos.

### Lo que se cambió

- **Ordenado por coste.** El gasto va **el último**, y sólo si todo lo barato salió bien.
- **Reclamo sobre el RESULTADO, no sobre la petición.**
  `where(id:, gap_analysis_enqueued_at: nil).update_all(...) == 1` es un reclamo atómico: envíos
  concurrentes y reintentos no pueden comprar dos análisis nunca. Columna y migración nuevas.
- **Cada paso de contabilidad aislado**, de modo que un fallo no salta los demás ni le quita al
  alumno el resultado que su nota ya ganó.

### La pregunta que el brief pedía responder explícitamente

> *"if the failure had happened before `complete_step!`, the retry would return `:already_scored`
> and redirect — and the step would stay incomplete forever. Say whether you fixed that or only
> the ordering."*

**Arreglado, no sólo el orden** — pero parcialmente, y conviene ser exacto:

- La rama `already_scored` ya no es un no-op: **completa el enqueue de pago** que un envío fallido
  se hubiera saltado. Es seguro porque el reclamo vive en el resultado.
- **Deliberadamente NO reejecuta el resto.** `AdaptiveDifficulty#adjust!` inserta pasos de refuerzo
  y `LearningMetric.record!` es un `create!` pelado: reintentarlos duplicaría. Esos fallos se
  registran con el id del resultado y se dejan estar.

Dicho claro: si la contabilidad falla, esos pasos quedan sin hacer y **no** se reparan solos.
Hacerlos idempotentes es trabajo aparte y no está en este paquete.

---

## 3. §3 — el alumno ya no se queda sin nada

Un 422 con un cuerpo de excepción no es información. Ahora un envío cuya contabilidad falla
**redirige igualmente al resultado** y dice que las respuestas se guardaron y se calificaron —
porque a esas alturas **es verdad**. Dos locales.

Quinto paquete seguido cuyo defecto es el cliente sin contarle al alumno lo que hizo el servidor.

---

## 4. Una advertencia sobre los tests, porque me mordió

El test de controlador de §1 estaba en rojo en la línea base. **Pero el aislamiento de §2 se traga
esa excepción**, así que al reponer la validación los tests de controlador siguen en verde. El
test de controlador ya no protege §1.

Por eso el guardián de §1 vive en el **modelo**: `test/models/analytics/progress_snapshot_test.rb`
reproduce el error de producción literal —
`ActiveRecord::RecordInvalid: Validation failed: Snapshot date has already been taken`.

Es exactamente la trampa que este proyecto lleva encontrando: un arreglo que hace más difícil
detectar el otro. Lo digo aquí para que nadie borre el test de modelo pensando que es redundante.

---

## 5. Verificación

| Suite | Antes (`02ff9c6`) | Después |
|---|---|---|
| Principal | 591 runs, 2360 aserciones, 0F 0E | **601 runs, 2382 aserciones, 0F 0E** |
| Navegador | 47 runs, 352 aserciones, 0F 0E | **47 runs, 352 aserciones, 0F 0E** |
| Combinada | 968 runs, 3F 1E | **978 runs, 3697 aserciones, 3F 1E** |
| RuboCop | limpio | **552 archivos, sin ofensas** |

Principal y navegador: tres ejecuciones cada una, idénticas. Combinada: intersección de tres,
exactamente los cuatro fallos de engine conocidos.

### En rojo antes del arreglo

```
§1 (modelo, reponiendo la validación)
Analytics::ProgressSnapshotTest#test_taking_the_snapshot_twice_in_one_day_does_not_raise
ActiveRecord::RecordInvalid: Validation failed: Snapshot date has already been taken

§1 (controlador, en la línea base)
SubmitTwiceInOneDayTest#test_a_second_assessment_on_the_same_route_submits_on_the_same_day
the second submit of the day 422'd: take_snapshot! uses create_or_find_by!, which rescues
RecordNotUnique, but the model validation raised RecordInvalid first

§2 (devolviendo el gasto al paso 4 de 6)
SubmitTwiceInOneDayTest#test_a_failure_in_bookkeeping_does_not_enqueue_the_paid_job
0 jobs expected, but 1 were enqueued.  Expected: 0  Actual: 1
```

---

## 6. La factura — NO la tengo, y no la voy a inventar

El brief pide contar, en `kamal console`, las ejecuciones de `GapAnalysisJob` y las filas de
`LearningMetric` del usuario `3d43fad7-6ec6-4faa-ac53-885d35f31aec` en esa ruta hoy.

**No tengo acceso desde aquí.** `kamal` no es utilizable en este entorno (ya pasó en WP-25 con
`kamal app logs`), y el Postgres de producción es un accesorio en la red interna de Docker en el
box de Hetzner. En vez de dar un número que no he medido:

```ruby
# kamal console
user_id  = "3d43fad7-6ec6-4faa-ac53-885d35f31aec"
route_id = "<la ruta del examen>"

# 1. Intentos puntuados hoy (cada uno compró un análisis con el código viejo)
Assessments::AssessmentResult
  .joins(assessment: { route_step: :learning_route })
  .where(user_id: user_id, learning_routes_engine_learning_routes: { id: route_id })
  .where(created_at: Date.current.all_day)
  .where.not(score: nil).count

# 2. Filas de métrica escritas hoy (una por envío que llegó al paso 2)
Analytics::LearningMetric.where(user_id: user_id, recorded_date: Date.current).count

# 3. Gasto real de IA de hoy para ese usuario, en microcents
AiOrchestrator::AiInteraction
  .where(user_id: user_id, created_at: Date.current.all_day)
  .where.not(cost_microcents: nil).sum(:cost_microcents)
```

(3) es la cifra que de verdad es "la factura": el ledger de WP-7 tiene el coste exacto por
llamada, así que no hace falta estimar. Recordatorio de unidades:
`AiOrchestrator::CostTracker::MICROCENTS_PER_CENT = 10_000`.

---

## 7. Lo que NO se hizo

- **No conté la factura.** Sin acceso a producción; las consultas están arriba.
- **No se ejecutó la migración fuera de local.** Añade una columna nullable a
  `assessments_assessment_results`; no reescribe ni borra filas, así que es segura de aplicar,
  pero la despliega el dueño.
- **No se hicieron idempotentes** `AdaptiveDifficulty#adjust!` ni `LearningMetric.record!`. Sus
  fallos se registran y no se reparan. Es trabajo aparte.
- **No se hizo el barrido** de "commit seguido de `perform_later`/`create!` sin guardia". El brief
  lo pedía sólo *si el barrido es de fiar*, y la lección de WP-26 es que un barrido con falsos
  positivos es peor que ninguno: mi heurística de aquel paquete se equivocó con la extracción de
  cuerpos de método y no tengo motivo para creer que una nueva salga mejor sin más trabajo del que
  cabe aquí.
- **No hay verificación en vivo.** Es lo único que cierra esto: enviar un examen dos veces el
  mismo día en el sitio. Necesita despliegue, y CI sigue en rojo por `scan_ruby` y `scan_js`.
- **Fuera del paquete, como pedía el brief:** WP-24 §2 (el parser de escenario sin terminador,
  el bug de más valor que queda), WP-23, WP-20, Task 8, Task 9.
