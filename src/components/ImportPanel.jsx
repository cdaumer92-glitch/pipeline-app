import * as React from 'react';

export function ImportPanel({ API_URL, token }) {
      const [open, setOpen] = React.useState(false);
      const [file, setFile] = React.useState(null);
      const [loading, setLoading] = React.useState(false);
      const [result, setResult] = React.useState(null);
      const [error, setError] = React.useState(null);
      const fileRef = React.useRef();

      const handleImport = async () => {
        if (!file) return;
        setLoading(true);
        setResult(null);
        setError(null);
        try {
          const formData = new FormData();
          formData.append('file', file);
          const res = await fetch(API_URL + '/import', {
            method: 'POST',
            headers: { Authorization: 'Bearer ' + token },
            body: formData
          });
          const data = await res.json();
          if (!res.ok) throw new Error(data.error || 'Erreur serveur');
          setResult(data);
          setFile(null);
          if (fileRef.current) fileRef.current.value = '';
        } catch (e) {
          setError(e.message);
        } finally {
          setLoading(false);
        }
      };

      return (
        <div style={{marginBottom:'18px',background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',boxShadow:'var(--sh-sm)',overflow:'hidden'}}>
          <div onClick={() => setOpen(o => !o)}
            style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',cursor:'pointer',userSelect:'none'}}
            onMouseEnter={e=>e.currentTarget.style.background='var(--tw-teal-light)'}
            onMouseLeave={e=>e.currentTarget.style.background='white'}
          >
            <span style={{fontSize:'13px',fontWeight:'600',color:'var(--tw-teal)'}}>📥 Import Excel — Sociétés & Contacts</span>
            <span style={{fontSize:'12px',color:'var(--tw-muted)'}}>{open ? '▲ Fermer' : '▼ Ouvrir'}</span>
          </div>
          {open && (
            <div style={{padding:'0 16px 16px',borderTop:'1px solid var(--tw-border)'}}>
              <div style={{marginTop:'14px',display:'flex',flexDirection:'column',gap:'12px'}}>

                {/* Info template */}
                <div style={{background:'var(--tw-teal-light)',border:'1px solid var(--tw-border)',borderRadius:'6px',padding:'10px 14px',fontSize:'12px',color:'var(--tw-teal)',lineHeight:'1.6'}}>
                  <b>Format attendu :</b> fichier Excel avec 2 onglets <b>Societes</b> et <b>Contacts</b>.<br/>
                  Colonnes Societes : <i>nom_societe*, statut*, adresse, cp, ville, pays, telephone, email_societe, site_web, secteur, notes</i><br/>
                  Colonnes Contacts : <i>nom_societe*, civilite, prenom, nom*, fonction, telephone, email, contact_principal</i><br/>
                  Statut accepté : <b>Suspect / Prospect / Client</b> — Les doublons sont mis à jour. Les sociétés importées sont <b>non attribuées</b>.
                </div>

                {/* Sélecteur fichier */}
                <div style={{display:'flex',gap:'10px',alignItems:'center',flexWrap:'wrap'}}>
                  <input ref={fileRef} type="file" accept=".xlsx,.xls"
                    onChange={e => { setFile(e.target.files[0]); setResult(null); setError(null); }}
                    style={{fontSize:'13px',color:'var(--tw-ink)',flex:1,minWidth:'200px'}}
                  />
                  <button onClick={handleImport} disabled={!file || loading}
                    style={{padding:'8px 18px',background:(!file||loading)?'#ccc':'var(--tw-teal)',color:'white',border:'none',borderRadius:'6px',fontSize:'13px',fontWeight:'600',cursor:(!file||loading)?'default':'pointer',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap'}}>
                    {loading ? '⏳ Import...' : '📥 Importer'}
                  </button>
                </div>

                {/* Résultat */}
                {result && (
                  <div style={{background:'#e8f8f0',border:'1px solid #a8dfc0',borderRadius:'6px',padding:'12px 14px',fontSize:'13px',lineHeight:'1.8'}}>
                    <div style={{fontWeight:'700',color:'#2e7d32',marginBottom:'4px'}}>✅ Import terminé</div>
                    <div>🏢 Sociétés créées : <b>{result.created}</b></div>
                    <div>🔄 Sociétés mises à jour : <b>{result.updated}</b></div>
                    <div>👤 Contacts ajoutés : <b>{result.contactsAdded}</b></div>
                    {result.errors && result.errors.length > 0 && (
                      <div style={{marginTop:'8px',color:'#c0392b'}}>
                        <b>⚠ {result.errors.length} erreur(s) :</b>
                        <ul style={{margin:'4px 0 0 16px',fontSize:'12px'}}>
                          {result.errors.slice(0,5).map((e,i) => <li key={i}>{e}</li>)}
                          {result.errors.length > 5 && <li>...et {result.errors.length-5} autres</li>}
                        </ul>
                      </div>
                    )}
                    <div style={{marginTop:'8px',fontSize:'12px',color:'var(--tw-slate)'}}>Rechargez la page pour voir les nouvelles sociétés.</div>
                  </div>
                )}
                {error && (
                  <div style={{background:'#fdecea',border:'1px solid #f5c6c2',borderRadius:'6px',padding:'10px 14px',fontSize:'13px',color:'var(--tw-red)'}}>
                    ❌ {error}
                  </div>
                )}

              </div>
            </div>
          )}
        </div>
      );
    }

