import {
  uniqueNamesGenerator,
  adjectives,
  animals,
  colors,
  countries,
  names,
  starWars,
} from "unique-names-generator";
import starTrek from "./star-trek";
import lotr from "./lotr";
const profanityFilter = require("leo-profanity");

type DictName =
  | "adjectives"
  | "animals"
  | "colors"
  | "countries"
  | "names"
  | "starWars"
  | "starTrek"
  | "lotr";

export function generateUniqueName({
  dictName,
  existingNames,
}: {
  dictName: DictName;
  existingNames: string[];
}): string {
  let randomName = "";
  while (randomName === "") {
    let dict = null;
    switch (dictName) {
      case "adjectives":
        dict = adjectives;
        break;
      case "animals":
        dict = animals;
        break;
      case "colors":
        dict = colors;
        break;
      case "countries":
        dict = countries;
        break;
      case "names":
        dict = names;
        break;
      case "starWars":
        dict = starWars;
        break;
      case "starTrek":
        dict = starTrek;
        break;
      case "lotr":
        dict = lotr;
        break;
      default:
        break;
    }

    const name = uniqueNamesGenerator({
      dictionaries: [dict],
      style: "capital",
    });
    const profanityCheck = profanityFilter.check(name);
    randomName = existingNames.includes(name) || profanityCheck ? "" : name;
  }
  return randomName;
}
