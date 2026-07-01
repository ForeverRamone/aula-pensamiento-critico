# Del ChatGPT al pensamiento crítico — espacio del curso

Web colaborativa para el grupo del curso: entrar con cuenta propia, compartir los
**materiales del curso** y un **muro** para prompts, ideas, recursos y preguntas.

Está pensada para funcionar como **un único contenedor Docker** en un Synology (DSM).
No necesita base de datos externa ni compilar nada: usa el SQLite integrado en Node.

---

## Qué hace

- **Cuentas individuales.** Cada participante entra con su email y contraseña.
  El registro pide un **código de invitación** que tú repartes, para que no entre
  cualquiera. Tu email queda como **administrador** (puedes borrar cualquier cosa).
- **Materiales del curso.** Solo el administrador los publica; el resto los ve.
  Se organizan **por sesión** (Sesión 1 a 5, más una sección "General") y, dentro
  de cada sesión, en **material del curso** y **material adicional**. Cada uno
  puede llevar título, descripción, un enlace y/o un archivo (hasta 25 MB).
  - **PDF**: se ve incrustado en la web *y* se puede descargar.
  - **PPTX / PPT**: el servidor los convierte en diapositivas (con LibreOffice) y
    se **consultan dentro de la web, sin descarga** del archivo original.
  - La primera conversión de una presentación puede tardar unos segundos (es
    cuando LibreOffice arranca por primera vez).
  - **Enlace de Google Slides/Drive**: si en vez de un archivo se pega un enlace
    de Google Slides, Docs o Drive, se muestra un **visor incrustado en modo
    lector** dentro de la web. (El documento debe estar compartido como "cualquiera
    con el enlace puede ver"; si es privado, Google pedirá permiso.)
- **Actividad rediseñada.** La actividad final del curso. Cada participante
  construye su entrega en cinco apartados —la actividad original, cómo la "hackea"
  la IA, el rediseño, cómo se evalúa, y qué hace la IA tras el rediseño— con textos
  y adjuntos (archivos o enlaces). Todos pueden ver las entregas del grupo.
- **Muro compartido.** Publicaciones firmadas, clasificadas como Prompt / Idea /
  Recurso / Pregunta, con filtro por tipo y **comentarios** debajo de cada una.
- **Participantes.** Listado del grupo con una breve presentación que cada
  persona edita por su cuenta.

> El número de sesiones (5 por defecto) se puede cambiar con la variable
> `NUM_SESSIONS`.

Todo se guarda en el volumen `aula-data` (base de datos + archivos subidos).

---

## Desplegar desde GitHub

El repositorio es: **https://github.com/ForeverRamone/aula-pensamiento-critico**

Antes de nada, ten a mano tres valores que vas a definir tú:

| Variable         | Qué poner                                              |
|------------------|--------------------------------------------------------|
| `INVITE_CODE`    | El código que repartirás a los participantes.          |
| `ADMIN_EMAIL`    | Tu email (quedará como administrador al registrarte).  |
| `SESSION_SECRET` | Una frase larga e inventada (cuanto más rara, mejor).  |

**La imagen se construye sola.** Cada vez que se publica un cambio, GitHub Actions
construye la imagen y la sube a `ghcr.io/foreverramone/aula-pensamiento-critico`.
El Synology **solo la descarga**, no construye nada.

> **Paso único la primera vez:** la imagen publicada nace privada. Hazla pública
> una sola vez: en GitHub → tu perfil → **Packages** → `aula-pensamiento-critico`
> → **Package settings** → **Change visibility** → **Public**. Así el NAS puede
> descargarla sin credenciales.

### Opción A · Portainer (Stack desde el repositorio)

1. **Stacks → Add stack**.
2. Nombre: `aula`. Build method: **Repository**.
3. Repository URL: `https://github.com/ForeverRamone/aula-pensamiento-critico`
4. Repository reference: `refs/heads/main` · Compose path: `docker-compose.yml`
5. En **Environment variables**, añade `INVITE_CODE`, `ADMIN_EMAIL` y
   `SESSION_SECRET` (y `HOST_PORT` si quieres otro puerto que el 8080).
6. **Deploy the stack**. Portainer descarga la imagen y arranca el contenedor (rápido).

**Para actualizar a una versión nueva:** abre el stack → **Pull and redeploy**.
Descarga la última imagen y reinicia. Segundos, sin construir nada.

### Opción B · Synology DSM (Container Manager)

1. Descarga el `docker-compose.yml` del repo.
2. **Container Manager → Proyecto → Crear**, apúntalo a ese `docker-compose.yml`.
3. Define las variables (`INVITE_CODE`, `ADMIN_EMAIL`, `SESSION_SECRET`) en el
   paso de entorno, o en un archivo `.env` junto al compose.
4. Arranca el proyecto.

### Después de desplegar (ambos casos)

- Abre `http://IP-DEL-SYNOLOGY:8080`.
- Regístrate **tú primero** en `/register` con el email de `ADMIN_EMAIL`: quedarás
  como administrador. Reparte el `INVITE_CODE` al grupo.

> **Copia de seguridad:** los datos viven en el volumen `aula-data`. Para
> respaldarlos: `docker run --rm -v aula-data:/data -v $(pwd):/backup alpine tar czf /backup/aula-backup.tar.gz -C /data .`

> **Acceso con `https://` desde fuera:** se hace con el **proxy inverso** de DSM y
> un certificado. Te lo monto cuando lleguemos a ese paso.

---

## Probarla en tu ordenador (opcional)

Con Node 22+ instalado:

```bash
npm install
npm start
# abre http://localhost:3000
```

(El `docker-compose.yml` usa la imagen ya publicada en GHCR, así que en el NAS no
se construye nada. Para construir la imagen a mano en local: `docker build -t aula .`)

---

## Variables de configuración

| Variable         | Para qué sirve                                         |
|------------------|--------------------------------------------------------|
| `SITE_NAME`      | Nombre que se muestra en la web.                       |
| `INVITE_CODE`    | Código necesario para registrarse.                    |
| `ADMIN_EMAIL`    | Ese email queda como administrador al registrarse.    |
| `SESSION_SECRET` | Clave interna para firmar las sesiones. Cámbiala.     |
| `PORT`           | Puerto interno (por defecto 3000).                    |
| `DATA_DIR`       | Carpeta de datos (por defecto `/data` en Docker).     |
