import * as React from 'react';

export function CommercialEditor({ selectedProspect, users, user, API_URL, onUpdateProspect }) {
      const [open, setOpen] = React.useState(false);
      const [value, setValue] = React.useState(selectedProspect?.assigned_to || '');
      const [saving, setSaving] = React.useState(false);
      const [error, setError] = React.useState('');

      // Re-sync quand on change de prospect
      React.useEffect(() => {
        setValue(selectedProspect?.assigned_to || '');
        setOpen(false);
        setError('');
      }, [selectedProspect?.id]);

      // Liste des commerciaux disponibles : on filtre les utilisateurs actifs
      // (Frédéric/Frederic sont exclus de la même façon que dans LeftPanel)
      const commerciaux = (users || []).filter(u => !['Frédéric','Frederic'].includes(u.name));

      const currentValue = selectedProspect?.assigned_to || '';
      const hasChange = value !== currentValue;

      const handleSave = async () => {
        setError('');
        setSaving(true);
        try {
          if (value === '') {
            // Désattribution : on ne peut pas réutiliser /attribuer (qui exige un commercial_name).
            // On passe par PUT /api/prospects/:id pour mettre assigned_to à null.
            const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}`, {
              method: 'PUT',
              headers: {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
              body: JSON.stringify({ ...selectedProspect, assigned_to: null })
            });
            if (!res.ok) throw new Error('Erreur serveur (code ' + res.status + ')');
            onUpdateProspect({...selectedProspect, assigned_to: null});
            if (window.showToast) window.showToast({ title: 'Société désattribuée', type: 'success' });
          } else {
            // Attribution à un commercial : utilise la route dédiée qui envoie aussi le mail
            const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}/attribuer`, {
              method: 'PUT',
              headers: {'Content-Type':'application/json','Authorization':`Bearer ${user.token}`},
              body: JSON.stringify({ commercial_name: value })
            });
            if (!res.ok) {
              const errData = await res.json().catch(() => ({}));
              throw new Error(errData.error || 'Erreur serveur (code ' + res.status + ')');
            }
            onUpdateProspect({...selectedProspect, assigned_to: value});
            if (window.showToast) window.showToast({ title: `Attribué à ${value} — mail envoyé`, type: 'success' });
          }
          setOpen(false);
        } catch (e) {
          setError(e.message);
        } finally {
          setSaving(false);
        }
      };

      const handleCancel = () => {
        setValue(currentValue);
        setOpen(false);
        setError('');
      };

      return (
        <span style={{position:'relative'}}>
          <span style={{color:'var(--tw-slate)'}}>Commercial :</span>{' '}
          <span
            onClick={() => setOpen(o => !o)}
            style={{
              cursor:'pointer',
              fontWeight:500,
              color:currentValue?'var(--tw-ink)':'var(--tw-muted)',
              borderBottom:'1px dashed var(--tw-muted)',
              padding:'1px 2px'
            }}
            title="Cliquer pour modifier l'attribution"
          >
            {currentValue || 'Non attribué'} ✎
          </span>
          {open && (
            <div style={{
              position:'absolute',
              top:'calc(100% + 6px)',
              left:0,
              zIndex:50,
              background:'white',
              border:'1px solid var(--tw-border)',
              borderRadius:'8px',
              boxShadow:'0 4px 14px rgba(0,0,0,0.12)',
              padding:'12px',
              minWidth:'280px'
            }}>
              <div style={{fontSize:'11px',fontWeight:600,color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'8px'}}>
                Modifier l'attribution
              </div>
              <select
                value={value}
                onChange={e => setValue(e.target.value)}
                disabled={saving}
                style={{width:'100%',padding:'8px 10px',fontSize:'13px',border:'1px solid var(--tw-border)',borderRadius:'6px',background:'white',cursor:saving?'wait':'pointer',marginBottom:'10px'}}
              >
                <option value="">— Aucun (désattribuer) —</option>
                {commerciaux.map(c => (
                  <option key={c.id || c.name} value={c.name}>{c.name}</option>
                ))}
              </select>
              {error && (
                <div style={{padding:'6px 8px',background:'#fecaca',color:'#991b1b',borderRadius:'5px',fontSize:'11px',marginBottom:'8px'}}>
                  {error}
                </div>
              )}
              <div style={{display:'flex',gap:'6px',justifyContent:'flex-end'}}>
                <button
                  onClick={handleCancel}
                  disabled={saving}
                  style={{padding:'6px 12px',fontSize:'12px',background:'white',border:'1px solid var(--tw-border)',borderRadius:'5px',cursor:saving?'wait':'pointer',color:'var(--tw-ink)'}}
                >Annuler</button>
                <button
                  onClick={handleSave}
                  disabled={saving || !hasChange}
                  style={{padding:'6px 12px',fontSize:'12px',background:hasChange?'var(--tw-teal)':'var(--tw-border)',color:'white',border:'none',borderRadius:'5px',cursor:(saving||!hasChange)?'not-allowed':'pointer',fontWeight:600}}
                >{saving ? '…' : (value === '' ? 'Désattribuer' : 'Enregistrer')}</button>
              </div>
            </div>
          )}
        </span>
      );
    }

    // Modale de complétion d'une action : saisie du résultat (completed_note) + proposition
    // d'une prochaine action (cadence). Réutilisable — utilisée dans la fiche société.

