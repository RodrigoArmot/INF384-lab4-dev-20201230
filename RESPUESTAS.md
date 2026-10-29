# Respuestas · Laboratorio 4
Alumno: [20201230]
Presupuesto: [8] min  Métrica DORA: [change failure rate]

## Parte 1 · Diagnóstico
### Defecto 1
- Job y etapa: `smoke`, etapa deploy (tenía `needs: build-push`, al mismo nivel que `deploy`).
- Problema que causa en el pipeline: `smoke` corría en paralelo con `deploy`, así que `smoke`, `e2e` y `load` podían probar la versión anterior de la Lambda. Además no se pasaba `EXPECTED_COMMIT` a `smoke.sh`, por lo que nadie verificaba qué versión se probó. Una versión nueva que no arranca podía pasar en verde.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/a0a15e52990a03ce16285cc7f7cc2f3e873d1f25
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): mover de etapa (`needs: deploy`) y ajustar configuración (`EXPECTED_COMMIT: ${{ github.sha }}`).
- Evidencia (dato observado, con link al run o fragmento de la salida local): en el run https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475 `smoke` empieza después de `deploy` y su log (https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475/job/123752082952) confirma el commit del run:
  ```
  commit: ce57ada149ff83f346386c7e3adce1e6461053b2
  ```
### Defecto 2
- Job y etapa: todo el workflow (no tenía `concurrency`); afecta a las etapas deploy y post-deploy, porque todos los runs usan la misma Lambda.
- Problema que causa en el pipeline: un push nuevo a un PR no cancelaba el run anterior, que seguía corriendo completo (unos 15 min) aunque ya estaba obsoleto. Además, dos runs de la misma rama podían desplegar y probar la misma función a la vez, y uno terminaba probando la imagen del otro.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/df3fd40dc5d5f58c3b9a11ee633e4bc4713b3ac8
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): ajustar configuración (`concurrency` por rama, con `cancel-in-progress` solo en `pull_request`).
- Evidencia (dato observado, con link al run o fragmento de la salida local): tras dos push seguidos al PR #1, el primer run (https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40963021282) quedó `cancelled` con la anotación:
  ```
  Canceling since a higher priority waiting request for ci-refs/pull/1/merge exists
  ```
### Defecto 3
- Job y etapa: `sca`, etapa pre-build.
- Problema que causa en el pipeline: con `--include-dev-deps`, Trivy analizaba también las dependencias de desarrollo (Playwright, c8, esbuild), que no llegan a la imagen porque el `Dockerfile` hace `npm prune --omit=dev`. Una vulnerabilidad en esas herramientas bloqueaba el despliegue sin afectar lo que corre en Lambda.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/3bc92753112fb2fdd1e1529f5287d6b4b2421763
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): ajustar configuración (se quita `--include-dev-deps`).
- Evidencia (dato observado, con link al run o fragmento de la salida local): salida local; el job escaneaba 98 paquetes y solo 39 llegan a la imagen:
  ```
  $ npm ls --all --parseable | wc -l
  98
  $ npm ls --all --omit=dev --parseable | wc -l
  39
  ```
### Defecto 4
- Job y etapa: `e2e`, etapa post-deploy.
- Problema que causa en el pipeline: los tests usaban el fixture `page`, que obliga a lanzar Chromium, aunque solo hacen llamadas HTTP. Por eso el job instalaba el navegador y sus dependencias en cada run, tiempo desperdiciado.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/a9bd4d8c8a8f35280a1c2b310dec5d6b49798708
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): modificar tests (fixture `request`) y eliminar (step "Navegador").
- Evidencia (dato observado, con link al run o fragmento de la salida local): salida local sin ningún navegador instalado (`PLAYWRIGHT_BROWSERS_PATH` vacío):
  ```
  # antes (fixture page)
  Error: browserType.launch: Executable doesn't exist at ...\chrome-headless-shell.exe
  # después (fixture request)
  10 passed (480ms)
  ```
### Defecto 5
- Job y etapa: `load`, etapa post-deploy.
- Problema que causa en el pipeline: el script aceptaba 400 como respuesta válida (`expectedStatuses(200, 400)` y el check "200 o 400"). La carga solo hace transferencias válidas, así que si un despliegue rompía `/transferir` y respondía 400, `load` reportaba 0 % de errores y pasaba en verde.
- Link al commit: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/commit/ce57ada149ff83f346386c7e3adce1e6461053b2
- Corrección (una o más: mover de etapa / dejar como informativo / eliminar / ajustar configuración / modificar tests): modificar tests (solo 200 es respuesta esperada).
- Evidencia (dato observado, con link al run o fragmento de la salida local): en el job `load` (https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475/job/123752151937), con solo 200 aceptado, ningún request devolvió 400:
  ```
  ✓ transferir 200
  http_req_failed................: 0.00%  0 out of 38534
  ```

## Parte 2 · Implementación

### 2.1 Run en verde en main
- Link al run en verde en main: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475 (commit `ce57ada`, que contiene los cinco commits de la Parte 1).

### 2.2 Defecto de la aplicación
- Link al pull request: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/pull/1
- Defecto de la aplicación introducido (archivo y descripción): `src/wallet.js`. Una transferencia con el mismo usuario como origen y destino responde 400 en lugar de 422.
- Job que debería detenerlo: `unit` (test `transferir al mismo usuario es 422`).
- Link al run fallido: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40962285667 (`unit` en rojo; `integration` también falla).

## Parte 3 · Decisión bajo restricción

### 3.1 Duración de cada job
Link al run medido: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40960386475

| Job | Duración (min:seg) |
|---|---|
| unit | 0:18 |
| integration | 0:10 |
| sast | 0:25 |
| sca | 0:15 |
| build-push | 0:44 |
| deploy | 0:19 |
| smoke | 0:07 |
| e2e | 0:21 |
| load | 12:10 |
| **Total** | **14:49** |

### 3.2 Resultado de load, SLO y SLA
Resultado de load en ese run:
| Métrica | Valor |
|---|---|
| p90 | 18,46 ms |
| p95 | 20,96 ms |
| Máximo | 246,58 ms |
| Tasa de error | 0,00 % |
| Requests por segundo | 53,46 |

Conclusión sobre el comportamiento bajo carga: con 30 usuarios virtuales, Monedero Andino responde rápido, estable y sin errores. El máximo es aislado y corresponde a arranques en frío de Lambda, no a una degradación sostenida.

SLO propuesto (percentil, valor, ventana) y justificación: p95 menor a 150 ms, medido en cada prueba de carga de 4,5 min. El p95 varió de 20,96 ms en este run a 72,06 ms en el run de la 3.3, así que un valor cercano a lo medido fallaría sin una regresión real. 150 ms deja unas 2 veces de margen sobre el peor valor observado y sigue detectando una degradación real, cosa que 500 ms no hacía. Configurado en `SLO_P95: 150` de `ci.yml`.

SLA propuesto y diferencia con el SLO: p95 menor a 500 ms y 99,5 % de disponibilidad mensual, con compensación al cliente si no se cumple. El SLO es un objetivo interno que detiene el pipeline; el SLA es un compromiso con el cliente que tiene penalidad. El SLA es más laxo para que el equipo reaccione al incumplir el SLO antes de violar el contrato.

### 3.3 Cambios para cumplir el presupuesto
Cambios para cumplir el presupuesto:
| Cambio | Job | Minutos recuperados |
|---|---|---|
| Stages de `test/load/transferir.js`: subida de 1 min a 30 s, carga constante de 10 a 4 min y sin bajada | `load` | 7:28 (12:10 → 4:42) |

Total resultante: [7:17] min
Link al run en main con los cambios: https://github.com/RodrigoArmot/INF384-lab4-dev-20201230/actions/runs/40964547956

### 3.4 Riesgo aceptado
Riesgo aceptado (defecto de la aplicación concreto y efecto en la métrica DORA asignada): una fuga de memoria en `src/wallet.js` (cada transferencia se guarda en un arreglo en memoria que nunca se vacía). Con 10 min de carga las instancias de Lambda llegaban a agotar memoria y `load` fallaba; con 4 min no alcanza, el pipeline pasa en verde y la falla aparece después en producción. El change failure rate sube: el defecto pasa el pipeline como un despliegue exitoso y recién en producción obliga a revertir o corregir de urgencia, así que aumenta la proporción de despliegues fallidos.

### 3.5 Decisión sobre sast
Decisión sobre sast (se queda / se mueve a otra etapa o evento / informativo) y razón: se queda en pre-build. Cuesta 0:23 y con él el pipeline suma 7:17, dentro del presupuesto. Su efecto en el change failure rate es nulo: los hallazgos de SAST son patrones inseguros que no hacen fallar el despliegue ni el servicio, así que sacarlo no mejoraría la métrica y solo aumentaría el riesgo de llevar código vulnerable a producción.

## Declaración de uso de IA
Herramientas usadas y para qué:
- Claude Code: Para correcion de estilos y redaccion, guia de uso de funcionamiento de algunos componentes de los jobs y generador de pr's para el defecto de concurrency (defecto 2). 
