# WP-19 — Cerrar las cuatro fugas de gasto

**Escrito:** 2026-09-02 · **Rama:** `wp19-spend-leaks`, base `main` @ `4145290`
**Head:** este commit (el último de `wp19-spend-leaks`) · **Árbol limpio. No fusionada, no desplegada.**

Referencia: `ROADMAP_v3.md` §1, `AUDITORIA_2026_09`, `WP18_RESUME.md`.

---

## 1. Por qué esta rama sale de `main` y no de WP-18

`wp18-route-purchases` está terminada y esperando despliegue. Estas cuatro fugas gastan dinero
**hoy**, sin que nadie haya pagado, y ninguna es un defecto de comercio. Manteniéndolas separadas,
cualquiera de las dos ramas puede desplegarse sin la otra.

Consecuencia práctica al leer el prompt de este paquete: varias referencias de línea venían del
estado de WP-18, no de `main`. Verificadas de nuevo contra `main` antes de tocar nada. La única
que no coincidía es la "puerta de generación" en `results_controller.rb:77`, que es trabajo de
WP-18 y aquí no existe.

---

## 2. Las cuatro correcciones

Un commit por corrección, cada uno revertible por separado, cada uno nombrando el coste que evita.

| Commit | Fuga | Coste que detiene |
|---|---|---|
| `5f4b496` | §A El sondeo de 3 s reencolaba la lección | 2,33¢ por duplicado (3,16¢ máx.), hasta ~10 por paso |
| `434c9b3` | §B El refuerzo caía en el módulo gratis | ≈4,66¢ por vuelta, sin tope |
| `affe32e` | §C Todo el gasto de voz esquivaba el techo | Todo el audio, sin límite diario, por usuario ni rpm |
| `e7d03ef` | §D El prefetch pisaba lo ya pagado | 4,26¢ por imagen perdida, 3,07¢ por narración |
| `82121ac` | Alineación de dos tests de engine (§B y §C) | — |

El quinto no es un defecto: es la parte de §B y §C que aterriza en tests de engine. Va aparte
sólo porque `route_step.rb` lleva cambios de §B (el aviso ruidoso) y de §D (`merge_metadata!`),
así que no se pueden separar por ruta de archivo. **Revertir §B o §C implica revertir también
`82121ac`.**

---

## 3. Decisiones tomadas, con su justificación

### §B — a qué módulo pertenece un paso de refuerzo

Decisión del dueño, no re-litigada: hereda el módulo del paso que **disparó** la evaluación.
Módulo de pago → refuerzo de pago; módulo preview → refuerzo gratis.

Dos bordes decididos, no asumidos:

1. **Se hereda el MÓDULO, no su estado de acceso.** Un módulo `locked` hoy y `purchased` mañana
   arrastra sus pasos de refuerzo consigo. Eso convierte "un módulo que ha cambiado de estado" en
   un no-problema en lugar de una regla aparte.
2. **Si el resultado no nombra ninguna evaluación** (`extract_score` acepta un duck, y
   `AdaptiveDifficultyTest` pasa un `OpenStruct`), se cae al módulo del paso en el que está el
   alumno — que es donde se insertan los pasos de todos modos. Sigue siendo un módulo derivado de
   un paso real, nunca el módulo gratis elegido por omisión. Sólo falla cerrado cuando no hay
   ningún paso que resolver, es decir, una ruta sin pasos y sin nada detrás de lo que insertar.

   Mi primer intento falló cerrado siempre. Estaba mal: el único llamador de producción
   (`ResultsController`) pasa un `AssessmentResult` real, así que matar la función de refuerzo
   protegía dinero que no estaba en riesgo.

3. **`skip_ahead!` no crea pasos.** Confirmado leyéndolo (marca pasos existentes como
   `completed`), no asumido por simetría, y fijado con un test.

### §C — qué pasa cuando salta el techo

Un techo es un límite **de negocio**, no un error. Por eso:

- `ModelRouter` re-lanza el rechazo en lugar de hacer *fallback*, que preguntaría lo mismo al
  mismo guard sobre otro modelo y lo renombraría `AllModelsUnavailable`.
- `Orchestrate` marca la interacción como fallida y **re-lanza**, en vez de tragárselo. Sin esto
  el alumno veía la avería genérica.
- `ContentPipelineJob` **descarta** en lugar de reintentar una decisión que no va a cambiar, y
  marca `content_error_kind: "budget"`.
- El alumno ve **"Paused for today — this resets tomorrow"**, sin botón de reintento, en lugar de
  "no pudimos crear esta lección, inténtalo en unos minutos", que es falso con un tope diario.
  Cuatro cadenas nuevas, en `en` y `es`.

### §C — lo que se fusionó y lo que se dejó aparte

**Fusionado:** `ImageGenerationService#validate_cost_budget!`. Preguntaba lo mismo que
`SpendGuard#check_cost_limit!` en otro dialecto (`CostTracker.alert_exceeded?` devuelve un booleano
donde el guard lanza). Dos respuestas a una pregunta que pueden discrepar tras cualquier edición
es peor que una.

**Deliberadamente aparte:** la comprobación de caché que estaba encima. Devolver una imagen
cacheada **no es una llamada de pago** y debe seguir funcionando con el techo puesto. Ésa es
exactamente la razón por la que el guard vive en `AiClient` y no al principio de `call`.

**Sin doble conteo:** el limitador de tasa *incrementa* un contador, así que comprobar en
`ModelRouter` **y** en `AiClient` habría partido por la mitad el rpm efectivo de cada modelo.
`ModelRouter` ya no comprueba: no guarda una copia, no guarda ninguna. Su rama de *fallback*
también dejó de pre-comprobar un nombre de modelo que sólo esperaba que el bloque usara; el
cliente del bloque pregunta por el modelo que va a llamar de verdad.

---

## 4. Lo que NO se arregló, y por qué

- **`AssessmentsController#start` no tiene tope.** Sigue creando un `AssessmentResult` nuevo cada
  vez que el anterior tiene nota, así que `submit → start → submit` se repite sin límite. §B quita
  el coste de cada vuelta (el refuerzo ya no es contenido gratis generable), pero el bucle sigue
  ahí. Es trabajo de producto, no de gasto.
- **`mark_generating!` escribe antes de la llamada de IA**, así que no era parte de la clase de
  §D; aun así se convirtió a `merge_metadata!` por consistencia.
- **La ventana de `apply_results!` se estrecha, no se cierra.** `||` de PostgreSQL es superficial,
  igual que `Hash#merge`, y este job **muta una estructura anidada**
  (`parsed_sections[i]["image_url"]`). Por eso re-lee justo antes de escribir. Eso reduce la
  ventana de minutos a la duración de un método; **no la hace atómica, y no se afirma que lo sea.**
- **`SpendGuard.reset_rate_limits!` existe pero hoy no hace falta.** El entorno de test usa
  `:null_store`, así que los contadores no persisten entre ejemplos. Se mantiene porque los tests
  de límite de tasa necesitan un store real para ejercer el contador, y porque dejaría de ser
  cierto en cuanto alguien cambie el store. **Un primer intento añadió un hook en `test_helper`
  con un comentario que afirmaba que los contadores se filtraban entre tests: era falso bajo
  `:null_store`, y se retiró.**

---

## 5. Verificación

| Suite | Antes (`4145290`) | Después (`82121ac`) |
|---|---|---|
| Principal | 402 runs, 1669 aserciones, 0F 0E | **433 runs, 1756 aserciones, 0F 0E** |
| Combinada | 738 runs, 3F 1E | **769 runs, 2772 aserciones, 3F 1E** |
| Navegador | — | **7 runs, 55 aserciones, 0F 0E** |
| RuboCop | limpio | **506 archivos, sin ofensas** |

Los fallos de la combinada son la **intersección de 3 ejecuciones**, en ambos extremos, y son
exactamente los cuatro conocidos, sin tocar:
`GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`,
`RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`.

**Nota honesta sobre la línea base:** en 6 ejecuciones de la base, 5 dieron 3F/1E y una dio 4F/1E;
la intersección de las 3 ejecuciones con nombres capturados fueron los cuatro conocidos. Esta rama
**no** lleva `98e2fd1` (el arreglo de `Core::User.first`, que vive en WP-18), así que esa fragilidad
sigue presente aquí. Una ejecución posterior mostró además un `OwnerDashboardTest` transitorio que
no se repitió.

---

## 6. Cada test de clase, y qué se borró para verlo fallar

Un test de clase que nunca ha fallado es una afirmación, no una red.

| § | Test | Qué se borró | Qué pasó |
|---|---|---|---|
| A | `step_content_claim_concurrency_test.rb` | El bloque `ContentPrefetcher.claim` de `request_content_generation!` | 2 encolados donde debía haber 1 |
| B | `reinforcement_module_inheritance_test.rb` | `route_module_id: module_id` **y** `report_implicit_preview_module!` | El refuerzo de pago cae en el módulo gratis; crear un paso sin módulo no avisa |
| C | `spend_guard_test.rb` | La línea `SpendGuard.call` de `AiClient#chat` | 6 tests fallan; ElevenLabs llega al proveedor con el techo a cero |
| D | `step_metadata_write_isolation_test.rb` | La re-lectura `fresh_metadata` **y** la escritura estrecha | Se sobrescribe la imagen que el alumno ya pagó; el barrido nombra el archivo |

---

## 7. Para continuar

```bash
cd ~/Documents/Learning-routes && git checkout wp19-spend-leaks
env -u RAILS_MASTER_KEY bin/rails test           # una suite por proceso
env -u RAILS_MASTER_KEY bin/rails test test engines/*/test
```

Recordatorios del entorno: `env -u RAILS_MASTER_KEY` siempre; **una sola suite por proceso** (dos
`bin/rails test` a la vez comparten base de datos y fabrican un 18 % de fallos falsos —
`98e2fd1` lo diagnosticó, no lo vuelvas a descubrir); `bin/rails test` **excluye** `test/system`.

Siguiente paquete según `ROADMAP_v3.md`: fusionar y desplegar `wp18-route-purchases` (§2), y
después la red de seguridad más amplia (WP-4), que **no** es este paquete.
