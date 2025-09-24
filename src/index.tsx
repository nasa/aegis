import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";
import store from "./store";
import { Provider } from "react-redux";
import ErrorBoundary from "./components/ErrorBoundary";

import "./styles/globals.css";
import "leaflet/dist/leaflet.css";
import "./styles/leaflet-blend.css";
import "./styles/fonts.css";
import { CookiesProvider } from "react-cookie";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <ErrorBoundary>
      <Provider store={store}>
        <CookiesProvider>
          <BrowserRouter>
            <App />
          </BrowserRouter>
        </CookiesProvider>
      </Provider>
    </ErrorBoundary>
  </React.StrictMode>
);
