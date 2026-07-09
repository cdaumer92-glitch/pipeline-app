import * as React from 'react';

export function MotifPerteField({ devisId, affaireId, initialValue, onSave }) {
      const [val, setVal] = React.useState(initialValue || '');
      const vide = !val.trim();
      return (
        <div>
          <textarea
            value={val}
            onChange={(e) => setVal(e.target.value)}
            placeholder="Pourquoi ce devis est-il perdu ? (prix, concurrent, délai, projet annulé...)"
            rows={2}
            style={{width:'100%',padding:'8px 10px',fontSize:'12px',border:'0.5px solid var(--tw-border)',borderRadius:'6px',resize:'vertical',fontFamily:"'Inter',sans-serif",boxSizing:'border-box'}}
          />
          <div style={{display:'flex',justifyContent:'flex-end',marginTop:'6px'}}>
            <button
              onClick={() => onSave(devisId, val, affaireId)}
              disabled={vide}
              title={vide ? 'Saisissez un motif avant de valider' : 'Valider le motif et choisir le statut de l\'affaire'}
              style={{fontSize:'11px',fontWeight:600,padding:'5px 12px',borderRadius:'6px',border:'none',
                background: vide ? 'var(--tw-border)' : 'var(--tw-teal)',
                color: vide ? 'var(--tw-muted)' : 'white',
                cursor: vide ? 'not-allowed' : 'pointer', fontFamily:"'Inter',sans-serif"}}
            >Valider le motif</button>
          </div>
        </div>
      );
    }
