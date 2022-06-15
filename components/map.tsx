import L from "leaflet";
import "leaflet-draw";
L.Icon.Default.imagePath = "/leaflet/images/";
import { useEffect, useRef } from "react";

const center = [51.505, -0.09] as L.LatLngExpression;
const zoom = 13;

const Map = () => {
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

    const editableLayers = new L.FeatureGroup();
    mapRef.current.addLayer(editableLayers);

    const MyCustomMarker = L.Icon.extend({
      options: {
        shadowUrl: null,
        iconAnchor: new L.Point(12, 12),
        iconSize: new L.Point(24, 24),
        iconUrl: "link/to/image.png",
      },
    });

    const options: L.Control.DrawConstructorOptions = {
      position: "topright" as L.ControlPosition,
      draw: {
        polyline: {
          shapeOptions: {
            color: "#f357a1",
            weight: 10,
          },
        },
        polygon: {
          allowIntersection: false, // Restricts shapes to simple polygons
          drawError: {
            color: "#e1e100", // Color the shape will turn when intersects
            message: "<strong>Oh snap!<strong> you can't draw that!", // Message that will show when intersect
          },
          shapeOptions: {
            color: "#bada55",
          },
        },
        circle: false, // Turns off this drawing tool
        rectangle: {},
        marker: {
          icon: new MyCustomMarker(),
        },
      },
      edit: {
        featureGroup: editableLayers, //REQUIRED!!
        remove: false,
      },
    };

    const drawControl = new L.Control.Draw(options);
    mapRef.current.addControl(drawControl);

    mapRef.current.on(L.Draw.Event.CREATED, function (e) {
      var type = e.layerType,
        layer = e.layer;

      if (type === "marker") {
        layer.bindPopup("A popup!");
      }

      editableLayers.addLayer(layer);
    });

    return () => {
      mapRef.current.off();
      mapRef.current.remove();
    };

    // setMap(localMap);
  }, []);

  return (
    <>
      <div id="map" style={{ width: "100%", height: "100vh" }}></div>
    </>
  );
};

export default Map;
