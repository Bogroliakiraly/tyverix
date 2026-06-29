import React, { useEffect } from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./styles.css";
import { I18nProvider } from "./i18n";
import { useLicense } from "./store/useLicense";

function Root() {
  const refresh = useLicense((s) => s.refresh);
  useEffect(() => {
    refresh();
  }, [refresh]);
  return <App />;
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <I18nProvider>
      <Root />
    </I18nProvider>
  </React.StrictMode>,
);
