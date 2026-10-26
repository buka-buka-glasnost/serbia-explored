import { useEffect, useRef, useState } from 'react';
import { useApp } from '../state/store';
import { t } from '../i18n/i18n';
import { getPhoto } from '../storage/db';
import { MAX_PHOTOS_PER_VISIT } from '../storage/photos';

const NOTE_DEBOUNCE_MS = 800;

function Thumb({ photoId, label, onRemove }: { photoId: string; label: string; onRemove: () => void }) {
  const [src, setSrc] = useState<string | null>(null);
  useEffect(() => {
    let url: string | null = null;
    let cancelled = false;
    getPhoto(photoId)
      .then((p) => {
        if (cancelled || !p || typeof URL.createObjectURL !== 'function') return;
        url = URL.createObjectURL(p.blob);
        setSrc(url);
      })
      .catch(() => undefined);
    return () => {
      cancelled = true;
      if (url) URL.revokeObjectURL(url);
    };
  }, [photoId]);
  return (
    <li className="thumb">
      {src ? <img src={src} alt="" /> : <span className="thumb-placeholder" />}
      <button type="button" aria-label={label} onClick={onRemove}>×</button>
    </li>
  );
}

export function VisitEditor({ placeId }: { placeId: string }) {
  const lang = useApp((s) => s.settings.lang);
  const visit = useApp((s) => s.visits[placeId]);
  const updateVisit = useApp((s) => s.updateVisit);
  const [note, setNote] = useState(visit?.note ?? '');
  const savedNote = useRef(visit?.note ?? '');
  const noteRef = useRef(note);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const flush = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    if (noteRef.current === savedNote.current) return;
    savedNote.current = noteRef.current;
    void updateVisit(placeId, { note: noteRef.current });
  };
  const flushRef = useRef(flush);
  flushRef.current = flush;
  useEffect(() => () => flushRef.current(), []);

  if (!visit) return null;

  const onNoteChange = (value: string) => {
    setNote(value);
    noteRef.current = value;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(flush, NOTE_DEBOUNCE_MS);
  };

  const onFiles = async (files: FileList | null, input: HTMLInputElement) => {
    const list = files ? Array.from(files) : [];
    input.value = '';
    const { addPhoto, showToast } = useApp.getState();
    for (const file of list) {
      const count = useApp.getState().visits[placeId]?.photoIds.length ?? 0;
      if (count >= MAX_PHOTOS_PER_VISIT) {
        showToast('tooManyPhotos', 'info');
        return;
      }
      try {
        await addPhoto(placeId, file);
      } catch {
        showToast('storageError', 'error');
        return;
      }
    }
  };

  const onUnmark = () => {
    const hasContent = note.trim() !== '' || visit.note.trim() !== '' || visit.photoIds.length > 0;
    if (hasContent && !window.confirm(t('unmarkConfirm', lang))) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
    noteRef.current = savedNote.current; // do not re-save a note for a removed visit
    void useApp.getState().unmarkVisited(placeId);
  };

  return (
    <section className="visit-editor">
      <label>
        {t('visitDate', lang)}
        <input
          type="date"
          value={visit.date}
          onChange={(e) => e.target.value && void updateVisit(placeId, { date: e.target.value })}
        />
      </label>
      <label>
        {t('visitNote', lang)}
        <textarea value={note} rows={3} onChange={(e) => onNoteChange(e.target.value)} onBlur={flush} />
      </label>
      {visit.photoIds.length > 0 && (
        <ul className="thumbs">
          {visit.photoIds.map((id) => (
            <Thumb
              key={id}
              photoId={id}
              label={t('removePhoto', lang)}
              onRemove={() => void useApp.getState().removePhoto(placeId, id)}
            />
          ))}
        </ul>
      )}
      <label className="add-photo">
        {t('addPhoto', lang)}
        <input
          type="file"
          accept="image/*"
          multiple
          onChange={(e) => void onFiles(e.target.files, e.target)}
        />
      </label>
      <button type="button" onClick={onUnmark}>{t('unmarkVisited', lang)}</button>
    </section>
  );
}
