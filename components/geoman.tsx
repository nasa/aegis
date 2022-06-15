import L from "leaflet";
import "@geoman-io/leaflet-geoman-free";
import "@geoman-io/leaflet-geoman-free/dist/leaflet-geoman.css";

L.Icon.Default.imagePath = "/leaflet/images/";
import { useEffect, useRef } from "react";

const center = [51.505, -0.09] as L.LatLngExpression;
const zoom = 13;

const Geoman = () => {
  const mapRef = useRef(null);
  useEffect(() => {
    mapRef.current = L.map("map", {
      center: center,
      zoom: zoom,
      layers: [
        L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", {
          attribution: "",
        }),
      ],
    });

    mapRef.current.pm.addControls({
      drawMarker: true,
    });

    mapRef.current.on("pm:create", (e) => {
      if (e.layer && e.layer.pm) {
        const shape = e;
        console.log(e);

        // enable editing of circle
        shape.layer.pm.enable();

        console.log(`object created: ${shape.layer.pm.getShape()}`);
        // console.log(mapRef.current.pm.getGeomanLayers(true).toGeoJSON());
        mapRef.current.pm.getGeomanLayers(true).bindPopup("i am whole").openPopup();
        mapRef.current.pm
          .getGeomanLayers()
          .map((layer, index) => layer.bindPopup(`I am figure N° ${index}`));
        shape.layer.on("pm:edit", () => {
          console.log(mapRef.current.pm.getGeomanLayers(true).toGeoJSON());
        });
      }
    });

    mapRef.current.on("pm:remove", () => {
      console.log("object removed");
      // console.log(mapRef.current.pm.getGeomanLayers(true).toGeoJSON());
    });

    return () => {
      mapRef.current.pm.removeControls();
      mapRef.current.pm.setGlobalOptions({ pmIgnore: true });
      mapRef.current.off();
      mapRef.current.remove();
    };
  }, []);

  return (
    <>
      <div id="map" style={{ width: "100%", height: "100vh" }}></div>
    </>
  );
};

export default Geoman;
