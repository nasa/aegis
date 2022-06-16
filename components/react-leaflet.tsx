import { MapContainer, TileLayer, Marker, Popup, useMapEvents } from "react-leaflet";
import L from "leaflet";
import "leaflet-draw";
L.Icon.Default.imagePath = "/leaflet/images/";
import { useMemo, useState, useCallback, useEffect } from "react";

const center = [64.833445, -16.378351] as L.LatLngExpression;
const zoom = 13;

function DisplayPosition({ map }) {
  const [position, setPosition] = useState(() => map.getCenter());

  const resetClick = useCallback(() => {
    map.setView(center, zoom);
  }, [map]);

  const onMove = useCallback(() => {
    setPosition(map.getCenter());
  }, [map]);

  useEffect(() => {
    map.on("move", onMove);
    return () => {
      map.off("move", onMove);
    };
  }, [map, onMove]);

  return (
    <p>
      latitude: {position.lat.toFixed(12)}, longitude: {position.lng.toFixed(12)}{" "}
      <button onClick={resetClick}>reset</button>
    </p>
  );
}

function LocationMarker() {
  const [position, setPosition] = useState<L.LatLngExpression>([51.505, -0.09]);

  const map = useMapEvents({
    click() {
      map.locate();
    },
    locationfound(e) {
      console.log(JSON.stringify(e.latlng));
      setPosition(e.latlng);
      map.flyTo(e.latlng, map.getZoom());
    },
  });
  return position === null ? null : (
    <Marker position={position}>
      <Popup>You are here</Popup>
    </Marker>
  );
}

export default function Map() {
  const [map, setMap] = useState(null);

  const displayMap = useMemo(
    () => (
      <>
        <MapContainer
          center={center}
          zoom={zoom}
          scrollWheelZoom={true}
          style={{ width: "100%", height: "100vh" }}
          ref={setMap}
        >
          <TileLayer url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png" />
          <LocationMarker />
        </MapContainer>
      </>
    ),
    []
  );

  return (
    <div>
      {map ? <DisplayPosition map={map} /> : null}
      {displayMap}
    </div>
  );
}
