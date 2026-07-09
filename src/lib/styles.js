export const styles = {
      modalLabel: {
        display: 'block', fontSize: '0.72rem', color: 'var(--text-2)', fontWeight: 700,
        textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: '5px'
      },
      modalInput: {
        width: '100%', padding: '9px 11px', border: '1.5px solid #a8d0d3',
        borderRadius: '6px', fontFamily: 'inherit', fontSize: '0.9rem',
        background: 'white', color: 'var(--text)', boxSizing: 'border-box'
      },
      errMsg: {
        display: 'block', color: '#dc2626', fontSize: '0.72rem',
        marginTop: '3px', fontWeight: 600
      },
      container: {
        display: 'flex',
        flexDirection: 'column',
        height: '100vh',
        fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
        backgroundColor: 'var(--bg)'
      },
      header: { display: 'none' }, // remplacé par tw-topbar CSS
      headerLeft: {
        display: 'flex',
        alignItems: 'center',
        gap: '30px'
      },
      cumulBox: {
        backgroundColor: 'rgba(255,255,255,0.1)',
        padding: '12px 20px',
        borderRadius: '8px',
        borderLeft: '4px solid #00d4ff'
      },
      cumulLabel: {
        fontSize: '12px',
        color: '#b0d4ff',
        fontWeight: '500',
        marginBottom: '5px'
      },
      cumulAmount: {
        fontSize: '24px',
        fontWeight: 'bold',
        color: '#00ff88'
      },
      headerSubtitle: {
        fontSize: '13px',
        color: '#b0d4ff',
        marginTop: '5px',
        fontWeight: '500'
      },
      userInfo: {
        display: 'flex',
        gap: '15px',
        alignItems: 'center'
      },
      logoutBtn: {
        padding: '8px 15px',
        backgroundColor: '#d9534f',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px'
      },
      dashboardBtn: {
        padding: '8px 15px',
        backgroundColor: '#f0f0f0',
        color: '#333',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 'bold'
      },
      settingsBtn: {
        padding: '8px 15px',
        backgroundColor: '#fff3cd',
        color: '#333',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontSize: '14px',
        fontWeight: 'bold'
      },
      content: {
        display: 'flex',
        flex: 1,
        gap: '0',
        overflow: 'hidden',
        position: 'relative' // pour ancrage du bouton de repli LeftPanel
      },
      leftPanel: {
        width: '350px',
        backgroundColor: 'white',
        borderRight: '1px solid #ddd',
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden'
      },
      rightPanel: {
        flex: 1,
        backgroundColor: '#f9f9f9',
        overflowY: 'auto'
      },
      newBtn: {
        margin: '15px',
        padding: '12px 15px',
        backgroundColor: '#10a0dc',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px'
      },
      searchInput: {
        margin: '0 15px 15px 15px',
        padding: '10px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        width: 'calc(100% - 30px)',
        boxSizing: 'border-box'
      },
      filterContainer: {
        display: 'flex',
        flexWrap: 'wrap',
        gap: '5px',
        padding: '0 15px 15px 15px',
        borderBottom: '1px solid #eee'
      },
      filterBtn: {
        padding: '6px 12px',
        backgroundColor: '#f0f0f0',
        border: '1px solid #ddd',
        borderRadius: '20px',
        cursor: 'pointer',
        fontSize: '12px',
        transition: 'all 0.2s'
      },
      filterBtnActive: {
        backgroundColor: '#002147',
        color: 'white',
        borderColor: '#002147'
      },
      prospectsList: {
        flex: 1,
        overflowY: 'auto',
        paddingBottom: '15px'
      },
      prospectItem: {
        padding: '15px',
        borderBottom: '1px solid #eee',
        cursor: 'pointer',
        transition: 'all 0.2s',
        borderLeft: '3px solid transparent'
      },
      prospectItemActive: {
        backgroundColor: '#e8f4f8',
        borderLeftColor: '#002147'
      },
      prospectName: {
        fontWeight: 'bold',
        fontSize: '15px',
        marginBottom: '4px'
      },
      prospectSubtitle: {
        fontSize: '12px',
        color: '#666',
        marginBottom: '4px'
      },
      prospectStatus: {
        fontSize: '11px',
        fontWeight: 'bold',
        color: '#0066cc',
        marginBottom: '4px'
      },
      prospectStatusRow: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '4px'
      },
      prospectQuoteDate: {
        fontSize: '10px',
        color: '#666',
        fontStyle: 'italic'
      },
      prospectAmount: {
        fontSize: '13px',
        fontWeight: 'bold',
        color: '#002147'
      },
      prospectDetail: {
        padding: '20px'
      },
      detailHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        alignItems: 'center',
        marginBottom: '20px',
        borderBottom: '2px solid #ddd',
        paddingBottom: '15px'
      },
      detailActions: {
        display: 'flex',
        gap: '10px'
      },
      editBtn: {
        padding: '5px 12px',
        backgroundColor: '#17a2b8',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '500',
        fontFamily: "'Inter', system-ui, sans-serif",
        transition: 'opacity .15s'
      },
      deleteBtn: {
        padding: '5px 12px',
        backgroundColor: '#dc3545',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontSize: '13px',
        fontWeight: '500',
        fontFamily: "'Inter', system-ui, sans-serif",
        transition: 'opacity .15s'
      },
      detailRow: {
        display: 'flex',
        gap: '20px',
        marginBottom: '15px'
      },
      detailRowInline: {
        display: 'flex',
        gap: '80px',
        marginBottom: '15px',
        fontSize: '15px',
        flexWrap: 'nowrap'
      },
      detailItemHalf: {
        flex: 1
      },
      detailItemThird: {
        flex: 1
      },
      detailGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '15px',
        marginBottom: '20px'
      },
      detailItem: {
        backgroundColor: 'white',
        padding: '12px',
        borderRadius: '4px',
        borderLeft: '3px solid #002147'
      },
      amountsGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(4, 1fr)',
        gap: '12px',
        marginBottom: '20px'
      },
      amountItem: {
        backgroundColor: 'white',
        padding: '12px',
        borderRadius: '4px',
        textAlign: 'center',
        borderTop: '3px solid #28a745'
      },
      amountLabelSetup: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '14px',
        color: '#000000'
      },
      amountLabelAbonnement: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '14px',
        color: '#10a0dc'
      },
      amountLabelFormation: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '14px',
        color: '#ff9500'
      },
      amountLabelAnnual: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '14px',
        color: '#28a745'
      },
      amountValue: {
        fontSize: '16px',
        fontWeight: 'bold',
        color: '#002147'
      },
      summaryBox: {
        backgroundColor: '#e8f4f8',
        padding: '15px',
        borderRadius: '4px',
        marginBottom: '20px',
        display: 'flex',
        gap: '20px',
        borderLeft: '4px solid #002147'
      },
      otherDetails: {
        backgroundColor: 'white',
        padding: '15px',
        borderRadius: '4px',
        display: 'grid',
        gridTemplateColumns: '1fr',
        gap: '10px',
        fontSize: '13px',
        marginBottom: '20px'
      },
      activitiesSection: {
        padding: '20px',
        backgroundColor: 'white',
        borderTop: '1px solid #ddd'
      },
      statusHistoryBox: {
        backgroundColor: '#f9f9f9',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '15px',
        border: '1px solid #eee'
      },
      nextActionsListBox: {
        backgroundColor: '#f9f9f9',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '15px',
        border: '1px solid #eee'
      },
      nextActionItem: {
        padding: '10px',
        marginBottom: '8px',
        backgroundColor: 'white',
        borderRadius: '4px',
        border: '1px solid #ddd'
      },
      historyItem: {
        padding: '8px',
        marginBottom: '8px',
        backgroundColor: 'white',
        borderRadius: '4px',
        fontSize: '13px',
        border: '1px solid #ddd'
      },
      activityForm: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px',
        marginBottom: '20px'
      },
      activityRow: {
        display: 'flex',
        gap: '10px'
      },
      activitySelect: {
        padding: '10px 12px',
        border: '1px solid #d0d0d0',
        borderRadius: '6px',
        fontSize: '13px',
        fontFamily: 'inherit',
        backgroundColor: 'white',
        cursor: 'pointer',
        transition: 'border-color 0.2s',
        maxWidth: '200px',
        flex: '1'
      },
      activityInput: {
        padding: '11px 12px',
        border: '1px solid #d0d0d0',
        borderRadius: '6px',
        minHeight: '80px',
        fontFamily: 'inherit',
        fontSize: '13px',
        lineHeight: '1.5',
        resize: 'none',
        transition: 'border-color 0.2s',
        maxWidth: '600px'
      },
      activityBtn: {
        padding: '11px 16px',
        backgroundColor: '#10a0dc',
        color: 'white',
        border: 'none',
        borderRadius: '6px',
        cursor: 'pointer',
        fontWeight: '600',
        fontSize: '13px',
        transition: 'background-color 0.2s, box-shadow 0.2s',
        boxShadow: '0 2px 4px rgba(0,0,0,0.1)'
      },
      activitiesList: {
        display: 'flex',
        flexDirection: 'column',
        gap: '10px'
      },
      activityItem: {
        backgroundColor: '#f5f5f5',
        padding: '12px',
        borderRadius: '4px',
        borderLeft: '3px solid #0066cc'
      },
      activityHeader: {
        display: 'flex',
        justifyContent: 'space-between',
        marginBottom: '5px',
        fontSize: '12px'
      },
      activityType: {
        fontWeight: 'bold',
        color: '#0066cc'
      },
      activityDate: {
        color: '#999',
        fontSize: '11px'
      },
      activityDesc: {
        fontSize: '13px',
        marginBottom: '5px',
        lineHeight: '1.4'
      },
      activityBy: {
        fontSize: '11px',
        color: '#999',
        fontStyle: 'italic'
      },
      formContainer: {
        padding: '20px',
        margin: '0 auto'
      },
      oldStatusBox: {
        backgroundColor: '#f5f5f5',
        padding: '12px',
        borderRadius: '6px',
        marginBottom: '15px',
        border: '1px solid #ddd'
      },
      oldStatusLabel: {
        fontSize: '12px',
        fontWeight: 'bold',
        color: '#666',
        marginBottom: '5px'
      },
      oldStatusValue: {
        fontSize: '14px',
        color: '#333',
        fontWeight: 'bold'
      },
      oldStatusNotes: {
        fontSize: '13px',
        color: '#555',
        lineHeight: '1.5',
        padding: '8px',
        backgroundColor: 'white',
        borderRadius: '4px',
        borderLeft: '3px solid #ddd'
      },
      formSection: {
        marginBottom: '25px'
      },
      labelMontant: {
        display: 'block',
        fontWeight: '600',
        marginBottom: '8px',
        fontSize: '13px',
        color: '#2c3e50',
        letterSpacing: '0.3px'
      },
      labelSetup: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '13px',
        color: '#000000',
        letterSpacing: '0.3px'
      },
      labelAbonnement: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '13px',
        color: '#10a0dc',
        letterSpacing: '0.3px'
      },
      labelFormation: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '13px',
        color: '#ff9500',
        letterSpacing: '0.3px'
      },
      labelAnnual: {
        display: 'block',
        fontWeight: 'bold',
        marginBottom: '8px',
        fontSize: '13px',
        color: '#28a745',
        letterSpacing: '0.3px'
      },
      montantsContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(3, 1fr)',
        gap: '12px',
        marginBottom: '15px',
        maxWidth: '600px'
      },
      montantsWithChanceContainer: {
        display: 'grid',
        gridTemplateColumns: 'repeat(5, 1fr)',
        gap: '12px',
        marginBottom: '15px',
        maxWidth: '1100px'
      },
      montantItem: {
        display: 'flex',
        flexDirection: 'column'
      },
      formGrid: {
        display: 'grid',
        gridTemplateColumns: 'repeat(2, 1fr)',
        gap: '12px',
        marginTop: '10px'
      },
      formInput: {
        padding: '11px 12px',
        border: '1px solid #d0d0d0',
        borderRadius: '6px',
        fontSize: '14px',
        fontFamily: 'inherit',
        transition: 'border-color 0.2s, box-shadow 0.2s',
        maxWidth: '280px'
      },
      totalCalc: {
        marginTop: '15px',
        padding: '10px',
        backgroundColor: '#e8f4f8',
        borderLeft: '4px solid #002147',
        fontSize: '14px'
      },
      formActions: {
        display: 'flex',
        gap: '10px',
        marginTop: '20px'
      },
      saveBtn: {
        flex: 1,
        padding: '12px',
        backgroundColor: '#10a0dc',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px'
      },
      cancelBtn: {
        flex: 1,
        padding: '12px',
        backgroundColor: '#6c757d',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px'
      },
      loginContainer: {
        display: 'flex',
        justifyContent: 'center',
        alignItems: 'center',
        height: '100vh',
        backgroundColor: '#f5f5f5'
      },
      loginBox: {
        backgroundColor: 'white',
        padding: '40px',
        borderRadius: '8px',
        boxShadow: '0 2px 10px rgba(0,0,0,0.1)',
        width: '100%',
        maxWidth: '400px'
      },
      form: {
        display: 'flex',
        flexDirection: 'column',
        gap: '12px',
        marginTop: '20px'
      },
      input: {
        padding: '10px',
        border: '1px solid #ddd',
        borderRadius: '4px',
        fontSize: '14px'
      },
      submitBtn: {
        padding: '12px',
        backgroundColor: '#002147',
        color: 'white',
        border: 'none',
        borderRadius: '4px',
        cursor: 'pointer',
        fontWeight: 'bold',
        fontSize: '14px'
      },
      toggleAuth: {
        marginTop: '15px',
        textAlign: 'center',
        fontSize: '13px',
        color: '#666'
      },
      link: {
        color: '#0066cc',
        cursor: 'pointer',
        textDecoration: 'none'
      },
      emptyState: {
        textAlign: 'center',
        color: '#999',
        padding: '40px',
        fontSize: '14px'
      }
    };
