# WP-3 — Lista de despliegue

Rama `wp2-ship-ready` (3 commits) sobre `d18b31a`. Producción corre `b82338d` del 28-abr.
Este deploy mueve producción **tres meses y 36 commits de golpe**. Merece la lista entera.

---

## 0 · Antes de tocar nada: la cuenta admin

**Sigue pendiente y es lo único urgente de verdad.** La imagen desplegada contiene un
`db/seeds.rb` sin guarda de entorno que crea `admin@learning-routes.com` / `password123` con rol
admin, y `docker-entrypoint` corre `db:prepare` en cada arranque.

```bash
kamal app exec --reuse 'bin/rails runner "u=Core::User.find_by(email: %q(admin@learning-routes.com)); puts u ? \"EXISTE role=#{u.role} creada=#{u.created_at}\" : \"no existe\""'
```

Si existe → bórrala o cámbiale la contraseña **ahora**, sin esperar al deploy. Es una web pública
con credencial de administrador adivinable. Este deploy arregla el *seed*, no la fila que ya
pueda estar en la base de datos.

---

## 1 · `RAILS_MASTER_KEY` — el riesgo nuevo

Hallazgo de WP-2: **este repo no tiene `config/master.key` en absoluto.** Usa credenciales por
entorno (`config/credentials/production.key`). El `.kamal/secrets` viejo hacía
`cat config/master.key 2>/dev/null` → cadena vacía, en **todos** los caminos de deploy, no solo
desde Actions.

Rails sí acepta `RAILS_MASTER_KEY` para credenciales por entorno, pero tiene que contener el
valor de `production.key`. Si tu secreto de GitHub guarda una master key antigua, las credenciales
no descifran y el contenedor arranca roto.

No se puede leer un secreto de GitHub una vez guardado, así que no lo compruebes — **vuélvelo a
poner**:

```bash
cat config/credentials/production.key        # este valor exacto
gh secret set RAILS_MASTER_KEY --repo <tu/repo>
```

Y si despliegas desde el portátil, confirma que `.kamal/secrets` resuelve el mismo valor.

---

## 2 · Estado de migraciones — ahora es bloqueante

A5 quitó el `|| echo` de `bin/docker-entrypoint`, que es lo correcto: convierte una corrupción
silenciosa en un deploy fallido y ruidoso. Pero significa que un esquema a medio migrar **para el
rollout** en vez de servir tráfico roto. Mira antes en qué estado está:

```bash
kamal app exec --reuse 'bin/rails runner "puts ActiveRecord::Base.connection.migration_context.needs_migration?"'
```

`false` → tranquilo. `true` → el deploy va a correr migraciones; ten el backup a mano y hazlo con
tiempo por delante, no a última hora.

---

## 3 · Antes de `kamal deploy`

- [ ] Suite completa a mano: `bin/rails test test engines/*/test` → **389 runs, 5F 9E**.
      Los 14 están catalogados en `FINDINGS_WP2.md §1` y **no bloquean este deploy** — son
      travesías perezosas preexistentes que el guard de test acaba de destapar. Producción pasa
      de `:raise` a `:log`, que es estrictamente más seguro que lo que hay vivo hoy.
- [ ] Camino de CI verde: `bin/rails db:test:prepare test` → **101 runs, 0F 0E**.
- [ ] Imagen sin claves — ya verificado con control negativo. Repítelo sobre la imagen final.
- [ ] `b82338d` anotado como destino de rollback.
- [ ] Ventana tranquila. Es el primer deploy en tres meses.

---

## 4 · Después del deploy

**La verificación de strict loading va al revés de lo que decía mi roadmap original.** Rails emite
ese evento a `debug` y producción corre a `info`, así que `:log` a secas habría sido silencio.
El initializer lo re-emite a WARN.

```bash
kamal app logs | grep StrictLoadingViolationError   # debe devolver CERO
kamal app logs | grep '\[StrictLoading\]'           # debe devolver ENTRADAS
```

Cero en el primero y cero en el segundo significa que el initializer no está cargando — no que
todo esté limpio. Con 101 asociaciones sin arreglar, el silencio total es la señal sospechosa.

Además:

- [ ] `GET /routes/create` autenticado → 200, con perfil de aprendizaje existente.
- [ ] Enviar el formulario con datos inválidos → 422 con banner, no 500.
- [ ] El audio de una lección suena (valida el volumen de P3-3).
- [ ] `ps aux | grep -c solid` en el contenedor **web** → debe bajar respecto a antes (P3-6).
- [ ] `RouteRequest.group(:status).count` → los `pending` zombis deben empezar a pasar a `failed`
      en los primeros 10 minutos (el reaper).
- [ ] La cuenta admin sigue sin existir.

---

## 5 · La primera semana

Vigila los tres jobs que despiertan. `GapAnalysisJob`, `ReinforcementJob` y
`AssessmentGenerationJob` llevaban meses reventando por dentro y reportando éxito; ahora funcionan.

```bash
kamal app logs | grep -E 'GapAnalysisJob|ReinforcementJob|AssessmentGenerationJob'
```

Deberían aparecer con sus mensajes de `Rails.logger.info` reales — «Found N gaps», «Generated N
reinforcement routes», «Assessment generated … N questions». Si ves esos, funciona algo que
llevaba meses sin funcionar.

Y con ellos llega gasto de OpenAI en rutas que costaban ~$0. Se disparan por acción del usuario,
no por cron, así que escala con uso real. Aun así, `cost_tracker.rb` tiene precios de febrero y
ElevenLabs está tarifado a cero: **contrasta la factura real de la primera semana contra
`AiInteraction.sum(:cost_cents)`.** Si divergen mucho, WP-7 pasa a ser lo siguiente.

---

## Si algo va mal

```bash
kamal rollback b82338d
```

Vuelves a la web de abril: wizard roto, sin rack-attack, sin CSP, con el seed admin. Es peor que
ahora — pero es un estado conocido. Úsalo sin dudar y diagnostica con calma.
