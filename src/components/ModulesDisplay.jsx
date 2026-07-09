import * as React from 'react';

export function ModulesDisplay({ prospectId, user, API_URL }) {
      const [modules, setModules] = React.useState([]);
      const [loading, setLoading] = React.useState(true);

      React.useEffect(() => {
        const loadModules = async () => {
          try {
            const res = await fetch(`${API_URL}/prospects/${prospectId}/modules`, {
              headers: { 'Authorization': `Bearer ${user.token}` }
            });
            if (res.ok) {
              const data = await res.json();
              setModules(data);
            }
          } catch (err) {
            console.error('Erreur chargement modules:', err);
          }
          setLoading(false);
        };
        loadModules();
      }, [prospectId]);

      if (loading) return null;
      if (modules.length === 0) return null;

      const moduleColors = {
        'Biz': '#17a2b8', 'BizAvecFab': '#17a2b8', 'Fab': '#17a2b8', 'Net': '#17a2b8', 'Kub': '#17a2b8',
        'Mag': '#e91e63', 'VRP': '#9c27b0', 'Col': '#ff9800', 'Log': '#ffc107', 'Jet': '#4caf50'
      };

      const moduleLabels = {
        'BizAvecFab': 'Biz avec FAB',
        'FluxTiers': 'Flux Tiers',
        'ComptaSage': 'Compta Sage',
        'FacturationElectronique': 'Facturation Électronique'
      };

      return (
        <div style={{
          marginTop: '15px',
          padding: '15px',
          backgroundColor: '#f9f9f9',
          borderRadius: '6px',
          border: '1px solid #e0e0e0'
        }}>
          <div style={{fontWeight: 'bold', marginBottom: '12px', color: '#666', fontSize: '15px'}}>Modules retenus</div>
          <div style={{
            display: 'grid',
            gridTemplateColumns: 'repeat(auto-fit, minmax(90px, 1fr))',
            gap: '12px'
          }}>
            {modules.filter(m => m.nb_users > 0).map(module => (
              <div key={module.id} style={{textAlign: 'center'}}>
                <div style={{
                  color: moduleColors[module.module_name] || '#666',
                  fontWeight: 'bold',
                  fontSize: '16px'
                }}>
                  {moduleLabels[module.module_name] || module.module_name}
                </div>
                <div style={{fontSize: '14px', color: '#999'}}>
                  {module.module_name === 'ComptaSage' || module.module_name === 'FacturationElectronique' 
                    ? '✓' 
                    : `${module.nb_users} user${module.nb_users > 1 ? 's' : ''}`
                  }
                </div>
              </div>
            ))}
          </div>
        </div>
      );
    }

