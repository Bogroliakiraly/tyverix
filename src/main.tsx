import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { I18nProvider } from "./i18n";
import { useLicense } from "./store/useLicense";
import { useAuth } from "./store/useAuth";

function Root() {
  const refresh = useLicense((s) => s.refresh);
  const initAuth = useAuth((s) => s.init);
  useEffect(() => {
    refresh();
    initAuth();
  }, [refresh, initAuth]);
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </React.StrictMode>,
);
