import * as React from 'react';

export function SuspectsNonAttribuesPanel({ API_URL, token }) {
      const [loading, setLoading] = React.useState(false);
      const [msg, setMsg] = React.useState(null);
      const [isError, setIsError] = React.useState(false);

      const handleDelete = async () => {
        setMsg(null);
        setIsError(false);
        setLoading(true);
        try {
          // 1. Compter d'abord
          const countRes = await fetch(API_URL + '/societes/suspects-non-attribues/count', {
            headers: { Authorization: 'Bearer ' + token }
          });
          const countData = await countRes.json();
          if (!countRes.ok) throw new Error(countData.error || 'Erreur serveur');
          const count = countData.count;

          if (count === 0) {
            setMsg('Aucune société suspect non attribuée trouvée.');
            setLoading(false);
            return;
          }

          // 2. Demander confirmation
          const confirmed = window.confirm(
            `${count} société${count > 1 ? 's' : ''} suspect${count > 1 ? 's' : ''} non attribuée${count > 1 ? 's' : ''} vont être supprimée${count > 1 ? 's' : ''} définitivement.\n\nCette action est irréversible. Confirmer ?`
          );
          if (!confirmed) {
            setLoading(false);
            return;
          }

          // 3. Supprimer
          const delRes = await fetch(API_URL + '/societes/suspects-non-attribues', {
            method: 'DELETE',
            headers: { Authorization: 'Bearer ' + token }
          });
          const delData = await delRes.json();
          if (!delRes.ok) throw new Error(delData.error || 'Erreur serveur');
          setMsg(`✅ ${delData.deleted} société${delData.deleted > 1 ? 's' : ''} supprimée${delData.deleted > 1 ? 's' : ''}.`);
        } catch (e) {
          setIsError(true);
          setMsg('❌ ' + e.message);
        } finally {
          setLoading(false);
        }
      };

      return (
        <div style={{marginBottom:'18px',background:'white',border:'1px solid var(--tw-border)',borderRadius:'10px',boxShadow:'var(--sh-sm)',overflow:'hidden'}}>
          <div style={{padding:'10px 16px',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
            <span style={{fontSize:'13px',fontWeight:'600',color:'#c0392b'}}>🗑️ Gestion des suspects non attribués</span>
            <button
              onClick={handleDelete}
              disabled={loading}
              style={{padding:'7px 16px',background:loading?'#ccc':'var(--danger)',color:'white',border:'none',borderRadius:'6px',fontSize:'12px',fontWeight:'600',cursor:loading?'default':'pointer',fontFamily:"'Inter',sans-serif",whiteSpace:'nowrap'}}
            >
              {loading ? '⏳ Vérification...' : '🗑️ Supprimer les suspects non attribués'}
            </button>
          </div>
          {msg && (
            <div style={{padding:'8px 16px 12px',borderTop:'1px solid var(--tw-border)'}}>
              <div style={{fontSize:'13px',fontWeight:'500',color:isError?'#c0392b':'#2e7d32',background:isError?'#fdecea':'#e8f8f0',border:`1px solid ${isError?'#f5c6c2':'#a8dfc0'}`,borderRadius:'6px',padding:'8px 12px'}}>
                {msg}
              </div>
            </div>
          )}
        </div>
      );
    }

    // ══════════════════════════════════════════════════
    // COMPOSANT : ImportPanel
    // ══════════════════════════════════════════════════
