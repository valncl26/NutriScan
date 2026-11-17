# NutriScan

Aplicación local de nutrición con escáner de fotos, cuentas, perfil, diario, búsqueda de alimentos y asistente para preguntas, recetas y ejemplos de planes.

## Qué incluye este avance

- **Etapa 1 — Guardado:** almacena análisis, conversaciones, perfil y comidas del diario en una base SQLite local (`backend/nutriscan.db`). Las fotos no se guardan.
- **Etapa 2 — Cuenta y perfil:** registro e inicio de sesión con contraseña cifrada; cada cuenta ve únicamente sus propios datos. El perfil admite objetivos, preferencias, alergias e intolerancias.
- **Etapa 3 — Datos nutricionales:** consulta FoodData Central del USDA, guarda coincidencias en caché y calcula nutrientes desde valores por 100 g. Si no encuentra un alimento, el escáner usa los valores visuales de la IA y los marca como estimación.
- **Etapa 5 — Asistente:** conserva el historial de preguntas y puede responder consultas, proponer recetas y ejemplos de planes diarios con el perfil y las comidas recientes como contexto.

La base SQLite pertenece al computador donde se ejecuta. No hay sincronización entre computadores. El diario actual guarda entradas y permite eliminarlas; aún no incluye calendario ni gráficas. Tampoco se han añadido restablecimiento de contraseña, acceso con Google, favoritos, recordatorios ni rutinas de entrenamiento.

## Requisitos

- Node.js 20.19+ (o 22.12+) y npm.
- Python 3.11 o posterior.
- Una clave de OpenAI API con facturación API habilitada.

La facturación de ChatGPT y la de la API son independientes. Una suscripción a ChatGPT Plus o Pro no proporciona automáticamente crédito de API. Consulta la [facturación oficial de ChatGPT y API](https://help.openai.com/en/articles/9039756-managing-billing-for-chatgpt-and-the-api-platform). La API cobra según el modelo, las imágenes y los tokens usados.

## Configuración en Windows

Clona el repositorio. Abre una terminal en su carpeta y configura el backend:

```powershell
cd backend
py -3 -m venv .venv
.\.venv\Scripts\Activate.ps1
python -m pip install -r requirements.txt
Copy-Item .env.example .env
notepad .env
```

En `backend/.env`, coloca la clave de API en `OPENAI_API_KEY`. La clave se crea en la [plataforma de API de OpenAI](https://platform.openai.com/api-keys), con la sesión y facturación de API configuradas. No es la contraseña de ChatGPT. No la pegues en el chat, no la escribas en React y no subas `backend/.env` a GitHub.

`FDC_API_KEY=DEMO_KEY` permite empezar a consultar USDA sin crear otra clave, pero la clave de demostración tiene límites de uso. Para usar NutriScan con frecuencia, puedes obtener una clave gratuita de USDA siguiendo la [guía de FoodData Central](https://fdc.nal.usda.gov/api-guide/) y reemplazar ese valor. La app puede seguir mostrando estimaciones de IA cuando USDA no esté disponible.

Inicia el servicio Python, dejando esa terminal abierta:

```powershell
python -m uvicorn main:app --reload --port 8000
```

Abre una segunda terminal en la carpeta raíz del proyecto (donde están `package.json`) e inicia la aplicación web:

```powershell
npm install
npm run dev
```

Abre la dirección que muestra Vite, normalmente `http://localhost:5173`. Para apagar cada servicio, usa `Ctrl+C` en su terminal. En un computador nuevo se repiten estos pasos, se configura una clave de API propia y se crea una cuenta local nueva. La base de datos no se copia al repositorio.

## ¿Qué hace cada comando?

### Backend Python

- `cd backend`: entra a la carpeta del servidor.
- `py -3 -m venv .venv`: crea un entorno aislado para los paquetes Python.
- `.\.venv\Scripts\Activate.ps1`: activa ese entorno en PowerShell.
- `python -m pip install -r requirements.txt`: instala FastAPI, OpenAI, SQLAlchemy y otras dependencias listadas en `requirements.txt`.
- `Copy-Item .env.example .env`: crea tu archivo local de configuración y secretos.
- `notepad .env`: abre ese archivo para que añadas tu clave privada.
- `python -m uvicorn main:app --reload --port 8000`: ejecuta el backend local en el puerto 8000; `--reload` lo reinicia al editar Python.

### Aplicación web

- `npm install`: instala las dependencias de JavaScript del proyecto.
- `npm run dev`: inicia Vite para ver y usar la web durante el desarrollo.

La página llama al backend mediante `/api`; Vite reenvía esas solicitudes al puerto 8000.

## Privacidad y límites

Las contraseñas se guardan como hashes y las sesiones duran siete días. Los datos de perfil, análisis, chat y diario quedan en `backend/nutriscan.db`, en texto legible para quien tenga acceso al archivo del computador. La clave JWT local se genera en `backend/local_secret.key`; ambos archivos están excluidos de Git.

La foto se envía desde el backend a OpenAI para analizarla. El asistente también envía a OpenAI tu pregunta, los datos del perfil y comidas recientes para contextualizar la respuesta. No guardamos la foto, pero sí el resultado del análisis y el historial del chat. Estos flujos requieren una cuenta API activa y conexión a internet.

Las porciones y nutrientes son orientativos, no mediciones clínicas. Los registros USDA representan alimentos genéricos y podrían no coincidir con la receta, marca, aceite o preparación de tu plato. NutriScan no sustituye el consejo profesional.

Esta entrega es para desarrollo local. Antes de publicarla en internet se necesitan HTTPS, limitación de intentos, recuperación de cuenta, gestión segura de secretos, copias de seguridad y una revisión de privacidad y seguridad.
