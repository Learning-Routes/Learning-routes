# WP-21 — El modal del quiz no ocupaba píxeles

**Escrito:** 2026-09-02 · **Rama:** `wp21-quiz-modal`, base `main` @ `ff9c2eb`
**Árbol limpio. No fusionada, no desplegada.**

Bloqueante de producción: toda lección con un bloque `check` después de la sección 0 era
imposible de terminar.

---

## 1. La causa, confirmada contra el código

El reporte del DOM en vivo decía: contador `15/18`, sección visible `13`, modales
`["flex","none"]`, y sobre el modal abierto `display:flex opacity:1 visibility:visible
z-index:9990 position:fixed` con `rect [0,0,0,0]` y 5 opciones de texto correcto.

Verificado en el repositorio, no asumido:

1. `steps/_lesson.html.erb:143` — el bucle de secciones aplica
   `style="<%= i > 0 ? 'display:none;' : '' %>"` a cada `.lesson-section`.
2. `lesson_sections/_check.html.erb` — la raíz del parcial **es** el
   `.quiz-modal-backdrop`, así que el modal era descendiente de esa sección.
3. `interactive_lesson_controller.js` — `_showQuizModal` hacía
   `section.querySelector('.quiz-modal-backdrop')` y ponía `display:flex`, **sin** transicionar
   a la sección, que es la intención correcta: el modal se superpone al contenido que el
   alumno está leyendo. Por eso el contador avanza a 15/18 mientras la sección 13 sigue
   en pantalla.

Un descendiente de un ancestro `display:none` no se renderiza en absoluto, dijera lo que
dijera su propio estilo. `getComputedStyle` devuelve los valores **declarados** del propio
elemento, por eso todo parecía sano salvo `getBoundingClientRect()`.

**Segunda razón independiente, encontrada al verificar:** `.lesson-section` recibe
`transform: translateX(...)` durante las transiciones (`application.css:1197-1221`), y un
ancestro con `transform` se convierte en el bloque contenedor de sus descendientes
`position: fixed`. Aunque la sección del check fuera visible, el modal se habría posicionado
contra la sección y no contra el viewport. Las dos razones apuntan a lo mismo: el modal no
puede vivir dentro de una `.lesson-section`.

---

## 2. Qué se eligió, y por qué no la otra opción

**Opción 1: renderizar los modales fuera de las secciones.** Elegida.

El argumento decisivo **no** es el riesgo de fuga de la opción 2. Es que los seis eventos del
quiz — `quiz:completed`, `quiz:correct`, `quiz:wrong`, `quiz:modal-close`,
`lesson-check:answered`, `block:graded` — se despachan con `bubbles: true` desde dentro del
modal, y **todos** los listeners están sobre `this.element` (el elemento del controlador
`interactive-lesson`). Un modal en `document.body` queda fuera de ese elemento, así que cada
uno de esos eventos burbujearía hasta `document` sin pasar por los listeners: portalizar
habría roto en silencio responder, puntuar, los corazones y la puerta de navegación.
`data-interactive-lesson-target="quizModal"` tampoco resuelve fuera del elemento del
controlador.

**Verificado, no asumido**, lo que el prompt pedía comprobar: Stimulus no se entera del
movimiento. Los controladores hijos se buscan con
`this.application.getControllerForElementAndIdentifier(el, id)`, un registro indexado por
elemento, no por posición en el subárbol. `lesson-check` y `lesson-quiz` se instancian por su
atributo `data-controller` esté donde esté en el documento.

Los modales se emiten después del contenedor de secciones y **dentro** del elemento
`interactive-lesson`, así que target y burbujeo siguen resolviendo.

---

## 3. Lo que hubo que tocar además

- La `.lesson-section` del check **se queda**: lleva el índice, el contrato
  `data-gating` / `data-block-satisfied`, `data-block-url-value` y el dataset de tiempos que
  el controlador lee. Ahora no renderiza nada dentro.
- Cuatro búsquedas que se apoyaban en la contención pasan a resolverse por índice, con
  `_quizModalFor(index)` y `_quizHostFor(index)` (`modal || sección`):
  `_showQuizModal`, `_detectQuizLock` (`_hasQuizController`),
  `_activateInitialQuizWithRetry` y el propio activador.
- `_activateQuizInSection` → `_activateQuizIn(host)`. Ya no recibe una sección, y un nombre
  que dice "section" es justo lo que llevó a acotar esto a una sección.
- `_updateProgressForQuizModal` **no se tocó**: sigue avanzando el contador sin transicionar,
  que es lo que el alumno ve (contenido de la sección 13, contador 15/18). Cubierto por los
  tests de checks adyacentes.
- `_closeQuizModal` **no se tocó**: sigue operando sobre `_activeQuizModal`, que se asigna en
  `_showQuizModal`. Al no haber movimiento de DOM en tiempo de ejecución, no hay ruta de
  limpieza que pueda dejar un modal huérfano.
- CSS: se eliminó `.lesson-section[data-section-type="check"] { min-height: 12rem }`. Su razón
  declarada — "la única sección cuya altura en flujo es cero: su contenido es un modal fijo" —
  dejó de ser cierta. Tailwind reconstruido y **verificado contra el build compilado**
  (`app/assets/builds/tailwind.css`), no solo contra la fuente.

**Caso adyacente arreglado:** un `check` como **primera** sección no tenía ningún evento que
abriera su modal — `_showQuizModal` solo se alcanza desde `nextSection`. El alumno veía una
sección vacía con Continuar bloqueado por la puerta y nada que responder: el mismo resultado
imposible-de-terminar, por el otro lado. Tres líneas en `connect`, con test propio.

---

## 4. Los alumnos ya atascados

Los intentos se registran por `(user, route_step, section_index)`. Quien llegó a un check
antes del arreglo tiene una puerta que no pudo satisfacer y no puede terminar ese paso. El
arreglo repara el tráfico nuevo; **no** crea retroactivamente los intentos que nunca pudieron
hacer.

**No puedo dar la cifra de producción desde aquí.** El Postgres de producción es un accesorio
Kamal en la red interna de Docker en el box de Hetzner (`config/database.yml:47-61`), sin
acceso desde este entorno. En lugar de inventar un número, la consulta queda escrita y
verificada:

```bash
bin/rails wp21:stuck_checks     # en el box de producción
```

Es **solo lectura** y no viene acompañada de una tarea de reparación a propósito.
Ejecutada contra la base de datos de **desarrollo local** (que no es producción, y cuya cifra
no debe citarse como tal) imprime: 9 pasos escaneados, 1 alumno, 8 pasos no terminables, 34
secciones `check` sin responder.

**Opciones para el dueño, ninguna aplicada:**

1. **No hacer nada.** El alumno vuelve al paso, el modal ahora abre, responde y la puerta se
   satisface. Es suficiente para todo el que quiera retomar el paso.
2. **Marcar satisfechas** las secciones `check` afectadas creando un `BlockAttempt` con
   `completed_at` y `released_at`, como la válvula de escape de WP-10. Desbloquea sin que el
   alumno tenga que volver, pero regala la respuesta y ensucia la analítica de dominio.
3. **Marcar completados** los pasos afectados. El más agresivo: se salta la lección entera.

Mi recomendación es la 1, y sólo pasar a la 2 si el dueño ve alumnos que abandonaron. La 3 no.

---

## 5. Verificación

| Suite | Antes (`ff9c2eb`) | Después |
|---|---|---|
| Principal | 554 runs, 2251 aserciones, 0F 0E | **554 runs, 2251 aserciones, 0F 0E** |
| Navegador | 7 runs, 57 aserciones, 0F 0E | **27 runs, 201 aserciones, 0F 0E** |
| Combinada | 890 runs, 3F 1E | **910 runs, 3413 aserciones, 3F 1E** |
| RuboCop | limpio | **538 archivos, sin ofensas** |

La suite principal no se mueve porque el defecto es de layout: **ninguna prueba de Rails podía
detectarlo**. Los 20 tests nuevos son de navegador.

Los fallos de la combinada son la intersección de 3 ejecuciones en ambos extremos, y son
exactamente los cuatro conocidos, sin tocar:
`GapAnalysisJobTest#test_enqueues_reinforcement_job_when_gaps_found`,
`ReinforcementJobTest#test_generates_reinforcement_routes_for_unresolved_gaps`,
`RouteGenerationJobTest#test_generates_route_and_creates_steps`,
`RouteGeneratorTest#test_route_has_level-up_exams_and_final_exam`.

### La red, y qué se borró para verla fallar

Se devolvió el modal a su sección **sin cambiar nada más**, de modo que la ubicación en el DOM
fuera la única variable. Fallan 5 tests, con el síntoma exacto de producción:

- `check renders with zero WIDTH at .quiz-modal-backdrop[data-section-index='1']` (la
  aserción generalizada)
- `the quiz modal has its content and zero width — a display:none ancestor. Expected 0 to be > 0`
- más los de opciones clicables, checks adyacentes y desbloqueo del pie.

---

## 6. Lo que NO se hizo

- **Cadenas en español embebidas en `_check.html.erb`**: "DESAF&Iacute;O R&Aacute;PIDO",
  "+5 XP BONUS si respondes en <10s" y "Explicaci&oacute;n:" están escritas a mano en el
  parcial en lugar de pasar por I18n. Son **preexistentes**, no cadenas nuevas de este
  paquete, así que quedan anotadas y no tocadas. Merecen su propio arreglo pequeño.
- **No se mutó ningún dato de producción**, ni se escribió una tarea que pudiera hacerlo.
- No se tocaron la política de gating de WP-10, `BlockGrader` ni `BlockAttemptRecorder`: son
  correctos, y el defecto era puramente dónde vivía el modal.

---

## 7. Para continuar

```bash
cd ~/Documents/Learning-routes && git checkout wp21-quiz-modal
env -u RAILS_MASTER_KEY bin/rails test test/system/lesson_block_visibility_test.rb
```

Recordatorios: `env -u RAILS_MASTER_KEY` siempre; **una sola suite por proceso**;
`bin/rails test` **excluye** `test/system`; cualquier cambio en `application.css` exige
`bin/rails tailwindcss:build` antes de mirar el navegador.

Al añadir un tipo de bloque nuevo a `ContentEngine::LessonBlocks`, hay que añadir su payload
de ejemplo en `test/system/lesson_block_visibility_test.rb`; un test dedicado falla si no,
para que la aserción de tamaño no se pueda saltar añadiendo un tipo.
