// Default visual scale: BDT 0–500,000 in 1,000 increments. Exact decimal values
// and larger existing query values remain supported by the editable boxes.
export const SALARY_BOUND = 500000;
const API_MAX = 9999999999.99;
export function parseSalary(value) {
  const text = String(value ?? '').replaceAll(',', '').trim();
  if (!text) return null;
  return /^\d+(?:\.\d{0,2})?$/.test(text) && Number(text) <= API_MAX ? Number(text) : null;
}
export function normalizeRange(minimum, maximum, changed = 'min') {
  let min = parseSalary(minimum); let max = parseSalary(maximum);
  if (min !== null && max !== null && min > max) {
    if (changed === 'max') max = min; else min = max;
  }
  return { min, max };
}
export function createSalaryRange(root, minimum, maximum) {
  const low = root.querySelector('[data-range-min]');
  const high = root.querySelector('[data-range-max]');
  let values = { min: null, max: null };
  const format = (value) => value === null ? '' : value.toLocaleString('en-US', { maximumFractionDigits: 2 });
  function sync(changed = 'min', formatBoxes = true) {
    values = normalizeRange(minimum.value, maximum.value, changed);
    const ceiling = Math.max(SALARY_BOUND, Math.ceil(Math.max(values.min || 0, values.max || 0) / 1000) * 1000);
    low.max = high.max = String(ceiling);
    // Avoid rounding decimal URL/input values when synchronizing native handles.
    low.step = high.step = 'any';
    low.value = String(values.min ?? 0); high.value = String(values.max ?? ceiling);
    low.setAttribute('aria-valuetext', `${format(values.min ?? 0)} BDT${values.min === null ? ', no minimum' : ''}`);
    high.setAttribute('aria-valuetext', values.max === null ? 'No maximum salary' : `${format(values.max)} BDT`);
    root.style.setProperty('--range-start', `${Number(low.value) / ceiling * 100}%`);
    root.style.setProperty('--range-end', `${Number(high.value) / ceiling * 100}%`);
    root.classList.toggle('range-overlap', Number(high.value) - Number(low.value) < ceiling * 0.06);
    if (formatBoxes) { minimum.value = format(values.min); maximum.value = format(values.max); }
  }
  [minimum, maximum].forEach((input, index) => {
    input.addEventListener('input', () => {
      const parsed = parseSalary(input.value);
      input.setCustomValidity(input.value.trim() && parsed === null ? 'Enter a positive salary with up to two decimal places.' : '');
      const crossed = parseSalary(minimum.value) !== null && parseSalary(maximum.value) !== null
        && parseSalary(minimum.value) > parseSalary(maximum.value);
      sync(index ? 'max' : 'min', crossed);
    });
    input.addEventListener('change', () => {
      if (input.validity.valid) sync(index ? 'max' : 'min');
    });
  });
  [low, high].forEach((handle, index) => {
    function update(value) {
      const rounded = Math.min(Number(handle.max), Math.max(0, Math.round(value / 1000) * 1000));
      (index ? maximum : minimum).value = String(rounded);
      minimum.setCustomValidity(''); maximum.setCustomValidity('');
      sync(index ? 'max' : 'min');
    }
    handle.addEventListener('input', () => update(Number(handle.value)));
    handle.addEventListener('keydown', (event) => {
      const direction = { ArrowRight: 1, ArrowUp: 1, ArrowLeft: -1, ArrowDown: -1, PageUp: 10, PageDown: -10 }[event.key];
      if (direction) { event.preventDefault(); update(Number(handle.value) + direction * 1000); }
      if (event.key === 'Home' || event.key === 'End') {
        event.preventDefault(); update(event.key === 'Home' ? 0 : Number(handle.max));
      }
    });
  });
  sync();
  return { sync, get values() { return values; } };
}
