# Calculadora de Tiempo Invertido

Calculadora web (HTML/CSS/JS, sin dependencias) para estimar cuánto le cuesta a una compañía un proceso ejecutado por una o varias personas, bajo legislación colombiana, y compararlo contra el costo de una solución/automatización.

## Qué hace

- Calcula el costo real para la empresa de cada persona involucrada (salario + factor prestacional).
- Convierte las horas dedicadas al proceso en costo mensual y anual.
- Proyecta la inversión acumulada en el tiempo (1 a 5 años), con incremento salarial anual configurable.
- Compara la inversión acumulada del proceso contra la inversión en una solución con tiempo de implementación configurable.
- Genera KPIs de ahorro, retorno de inversión (payback) y un reporte en PDF (usando la impresión del navegador).

## Uso local

Abre `index.html` directamente en el navegador, o sirve la carpeta con cualquier servidor estático:

```bash
npx serve .
```

## Parámetros configurables (⚙️)

- Factor prestacional (salario → costo empresa)
- Horas laborales semanales legales
- Incremento salarial anual presupuestado
- Días laborales por mes
