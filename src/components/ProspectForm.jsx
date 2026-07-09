import * as React from 'react';
import { styles } from '../lib/styles.js';
import { calculateTotal, displayName } from '../lib/shared.jsx';

export function ProspectForm({ formData, onFormChange, onSave, onCancel, selectedProspect, user, API_URL, interlocuteurs, showInterlocuteurForm, setShowInterlocuteurForm, interlocuteurForm, setInterlocuteurForm, handleSaveInterlocuteur, handleDeleteInterlocuteur, devisList, showDevisForm, setShowDevisForm, editingDevisId, setEditingDevisId, editingDevis, setEditingDevis, devisFormData, setDevisFormData, devisPdfFile, setDevisPdfFile, isUploadingDevisPdf, handleAddDevis, handleEditDevis, handleSaveDevis, handleDeleteDevis, handleUploadDevisPdf, handleDeleteDevisPDF, codesNaf = [] }) {
      const [pdfFile, setPdfFile] = React.useState(null);
      const [isUploading, setIsUploading] = React.useState(false);

      const handleChange = (field, value) => {
        onFormChange({ ...formData, [field]: value });
      };

      const handleUploadPdf = async () => {
        if (!pdfFile) {
          window.showToast({title:'Sélectionnez un fichier PDF', type:'warning'});
          return;
        }

        setIsUploading(true);
        const data = new FormData();
        data.append('pdf', pdfFile);

        try {
          const res = await fetch(`${API_URL}/prospects/${formData.id}/upload-pdf`, {
            method: 'POST',
            headers: { 'Authorization': `Bearer ${user.token}` },
            body: data
          });

          const result = await res.json();
          if (res.ok) {
            handleChange('pdf_url', result.pdf_url);
            setPdfFile(null);
            window.showToast({title:'PDF uploadé !', type:'success'});
          } else {
            window.showToast({title:'Erreur: ' + result.error, type:'error'});
          }
        } catch (err) {
          window.showToast({title:'Erreur upload: ' + err.message, type:'error'});
        } finally {
          setIsUploading(false);
        }
      };

      const handleDeletePdf = async () => {
        if (!window.confirm('Supprimer le PDF ?')) return;

        try {
          const res = await fetch(`${API_URL}/prospects/${formData.id}/pdf`, {
            method: 'DELETE',
            headers: { 'Authorization': `Bearer ${user.token}` }
          });

          if (res.ok) {
            handleChange('pdf_url', null);
            window.showToast({title:'PDF supprimé !', type:'success'});
          } else {
            window.showToast({title:'Erreur suppression', type:'error'});
          }
        } catch (err) {
          window.showToast({title:'Erreur: ' + err.message, type:'error'});
        }
      };

      const total = calculateTotal(formData);

      return (
        <div style={styles.rightPanel}>
          <div style={styles.formContainer}>
            <h2>{formData.id ? 'Informations Société' : 'Nouvelle Société'}</h2>
            
            <div style={styles.formSection}>
              <h3>Informations générales</h3>
              
              {/* Ligne 1 : Nom | Type société | Commercial */}
              <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
                <input
                  type="text"
                  placeholder="Nom de la société"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  style={{...styles.formInput, flex: 2}}
                />
                <select
                  value={formData.statut_societe || ''}
                  onChange={(e) => handleChange('statut_societe', e.target.value)}
                  style={{...styles.formInput, flex: 1}}
                >
                  <option value="">-- Type Société --</option>
                  <option value="Suspect">Suspect</option>
                  <option value="Prospect">Prospect</option>
                  <option value="Client">Client</option>
                </select>
                <select
                  value={formData.assigned_to}
                  onChange={(e) => handleChange('assigned_to', e.target.value)}
                  style={{...styles.formInput, flex: 1}}
                >
                  <option value="">-- Sélectionne un commercial --</option>
                  <option>Roger</option>
                  <option>Christian</option>
                  <option>Frédéric</option>
                </select>
              </div>
              
              {/* Ligne 2 : SIREN | Code NAF | Adresse | Tél Standard | Site Web */}
              <div style={{display: 'flex', gap: '15px', marginBottom: '15px'}}>
                <input
                  type="text"
                  placeholder="N° SIREN (9 chiffres)"
                  value={formData.siren || ''}
                  onChange={(e) => handleChange('siren', e.target.value.replace(/\D/g, '').slice(0, 9))}
                  style={{...styles.formInput, flex: 1, maxWidth: '140px'}}
                />
                <div style={{display:'flex', flexDirection:'column', flex:1, maxWidth:'260px'}}>
                  <select
                    value={formData.code_naf || ''}
                    onChange={(e) => handleChange('code_naf', e.target.value)}
                    style={{...styles.formInput, width:'100%'}}
                  >
                    <option value="">— Code NAF —</option>
                    {codesNaf.map(c => (
                      <option key={c.code} value={c.code}>{c.code} – {c.libelle} ({c.categorie})</option>
                    ))}
                  </select>
                  {formData.code_naf && (() => {
                    const found = codesNaf.find(c => c.code === formData.code_naf);
                    if (!found) return null;
                    return (
                      <div style={{fontSize:'11px', color:'var(--text-2)', marginTop:'4px', lineHeight:'1.4'}}>
                        <span style={{fontWeight:'600'}}>{found.libelle}</span><br/>
                        <span style={{color:'var(--primary)'}}>{found.categorie}</span>
                      </div>
                    );
                  })()}
                </div>
                <input
                  type="text"
                  placeholder="Adresse de la société"
                  value={formData.adresse}
                  onChange={(e) => handleChange('adresse', e.target.value)}
                  style={{...styles.formInput, flex: 2}}
                />
                <input
                  type="text"
                  placeholder="Tél Standard"
                  value={formData.tel_standard}
                  onChange={(e) => handleChange('tel_standard', e.target.value)}
                  style={{...styles.formInput, flex: 1}}
                />
                <input
                  type="text"
                  placeholder="Site Web"
                  value={formData.website || ''}
                  onChange={(e) => handleChange('website', e.target.value)}
                  style={{...styles.formInput, flex: 1}}
                />
              </div>
              
              {/* Ligne 3 : Marques */}
              <div style={{marginBottom:'15px'}}>
                <div>
                  <div style={{display:'flex', flexWrap:'wrap', gap:'6px', padding:'6px 10px', border:'1px solid #ccc', borderRadius:'6px', minHeight:'36px', alignItems:'center', background:'white'}}>
                    {(formData.marques||[]).map((m,i) => (
                      <span key={i} style={{background:'var(--tw-teal-light)',color:'var(--tw-teal)',padding:'2px 8px',borderRadius:'12px',fontSize:'12px',fontWeight:'600',display:'flex',alignItems:'center',gap:'4px'}}>
                        {m}
                        <span onClick={()=>handleChange('marques',(formData.marques||[]).filter((_,j)=>j!==i))} style={{cursor:'pointer',fontWeight:'700',fontSize:'14px',lineHeight:1}}>×</span>
                      </span>
                    ))}
                    <input
                      type="text"
                      placeholder={formData.marques?.length ? 'Ajouter une marque…' : 'Marques (ex: PABLO, GERARD DAREL)'}
                      style={{border:'none',outline:'none',fontSize:'13px',minWidth:'160px',flex:1,fontFamily:"'Inter',sans-serif"}}
                      onKeyDown={(e) => {
                        if ((e.key === 'Enter' || e.key === ',') && e.target.value.trim()) {
                          e.preventDefault();
                          const val = e.target.value.trim().replace(/,$/, '');
                          if (val && !(formData.marques||[]).includes(val)) {
                            handleChange('marques', [...(formData.marques||[]), val]);
                          }
                          e.target.value = '';
                        }
                      }}
                      onBlur={(e) => {
                        const val = e.target.value.trim().replace(/,$/, '');
                        if (val && !(formData.marques||[]).includes(val)) {
                          handleChange('marques', [...(formData.marques||[]), val]);
                          e.target.value = '';
                        }
                      }}
                    />
                  </div>
                  <div style={{fontSize:'10px',color:'#999',marginTop:'2px'}}>Appuyer sur Entrée ou virgule pour ajouter</div>
                </div>
              </div>

              {/* Solutions en place */}
              <div>
                <textarea
                  placeholder="Solutions en place (une par ligne: FastMag, Shopify, Sage...)"
                  value={formData.solutions_en_place}
                  onChange={(e) => handleChange('solutions_en_place', e.target.value)}
                  style={{...styles.formInput, minHeight: '80px', resize: 'vertical', fontFamily: 'inherit', width: '100%'}}
                />
              </div>
            </div>

            {/* Section Interlocuteurs - Uniquement en mode édition */}
            {selectedProspect && selectedProspect.id && (
              <div style={styles.formSection}>
                <div style={{display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '15px'}}>
                  <h3>👥 Interlocuteurs</h3>
                  <button
                    type="button"
                    onClick={() => {
                      setInterlocuteurForm({
                        id: null,
                        nom: '',
                        fonction: '',
                        email: '',
                        telephone: '',
                        principal: false,
                        decideur: false
                      });
                      setShowInterlocuteurForm(true);
                    }}
                    style={{
                      backgroundColor: '#10a0dc',
                      color: 'white',
                      border: 'none',
                      padding: '8px 16px',
                      borderRadius: '6px',
                      cursor: 'pointer',
                      fontSize: '14px',
                      fontWeight: 'bold'
                    }}
                  >
                    + Ajouter un interlocuteur
                  </button>
                </div>

                {/* Formulaire d'ajout/édition d'interlocuteur */}
                {showInterlocuteurForm && (
                  <div style={{
                    padding: '20px',
                    backgroundColor: '#f9f9f9',
                    borderRadius: '8px',
                    marginBottom: '15px',
                    border: '2px solid #10a0dc'
                  }}>
                    <h4 style={{marginTop: 0, color: '#10a0dc'}}>
                      {interlocuteurForm.id ? 'Modifier l\'interlocuteur' : 'Nouvel interlocuteur'}
                    </h4>
                    <div style={{display: 'grid', gap: '12px'}}>
                      {/* Saisie séparée prénom / nom :
                          - Prénom : optionnel (certains contacts génériques type "contact@"
                            n'ont pas de prénom)
                          - Nom : obligatoire (utilisé pour identifier visuellement le contact)
                          Le champ Nom contient désormais UNIQUEMENT le nom de famille,
                          plus le combo prénom+nom comme c'était le cas historiquement.
                          Les anciens contacts sont splittés automatiquement par migration. */}
                      <div style={{display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '8px'}}>
                        <input
                          type="text"
                          placeholder="Prénom"
                          value={interlocuteurForm.prenom || ''}
                          onChange={(e) => setInterlocuteurForm({...interlocuteurForm, prenom: e.target.value})}
                          style={{...styles.formInput, fontSize: '14px'}}
                        />
                        <input
                          type="text"
                          placeholder="Nom *"
                          value={interlocuteurForm.nom}
                          onChange={(e) => setInterlocuteurForm({...interlocuteurForm, nom: e.target.value})}
                          style={{...styles.formInput, fontSize: '14px'}}
                        />
                      </div>
                      <input
                        type="text"
                        placeholder="Fonction"
                        value={interlocuteurForm.fonction}
                        onChange={(e) => setInterlocuteurForm({...interlocuteurForm, fonction: e.target.value})}
                        style={{...styles.formInput, fontSize: '14px'}}
                      />
                      <input
                        type="email"
                        placeholder="Email"
                        value={interlocuteurForm.email}
                        onChange={(e) => setInterlocuteurForm({...interlocuteurForm, email: e.target.value})}
                        style={{...styles.formInput, fontSize: '14px'}}
                      />
                      <input
                        type="tel"
                        placeholder="Téléphone"
                        value={interlocuteurForm.telephone}
                        onChange={(e) => setInterlocuteurForm({...interlocuteurForm, telephone: e.target.value})}
                        style={{...styles.formInput, fontSize: '14px'}}
                      />
                      <div style={{display: 'flex', gap: '20px'}}>
                        <label style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px'}}>
                          <input
                            type="checkbox"
                            checked={interlocuteurForm.principal}
                            onChange={(e) => setInterlocuteurForm({...interlocuteurForm, principal: e.target.checked})}
                          />
                          <strong>Contact principal</strong>
                        </label>
                        <label style={{display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px'}}>
                          <input
                            type="checkbox"
                            checked={interlocuteurForm.decideur}
                            onChange={(e) => setInterlocuteurForm({...interlocuteurForm, decideur: e.target.checked})}
                          />
                          <strong>Décideur</strong>
                        </label>
                      </div>
                    </div>
                    <div style={{display: 'flex', gap: '10px', marginTop: '15px'}}>
                      <button
                        type="button"
                        onClick={handleSaveInterlocuteur}
                        style={{
                          backgroundColor: '#28a745',
                          color: 'white',
                          border: 'none',
                          padding: '10px 20px',
                          borderRadius: '6px',
                          cursor: 'pointer',
                          fontSize: '14px',
                          fontWeight: 'bold'
                        }}
                      >
                        {interlocuteurForm.id ? 'Modifier' : 'Ajouter'}
                      </button>
                      <button
                        type="button"
                        onClick={() => setShowInterlocuteurForm(false)}
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
                )}

                {/* Liste des interlocuteurs */}
                <div style={{display: 'grid', gap: '10px'}}>
                  {interlocuteurs.length === 0 ? (
                    <div style={{padding: '20px', textAlign: 'center', color: '#999', fontSize: '14px', backgroundColor: '#f9f9f9', borderRadius: '6px'}}>
                      Aucun interlocuteur enregistré
                    </div>
                  ) : (
                    interlocuteurs.map(interlocuteur => (
                      <div
                        key={interlocuteur.id}
                        style={{
                          padding: '15px',
                          backgroundColor: interlocuteur.principal ? '#e8f4f8' : 'white',
                          border: interlocuteur.principal ? '2px solid #10a0dc' : '1px solid #ddd',
                          borderRadius: '8px',
                          position: 'relative'
                        }}
                      >
                        <div style={{display: 'flex', gap: '6px', position: 'absolute', top: '10px', right: '10px'}}>
                          {interlocuteur.principal && (
                            <div style={{
                              backgroundColor: '#10a0dc',
                              color: 'white',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}>
                              ⭐ PRINCIPAL
                            </div>
                          )}
                          {interlocuteur.decideur && (
                            <div style={{
                              backgroundColor: '#d3a002',
                              color: 'white',
                              padding: '4px 10px',
                              borderRadius: '4px',
                              fontSize: '11px',
                              fontWeight: 'bold'
                            }}>
                              👔 DÉCIDEUR
                            </div>
                          )}
                        </div>
                        <div style={{fontSize: '16px', fontWeight: 'bold', color: '#333', marginBottom: '8px', paddingRight: '140px'}}>
                          {displayName(interlocuteur)}
                        </div>
                        {/* Fonction, Email, Tél sur une seule ligne */}
                        <div style={{display: 'flex', gap: '20px', fontSize: '14px', color: '#666', marginBottom: '10px', flexWrap: 'wrap'}}>
                          {interlocuteur.fonction && (
                            <span><strong>Fonction:</strong> {interlocuteur.fonction}</span>
                          )}
                          {interlocuteur.email && (
                            <span><strong>Email:</strong> {interlocuteur.email}</span>
                          )}
                          {interlocuteur.telephone && (
                            <span><strong>Tél:</strong> {interlocuteur.telephone}</span>
                          )}
                        </div>
                        <div style={{display: 'flex', gap: '10px', marginTop: '10px'}}>
                          <button
                            type="button"
                            onClick={() => {
                              setInterlocuteurForm({
                                id: interlocuteur.id,
                                nom: interlocuteur.nom,
                                fonction: interlocuteur.fonction || '',
                                email: interlocuteur.email || '',
                                telephone: interlocuteur.telephone || '',
                                principal: interlocuteur.principal || false,
                                decideur: interlocuteur.decideur || false
                              });
                              setShowInterlocuteurForm(true);
                            }}
                            style={{
                              backgroundColor: '#10a0dc',
                              color: 'white',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            ✏️ Modifier
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDeleteInterlocuteur(interlocuteur.id)}
                            style={{
                              backgroundColor: '#e23b63',
                              color: 'white',
                              border: 'none',
                              padding: '6px 12px',
                              borderRadius: '4px',
                              cursor: 'pointer',
                              fontSize: '13px'
                            }}
                          >
                            🗑️ Supprimer
                          </button>
                        </div>
                      </div>
                    ))
                  )}
                </div>
              </div>
            )}

            {/* Section Interlocuteurs - Information en mode création */}
            {(!selectedProspect || !selectedProspect.id) && (
              <div style={styles.formSection}>
                <h3>👥 Interlocuteurs</h3>
                <div style={{
                  padding: '20px',
                  backgroundColor: '#fff3cd',
                  borderRadius: '8px',
                  border: '1px solid #ffc107',
                  color: '#856404'
                }}>
                  <p style={{margin: 0, fontSize: '14px'}}>
                    ℹ️ <strong>Les interlocuteurs pourront être ajoutés après la création de l'entreprise.</strong>
                  </p>
                  <p style={{margin: '8px 0 0 0', fontSize: '13px', color: '#666'}}>
                    Cliquez sur "Enregistrer" puis sur "🏢 Information Société" pour ajouter des interlocuteurs.
                  </p>
                </div>
              </div>
            )}


            <div style={styles.formActions}>
              <button onClick={onSave} style={styles.saveBtn}>Enregistrer / Activités</button>
              <button onClick={onCancel} style={styles.cancelBtn}>Annuler</button>
            </div>
          </div>
        </div>
      );
    }

    // Champ de saisie du motif de perte d'un devis. État local pour ne pas
    // sauvegarder à chaque frappe. Le motif est obligatoire : le bouton "Valider
    // le motif" est désactivé tant que le champ est vide. Valider déclenche aussi
    // la proposition de passer l'affaire en Perdu (géré par onSave).

