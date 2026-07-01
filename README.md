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

Todo se guarda en la carpeta `data/` (base de datos + archivos). Haz copia de esa
carpeta y tendrás una copia de seguridad completa.

---

## Ponerla en marcha en el Synology (Container Manager)

1. Copia esta carpeta al Synology (por ejemplo a `/volume1/docker/aula`).
2. Abre **Container Manager → Proyecto → Crear**, elige esta carpeta y su
   `docker-compose.yml`.
3. Antes de arrancar, edita en `docker-compose.yml`:
   - `INVITE_CODE`: el código que darás a los participantes.
   - `SESSION_SECRET`: cámbialo por una frase larga e inventada.
   - El puerto `8080` de la izquierda si ya lo usas para otra cosa.
4. Arranca el proyecto. La web quedará en `http://IP-DEL-SYNOLOGY:8080`.
5. Entra tú primero en `/register` con **tu** email (el de `ADMIN_EMAIL`) para
   quedar como administrador, y reparte el código de invitación al grupo.

> Para acceder desde fuera de casa y con `https://`, lo habitual es publicarla con
> el **proxy inverso** de DSM y un certificado. Te lo monto cuando lleguemos a ese paso.

---

## Probarla en tu ordenador (opcional)

Con Node 22+ instalado:

```bash
npm install
npm start
# abre http://localhost:3000
```

O con Docker:

```bash
docker compose up --build
# abre http://localhost:8080
```

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
