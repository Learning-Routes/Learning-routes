# WP-26 — Terminar el examen y la respuesta de voz

**Escrito:** 2026-09-04 · **Rama:** `wp26-exam-and-voice`, base `main` @ `b29c4ed`
**Árbol limpio. No fusionada, no desplegada.**

`main` llevaba `99f6279` (WP-24) y producción iba por delante. **Fusioné
`wp25-exam-wont-start` en `main` antes de ramificar**, así que `b29c4ed` es el merge de WP-25 y
WP-26 sale de ahí.

---

## 1. §1 — el examen: mi propio brief estaba mal, y el test que pedí no podía atraparlo

El brief de WP-25 §1 (mío) decía que la opción (b) significaba *"the POST is answered with the
full HTML page"*. **Turbo no permite eso.** Una respuesta de formulario tiene que terminar en
redirección o en turbo_stream; un 200 con cuerpo HTML se descarta:

```
Error: Form responses must redirect to another location
  formSubmissionErrored @ turbo.es2017-esm.js:4906
```

Y el test que especifiqué afirmaba `assert_response :success`, que un render HTML de 200 **pasa**.
Servidor sano, test verde, botón muerto. Las dos cosas se arreglan aquí.

### La forma era el problema

No existía ningún GET que renderizara el examen. `start.html.erb` — una página completa con su
propio `content_for(:title)` — se renderizaba **desde el POST**. Además de lo de Turbo, eso
significa que un refresco re-POSTea y vuelve a ejecutar `AssessmentResult.create!` y el upsert de
`StudySession`.

- `get :take` añadido; `start.html.erb` movido a `take.html.erb` sin tocar su contenido.
- `start` conserva la creación, el cambio de estado del paso y la `StudySession`, y después
  `redirect_to take_assessment_path(@assessment), status: :see_other`. El **303** no es cosmético:
  es lo que convierte el POST en GET. Un 302 reemitiría el POST.
- `take` renderiza y **no crea nada**. Sin resultado en curso, el alumno no ha empezado: se le
  devuelve a la tarjeta de intro que tiene el botón.

**No** se usó `form: { data: { turbo: false } }`. Haría funcionar el botón hoy y dejaría un POST
que renderiza una página, así que refresco y botón atrás seguirían acuñando resultados.

### El barrido: sin más instancias

Cuatro acciones no-GET salieron como candidatas — `locale#update`, `theme#update`,
`settings#update`, `settings#update_password`. **Leí las cuatro: todas son correctas.** Dos
redirigen; las de `settings` sólo renderizan en el camino de ERROR con 422, que es la forma
documentada en Turbo de repintar un formulario con errores. **Turbo rechaza un 200 HTML, no un
4xx.** Verificado contra la documentación, no supuesto.

La heurística que las marcó tenía un fallo de extracción de cuerpo (asumía indentación de 4
espacios), así que **el barrido se reporta aquí y no se envía como test**. Un barrido que da falsos
positivos es peor que ninguno.

---

## 2. §2 — la voz: nunca funcionó en Chrome, y no era ninguno de los tres candidatos

`_supportedMimeType` ofrece `"audio/webm;codecs=opus"` **el primero**. Chrome lo soporta, así que
cada grabación se subía con esa cadena exacta, y el servidor la comparaba con `include?` —
igualdad exacta de cadena — contra una lista escrita sin parámetros de códec.
`"audio/webm;codecs=opus"` no es `"audio/webm"`.

Ni la puerta de derechos, ni el job, ni `/cable`: **ninguno de los tres candidatos que listó
WP-25 §2.** El primer formato que elige el cliente es el que el servidor rechaza, y las dos listas
se escribieron para no coincidir.

El servidor compara ahora el **media type** con los parámetros quitados. Añadir
`"audio/webm;codecs=opus"` a la lista habría arreglado Chrome y dejado Firefox
(`"audio/ogg;codecs=opus"`) fallando igual — el test nombra **los dos** hoy.

**Quinta instancia** de "cliente y servidor mantienen dos listas del mismo vocabulario y nada las
sincroniza" (el vocabulario de bloques fueron las primeras cuatro, y por eso existe
`LessonBlocks`). Por eso el test **lee la lista de candidatos del propio JavaScript** en vez de
retecleárla: una lista copiada a mano en un test es una tercera copia que deriva igual.

---

## 3. §3 — CSP, y WP-23 §3 cerrado de paso

No había `media_src`, así que `<audio src="blob:...">` caía a `default-src 'self'` y el alumno no
podía escuchar su propia grabación antes de enviarla. Tampoco había `worker_src`, así que el worker
`blob:` de canvas-confetti caía a `script-src` y la celebración nunca se disparaba — **eso es
WP-23 §3, y queda cerrado aquí**, porque es el mismo archivo y la misma edición.

El test de CSP lleva **un comentario por directiva nombrando quién la necesita**. Ése es el punto
del archivo: una lista de directivas sin atribución es exactamente cómo pasaron las dos cosas — el
siguiente aprieta la política, borra una, y rompe una función que nadie había conectado con ella.

---

## 4. Verificación

| Suite | Antes (`b29c4ed`) | Después |
|---|---|---|
| Principal | 571 runs, 2292 aserciones, 0F 0E | **586 runs, 2345 aserciones, 0F 0E** |
| Navegador | 42 runs, 328 aserciones, 0F 0E | **46 runs, 347 aserciones, 0F 0E** |
| Combinada | 942 runs, 3F 1E | **961 runs, 3653 aserciones, 3F 1E** |
| RuboCop | limpio | **547 archivos, sin ofensas** |

Principal y navegador: **tres ejecuciones cada una, idénticas**. Combinada: intersección de tres,
exactamente los cuatro fallos de engine conocidos, sin tocar.

### Los tres tests, en rojo antes del arreglo

**§2**, restaurando la comparación exacta:

```
Assessments::VoiceUploadFormatsTest#test_every_mime_type_the_recorder_can_produce_is_accepted
the recorder can produce these and the server answers 415 Unsupported Media Type:
  audio/webm;codecs=opus
  audio/ogg;codecs=opus
```

**§3**, quitando las dos directivas:

```
ContentSecurityPolicyTest#test_media-src_allows_blob:_for_the_voice_recorder's_preview
Expected [] to include "blob:".
ContentSecurityPolicyTest#test_worker-src_allows_blob:_for_canvas-confetti
Expected [] to include "blob:".
```

**§1**, restaurando el render-desde-POST:

```
ExamStartTest#test_pressing_Iniciar_examen_actually_navigates_to_the_exam
expected "/assessments/assessments/<id>" to equal "/assessments/assessments/<id>/take"
```

---

## 5. Lo que NO se hizo

- **Nada verificado en el navegador real contra producción.** El brief pide comprobar la
  reproducción del preview de voz en el navegador y no fiarse de que la directiva esté escrita. Lo
  que hay es el test de cabecera CSP y los tests de sistema en Chrome headless local. La
  confirmación en el sitio en vivo sigue necesitando un despliegue humano.
- **CI sigue en rojo.** WP-25 subió Postgres a 17, lo que arregla `test` y `system-test`, pero
  `scan_ruby` (brakeman sale 5 por el `permit!` conocido) y `scan_js` (los seis avisos de
  DOMPurify/Mermaid) siguen fallando, así que el auto-despliegue no se dispara.
- **El barrido de §1 no se envía como test** (falsos positivos; ver §1).
- **Fuera de este paquete, como pedía el brief:** WP-24 §2 (el parser de escenario sin terminador,
  el bug de más valor que queda), WP-23, WP-20, Task 8, Task 9, y `wp7-true-costs`, sin fusionar
  desde agosto y que necesita una decisión del dueño, no de un agente.
- **§4 sigue abierto**: las violaciones de CSP por handlers inline son WP-23 §5. La CSP usa
  **nonces**, así que `'unsafe-inline'` nunca estuvo disponible y mover los doce handlers es el
  único arreglo. El test de CSP de este paquete lo afirma explícitamente para que no se vuelva a
  proponer el atajo.
