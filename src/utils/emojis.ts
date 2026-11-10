/** Image-backed emoji shared by the picker previews and map markers. */
export function getCustomEmoji(iconValue: string): { src: string; alt: string } | undefined {
  switch (iconValue) {
    case "station":
      return { src: "/images/station.svg", alt: "Station" };
    case "landerIcon":
      return { src: "/images/lander.svg", alt: "Lander" };
    default:
      return undefined;
  }
}
