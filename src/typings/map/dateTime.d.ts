type MapDateTimeWithSource = {
  datetime: string | null;
  sourceLabel: string | null;
  source: "preset-preview" | "timeline-hover" | "eva" | "layer" | null;
  warning: string | null;
  evaWarning: string | null;
};
