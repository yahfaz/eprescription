import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';

// Debounced async search box reused for patients / medications / pharmacies.
function SearchSelect({ label, placeholder, fetcher, render, onSelect, selected }) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState([]);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    if (!q || q.length < 2) { setResults([]); return; }
    const t = setTimeout(async () => {
      try { setResults(await fetcher(q)); setOpen(true); } catch { setResults([]); }
    }, 250);
    return () => clearTimeout(t);
  }, [q, fetcher]);

  return (
    <div className="field">
      <label>{label}</label>
      {selected ? (
        <div className="alert info" style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <span>{render(selected)}</span>
          <button type="button" className="secondary sm" onClick={() => onSelect(null)}>Change</button>
        </div>
      ) : (
        <>
          <input placeholder={placeholder} value={q} onChange={(e) => setQ(e.target.value)} />
          {open && results.length > 0 && (
            <div className="search-results">
              {results.map((r, i) => (
                <div key={r.id || r.rxnorm_cui || i} className="item"
                  onClick={() => { onSelect(r); setOpen(false); setQ(''); }}>
                  {render(r)}
                </div>
              ))}
            </div>
          )}
        </>
      )}
    </div>
  );
}

export default function NewPrescription() {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const [patient, setPatient] = useState(null);
  const [medication, setMedication] = useState(null);
  const [pharmacy, setPharmacy] = useState(null);
  const [form, setForm] = useState({ sig: '', quantity: '', quantityUnit: 'each', daysSupply: '', refills: 0, diagnosisCode: '', substitutionAllowed: true });
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  // Pre-select patient when coming from a patient page
  useEffect(() => {
    const pid = params.get('patientId');
    if (pid) api(`/patients/${pid}`).then((p) => setPatient(p)).catch(() => {});
  }, [params]);

  const searchPatients = useCallback(async (q) => (await api(`/patients?search=${encodeURIComponent(q)}`)).data, []);
  const searchMeds = useCallback(async (q) => (await api(`/medications/search?q=${encodeURIComponent(q)}`)).data, []);
  const searchPharmacies = useCallback(async (q) => (await api(`/pharmacies?search=${encodeURIComponent(q)}`)).data, []);

  const submit = async (e) => {
    e.preventDefault();
    setError('');
    if (!patient) return setError('Select a patient.');
    if (!medication) return setError('Select a medication.');
    setBusy(true);
    try {
      const body = {
        patientId: patient.id,
        sig: form.sig,
        quantity: Number(form.quantity),
        quantityUnit: form.quantityUnit,
        refills: Number(form.refills),
        substitutionAllowed: form.substitutionAllowed,
      };
      if (form.daysSupply) body.daysSupply = Number(form.daysSupply);
      if (form.diagnosisCode) body.diagnosisCode = form.diagnosisCode;
      if (pharmacy) body.pharmacyId = pharmacy.id;
      // Medication: local catalog id, or RxNorm cui (resolved server-side)
      if (medication.id && medication.source !== 'rxnorm') body.medicationId = medication.id;
      else body.rxnormCui = medication.rxnorm_cui;

      const rx = await api('/prescriptions', { method: 'POST', body });
      navigate(`/prescriptions/${rx.id}`);
    } catch (err) {
      setError(err.details ? err.details.map((d) => `${d.field}: ${d.message}`).join(', ') : err.message);
    } finally { setBusy(false); }
  };

  return (
    <>
      <div className="topbar"><h1>New prescription</h1></div>
      <div className="content">
        <div className="card" style={{ maxWidth: 680 }}>
          {error && <div className="alert error">{error}</div>}
          <form onSubmit={submit}>
            <SearchSelect label="Patient" placeholder="Search patients…" fetcher={searchPatients}
              selected={patient} onSelect={setPatient}
              render={(p) => `${p.last_name}, ${p.first_name} (DOB ${new Date(p.date_of_birth).toLocaleDateString()})`} />

            <SearchSelect label="Medication" placeholder="Search medications (RxNorm)…" fetcher={searchMeds}
              selected={medication} onSelect={setMedication}
              render={(m) => (
                <span>{m.name} {m.dea_schedule > 0 && <span className="badge controlled">C-{m.dea_schedule}</span>}
                  {m.source === 'rxnorm' && <span className="src"> · RxNorm</span>}</span>
              )} />

            <div className="field">
              <label>Sig (patient instructions)</label>
              <textarea rows={2} value={form.sig} onChange={set('sig')} required
                placeholder="e.g. Take 1 tablet by mouth once daily" />
            </div>
            <div className="row">
              <div className="field"><label>Quantity</label><input type="number" min="0" step="any" value={form.quantity} onChange={set('quantity')} required /></div>
              <div className="field"><label>Unit</label><input value={form.quantityUnit} onChange={set('quantityUnit')} /></div>
              <div className="field"><label>Days supply</label><input type="number" min="1" value={form.daysSupply} onChange={set('daysSupply')} /></div>
              <div className="field"><label>Refills</label><input type="number" min="0" value={form.refills} onChange={set('refills')} /></div>
            </div>
            <div className="field"><label>Diagnosis (ICD-10, optional)</label><input value={form.diagnosisCode} onChange={set('diagnosisCode')} /></div>

            <SearchSelect label="Pharmacy (optional now, required to transmit)" placeholder="Search pharmacies…"
              fetcher={searchPharmacies} selected={pharmacy} onSelect={setPharmacy}
              render={(p) => `${p.name}${p.city ? ` — ${p.city}, ${p.state}` : ''}`} />

            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 14, margin: '6px 0 16px' }}>
              <input type="checkbox" style={{ width: 'auto' }} checked={form.substitutionAllowed}
                onChange={(e) => setForm({ ...form, substitutionAllowed: e.target.checked })} />
              Generic substitution allowed
            </label>

            <button disabled={busy}>{busy ? 'Creating…' : 'Create draft & review safety'}</button>
          </form>
        </div>
      </div>
    </>
  );
}
