import type { Page } from "@playwright/test";
import { expect } from "@playwright/test";
import {
  goToV2MissionSection,
  toggleEditMode,
  editValidatedField,
  cancelValidatedFieldEdit,
  displayField,
} from "./missionTestHelpers";

/**
 * Find the index of an action definition item by name within a specific section.
 * The section is identified by the capitalize(type) prefix in the aria-label.
 */
async function findActionDefIndexExactName(
  page: Page,
  type: string,
  name: string
): Promise<number> {
  const ariaLabel = `${type} name`;
  const count = await displayField(page, ariaLabel).count();
  for (let i = 0; i < count; i++) {
    const text = await displayField(page, ariaLabel, i).textContent();
    if (text === name) return i;
  }
  return -1;
}

/**
 * Test action definitions (create, update, delete). Only available on actionSystemVersion 2 missions.
 * If the panel is not available, the test will skip with a console message.
 */
export async function actionDefinitionsTest(page: Page): Promise<string> {
  const suffix = Math.floor(Math.random() * 1_000_000).toString(36);
  await goToV2MissionSection(page);

  // Check if actionDefinitions_panel exists (only on v2 missions)
  const panelButton = page.getByLabel("actionDefinitions_panel", { exact: true });
  const panelExists = (await panelButton.count()) > 0;
  if (!panelExists) {
    console.log("actionDefinitions_panel not found. Skipping test.");
    return "skipped";
  }

  await panelButton.click();
  await expect(page.getByLabel("rightBodyTitle", { exact: true })).toContainText(
    "STM Action Definitions"
  );

  // Turn on edit mode
  await toggleEditMode(page);

  // Test the Verbs section
  // Count items per section via display fields per type.
  const startingVerbItems = await displayField(page, "Verbs name").count();
  const startingNounItems = await displayField(page, "Nouns name").count();
  const startingAdjectiveItems = await displayField(page, "Adjectives name").count();

  // Create a new verb
  await page.getByLabel("addGeoUnitButton", { exact: true }).nth(0).click();
  await page.waitForTimeout(500);

  // Find the default-named verb
  const defaultIndex = await findActionDefIndexExactName(page, "Verbs", "(Verb Name)");
  expect(defaultIndex).not.toEqual(-1);
  await editValidatedField(page, "Verbs name", `--TEST VERB ONE ${suffix}--`, defaultIndex);
  let verbIndex = await findActionDefIndexExactName(page, "Verbs", `--TEST VERB ONE ${suffix}--`);
  await editValidatedField(page, "Verbs abbreviation", "TV1", verbIndex);

  // Verify verb was created
  verbIndex = await findActionDefIndexExactName(page, "Verbs", `--TEST VERB ONE ${suffix}--`);
  expect(verbIndex).not.toEqual(-1);
  await expect(displayField(page, "Verbs abbreviation", verbIndex)).toContainText("TV1");

  // Create a new noun (second add button)
  await page.getByLabel("addGeoUnitButton", { exact: true }).nth(1).click();
  await page.waitForTimeout(500);

  const nounDefaultIndex = await findActionDefIndexExactName(page, "Nouns", "(Noun Name)");
  expect(nounDefaultIndex).not.toEqual(-1);
  await editValidatedField(page, "Nouns name", `--TEST NOUN ONE ${suffix}--`, nounDefaultIndex);
  let nounIndex = await findActionDefIndexExactName(page, "Nouns", `--TEST NOUN ONE ${suffix}--`);
  await editValidatedField(page, "Nouns abbreviation", "TN1", nounIndex);

  // Verify noun was created
  nounIndex = await findActionDefIndexExactName(page, "Nouns", `--TEST NOUN ONE ${suffix}--`);
  expect(nounIndex).not.toEqual(-1);
  await expect(displayField(page, "Nouns abbreviation", nounIndex)).toContainText("TN1");

  // Create a new adjective (third add button)
  await page.getByLabel("addGeoUnitButton", { exact: true }).nth(2).click();
  await page.waitForTimeout(500);

  const adjDefaultIndex = await findActionDefIndexExactName(page, "Adjectives", "(Adjective Name)");
  expect(adjDefaultIndex).not.toEqual(-1);
  await editValidatedField(
    page,
    "Adjectives name",
    `--TEST ADJECTIVE ONE ${suffix}--`,
    adjDefaultIndex
  );
  let adjIndex = await findActionDefIndexExactName(
    page,
    "Adjectives",
    `--TEST ADJECTIVE ONE ${suffix}--`
  );
  await editValidatedField(page, "Adjectives abbreviation", "TA1", adjIndex);

  // Verify adjective was created
  adjIndex = await findActionDefIndexExactName(
    page,
    "Adjectives",
    `--TEST ADJECTIVE ONE ${suffix}--`
  );
  expect(adjIndex).not.toEqual(-1);
  await expect(displayField(page, "Adjectives abbreviation", adjIndex)).toContainText("TA1");

  // Edit the verb
  verbIndex = await findActionDefIndexExactName(page, "Verbs", `--TEST VERB ONE ${suffix}--`);
  await editValidatedField(page, "Verbs name", `--TEST VERB ONE B ${suffix}--`, verbIndex);
  verbIndex = await findActionDefIndexExactName(page, "Verbs", `--TEST VERB ONE B ${suffix}--`);
  expect(verbIndex).not.toEqual(-1);

  // Edit the adjective
  adjIndex = await findActionDefIndexExactName(
    page,
    "Adjectives",
    `--TEST ADJECTIVE ONE ${suffix}--`
  );
  await editValidatedField(page, "Adjectives name", `--TEST ADJECTIVE ONE B ${suffix}--`, adjIndex);
  adjIndex = await findActionDefIndexExactName(
    page,
    "Adjectives",
    `--TEST ADJECTIVE ONE B ${suffix}--`
  );
  expect(adjIndex).not.toEqual(-1);

  // Test cancel on field edit
  nounIndex = await findActionDefIndexExactName(page, "Nouns", `--TEST NOUN ONE ${suffix}--`);
  await cancelValidatedFieldEdit(page, "Nouns name", "--SHOULD NOT SAVE--", nounIndex);

  // Delete the test verb
  // deleteButton is shared across all sections. We need to count buttons
  // in the verbs section specifically. Since items are rendered sequentially
  // (verbs first, then nouns, then adjectives), verb delete buttons come first.
  verbIndex = await findActionDefIndexExactName(page, "Verbs", `--TEST VERB ONE B ${suffix}--`);
  await page.getByLabel("deleteButton", { exact: true }).nth(verbIndex).click();
  await page.waitForTimeout(500);

  // Verify verb count restored
  await expect(displayField(page, "Verbs name")).toHaveCount(startingVerbItems);

  // Delete the test noun
  // After verb deletion, noun deleteButtons shifted. Noun delete buttons start
  // after all verb delete buttons.
  nounIndex = await findActionDefIndexExactName(page, "Nouns", `--TEST NOUN ONE ${suffix}--`);
  // The deleteButton index for nouns = startingVerbItems (remaining verbs) + nounIndex
  const nounDeleteIndex = startingVerbItems + nounIndex;
  await page.getByLabel("deleteButton", { exact: true }).nth(nounDeleteIndex).click();
  await page.waitForTimeout(500);

  // Verify noun count restored
  await expect(displayField(page, "Nouns name")).toHaveCount(startingNounItems);

  // Delete the test adjective
  // After verb and noun deletions, adjective deleteButtons start after all verb + noun buttons.
  adjIndex = await findActionDefIndexExactName(
    page,
    "Adjectives",
    `--TEST ADJECTIVE ONE B ${suffix}--`
  );
  // The deleteButton index for adjectives = startingVerbItems (remaining verbs) + startingNounItems (remaining nouns) + adjIndex
  const adjDeleteIndex = startingVerbItems + startingNounItems + adjIndex;
  await page.getByLabel("deleteButton", { exact: true }).nth(adjDeleteIndex).click();
  await page.waitForTimeout(500);

  // Verify adjective count restored
  await expect(displayField(page, "Adjectives name")).toHaveCount(startingAdjectiveItems);

  // Turn off edit mode
  await toggleEditMode(page);

  return "success";
}
