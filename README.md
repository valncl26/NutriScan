# NutriScan

Aplicación local de nutrición con escáner de fotos, cuentas, perfil, diario, búsqueda de alimentos y asistente para preguntas, recetas y ejemplos de planes.

## Qué incluye este avance

- **Etapa 1 — Guardado:** almacena análisis, conversaciones, perfil y comidas del diario en PostgreSQL alojado en Supabase. Las fotos no se guardan.
- **Etapa 2 — Cuenta y perfil:** registro e inicio de sesión con contraseña cifrada; cada cuenta ve únicamente sus propios datos. El perfil admite objetivos, preferencias, alergias e intolerancias.
- **Etapa 3 — Datos nutricionales:** consulta FoodData Central del USDA, guarda coincidencias en caché y calcula nutrientes desde valores por 100 g. Si no encuentra un alimento, el escáner usa los valores visuales de la IA y los marca como estimación.
- **Etapa 5 — Asistente:** conserva el historial de preguntas y puede responder consultas, proponer recetas y ejemplos de planes diarios con el perfil y las comidas recientes como contexto.

La base de Supabase es compartida por las instalaciones que usen la misma configuración. El diario guarda entradas y permite eliminarlas; aún no incluye calendario ni gráficas. Tampoco se han añadido restablecimiento de contraseña, acceso con Google, favoritos, recordatorios ni rutinas de entrenamiento.

## Requisitos

- Node.js 20.19+ (o 22.12+) y npm.
- Python 3.11 o posterior.
- Una clave de OpenAI API con facturación API habilitada.
- Un proyecto de Supabase y su contraseña de PostgreSQL.

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

En Supabase crea un proyecto. En el panel abre **Connect**, selecciona **Session pooler** y copia la URL de conexión. Para una instalación local que se conecta desde una red IPv4, Supabase recomienda usar el Session pooler. Sustituye la contraseña de ejemplo por la contraseña de PostgreSQL de tu proyecto. Si contiene caracteres especiales, codifícalos para URL. Conserva `sslmode=require` para cifrar la conexión. Consulta la [guía oficial de conexiones de Supabase](https://supabase.com/docs/guides/database/connecting-to-postgres).

Abre `backend/.env` y configura `DATABASE_URL` con la URL copiada. Debe conservar el puerto `5432` y `sslmode=require`. Configura `OPENAI_API_KEY` con tu clave API, creada en la [plataforma de API de OpenAI](https://platform.openai.com/api-keys). No es la contraseña de ChatGPT.

Generen `NUTRISCAN_SECRET_KEY` una sola vez desde la carpeta `backend` con `python -c "import secrets; print(secrets.token_hex(32))"` y configuren el mismo resultado en los `.env` privados del equipo. Así los tokens de sesión funcionan al usar cualquiera de sus backends. Es una clave distinta de la contraseña de Supabase y de la clave API de OpenAI. No peguen ninguna clave en el chat, no las escriban en React y no suban `backend/.env` a GitHub. La URL de PostgreSQL permite acceder a la base; compártanla solo con quienes ejecutarán el backend y por un canal privado.

Al iniciar FastAPI por primera vez, SQLAlchemy crea las tablas que faltan y el backend activa Row Level Security en las tablas de Supabase. `DATABASE_URL` es obligatorio; si falta, el servidor se detiene en vez de volver silenciosamente a SQLite. El navegador no se conecta directamente a Supabase; únicamente el backend Python usa `DATABASE_URL`. NutriScan conserva sus propias cuentas y tokens, así que no requiere configurar Supabase Auth.

Si tienes datos en `backend/nutriscan.db`, puedes copiarlos a un proyecto Supabase vacío. Después de configurar `.env` e instalar las dependencias, ejecuta desde `backend`:

```powershell
python migrate_sqlite_to_supabase.py
```

El script copia cuentas y registros, pero no fotos ni borra el archivo SQLite. No lo ejecutes si el proyecto de Supabase ya tiene datos. Si no necesitas conservar lo anterior, omite la migración.

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

Abre la dirección que muestra Vite, normalmente `http://localhost:5173`. Para apagar cada servicio, usa `Ctrl+C` en su terminal. En otro computador, cada integrante configura en `backend/.env` la misma conexión de Supabase y su propia clave API de OpenAI. Las cuentas y registros se comparten a través de la base alojada.

## ¿Qué hace cada comando?

### Backend Python

- `cd backend`: entra a la carpeta del servidor.
- `py -3 -m venv .venv`: crea un entorno aislado para los paquetes Python.
- `.\.venv\Scripts\Activate.ps1`: activa ese entorno en PowerShell.
- `python -m pip install -r requirements.txt`: instala FastAPI, OpenAI, SQLAlchemy, Psycopg y otras dependencias listadas en `requirements.txt`.
- `Copy-Item .env.example .env`: crea tu archivo local de configuración y secretos.
- `notepad .env`: abre ese archivo para que añadas tu clave privada.
- `python -m uvicorn main:app --reload --port 8000`: ejecuta el backend local en el puerto 8000; `--reload` lo reinicia al editar Python.

### Aplicación web

- `npm install`: instala las dependencias de JavaScript del proyecto.
- `npm run dev`: inicia Vite para ver y usar la web durante el desarrollo.

La página llama al backend mediante `/api`; Vite reenvía esas solicitudes al puerto 8000. FastAPI usa SQLAlchemy y Psycopg para conectarse a PostgreSQL. La cadena de conexión nunca se expone al navegador.

## Privacidad y límites

Las contraseñas se guardan como hashes y las sesiones duran siete días. Perfil, análisis, chat, diario y caché de alimentos quedan en PostgreSQL de Supabase y se comparten entre instalaciones con el mismo proyecto. La conexión requiere SSL. Row Level Security está habilitado y no hay políticas que den acceso a los roles públicos de la API; React no se conecta a Supabase. FastAPI usa la URL privada del backend y verifica el usuario en sus consultas. La contraseña de PostgreSQL y la clave JWT permanecen en `backend/.env`, excluido de Git. Si se cambia la clave JWT, las sesiones actuales dejan de ser válidas y las personas deberán iniciar sesión de nuevo.

La foto se envía desde el backend a OpenAI para analizarla. El asistente también envía a OpenAI tu pregunta, los datos del perfil y comidas recientes para contextualizar la respuesta. No guardamos la foto, pero sí el resultado del análisis y el historial del chat. Estos flujos requieren una cuenta API activa y conexión a internet.

Las porciones y nutrientes son orientativos, no mediciones clínicas. Los registros USDA representan alimentos genéricos y podrían no coincidir con la receta, marca, aceite o preparación de tu plato. NutriScan no sustituye el consejo profesional.

Esta entrega está preparada para desarrollo local con una base alojada. Supabase no elimina la necesidad de proteger los secretos ni de restringir quién conoce la URL de PostgreSQL. Antes de publicar el backend en internet hacen falta HTTPS, limitación de intentos, recuperación de cuenta, copias de seguridad y una revisión de privacidad y seguridad.
