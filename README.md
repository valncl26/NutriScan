# NutriScan

Aplicación para analizar fotos de comidas y mostrar estimaciones de alimentos, porciones y nutrientes. Combina una interfaz React con un servicio Python y la OpenAI API. Los valores inferidos de una foto son aproximados; no son mediciones ni consejo médico.

## Requisitos

- Node.js 20.19+ (o 22.12+) y npm.
- Python 3.11 o posterior.
- Una clave de OpenAI API con facturación/API habilitada. La suscripción de ChatGPT no incluye automáticamente crédito para la API.

## Ejecutar en Windows

Clona el repositorio y abre dos terminales en su carpeta.

### Backend Python

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

En `backend/.env`, reemplaza el texto de ejemplo por tu clave privada de OpenAI. No la compartas ni la escribas en el frontend.

```powershell
python -m uvicorn main:app --reload --port 8000
```

### Aplicación web

En la segunda terminal, desde la carpeta raíz del proyecto:

```powershell
npm install
npm run dev
```

Abre la dirección local que muestra Vite, normalmente `http://localhost:5173`. Detén cada servicio con `Ctrl+C`. Para usarlo en otro computador, repite los pasos y configura una clave de API propia.

## Escáner disponible

El navegador acepta JPG, PNG y WEBP de hasta 10 MB. El backend vuelve a validar el archivo y envía la imagen a OpenAI desde el servidor, manteniendo la clave fuera del navegador. La respuesta estructurada muestra alimentos visibles, confianza, porciones y una estimación de calorías, macronutrientes, fibra, azúcar, grasa saturada y sodio. Se pueden editar los gramos y se actualizan proporcionalmente sus nutrientes.

Se necesita internet, una clave válida y saldo/límites disponibles en la cuenta de API. Sube únicamente imágenes que tengas autorización para procesar.

## Etapas del producto que faltan

- Guardar análisis, comidas y diario nutricional.
- Registro, inicio de sesión y perfil con alergias, preferencias y objetivos.
- Asociar alimentos con datos de una fuente nutricional.
- Dashboard, registro de agua, peso y seguimiento de progreso.
- Asistente, recetas, planes de comida y rutinas de entrenamiento.
- Controles de privacidad y despliegue.

El repositorio todavía no tiene base de datos ni autenticación. Se incorporarán antes de guardar datos personales.
