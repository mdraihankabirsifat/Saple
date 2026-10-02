// Crop locally before the existing avatar endpoint sees any image bytes.
export function cropAvatar(file, dialog) {
  return new Promise((resolve, reject) => {
    const canvas = dialog.querySelector('canvas');
    const zoomInput = dialog.querySelector('#avatar-crop-zoom');
    const useButton = dialog.querySelector('#avatar-crop-use');
    const cancelButton = dialog.querySelector('#avatar-crop-cancel');
    const context = canvas.getContext('2d');
    const image = new Image();
    const objectUrl = URL.createObjectURL(file);
    const size = canvas.width;
    let zoom = 1;
    let offsetX = 0;
    let offsetY = 0;
    let pointer = null;
    let lastX = 0;
    let lastY = 0;
    let finished = false;

    function bounds() {
      const base = Math.max(size / image.naturalWidth, size / image.naturalHeight);
      const width = image.naturalWidth * base * zoom;
      const height = image.naturalHeight * base * zoom;
      offsetX = Math.max((size - width) / 2, Math.min((width - size) / 2, offsetX));
      offsetY = Math.max((size - height) / 2, Math.min((height - size) / 2, offsetY));
      return { width, height };
    }

    function paint(target, outputSize) {
      const { width, height } = bounds();
      const ratio = outputSize / size;
      target.clearRect(0, 0, outputSize, outputSize);
      target.drawImage(image,
        ((size - width) / 2 + offsetX) * ratio,
        ((size - height) / 2 + offsetY) * ratio,
        width * ratio, height * ratio);
    }

    function draw() { paint(context, size); }
    function finish(value, error) {
      if (finished) return;
      finished = true;
      URL.revokeObjectURL(objectUrl);
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      zoomInput.removeEventListener('input', onZoom);
      useButton.removeEventListener('click', onUse);
      cancelButton.removeEventListener('click', onCancel);
      dialog.removeEventListener('close', onClose);
      if (dialog.open) dialog.close();
      if (error) reject(error); else resolve(value);
    }

    function onDown(event) {
      pointer = event.pointerId;
      lastX = event.clientX;
      lastY = event.clientY;
      canvas.setPointerCapture(pointer);
    }
    function onMove(event) {
      if (event.pointerId !== pointer) return;
      const ratio = size / canvas.getBoundingClientRect().width;
      offsetX += (event.clientX - lastX) * ratio;
      offsetY += (event.clientY - lastY) * ratio;
      lastX = event.clientX;
      lastY = event.clientY;
      draw();
    }
    function onUp(event) { if (event.pointerId === pointer) pointer = null; }
    function onZoom() { zoom = Number(zoomInput.value); draw(); }
    function onCancel() { finish(null); }
    function onClose() { finish(null); }
    async function onUse() {
      useButton.disabled = true;
      try {
        const output = document.createElement('canvas');
        output.width = output.height = 512;
        const outputContext = output.getContext('2d');
        paint(outputContext, 512);
        const blob = await new Promise((done) => output.toBlob(done, 'image/webp', 0.86));
        if (!blob) throw new Error('The cropped image could not be saved.');
        finish(new File([blob], 'avatar.webp', { type: 'image/webp' }));
      } catch (error) { finish(null, error); }
      finally { useButton.disabled = false; }
    }

    image.onload = () => {
      if (!image.naturalWidth || !image.naturalHeight) {
        finish(null, new Error('The selected image could not be read.'));
        return;
      }
      zoomInput.value = '1';
      canvas.addEventListener('pointerdown', onDown);
      canvas.addEventListener('pointermove', onMove);
      canvas.addEventListener('pointerup', onUp);
      canvas.addEventListener('pointercancel', onUp);
      zoomInput.addEventListener('input', onZoom);
      useButton.addEventListener('click', onUse);
      cancelButton.addEventListener('click', onCancel);
      dialog.addEventListener('close', onClose);
      draw();
      dialog.showModal();
      zoomInput.focus();
    };
    image.onerror = () => finish(null, new Error('The selected image could not be read.'));
    image.src = objectUrl;
  });
}
