import { getCustomEmoji } from "utils/emojis";

describe("getCustomEmoji", () => {
  it("should return the correct custom emoji path and alt text", () => {
    expect(getCustomEmoji("station")).toEqual({
      src: "/images/station.svg",
      alt: "Station",
    });
    expect(getCustomEmoji("landerIcon")).toEqual({
      src: "/images/lander.svg",
      alt: "Lander",
    });
    expect(getCustomEmoji("astronaut")).toEqual({
      src: "/images/astronaut_outline.svg",
      alt: "Astronaut",
    });
  });

  it("should return undefined for invalid input", () => {
    expect(getCustomEmoji("not-an-emoji")).toEqual(undefined);
  });
});
