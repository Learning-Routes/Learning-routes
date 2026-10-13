# WP-25 — El examen no arranca

**Escrito:** 2026-09-04 · **Rama:** `wp25-exam-wont-start`, base `main` @ `99f6279`
**Árbol limpio. No fusionada, no desplegada.**

---

## 1. §1 — el 406, y la duda del brief resuelta

El brief marcaba una incertidumbre honesta: un 406 (`UnknownFormat`) y una plantilla que falta son
fallos distintos con arreglos distintos, y pedía no arreglar sobre la hipótesis sola.

**Son el mismo fallo.** `ActionController::MissingExactTemplate` **hereda de**
`ActionController::UnknownFormat`, y Rails mapea esa clase a `:not_acceptable`. Verificado de dos
formas:

```
MissingExactTemplate ancestors: [MissingExactTemplate, UnknownFormat, ActionControllerError, StandardError]
UnknownFormat -> status: not_acceptable
```

y reproducido en local con la cabecera exacta que manda Turbo:

```
REPRO turbo_accept -> 406   media="text/html"
REPRO html_accept  -> 200
```

Así que un formato declarado sin plantilla **no** cae a `head :no_content`: **lanza**, y la
excepción se responde como 406. La hipótesis del brief era correcta y la duda queda cerrada.

**No conseguí el log de producción.** `kamal app logs` no devolvió nada utilizable desde este
entorno. No hizo falta: la reproducción local es determinista y la controlo yo, que es mejor
evidencia que una línea de log.

### La decisión: opción (b)

- `git log --all --diff-filter=A -- start.turbo_stream.erb` está **vacío**: nunca existió.
- `start.html.erb` es una página completa, con su propio `content_for(:title)`.
- Los dos sitios de llamada son `button_to` planos; nada espera un stream.

Iniciar un examen es una **navegación**. Declarar un formato que no puedes renderizar es el
defecto; añadir una plantilla para justificar la declaración sería construir una función para tapar
un error.

### Un segundo defecto, encontrado al reproducir

`set_assessment` hacía un `find` pelado, y `authorize_assessment_owner!` — que es un `before_action`,
o sea que corre en **cada** petición de este controlador — recorre acto seguido
`route_step -> learning_route -> learning_profile`. Tres saltos perezosos.
`strict_loading_by_default` sólo **registra** en producción, así que esto ha sido un N+1 en cada
página de examen en vez de un fallo visible. En test **lanza**, que es como salió a la luz. Ahora
`set_assessment` hace `includes`.

### El barrido, y sus tres hallazgos

`respond_to_formats_have_templates_test.rb` recorre todos los controladores y exige que cada
formato declarado tenga plantilla o renderice en línea. **Se ejecutó antes de arreglar nada** y
encontró, además del examen, **tres más — todos reales, ninguno alcanzable hoy**:

| Sitio | Por qué no es alcanzable |
|---|---|
| `block_attempts#create` | `block_submission.js` manda `Accept: application/json` explícito |
| `shared_routes#create` | ningún formulario publica ahí |
| `lessons#agent_interact` | **cero** sitios de llamada |

Quité la declaración de los tres en vez de arrastrar exenciones: cada una sólo puede terminar en
406, así que quitarla **no cambia ningún comportamiento** y deja de mentir. `agent_interact` queda
anotado: si algún día se conecta, necesita plantilla como sus cuatro hermanos (`deepen`,
`explain_differently`, `give_example`, `simplify`) y esta línea de vuelta.

---

## 2. §2 — diagnosticado, y no es ninguno de los tres

El brief daba tres candidatos y pedía diagnosticar a uno y parar. La respuesta es que el defecto es
**lo que hacía a los tres indistinguibles**.

`voice_recorder_controller.js`:

```js
if (!response.ok) { throw new Error(`Upload failed: ${response.status}`) }
...
} catch (err) { console.error(...); this.showState("idle") }
```

Cualquier respuesta no-OK volvía a `idle` sin nada en pantalla. Eso es exactamente el síntoma
reportado: *"no result, no error, no spinner resolving"*. Y hace que un `head :forbidden` de la
puerta de derechos, un job que no corrió y un broadcast que no llegó **se vean igual desde el
asiento del alumno** — que es la razón de que no se pudiera acotar desde fuera de producción.

**La política no se toca**, como pedía el brief. Lo que cambia es que el rechazo es legible: un 403
dice que la ruta no está desbloqueada; cualquier otro fallo dice que la subida falló y que no se ha
perdido nada. Ambos con reintento. Dos cadenas nuevas, `en` y `es`.

**Lo que sigue sin saberse:** cuál de los tres candidatos disparó el caso concreto del dueño.
No tengo acceso a producción para mirar la entitlement de esa ruta, la cola de Solid Queue ni
`/cable`. Este arreglo es el **instrumento**: la próxima vez el propio widget dice de cuál se trata.

---

## 3. CI — hecho en esta rama, y qué NO arregla

`ci.yml:71` y `:106` corrían `postgres:16-alpine` mientras `db/structure.sql:4` emite
`SET transaction_timeout = 0`, un parámetro de PostgreSQL 17. `psql` no cargaba el esquema y
**todos** los tests fallaban antes de ejecutarse. Por eso CI está en rojo desde WP-17 y el
auto-despliegue no se ha disparado nunca. Ambas líneas dicen ahora `postgres:17-alpine`, que
coincide con el servidor 17.7 contra el que se desarrolla.

**Con precisión sobre lo que esto logra:** arregla `test` y `system-test`. **No** arregla
`scan_ruby` (brakeman sale con código 5 por el aviso conocido de `permit!`) ni `scan_js` (los seis
avisos conocidos de DOMPurify/Mermaid). CI seguirá concluyendo en fallo y el auto-despliegue
seguirá sin dispararse. Es **una de las tres** cosas que bloquean la puerta, no la puerta entera.
El brief la describía como "a two-line change that unblocks auto-deploy"; es un tercio de eso.

---

## 4. Verificación

| Suite | Antes (`99f6279`) | Después |
|---|---|---|
| Principal | 564 runs, 2276 aserciones, 0F 0E | **571 runs, 2292 aserciones, 0F 0E** |
| Navegador | 39 runs, 317 aserciones, 0F 0E | **42 runs, 328 aserciones, 0F 0E** |
| Combinada | 932 runs, 3F 1E | **942 runs, 3581 aserciones, 3F 1E** |
| RuboCop | limpio | **544 archivos, sin ofensas** |

Principal y navegador: **tres ejecuciones cada una, idénticas**. Combinada: intersección de tres,
exactamente los cuatro fallos de engine conocidos, sin tocar.

### En rojo antes del arreglo

**§1**, restaurando sólo la declaración:

```
Assessments::StartExamTest#test_starting_an_exam_from_a_Turbo_button_returns_the_exam_page,_not_406
Expected response to be a <2XX: success>, but was a <406: Not Acceptable>

RespondToFormatsHaveTemplatesTest#test_every_declared_respond_to_format_can_actually_be_rendered
  engines/assessments/.../assessments_controller.rb#start declares format.turbo_stream
  with no template and no inline render
```

**§2**, restaurando el `throw`:

```
VoiceRefusalVisibleTest#test_a_refused_voice_submission_shows_a_specific_message_instead_of_going_quiet
expected to find visible css "[data-voice-recorder-target='stateError']" but there were no matches

VoiceRefusalVisibleTest#test_the_widget_never_silently_returns_to_idle_on_a_refusal
expected not to find visible css "[...stateIdle]:not(.hidden)", found 1 match:
"Graba tu respuesta explicando lo que aprendiste"
```

---

## 5. Lo que NO se hizo

- **La verificación en vivo.** El dueño tiene que abrir un examen en el sitio, y eso sólo prueba
  algo **después** de desplegar. No está desplegado, y CI sigue en rojo por `scan_ruby` y
  `scan_js`. Es el único paso que confirma §1 de verdad.
- **No se cerró §2 a uno de los tres candidatos.** Requiere producción: la entitlement de esa ruta
  para ese usuario, el estado en Solid Queue, y si `/cable` entrega. El arreglo hace que la próxima
  vez se identifique solo.
- **§3 no está en este paquete**, como decía el brief. Queda en WP-23 §5, ahora con evidencia de
  producción: la CSP usa **nonces**, así que `'unsafe-inline'` nunca estuvo disponible y mover los
  doce handlers a CSS es el único arreglo.
- **No perseguido, y correctamente**: el `reportAllChanges` / `web-vitals` es una extensión del
  navegador, no la aplicación. `grep` no encuentra web-vitals en `importmap.rb` ni en
  `app/javascript`.
