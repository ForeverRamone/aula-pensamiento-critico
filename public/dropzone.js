// Zona de arrastrar-y-soltar para volcar varios archivos a la vez. Vuelca los
// archivos soltados en el <input type="file" multiple> del formulario y muestra
// la lista de nombres. Sin dependencias.
(function () {
  document.querySelectorAll('.dropzone').forEach(function (dz) {
    var input = dz.querySelector('input[type=file]');
    var list = dz.querySelector('.dz-list');
    if (!input || !list) return;

    function render() {
      list.innerHTML = '';
      Array.prototype.forEach.call(input.files, function (f) {
        var li = document.createElement('li');
        li.textContent = f.name;
        list.appendChild(li);
      });
      dz.classList.toggle('has-files', input.files.length > 0);
    }

    // Clic en la zona (menos en la propia lista) abre el selector de archivos.
    dz.addEventListener('click', function (e) {
      if (e.target.tagName !== 'LI') input.click();
    });
    input.addEventListener('change', render);

    ['dragenter', 'dragover'].forEach(function (ev) {
      dz.addEventListener(ev, function (e) { e.preventDefault(); dz.classList.add('drag'); });
    });
    ['dragleave', 'dragend'].forEach(function (ev) {
      dz.addEventListener(ev, function () { dz.classList.remove('drag'); });
    });
    dz.addEventListener('drop', function (e) {
      e.preventDefault();
      dz.classList.remove('drag');
      var dt = new DataTransfer();
      Array.prototype.forEach.call(e.dataTransfer.files, function (f) { dt.items.add(f); });
      input.files = dt.files;
      render();
    });
  });
})();
