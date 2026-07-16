import { useEffect, useState, useCallback } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { api } from '../api/client.js';
import SigBuilder from '../components/SigBuilder.jsx';

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
  const [favorites, setFavorites] = useState([]);
  const [benefit, setBenefit] = useState(null);
  const [benefitBusy, setBenefitBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const set = (k) => (e) => setForm({ ...form, [k]: e.target.value });

  useEffect(() => {
    const pid = params.get('patientId');
    if (pid) api(`/patients/${pid}`).then((p) => setPatient(p)).catch(() => {});
  }, [params]);

  const loadFavorites = useCallback(() => api('/favorites').then((r) => setFavorites(r.data)).catch(() => {}), []);
  useEffect(() => { loadFavorites(); }, [loadFavorites]);

  const searchPatients = useCallback(async (q) => (await api(`/patients?search=${encodeURIComponent(q)}`)).data, []);
  const searchMeds = useCallback(async (q) => (await api(`/medications/search?q=${encodeURIComponent(q)}`)).data, []);
  const searchPharmacies = useCallback(async (q) => (await api(`/pharmacies?search=${encodeURIComponent(q)}`)).data, []);

  // Real-Time Prescription Benefit — auto-check when a catalog medication is chosen
  const runBenefit = useCallback(async (med, daysSupply) => {
    if (!med) { setBenefit(null); return; }
    setBenefitBusy(true);
    try {
      const body = { daysSupply: daysSupply ? Number(daysSupply) : undefined };
      if (med.id && med.source !== 'rxnorm') body.medicationId = med.id;
      else body.rxnormCui = med.rxnorm_cui;
      setBenefit(await api('/prescriptions/benefit-check', { method: 'POST', body }));
    } catch { setBenefit(null); } finally { setBenefitBusy(false); }
  }, []);

  useEffect(() => { runBenefit(medication, form.daysSupply); /* eslint-disable-next-line */ }, [medication]);

  const applyFavorite = (fav) => {
    setMedication({ id: fav.medication_id, name: fav.drug_name, rxnorm_cui: fav.rxnorm_cui, dea_schedule: 0, source: 'local' });
    setForm((prev) => ({
      ...prev,
      sig: fav.sig || prev.sig,
      quantity: fav.quantity ?? prev.quantity,
      quantityUnit: fav.quantity_unit || prev.quantityUnit,
      daysSupply: fav.days_supply ?? prev.daysSupply,
      refills: fav.refills ?? prev.refills,
    }));
  };

  const saveFavorite = async () => {
    if (!medication) return setError('Select a medication first to save a favorite.');
    setError('');
    try {
      const body = {
        medicationId: medication.id && medication.source !== 'rxnorm' ? medication.id : undefined,
        rxnormCui: medication.rxnorm_cui,
        drugName: medication.name,
        sig: form.sig || undefined,
        quantity: form.quantity ? Number(form.quantity) : undefined,
        quantityUnit: form.quantityUnit,
        daysSupply: form.daysSupply ? Number(form.daysSupply) : undefined,
        refills: Number(form.refills),
      };
      await api('/favorites', { method: 'POST', body });
      setNotice('Saved to favorites.');
      loadFavorites();
    } catch (err) { setError(err.message); }
  };

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
      if (medication.id && medication.source !== 'rxnorm') body.medicationId = medication.id;
      else body.rxnormCui = medication.rxnorm_cui;

      const rx = await api('/prescriptions', { method: 'POST', body });
      navigate(`/prescriptions/${rx.id}`);
    } catch (err) {
      setError(err.details ? err.details.map((d) => `${d.field}: ${d.message}`).join(', ') : err.message);
    } finally { setBusy(false); }
  };

  const fmtFormulary = (s) => ({ preferred: 'Preferred (on formulary)', non_preferred: 'Non-preferred', non_formulary: 'Not on formulary' }[s] || s);

  return (
    <>
      <div className="topbar"><h1>New prescription</h1></div>
      <div className="content">
        <div className="card" style={{ maxWidth: 720 }}>
          {error && <div className="alert error">{error}</div>}
          {notice && <div className="alert success">{notice}</div>}

          {favorites.length > 0 && (
            <div style={{ marginBottom: 14 }}>
              <label style={{ fontSize: 13, fontWeight: 600 }}>★ Favorites (quick prescribe)</label>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 6 }}>
                {favorites.map((fav) => (
                  <button key={fav.id} type="button" className="secondary sm" onClick={() => applyFavorite(fav)}>
                    {fav.label || fav.drug_name}
                  </button>
                ))}
              </div>
            </div>
          )}

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

            {/* Real-Time Prescription Benefit */}
            {medication && (
              <div className="card" style={{ padding: 12, marginBottom: 12, background: '#f0fdfa' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <strong style={{ fontSize: 13 }}>💊 Real-Time Prescription Benefit</strong>
                  <button type="button" className="secondary sm" onClick={() => runBenefit(medication, form.daysSupply)} disabled={benefitBusy}>
                    {benefitBusy ? 'Checking…' : 'Recheck'}
                  </button>
                </div>
                {benefit ? (
                  <div style={{ fontSize: 14, marginTop: 8 }}>
                    <div>Formulary: <strong>{fmtFormulary(benefit.formularyStatus)}</strong></div>
                    <div>Estimated patient cost: <strong>${benefit.estimatedCopay}</strong> {form.daysSupply ? `/ ${form.daysSupply}-day supply` : ''}</div>
                    {benefit.priorAuthRequired && <div className="badge controlled" style={{ marginTop: 4 }}>Prior authorization likely required</div>}
                    {benefit.coverageAlerts?.map((a, i) => <div key={i} className="muted" style={{ fontSize: 12 }}>⚠ {a.message}</div>)}
                    {benefit.alternatives?.length > 0 && (
                      <div style={{ marginTop: 6 }}>
                        <div className="muted" style={{ fontSize: 12 }}>Lower-cost alternatives:</div>
                        {benefit.alternatives.map((alt) => (
                          <button key={alt.medicationId} type="button" className="secondary sm" style={{ margin: '3px 4px 0 0' }}
                            onClick={() => setMedication({ id: alt.medicationId, name: alt.name, rxnorm_cui: alt.rxnormCui, dea_schedule: 0, source: 'local' })}>
                            {alt.name} — ${alt.estimatedCopay}
                          </button>
                        ))}
                      </div>
                    )}
                    <div className="muted" style={{ fontSize: 11, marginTop: 4 }}>Source: {benefit.source}</div>
                  </div>
                ) : <div className="muted" style={{ fontSize: 13, marginTop: 6 }}>{benefitBusy ? 'Checking benefit…' : 'No benefit data.'}</div>}
              </div>
            )}

            <SigBuilder onApply={(sig) => setForm((prev) => ({ ...prev, sig }))} />
            <div className="field">
              <label>Sig (patient instructions)</label>
              <textarea rows={2} value={form.sig} onChange={set('sig')} required
                placeholder="e.g. Take 1 tablet by mouth once daily" />
            </div>
            <div className="row">
              <div className="field"><label>Quantity</label><input type="number" min="0" step="any" value={form.quantity} onChange={set('quantity')} required /></div>
              <div className="field"><label>Unit</label><input value={form.quantityUnit} onChange={set('quantityUnit')} /></div>
              <div className="field"><label>Days supply</label><input type="number" min="1" value={form.daysSupply} onChange={set('daysSupply')} onBlur={() => runBenefit(medication, form.daysSupply)} /></div>
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

            <div className="row">
              <button disabled={busy}>{busy ? 'Creating…' : 'Create draft & review safety'}</button>
              <button type="button" className="secondary" onClick={saveFavorite}>★ Save as favorite</button>
            </div>
          </form>
        </div>
      </div>
    </>
  );
}
