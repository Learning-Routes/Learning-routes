# WP-24 §2 — El escenario se comía el resto de la lección

**Escrito:** 2026-09-04 · **Rama:** `wp24s2-scenario-terminator`, base `main` @ `46e067a`
**Árbol limpio. No fusionada, no desplegada. Nada ejecutado contra producción.**

Cinco commits, en el orden que pedía el brief. §1 (el temporizador) y §3 (`BlockGrader.answerable?`)
de WP-24 no se han tocado.

---

## §1 — el bucle no tenía terminador

`split_by_headings` corta el documento en `^##\s`, así que el cuerpo que recibe un
`parse_heading_*` **nunca** contiene una línea `##`. Lo que sí contiene son sub-títulos `###`,
bloques cercados y prosa final — y un parser que añade cada línea no reconocida a lo último que
estaba recogiendo se lo come todo.

**El barrido demostró que esto es una CLASE, no un bug.** En rojo antes del arreglo:

```
scenario         :consequence => "You ship late, but polished. ### What actually happened
                 ```mermaid sequenceDiagram Alice->>John: Hello John ``` --- First trailing
                 prose line. Second trailing prose line."
flashcards       el reverso de la última tarjeta se comió el sub-título y el cercado
code_playground  expected_output se comió todo lo que había tras el código
fill_blank       toda la cola pasó a formar parte de la frase
simulation       en vez de comérsela, la tiraba en silencio
```

(9 fallos en 13 tests. El de `scenario` es exactamente el síntoma de producción: aplanado en una
sola línea, que es por lo que el diagrama no podía dibujarse nunca.)

Tres patrones compartidos terminan ahora un bloque: un título de nivel 3–6, un delimitador de
cercado, y una regla horizontal. Todo lo que va del primer match hasta el final es el **aftermath**:
contenido real de la lección que el autor puso detrás del bloque. Se conserva en la sección y se
pinta debajo de la tarjeta con un parcial compartido `_aftermath`, vía `MarkdownRenderer`.

**Se muestra SIEMPRE, no tras elegir.** Un diagrama escondido es el bug que estamos arreglando, y
condicionarlo a interactuar se lo escondería a quien no interactúe. Dicho en el commit.

Detalles que importan:

- `---` **no** es terminador en flashcards: ahí separa tarjetas, es gramática del bloque.
- `code_playground` parte lo que sigue a su código, no el cuerpo entero, o su propio cercado sería
  su terminador.
- `drag_drop` selecciona en vez de acumular. Se deja como está y va en el barrido **como control**.
- Los saltos de línea de una consecuencia se conservan (`join("\n")`) y las líneas en blanco
  también, porque va a renderizarse como markdown y sin ellas dos párrafos se funden en uno.
- **El número de secciones no cambia**, y hay un test que lo fija: `block_attempts.section_index`
  indexa ese array y una sección de más re-apuntaría cada intento registrado a otro bloque.
- Los bloques de prosa (concept, example, tip, visual, summary) **quedan fuera a propósito**, con
  un test que lo dice: su cuerpo entero *es* su contenido, y darles aftermath sacaría contenido del
  bloque que debe mostrarlo.

---

## §2 — la consecuencia llegaba como texto crudo, con `&quot;` dentro

El parcial la mandaba en un atributo HTML cuyo valor se construía metiendo `&quot;` con un `gsub`,
dentro de una etiqueta de salida ERB — que escapa lo que recibe. El `&` se convertía en
`&amp;quot;`, el navegador decodificaba una vez, y toda consecuencia con comillas mostraba los seis
caracteres literales. Nokogiri enseña el markup viejo tal cual:

```
data-consequence="She says **&quot;thank you&quot;** and stays with you."
```

Y el controlador hacía `consequenceTextTarget.textContent = consequence`, así que `**énfasis**`
imprimía sus asteriscos y los saltos de línea desaparecían — el mismo aplanado de §1.

Ahora cada consecuencia se renderiza **en el servidor** con `MarkdownRenderer`, en su propio
elemento oculto direccionado por índice de opción. El controlador sólo descubre el que toca y no
toca texto nunca. El `gsub`, el atributo `data-consequence` y el target `consequenceText`
desaparecen, y hay un test que falla si vuelven.

### El vocabulario ahora concuerda con el contrato

Un escenario **no tiene opción correcta**: es el contrato del generador y el del calificador
(`scenario` está en `GATING_TYPES`, no en `GRADABLE_TYPES`), y el parser no produce bandera
`correct` porque no hay ninguna que producir. `Result:` implicaba veredicto y `Try Again` implicaba
que había una respuesta buena a la que llegar; encima ambos eran inglés fijo dentro de una UI en
español. Ahora son `scenario_consequence` y `scenario_explore_another` en los dos idiomas,
**afirmados contra las CLAVES**, para que el test no se pueda satisfacer volviendo a escribir la
cadena a mano. Renombrado, no re-calificado.

---

## §3 — la opción A decía `Consequence.` porque la plantilla dice `Consequence.`

No era un bug de parseo. Todos los demás huecos de la plantilla están entre corchetes; estos tres
eran frases inglesas normales, y el modelo copió una literalmente a una lección real. Ahora:

```
## Scenario: [title]
  [describe the situation]
  OPTION A: [first choice]
  [what happens if the student picks A]
  OPTION B: [second choice]
  [what happens if the student picks B]
  (decision practice; a consequence may be one or two sentences of prose)
```

La línea final también existe porque la palabra suelta *enseñaba* al modelo a responder con una
palabra suelta. Commit aparte, como pedía el brief.

---

## Re-parsear lo ya persistido

`parsed_sections` es una caché persistida y `StepsController#show` pinta desde ella, así que **el
arreglo del parser por sí solo no cambia nada que un alumno pueda ver** en una lección que ya
existe.

```
bin/rails wp24:scenario_census      sólo lectura, no modifica nada
bin/rails wp24:reparse_scenarios    reescribe sólo las compatibles por posición
```

En el box de producción:

```
kamal app exec 'bin/rails wp24:scenario_census'
# leer la salida, y sólo entonces:
kamal app exec 'bin/rails wp24:reparse_scenarios'
```

Tarea rake y no migración: `bin/docker-entrypoint:16` ejecuta `db:prepare` en **cada arranque**, así
que una migración que reescribiera contenido se ejecutaría sola en el próximo despliegue, antes de
que nadie hubiera leído el censo.

**La compatibilidad de posición es toda la regla de seguridad.** `block_attempts.section_index`
indexa ese array, así que reescribir un paso cuyo parse nuevo tenga distinto número de secciones —
o distinto `type` en algún índice — re-apunta en silencio cada intento registrado a otro bloque.
Esos pasos se saltan y se listan por id, en las dos tareas.

**Esa guarda es portante y lo demostré:** forzando `compatible` a devolver siempre `true`, dos
tests de seguridad se ponen en rojo, uno de ellos sobre que las secciones del paso *se habían*
reescrito. El reparse es idempotente (segunda pasada: `rewritten: 0, already current: 1`) y un paso
sin `AiContent` utilizable se salta y se nombra, no revienta.

---

## Verificación

| Suite | Antes (`46e067a`) | Después |
|---|---|---|
| Principal | 619 runs, 0F 0E | **638 runs, 2504 aserciones, 0F 0E** |
| Navegador | 50 runs, 370 aserciones, 0F 0E | **50 runs, 370 aserciones, 0F 0E** |
| Combinada con engines | 1005 runs, 3767 aserciones, **3F 1E** | **1032 runs, 4095 aserciones, 3F 1E** |
| RuboCop | limpio | **limpio** |

Tres ejecuciones de cada una, idénticas. La intersección de las tres combinadas son exactamente los
cuatro fallos de engine conocidos, los mismos que en la línea base — `GapAnalysisJobTest`,
`ReinforcementJobTest`, `RouteGenerationJobTest`, `RouteGeneratorTest`. **No los toqué.**

Tests nuevos: 27. Todos enseñados en rojo antes del arreglo (§1: 9 de 13; §2: 5 de 7; las tareas: 2
de 6 con la guarda anulada).

### En el navegador, contra el servidor de desarrollo

Lección de prueba sembrada en la base de datos de **desarrollo**, con el cuerpo que reproduce el
caso real, y **borrada al terminar** (usuario, perfil, ruta y pasos; comprobado a cero).

- Opción A muestra su propia consecuencia, con `"muchas gracias"` en comillas de verdad y el
  énfasis en negrita.
- "Explorar otra opción" las oculta las dos; la opción B muestra **la suya**, distinta.
- El diagrama mermaid **se dibuja** debajo de la tarjeta: `<svg>` de 326 px dentro de
  `div.mermaid.mermaid--rendered`, con la prosa final debajo.
- `&amp;quot;` no aparece en el HTML; `&quot;` no aparece en el texto; `**` no aparece en el texto;
  `[data-consequence]` = 0 elementos.

---

## Lo que NO hice

- **No ejecuté las tareas contra producción.** El censo va primero y lo lee el dueño. Los comandos
  están arriba.
- **No conté nada de producción.** Sin acceso desde este entorno, como en los paquetes anteriores.
- **Hay un hueco que conviene decir en voz alta:** las tareas seleccionan pasos que tengan una
  sección `scenario` persistida, tal y como pedía el brief. Un paso con un `fill_blank` o un
  `code_playground` roto **y sin ningún escenario** conserva su caché vieja hasta que alguien lo
  vuelva a parsear. Los pasos que tienen escenario *y* otro bloque roto se arreglan enteros, porque
  el reparse reescribe el array completo. Ampliar la selección es un cambio de una línea
  (`scenario_steps`), pero cambia el alcance del censo y no lo he hecho por mi cuenta.
- **No re-generé ninguna lección** cuyo escenario saliera vacío: eso es contenido, no parseo, y
  cuesta dinero.
- **No hice los escenarios calificables.** Es un cambio de contrato del generador y va al roadmap.
- **No toqué** WP-24 §1 ni §3, ni nada de WP-23, ni `raise_on_missing_translations`, ni la
  alucinación de claves de respuesta (WP-31).
- **CI sigue en rojo** desde WP-17 por `scan_ruby` (brakeman sale con 5 por el aviso conocido de
  `permit!`) y `scan_js` (6 avisos de DOMPurify/Mermaid). Mientras siga así, el auto-despliegue no
  se dispara.
- **Sigo debiendo la investigación de prompts** que pediste hace varios paquetes.
