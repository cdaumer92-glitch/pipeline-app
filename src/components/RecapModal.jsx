import * as React from 'react';
import { formatCurrency } from '../lib/shared.jsx';

export function RecapModal({ commercial, period, prospects, onClose, onNavigate, user, API_URL }) {
      const [recapData, setRecapData] = React.useState(null);
      const [loading, setLoading] = React.useState(true);

      React.useEffect(() => {
        const fetchRecap = async () => {
          try {
            const today = new Date();
            today.setHours(23, 59, 59, 999);
            
            // Calculer les dates de début et fin selon la période
            let startDate, endDate;
            
            if (period === 'jour') {
              startDate = new Date();
              startDate.setHours(0, 0, 0, 0);
              endDate = new Date();
              endDate.setHours(23, 59, 59, 999);
            } else if (period === 'semaine') {
              startDate = new Date();
              const day = startDate.getDay();
              const diff = startDate.getDate() - day + (day === 0 ? -6 : 1); // Lundi
              startDate.setDate(diff);
              startDate.setHours(0, 0, 0, 0);
              
              // endDate = dimanche de cette semaine
              endDate = new Date(startDate);
              endDate.setDate(startDate.getDate() + 6); // +6 jours = dimanche
              endDate.setHours(23, 59, 59, 999);
            } else { // mois
              startDate = new Date(today.getFullYear(), today.getMonth(), 1);
              startDate.setHours(0, 0, 0, 0);
              // endDate = dernier jour du mois
              endDate = new Date(today.getFullYear(), today.getMonth() + 1, 0);
              endDate.setHours(23, 59, 59, 999);
            }

            // Prospects créés dans la période
            const prospectsCreated = prospects.filter(p => {
              if (p.assigned_to !== commercial) return false;
              const createdDate = new Date(p.created_at);
              return createdDate >= startDate && createdDate <= endDate;
            });

            const suspects = prospectsCreated.filter(p => p.statut_societe === 'Suspect').length;
            const prospectsCount = prospectsCreated.filter(p => p.statut_societe === 'Prospect').length;
            const clients = prospectsCreated.filter(p => p.statut_societe === 'Client').length;

            // Devis créés dans la période
            const devisCreated = prospects.filter(p => {
              if (p.assigned_to !== commercial) return false;
              if (!p.real_status || !['En cours', 'Envoyé', 'Discussion'].includes(p.real_status)) return false;
              if (!p.status_date) return false;
              const statusDate = new Date(p.status_date);
              return statusDate >= startDate && statusDate <= endDate;
            });

            // Charger toutes les actions du commercial (en parallèle pour optimiser)
            const commercialProspects = prospects.filter(p => p.assigned_to === commercial);
            const actionsPromises = commercialProspects.map(async (prospect) => {
              try {
                const res = await fetch(`${API_URL}/prospects/${prospect.id}/next_actions`, {
                  headers: { 'Authorization': `Bearer ${user.token}` }
                });
                if (res.ok) {
                  const actions = await res.json();
                  return actions.map(action => ({
                    ...action,
                    prospect_id: prospect.id,
                    prospect_name: prospect.name
                  }));
                }
              } catch (err) {
                console.error('Erreur chargement actions:', err);
              }
              return [];
            });

            const actionsArrays = await Promise.all(actionsPromises);
            const allActions = actionsArrays.flat();

            // Actions créées dans la période ET prévues dans la période (non cochées uniquement)
            const actionsCreated = allActions.filter(a => {
              if (a.completed) return false;
              const createdDate = new Date(a.created_at);
              const plannedDate = new Date(a.planned_date);
              // L'action doit être créée dans la période ET prévue dans la période
              return (createdDate >= startDate && createdDate <= endDate) &&
                     (plannedDate >= startDate && plannedDate <= endDate);
            });

            // Actions planifiées dans la période (non encore réalisées)
            const actionsPlanned = allActions.filter(a => {
              if (a.completed) return false;
              const actionDate = new Date(a.planned_date);
              return actionDate >= startDate && actionDate <= endDate;
            });

            // Actions en retard (non cochées et date < aujourd'hui)
            // Actions en retard = date strictement AVANT aujourd'hui (pas aujourd'hui)
            const startOfToday = new Date();
            startOfToday.setHours(0, 0, 0, 0);
            const actionsLate = allActions.filter(a => {
              if (a.completed) return false;
              const actionDate = new Date(a.planned_date);
              return actionDate < startOfToday;
            });

            setRecapData({
              period,
              periodLabel: period === 'jour' ? 'du jour' : period === 'semaine' ? 'de la semaine' : 'du mois',
              startDate,
              endDate,
              prospectsCreated,
              suspects,
              prospectsCount,
              clients,
              devisCreated,
              actionsCreated,
              actionsPlanned,
              actionsLate
            });
          } catch (err) {
            console.error('Erreur récap:', err);
          }
          setLoading(false);
        };

        fetchRecap();
      }, [commercial, period, prospects]);

      if (loading) {
        return (
          <div style={{
            position: 'fixed',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0,0,0,0.5)',
            display: 'flex',
            justifyContent: 'center',
            alignItems: 'center',
            zIndex: 2000
          }}>
            <div style={{
              backgroundColor: 'white',
              padding: '40px',
              borderRadius: '8px',
              fontSize: '16px'
            }}>
              Chargement du récapitulatif...
            </div>
          </div>
        );
      }

      return (
        <div style={{
          position: 'fixed',
          top: 0,
          left: 0,
          right: 0,
          bottom: 0,
          backgroundColor: 'rgba(0,0,0,0.5)',
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          zIndex: 2000,
          overflow: 'auto',
          padding: '20px'
        }}>
          <div style={{
            backgroundColor: 'white',
            borderRadius: '8px',
            maxWidth: '900px',
            width: '100%',
            maxHeight: '90vh',
            overflow: 'auto',
            boxShadow: '0 4px 20px rgba(0,0,0,0.3)'
          }}>
            {/* Header */}
            <div style={{
              padding: '20px 30px',
              borderBottom: '2px solid #10a0dc',
              backgroundColor: '#f9f9f9',
              position: 'sticky',
              top: 0,
              zIndex: 1
            }}>
              <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                <h2 style={{margin: 0, color: '#002147'}}>
                  📋 Récapitulatif {recapData.periodLabel} - {commercial}
                </h2>
                <button onClick={onClose} style={{
                  fontSize: '24px',
                  border: 'none',
                  background: 'none',
                  cursor: 'pointer',
                  color: '#666'
                }}>
                  ×
                </button>
              </div>
              <div style={{fontSize: '14px', color: '#666', marginTop: '8px'}}>
                {period === 'jour' && new Date().toLocaleDateString('fr-FR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
                {period === 'semaine' && `Du ${recapData.startDate.toLocaleDateString('fr-FR')} au ${recapData.endDate.toLocaleDateString('fr-FR')}`}
                {period === 'mois' && new Date().toLocaleDateString('fr-FR', { month: 'long', year: 'numeric' })}
              </div>
            </div>

            {/* Content */}
            <div style={{padding: '30px'}}>
              {/* PREMIER TABLEAU: Entreprises et Devis */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '30px',
                marginBottom: '30px',
                padding: '20px',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px'
              }}>
                {/* Entreprises créées */}
                <div>
                  <h3 style={{color: '#002147', marginBottom: '15px'}}>
                    🏢 Entreprises créées : {recapData.prospectsCreated.length}
                  </h3>
                  {recapData.prospectsCreated.length > 0 ? (
                    <>
                      <div style={{fontSize: '14px', color: '#666', marginBottom: '10px'}}>
                        {recapData.suspects > 0 && `${recapData.suspects} Suspect(s) • `}
                        {recapData.prospectsCount > 0 && `${recapData.prospectsCount} Prospect(s) • `}
                        {recapData.clients > 0 && `${recapData.clients} Client(s)`}
                      </div>
                      <ul style={{marginTop: '10px'}}>
                        {recapData.prospectsCreated.map(p => (
                          <li key={p.id} style={{marginBottom: '8px', fontSize: '14px'}}>
                            <strong>{p.name}</strong> - 
                            <span style={{
                              marginLeft: '8px',
                              color: p.statut_societe === 'Suspect' ? 'var(--meta)' :
                                     p.statut_societe === 'Prospect' ? 'var(--warning)' : 'var(--primary)',
                              fontWeight: 'bold'
                            }}>
                              {p.statut_societe}
                            </span>
                          </li>
                        ))}
                      </ul>
                    </>
                  ) : (
                    <div style={{color: '#999', fontSize: '14px'}}>Aucune entreprise créée</div>
                  )}
                </div>

                {/* Devis créés */}
                <div>
                  <h3 style={{color: '#002147', marginBottom: '15px'}}>
                    📄 Devis créés : {recapData.devisCreated.length}
                  </h3>
                  {recapData.devisCreated.length > 0 ? (
                    <ul>
                      {recapData.devisCreated.map(p => (
                        <li key={p.id} style={{marginBottom: '8px', fontSize: '14px'}}>
                          <strong>{p.name}</strong> - 
                          <span style={{marginLeft: '8px', color: '#666'}}>
                            {formatCurrency((p.real_setup_amount||p.setup_amount||0) + (p.real_monthly_amount||p.monthly_amount||0)*12 + (p.real_annual_amount||p.annual_amount||0) + (p.real_training_amount||p.training_amount||0))}
                          </span>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{color: '#999', fontSize: '14px'}}>Aucun devis créé</div>
                  )}
                </div>
              </div>

              {/* DEUXIÈME TABLEAU: Actions planifiées et Actions en retard */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: '1fr 1fr',
                gap: '30px',
                marginBottom: '30px',
                padding: '20px',
                backgroundColor: '#f9f9f9',
                borderRadius: '8px'
              }}>
                {/* Actions planifiées */}
                <div>
                  <h3 style={{color: '#10a0dc', marginBottom: '15px'}}>
                    📅 Actions planifiées {recapData.periodLabel} : {recapData.actionsPlanned.length}
                  </h3>
                  {recapData.actionsPlanned.length > 0 ? (
                    <ul style={{listStyle: 'none', padding: 0}}>
                      {recapData.actionsPlanned.map(action => (
                        <li key={action.id}
                          onClick={() => { onNavigate(action.prospect_id); onClose(); }}
                          style={{
                            marginBottom: '10px', fontSize: '14px',
                            padding: '8px 12px', borderRadius: '6px',
                            cursor: 'pointer', backgroundColor: 'white',
                            border: '1px solid #e0e0e0',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e8f4fd'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                        >
                          <strong>{action.action_type}</strong>
                          <span style={{color: '#10a0dc', marginLeft: '6px'}}>→ {action.prospect_name}</span>
                          {action.contact && <span style={{color: '#999'}}> ({action.contact})</span>}
                          <div style={{fontSize: '12px', color: '#888', marginTop: '3px'}}>
                            📅 Prévu le {new Date(action.planned_date).toLocaleDateString('fr-FR')}
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{color: '#999', fontSize: '14px'}}>Aucune action planifiée</div>
                  )}
                </div>

                {/* Actions en retard */}
                <div>
                  <h3 style={{color: '#e23b63', marginBottom: '15px'}}>
                    ⚠️ Actions en retard : {recapData.actionsLate.length}
                  </h3>
                  {recapData.actionsLate.length > 0 ? (
                    <ul style={{listStyle: 'none', padding: 0}}>
                      {recapData.actionsLate.map(action => (
                        <li key={action.id}
                          onClick={() => { onNavigate(action.prospect_id); onClose(); }}
                          style={{
                            marginBottom: '10px', fontSize: '14px',
                            padding: '8px 12px', borderRadius: '6px',
                            cursor: 'pointer', backgroundColor: 'white',
                            border: '1px solid #ffc0cb',
                            transition: 'background 0.15s'
                          }}
                          onMouseEnter={e => e.currentTarget.style.backgroundColor = '#fff0f3'}
                          onMouseLeave={e => e.currentTarget.style.backgroundColor = 'white'}
                        >
                          <strong>{action.action_type}</strong>
                          <span style={{color: '#e23b63', marginLeft: '6px'}}>→ {action.prospect_name}</span>
                          {action.contact && <span style={{color: '#999'}}> ({action.contact})</span>}
                          <div style={{fontSize: '12px', color: '#888', marginTop: '3px'}}>
                            📅 Prévu le {new Date(action.planned_date).toLocaleDateString('fr-FR')}
                            <span style={{color: '#e23b63', marginLeft: '8px', fontWeight: 'bold'}}>EN RETARD</span>
                          </div>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <div style={{color: '#3cd6b9', fontSize: '14px'}}>✓ Aucune action en retard !</div>
                  )}
                </div>
              </div>

              {/* Nouvelles actions (après les 2 tableaux) */}
              <div style={{marginBottom: '30px'}}>
                <h3 style={{color: '#002147', marginBottom: '15px'}}>
                  ✅ Nouvelles actions : {recapData.actionsCreated.length}
                </h3>
                {recapData.actionsCreated.length > 0 ? (
                  <ul style={{listStyle: 'none', padding: 0}}>
                    {recapData.actionsCreated.map(action => (
                      <li key={action.id}
                        onClick={() => { onNavigate(action.prospect_id); onClose(); }}
                        style={{
                          marginBottom: '10px', fontSize: '14px',
                          padding: '8px 12px', borderRadius: '6px',
                          cursor: 'pointer', backgroundColor: '#f9f9f9',
                          border: '1px solid #e0e0e0',
                          transition: 'background 0.15s'
                        }}
                        onMouseEnter={e => e.currentTarget.style.backgroundColor = '#e8f4fd'}
                        onMouseLeave={e => e.currentTarget.style.backgroundColor = '#f9f9f9'}
                      >
                        <strong>{action.action_type}</strong>
                        <span style={{color: '#10a0dc', marginLeft: '6px'}}>→ {action.prospect_name}</span>
                        {action.contact && <span style={{color: '#999'}}> ({action.contact})</span>}
                        <div style={{fontSize: '12px', color: '#888', marginTop: '3px'}}>
                          📅 Prévu le {new Date(action.planned_date).toLocaleDateString('fr-FR')}
                          {action.completed_note && ` - ${action.completed_note}`}
                        </div>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <div style={{color: '#999', fontSize: '14px'}}>Aucune action créée</div>
                )}
              </div>
            </div>
          </div>
        </div>
      );
    }

    // ================== COMPOSANTS ==================

