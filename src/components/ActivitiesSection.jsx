import * as React from 'react';
import { styles } from '../lib/styles.js';
import { ACTION_TYPES } from '../lib/constants.js';
import { I, ICONS, IconBtn, displayName } from '../lib/shared.jsx';
import { MotifPerteField } from './MotifPerteField.jsx';

export function ActivitiesSection({ nextActions, statusHistory, onAddNextAction, onToggleNextAction, onDeleteNextAction, newActionType, onActionTypeChange, newActionDate, onActionDateChange, newActionActor, onActionActorChange, newActionContact, onActionContactChange, newActionComment, onActionCommentChange, user, API_URL, interlocuteurs, affairesList, fetchAffaires, selectedAffaireId, setSelectedAffaireId, expandedActionId, setExpandedActionId, handleAddAffaire, handleEditAffaire, handleSaveAffaire, handleDeleteAffaire, showAffaireForm, setShowAffaireForm, editingAffaireId, setEditingAffaireId, affaireFormData, setAffaireFormData, affairesActions, handleOpenActionAffaireForm, handleToggleActionAffaire, handleDeleteActionAffaire, showActionAffaireForm, setShowActionAffaireForm, actionAffaireFormData, setActionAffaireFormData, handleSaveActionAffaire, devisList, onEdit, showDevisForm, setShowDevisForm, editingDevisId, setEditingDevisId, editingDevis, setEditingDevis, devisFormData, setDevisFormData, devisPdfFile, setDevisPdfFile, isUploadingDevisPdf, handleAddDevis, handleAddDevisLibre, handleAddDevisTexasWin, showDevisTypeModal, setShowDevisTypeModal, handleEditDevis, handleSaveDevis, handleQuickDevisStatus, handleAnnulerRemplacer, handleSaveMotifPerte, handleDeleteDevis, handleDeleteDevisPDF, handleUploadDevisPdfDirect, handleRattacherDevisAffaire, selectedProspect }) {
      const [actionNotes, setActionNotes] = React.useState({});
      const [showCompletedActions, setShowCompletedActions] = React.useState(false);
      const [showAllDevis, setShowAllDevis] = React.useState(false);

      // ─── Drag & drop des affaires ───────────────────────────────
      // Le tri par statut (En cours → Gagné → Perdu) reste prioritaire côté serveur ;
      // le drag réordonne à l'intérieur d'un même groupe de statut.
      const [draggedAffaireId, setDraggedAffaireId] = React.useState(null);
      const [dragOverAffaireId, setDragOverAffaireId] = React.useState(null);
      const handleAffaireDragStart = (e, affaireId) => {
        setDraggedAffaireId(affaireId);
        e.dataTransfer.effectAllowed = 'move';
      };
      const handleAffaireDragOver = (e, affaireId) => {
        e.preventDefault();
        if (dragOverAffaireId !== affaireId) setDragOverAffaireId(affaireId);
      };
      const handleAffaireDragEnd = () => {
        setDraggedAffaireId(null);
        setDragOverAffaireId(null);
      };
      const handleAffaireDrop = async (e, targetAffaireId) => {
        e.preventDefault();
        const sourceId = draggedAffaireId;
        setDraggedAffaireId(null);
        setDragOverAffaireId(null);
        if (!sourceId || sourceId === targetAffaireId) return;
        const currentList = [...(affairesList || [])];
        const fromIdx = currentList.findIndex(a => a.id === sourceId);
        const toIdx = currentList.findIndex(a => a.id === targetAffaireId);
        if (fromIdx < 0 || toIdx < 0) return;
        const [moved] = currentList.splice(fromIdx, 1);
        currentList.splice(toIdx, 0, moved);
        const orderedIds = currentList.map(a => a.id);
        try {
          const res = await fetch(`${API_URL}/prospects/${selectedProspect.id}/affaires/reorder`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${user.token}` },
            body: JSON.stringify({ orderedIds })
          });
          if (!res.ok) throw new Error(`HTTP ${res.status}`);
          if (typeof fetchAffaires === 'function') await fetchAffaires(selectedProspect.id);
        } catch (err) {
          console.error('Erreur reorder affaires:', err);
          window.showToast({ title: 'Erreur réorganisation : ' + err.message, type: 'error' });
        }
      };
      // Initialiser les notes avec les completed_note existantes
      React.useEffect(() => {
        const initialNotes = {};
        nextActions.forEach(action => {
          if (action.completed_note && !actionNotes[action.id]) {
            initialNotes[action.id] = action.completed_note;
          }
        });
        if (Object.keys(initialNotes).length > 0) {
          setActionNotes(prev => ({...prev, ...initialNotes}));
        }
      }, [nextActions]);
      
      return (
        <div style={styles.activitiesSection}>
          {/* ========== SECTION AFFAIRES (refonte 2026) ========== */}
          {(() => {
            // Note : I, ICONS et IconBtn sont définis globalement (cf. utilitaires
            // avant App). On les utilise directement ici sans redéclaration.

            return (
            <div style={{marginBottom:'20px'}}>
              {/* Header section "Affaires" */}
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                <h3 style={{margin:0,fontSize:'14px',fontWeight:500,color:'var(--tw-ink)'}}>
                  Affaires <span style={{color:'var(--tw-muted)',fontWeight:400}}>· {affairesList?.length || 0}</span>
                </h3>
                <button onClick={handleAddAffaire}
                  style={{background:'var(--tw-ink)',color:'white',border:'none',padding:'6px 12px',borderRadius:'7px',fontSize:'12px',fontWeight:500,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px',fontFamily:"'Inter',sans-serif"}}
                  onMouseEnter={(e) => e.currentTarget.style.background='#0d2424'}
                  onMouseLeave={(e) => e.currentTarget.style.background='var(--tw-ink)'}
                >
                  {I(ICONS.plus, 11)} Nouvelle affaire
                </button>
              </div>

              {affairesList && affairesList.length > 0 ? (
                <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                  {affairesList.map(affaire => {
                    const isOpen = selectedAffaireId === affaire.id;
                    const affaireDevis = devisList.filter(d => d.affaire_id === affaire.id).sort((a, b) => new Date(b.quote_date || b.created_at || 0) - new Date(a.quote_date || a.created_at || 0));
                    const statutColor = affaire.statut_global === 'Gagné' ? {bg:'var(--success-soft)',fg:'var(--success)'}
                                       : affaire.statut_global === 'Perdu' ? {bg:'var(--danger-soft)',fg:'var(--danger)'}
                                       : {bg:'var(--primary-soft)',fg:'var(--primary)'};
                    // Couleur identitaire de l'affaire : stable, dérivée de l'ID.
                    // Permet de distinguer visuellement chaque affaire (barre latérale).
                    const PALETTE_AFFAIRES = ['var(--primary)','#b06e2a','#7048a8','#0a7a4a','#a8385f','#2a6cb0','#9a6212','#46807a'];
                    const couleurAffaire = PALETTE_AFFAIRES[(affaire.id || 0) % PALETTE_AFFAIRES.length];
                    return (
                      <div key={affaire.id}
                        onDragOver={(e) => handleAffaireDragOver(e, affaire.id)}
                        onDrop={(e) => handleAffaireDrop(e, affaire.id)}
                        onDragLeave={() => { if (dragOverAffaireId === affaire.id) setDragOverAffaireId(null); }}
                        style={{background:'white',borderRadius:'10px',border: (dragOverAffaireId === affaire.id && draggedAffaireId !== affaire.id) ? '2px dashed var(--tw-teal)' : '0.5px solid var(--tw-border)',overflow:'hidden',transition:'border-color .15s',opacity: draggedAffaireId === affaire.id ? 0.4 : 1}}>
                        {/* Bandeau accordéon */}
                        <div onClick={() => setSelectedAffaireId(isOpen ? null : affaire.id)}
                          style={{padding:'12px 14px',cursor:'pointer',background: isOpen ? '#fafaf9' : 'white',borderBottom: isOpen ? '0.5px solid var(--tw-border)' : 'none',borderLeft:`4px solid ${couleurAffaire}`}}>
                          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'10px'}}>
                            <div style={{flex:1,minWidth:0}}>
                              <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                                <span
                                  draggable={true}
                                  onDragStart={(e) => { e.stopPropagation(); handleAffaireDragStart(e, affaire.id); }}
                                  onDragEnd={handleAffaireDragEnd}
                                  onClick={(e) => e.stopPropagation()}
                                  title="Glisser pour réorganiser"
                                  style={{cursor:'grab',color:'var(--tw-muted)',fontSize:'14px',lineHeight:1,userSelect:'none',display:'inline-flex',letterSpacing:'-3px',paddingRight:'2px'}}>⋮⋮</span>
                                <span style={{color:'var(--tw-muted)',display:'inline-flex'}}>
                                  {I(isOpen ? ICONS.chevron : ICONS.chevronR, 12)}
                                </span>
                                <span style={{width:'9px',height:'9px',borderRadius:'50%',background:couleurAffaire,flexShrink:0,boxShadow:`0 0 0 2px ${couleurAffaire}22`}}></span>
                                <span style={{fontSize:'13px',fontWeight:500,color:'var(--tw-ink)'}}>{affaire.nom_affaire}</span>
                                <span style={{fontSize:'11px',fontWeight:500,padding:'2px 8px',borderRadius:'10px',background:statutColor.bg,color:statutColor.fg}}>{affaire.statut_global || 'En cours'}</span>
                                <span style={{fontSize:'11px',color:'var(--tw-muted)'}}>· {affaireDevis.length} devis</span>
                              </div>
                              {/* Prochaine action */}
                              {(() => {
                                const actions = affairesActions[affaire.id] || [];
                                const nextAction = actions.find(a => !a.completed);
                                if (!nextAction) return (
                                  <div style={{fontSize:'11px',color:'var(--tw-red)',marginTop:'6px',marginLeft:'20px',display:'flex',alignItems:'center',gap:'4px'}}>
                                    <span style={{display:'inline-flex',color:'var(--tw-red)'}}>{I(ICONS.alert, 11)}</span> Aucune action planifiée
                                  </div>
                                );
                                const today = new Date(); today.setHours(0,0,0,0);
                                const actionDate = nextAction.planned_date ? new Date(nextAction.planned_date) : null;
                                if (actionDate) actionDate.setHours(0,0,0,0);
                                const isLate = actionDate && actionDate < today;
                                const dateStr = actionDate ? actionDate.toLocaleDateString('fr-FR') : '—';
                                return (
                                  <div style={{fontSize:'11px',marginTop:'6px',marginLeft:'20px',color:'var(--tw-slate)',display:'flex',alignItems:'center',gap:'5px'}}>
                                    <span style={{display:'inline-flex',color:'var(--tw-green)'}}>{I(ICONS.spark, 11)}</span>
                                    <span style={{fontWeight:500,color:'var(--tw-ink)'}}>{nextAction.action_type}</span>
                                    <span style={{fontWeight:500,color: isLate ? 'var(--tw-red)' : 'var(--tw-slate)'}}>· {dateStr}{isLate ? ' (en retard)' : ''}</span>
                                    {(nextAction.actor || nextAction.contact) && (
                                      <span style={{color:'var(--tw-muted)'}}>· {nextAction.actor || ''}{nextAction.actor && nextAction.contact ? ' → ' : ''}{nextAction.contact || ''}</span>
                                    )}
                                  </div>
                                );
                              })()}
                              {/* Motif de perte de l'affaire (synthèse) */}
                              {affaire.statut_global === 'Perdu' && affaire.motif_perte && (
                                <div style={{fontSize:'11px',marginTop:'6px',marginLeft:'20px',color:'#a52d2d',display:'flex',alignItems:'flex-start',gap:'5px'}}>
                                  <span style={{fontWeight:600,whiteSpace:'nowrap'}}>Motif de perte :</span>
                                  <span style={{color:'var(--tw-slate)'}}>{affaire.motif_perte}</span>
                                </div>
                              )}
                            </div>
                            {/* Actions sur l'affaire */}
                            <div style={{display:'flex',alignItems:'center',gap:'2px'}} onClick={(e) => e.stopPropagation()}>
                              <IconBtn onClick={() => handleEditAffaire(affaire)} title="Modifier l'affaire">{I(ICONS.edit, 13)}</IconBtn>
                              <IconBtn onClick={() => handleDeleteAffaire(affaire.id)} title="Supprimer l'affaire" danger>{I(ICONS.trash, 13)}</IconBtn>
                            </div>
                          </div>
                        </div>

                        {/* Zone repliable */}
                        {isOpen && (
                          <div style={{padding:'14px 14px 12px',background:'white'}}>
                            {/* Header devis */}
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                              <p style={{margin:0,fontSize:'11px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.5px',fontWeight:500}}>Devis · {affaireDevis.length}</p>
                              <button onClick={handleAddDevis}
                                style={{background:'white',border:'0.5px solid var(--tw-border)',padding:'4px 10px',borderRadius:'6px',fontSize:'11px',color:'var(--tw-slate)',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',fontFamily:"'Inter',sans-serif"}}
                                onMouseEnter={(e) => { e.currentTarget.style.background='var(--tw-bg)'; e.currentTarget.style.borderColor='var(--tw-slate)'; }}
                                onMouseLeave={(e) => { e.currentTarget.style.background='white'; e.currentTarget.style.borderColor='var(--tw-border)'; }}
                              >
                                {I(ICONS.plus, 10)} Devis
                              </button>
                            </div>

                            {/* Liste devis */}
                            {affaireDevis.length === 0 ? (
                              <div style={{padding:'14px',textAlign:'center',color:'var(--tw-muted)',fontSize:'12px',background:'var(--tw-bg)',borderRadius:'8px',border:'0.5px dashed var(--tw-border)',fontStyle:'italic'}}>Aucun devis</div>
                            ) : (
                              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                                {affaireDevis.map(devis => {
                                  const statusColor = devis.devis_status === 'Gagné' ? '#0f6e56'
                                                    : devis.devis_status === 'Perdu' ? '#a52d2d'
                                                    : devis.devis_status === 'Annulé' ? '#8a95a5'
                                                    : devis.devis_status === 'Discussion' ? '#0a5085'
                                                    : devis.devis_status === 'Envoyé' ? '#b06e2a'
                                                    : 'var(--tw-slate)';
                                  return (
                                    <div key={devis.id}
                                      onClick={() => handleEditDevis(devis)}
                                      style={{padding:'12px 14px',background:'white',borderRadius:'8px',border:'0.5px solid var(--tw-border)',cursor:'pointer',transition:'background .15s'}}
                                      onMouseEnter={(e) => { e.currentTarget.style.background='#fafaf9'; }}
                                      onMouseLeave={(e) => { e.currentTarget.style.background='white'; }}
                                    >
                                      {/* Ligne 1 : nom + date + status + actions */}
                                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'10px',marginBottom:'10px'}}>
                                        <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',minWidth:0,flex:1}}>
                                          <span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#0f6e56',flexShrink:0}} title="Devis"></span>
                                          <span style={{fontSize:'12px',fontWeight:500,color:'var(--tw-ink)',fontFamily:'var(--mono)'}}>{devis.devis_name || 'Sans nom'}</span>
                                          {devis.quote_date && (
                                            <span style={{fontSize:'11px',color:'var(--tw-muted)'}}>{new Date(devis.quote_date).toLocaleDateString('fr-FR')}</span>
                                          )}
                                          <span style={{fontSize:'11px',fontWeight:500,padding:'2px 8px',borderRadius:'10px',background:'var(--tw-bg)',color:statusColor,border:'0.5px solid var(--tw-border)'}}>{devis.chance_percent || 0}% {devis.devis_status || ''}</span>
                                          {devis.remplace_par_devis_id && (
                                            <span style={{fontSize:'10px',fontWeight:600,padding:'2px 8px',borderRadius:'10px',background:'#fde8e8',color:'#a52d2d'}} title="Ce devis a été annulé et remplacé">⊘ Remplacé par devis n°{devis.remplace_par_devis_id}</span>
                                          )}
                                          {devis.remplace_devis_id && (
                                            <span style={{fontSize:'10px',fontWeight:600,padding:'2px 8px',borderRadius:'10px',background:'#e6f0f7',color:'#0a5085'}} title="Ce devis remplace un devis annulé">↻ Remplace devis n°{devis.remplace_devis_id}</span>
                                          )}
                                        </div>
                                        <div style={{display:'flex',alignItems:'center',gap:'2px'}} onClick={(e) => e.stopPropagation()}>
                                          {devis.pdf_url ? (
                                            <>
                                              <IconBtn title="Télécharger le PDF" color="var(--tw-teal)" hoverColor="var(--tw-teal)" hoverBg="var(--tw-teal-light)"
                                                onClick={async (e) => {
                                                  e.stopPropagation();
                                                  try {
                                                    const res = await fetch(`${API_URL}/devis/${devis.id}/download-pdf`, {
                                                      headers: { 'Authorization': `Bearer ${user.token}` }
                                                    });
                                                    if (res.ok) {
                                                      const blob = await res.blob();
                                                      const url = window.URL.createObjectURL(blob);
                                                      window.open(url, '_blank');
                                                    }
                                                  } catch (err) {
                                                    window.showToast({title:'Erreur: ' + err.message, type:'error'});
                                                  }
                                                }}
                                              >{I(ICONS.download, 13)}</IconBtn>
                                            </>
                                          ) : (
                                            <>
                                              <input type="file" accept="application/pdf,.pdf" id={`pdf-upload-${devis.id}`} style={{display:'none'}}
                                                onChange={async (e) => {
                                                  const file = e.target.files?.[0];
                                                  if (file) await handleUploadDevisPdfDirect(devis.id, file);
                                                  e.target.value = '';
                                                }}
                                              />
                                              <IconBtn title="Joindre un PDF"
                                                onClick={(e) => { e.stopPropagation(); document.getElementById(`pdf-upload-${devis.id}`).click(); }}
                                              >{I(ICONS.attach, 13)}</IconBtn>
                                            </>
                                          )}
                                          <IconBtn title="Modifier le devis" onClick={() => handleEditDevis(devis)}>{I(ICONS.edit, 13)}</IconBtn>
                                          <IconBtn title="Supprimer le devis" danger onClick={() => handleDeleteDevis(devis.id)}>{I(ICONS.trash, 13)}</IconBtn>
                                        </div>
                                      </div>
                                      {/* Barre de progression du statut : boutons cliquables pour faire avancer le devis */}
                                      {devis.devis_status !== 'Annulé' && (
                                      <div style={{display:'flex',alignItems:'center',gap:'4px',marginBottom:'10px',flexWrap:'wrap'}} onClick={(e) => e.stopPropagation()}>
                                        {['En cours','Envoyé','Discussion','Gagné','Perdu'].map((etape, idx) => {
                                          const isActive = (devis.devis_status || 'En cours') === etape;
                                          const etapeColor = etape === 'Gagné' ? '#0f6e56' : etape === 'Perdu' ? '#a52d2d' : etape === 'Discussion' ? '#0a5085' : etape === 'Envoyé' ? '#b06e2a' : 'var(--tw-slate)';
                                          return (
                                            <React.Fragment key={etape}>
                                              {/* Avant Gagné : bouton Annuler & remplacer (sauf si déjà remplacé) */}
                                              {etape === 'Gagné' && !devis.remplace_par_devis_id && (
                                                <button
                                                  onClick={(e) => { e.stopPropagation(); handleAnnulerRemplacer(devis.id); }}
                                                  title="Annuler ce devis et créer un devis de remplacement"
                                                  style={{
                                                    fontSize:'10px', fontWeight:500,
                                                    padding:'4px 9px', borderRadius:'6px', cursor:'pointer',
                                                    border:'1px solid var(--tw-border)', background:'white', color:'var(--tw-muted)',
                                                    transition:'all .12s', whiteSpace:'nowrap', display:'inline-flex', alignItems:'center', gap:'4px'
                                                  }}
                                                  onMouseEnter={(e) => { e.currentTarget.style.borderColor = 'var(--tw-slate)'; e.currentTarget.style.color = 'var(--tw-slate)'; }}
                                                  onMouseLeave={(e) => { e.currentTarget.style.borderColor = 'var(--tw-border)'; e.currentTarget.style.color = 'var(--tw-muted)'; }}
                                                >↻ Annuler &amp; remplacer</button>
                                              )}
                                              <button
                                                onClick={(e) => { e.stopPropagation(); if (!isActive) handleQuickDevisStatus(devis.id, etape); }}
                                                title={isActive ? 'Statut actuel' : 'Passer à : ' + etape}
                                                style={{
                                                  fontSize:'10px', fontWeight: isActive ? 700 : 500,
                                                  padding:'4px 9px', borderRadius:'6px', cursor: isActive ? 'default' : 'pointer',
                                                  border: '1px solid ' + (isActive ? etapeColor : 'var(--tw-border)'),
                                                  background: isActive ? etapeColor : 'white',
                                                  color: isActive ? 'white' : 'var(--tw-muted)',
                                                  transition:'all .12s', whiteSpace:'nowrap'
                                                }}
                                                onMouseEnter={(e) => { if (!isActive) { e.currentTarget.style.borderColor = etapeColor; e.currentTarget.style.color = etapeColor; } }}
                                                onMouseLeave={(e) => { if (!isActive) { e.currentTarget.style.borderColor = 'var(--tw-border)'; e.currentTarget.style.color = 'var(--tw-muted)'; } }}
                                              >{etape}</button>
                                            </React.Fragment>
                                          );
                                        })}
                                      </div>
                                      )}
                                      {/* Ligne 2 : 4 mini-cartes pour les montants */}
                                      <div style={{display:'grid',gridTemplateColumns:'repeat(4, 1fr)',gap:'10px',paddingTop:'10px',borderTop:'0.5px solid var(--tw-border)'}}>
                                        <div>
                                          <p style={{margin:0,fontSize:'10px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:500}}>Setup</p>
                                          <p style={{margin:'2px 0 0',fontSize:'13px',fontWeight:500,color:'var(--tw-ink)',fontVariantNumeric:'tabular-nums'}}>{(devis.setup_amount||0).toLocaleString('fr-FR', {maximumFractionDigits:0})} €</p>
                                        </div>
                                        <div>
                                          <p style={{margin:0,fontSize:'10px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:500}}>Abo. mensuel</p>
                                          <p style={{margin:'2px 0 0',fontSize:'13px',fontWeight:500,color:'var(--tw-ink)',fontVariantNumeric:'tabular-nums'}}>{(devis.monthly_amount||0).toLocaleString('fr-FR', {maximumFractionDigits:0})} €<span style={{fontSize:'10px',color:'var(--tw-muted)',fontWeight:400}}>/mois</span></p>
                                        </div>
                                        <div>
                                          <p style={{margin:0,fontSize:'10px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:500}}>Abo. annuel</p>
                                          <p style={{margin:'2px 0 0',fontSize:'13px',fontWeight:500,color:'var(--tw-ink)',fontVariantNumeric:'tabular-nums'}}>{(devis.annual_amount||0).toLocaleString('fr-FR', {maximumFractionDigits:0})} €<span style={{fontSize:'10px',color:'var(--tw-muted)',fontWeight:400}}>/an</span></p>
                                        </div>
                                        <div>
                                          <p style={{margin:0,fontSize:'10px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.4px',fontWeight:500}}>Formation</p>
                                          <p style={{margin:'2px 0 0',fontSize:'13px',fontWeight:500,color:'var(--tw-ink)',fontVariantNumeric:'tabular-nums'}}>{(devis.training_amount||0).toLocaleString('fr-FR', {maximumFractionDigits:0})} €</p>
                                        </div>
                                      </div>
                                      {/* Motif de perte : visible uniquement si le devis est Perdu */}
                                      {devis.devis_status === 'Perdu' && (
                                        <div style={{marginTop:'10px',paddingTop:'10px',borderTop:'0.5px solid var(--tw-border)'}} onClick={(e) => e.stopPropagation()}>
                                          <label style={{display:'block',fontSize:'10px',fontWeight:600,color:'#a52d2d',textTransform:'uppercase',letterSpacing:'.4px',marginBottom:'5px'}}>Motif de la perte</label>
                                          <MotifPerteField
                                            devisId={devis.id}
                                            affaireId={devis.affaire_id}
                                            initialValue={devis.motif_perte || ''}
                                            onSave={handleSaveMotifPerte}
                                          />
                                        </div>
                                      )}
                                    </div>
                                  );
                                })}
                              </div>
                            )}

                            {/* ========== ACTIONS DE L'AFFAIRE ========== */}
                            <div style={{marginTop:'18px'}}>
                              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                                <p style={{margin:0,fontSize:'11px',color:'var(--tw-muted)',textTransform:'uppercase',letterSpacing:'.5px',fontWeight:500}}>Actions de l'affaire · {affairesActions[affaire.id]?.length || 0}</p>
                                <button onClick={() => handleOpenActionAffaireForm(affaire.id)}
                                  style={{background:'white',border:'0.5px solid var(--tw-border)',padding:'4px 10px',borderRadius:'6px',fontSize:'11px',color:'var(--tw-slate)',cursor:'pointer',display:'flex',alignItems:'center',gap:'4px',fontFamily:"'Inter',sans-serif"}}
                                  onMouseEnter={(e) => { e.currentTarget.style.background='var(--tw-bg)'; e.currentTarget.style.borderColor='var(--tw-slate)'; }}
                                  onMouseLeave={(e) => { e.currentTarget.style.background='white'; e.currentTarget.style.borderColor='var(--tw-border)'; }}
                                >
                                  {I(ICONS.plus, 10)} Action
                                </button>
                              </div>

                              {(!affairesActions[affaire.id] || affairesActions[affaire.id].length === 0) ? (
                                <div style={{padding:'14px',textAlign:'center',color:'var(--tw-muted)',fontSize:'12px',background:'var(--tw-bg)',borderRadius:'8px',border:'0.5px dashed var(--tw-border)',fontStyle:'italic'}}>
                                  Aucune action planifiée pour cette affaire
                                </div>
                              ) : (
                                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                                  {[...affairesActions[affaire.id]].sort((a,b) => new Date(b.planned_date||0) - new Date(a.planned_date||0)).map(action => {
                                    const isExpanded = expandedActionId === action.id;
                                    return (
                                      <div key={action.id} style={{
                                        background: action.completed ? '#f6faf6' : 'white',
                                        borderRadius:'8px',
                                        border:'0.5px solid ' + (action.completed ? '#cfe5d2' : 'var(--tw-border)'),
                                        overflow:'hidden'
                                      }}>
                                        <div onClick={() => setExpandedActionId(isExpanded ? null : action.id)}
                                          style={{padding:'8px 12px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'8px',cursor:'pointer'}}>
                                          <div style={{flex:1,display:'flex',alignItems:'center',gap:'10px',minWidth:0}}>
                                            <input type="checkbox" checked={action.completed || false}
                                              onChange={(e) => { e.stopPropagation(); handleToggleActionAffaire(action.id, e.target.checked, affaire.id); }}
                                              onClick={(e) => e.stopPropagation()}
                                              style={{cursor:'pointer',accentColor:'var(--tw-teal)'}}
                                            />
                                            <div style={{flex:1,minWidth:0}}>
                                              <div style={{fontSize:'12px',fontWeight:500,color:action.completed ? 'var(--tw-muted)' : 'var(--tw-ink)',textDecoration:action.completed ? 'line-through' : 'none',display:'flex',alignItems:'center',gap:'8px'}}>
                                                <span style={{width:'7px',height:'7px',borderRadius:'50%',background:'#b06e2a',flexShrink:0}} title="Action"></span>
                                                <span>{action.action_type}</span>
                                                <span style={{fontWeight:400,color:'var(--tw-slate)',marginLeft:'8px'}}>· {new Date(action.planned_date).toLocaleDateString('fr-FR')}</span>
                                                {(action.actor || action.contact) && (
                                                  <span style={{fontWeight:400,color:'var(--tw-muted)',marginLeft:'8px'}}>
                                                    {action.actor && <span>{action.actor}</span>}
                                                    {action.actor && action.contact && <span> → </span>}
                                                    {action.contact && <span style={{color:'var(--tw-teal)'}}>{action.contact}</span>}
                                                  </span>
                                                )}
                                              </div>
                                            </div>
                                          </div>
                                          <IconBtn title="Supprimer l'action" danger onClick={(e) => { e.stopPropagation(); handleDeleteActionAffaire(action.id, affaire.id); }}>{I(ICONS.trash, 13)}</IconBtn>
                                        </div>

                                        {isExpanded && (
                                          <div style={{padding:'8px 12px',borderTop:'0.5px solid ' + (action.completed ? '#cfe5d2' : 'var(--tw-border)'),background: action.completed ? '#fbfdfb' : '#fafaf9'}}>
                                            {(action.actor || action.contact) && (
                                              <div style={{fontSize:'11px',color:'var(--tw-slate)',marginBottom:'4px'}}>
                                                {action.actor && <span><span style={{color:'var(--tw-muted)'}}>De :</span> {action.actor}</span>}
                                                {action.actor && action.contact && <span> · </span>}
                                                {action.contact && <span><span style={{color:'var(--tw-muted)'}}>À :</span> {action.contact}</span>}
                                              </div>
                                            )}
                                            {action.completed_note && (
                                              <div style={{fontSize:'11px',color:'var(--tw-slate)',fontStyle:'italic'}}>
                                                <span style={{color:'var(--tw-muted)',fontStyle:'normal'}}>Commentaire :</span> {action.completed_note}
                                              </div>
                                            )}
                                            {!action.actor && !action.contact && !action.completed_note && (
                                              <div style={{fontSize:'11px',color:'var(--tw-muted)',fontStyle:'italic'}}>Aucun détail supplémentaire</div>
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div style={{padding:'24px',textAlign:'center',color:'var(--tw-muted)',fontSize:'13px',background:'var(--tw-bg)',borderRadius:'10px',border:'0.5px dashed var(--tw-border)',fontStyle:'italic'}}>Aucune affaire pour cette société</div>
              )}
            </div>
            );
          })()}
          
          {/* ========== MODAL AFFAIRE ========== */}
          {showAffaireForm && (
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
              zIndex: 9999
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '25px',
                borderRadius: '12px',
                maxWidth: '500px',
                width: '90%',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
              }}>
                <h3 style={{marginTop: 0, marginBottom: '20px', color: 'var(--primary)'}}>
                  {editingAffaireId ? 'Modifier l\'affaire' : 'Nouvelle affaire'}
                </h3>
                
                <div style={{marginBottom: '15px'}}>
                  <label style={{display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold'}}>Nom de l'affaire *</label>
                  <input
                    type="text"
                    placeholder="Ex: Migration ERP, Changement système..."
                    value={affaireFormData.nom_affaire}
                    onChange={(e) => setAffaireFormData({...affaireFormData, nom_affaire: e.target.value})}
                    style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', fontSize: '14px'}}
                  />
                </div>

                <div style={{marginBottom: '15px'}}>
                  <label style={{display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold'}}>Description</label>
                  <textarea
                    placeholder="Description de l'affaire..."
                    value={affaireFormData.description}
                    onChange={(e) => setAffaireFormData({...affaireFormData, description: e.target.value})}
                    style={{width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', boxSizing: 'border-box'}}
                  />
                </div>

                <div style={{marginBottom: '20px'}}>
                  <label style={{display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold'}}>Statut</label>
                  <select
                    value={affaireFormData.statut_global}
                    onChange={(e) => setAffaireFormData({...affaireFormData, statut_global: e.target.value})}
                    style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', fontSize: '14px'}}
                  >
                    <option value="En cours">En cours</option>
                    <option value="Gagné">Gagné</option>
                    <option value="Perdu">Perdu</option>
                  </select>
                </div>

                <div style={{display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                  <button
                    type="button"
                    onClick={() => {
                      setShowAffaireForm(false);
                      setEditingAffaireId(null);
                      setAffaireFormData({ nom_affaire: '', description: '', statut_global: 'En cours' });
                    }}
                    style={{
                      backgroundColor: '#999',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveAffaire}
                    style={{
                      backgroundColor: 'var(--primary)',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    💾 Enregistrer
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* ========== MODAL ACTION AFFAIRE ========== */}
          {showActionAffaireForm && (
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
              zIndex: 9999
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '25px',
                borderRadius: '12px',
                maxWidth: '600px',
                width: '90%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
              }}>
                <h4 style={{marginTop: 0, marginBottom: '20px', color: '#333'}}>Nouvelle activité</h4>
                
                <div style={{display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap'}}>
                  <select
                    value={actionAffaireFormData.action_type}
                    onChange={(e) => setActionAffaireFormData({...actionAffaireFormData, action_type: e.target.value})}
                    style={{flex: 1, minWidth: '150px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}
                  >
                    {ACTION_TYPES.map(t => <option key={t}>{t}</option>)}
                  </select>
                  <input
                    type="date"
                    value={actionAffaireFormData.action_date}
                    onChange={(e) => setActionAffaireFormData({...actionAffaireFormData, action_date: e.target.value})}
                    style={{flex: 1, minWidth: '150px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}
                  />
                </div>

                <div style={{display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap'}}>
                  <select
                    value={actionAffaireFormData.action_actor}
                    onChange={(e) => setActionAffaireFormData({...actionAffaireFormData, action_actor: e.target.value})}
                    style={{flex: 1, minWidth: '150px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}
                  >
                    <option value="">-- De (Acteur) --</option>
                    <option>Christian</option>
                    <option>Roger</option>
                    <option>Frédéric</option>
                  </select>
                  <select
                    value={actionAffaireFormData.action_contact}
                    onChange={(e) => setActionAffaireFormData({...actionAffaireFormData, action_contact: e.target.value})}
                    style={{flex: 1, minWidth: '150px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px'}}
                  >
                    <option value="">-- À (Contact) --</option>
                    <option value="Interne">Interne</option>
                    {interlocuteurs && interlocuteurs.length > 0 ? (
                      interlocuteurs.map(interlocuteur => (
                        <option key={interlocuteur.id} value={displayName(interlocuteur)}>
                          {displayName(interlocuteur)} {interlocuteur.fonction && `(${interlocuteur.fonction})`}
                        </option>
                      ))
                    ) : (
                      <option value="" disabled>Aucun contact disponible</option>
                    )}
                  </select>
                </div>

                <textarea
                  placeholder="Commentaire (optionnel)..."
                  value={actionAffaireFormData.action_comment}
                  onChange={(e) => setActionAffaireFormData({...actionAffaireFormData, action_comment: e.target.value})}
                  style={{
                    padding: '11px 12px',
                    border: '1px solid #d0d0d0',
                    borderRadius: '6px',
                    minHeight: '80px',
                    fontFamily: 'inherit',
                    fontSize: '13px',
                    lineHeight: '1.5',
                    marginBottom: '15px',
                    width: '100%',
                    boxSizing: 'border-box',
                    resize: 'vertical'
                  }}
                />

                <div style={{display: 'flex', gap: '10px', justifyContent: 'flex-end'}}>
                  <button
                    onClick={() => {
                      setShowActionAffaireForm(false);
                      setActionAffaireFormData({
                        action_type: 'Appel',
                        action_date: new Date().toISOString().split('T')[0],
                        action_actor: '',
                        action_contact: '',
                        action_comment: ''
                      });
                    }}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#ccc',
                      color: '#333',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Annuler
                  </button>
                  <button
                    onClick={handleSaveActionAffaire}
                    style={{
                      padding: '10px 20px',
                      backgroundColor: '#10a0dc',
                      color: 'white',
                      border: 'none',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    ✓ Ajouter
                  </button>
                </div>
              </div>
            </div>
          )}

          {/* Modale choix type de devis */}
          {showDevisTypeModal && (
            <div style={{position:'fixed',top:0,left:0,right:0,bottom:0,backgroundColor:'rgba(0,0,0,0.5)',display:'flex',justifyContent:'center',alignItems:'center',zIndex:9999}}>
              <div style={{backgroundColor:'white',borderRadius:'14px',padding:'28px',maxWidth:'420px',width:'90%',boxShadow:'0 10px 40px rgba(0,0,0,0.25)'}}>
                <h3 style={{marginTop:0,marginBottom:'6px',color:'#003366',fontSize:'1.1rem'}}>Nouveau devis</h3>
                <p style={{color:'var(--text-2)',fontSize:'0.85rem',marginBottom:'20px'}}>Quel type de devis souhaitez-vous créer ?</p>
                <div style={{display:'flex',flexDirection:'column',gap:'12px'}}>
                  <button onClick={handleAddDevisTexasWin}
                    style={{padding:'14px 18px',backgroundColor:'#1a9fdb',color:'white',border:'none',borderRadius:'10px',cursor:'pointer',fontSize:'0.95rem',fontWeight:'700',textAlign:'left',display:'flex',alignItems:'center',gap:'12px'}}>
                    <span style={{fontSize:'1.4rem'}}>📦</span>
                    <div>
                      <div>Devis TexasWin</div>
                      <div style={{fontSize:'0.75rem',fontWeight:'400',opacity:0.85}}>Configurateur modules, abonnements, formation</div>
                    </div>
                  </button>
                  <button onClick={handleAddDevisLibre}
                    style={{padding:'14px 18px',backgroundColor:'white',color:'#003366',border:'2px solid #c8dede',borderRadius:'10px',cursor:'pointer',fontSize:'0.95rem',fontWeight:'700',textAlign:'left',display:'flex',alignItems:'center',gap:'12px'}}>
                    <span style={{fontSize:'1.4rem'}}>📝</span>
                    <div>
                      <div>Devis libre</div>
                      <div style={{fontSize:'0.75rem',fontWeight:'400',color:'var(--text-2)'}}>Développement, matériel, prestation ponctuelle</div>
                    </div>
                  </button>
                </div>
                <button onClick={() => setShowDevisTypeModal(false)}
                  style={{marginTop:'16px',width:'100%',padding:'8px',border:'none',background:'none',color:'var(--text-2)',cursor:'pointer',fontSize:'0.85rem'}}>
                  Annuler
                </button>
              </div>
            </div>
          )}

          {showDevisForm && (
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
              zIndex: 9999
            }}>
              <div style={{
                backgroundColor: 'white',
                padding: '25px',
                borderRadius: '12px',
                maxWidth: '900px',
                width: '90%',
                maxHeight: '90vh',
                overflow: 'auto',
                boxShadow: '0 10px 40px rgba(0,0,0,0.3)'
              }}>
                <h3 style={{marginTop: 0, marginBottom: '20px', color: '#10a0dc'}}>
                  {editingDevisId ? 'Modifier le devis' : 'Nouveau devis'}
                </h3>
                
                {/* Nom du devis */}
                <div style={{marginBottom: '15px'}}>
                  <label style={{display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold'}}>Nom du devis</label>
                  <input
                    type="text"
                    placeholder="Ex: Devis Migration ERP, Devis Formation..."
                    value={devisFormData.devis_name || ''}
                    onChange={(e) => setDevisFormData({...devisFormData, devis_name: e.target.value})}
                    style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', fontSize: '14px'}}
                  />
                </div>

                {/* PDF existant */}
                {editingDevis?.pdf_url && (
                  <div style={{marginBottom: '15px', padding: '12px', backgroundColor: '#e8f4f5', borderRadius: '6px', border: '1px solid var(--primary)'}}>
                    <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center'}}>
                      <div style={{flex: 1}}>
                        <div style={{fontSize: '13px', fontWeight: 'bold', color: 'var(--text)', marginBottom: '4px'}}>📄 PDF joint</div>
                        <div style={{fontSize: '12px', color: 'var(--text-2)'}}>
                          {editingDevis.pdf_url.split('/').pop()}
                        </div>
                      </div>
                      <div style={{display: 'flex', gap: '8px'}}>
                        <button
                          type="button"
                          onClick={async () => {
                            try {
                              const res = await fetch(`${API_URL}/devis/${editingDevis.id}/download-pdf`, {
                                headers: { 'Authorization': `Bearer ${user.token}` }
                              });
                              if (res.ok) {
                                const blob = await res.blob();
                                const url = window.URL.createObjectURL(blob);
                                window.open(url, '_blank');
                              }
                            } catch (err) {
                              window.showToast({title:'Erreur: ' + err.message, type:'error'});
                            }
                          }}
                          style={{padding: '6px 12px', backgroundColor: 'var(--primary)', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'}}
                        >
                          📄 Télécharger
                        </button>
                        <button
                          type="button"
                          onClick={async () => {
                            if (window.confirm('Supprimer le PDF de ce devis ?')) {
                              await handleDeleteDevisPDF(editingDevis.id);
                              // Rafraîchir pour masquer la section
                              const updatedDevisList = await fetch(`${API_URL}/prospects/${selectedProspect.id}/devis`, {
                                headers: { 'Authorization': `Bearer ${user.token}` }
                              }).then(r => r.json());
                              const updatedDevis = updatedDevisList.find(d => d.id === editingDevis.id);
                              if (updatedDevis) {
                                handleEditDevis(updatedDevis);
                              }
                            }
                          }}
                          style={{padding: '6px 12px', backgroundColor: '#dc3545', color: 'white', border: 'none', borderRadius: '4px', cursor: 'pointer', fontSize: '12px', fontWeight: '600'}}
                        >
                          🗑️ Supprimer
                        </button>
                      </div>
                    </div>
                  </div>
                )}

                {/* Stepper statut devis */}
                <div style={{marginBottom: '20px'}}>
                  <label style={{display: 'block', marginBottom: '10px', fontSize: '13px', fontWeight: 'bold'}}>Statut du devis</label>

                  {/* Select statut */}
                  <select
                    value={devisFormData.devis_status || 'En cours'}
                    onChange={(e) => {
                      const status = e.target.value;
                      const probMap = {'En cours': 20, 'Envoyé': 30, 'Discussion': 60, 'Gagné': 100, 'Perdu': 0};
                      const newProb = probMap[status] !== undefined ? probMap[status] : devisFormData.chance_percent;
                      setDevisFormData({...devisFormData, devis_status: status, chance_percent: newProb});
                    }}
                    style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', fontSize: '14px'}}
                  >
                    <option value="En cours">En cours</option>
                    <option value="Envoyé">Envoyé</option>
                    <option value="Discussion">Discussion</option>
                    <option value="Gagné">Gagné</option>
                    <option value="Perdu">Perdu</option>
                  </select>
                </div>

                {/* Date, montants, probabilité */}
                <div style={{display: 'flex', gap: '10px', marginBottom: '15px', flexWrap: 'wrap'}}>
                  <div style={{flex: '1 1 140px'}}>
                    <label style={{display: 'block', marginBottom: '5px', fontSize: '13px'}}>Date</label>
                    <input
                      type="date"
                      value={devisFormData.quote_date}
                      onChange={(e) => setDevisFormData({...devisFormData, quote_date: e.target.value})}
                      style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%'}}
                    />
                  </div>
                  {affairesList.length > 0 && (
                    <div style={{flex: '1 1 200px'}}>
                      <label style={{display: 'block', marginBottom: '5px', fontSize: '13px'}}>Affaire</label>
                      <select
                        value={selectedAffaireId || ''}
                        onChange={(e) => setSelectedAffaireId(e.target.value ? parseInt(e.target.value) : null)}
                        style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%'}}
                      >
                        <option value="">-- Aucune affaire --</option>
                        {affairesList.map(aff => (
                          <option key={aff.id} value={aff.id}>{aff.nom_affaire}</option>
                        ))}
                      </select>
                    </div>
                  )}
                  <div style={{flex: '1 1 120px'}}>
                    <label style={{display: 'block', marginBottom: '5px', fontSize: '13px'}}>Setup</label>
                    <input
                      type="number"
                      value={devisFormData.setup_amount}
                      onChange={(e) => setDevisFormData({...devisFormData, setup_amount: parseFloat(e.target.value) || 0})}
                      style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%'}}
                    />
                  </div>
                  <div style={{flex: '1 1 120px'}}>
                    <label style={{display: 'block', marginBottom: '5px', fontSize: '13px'}}>Abo. (M)</label>
                    <input
                      type="number"
                      value={devisFormData.monthly_amount}
                      onChange={(e) => setDevisFormData({...devisFormData, monthly_amount: parseFloat(e.target.value) || 0})}
                      style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%'}}
                    />
                  </div>
                  <div style={{flex: '1 1 120px'}}>
                    <label style={{display: 'block', marginBottom: '5px', fontSize: '13px'}}>Abo. (A)</label>
                    <input
                      type="number"
                      value={devisFormData.annual_amount}
                      onChange={(e) => setDevisFormData({...devisFormData, annual_amount: parseFloat(e.target.value) || 0})}
                      style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%'}}
                    />
                  </div>
                  <div style={{flex: '1 1 120px'}}>
                    <label style={{display: 'block', marginBottom: '5px', fontSize: '13px'}}>Formation</label>
                    <input
                      type="number"
                      value={devisFormData.training_amount}
                      onChange={(e) => setDevisFormData({...devisFormData, training_amount: parseFloat(e.target.value) || 0})}
                      style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%'}}
                    />
                  </div>
                  <div style={{flex: '1 1 100px'}}>
                    <label style={{display: 'block', marginBottom: '5px', fontSize: '13px'}}>Proba.</label>
                    <select
                      value={devisFormData.chance_percent}
                      onChange={(e) => setDevisFormData({...devisFormData, chance_percent: parseInt(e.target.value) || 0})}
                      style={{padding: '8px', border: '1px solid #ddd', borderRadius: '4px', width: '100%'}}
                    >
                      <option value="0">0%</option>
                      <option value="20">20%</option>
                      <option value="40">40%</option>
                      <option value="60">60%</option>
                      <option value="80">80%</option>
                      <option value="100">100%</option>
                    </select>
                  </div>
                </div>

                {/* Commentaire */}
                <div style={{marginBottom: '15px'}}>
                  <label style={{display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold'}}>Commentaire</label>
                  <textarea
                    placeholder="Notes sur ce devis..."
                    value={devisFormData.comment}
                    onChange={(e) => setDevisFormData({...devisFormData, comment: e.target.value})}
                    style={{width: '100%', minHeight: '60px', padding: '8px', border: '1px solid #ddd', borderRadius: '4px', resize: 'vertical', boxSizing: 'border-box'}}
                  />
                </div>

                {/* PDF du devis */}
                <div style={{marginBottom: '15px'}}>
                  <label style={{display: 'block', marginBottom: '5px', fontSize: '13px', fontWeight: 'bold'}}>PDF du devis</label>
                  <input
                    type="file"
                    accept=".pdf"
                    onChange={(e) => setDevisPdfFile(e.target.files[0])}
                    style={{padding: '6px', border: '1px solid #ddd', borderRadius: '4px', width: '100%', fontSize: '13px'}}
                  />
                  {devisPdfFile && <div style={{fontSize: '12px', color: '#666', marginTop: '5px'}}>✓ {devisPdfFile.name}</div>}
                </div>

      

                {/* Boutons */}
                <div style={{display: 'flex', gap: '10px', marginTop: '20px'}}>
                  <button
                    type="button"
                    onClick={handleSaveDevis}
                    disabled={isUploadingDevisPdf}
                    style={{
                      backgroundColor: '#10a0dc',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      cursor: isUploadingDevisPdf ? 'not-allowed' : 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold',
                      opacity: isUploadingDevisPdf ? 0.5 : 1
                    }}
                  >
                    {isUploadingDevisPdf ? '⏳ Enregistrement...' : '💾 Enregistrer'}
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      setShowDevisForm(false);
                      setEditingDevisId(null);
                      setEditingDevis(null);
                      setDevisPdfFile(null);
                    }}
                    style={{
                      backgroundColor: '#999',
                      color: 'white',
                      border: 'none',
                      padding: '10px 20px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px'
                    }}
                  >
                    Annuler
                  </button>
                </div>
              </div>
            </div>
          )}
          
          {/* Historique des statuts */}
          {statusHistory.length > 0 && (
            <div style={styles.statusHistoryBox}>
              <h4 style={{marginTop: 0}}>Historique des statuts</h4>
              {statusHistory.map((history, idx) => (
                <div key={idx} style={styles.historyItem}>
                  <span style={{fontWeight: 'bold', color: '#333'}}>{history.old_status}</span>
                  <span style={{margin: '0 8px', color: '#999'}}>→</span>
                  <span style={{fontWeight: 'bold', color: '#0066cc'}}>{history.new_status}</span>
                  <span style={{fontSize: '12px', color: '#999', marginLeft: '10px'}}>
                    {new Date(history.status_date).toLocaleDateString()}
                  </span>
                  {history.notes && <div style={{fontSize: '12px', color: '#666', marginTop: '5px'}}>📝 {history.notes}</div>}
                </div>
              ))}
            </div>
          )}
          
        </div>
      );
    }

    
    // ================== STYLES ==================


    // ================== LANCEMENT ==================
