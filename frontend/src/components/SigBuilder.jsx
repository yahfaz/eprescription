import { useState } from 'react';

// Structured Sig builder — composes patient instructions from discrete fields,
// similar to the Sig-Builder in DoseSpot / DrFirst. Calls onApply(sigText).
const ROUTES = ['by mouth', 'sublingually', 'topically', 'subcutaneously', 'intramuscularly', 'in each eye', 'in each ear', 'by inhalation', 'rectally', 'vaginally'];
const FREQUENCIES = [
  ['once daily', 'once daily'],
  ['twice daily', 'twice daily (BID)'],
  ['three times daily', 'three times daily (TID)'],
  ['four times daily', 'four times daily (QID)'],
  ['every morning', 'every morning'],
  ['at bedtime', 'at bedtime'],
  ['every 4 hours', 'every 4 hours'],
  ['every 6 hours', 'every 6 hours'],
  ['every 8 hours', 'every 8 hours'],
  ['every 12 hours', 'every 12 hours'],
  ['weekly', 'weekly'],
];
const FORMS = ['tablet', 'capsule', 'mL', 'puff', 'drop', 'unit', 'application', 'patch'];

export default function SigBuilder({ onApply }) {
  const [open, setOpen] = useState(false);
  const [f, setF] = useState({ verb: 'Take', amount: '1', form: 'tablet', route: 'by mouth', freq: 'once daily', prn: '', duration: '' });
  const set = (k) => (e) => setF({ ...f, [k]: e.target.value });

  const compose = () => {
    const plural = Number(f.amount) === 1 ? f.form : `${f.form}s`;
    let s = `${f.verb} ${f.amount} ${plural} ${f.route} ${f.freq}`;
    if (f.prn) s += ` as needed for ${f.prn}`;
    if (f.duration) s += ` for ${f.duration}`;
    return s.replace(/\s+/g, ' ').trim();
  };

  if (!open) {
    return (
      <button type="button" className="secondary sm" onClick={() => setOpen(true)} style={{ marginBottom: 8 }}>
        🧩 Sig builder
      </button>
    );
  }

  return (
    <div className="card" style={{ padding: 12, marginBottom: 10, background: '#f8fafc' }}>
      <div className="row">
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Verb</label>
          <select value={f.verb} onChange={set('verb')}>
            {['Take', 'Apply', 'Inhale', 'Inject', 'Instill', 'Use'].map((v) => <option key={v}>{v}</option>)}
          </select>
        </div>
        <div className="field" style={{ marginBottom: 8 }}><label>Amount</label><input value={f.amount} onChange={set('amount')} /></div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Form</label>
          <select value={f.form} onChange={set('form')}>{FORMS.map((v) => <option key={v}>{v}</option>)}</select>
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Route</label>
          <select value={f.route} onChange={set('route')}>{ROUTES.map((v) => <option key={v}>{v}</option>)}</select>
        </div>
        <div className="field" style={{ marginBottom: 8 }}>
          <label>Frequency</label>
          <select value={f.freq} onChange={set('freq')}>{FREQUENCIES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}</select>
        </div>
      </div>
      <div className="row">
        <div className="field" style={{ marginBottom: 8 }}><label>PRN (as needed for)</label><input value={f.prn} onChange={set('prn')} placeholder="e.g. pain" /></div>
        <div className="field" style={{ marginBottom: 8 }}><label>Duration</label><input value={f.duration} onChange={set('duration')} placeholder="e.g. 10 days" /></div>
      </div>
      <div className="alert info" style={{ margin: '4px 0' }}>{compose()}</div>
      <div className="row">
        <button type="button" className="secondary sm" onClick={() => setOpen(false)}>Close</button>
        <button type="button" className="sm" onClick={() => { onApply(compose()); setOpen(false); }}>Use this sig</button>
      </div>
    </div>
  );
}
