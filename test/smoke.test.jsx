import { describe, it, expect } from 'vitest'
import { render } from '@testing-library/react'

// Smoke tests des écrans authentifiés : on vérifie qu'ils se rendent SANS planter.
// C'est exactement la classe de bug qui nous a touchés en prod (symbole non défini
// au rendu : ReactDOM.createPortal, API_URL manquant dans Settings…), invisible au
// simple montage de l'écran de login.

import { ToastProvider } from '../src/components/Toast.jsx'
import { Header } from '../src/components/Header.jsx'
import { NavTabBar } from '../src/components/NavTabBar.jsx'
import { Settings } from '../src/components/Settings.jsx'
import { DashboardConsultant } from '../src/components/DashboardConsultant.jsx'
import { ListesView } from '../src/components/ListesView.jsx'
import { Dashboard } from '../src/components/Dashboard.jsx'
import { RecapModal } from '../src/components/RecapModal.jsx'
import { MotifPerteField } from '../src/components/MotifPerteField.jsx'
import { LoginForm } from '../src/components/LoginForm.jsx'
import { ModulesDisplay } from '../src/components/ModulesDisplay.jsx'
import { ActionCompleteModal } from '../src/components/ActionCompleteModal.jsx'
import { SuspectsNonAttribuesPanel } from '../src/components/SuspectsNonAttribuesPanel.jsx'
import { CommercialEditor } from '../src/components/CommercialEditor.jsx'
import { AttributionView } from '../src/components/AttributionView.jsx'
import { CampagnesPage } from '../src/components/Campagnes.jsx'
import { KanbanView } from '../src/components/KanbanView.jsx'

const API_URL = '/api'
const user = { id: 1, name: 'Christian', token: 'tok', role: 'admin', email: 'c@texaswin.fr' }
const noop = () => {}

// Chaque entrée : [nom, élément React à rendre]. Les composants à effets (fetch au
// montage) s'appuient sur le mock global de fetch défini dans test/setup.js.
const cases = [
  ['ToastProvider', <ToastProvider><div>contenu</div></ToastProvider>],
  ['Header', (
    <Header
      user={user} prospects={[]} isDashboard={true}
      onLogout={noop} onDashboard={noop} onSuivi={noop} onSettings={noop}
      onAttribution={noop} showAttribution={false} onCampagnes={noop} showCampagnes={false}
      onListe={noop} activeListe={null} onSelectProspect={noop} onNewProspect={noop}
      dueTodayCount={0} onOpenMyActions={noop}
    />
  )],
  ['NavTabBar', <NavTabBar currentView="dashboard" onRestore={noop} onOpenPalette={noop} />],
  ['Settings', <Settings onClose={noop} user={user} />],
  ['DashboardConsultant', (
    <DashboardConsultant
      prospects={[]} user={user} prospectActionsInfo={{}}
      onSelectProspect={noop} onOpenDashboard={noop} API_URL={API_URL}
    />
  )],
  ['ListesView (actions)', <ListesView type="actions" prospects={[]} user={user} API_URL={API_URL} listeCtx={null} />],
  ['ListesView (societes)', <ListesView type="societes" prospects={[]} user={user} API_URL={API_URL} listeCtx={null} />],
  ['ListesView (devis)', <ListesView type="devis" prospects={[]} user={user} API_URL={API_URL} listeCtx={null} />],
  ['Dashboard', (
    <Dashboard
      prospects={[]} selectedCommercial="Tous" onSelectCommercial={noop} onSelectProspect={noop}
      onOpenDashboard={noop} onOpenListe={noop} user={user} API_URL={API_URL}
      prospectActionsInfo={{}} onShowRecap={noop} setShowCompteurModal={noop} setCompteurModalData={noop}
      codesNaf={[]} onRefreshProspects={noop} setFilterCommercial={noop} setFilterStatus={noop} setFilterAttribution={noop}
    />
  )],
  ['RecapModal', (
    <RecapModal commercial="Christian" period="7" prospects={[]} onClose={noop} onNavigate={noop} user={user} API_URL={API_URL} />
  )],
  ['MotifPerteField', <MotifPerteField devisId={1} affaireId={null} initialValue="" onSave={noop} />],
  ['LoginForm', <LoginForm onLogin={noop} />],
  ['ModulesDisplay', <ModulesDisplay prospectId={1} user={user} API_URL={API_URL} />],
  ['ActionCompleteModal', (
    <ActionCompleteModal action={{ id: 1, action_type: 'Appel', planned_date: '2024-01-01' }} prospectId={1} API_URL={API_URL} token="tok" onClose={noop} onCompleted={noop} />
  )],
  ['SuspectsNonAttribuesPanel', <SuspectsNonAttribuesPanel API_URL={API_URL} token="tok" />],
  ['CommercialEditor', (
    <CommercialEditor selectedProspect={{ id: 1, name: 'Acme', assigned_to: 'Christian' }} users={[]} user={user} API_URL={API_URL} onUpdateProspect={noop} />
  )],
  ['AttributionView', (
    <AttributionView prospects={[]} users={[]} user={user} API_URL={API_URL} onClose={noop} onUpdateProspect={noop} />
  )],
  ['CampagnesPage', <CampagnesPage user={user} API_URL={API_URL} onClose={noop} />],
  ['KanbanView', (
    <KanbanView
      prospects={[{ id: 1, name: 'Acme', status: 'Devis', assigned_to: 'Christian' }, { id: 2, name: 'Globex', status: 'Prospection' }]}
      user={user} API_URL={API_URL} onSelectProspect={noop} onStatusChanged={noop}
    />
  )],
]

describe('smoke — rendu des écrans authentifiés', () => {
  it.each(cases)('%s se rend sans planter', (_name, element) => {
    const { unmount } = render(element)
    unmount()
  })
})
