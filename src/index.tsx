import React from "react";
import { createRoot } from "react-dom/client";
import App from "./App";
import { BrowserRouter } from "react-router";
import store from "./store";
import { Provider } from "react-redux";

import "./styles/globals.css";
import "leaflet/dist/leaflet.css";
import "./styles/leaflet-blend.css";
import "./styles/fonts.css";

const root = createRoot(document.getElementById("root"));
root.render(
  <React.StrictMode>
    <Provider store={store}>
      <BrowserRouter>
        <App />
      </BrowserRouter>
    </Provider>
  </React.StrictMode>
);
