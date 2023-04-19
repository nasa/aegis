const getPercentOrDefault = (value: number | undefined): number => {
  return typeof value === "number" ? Math.round(value * 100) : 100;
};

export default getPercentOrDefault;
