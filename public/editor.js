// Editor de texto enriquecido mínimo, sin dependencias. Convierte cada bloque
// .rte en un área editable con barra de herramientas (negrita, subrayado,
// cursiva, listas) y vuelca su contenido HTML en un input oculto al enviar.
(function () {
  // Genera etiquetas (<b>, <u>…) en lugar de estilos, para un HTML más limpio.
  try { document.execCommand('styleWithCSS', false, false); } catch (e) {}

  document.querySelectorAll('.rte').forEach(function (rte) {
    var area = rte.querySelector('.rte-area');
    var input = rte.querySelector('input[type=hidden]');
    var form = rte.closest('form');

    function sync() {
      var html = area.innerHTML.trim();
      if (html === '<br>' || html === '<div><br></div>') html = '';
      input.value = html;
    }
    sync();

    rte.querySelectorAll('.rte-toolbar button').forEach(function (btn) {
      // mousedown en vez de click para no perder la selección del texto.
      btn.addEventListener('mousedown', function (e) {
        e.preventDefault();
        area.focus();
        document.execCommand(btn.dataset.cmd, false, null);
        sync();
      });
    });

    area.addEventListener('input', sync);
    area.addEventListener('blur', sync);
    if (form) form.addEventListener('submit', sync);
  });
})();
