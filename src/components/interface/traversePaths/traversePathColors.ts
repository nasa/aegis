const OPTION_COLORS = ["#ff9f1c", "#e056fd", "#2ed573", "#ff4757", "#1e90ff"];

/** Color for the Nth path option of a traverse, shared by the map and the pane. */
export function traversePathOptionColor(index: number): string {
  return OPTION_COLORS[index % OPTION_COLORS.length];
}
