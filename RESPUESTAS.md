# Respuestas · Laboratorio 4
Alumno: [20201230]
Presupuesto: [8] min  Métrica DORA: [change failure rate]

## Parte 1 · Diagnóstico
### Defecto 1
- Job y etapa: `smoke`, etapa deploy (tenía `needs: build-push`, al mismo nivel que `deploy`).
- Problema que causa en el pipeline: `smoke` arrancaba en paralelo con `deploy`, así que podía llamar a la Lambda antes de que se actualizara y validar la versión anterior. `e2e` y `load` dependen de `smoke` y heredaban el mismo problema. Además, `ci.yml` no pasaba `EXPECTED_COMMIT` a `smoke.sh`, por lo que nadie verificaba que la versión probada fuera la del commit del run. El run podía quedar en verde habiendo probado la versión anterior: una versión nueva que no arranca o responde mal pasaba sin que `smoke`, `e2e` ni `load` lo detectaran.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/a0a15e52990a03ce16285cc7f7cc2f3e873d1f25
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): mover de etapa (`smoke` pasa a `needs: deploy`, etapa post-deploy) y ajustar configuración (`EXPECTED_COMMIT: ${{ github.sha }}`).
- Evidencia (dato observado, con link al run o fragmento de la salida local): run https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475 (commit `ce57ada`). `smoke` empezó después de que terminó `deploy`. El log del job `smoke` (https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475/job/123752082952) confirma que se probó el commit del run:
  ```
  salud: {"ok":true,"version":"1.0.0","commit":"ce57ada149ff83f346386c7e3adce1e6461053b2"}
  commit: ce57ada149ff83f346386c7e3adce1e6461053b2
  ```
### Defecto 2
- Job y etapa: todo el workflow (falta `concurrency` a nivel de workflow); afecta sobre todo a las etapas deploy y post-deploy porque todos los runs comparten la misma Lambda.
- Problema que causa en el pipeline: un push nuevo a un PR no cancelaba el run anterior del mismo PR, que seguía corriendo completo (unos 15 min, 12 de ellos en `load`) aunque ya estaba obsoleto. Además, dos runs de la misma rama desplegaban en la misma función y los `smoke`/`e2e`/`load` de uno podían probar la imagen del otro, y dos `load` simultáneos alteraban la latencia medida. El `concurrency` de `deploy` solo serializa el despliegue, no el despliegue más las pruebas.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/df3fd40dc5d5f58c3b9a11ee633e4bc4713b3ac8
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): ajustar configuración (`concurrency: group: ci-${{ github.ref }}` con `cancel-in-progress` solo en `pull_request`; en `main` los runs quedan en cola y no se cancelan).
- Evidencia (dato observado, con link al run o fragmento de la salida local): dos push seguidos a la rama del PR #1. El run del primero (https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40963021282, commit `0bf97a7`) quedó en estado `cancelled` con sus 9 jobs cancelados, y GitHub registró la anotación:
  ```
  Canceling since a higher priority waiting request for ci-refs/pull/1/merge exists
  ```
  Solo siguió el run del último push (https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40963046982, commit `a47c1b2`).
### Defecto 3
- Job y etapa: `sca`, etapa pre-build.
- Problema que causa en el pipeline: Trivy corría con `--include-dev-deps` y analizaba también Playwright, c8, esbuild y sus dependencias, que no llegan a la imagen (el `Dockerfile` hace `npm prune --omit=dev`). Como el job falla con HIGH o CRITICAL, una vulnerabilidad en una herramienta de desarrollo bloqueaba `build-push` y el despliegue sin afectar lo que corre en Lambda: falsos positivos que frenan el flujo. Lo que realmente se despliega ya lo cubre el escaneo de la imagen.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/3bc92753112fb2fdd1e1529f5287d6b4b2421763
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): ajustar configuración (se quita `--include-dev-deps`; Trivy analiza solo las dependencias de producción).
- Evidencia (dato observado, con link al run o fragmento de la salida local): salida local sobre el mismo `package-lock.json`. El job escaneaba 98 paquetes y solo 39 llegan a la imagen:
  ```
  $ npm ls --all --parseable | wc -l
  98
  $ npm ls --all --omit=dev --parseable | wc -l
  39
  ```
### Defecto 4
- Job y etapa: `e2e`, etapa post-deploy (`test/e2e/api.spec.ts`, `playwright.config.ts` y el job `e2e` de `ci.yml`).
- Problema que causa en el pipeline: los 10 tests usaban el fixture `page`, que obliga a lanzar Chromium, aunque solo hacen llamadas HTTP a una API sin interfaz web. Por eso el job instalaba el navegador y sus dependencias del sistema (`npx playwright install --with-deps chromium`) en cada run: tiempo desperdiciado, mayor que el de los propios tests.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/a9bd4d8c8a8f35280a1c2b310dec5d6b49798708
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): modificar tests (fixture `request` en lugar de `page`, proyecto `api` sin dispositivo de navegador) y eliminar (step "Navegador" del job `e2e`).
- Evidencia (dato observado, con link al run o fragmento de la salida local): salida local contra un servidor que envuelve `src/handler.js`, con `PLAYWRIGHT_BROWSERS_PATH` apuntando a una carpeta vacía (sin navegadores):
  ```
  # versión original (fixture page)
  Error: browserType.launch: Executable doesn't exist at ...\chromium_headless_shell-1248\chrome-headless-shell-win64\chrome-headless-shell.exe
  # versión corregida (fixture request)
  10 passed (480ms)
  ```
  En el run https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475 el job `e2e` (https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475/job/123752151991) ya no tiene el step "Navegador" y duró 21 s, con los 10 tests en verde.
### Defecto 5
- Job y etapa: `load`, etapa post-deploy (`test/load/transferir.js`).
- Problema que causa en el pipeline: el script declaraba `http.expectedStatuses(200, 400)` y el check aceptaba "200 o 400", así que un 400 no contaba en `http_req_failed` ni como check fallido. Cada iteración transfiere S/ 1 con datos válidos entre usuarios semilla con saldos de S/ 300 a S/ 1200, así que un 400 no es un resultado esperado. Si un despliegue rompía `/transferir` y respondía 400 a todo, `load` reportaba 0 % de errores y pasaba en verde, y la latencia medida incluía respuestas de error.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/ce57ada149ff83f346386c7e3adce1e6461053b2
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): modificar tests (solo 200 es respuesta esperada y el check pasa a `transferir 200`; el umbral `rate<0.01` sigue tolerando un 400 ocasional).
- Evidencia (dato observado, con link al run o fragmento de la salida local): resumen de k6 del job `load` en el run https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475/job/123752151937. Con solo 200 como respuesta esperada, ninguno de los 38 534 requests devolvió 400, así que aceptar 400 como éxito no cubría ningún caso legítimo y solo podía ocultar fallas:
  ```
  ✓ transferir 200
  ✓ saldo 200
  checks_succeeded...: 100.00% 38534 out of 38534
  http_req_failed................: 0.00%  0 out of 38534
  ```

## Parte 2 · Implementación
- Link al run en verde en main: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475 (commit `ce57ada`, que tiene en su historial los cinco commits de la Parte 1).
- Link al pull request: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/pull/1
- Defecto de la aplicación introducido (archivo y descripción): `src/wallet.js`, función `transferir`. Cuando origen y destino son el mismo usuario, `POST /transferir` responde 400 en lugar de 422. Rompe la regla del contrato de la API ("422 si el origen y el destino son el mismo usuario"): el cliente recibe "petición inválida" cuando la petición está bien formada pero la operación no está permitida, y no puede distinguir este caso de un monto o usuario inválido.
- Job que debería detenerlo: `unit`, con el test `transferir al mismo usuario es 422` de `test/unit/wallet.test.js`. Es la prueba más barata y más cercana a la lógica de negocio y corre en segundos sin base de datos ni red. `integration` también lo detecta con su propio test `transferir al mismo usuario es 422`.
- Link al run fallido: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40962285667 (`unit` e `integration` en rojo con `+ status: 400` / `- status: 422`; `build-push`, `deploy`, `smoke`, `e2e` y `load` no corren, así que la versión defectuosa nunca se despliega).

## Parte 3 · Decisión bajo restricción
Link al run medido:

| Job | Duración (min:seg) |
|---|---|
| unit | |
| integration | |
| sast | |
| sca | |
| build-push | |
| deploy | |
| smoke | |
| e2e | |
| load | |
| **Total** | |

Resultado de load en ese run:
| Métrica | Valor |
|---|---|
| p90 | |
| p95 | |
| Máximo | |
| Tasa de error | |
| Requests por segundo | |

Conclusión sobre el comportamiento bajo carga:

SLO propuesto (percentil, valor, ventana) y justificación:

SLA propuesto y diferencia con el SLO:

Cambios para cumplir el presupuesto:
| Cambio | Job | Minutos recuperados |
|---|---|---|

Total resultante: [ ] min
Link al run en main con los cambios:

Riesgo aceptado (defecto de la aplicación concreto y efecto en la métrica DORA asignada):

Decisión sobre sast (se queda / se mueve a otra etapa o evento / informativo) y razón:

## Declaración de uso de IA
Herramientas usadas y para qué:
