import * as React from 'react';

    // ==================== SYSTÈME DE TOAST ====================
    // Notifications non-bloquantes (succès, erreur, warning, info)
    // Usage : showToast('Devis sauvegardé', 'success') ou showToast({title:'...', message:'...', type:'success', duration:3000})
    // Remplace les alert() par défaut. Pour les cas critiques avec redirect, garder alert() classique.
    const ToastContext = React.createContext(null);

export function ToastProvider({ children }) {
      const [toasts, setToasts] = React.useState([]);

      const removeToast = React.useCallback((id) => {
        setToasts(prev => prev.map(t => t.id === id ? {...t, leaving: true} : t));
        setTimeout(() => {
          setToasts(prev => prev.filter(t => t.id !== id));
        }, 200); // durée de l'animation de sortie
      }, []);

      const addToast = React.useCallback((opts) => {
        const id = Date.now() + Math.random();
        const toast = typeof opts === 'string'
          ? { id, title: opts, type: 'info', duration: 3500 }
          : { id, title: opts.title || '', message: opts.message || '', type: opts.type || 'info', duration: opts.duration ?? 3500 };
        setToasts(prev => [...prev, toast]);
        if (toast.duration > 0) {
          setTimeout(() => removeToast(id), toast.duration);
        }
        return id;
      }, [removeToast]);

      // Exposer la fonction globalement pour pouvoir l'appeler depuis n'importe où
      React.useEffect(() => {
        window.showToast = (opts, type, duration) => {
          if (typeof opts === 'string') {
            return addToast({ title: opts, type: type || 'info', duration: duration ?? 3500 });
          }
          return addToast(opts);
        };
      }, [addToast]);

      return (
        <ToastContext.Provider value={{ addToast, removeToast }}>
          {children}
          <ToastContainer toasts={toasts} onClose={removeToast} />
        </ToastContext.Provider>
      );
    }

    function ToastContainer({ toasts, onClose }) {
      if (toasts.length === 0) return null;
      return (
        <div className="tw-toast-container">
          {toasts.map(t => <Toast key={t.id} toast={t} onClose={() => onClose(t.id)} />)}
        </div>
      );
    }

    function Toast({ toast, onClose }) {
      const { type, title, message, leaving } = toast;
      const iconPaths = {
        success: <path d="M20 6L9 17l-5-5"/>,
        error:   <React.Fragment><circle cx="12" cy="12" r="10"/><path d="M12 8v4M12 16h.01"/></React.Fragment>,
        warning: <React.Fragment><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><path d="M12 9v4M12 17h.01"/></React.Fragment>,
        info:    <React.Fragment><circle cx="12" cy="12" r="10"/><path d="M12 16v-4M12 8h.01"/></React.Fragment>,
      };
      return (
        <div className={`tw-toast tw-toast-${type} ${leaving ? 'tw-toast-leaving' : ''}`}>
          <svg className="tw-toast-icon" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            {iconPaths[type] || iconPaths.info}
          </svg>
          <div className="tw-toast-content">
            <p className="tw-toast-title">{title}</p>
            {message && <p className="tw-toast-msg">{message}</p>}
          </div>
          <button className="tw-toast-close" onClick={onClose} aria-label="Fermer">
            <svg width="12" height="12" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M18 6L6 18M6 6l12 12"/></svg>
          </button>
        </div>
      );
    }

    // Fallback temporaire : si window.showToast n'est pas encore prêt (chargement initial),
    // utilise console.warn en dernier recours
    if (typeof window.showToast === 'undefined') {
      window.showToast = (msg) => console.warn('[Toast non prêt]', msg);
    }
