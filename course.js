// Datos del curso (de la ficha oficial). Editables aquí en un único sitio.
module.exports = {
  name: 'De ChatGPT al pensamiento crítico',
  subtitle: 'Cómo convivir con la inteligencia artificial en el aula',
  coordinator: 'Ramón Montes Rodríguez',
  center: 'Facultad de Ciencias de la Educación · Universidad de Granada',
  line: 'Línea 3 · Tecnología aplicada a la innovación educativa · Nivel 2 (Desarrollo)',
  dates: 'Del 1 al 7 de julio de 2026',
  place: 'Facultad de Ciencias de la Educación (UGR)',
  hours: '30 h · 20 presenciales + 10 no presenciales',
  seats: 25,
  // Fecha límite de entrega de la actividad final (AAAA-MM-DD).
  deadline: '2026-07-10',
  certification: [
    'Asistencia al 80 % de las horas presenciales',
    'Elaboración de una actividad docente “IA-consciente” aplicable a una asignatura propia',
  ],
  // Las sesiones se corresponden con las "Sesión 1–5" de Materiales.
  sessions: [
    {
      n: 1, date: '2026-07-01', time: '09:30–13:30',
      title: 'Qué es y qué falla: fundamentos y límites de la IA generativa',
      blocks: [
        'Funcionamiento, posibilidades y límites de los modelos de lenguaje',
        'Riesgos: alucinaciones, sesgos, opacidad, dependencia, plagio e info-basura',
      ],
    },
    {
      n: 2, date: '2026-07-02', time: '09:30–13:30',
      title: 'IA en docencia: usos legítimos, problemáticos y rediseño de tareas',
      blocks: [
        'Usos pedagógicos legítimos frente a los que sustituyen el aprendizaje',
        'Estrategias de rediseño de actividades (semilla del producto final)',
      ],
    },
    {
      n: 3, date: '2026-07-03', time: '09:30–13:30',
      title: 'Diseño y evaluación “IA-conscientes”',
      blocks: [
        'Diseño de tareas: instrucciones de uso, fases y documentación del proceso',
        'Evaluación: rúbricas, autoría, declaraciones de uso y defensas',
        'Pensamiento crítico: contraste de fuentes y verificación de citas',
      ],
    },
    {
      n: 4, date: '2026-07-06', time: '09:30–13:30',
      title: 'Cultura digital, sesgos y economía de la atención',
      blocks: [
        'Sesgos algorítmicos y cultura digital',
        'Economía de la atención: distracción, multitarea y lectura profunda',
        'Higiene digital en el aula: momentos con y sin IA',
      ],
    },
    {
      n: 5, date: '2026-07-07', time: '09:30–13:30',
      title: 'Ética, instituciones y diseño final',
      blocks: [
        'Ética: privacidad, equidad, propiedad intelectual y dependencia de plataformas',
        'Diseño final de la actividad docente “IA-consciente” y puesta en común',
      ],
    },
  ],
};
