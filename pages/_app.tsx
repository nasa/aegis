import "../styles/globals.css";
import "leaflet/dist/leaflet.css";
import "../styles/leaflet-blend.css";
import "../styles/fonts.css";
import { wrapper } from "../store";

import type { AppProps } from "next/app";

// The following import prevents a Font Awesome icon server-side rendering bug,
// where the icons flash from a very large icon down to a properly sized one:
import "@fortawesome/fontawesome-svg-core/styles.css";
import { config } from "@fortawesome/fontawesome-svg-core";
import { Provider } from "react-redux";

function App({ Component, ...rest }: AppProps): JSX.Element {
  const { store, props } = wrapper.useWrappedStore(rest);
  const { pageProps } = props;
  config.autoAddCss = false; // Tell Font Awesome to skip adding the CSS automatically since we did it manually above.
  return (
    <Provider store={store}>
      <title>AEGIS</title>
      <Component {...pageProps} />
    </Provider>
  );
}

export default App;
