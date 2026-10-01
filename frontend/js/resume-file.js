import { API_BASE_URL } from './api.js';
import { getToken } from './auth.js';
import { el } from './ui.js';

// Private application resumes.
//
// A resume is served only by Saple's authorised endpoints, which need the
// signed-in token, so it cannot be a plain link. This fetches it with the
// token and then opens it (View) or saves it (Download) from an in-memory
// blob. Nothing is cached or stored in the browser.

export function formatFileSize(bytes) {
  const value = Number(bytes) || 0;
  return value >= 1024 * 1024 ? `${(value / 1024 / 1024).toFixed(1)} MB` : `${Math.max(1, Math.round(value / 1024))} KB`;
}

export async function openResume(path, { download = false, fileName = 'resume.pdf' } = {}) {
  // Open the tab synchronously, inside the click, so it is not blocked.
  const tab = download ? null : window.open('', '_blank');
  try {
    const token = getToken();
    const response = await fetch(`${API_BASE_URL}${path}?disposition=${download ? 'attachment' : 'inline'}`, {
      headers: { Authorization: `Bearer ${token}` },
      cache: 'no-store'
    });
    if (!response.ok || response.headers.get('content-type') !== 'application/pdf') {
      const body = await response.json().catch(() => null);
      throw new Error(body?.message || 'The resume could not be opened.');
    }
    const url = URL.createObjectURL(await response.blob());
    if (download) {
      const link = el('a', { attrs: { href: url, download: fileName } });
      document.body.append(link);
      link.click();
      link.remove();
    } else if (tab) {
      tab.location.href = url;
    }
    window.setTimeout(() => URL.revokeObjectURL(url), 60000);
  } catch (error) {
    tab?.close();
    throw error;
  }
}

// "Resume · name · size" with View and Download, or "Not attached".
export function resumeSection(application, path, onError) {
  if (!application.resumeAttached) {
    return el('div', { className: 'application-resume' }, [
      el('span', { className: 'application-resume-label', text: 'Resume' }),
      el('span', { className: 'application-resume-meta', text: 'Not attached' })
    ]);
  }
  const action = (label, download) => {
    const button = el('button', { className: 'button button-secondary button-small', text: label, attrs: { type: 'button' } });
    button.addEventListener('click', () => {
      openResume(path, { download, fileName: application.resumeFileName || 'resume.pdf' }).catch(onError);
    });
    return button;
  };
  return el('div', { className: 'application-resume' }, [
    el('span', { className: 'application-resume-label', text: 'Resume' }),
    el('span', { className: 'application-resume-meta', text: `${application.resumeFileName} · ${formatFileSize(application.resumeFileSizeBytes)}` }),
    el('span', { className: 'application-resume-actions' }, [action('View resume', false), action('Download resume', true)])
  ]);
}
